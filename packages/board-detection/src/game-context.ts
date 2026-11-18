import { Chess } from 'chess.js';

const MAX_CONTEXT = 20000;
const MAX_SOURCE_TEXT = 18000;
const MAX_SOURCES = 16;
const MAX_NODES = 4096;
const MAX_PLIES = 1000;
const excludedTags = 'script, style, form, input, textarea, select, option, iframe, object, embed, template, noscript';
const privateHint = /\b(?:account|profile|chat|comment|message|private|password|credential|email|login|contact|billing)\b/i;
const historyHint = /\b(?:moves? (?:history|list|record|notation)|(?:chess|game) (?:moves?|history|record|notation)|notation|pgn)\b/i;
const emptyHistory = /^(?:no moves(?: yet)?|no moves (?:have been )?played|move history is empty|empty move history)[.!]?$/i;
const notationText = /^[a-hKQRBNOPx0-9\s.?!+#=:/()\[\]{}*,;\-–—…♔♕♖♗♘♙♚♛♜♝♞♟]+$/u;
const figurines: Record<string, string> = { '♔': 'K', '♚': 'K', '♕': 'Q', '♛': 'Q', '♖': 'R', '♜': 'R', '♗': 'B', '♝': 'B', '♘': 'N', '♞': 'N', '♙': '', '♟': '' };

interface HistorySource {
    index: number;
    tag: string;
    evidence: 'move-history';
    text: string;
    truncated: boolean;
}
interface HistoryContext {
    version: 1;
    sources: HistorySource[];
    truncated: boolean;
}

function hint(element: Element): string {
    return [element.tagName.toLowerCase(), element.getAttribute('aria-label'), element.getAttribute('id'), element.getAttribute('class')]
        .filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
}

function visible(element: Element): boolean {
    const view = element.ownerDocument.defaultView;
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.matches(excludedTags) || ancestor.hasAttribute('hidden') || ancestor.getAttribute('aria-hidden') === 'true' || privateHint.test(hint(ancestor))) return false;
        const style = view?.getComputedStyle(ancestor);
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0' || style.getPropertyValue('content-visibility') === 'hidden')) return false;
    }
    return true;
}

