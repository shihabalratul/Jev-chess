import { test, expect, chromium } from '@playwright/test';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildServer } from '../../apps/server/src/app';
import { ChessStateManager } from '../../packages/chess-core/src';
import { DEFAULT_POSITION } from 'chess.js';

test('Chess.com public analysis recovers state without manual FEN and verifies browser input', async () => {
    test.skip(process.env.JEV_CHESSCOM_BROWSER !== '1', 'External website smoke requires explicit opt-in; AI transport is mocked');
    test.setTimeout(120000);
    const dir = await mkdtemp(join(tmpdir(), 'jev-chesscom-extension-'));
    const input = process.env.JEV_CHESSCOM_INPUT === 'debugger-click' ? 'debugger-click' : 'click';
    const extension = join(dir, 'extension');
    await cp(resolve('apps/extension/dist'), extension, { recursive: true });
    const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
    // Permissions are granted only in the disposable test profile.
    manifest.permissions.push('debugger');
    manifest.optional_permissions = [];
    manifest.host_permissions.push('<all_urls>');
    await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
    let chooseCalls = 0, parseCalls = 0, discoverCalls = 0;
    const server = await buildServer({ providerMode: 'mock', provider: {
        parse: async () => { parseCalls++; throw new Error('Public DOM smoke must not need vision'); },
        discover: async () => { discoverCalls++; throw new Error('Public DOM smoke must not need parser discovery'); },
        choose: async input => {
            chooseCalls++;
            const uci = ['e2e4', 'g1f3', 'b5c6'].find(uci => input.legalMoves.some(move => move.uci === uci));
            if (!uci) throw new Error('Missing legal Chess.com smoke move');
            return { uci, latencyMs: 1, model: 'mock/chesscom-smoke', source: 'mock' };
        }
    } });
    await server.listen({ host: '127.0.0.1', port: 0 });
    const address = server.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing temporary backend address');
    const context = await chromium.launchPersistentContext(join(dir, 'profile'), {
        headless: true, chromiumSandbox: true, channel: 'chromium',
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
        viewport: { width: 1280, height: 1000 },
    });
    let panel;
    try {
        const page = await context.newPage();
        await page.goto('https://www.chess.com/analysis', { waitUntil: 'domcontentloaded', timeout: 45000 });
        const newAnalysis = page.getByRole('button', { name: /^New Analysis/ });
        await expect(newAnalysis).toBeVisible({ timeout: 20000 });
        // Dismiss public onboarding and choose minimal cookies in this anonymous test profile.
        const onboarding = page.locator('#first-time-modal dialog[open]').getByRole('button', { name: 'Close', exact: true });
        if (await onboarding.count()) await onboarding.click();
        const cookies = page.getByRole('button', { name: 'Reject All', exact: true });
        try{await cookies.waitFor({state:'visible',timeout:5000});await cookies.click();}catch(error){if(!(error instanceof Error)||!error.message.includes('Timeout'))throw error;}
        await newAnalysis.click();
        await expect(page.locator('wc-move-list')).toHaveCount(1);
        const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
        await worker.evaluate(async settings => { await chrome.storage.local.set({ settings }); }, {
            backendUrl: `http://127.0.0.1:${address.port}`, backendToken: process.env.BACKEND_TOKEN ?? '',
            authorizedOrigins: ['https://www.chess.com'], input, seedFen: '',
        });
        panel = await context.newPage();
        await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
        await page.bringToFront();
        await panel.getByRole('button', { name: 'Detect Board', exact: true }).click();
        await expect(panel.locator('textarea[readonly]')).toHaveValue(DEFAULT_POSITION, { timeout: 20000 });
        await expect(panel.locator('.preview span')).toHaveCount(32);
        await expect(panel.getByRole('alert')).toHaveCount(0);
        const state = new ChessStateManager(DEFAULT_POSITION);
        await panel.getByRole('button', { name: 'Ask Jev', exact: true }).click();
        await expect(panel.getByRole('button', { name: 'Play Move', exact: true })).toBeEnabled();
        await page.evaluate(()=>{
            const board=document.querySelector('wc-chess-board')!;
            const frames:unknown[]=[];
            const observer=new MutationObserver(()=>{
                const animations=board.getAnimations({subtree:true}).filter(a=>a.playState==='running').map(a=>({playState:a.playState,timing:a.effect?.getComputedTiming(),target:(a.effect as KeyframeEffect)?.target instanceof Element?((a.effect as KeyframeEffect).target as Element).className:null}));
                if(frames.length>=64)return;
                const rect=board.getBoundingClientRect();
                const moving=[...board.querySelectorAll('.piece')].some(e=>{const match=/square-(\d)(\d)/.exec(e.className),r=e.getBoundingClientRect();if(!match)return false;return Math.abs(r.x-rect.x-(Number(match[1])-1)*rect.width/8)>2||Math.abs(r.y-rect.y-(8-Number(match[2]))*rect.height/8)>2;});
                if(!animations.length&&!moving)return;
                frames.push({geometryDisagreement:moving,boardRect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},animations,pieces:[...board.querySelectorAll('.piece')].map(e=>{const r=e.getBoundingClientRect();return {class:e.className,style:e.getAttribute('style'),rect:{x:r.x,y:r.y,width:r.width,height:r.height},transform:getComputedStyle(e).transform};})});
            });
            observer.observe(board,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
            (window as any).__jevPublicAnimation={frames,observer};
        });
        await panel.getByRole('button', { name: 'Play Move', exact: true }).click();
        const animation=await page.evaluate(()=>{const evidence=(window as any).__jevPublicAnimation;return evidence.frames;});
        await test.info().attach('public-animation-evidence',{body:JSON.stringify(animation,null,2),contentType:'application/json'});
        if(process.env.JEV_CAPTURE_FIXTURE==='1'&&animation.length)await writeFile(resolve('tests/fixtures/chesscom-animation-dom.json'),JSON.stringify({source:'https://www.chess.com/analysis',capturedAt:new Date().toISOString(),provenance:'Actual public DOM/CSS animation observed by MutationObserver during loaded-extension e2e4 input; no private objects or site API.',frames:animation},null,2)+'\n');
        state.apply('e2e4');
        await expect(panel.locator('textarea[readonly]')).toHaveValue(state.fen);
        await expect(page.locator('wc-chess-board .piece.wp.square-54')).toHaveCount(1);
        const bounds = await page.locator('wc-chess-board').boundingBox();
        if (!bounds) throw new Error('Missing Chess.com board');
        await page.mouse.click(bounds.x + bounds.width * 4.5 / 8, bounds.y + bounds.height * 1.5 / 8);
        await page.mouse.click(bounds.x + bounds.width * 4.5 / 8, bounds.y + bounds.height * 3.5 / 8);
        state.apply('e7e5');
        await expect(page.locator('wc-chess-board .piece.bp.square-55')).toHaveCount(1);
        await panel.getByRole('button', { name: 'Reset Session', exact: true }).click();
        await panel.getByRole('button', { name: 'Detect Board', exact: true }).click();
        await expect(panel.locator('textarea[readonly]')).toHaveValue(state.fen);
        await panel.getByRole('button', { name: 'Ask Jev', exact: true }).click();
        await expect(panel.getByRole('button', { name: 'Play Move', exact: true })).toBeEnabled();
        await panel.getByRole('button', { name: 'Play Move', exact: true }).click();
        state.apply('g1f3');
        await expect(page.locator('wc-chess-board .piece.wn.square-63')).toHaveCount(1);
        await expect(panel.locator('textarea[readonly]')).toHaveValue(state.fen);
        const debug = JSON.parse(await panel.locator('.debug pre').textContent() ?? '{}');
        expect(debug.execution.verified).toBe(true);
        expect(chooseCalls).toBe(2);
        expect(parseCalls).toBe(0);
        expect(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.seedFen)).toBe('');
        // Several analysis moves can occur between observations. Recover the
        // entire verified extension of the recorded game without a manual reset.
        for (const uci of ['b8c6', 'f1b5', 'a7a6']) {
            for (const square of [uci.slice(0, 2), uci.slice(2, 4)]) {
                const file = square.charCodeAt(0) - 97, rank = Number(square[1]);
                await page.mouse.click(bounds.x + bounds.width * (file + .5) / 8, bounds.y + bounds.height * (8 - rank + .5) / 8);
            }
            state.apply(uci);
        }
        await panel.getByRole('button', { name: 'Parse Position', exact: true }).click();
        await expect(panel.locator('textarea[readonly]')).toHaveValue(state.fen);
        await expect(panel.getByRole('alert')).toHaveCount(0);
        // Capture animations briefly retain the captured knight in the DOM.
        // Verification must settle on the observed board after the capture.
        await panel.getByRole('button', { name: 'Ask Jev', exact: true }).click();
        await expect(panel.getByRole('button', { name: 'Play Move', exact: true })).toBeEnabled();
        await panel.getByRole('button', { name: 'Play Move', exact: true }).click();
        state.apply('b5c6');
        await expect(panel.locator('textarea[readonly]')).toHaveValue(state.fen);
        await expect(page.locator('wc-chess-board .piece.wb.square-36')).toHaveCount(1);
        await expect(page.locator('wc-chess-board .piece.bn.square-36')).toHaveCount(0);
        const captureDebug = JSON.parse(await panel.locator('.debug pre').textContent() ?? '{}');
        expect(captureDebug.execution.verified).toBe(true);
        const captureFrames=await page.evaluate(()=>{const evidence=(window as any).__jevPublicAnimation;evidence.observer.disconnect();return evidence.frames;});
        if(process.env.JEV_CAPTURE_FIXTURE==='1'&&captureFrames.length)await writeFile(resolve('tests/fixtures/chesscom-animation-dom.json'),JSON.stringify({source:'https://www.chess.com/analysis',capturedAt:new Date().toISOString(),provenance:'Actual public piece DOM/geometry during loaded-extension moves and capture, recorded by MutationObserver; no private objects or site API.',frames:captureFrames},null,2)+'\n');
        expect(chooseCalls).toBe(3);
        expect(parseCalls).toBe(0);
        expect(discoverCalls).toBe(0);
        await panel.getByRole('button', { name: /Stop Auto Play/ }).click();
        await expect(panel.getByTestId('session-state')).toHaveText('IDLE');
        console.log(JSON.stringify({ chesscomPublicAnalysisVerified: true, automaticInitialState: true, automaticMidgameRecovery: true, missedMovesRecovered: 3, captureVerification: true, verifiedMoves: 3, input, aiTransport: 'mock' }));
    } catch (error) {
        if (panel) console.error('Chess.com extension diagnostic:', await panel.locator('body').innerText());
        throw error;
    } finally {
        await context.close();
        await server.close();
        await rm(dir, { recursive: true, force: true });
    }
});

