import { Chess } from 'chess.js';
import { verifiedChess } from '../../../../packages/chess-core/src';
import { delay } from '../../../../packages/shared/src';

const active = new WeakSet<Document>();

/** Read only Chess.com's public Share export, never internal game state. */
export async function readChesscomState(board: Element, signal: AbortSignal, unavailable:(reason:string)=>void=()=>{}): Promise<{ seedFen?: string; seedPgn?: string } | undefined> {
    signal.throwIfAborted();
    const doc = board.ownerDocument;
    const url = new URL(doc.URL);
    if (url.protocol !== 'https:' || !['www.chess.com', 'chess.com'].includes(url.hostname)
        || !/^\/(?:analysis(?:\/|$)|play\/(?:computer|online)(?:\/|$)|game\/live\/\d+(?:\/|$))/.test(url.pathname)
        || board.tagName.toLowerCase() !== 'wc-chess-board' || !board.isConnected || !board.id || active.has(doc))
        return;
    const visible = (node: Element) => {
        for (let element: Element | null = node; element; element = element.parentElement) {
            const style = doc.defaultView!.getComputedStyle(element);
            if (element.hasAttribute('hidden') || style.display === 'none' || /^(hidden|collapse)$/.test(style.visibility)
                || style.opacity !== '' && Number(style.opacity) === 0)
                return false;
        }
        const r = node.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };
    const visibleNodes = (selector: string) => [...doc.querySelectorAll(selector)].filter(visible);
    const deadline = Date.now() + 4000;
    const modalSelector = 'dialog[open], [role="dialog"], [aria-modal="true"], #onetrust-banner-sdk';
    let more:HTMLElement|undefined,directExport:HTMLElement|undefined;
    while(!more&&!directExport){
        signal.throwIfAborted();if(!board.isConnected)throw new Error('Board removed while waiting for public controls');
        const blockers=visibleNodes(modalSelector);
        if(blockers.length||visibleNodes('.game-controls-more-menu-component').length){unavailable('Public export obstructed by an existing dialog, consent prompt or menu');return;}
        const boards=visibleNodes('wc-chess-board');
        if(boards.length>1||boards.length===1&&boards[0]!==board){unavailable('Public export board identity is ambiguous');return;}
        const linked=[...doc.querySelectorAll('wc-move-list, wc-simple-move-list')].some(list=>list.getAttribute('board-id')===board.id);
        const controls=visibleNodes('.game-controls-secondary-more button').filter(button=>button.querySelector('svg[data-glyph="mark-ellipsis-horizontal"]'));
        const downloads=url.pathname.startsWith('/play/computer')?visibleNodes('.game-controls-controller-component button[aria-label="Download"]').filter(button=>button.querySelector('svg[data-glyph="arrow-triangle-tray-in-bottom"]')):[];
        if(boards.length===1&&linked&&downloads.length===1&&!downloads[0].hasAttribute('disabled'))directExport=downloads[0] as HTMLElement;
        else if(boards.length===1&&linked&&controls.length===1&&!controls[0].hasAttribute('disabled'))more=controls[0] as HTMLElement;
        else if(Date.now()>=deadline){unavailable('Board-linked public move list or export controls did not become available');return;}
        else await delay(40,signal);
    }
    let menu: Element | undefined, dialog: Element | undefined, menuOpened = false, shareClicked = false;
    const exportDialog = () => visibleNodes('dialog[open]').find(node => node.querySelector('.share-menu-tab-pgn-component'));
    const findOwnedDialog = () => { if (shareClicked && !dialog) dialog = exportDialog(); };
    const waitFor = async <T>(read: () => T | undefined): Promise<T> => {
        while (Date.now() < deadline) {
            signal.throwIfAborted();
            if (!board.isConnected)
                throw new Error('Analysis board changed while reading its public export');
            const value = read();
            if (value !== undefined)
                return value;
            await delay(40, signal);
        }
        throw new Error('Public analysis export did not become available; close overlays and retry');
    };
    const observer = new MutationObserver(findOwnedDialog);
    active.add(doc);
    observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    try {
        if(directExport){
            signal.throwIfAborted();shareClicked=true;directExport.click();findOwnedDialog();
        }else{
        menuOpened = true;
        more!.click();
        menu = await waitFor(() => {
            const menus = visibleNodes('.game-controls-more-menu-component');
            return menus.length === 1 ? menus[0] : undefined;
        });
        if (visibleNodes(modalSelector).length)
            throw new Error('Close the existing page dialog before reading public game state');
        const share = [...menu.querySelectorAll('button')].filter(node => visible(node) && !node.disabled && node.querySelector('svg[data-glyph="graph-nodes-share"]'));
        if (share.length !== 1)
            throw new Error('Public Share Game export control is unavailable');
        signal.throwIfAborted();
        shareClicked = true;
        share[0].click();
        findOwnedDialog();
        }
        dialog = await waitFor(() => { findOwnedDialog(); return dialog; });
        const values = await waitFor(() => {
            const fen = dialog!.querySelector<HTMLInputElement>('input#share-fen[readonly]');
            const pgn = dialog!.querySelector<HTMLTextAreaElement>('textarea[aria-label="PGN"][readonly]');
            return fen && pgn && visible(fen) && visible(pgn) && fen.value.trim() ? { fen: fen.value.trim(), pgn: pgn.value.trim() } : undefined;
        });
        signal.throwIfAborted();
        if (values.fen.length > 120 || values.pgn.length > 50000)
            throw new Error('Public game export exceeds the supported state limit');
        const seedFen = verifiedChess(values.fen).fen();
        if (!values.pgn)
            return { seedFen };
        const game = new Chess();
        game.loadPgn(values.pgn, { strict: true });
        if (verifiedChess(game.fen()).fen() !== seedFen)
            throw new Error('Public PGN export disagrees with its current FEN');
        return { seedFen, seedPgn: values.pgn };
    }
    finally {
        // A stopped Share click may finish opening its dialog on the next UI
        // tick. Observe a short bounded grace period to close only that export.
        if (shareClicked && !dialog) {
            const cleanupDeadline = Date.now() + 240;
            while (!dialog && Date.now() < cleanupDeadline) { findOwnedDialog(); if (!dialog) await delay(20); }
        }
        observer.disconnect();
        if (dialog?.isConnected && visible(dialog)) {
            const close = dialog.querySelector<HTMLButtonElement>('header.share-menu-modal-header button[aria-label="Close"]');
            if (close && !close.disabled && visible(close)) close.click();
        }
        if (menuOpened && more?.isConnected) {
            const remaining = menu ?? visibleNodes('.game-controls-more-menu-component')[0];
            if (remaining?.isConnected && visible(remaining)) more.click();
        }
        active.delete(doc);
    }
}
