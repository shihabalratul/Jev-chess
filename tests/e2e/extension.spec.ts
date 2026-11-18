import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { buildServer } from '../../apps/server/src/app';
import { piecesFromFen, ChessStateManager } from '../../packages/chess-core/src';
import { glyphs, type ParseRequest } from '../../packages/shared/src';
import type { Provider } from '../../apps/server/src/providers/types';
// Mock external AI transport only. Recognition consumes screenshot pixels and never page FEN.
async function recognizePixels(page: Page, image: string, orientation: 'white' | 'black') {
    const pieces = await page.evaluate(async ({ image, orientation, glyphs }) => {
        const img = new Image();
        img.src = image;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const cell = img.width / 8;
        const references: Array<{
            piece: string;
            light: boolean;
            pixels: Uint8ClampedArray;
        }> = [];
        for (const light of [true, false])
            for (const [piece, glyph] of Object.entries(glyphs)) {
                const ref = document.createElement('canvas');
                ref.width = cell;
                ref.height = cell;
                const r = ref.getContext('2d')!;
                r.fillStyle = light ? '#eadfcb' : '#748866';
                r.fillRect(0, 0, cell, cell);
                r.font = `${cell * .72}px "Arial Unicode MS", "DejaVu Sans", serif`;
                r.textAlign = 'center';
                r.textBaseline = 'middle';
                const white = piece === piece.toUpperCase();
                r.fillStyle = white ? '#fffdf7' : '#1c2922';
                r.shadowColor = white ? '#18251f' : 'rgba(255,255,255,.42)';
                r.shadowBlur = 2;
                r.fillText(glyph, cell / 2, cell / 2 + cell * .015);
                references.push({ piece, light, pixels: r.getImageData(0, 0, cell, cell).data });
            }
        const out: Array<{
            square: string;
            piece: string;
        }> = [];
        for (let row = 0; row < 8; row++)
            for (let col = 0; col < 8; col++) {
                const pix = ctx.getImageData(col * cell, row * cell, cell, cell).data;
                const light = pix[0] > 180;
                const bg = light ? [234, 223, 203] : [116, 136, 102];
                let ink = 0;
                for (let i = 0; i < pix.length; i += 4)
                    if (Math.abs(pix[i] - bg[0]) + Math.abs(pix[i + 1] - bg[1]) + Math.abs(pix[i + 2] - bg[2]) > 70)
                        ink++;
                if (ink < 15)
                    continue;
                let best = '', bestError = Infinity;
                for (const ref of references.filter(r => r.light === light)) {
                    let error = 0;
                    for (let i = 0; i < pix.length; i += 4)
                        error += Math.abs(pix[i] - ref.pixels[i]) + Math.abs(pix[i + 1] - ref.pixels[i + 1]) + Math.abs(pix[i + 2] - ref.pixels[i + 2]);
                    if (error < bestError) {
                        bestError = error;
                        best = ref.piece;
                    }
                }
                const square = orientation === 'white' ? String.fromCharCode(97 + col) + (8 - row) : String.fromCharCode(104 - col) + (row + 1);
                out.push({ square, piece: best });
            }
        return out;
    }, { image, orientation, glyphs });
    return { pieces, orientation, sideToMove: null, castlingRights: null, enPassantSquare: null, uncertainSquares: [] } as Awaited<ReturnType<Provider['parse']>>;
}
for (const [mode, input] of [['DOM', 'click'], ['DOM', 'drag'], ['DOM', 'debugger-click'], ['DOM', 'debugger-drag'], ['Canvas', 'click']] as const) {
    test(`loaded extension detects, decides, executes and stops on ${mode} (${input})`, async () => {
        test.setTimeout(90000);
        const dir = await mkdtemp(join(tmpdir(), 'jev-extension-'));
        const extension = join(dir, 'extension');
        await cp(resolve('apps/extension/dist'), extension, { recursive: true });
        const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
        // Grant screenshot access only in this throwaway test profile; shipping manifest uses activeTab.
        manifest.permissions.push('debugger');
        manifest.optional_permissions = [];
        manifest.host_permissions.push('<all_urls>');
        await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
        const context = await chromium.launchPersistentContext(join(dir, 'profile'), { headless: true, chromiumSandbox: true, channel: 'chromium', executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`], viewport: { width: 1280, height: 1000 } });
        const page = await context.newPage();
        let chooseCalls = 0, parseCalls = 0;
        const provider: Provider = { parse: async (input: ParseRequest) => { parseCalls++; if (!input.image)
                throw new Error('Canvas test expects pixels'); return recognizePixels(page, input.image, input.orientation ?? 'white'); }, discover: async () => { throw new Error('Not used for generic demo'); }, choose: async (input) => { chooseCalls++; return { uci: input.legalMoves.some(m => m.uci === 'e2e4') ? 'e2e4' : input.legalMoves[0].uci, model: 'mock/test-jev', source: 'mock', latencyMs: 1 }; } };
        const server = await buildServer({ providerMode: 'mock', provider });
        await server.listen({ port: 0, host: '127.0.0.1' });
        const address = server.server.address();
        if (!address || typeof address === 'string') throw new Error('Missing backend address');
        let panel: Page | undefined;
        try {
            await page.goto('http://127.0.0.1:4173');
            await page.getByRole('button', { name: mode, exact: true }).click();
            await page.bringToFront();
            let worker = context.serviceWorkers()[0];
            if (!worker)
                worker = await context.waitForEvent('serviceworker');
            const extensionId = new URL(worker.url()).host;
            await worker.evaluate(async (settings) => { await chrome.storage.local.set({ settings }); }, {
                backendUrl: `http://127.0.0.1:${address.port}`,
                backendToken: process.env.BACKEND_TOKEN ?? '',
                authorizedOrigins: ['http://127.0.0.1:4173'], input,
            });
            // Use an extension UI window so the chessboard remains the active screenshot tab.
            panel = await context.newPage();
            await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
            await page.bringToFront();
            if (mode === 'DOM' && input === 'click') {
                const openCorrection = async () => {
                    await panel!.getByRole('button', { name: 'Settings', exact: true }).click();
                    await panel!.getByText('Advanced position correction', { exact: true }).click();
                };
                // Saving must reject incomplete seed state before it reaches storage.
                const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
                await openCorrection();
                await panel.getByLabel('Confirmed seed FEN').fill(fen.split(' ')[0]);
                await panel.getByRole('button', { name: 'Save Settings', exact: true }).click();
                await expect(panel.getByRole('alert')).toContainText('six fields');
                expect(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.seedFen ?? '')).toBe('');
                await panel.getByLabel('Confirmed seed FEN').fill(` \n${fen.replaceAll(' ', '\n\t')} \n`);
                await panel.getByRole('button', { name: 'Save Settings', exact: true }).click();
                await expect(panel.getByRole('button', { name: 'Save Settings', exact: true })).toHaveCount(0);
                expect(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.seedFen)).toBe(fen);
                await panel.getByRole('button', { name: 'Reset Session', exact: true }).click();
                // A fresh game without public metadata can be explicitly initialized in this session.
                await openCorrection();
                await panel.getByLabel('Confirmed seed FEN').fill('');
                await panel.getByRole('button', { name: 'Save Settings', exact: true }).click();
                await panel.getByRole('button', { name: 'Reset Session', exact: true }).click();
                await page.getByTestId('current-fen').evaluate(el => el.removeAttribute('data-chess-fen'));
                await panel.getByRole('button', { name: 'Detect Board', exact: true }).click();
                await expect(panel.getByRole('alert')).toContainText('Complete state FEN required');
                await expect(panel.locator('.preview span')).toHaveCount(32);
                await expect(panel.locator('textarea[readonly]')).toHaveValue('');
                await expect(panel.getByRole('heading', { name: 'Automatic game setup' })).toBeVisible();
                await openCorrection();
                await panel.getByRole('button', { name: 'Confirm untouched new game', exact: true }).click();
                await expect(panel.locator('textarea[readonly]')).toHaveValue(fen);
                await expect(panel.getByTestId('session-state')).toHaveText('IDLE');
                await expect(panel.getByRole('alert')).toHaveCount(0);
                expect(chooseCalls).toBe(0);
                expect(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.seedFen)).toBe('');
                await expect(page.getByTestId('current-fen')).toHaveText(fen);

                await panel.getByRole('button', { name: 'Settings', exact: true }).click();

                // The advanced confirmation must reject an ongoing game and show its observed pieces.
                const midgameFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
                await page.getByLabel('Load a position').fill(midgameFen);
                await page.getByRole('button', { name: /Load FEN/ }).click();
                await expect(page.getByTestId('current-fen')).toHaveText(midgameFen);
                await page.getByTestId('current-fen').evaluate(el => el.removeAttribute('data-chess-fen'));
                await panel.getByRole('button', { name: 'Reset Session', exact: true }).click();
                await panel.getByRole('button', { name: 'Detect Board', exact: true }).click();
                await expect(panel.getByRole('alert')).toContainText('Complete state FEN required');
                await openCorrection();
                await panel.getByRole('button', { name: 'Confirm untouched new game', exact: true }).click();
                await expect(panel.getByRole('alert')).toContainText(/starting|untouched|initial/i);
                await expect(panel.locator('textarea[readonly]')).toHaveValue('');
                await expect(panel.locator('.preview > div[title="e4"] span')).toHaveText(glyphs.P);
                expect(chooseCalls).toBe(0);
                expect(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.seedFen)).toBe('');

                await panel.getByRole('button', { name: 'Settings', exact: true }).click();
                await page.getByLabel('Load a position').fill(fen);
                await page.getByRole('button', { name: /Load FEN/ }).click();
                await expect(page.getByTestId('current-fen')).toHaveText(fen);
                await page.getByTestId('current-fen').evaluate(el => el.removeAttribute('data-chess-fen'));
                await openCorrection();
                await panel.getByRole('button', { name: 'Confirm untouched new game', exact: true }).click();
                await expect(panel.locator('textarea[readonly]')).toHaveValue(fen);
                await expect(panel.getByRole('alert')).toHaveCount(0);
                await panel.getByRole('button', { name: 'Settings', exact: true }).click();
                // Restore demo metadata for the remaining full gameplay and reload checks.
                await page.getByTestId('current-fen').evaluate((el, value) => el.setAttribute('data-chess-fen', value), fen);
            }
            await panel.getByRole('button', { name: 'Detect Board', exact: true }).click();
            await expect(panel.locator('textarea[readonly]')).toHaveValue(/rnbqkbnr\/pppppppp/, { timeout: 15000 });
            await panel.getByRole('button', { name: 'Ask Jev', exact: true }).click();
            await expect(panel.getByRole('button', { name: 'Play Move', exact: true })).toBeEnabled({ timeout: 15000 });
            await panel.getByRole('button', { name: 'Play Move', exact: true }).click();
            await expect(page.getByTestId('current-fen')).toHaveAttribute('data-chess-fen', /4P3\/8\/PPPP1PPP.* b /, { timeout: 15000 });
            await expect(panel.getByTestId('session-state')).toHaveText('WAITING FOR OPPONENT', { timeout: 15000 });
            expect(chooseCalls).toBe(1);
            if (mode === 'Canvas')
                expect(parseCalls).toBeGreaterThanOrEqual(2);
            else {
                expect(parseCalls).toBe(0);
                await expect(panel.getByText('Generic DOM / geometry', { exact: true })).toBeVisible();
            }
            // Human opponent move: black e7e5, coordinates differ if board flipped.
            const bounds = await page.locator('[data-chessboard]').boundingBox();
            if (!bounds)
                throw new Error('Missing board');
            await page.mouse.click(bounds.x + bounds.width * 4.5 / 8, bounds.y + bounds.height * 1.5 / 8);
            await page.mouse.click(bounds.x + bounds.width * 4.5 / 8, bounds.y + bounds.height * 3.5 / 8);
            await panel.getByRole('button', { name: 'Parse Position', exact: true }).click();
            await expect(panel.locator('.details').getByText('e5', { exact: true })).toBeVisible({ timeout: 15000 });
            await page.getByRole('checkbox').check();
            await panel.getByRole('button', { name: /Start Auto Play/ }).click();
            await expect.poll(async () => Number.parseInt(await page.locator('.move-count').innerText()), { timeout: 30000 }).toBeGreaterThanOrEqual(5);
            await panel.getByRole('button', { name: /Stop Auto Play/ }).click();
            await page.getByRole('checkbox').uncheck();
            await expect(panel.getByTestId('session-state')).toHaveText('IDLE');
            expect(chooseCalls).toBeGreaterThanOrEqual(3);
            const stoppedFen = await page.getByTestId('current-fen').getAttribute('data-chess-fen');
            await page.waitForTimeout(1600);
            expect(await page.getByTestId('current-fen').getAttribute('data-chess-fen')).toBe(stoppedFen);
            await page.reload();
            await expect(panel.getByTestId('session-state')).toHaveText('IDLE');
            await expect(panel.locator('textarea[readonly]')).toHaveValue('');
            if (mode === 'DOM' && input === 'click') {
                // Recover an ongoing game from its complete visible record, with no manual correction.
                const game = new ChessStateManager('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
                const board = await page.locator('[data-chessboard]').boundingBox();
                if (!board) throw new Error('Missing board');
                for (const uci of ['e2e4', 'e7e5', 'g1f3', 'b8c6']) {
                    for (const square of [uci.slice(0, 2), uci.slice(2, 4)]) {
                        const file = square.charCodeAt(0) - 97, rank = Number(square[1]);
                        await page.mouse.click(board.x + board.width * (file + .5) / 8, board.y + board.height * (8 - rank + .5) / 8);
                    }
                    game.apply(uci);
                    await expect(page.getByTestId('current-fen')).toHaveText(game.fen);
                }
                await expect(page.getByRole('list', { name: 'Move history' })).toContainText('Nf3');
                await page.getByTestId('current-fen').evaluate(el => el.removeAttribute('data-chess-fen'));
                expect(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.seedFen)).toBe('');
                await panel.getByRole('button', { name: 'Reset Session', exact: true }).click();
                const parsesBeforeRecovery = parseCalls;
                await panel.getByRole('button', { name: 'Detect Board', exact: true }).click();
                await expect(panel.locator('textarea[readonly]')).toHaveValue(game.fen, { timeout: 15000 });
                await expect(panel.getByRole('alert')).toHaveCount(0);
                await expect(panel.getByTestId('session-state')).toHaveText('IDLE');
                await expect(panel.getByRole('button', { name: 'Confirm untouched new game', exact: true })).toHaveCount(0);
                await panel.getByRole('button', { name: 'Ask Jev', exact: true }).click();
                await expect(panel.getByRole('button', { name: 'Play Move', exact: true })).toBeEnabled();
                // Two manually played plies leave the controller behind. Recover
                // through a complete record whose piece symbols are visible icons.
                for (const uci of ['f1b5', 'a7a6']) {
                    for (const square of [uci.slice(0, 2), uci.slice(2, 4)]) {
                        const file = square.charCodeAt(0) - 97, rank = Number(square[1]);
                        await page.mouse.click(board.x + board.width * (file + .5) / 8, board.y + board.height * (8 - rank + .5) / 8);
                    }
                    game.apply(uci);
                    await expect(page.getByTestId('current-fen')).toHaveText(game.fen);
                }
                await page.getByTestId('current-fen').evaluate(el => el.removeAttribute('data-chess-fen'));
                await page.getByRole('list', { name: 'Move history' }).evaluate(list => {
                    for (const cell of list.querySelectorAll('.move-san')) {
                        const san = cell.textContent ?? '';
                        if (!/^[KQRBN]/.test(san)) continue;
                        const icon = document.createElement('span');
                        icon.setAttribute('data-figurine', san[0]);
                        icon.style.cssText = 'display:inline-block;width:12px;height:12px;background:currentColor';
                        cell.replaceChildren(icon, document.createTextNode(' ' + san.slice(1)));
                    }
                });
                await panel.getByRole('button', { name: 'Parse Position', exact: true }).click();
                await expect(panel.locator('textarea[readonly]')).toHaveValue(game.fen);
                await expect(panel.getByRole('alert')).toHaveCount(0);
                await expect(panel.getByRole('button', { name: 'Play Move', exact: true })).toBeDisabled();
                await panel.getByRole('button', { name: 'Ask Jev', exact: true }).click();
                await expect(panel.getByRole('button', { name: 'Play Move', exact: true })).toBeEnabled();
                const expectedFen = game.expected(game.legalMoves()[0].uci);
                await panel.getByRole('button', { name: 'Play Move', exact: true }).click();
                await expect(page.getByTestId('current-fen')).toHaveAttribute('data-chess-fen', expectedFen);
                await expect(panel.getByTestId('session-state')).toHaveText('WAITING FOR OPPONENT');
                expect(parseCalls).toBe(parsesBeforeRecovery);
                expect(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.seedFen)).toBe('');
            }
        }
        catch (error) {
            if (panel) {
                console.error('Extension diagnostic:', await panel.getByRole('alert').allTextContents());
                const debug = JSON.parse(await panel.locator('.debug pre').textContent() ?? '{}');
                console.error('Observed state:', JSON.stringify({ fen: debug.fen, observation: debug.claudeOutput, boardFen: await page.getByTestId('current-fen').getAttribute('data-chess-fen') }));
                await test.info().attach('extension-panel', { body: await panel.locator('body').innerText(), contentType: 'text/plain' });
            }
            await test.info().attach('board-screenshot', { body: await page.screenshot(), contentType: 'image/png' });
            throw error;
        }
        finally {
            await context.close();
            await server.close();
            await rm(dir, { recursive: true, force: true });
        }
    });
}
