import 'dotenv/config';
import { test, expect, chromium } from '@playwright/test';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildServer } from '../../apps/server/src/app';
import { ChessStateManager } from '../../packages/chess-core/src';

test('live Luna vision, popup recovery and staged Jev execute a verified Canvas move', async () => {
    test.skip(process.env.JEV_LIVE_BROWSER !== '1', 'Paid live test requires explicit opt-in');
    test.setTimeout(120000);
    if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY required');
    const dir = await mkdtemp(join(tmpdir(), 'jev-live-extension-'));
    const extension = join(dir, 'extension');
    await cp(resolve('apps/extension/dist'), extension, { recursive: true });
    const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
    manifest.host_permissions.push('<all_urls>');
    await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
    const server = await buildServer({ providerMode: 'live' });
    await server.listen({ host: '127.0.0.1', port: 0 });
    const address = server.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing backend address');
    const context = await chromium.launchPersistentContext(join(dir, 'profile'), {
        headless: true, chromiumSandbox: true, channel: 'chromium',
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
        viewport: { width: 1280, height: 1000 },
    });
    let diagnostics:import('@playwright/test').Page|undefined;
    try {
        const board = await context.newPage();
        await board.goto('http://127.0.0.1:4173');
        await board.getByRole('button', { name: 'Canvas', exact: true }).click();
        await board.getByLabel('Load a position').fill('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
        await board.getByRole('button',{name:/Load FEN/}).click();
        await board.getByRole('button',{name:'Flip board',exact:true}).click();
        const initialFen = await board.getByTestId('current-fen').getAttribute('data-chess-fen');
        const state = new ChessStateManager(initialFen!);
        const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
        await worker.evaluate(async settings => { await chrome.storage.local.set({ settings }); }, {
            backendUrl: `http://127.0.0.1:${address.port}`,
            backendToken: process.env.BACKEND_TOKEN ?? '',
            authorizedOrigins: ['http://127.0.0.1:4173'], input: 'click',
        });
        const panel = diagnostics = await context.newPage();
        await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
        await board.bringToFront();
        await panel.getByRole('button', { name: 'Detect Board', exact: true }).click();
        await expect(panel.locator('textarea[readonly]')).toHaveValue(initialFen!, { timeout: 45000 });
        await expect(panel.getByText('Vision image', { exact: true })).toBeVisible();
        await expect(panel.getByText('♚ Black (board bottom)',{exact:true})).toBeVisible();
        await panel.getByRole('button', { name: 'Ask Jev', exact: true }).click();
        await expect(panel.getByRole('button', { name: 'Play Move', exact: true })).toBeEnabled({ timeout: 45000 });
        const debug = JSON.parse(await panel.locator('.debug pre').textContent() ?? '{}');
        expect(debug.decision.source).toBe('provider');
        const expected = state.expected(debug.decision.uci);
        await board.evaluate(()=>{const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Training tip');dialog.style.cssText='position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:#3338';const close=document.createElement('button');close.textContent='Close training tip';close.onclick=()=>dialog.remove();dialog.append(close);document.body.append(dialog);});
        await panel.getByRole('button', { name: 'Play Move', exact: true }).click();
        await expect(board.getByTestId('current-fen')).toHaveAttribute('data-chess-fen', expected, { timeout: 45000 });
        await expect(panel.getByTestId('session-state')).toHaveText('WAITING FOR OPPONENT', { timeout: 45000 });
        await expect(panel.locator('textarea[readonly]')).toHaveValue(expected);
        const verified = JSON.parse(await panel.locator('.debug pre').textContent() ?? '{}');
        expect(verified.execution.verified).toBe(true);
        console.log(JSON.stringify({ liveCanvasVerified: true, decision: debug.decision.uci, model: debug.decision.model, resultingFen: expected }));
        await panel.getByRole('button', { name: /Stop Auto Play/ }).click();
        await expect(panel.getByTestId('session-state')).toHaveText('IDLE');
    } catch(error){if(diagnostics)console.error('Live diagnostics:',await diagnostics.locator('.debug pre').textContent(),await diagnostics.locator('body').innerText());throw error;} finally {
        await context.close();
        await server.close();
        await rm(dir, { recursive: true, force: true });
    }
});
