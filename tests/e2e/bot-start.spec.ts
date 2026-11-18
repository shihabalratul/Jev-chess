import {test,expect,chromium} from '@playwright/test';
import {cp,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {DEFAULT_POSITION} from 'chess.js';
import {buildServer} from '../../apps/server/src/app';

test('fresh public bot game exports verified starting state through its Download control',async()=>{
    test.skip(process.env.JEV_CHESSCOM_BROWSER!=='1','External public UI opt-in; no live AI or chess move');test.setTimeout(120000);
    const dir=await mkdtemp(join(tmpdir(),'jev-bot-start-')),extension=join(dir,'extension');
    await cp(resolve('apps/extension/dist'),extension,{recursive:true});
    const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));manifest.host_permissions.push('<all_urls>');await writeFile(join(extension,'manifest.json'),JSON.stringify(manifest));
    let modelCalls=0;
    const server=await buildServer({providerMode:'mock',provider:{parse:async()=>{modelCalls++;throw new Error('Public DOM expected');},discover:async()=>{modelCalls++;throw new Error('Public DOM expected');},choose:async()=>{throw new Error('No chess input authorized in this detection test');}}});
    await server.listen({host:'127.0.0.1',port:0});const address=server.server.address();if(!address||typeof address==='string')throw new Error('Missing backend');
    console.log('Bot-start: public backend ready; launching disposable Chromium');
    const context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,channel:'chromium',chromiumSandbox:true,timeout:30000,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1280,height:1000}});
    let panel:import('@playwright/test').Page|undefined;
    try{
        console.log('Bot-start: Chromium ready; opening public bot page');
        const page=await context.newPage();
        await page.route('**/*',route=>{const host=new URL(route.request().url()).hostname;return /(?:^|\.)(?:doubleclick.net|googlesyndication.com|google-analytics.com|amazon-adsystem.com)$/.test(host)?route.abort():route.continue();});
        await page.goto('https://www.chess.com/play/computer',{waitUntil:'domcontentloaded',timeout:45000});
        console.log('Bot-start: public page loaded');
        const close=page.locator('dialog[open]').getByRole('button',{name:'Close',exact:true});
        try{await close.waitFor({state:'visible',timeout:8000});await close.click();}catch(error){if(!(error instanceof Error)||!error.message.includes('Timeout'))throw error;}
        const reject=page.getByRole('button',{name:'Reject All',exact:true});if(await reject.isVisible())await reject.click();
        await page.getByRole('button',{name:'Play',exact:true}).click();
        console.log('Bot-start: practice game opened');
        await expect(page.locator('wc-simple-move-list[board-id="board-play-computer"]')).toHaveCount(1);
        await expect(page.locator('.game-controls-controller-component button[aria-label="Download"]')).toBeVisible();
        const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
        await worker.evaluate(async settings=>chrome.storage.local.set({settings}),{backendUrl:`http://127.0.0.1:${address.port}`,backendToken:process.env.BACKEND_TOKEN??'',seedFen:''});
        panel=await context.newPage();await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);await page.bringToFront();
        console.log('Bot-start: extension panel ready');
        await panel.getByRole('button',{name:'Detect Board',exact:true}).click();
        await expect(panel.locator('textarea[readonly]')).toHaveValue(DEFAULT_POSITION,{timeout:25000});
        await expect(panel.getByText('♔ White (board bottom)',{exact:true})).toBeVisible();
        await expect(panel.getByRole('alert')).toHaveCount(0);expect(modelCalls).toBe(0);
        expect(await worker.evaluate(async()=>(await chrome.storage.local.get('settings')).settings.seedFen)).toBe('');
        await expect(page.locator('dialog[open] .share-menu-tab-pgn-component')).toHaveCount(0);
        await test.info().attach('verified-bot-start',{body:await page.screenshot(),contentType:'image/png'});
        await test.info().attach('bot-start-panel',{body:await panel.screenshot(),contentType:'image/png'});
    }catch(error){console.error('Bot-start failure:',error);if(panel)console.error('Bot start diagnostics',await panel.locator('body').innerText());throw error;}
    finally{await context.close();await server.close();await rm(dir,{recursive:true,force:true});}
});
