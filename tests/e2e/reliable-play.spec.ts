import { test, expect, chromium } from '@playwright/test';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildServer } from '../../apps/server/src/app';
import { MockProvider } from '../../apps/server/src/providers/mock';
import { runDecisionStage } from '../../apps/server/src/services/decisions';
import type { ChooseRequest, StageTrace } from '../../packages/shared/src';

test('loaded extension stages decisions, dismisses an unfamiliar overlay, promotes exactly, and saves evidence',async()=>{
    test.setTimeout(120000);
    const dir=await mkdtemp(join(tmpdir(),'jev-reliable-')),extension=join(dir,'extension'),logDir=join(dir,'logs');
    await cp(resolve('apps/extension/dist'),extension,{recursive:true});
    const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));manifest.host_permissions.push('<all_urls>');await writeFile(join(extension,'manifest.json'),JSON.stringify(manifest));
    let stages=0,recoveries=0;
    class Fixture extends MockProvider {
        override async chooseStep(input:ChooseRequest,trace:StageTrace[],signal?:AbortSignal){
            stages++;
            return runDecisionStage(input,trace,async plan=>({model:'mock/reliable-play',answers:Object.fromEntries(Object.entries(plan.questions).map(([key,q])=>{
                const keys=Object.keys(q.criteria),choice=keys.includes('a7a8n')?'a7a8n':keys[0];
                return [key,{type:'choice',choice,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?1:0]))}];
            }))}),signal??new AbortController().signal,'mock/reliable-play','mock');
        }
    }
    const provider=new Fixture();
    const server=await buildServer({providerMode:'mock',provider:{parse:i=>provider.parse(i),discover:()=>provider.discover(),choose:i=>provider.choose(i),chooseStep:(i,t,s)=>provider.chooseStep(i,t,s),recover:async i=>{recoveries++;const target=i.targets.find(t=>t.label==='Close training tip');if(!target)throw new Error('Missing actual obstruction target: '+JSON.stringify(i.targets));return {action:'dismiss',targetId:target.id,reason:'Dismiss the training tip'};}},logDir});
    await server.listen({host:'127.0.0.1',port:0});const address=server.server.address();if(!address||typeof address==='string')throw new Error('Missing backend');
    const context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,chromiumSandbox:true,channel:'chromium',executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1280,height:1000}});
    let panel:import('@playwright/test').Page|undefined;
    try{
        const page=await context.newPage();await page.goto('http://127.0.0.1:4173');
        await page.getByLabel('Load a position').fill('7k/P7/8/8/8/8/8/7K w - - 0 1');await page.getByRole('button',{name:/Load FEN/}).click();
        const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
        await worker.evaluate(async settings=>chrome.storage.local.set({settings}),{backendUrl:`http://127.0.0.1:${address.port}`,authorizedOrigins:['http://127.0.0.1:4173'],input:'click',backendToken:process.env.BACKEND_TOKEN??''});
        panel=await context.newPage();await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);await page.bringToFront();
        await panel.getByRole('button',{name:'Detect Board',exact:true}).click();await expect(panel.locator('textarea[readonly]')).toHaveValue('7k/P7/8/8/8/8/8/7K w - - 0 1');
        await panel.getByRole('button',{name:'Ask Jev',exact:true}).click();await expect(panel.getByRole('button',{name:'Play Move',exact:true})).toBeEnabled({timeout:45000});
        await page.evaluate(()=>{const overlay=document.createElement('div');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Training tip');overlay.style.cssText='position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:#3338';const button=document.createElement('button');button.textContent='Close training tip';button.onclick=()=>overlay.remove();overlay.append(button);document.body.append(overlay);});
        await panel.getByRole('button',{name:'Play Move',exact:true}).click();
        await expect(page.getByTestId('current-fen')).toHaveText('N6k/8/8/8/8/8/8/7K b - - 0 1',{timeout:30000});
        await expect(panel.getByTestId('session-state')).toHaveText('FINISHED');expect(stages).toBe(6);expect(recoveries).toBe(1);
        const debug=JSON.parse(await panel.locator('.debug pre').textContent()??'{}');const session=debug.logging.sessionId;
        await expect.poll(async()=>{try{return await readFile(join(logDir,session,'events.0001.jsonl'),'utf8');}catch{return ''; }},{timeout:10000}).toContain('execution.outcome');
        const log=await readFile(join(logDir,session,'events.0001.jsonl'),'utf8');
        expect(log).toContain('recovery.evidence');expect(log).toContain('decision.stage_result');expect(log).toContain('a7a8n');expect(log).not.toContain('base64,');
        await test.info().attach('diagnostic-session',{body:log,contentType:'application/x-ndjson'});
    } catch(error){if(panel){console.error('Reliable play panel:',await panel.locator('body').innerText(),await panel.locator('.debug pre').textContent());await test.info().attach('reliable-play-panel',{body:await panel.locator('body').innerText(),contentType:'text/plain'});}throw error;} finally{await context.close();await server.close();await rm(dir,{recursive:true,force:true});}
});
