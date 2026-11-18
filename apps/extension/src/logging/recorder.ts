import { type LogEvent } from '../../../../packages/shared/src';
import { redact } from '../../../../packages/shared/src/redaction';
export class SessionRecorder {
    readonly sessionId=crypto.randomUUID();
    private sequence=0;
    private started=performance.now();
    private pending:LogEvent[]=[];
    private delivery?:Promise<void>;
    status:Record<string,unknown>={sessionId:this.sessionId,delivery:'pending',path:`logs/${this.sessionId}/`};
    constructor(private send:(event:LogEvent)=>Promise<Record<string,unknown>>){ }
    async record(event:string,data:unknown,ids:{turnId?:string;requestId?:string;actionId?:string}={}){
        const id=crypto.randomUUID();
        this.pending.push({id,sessionId:this.sessionId,sequence:this.sequence++,timestamp:new Date().toISOString(),elapsedMs:performance.now()-this.started,source:'content',event,data:redact(data),...ids});
        do{await this.flush();}while(this.pending.some(event=>event.id===id));
    }
    flush():Promise<void>{
        return this.delivery??=this.drain().finally(()=>{this.delivery=undefined;});
    }
    private async drain(){
        try{while(this.pending.length){const response=await this.send(this.pending[0]);this.pending.shift();this.status={...this.status,...response,error:undefined};}}
        catch(error){this.status={...this.status,delivery:'failed',error:(error as Error).message};throw new Error('Diagnostic persistence failed: '+(error as Error).message);}
    }
}
