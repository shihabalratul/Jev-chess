import { it, expect } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SessionJournal } from '../apps/server/src/services/journal';
import { redact } from '../packages/shared/src/redaction';
const event = (sessionId:string, sequence:number, data:unknown) => ({id:randomUUID(),sessionId,sequence,timestamp:new Date().toISOString(),elapsedMs:sequence,source:'content' as const,event:'execution.intent',data});
it('durably appends ordered, redacted events and deduplicated screenshot artifacts across restart',async()=>{
    const root=await mkdtemp(join(tmpdir(),'jev-journal-')), session=randomUUID();
    const journal=new SessionJournal(root,['a-real-test-secret']);
    await Promise.all([journal.append(event(session,0,{apiKey:'a-real-test-secret',text:'a-real-test-secret',image:'data:image/png;base64,YQ=='})),journal.append(event(session,1,{uci:'e2e4'}))]);
    await new SessionJournal(root).append(event(session,2,{status:'unconfirmed'}));
    const text=await readFile(join(root,session,'events.0001.jsonl'),'utf8');
    expect(text).not.toContain('a-real-test-secret');
    expect(text).not.toContain('base64');
    expect(text.trim().split('\n').map(s=>JSON.parse(s).sequence)).toEqual([0,1,2]);
    expect(await readdir(join(root,session,'artifacts'))).toHaveLength(1);
});
it('rotates without deleting old files and rejects unsafe session paths or unwritable storage',async()=>{
    const root=await mkdtemp(join(tmpdir(),'jev-journal-')),session=randomUUID();
    const journal=new SessionJournal(root,[],450);
    await journal.append(event(session,0,{text:'x'.repeat(100)}));
    await journal.append(event(session,1,{text:'y'.repeat(100)}));
    expect((await readdir(join(root,session))).filter(s=>s.endsWith('.jsonl'))).toHaveLength(2);
    await expect(journal.append(event('../escape',0,{}))).rejects.toThrow();
    const file=join(root,'not-a-directory');await writeFile(file,'');
    await expect(new SessionJournal(file).append(event(session,0,{}))).rejects.toThrow();
});
it('keeps later events readable after an interrupted final JSON line without overwriting the fragment',async()=>{
    const root=await mkdtemp(join(tmpdir(),'jev-journal-')),session=randomUUID(),journal=new SessionJournal(root);
    await journal.append(event(session,0,{}));
    const path=join(root,session,'events.0001.jsonl');
    const {appendFile}=await import('node:fs/promises');await appendFile(path,'{"interrupted":');
    await new SessionJournal(root).append(event(session,1,{verified:false}));
    const lines=(await readFile(path,'utf8')).trim().split('\n');
    expect(lines).toContain('{"interrupted":');expect(JSON.parse(lines.at(-1)!).sequence).toBe(1);
});
it('redacts URL credentials and pairing headers while preserving usage counts',()=>{
    const cleaned=redact({url:'https://name:credential@example.test/?token=private-value',headers:{'X-Jev-Token':'pair-secret'},usage:{input_tokens:42}});
    expect(JSON.stringify(cleaned)).not.toContain('credential');expect(JSON.stringify(cleaned)).not.toContain('private-value');expect(JSON.stringify(cleaned)).not.toContain('pair-secret');
    expect((cleaned as any).usage.input_tokens).toBe(42);
});
it('does not acknowledge an artifact reference when artifact durability fails',async()=>{
    const root=await mkdtemp(join(tmpdir(),'jev-journal-')),session=randomUUID();
    const journal=new SessionJournal(root,[],20*1024*1024,async(handle:any,kind:string)=>{if(kind==='artifact')throw new Error('artifact fsync failed');await handle.sync();});
    await expect(journal.append(event(session,0,{image:'data:image/png;base64,YQ=='}))).rejects.toThrow('artifact fsync failed');
});
