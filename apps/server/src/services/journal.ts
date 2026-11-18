import { mkdir, open, readdir, readFile, type FileHandle } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { logEventSchema, type LogEvent } from '../../../../packages/shared/src';
import { redact } from '../../../../packages/shared/src/redaction';

export class SessionJournal {
    readonly root:string;
    private queue=Promise.resolve();
    constructor(root=process.env.LOG_DIR??resolve('logs'),private secrets:string[]=[],private rotateBytes=20*1024*1024,private sync:(handle:FileHandle,kind:'artifact'|'directory'|'journal')=>Promise<void>=(handle)=>handle.sync()){this.root=resolve(root);}
    append(input:LogEvent):Promise<void>{
        const work=this.queue.then(async()=>{
            const event=logEventSchema.parse(input);
            const directory=join(this.root,event.sessionId);
            await this.ensureDirectory(directory);
            const clean=await this.artifacts(redact(event,this.secrets),directory);
            const line=JSON.stringify(clean)+'\n';
            const existing=(await readdir(directory)).filter(n=>/^events\.\d+\.jsonl$/.test(n)).sort();
            let index=existing.length?Number(existing.at(-1)!.split('.')[1]):1;
            let path=join(directory,`events.${String(index).padStart(4,'0')}.jsonl`);
            let handle=await open(path,'a+',0o600);
            try {
                const size=(await handle.stat()).size;
                if(size && size+Buffer.byteLength(line)>this.rotateBytes){
                    await handle.close();index++;path=join(directory,`events.${String(index).padStart(4,'0')}.jsonl`);handle=await open(path,'a+',0o600);
                }
                const currentSize=(await handle.stat()).size;
                if(currentSize){const last=Buffer.alloc(1);await handle.read(last,0,1,currentSize-1);if(last[0]!==10)await handle.write('\n');}
                await handle.writeFile(line);await this.sync(handle,'journal');await this.syncDirectory(directory);
            } finally {await handle.close();}
        });
        this.queue=work.catch(()=>{});
        return work;
    }
    private async ensureDirectory(path:string){
        const created=await mkdir(path,{recursive:true,mode:0o700});
        const stop=created?dirname(created):dirname(path);let current=path;
        while(true){await this.syncDirectory(current);if(current===stop||current===dirname(current))break;current=dirname(current);}
    }
    private async syncDirectory(path:string){const handle=await open(path,'r');try{await this.sync(handle,'directory');}finally{await handle.close();}}
    private async saveArtifact(path:string,bytes:Buffer,sha:string){
        let handle:FileHandle;
        try{handle=await open(path,'wx',0o600);}
        catch(error){
            if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
            if(createHash('sha256').update(await readFile(path)).digest('hex')!==sha)throw new Error('Existing diagnostic artifact is incomplete or corrupt');
            handle=await open(path,'r');
        }
        try{if((await handle.stat()).size===0)await handle.writeFile(bytes);await this.sync(handle,'artifact');}
        finally{await handle.close();}
        await this.syncDirectory(dirname(path));await this.syncDirectory(dirname(dirname(path)));
    }
    private async artifacts(value:unknown,directory:string):Promise<unknown>{
        if(typeof value==='string'){
            const image=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
            if(image){
                const bytes=Buffer.from(image[2],'base64'),sha=createHash('sha256').update(bytes).digest('hex');
                const folder=join(directory,'artifacts');await this.ensureDirectory(folder);
                const name=`${sha}.${image[1]==='jpeg'?'jpg':image[1]}`;
                await this.saveArtifact(join(folder,name),bytes,sha);
                return {artifact:`artifacts/${name}`,sha256:sha,bytes:bytes.length};
            }
            if(Buffer.byteLength(value)>32000){
                const sha=createHash('sha256').update(value).digest('hex'),folder=join(directory,'artifacts');await this.ensureDirectory(folder);
                await this.saveArtifact(join(folder,`${sha}.txt`),Buffer.from(value),sha);
                return {artifact:`artifacts/${sha}.txt`,sha256:sha,bytes:Buffer.byteLength(value)};
            }
        }
        if(Array.isArray(value)){const result:unknown[]=[];for(const item of value)result.push(await this.artifacts(item,directory));return result;}
        if(value&&typeof value==='object'){const result:Record<string,unknown>={};for(const [key,item]of Object.entries(value))result[key]=await this.artifacts(item,directory);return result;}
        return value;
    }
}
export interface AuditContext {journal:SessionJournal;sessionId:string;requestId:string;turnId?:string;sequence:number;started:number;}
export const auditContext=new AsyncLocalStorage<AuditContext>();
export async function audit(event:string,data:unknown){
    const context=auditContext.getStore();if(!context)return;
    await context.journal.append({id:randomUUID(),sessionId:context.sessionId,sequence:context.sequence++,timestamp:new Date().toISOString(),elapsedMs:performance.now()-context.started,source:'server',event,requestId:context.requestId,turnId:context.turnId,data});
}
