import { test,expect,chromium } from '@playwright/test';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
import { buildServer } from '../../apps/server/src/app';
import type { LichessPort } from '../../apps/server/src/lichess/client';
test('Lichess panel connects without a board tab, plays Black and confirms API input',async()=>{
    test.setTimeout(60000);const previous=process.env.BACKEND_TOKEN;process.env.BACKEND_TOKEN='lichess-e2e-pairing';
    const dir=await mkdtemp(join(tmpdir(),'jev-lichess-'));let push:((e:unknown)=>void)|undefined;const queue:unknown[]=[];
    const state=(moves:string)=>({type:'gameState',moves,wtime:1800000,btime:1800000,winc:20000,binc:20000,status:'started'});
    let submissions=0;
    const client:LichessPort={account:async()=>({id:'jevbot',username:'JevBot',title:'BOT'}),async *events(signal){yield {type:'gameStart',game:{id:'abcdefgh'}};await new Promise<void>(r=>signal.addEventListener('abort',()=>r(),{once:true}));},async *game(_id,signal){yield {type:'gameFull',id:'abcdefgh',variant:{key:'standard'},initialFen:'startpos',white:{id:'human',name:'Human'},black:{id:'jevbot',name:'JevBot'},state:state('e2e4')};while(!signal.aborted){if(queue.length){yield queue.shift();continue;}await new Promise<void>(r=>{push=()=>r();signal.addEventListener('abort',()=>r(),{once:true});});}},accept:async()=>{},move:async(_id,uci)=>{submissions++;queue.push(state(`e2e4 ${uci}`));push?.(undefined);}};
    const server=await buildServer({providerMode:'mock',lichessClient:client,logDir:join(dir,'logs')});await server.listen({port:0,host:'127.0.0.1'});
    const address=server.server.address();if(!address||typeof address==='string')throw new Error('Missing address');
    const extension=resolve('apps/extension/dist');
    const context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,channel:'chromium',chromiumSandbox:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    try{
        const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
        await worker.evaluate(async settings=>chrome.storage.local.set({settings}),{backendUrl:`http://127.0.0.1:${address.port}`,backendToken:'lichess-e2e-pairing'});
        const page=await context.newPage();await page.goto(`chrome-extension://${id}/sidepanel.html`);
        await page.getByRole('button',{name:'Lichess BOT',exact:true}).click();
        await page.getByRole('button',{name:'Connect BOT account'}).click();
        await expect(page.getByText('JevBot · BOT',{exact:true})).toBeVisible();
        await page.getByLabel('Active game').selectOption('abcdefgh');
        await expect(page.getByTestId('lichess-color')).toHaveText('Black');expect(submissions).toBe(0);
        await page.getByRole('button',{name:'Start Jev'}).click();
        await expect.poll(()=>submissions).toBe(1);
        await page.getByText('Verified move history',{exact:true}).click();
        await expect(page.getByTestId('lichess-moves')).toContainText('e2e4 a7a6');
        await expect(page.getByRole('alert')).toHaveCount(0);
        await page.getByRole('button',{name:'Stop Jev'}).click();
        await expect(page.getByTestId('lichess-state')).toHaveText('Paused');
        await page.screenshot({path:resolve('.test-tmp/1.3-lichess-panel.png'),fullPage:true});
        await page.setViewportSize({width:390,height:900});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        await page.screenshot({path:resolve('.test-tmp/1.3-lichess-panel-narrow.png'),fullPage:true});
        expect(submissions).toBe(1);
    }finally{await context.close();await server.close();if(previous===undefined)delete process.env.BACKEND_TOKEN;else process.env.BACKEND_TOKEN=previous;await rm(join(dir,'profile'),{recursive:true,force:true});}
});
