import { expect, test, type Page } from '@playwright/test';
const fenField = (page: Page) => page.getByTestId('current-fen');
for (const mode of ['DOM', 'Canvas'] as const) {
    test(`${mode} board accepts e2-e4 and follows board orientation`, async ({ page }) => {
        await page.goto('http://127.0.0.1:4173');
        await page.getByRole('button', { name: mode }).click();
        const board = page.locator('[data-chessboard="true"]');
        await expect(board).toHaveAttribute('data-orientation', 'white');
        if (mode === 'DOM') {
            const bounds = await board.boundingBox();
            if (!bounds)
                throw new Error('DOM board is not visible');
            const square = bounds.width / 8;
            await page.mouse.click(bounds.x + square * 4.5, bounds.y + square * 6.5);
            await page.mouse.click(bounds.x + square * 4.5, bounds.y + square * 4.5);
        }
        else {
            const bounds = await board.boundingBox();
            if (!bounds)
                throw new Error('Canvas board is not visible');
            const square = bounds.width / 8;
            await page.mouse.click(bounds.x + square * 4.5, bounds.y + square * 6.5);
            await page.mouse.click(bounds.x + square * 4.5, bounds.y + square * 4.5);
        }
        await expect(fenField(page)).toContainText('4P3');
        await expect(fenField(page)).toHaveAttribute('data-chess-fen', / b /);
        await expect(page.getByRole('list', { name: 'Move history' })).toContainText('e4');
        await page.getByRole('button', { name: 'Flip board' }).click();
        await expect(board).toHaveAttribute('data-orientation', 'black');
    });
}
test('DOM board geometry stays aligned at desktop and phone widths', async ({ page }) => {
    await page.goto('http://127.0.0.1:4173');
    const board = page.locator('[data-chessboard="true"]');
    for (const viewport of [{ width: 1280, height: 1000 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        const geometry = await board.locator('[data-square="a1"]').evaluate((square) => {
            const boardRect = square.closest('[data-chessboard]')!.getBoundingClientRect();
            const squareRect = square.getBoundingClientRect();
            return { boardWidth: boardRect.width, squareWidth: squareRect.width };
        });
        expect(geometry.squareWidth).toBeCloseTo(geometry.boardWidth / 8, 4);
        const bounds = await board.boundingBox();
        if (!bounds)
            throw new Error('DOM board is not visible');
        const cell = bounds.width / 8;
        await page.mouse.click(bounds.x + cell * 4.5, bounds.y + cell * 6.5);
        await page.mouse.click(bounds.x + cell * 4.5, bounds.y + cell * 4.5);
        await expect(fenField(page)).toHaveAttribute('data-chess-fen', /4P3.* b /);
        await page.getByRole('button', { name: /New game/ }).click();
    }
});
test('DOM board accepts a pointer drag', async ({ page }) => {
    await page.goto('http://127.0.0.1:4173');
    const board = page.locator('[data-chessboard="true"]');
    const from = await board.locator('[data-square="e2"]').boundingBox();
    const to = await board.locator('[data-square="e4"]').boundingBox();
    if (!from || !to)
        throw new Error('DOM board squares are not visible');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(fenField(page)).toContainText('4P3');
    await expect(page.getByRole('list', { name: 'Move history' })).toContainText('e4');
  await board.locator('[data-square="e7"]').click();
  await board.locator('[data-square="e5"]').click();
  await expect(fenField(page)).toContainText('4p3');
    await board.locator('[data-square="d2"]').click();
    await board.locator('[data-square="d4"]').click();
  await expect(fenField(page)).toContainText('3PP3');
});
test('FEN input loads a position and reports invalid input', async ({ page }) => {
    await page.goto('http://127.0.0.1:4173');
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    await page.getByLabel('Load a position').fill(fen);
    await page.getByRole('button', { name: 'Load FEN' }).click();
    await expect(fenField(page)).toHaveAttribute('data-chess-fen', fen);
    await expect(page.locator('[data-square="e5"]')).toHaveAttribute('data-piece', 'p');
    await page.getByLabel('Load a position').fill('not a fen');
    await page.getByRole('button', { name: 'Load FEN' }).click();
    await expect(page.getByRole('alert')).toContainText('not a valid chess position');
    await expect(fenField(page)).toHaveAttribute('data-chess-fen', fen);
});
test('pawn promotion requires an explicit piece choice', async ({ page }) => {
    await page.goto('http://127.0.0.1:4173');
    const fen = '7k/P7/8/8/8/8/8/7K w - - 0 1';
    await page.getByLabel('Load a position').fill(fen);
    await page.getByRole('button', { name: 'Load FEN' }).click();
    const board = page.locator('[data-chessboard="true"]');
    await board.locator('[data-square="a7"]').click();
    await board.locator('[data-square="a8"]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Promote to rook' }).click();
    await expect(fenField(page)).toContainText('R6k/');
    await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('canvas redraws at its responsive size and current pixel ratio', async ({ page }) => {
    await page.goto('http://127.0.0.1:4173');
    await page.getByRole('button', { name: 'Canvas' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const canvas = page.locator('[data-chessboard="true"] canvas');
    await expect.poll(async () => canvas.evaluate((element: HTMLCanvasElement) => {
        const ratio = window.devicePixelRatio || 1;
        const rendered = element.getContext('2d')?.getImageData(1, 1, 1, 1).data[3] === 255;
        return element.width === Math.round(element.getBoundingClientRect().width * ratio) && rendered;
    })).toBe(true);
});
test('mock opponent starts for a loaded black turn and can be canceled', async ({ page }) => {
    await page.goto('http://127.0.0.1:4173');
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2';
    await page.getByLabel('Load a position').fill(fen);
    await page.getByRole('button', { name: 'Load FEN' }).click();
    const opponent = page.getByRole('checkbox');
    await opponent.check();
    await expect(fenField(page)).not.toHaveAttribute('data-chess-fen', fen, { timeout: 2000 });
    await expect(fenField(page)).toHaveAttribute('data-chess-fen', / w /);
    await page.getByLabel('Load a position').fill(fen);
    await page.getByRole('button', { name: 'Load FEN' }).click();
    await opponent.uncheck();
    await page.waitForTimeout(900);
    await expect(fenField(page)).toHaveAttribute('data-chess-fen', fen);
});
