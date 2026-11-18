// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { BoardReader } from '../apps/extension/src/parsing/BoardReader';
import { defaults, type Observation } from '../packages/shared/src';
import { ChessStateManager, piecesFromFen } from '../packages/chess-core/src';
import { background } from '../apps/extension/src/content/bridge';
vi.mock('../apps/extension/src/content/bridge', () => ({ background: vi.fn() }));
beforeEach(() => {
    document.body.innerHTML = '';
    vi.mocked(background).mockReset().mockRejectedValue(new Error('Unexpected provider fallback'));
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } } });
});
function pageFixture(history: string, moves = ['e4', 'e5']) {
    const game = new Chess();
    for (const san of moves) game.move(san);
    document.body.innerHTML = `<section data-chessboard data-orientation="white">${piecesFromFen(game.fen()).map(p => `<div data-square="${p.square}" data-piece="${p.piece}"></div>`).join('')}</section>${history}`;
    const board = document.querySelector('section')!;
    board.getBoundingClientRect = () => ({ x: 0, y: 0, width: 400, height: 400, top: 0, left: 0, right: 400, bottom: 400, toJSON() {} });
    const observation: Observation = { pieces: piecesFromFen(game.fen()), orientation: 'white', sideToMove: null, castlingRights: null, enPassantSquare: null, uncertainSquares: [] };
    return { game, observation };
}
it('recovers FEN automatically from visible moves without a seed or provider call', async () => {
    const { game } = pageFixture('<ol aria-label="Move history"><li>1. <span>e4</span> <span>e5</span></li></ol>');
    const reader = new BoardReader(() => defaults);
    const result = await reader.read(new AbortController().signal);
    const state = new ChessStateManager();
    state.observe(result.observation, result.seedFen, result.seedPgn);
    expect(state.fen).toBe(game.fen());
    expect(state.history).toEqual(['e4', 'e5']);
    expect(background).not.toHaveBeenCalled();
});
it('passes visible history to Claude for image recognition and keeps placement independent', async () => {
    const { game, observation } = pageFixture('<ol aria-label="Move history"><li>1. e4 e5</li></ol>');
    vi.mocked(background).mockImplementation(async type => type === 'CAPTURE' ? 'data:image/png;base64,YQ==' : { ...observation, gamePgn: '1. e4 e5' });
    const reader = new BoardReader(() => ({ ...defaults, recognition: 'image' }));
    const result = await reader.read(new AbortController().signal);
    const parseCall = vi.mocked(background).mock.calls.find(([type]) => type === 'API')!;
    expect((parseCall[1].body as { gameContext: string }).gameContext).toContain('1. e4 e5');
    const state = new ChessStateManager();
    state.observe(result.observation, result.seedFen, result.seedPgn);
    expect(state.fen).toBe(game.fen());
});
it('rejects invented complete history for a partial visible record and caches that attempt', async () => {
    const { observation } = pageFixture('<div class="move-list">8. e4 e5</div>');
    vi.mocked(background).mockResolvedValue({ ...observation, gamePgn: '1. e4 e5' });
    const reader = new BoardReader(() => defaults);
    const signal = new AbortController().signal;
    const first = await reader.read(signal);
    const second = await reader.read(signal);
    expect(first.seedPgn).toBeUndefined();
    expect(second.seedPgn).toBeUndefined();
    expect(background).toHaveBeenCalledTimes(1);
    const state = new ChessStateManager();
    expect(() => state.observe(first.observation, first.seedFen, first.seedPgn)).toThrow(/Complete state FEN required/);
});
it('does not pay for state recovery while the controller already tracks the game', async () => {
    pageFixture('<div class="move-list">8. e4 e5</div>');
    const reader = new BoardReader(() => defaults, () => false);
    const result = await reader.read(new AbortController().signal);
    expect(result.observation.pieces).toHaveLength(32);
    expect(background).not.toHaveBeenCalled();
});
it('retries transient recovery failures and rechecks a changed board or explicit detection', async () => {
    const { observation } = pageFixture('<div class="move-list">8. e4 e5</div>');
    vi.mocked(background).mockRejectedValueOnce(new Error('Backend network failed')).mockResolvedValue(observation);
    const reader = new BoardReader(() => defaults);
    const signal = new AbortController().signal;
    await reader.read(signal);
    await reader.read(signal);
    await reader.read(signal);
    expect(background).toHaveBeenCalledTimes(2);
    reader.detect();
    await reader.read(signal);
    expect(background).toHaveBeenCalledTimes(3);
    const game = new Chess();
    game.move('d4'); game.move('d5');
    document.querySelector('section')!.innerHTML = piecesFromFen(game.fen()).map(p => `<div data-square="${p.square}" data-piece="${p.piece}"></div>`).join('');
    vi.mocked(background).mockResolvedValue({ ...observation, pieces: piecesFromFen(game.fen()) });
    await reader.read(signal);
    expect(background).toHaveBeenCalledTimes(4);
});
it('refuses to recognize the detached board left behind by page navigation', async () => {
    pageFixture('<ol aria-label="Move history"><li>1. e4 e5</li></ol>');
    const reader = new BoardReader(() => defaults);
    const signal = new AbortController().signal;
    await reader.read(signal);
    document.querySelector('section')!.remove();
    await expect(reader.read(signal)).rejects.toThrow(/Board removed|page changed/);
    expect(background).not.toHaveBeenCalled();
});
it('waits for a capture overlap to disappear and reads fresh history without provider fallback', async () => {
    const { game } = pageFixture('<div class="move-list">1. f4 d5 2. Nf3 Nh6 3. Nc3 f5 4. Nxd5 Kf7 5. c4 e6 6. Nxc7 Rg8</div>', ['f4', 'd5', 'Nf3', 'Nh6', 'Nc3', 'f5', 'Nxd5', 'Kf7', 'c4', 'e6', 'Nxc7', 'Rg8']);
    const board = document.querySelector('section')!;
    const knight = board.querySelector('[data-square="c7"]')!;
    knight.setAttribute('data-square', 'a8');
    const ghost = document.createElement('div');
    ghost.className = 'element br';
    ghost.setAttribute('data-square', 'a8');
    board.append(ghost);
    const finish = setTimeout(() => {
        game.move('Nxa8');
        board.innerHTML = piecesFromFen(game.fen()).map(p => `<div data-square="${p.square}" data-piece="${p.piece}"></div>`).join('');
        document.querySelector('.move-list')!.textContent += ' 7. Nxa8';
    }, 80);
    try {
        const result = await new BoardReader(() => defaults).read(new AbortController().signal);
        const state = new ChessStateManager();
        state.observe(result.observation, result.seedFen, result.seedPgn);
        expect(state.fen).toBe('Nnbq1br1/pp3kpp/4p2n/5p2/2P2P2/5N2/PP1PP1PP/R1BQKB1R b KQ - 0 7');
        expect(background).not.toHaveBeenCalled();
    } finally { clearTimeout(finish); }
});
it('Stop interrupts capture settling before any provider request or observation commit', async () => {
    pageFixture('', []);
    const board = document.querySelector('section')!;
    board.insertAdjacentHTML('beforeend', '<div data-piece="N" data-square="a8"></div>');
    const abort = new AbortController();
    const stop = setTimeout(() => abort.abort(new DOMException('Stopped', 'AbortError')), 40);
    try {
        await expect(new BoardReader(() => defaults).read(abort.signal)).rejects.toThrow(/Stopped/);
        expect(background).not.toHaveBeenCalled();
    } finally { clearTimeout(stop); }
});
it('waits for square geometry to reach its destination even when the DOM tokens already changed', async () => {
    const { game } = pageFixture('<div class="move-list">1. e4 e5</div>');
    const pawn = document.querySelector('[data-square="e4"]')!;
    let settled = false;
    pawn.getBoundingClientRect = () => ({ x: 200, y: settled ? 200 : 300, width: 50, height: 50 } as DOMRect);
    const finish = setTimeout(() => { settled = true; }, 80);
    try {
        const result = await new BoardReader(() => defaults).read(new AbortController().signal);
        expect(settled).toBe(true);
        expect(result.observation.pieces).toEqual(piecesFromFen(game.fen()));
        expect(background).not.toHaveBeenCalled();
    } finally { clearTimeout(finish); }
});
it('bounds persistent piece overlaps without spending provider calls', async () => {
    vi.useFakeTimers();
    try {
        pageFixture('', []);
        document.querySelector('section')!.insertAdjacentHTML('beforeend', '<div data-piece="N" data-square="a8"></div>');
        const assertion = expect(new BoardReader(() => defaults).read(new AbortController().signal)).rejects.toThrow(/settle|overlap|animation/i);
        await Promise.all([vi.advanceTimersByTimeAsync(5500), assertion]);
        expect(background).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
});
it('rechecks a capture that starts during asynchronous parser-cache access', async () => {
    const { game } = pageFixture('<div class="move-list">1. e4 e5</div>');
    const board = document.querySelector('section')!;
    let changed = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    vi.stubGlobal('chrome', { storage: { local: {
        get: async () => {
            if (!changed) {
                changed = true;
                board.insertAdjacentHTML('beforeend', '<div data-square="e4" data-piece="p"></div>');
                timers.push(setTimeout(() => {
                    game.move('Nf3'); game.move('Nc6');
                    board.innerHTML = piecesFromFen(game.fen()).map(p => `<div data-square="${p.square}" data-piece="${p.piece}"></div>`).join('');
                    document.querySelector('.move-list')!.textContent += ' 2. Nf3 Nc6';
                }, 80));
            }
            return {};
        }, set: async () => {}, remove: async () => {}
    } } });
    try {
        const result = await new BoardReader(() => defaults).read(new AbortController().signal);
        const state = new ChessStateManager();
        state.observe(result.observation, result.seedFen, result.seedPgn);
        expect(state.fen).toBe('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
        expect(background).not.toHaveBeenCalled();
    } finally { timers.forEach(clearTimeout); }
});
it('waits for delayed public history instead of returning a stable but contradictory snapshot',async()=>{
    const {game}=pageFixture('<ol aria-label="Move history"><li>1. <span>e4</span></li></ol>');
    const reader=new BoardReader(()=>defaults);
    setTimeout(()=>{document.querySelector('li')!.innerHTML='1. <span>e4</span> <span>e5</span>';},180);
    const result=await reader.read(new AbortController().signal),state=new ChessStateManager();state.observe(result.observation,result.seedFen,result.seedPgn);
    expect(state.fen).toBe(game.fen());expect(background).not.toHaveBeenCalled();
});
