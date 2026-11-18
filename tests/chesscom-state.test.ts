// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_POSITION } from 'chess.js';
import { readChesscomState } from '../apps/extension/src/parsing/chesscom-state';

beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    vi.spyOn(document, 'URL', 'get').mockReturnValue('https://www.chess.com/analysis');
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, width: 400, height: 400 } as DOMRect);
});
function fixture(fen = DEFAULT_POSITION, pgn = '') {
    document.body.innerHTML = '<wc-chess-board id="board-analysis-board"></wc-chess-board><wc-move-list board-id="board-analysis-board"></wc-move-list><div class="game-controls-secondary-more"><button><svg data-glyph="mark-ellipsis-horizontal"></svg></button></div>';
    const board = document.querySelector('wc-chess-board')!;
    const more = document.querySelector('button')!;
    let menuClicks = 0, shareClicks = 0, closes = 0;
    const openDialog = () => {
        const dialog = document.createElement('dialog');
        dialog.setAttribute('open', '');
        dialog.innerHTML = '<header class="share-menu-modal-header"><button aria-label="Close"></button></header><div class="share-menu-tab-pgn-component"><label for="share-fen">FEN</label><input id="share-fen" readonly><textarea aria-label="PGN" readonly></textarea></div>';
        dialog.querySelector('input')!.value = fen;
        dialog.querySelector('textarea')!.value = pgn;
        dialog.querySelector('button')!.onclick = () => { closes++; dialog.remove(); };
        document.body.append(dialog);
    };
    more.onclick = () => {
        menuClicks++;
        const existing = document.querySelector('.game-controls-more-menu-component');
        if (existing) { existing.remove(); return; }
        const menu = document.createElement('div');
        menu.className = 'game-controls-more-menu-component';
        menu.innerHTML = '<button><svg data-glyph="graph-nodes-share"></svg><span>Share Game</span></button>';
        menu.querySelector('button')!.onclick = () => { shareClicks++; menu.remove(); openDialog(); };
        document.body.append(menu);
    };
    return { board, more, openDialog, get menuClicks() { return menuClicks; }, get shareClicks() { return shareClicks; }, get closes() { return closes; } };
}
it('reads complete state from its public export dialog and restores the UI', async () => {
    const f = fixture();
    await expect(readChesscomState(f.board, new AbortController().signal)).resolves.toEqual({ seedFen: DEFAULT_POSITION });
    expect(f.shareClicks).toBe(1);
    expect(f.closes).toBe(1);
    expect(document.querySelector('dialog, .game-controls-more-menu-component')).toBeNull();
});
it('retains evidenced PGN only after strict replay agrees with the exported FEN', async () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const f = fixture(fen, '1. e4 e5 *');
    await expect(readChesscomState(f.board, new AbortController().signal)).resolves.toEqual({ seedFen: fen, seedPgn: '1. e4 e5 *' });
    expect(f.closes).toBe(1);
});
it.each(['https://example.com/analysis', 'https://www.chess.com/member/player', 'http://www.chess.com/analysis'])('does not invoke export controls on %s', url => {
    const f = fixture();
    vi.spyOn(document, 'URL', 'get').mockReturnValue(url);
    return expect(readChesscomState(f.board, new AbortController().signal)).resolves.toBeUndefined().then(() => expect(f.menuClicks).toBe(0));
});
it.each(['/play/computer', '/play/online', '/game/live/123456'])('allows %s only with the same board-linked public export controls', async path => {
    const f = fixture();
    vi.spyOn(document, 'URL', 'get').mockReturnValue('https://www.chess.com' + path);
    await expect(readChesscomState(f.board, new AbortController().signal)).resolves.toEqual({ seedFen: DEFAULT_POSITION });
    expect(f.shareClicks).toBe(1);
});
it('does not hijack a preexisting dialog, consent prompt, or action menu', async () => {
    for (const blocker of ['<dialog open><button>Existing</button></dialog>', '<div id="onetrust-banner-sdk"><button>Reject All</button></div>', '<div class="game-controls-more-menu-component"><button>Share Game</button></div>']) {
        const f = fixture();
        document.body.insertAdjacentHTML('beforeend', blocker);
        await expect(readChesscomState(f.board, new AbortController().signal)).resolves.toBeUndefined();
        expect(f.menuClicks).toBe(0);
    }
});
it('rejects incomplete, oversized or contradictory export values and closes its dialog', async () => {
    for (const [fen, pgn] of [[DEFAULT_POSITION.split(' ')[0], ''], [DEFAULT_POSITION, 'x'.repeat(50001)], [DEFAULT_POSITION, '1. e4 *']]) {
        const f = fixture(fen, pgn);
        await expect(readChesscomState(f.board, new AbortController().signal)).rejects.toThrow();
        expect(f.closes).toBe(1);
    }
});
it('Stop closes its own menu and prevents later export clicks', async () => {
    const f = fixture();
    const abort = new AbortController();
    f.more.addEventListener('click', () => abort.abort(new DOMException('Stopped', 'AbortError')));
    await expect(readChesscomState(f.board, abort.signal)).rejects.toThrow(/Stopped/);
    expect(f.shareClicks).toBe(0);
    expect(document.querySelector('.game-controls-more-menu-component')).toBeNull();
});
it('Stop after opening the dialog closes only its own export UI', async () => {
    const f = fixture();
    const abort = new AbortController();
    f.more.addEventListener('click', () => document.querySelector('.game-controls-more-menu-component button')!.addEventListener('click', () => abort.abort(new DOMException('Stopped', 'AbortError'))));
    await expect(readChesscomState(f.board, abort.signal)).rejects.toThrow(/Stopped/);
    expect(f.closes).toBe(1);
    expect(document.querySelector('dialog')).toBeNull();
});
it('closes its late-opening export after Stop while preserving an unrelated modal', async () => {
    const f = fixture();
    const abort = new AbortController();
    f.more.addEventListener('click', () => {
        const share = document.querySelector<HTMLButtonElement>('.game-controls-more-menu-component button')!;
        share.onclick = () => {
            document.querySelector('.game-controls-more-menu-component')!.remove();
            document.body.insertAdjacentHTML('beforeend', '<dialog open id="unrelated"><button aria-label="Close">User dialog</button></dialog>');
            setTimeout(f.openDialog, 10);
            abort.abort(new DOMException('Stopped', 'AbortError'));
        };
    });
    await expect(readChesscomState(f.board, abort.signal)).rejects.toThrow(/Stopped/);
    expect(f.closes).toBe(1);
    expect(document.querySelector('#unrelated')).not.toBeNull();
    expect(document.querySelector('.share-menu-tab-pgn-component')).toBeNull();
});
it('bounds an unavailable export wait and does not read unrelated editable fields', async () => {
    vi.useFakeTimers();
    try {
        const f = fixture();
        f.more.addEventListener('click', () => {
            document.querySelector<HTMLButtonElement>('.game-controls-more-menu-component button')!.onclick = () => {
                document.querySelector('.game-controls-more-menu-component')!.remove();
                f.openDialog();
                document.querySelector('input#share-fen')!.removeAttribute('readonly');
            };
        });
        const pending = readChesscomState(f.board, new AbortController().signal);
        const assertion = expect(pending).rejects.toThrow(/export did not become available/);
        await vi.advanceTimersByTimeAsync(4100);
        await assertion;
        expect(f.closes).toBe(1);
        expect(document.querySelector('dialog')).toBeNull();
    } finally { vi.useRealTimers(); }
});
it('requires the selected custom board and its matching public move list', async () => {
    const f = fixture();
    document.querySelector('wc-move-list')!.setAttribute('board-id', 'different-board');
    await expect(readChesscomState(f.board, new AbortController().signal)).resolves.toBeUndefined();
    expect(f.menuClicks).toBe(0);
});
it('waits for late public controls without guessing state or clicking other controls',async()=>{
    const f=fixture(),container=f.more.parentElement!;container.remove();
    setTimeout(()=>document.body.append(container),80);
    await expect(readChesscomState(f.board,new AbortController().signal)).resolves.toEqual({seedFen:DEFAULT_POSITION});
    expect(f.shareClicks).toBe(1);
});
it('initializes a new bot game from its board-linked Download export without assuming starting rights',async()=>{
    const evidence=await import('./fixtures/chesscom-bot-export.json');
    const f=fixture(evidence.fen,evidence.pgn);
    const open=f.openDialog;
    document.body.innerHTML=evidence.board+evidence.moveList+evidence.controls;
    vi.spyOn(document,'URL','get').mockReturnValue(evidence.source);
    document.querySelector<HTMLButtonElement>('button[aria-label="Download"]')!.onclick=open;
    const result=await readChesscomState(document.querySelector('wc-chess-board')!,new AbortController().signal);
    expect(result).toEqual({seedFen:evidence.fen,seedPgn:evidence.pgn});expect(f.closes).toBe(1);
});
