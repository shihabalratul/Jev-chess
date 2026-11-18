import { logEventSchema, type LogEvent } from '../../../../packages/shared/src';
import { redact } from '../../../../packages/shared/src/redaction';
export interface PendingEvent {event:LogEvent;backendUrl:string;}
export interface OutboxStore {put(row:PendingEvent):Promise<void>;list():Promise<PendingEvent[]>;remove(ids:string[]):Promise<void>;}
export class IndexedDbStore implements OutboxStore {
    private database?:Promise<IDBDatabase>;
    private db(){return this.database??=new Promise<IDBDatabase>((resolve,reject)=>{
        const request=indexedDB.open('jev-diagnostics',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('events',{keyPath:'event.id'});
        request.onsuccess=()=>{const db=request.result;db.onclose=()=>{this.database=undefined;};db.onversionchange=()=>{db.close();this.database=undefined;};resolve(db);};request.onerror=()=>{this.database=undefined;reject(request.error);};
    });}
    private async transaction<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
        const db=await this.db();return new Promise((resolve,reject)=>{
            const tx=db.transaction('events',mode,mode==='readwrite'?{durability:'strict'}:undefined),request=action(tx.objectStore('events'));
            tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error??request.error);tx.onabort=()=>reject(tx.error??new Error('Log transaction aborted'));
        });
    }
    async put(row:PendingEvent){await this.transaction('readwrite',store=>store.put(row));}
    async list(){return this.transaction<PendingEvent[]>('readonly',store=>store.getAll());}
    async remove(ids:string[]){const db=await this.db();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('events','readwrite',{durability:'strict'});for(const id of ids)tx.objectStore('events').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
}
const serializedBytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length;
export class DurableOutbox {
    status:{delivery:'pending'|'saved'|'offline';logRoot?:string;error?:string}={delivery:'pending'};
    private active?:Promise<void>;
    constructor(private store:OutboxStore,private send:(url:string,events:LogEvent[])=>Promise<{acknowledged:string[];logRoot?:string}>){ }
    async enqueue(row:PendingEvent){
        const event=logEventSchema.parse(redact(row.event));
        if(serializedBytes(event)>4200000)throw new Error('Diagnostic event exceeds durable transport limit; input paused');
        await this.store.put({...row,event});this.status.delivery='pending';
    }
    flush(){return this.active??=this.drain().finally(()=>{this.active=undefined;});}
    private async drain(){
        const pending=(await this.store.list()).sort((a,b)=>a.event.timestamp.localeCompare(b.event.timestamp)||a.event.sequence-b.event.sequence);
        let failure:unknown;
        while(pending.length){
            const first=pending.shift()!,batch=[first.event];let bytes=serializedBytes(first.event);
            while(pending.length && batch.length<50 && pending[0].backendUrl===first.backendUrl && bytes+serializedBytes(pending[0].event)<4200000){const row=pending.shift()!;batch.push(row.event);bytes+=serializedBytes(row.event);}
            try{
                const result=await this.send(first.backendUrl,batch);
                const acknowledged=result.acknowledged.filter(id=>batch.some(e=>e.id===id));
                if(acknowledged.length)await this.store.remove(acknowledged);
                if(batch.some(e=>!acknowledged.includes(e.id)))throw new Error('Backend did not acknowledge every diagnostic event');
                this.status={delivery:'saved',logRoot:result.logRoot};
            }catch(error){failure=error;}
        }
        if(failure){this.status={...this.status,delivery:'offline',error:(failure as Error).message};throw failure;}
        this.status={...this.status,delivery:(await this.store.list()).length?'pending':'saved',error:undefined};
    }
}
