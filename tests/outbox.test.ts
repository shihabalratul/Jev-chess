import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DurableOutbox, type OutboxStore, type PendingEvent } from '../apps/extension/src/logging/outbox';
class Store implements OutboxStore {
    rows=new Map<string,PendingEvent>();
    async put(row:PendingEvent){this.rows.set(row.event.id,row);}
    async list(){return [...this.rows.values()];}
    async remove(ids:string[]){ids.forEach(id=>this.rows.delete(id));}
}
it('retains evidence offline, resumes after recreation, and removes only acknowledged IDs',async()=>{
    const store=new Store(),sessionId=randomUUID();
    const row:PendingEvent={backendUrl:'http://localhost:3001',event:{id:randomUUID(),sessionId,sequence:0,timestamp:new Date().toISOString(),elapsedMs:0,source:'content',event:'execution.intent',data:{uci:'a7a8n'}}};
    const first=new DurableOutbox(store,async()=>{throw new Error('offline');});
    await first.enqueue(row);await expect(first.flush()).rejects.toThrow('offline');expect(store.rows.size).toBe(1);
    const restarted=new DurableOutbox(store,async(_url,events)=>({acknowledged:events.map(e=>e.id),logRoot:'/tmp/logs'}));
    await restarted.flush();expect(store.rows.size).toBe(0);expect(restarted.status.delivery).toBe('saved');
});
it('does not acknowledge failed local persistence or discard an unacknowledged event',async()=>{
    const store=new Store(),sessionId=randomUUID();
    const event={id:randomUUID(),sessionId,sequence:1,timestamp:new Date().toISOString(),elapsedMs:0,source:'content' as const,event:'execution.outcome',data:{verified:false}};
    const box=new DurableOutbox(store,async()=>({acknowledged:[]}));
    await box.enqueue({backendUrl:'http://localhost:3001',event});
    await expect(box.flush()).rejects.toThrow(/acknowledge/i);expect(store.rows.size).toBe(1);
    store.put=async()=>{throw new Error('quota');};
    await expect(box.enqueue({backendUrl:'http://localhost:3001',event})).rejects.toThrow('quota');
});
it('bounds events by UTF-8 bytes rather than JavaScript character count',async()=>{
    const store=new Store(),sessionId=randomUUID(),box=new DurableOutbox(store,async()=>({acknowledged:[]}));
    const event={id:randomUUID(),sessionId,sequence:1,timestamp:new Date().toISOString(),elapsedMs:0,source:'content' as const,event:'evidence.large',data:'♞'.repeat(1500000)};
    await expect(box.enqueue({backendUrl:'http://localhost:3001',event})).rejects.toThrow(/limit/i);expect(store.rows.size).toBe(0);
});
it('delivers current backend events even while a previous backend remains unavailable',async()=>{
    const store=new Store(),sessionId=randomUUID();
    const box=new DurableOutbox(store,async(url,events)=>{if(url.endsWith('3001'))throw new Error('previous backend unavailable');return {acknowledged:events.map(e=>e.id),logRoot:'/current/logs'};});
    for(const port of [3001,3002])await box.enqueue({backendUrl:`http://localhost:${port}`,event:{id:randomUUID(),sessionId,sequence:port,timestamp:new Date().toISOString(),elapsedMs:0,source:'content',event:'execution.intent',data:{uci:'e2e4'}}});
    await expect(box.flush()).rejects.toThrow(/previous backend/);
    expect([...store.rows.values()].map(r=>r.backendUrl)).toEqual(['http://localhost:3001']);
});