function textOf(root: Element): { text: string; truncated: boolean } {
    const parts: string[] = [];
    let size = 0, visited = 0, truncated = false;
    const append = (text: string) => {
        const normalized = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
        // Accept only notation-shaped text or an explicit empty-history statement.
        // Arbitrary prose and all attributes are deliberately omitted.
        if (!normalized || (!notationText.test(normalized) && !emptyHistory.test(normalized))) return;
        const remaining = MAX_SOURCE_TEXT - size;
        if (normalized.length + 1 > remaining) truncated = true;
        if (remaining > 0) {
            parts.push(normalized.slice(0, remaining));
            size += normalized.length + 1;
        }
    };
    const visit = (node: Node) => {
        if (++visited > MAX_NODES) { truncated = true; return; }
        if (node.nodeType === 3) { append(node.textContent ?? ''); return; }
        if (node.nodeType !== 1) return;
        const element = node as Element;
        if (!visible(element)) {
            // A hidden figurine cannot be silently erased: its visible SAN
            // tail might otherwise become a different legal pawn move.
            if (element.hasAttribute('data-figurine') || element.querySelector('[data-figurine]')) truncated = true;
            return;
        }
        if (element.tagName.toLowerCase() === 'li' && element.parentElement?.tagName.toLowerCase() === 'ol') {
            const list = element.parentElement;
            const siblings = [...list.children].filter(child => child.tagName.toLowerCase() === 'li');
            const start = Number(list.getAttribute('start') ?? 1);
            const position = siblings.indexOf(element);
            const number = Number(element.getAttribute('value') ?? (start + (list.hasAttribute('reversed') ? -position : position)));
            // Native ordered-list markers are visible numbering, even though they
            // are absent from textContent. Explicit row numbering takes precedence.
            const listStyle = list.ownerDocument.defaultView?.getComputedStyle(list);
            const rowStyle = element.ownerDocument.defaultView?.getComputedStyle(element);
            const decimal = (!list.hasAttribute('type') || list.getAttribute('type') === '1')
                && (!listStyle?.listStyleType || listStyle.listStyleType === 'decimal')
                && (!rowStyle?.listStyleType || rowStyle.listStyleType === 'decimal')
                && (!rowStyle?.display || rowStyle.display === 'list-item');
            if (!/^\s*\d+\s*\./.test(element.textContent ?? '') && decimal) append(`${number}.`);
            if (list.hasAttribute('reversed') || !Number.isSafeInteger(number) || number < 1) truncated = true;
        }
        let textRun = '', pendingFigurine: string | undefined;
        const flushText = () => {
            if (pendingFigurine !== undefined) {
                const tail = textRun.trimStart();
                // Bind only to the following text run in this same wrapper.
                // A separate element/cell is a boundary, never a guessed ply.
                if (/^[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?[!?]*(?:\s|$)/.test(tail)) {
                    append(pendingFigurine + tail);
                } else {
                    truncated = true;
                    if (textRun) append(textRun);
                }
                pendingFigurine = undefined;
            } else if (textRun) append(textRun);
            textRun = '';
        };
        for (const child of element.childNodes) {
            // Adjacent text nodes render as one text run. React may split a
            // marker such as "1." or SAN such as "e4" across those nodes;
            // introducing spaces between them changes the visible evidence.
            if (child.nodeType === 3 || child.nodeType === 8) {
                if (++visited > MAX_NODES) { truncated = true; break; }
                if (child.nodeType === 3) {
                    const text = child.textContent ?? '';
                    const remaining = MAX_SOURCE_TEXT + 1 - textRun.length;
                    if (text.length > remaining) truncated = true;
                    if (remaining > 0) textRun += text.slice(0, remaining);
                }
            } else {
                flushText();
                if (child.nodeType === 1 && (child as Element).hasAttribute('data-figurine')) {
                    const icon = child as Element;
                    visited += 1 + icon.querySelectorAll('*').length;
                    const piece = icon.getAttribute('data-figurine') ?? '';
                    const renderedText = icon.textContent?.trim() ?? '';
                    const symbol = piece === 'P' ? '' : piece;
                    if (visited > MAX_NODES || !visible(icon) || !/^[KQRBNP]$/.test(piece)
                        || renderedText && !(renderedText === piece || renderedText.length === 1 && figurines[renderedText] === symbol)) {
                        truncated = true;
                    } else {
                        pendingFigurine = symbol;
                    }
                } else visit(child);
            }
            if (visited > MAX_NODES || size > MAX_SOURCE_TEXT) break;
        }
        flushText();
    };
    visit(root);
    return { text: parts.join(' ').trim(), truncated };
}

function extractContext(root: Document): HistoryContext | undefined {
    const nodes = [...root.querySelectorAll('*')];
    const candidates = nodes.slice(0, MAX_NODES).filter(element => historyHint.test(hint(element))
        && !/\b(?:row|item|ply|cell|entry)\b/i.test(hint(element)) && visible(element));
    for (const candidate of [...candidates]) {
        for (const list of [...candidate.querySelectorAll('ol, ul, table, [role="list"], [role="table"]')].slice(0, MAX_NODES)) {
            if (visible(list) && !candidates.includes(list)) candidates.push(list);
        }
    }
    // Use the innermost relevant container: a wrapping panel and its list are a
    // single source, while independent lists remain separate evidence records.
    const independent = candidates.filter(element => !candidates.some(other => other !== element && element.contains(other)));
    const sources: HistorySource[] = [];
    for (const [index, element] of independent.slice(0, MAX_SOURCES).entries()) {
        const extracted = textOf(element);
        const emptyLabel = /^(?:move history|move list|game notation):\s*(.+)$/i.exec(element.getAttribute('aria-label') ?? '');
        if (!extracted.text && emptyLabel && emptyHistory.test(emptyLabel[1])) extracted.text = 'No moves yet';
        if (!extracted.text) continue;
        sources.push({ index, tag: element.tagName.toLowerCase(), evidence: 'move-history', ...extracted });
    }
    if (!sources.length) return undefined;
    const context: HistoryContext = { version: 1, sources, truncated: nodes.length > MAX_NODES || independent.length > MAX_SOURCES };
    while (JSON.stringify(context).length > MAX_CONTEXT) {
        context.truncated = true;
        const largest = sources.reduce((a, b) => a.text.length > b.text.length ? a : b);
        largest.truncated = true;
        largest.text = largest.text.slice(0, Math.floor(largest.text.length * .8));
    }
    return context;
}

/** Bounded visible notation evidence, with each independent history kept separate. */
export function gameContext(root: Document = document): string | undefined {
    const context = extractContext(root);
    return context ? JSON.stringify(context) : undefined;
}

function normalizeHistory(text: string): string | undefined {
    if (!text || text.length > MAX_SOURCE_TEXT) return undefined;
    const normalized = text.replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, value => figurines[value]).replace(/\s+/g, ' ').trim();
    if (!normalized.startsWith('1.')) return undefined;
    // SAN contains rank digits, so split at numbered white-move markers instead
    // of attempting to infer numbers from the legality of later moves.
    const markers = [...normalized.matchAll(/(?:^|\s)(\d+)\.(?!\.)\s*/g)];
    if (!markers.length || markers.length > MAX_PLIES / 2) return undefined;
    const chess = new Chess();
    const moves: string[] = [];
    let ended = false;
    for (let row = 0; row < markers.length; row++) {
        const marker = markers[row];
        if (Number(marker[1]) !== row + 1 || marker[1] !== String(row + 1)) return undefined;
        const begin = marker.index! + marker[0].length;
        const end = row + 1 < markers.length ? markers[row + 1].index! : normalized.length;
        const tokens = normalized.slice(begin, end).trim().split(/\s+/);
        const last = row === markers.length - 1;
        if (last && /^(?:1-0|0-1|1\/2-1\/2|\*)$/.test(tokens.at(-1) ?? '')) tokens.pop();
        if (tokens.length !== 2 && !(last && tokens.length === 1)) return undefined;
        for (const raw of tokens) {
            const san = raw.replace(/[!?]+$/, '');
            if (ended || !/^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?$/.test(san)) return undefined;
            try {
                const move = chess.move(san, { strict: true });
                if (move.san !== san) return undefined;
                moves.push(move.san);
                ended = chess.isGameOver();
            } catch { return undefined; }
        }
    }
    if (!moves.length || moves.length > MAX_PLIES) return undefined;
    return moves.map((move, index) => index % 2 === 0 ? `${index / 2 + 1}. ${move}` : move).join(' ');
}

