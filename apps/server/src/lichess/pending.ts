import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pendingMoveSchema, type PendingMove } from '../../../../packages/shared/src/lichess';
export interface PendingStore {load(account:string,game:string):Promise<PendingMove|undefined>;save(move:PendingMove):Promise<void>;clear(account:string,game:string):Promise<void>;}
/** A small durable checkpoint; immutable execution evidence remains in the session journal. */
export class DiskPendingStore implements PendingStore {
    constructor(private root:string){}
    private path(account:string,game:string){return join(this.root,'lichess-intents',createHash('sha256').update(`${account.toLowerCase()}:${game}`).digest('hex')+'.json');}
    private async syncDirectory(){const dir=await open(join(this.root,'lichess-intents'),'r');try{await dir.sync();}finally{await dir.close();}}
    async load(account:string,game:string){try{const value=pendingMoveSchema.parse(JSON.parse(await readFile(this.path(account,game),'utf8')));if(value.accountId.toLowerCase()!==account.toLowerCase()||value.gameId!==game)throw new Error('Interrupted move checkpoint identity mismatch');return value;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}}
    async save(input:PendingMove){const value=pendingMoveSchema.parse(input);await mkdir(join(this.root,'lichess-intents'),{recursive:true,mode:0o700});const path=this.path(value.accountId,value.gameId),temporary=path+'.'+randomUUID();const file=await open(temporary,'wx',0o600);try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}await rename(temporary,path);await this.syncDirectory();const parent=await open(this.root,'r');try{await parent.sync();}finally{await parent.close();}}
    async clear(account:string,game:string){try{await unlink(this.path(account,game));await this.syncDirectory();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
}
