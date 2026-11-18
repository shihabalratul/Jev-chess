import 'dotenv/config';
import {test,expect,chromium,type BrowserContext} from '@playwright/test';
import {cp,mkdtemp,readFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildServer} from '../../apps/server/src/app';

test('IndexedDB survives browser restart and durably delivers an offline interrupted intent',async()=>{
    test.setTimeout(60000);
    const directory=await mkdtemp(join(tmpdir(),'jev-outbox-browser-')),extension=join(directory,'extension'),logDir=join(directory,'logs');
    await cp(resolve('apps/extension/dist'),extension,{recursive:true});
    let accept=false,context:BrowserContext|undefined;
    const server=await buildServer({providerMode:'mock',logDir});
    server.addHook('onRequest',async(req,reply)=>{if(req.url==='/api/logs'&&!accept)return reply.code(503).send({error:'Explicit offline logging fixture'});});
    await server.listen({host:'127.0.0.1',port:0});const address=server.server.address();if(!address||typeof address==='string')throw new Error('Missing fixture backend');
    const launch=()=>chromium.launchPersistentContext(join(directory,'profile'),{headless:true,chromiumSandbox:true,channel:'chromium',executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    const event={id:randomUUID(),sessionId:randomUUID(),sequence:0,timestamp:new Date().toISOString(),elapsedMs:0,source:'content',event:'execution.intent',actionId:randomUUID(),data:{fixture:true,uci:'a7a8n',providerMode:'mock',note:'Intent only; fixture intentionally interrupts before input'}};
    try{
        context=await launch();const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
        await worker.evaluate(async settings=>chrome.storage.local.set({settings}),{backendUrl:`http://127.0.0.1:${address.port}`,backendToken:process.env.BACKEND_TOKEN??''});
        const control=await context.newPage();await control.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
        const local=await control.evaluate(event=>chrome.runtime.sendMessage({type:'LOG',event}),event);expect(local.ok).toBe(true);
        await expect.poll(async()=>{const response=await control.evaluate(()=>chrome.runtime.sendMessage({type:'LOG_STATUS'}));return response.data.delivery;}).toBe('offline');
        await context.close();context=undefined;accept=true;
        context=await launch();
        const path=join(logDir,event.sessionId,'events.0001.jsonl');
        await expect.poll(async()=>{try{return await readFile(path,'utf8');}catch{return ''; }},{timeout:15000}).toContain(event.id);
        const journal=await readFile(path,'utf8'),records=journal.trim().split('\n').map(line=>JSON.parse(line));
        expect(records.filter(row=>row.id===event.id)).toHaveLength(1);expect(records[0].sequence).toBe(0);expect(records[0].actionId).toBe(event.actionId);
        expect(records.some(row=>row.event==='execution.outcome')).toBe(false);
        await test.info().attach('recovered-unconfirmed-intent',{body:journal,contentType:'application/x-ndjson'});
    }finally{await context?.close();await server.close();await rm(directory,{recursive:true,force:true});}
});