test('Chess.com public promotion picker executes an exact knight underpromotion',async()=>{
    test.skip(process.env.JEV_CHESSCOM_BROWSER!=='1','External website smoke requires opt-in; strategic choice is explicitly mocked');
    test.setTimeout(120000);
    const dir=await mkdtemp(join(tmpdir(),'jev-chesscom-promotion-')),extension=join(dir,'extension');
    await cp(resolve('apps/extension/dist'),extension,{recursive:true});
    const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));manifest.host_permissions.push('<all_urls>');await writeFile(join(extension,'manifest.json'),JSON.stringify(manifest));
    const server=await buildServer({providerMode:'mock',logDir:join(dir,'logs'),provider:{parse:async()=>{throw new Error('Expected public DOM recognition');},discover:async()=>{throw new Error('Expected generic parser');},choose:async input=>{if(!input.legalMoves.some(m=>m.uci==='a7a8n'))throw new Error('Missing legal underpromotion');return {uci:'a7a8n',source:'mock',model:'mock/chesscom-promotion',latencyMs:0};}}});
    await server.listen({host:'127.0.0.1',port:0});const address=server.server.address();if(!address||typeof address==='string')throw new Error('Missing backend');
    const context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,chromiumSandbox:true,channel:'chromium',executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1280,height:1000}});
    let panel:import('@playwright/test').Page|undefined,observedPage:import('@playwright/test').Page|undefined;
    try{
        const page=observedPage=await context.newPage();await page.goto('https://www.chess.com/analysis',{waitUntil:'domcontentloaded',timeout:45000});
        await expect(page.getByRole('button',{name:/^New Analysis/})).toBeVisible({timeout:20000});
        const onboarding=page.locator('#first-time-modal dialog[open]').getByRole('button',{name:'Close',exact:true});if(await onboarding.count())await onboarding.click();
        const cookies=page.getByRole('button',{name:'Reject All',exact:true});try{await cookies.waitFor({state:'visible',timeout:5000});await cookies.click();}catch(error){if(!(error instanceof Error)||!error.message.includes('Timeout'))throw error;}
        await page.getByPlaceholder('Paste a PGN, FEN, or study link…').fill('7k/P7/8/8/8/8/8/7K w - - 0 1');await page.getByRole('button',{name:'Load',exact:true}).click();
        await expect(page.locator('wc-chess-board .piece.wp.square-17')).toHaveCount(1);
        const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
        await worker.evaluate(async settings=>chrome.storage.local.set({settings}),{backendUrl:`http://127.0.0.1:${address.port}`,authorizedOrigins:['https://www.chess.com'],input:'click',seedFen:'',backendToken:process.env.BACKEND_TOKEN??''});
        panel=await context.newPage();await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);await page.bringToFront();
        await panel.getByRole('button',{name:'Detect Board',exact:true}).click();await expect(panel.locator('textarea[readonly]')).toHaveValue('7k/P7/8/8/8/8/8/7K w - - 0 1',{timeout:20000});
        await panel.getByRole('button',{name:'Ask Jev',exact:true}).click();await expect(panel.getByRole('button',{name:'Play Move',exact:true})).toBeEnabled();await panel.getByRole('button',{name:'Play Move',exact:true}).click();
        await expect(panel.locator('textarea[readonly]')).toHaveValue('N6k/8/8/8/8/8/8/7K b - - 0 1',{timeout:15000});
        await expect(page.locator('wc-chess-board .piece.wn.square-18')).toHaveCount(1);await expect(panel.getByTestId('session-state')).toHaveText('FINISHED');
        await expect(panel.getByRole('alert')).toHaveCount(0);
        console.log(JSON.stringify({publicChesscomUnderpromotionVerified:true,uci:'a7a8n',aiTransport:'mock',input:'click'}));
    }catch(error){if(observedPage)console.error('Public promotion board evidence:',await observedPage.locator('wc-chess-board').evaluate(board=>({pieces:[...board.querySelectorAll('.piece')].map(e=>({class:e.className,display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility})),pickers:[...board.querySelectorAll('.promotion-window')].map(e=>({class:e.className,display:getComputedStyle(e).display}))})));if(panel)console.error('Chess.com promotion diagnostic:',await panel.locator('body').innerText(),await panel.locator('.debug pre').textContent());throw error;}
    finally{await context.close();await server.close();await rm(dir,{recursive:true,force:true});}
});