function consistentHistory(context: HistoryContext): string | undefined {
    if (context.truncated || !context.sources.length || context.sources.length > MAX_SOURCES) return undefined;
    let history: string | undefined;
    for (const source of context.sources) {
        if (source.truncated || typeof source.text !== 'string') return undefined;
        const normalized = normalizeHistory(source.text);
        if (!normalized || (history !== undefined && normalized !== history)) return undefined;
        history = normalized;
    }
    return history;
}

/** Complete numbered standard SAN only; empty or ambiguous evidence is rejected. */
export function publicMovePgn(root: Document = document): string | undefined {
    const context = extractContext(root);
    return context ? consistentHistory(context) : undefined;
}

/** Require exactly the entire visible sequence; board agreement alone is insufficient. */
export function corroboratePgn(pgn: string, context: string): boolean {
    if (typeof context !== 'string' || context.length > MAX_CONTEXT) return false;
    try {
        const parsed = JSON.parse(context) as HistoryContext;
        if (parsed.version !== 1 || !Array.isArray(parsed.sources) || typeof parsed.truncated !== 'boolean' || parsed.sources.some(source => !source || source.evidence !== 'move-history' || typeof source.truncated !== 'boolean')) return false;
        const history = consistentHistory(parsed);
        return history !== undefined && normalizeHistory(pgn) === history;
    } catch { return false; }
}
