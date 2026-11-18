import { observationSchema, parserRuleSchema, glyphs, type Orientation, type Rect, type Observation, type ParserRule } from '../../shared/src';
export { gameContext, publicMovePgn, corroboratePgn } from './game-context';
export interface BoardCandidate {
    element: Element;
    rect: Rect;
    score: number;
    reason: string;
}
export function rectOf(e: Element): Rect { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }
export function detectBoards(root: Document | Element): BoardCandidate[] {
    const selector = '[data-chessboard], chess-board, wc-chess-board, [role="grid"], canvas, svg, [class*="chess"], [class*="board"], [id*="board"]';
    const result: BoardCandidate[] = [];
    for (const e of [...root.querySelectorAll(selector)].slice(0, 1000)) {
        const r = rectOf(e);
        if (r.width < 120 || r.height < 120 || Math.abs(r.width / r.height - 1) > .18)
            continue;
        const squares = e.querySelectorAll('[data-square], [class*="square-"]');
        const pieces = e.querySelectorAll('[data-piece], [class*="piece"]');
        const semantic = e.matches('[data-chessboard], chess-board, wc-chess-board');
        let score = (semantic ? 10 : 0) + (squares.length >= 64 ? 8 : squares.length ? 3 : 0) + (pieces.length >= 2 ? 4 : 0) + (e.getAttribute('role') === 'grid' ? 2 : 0) + (/chess/i.test(e.className?.toString() ?? '') ? 4 : 0);
        if (e.tagName.toLowerCase() === 'canvas')
            score += 1;
        if (score === 0)
            continue;
        result.push({ element: e, rect: r, score, reason: `${squares.length} square elements; ${pieces.length} pieces; ${semantic ? 'board marker' : 'geometry candidate'}` });
    }
    return result.sort((a, b) => b.score - a.score).filter((c, i, list) => !list.slice(0, i).some(other => other.score >= c.score && other.element.contains(c.element) && other.rect.width === c.rect.width));
}
export function squareCenter(square: string, r: Rect, orientation: Orientation) { if (!/^[a-h][1-8]$/.test(square))
    throw new Error('Invalid square'); let col = square.charCodeAt(0) - 97, row = 8 - Number(square[1]); if (orientation === 'black') {
    col = 7 - col;
    row = 7 - row;
} return { x: r.x + (col + .5) * r.width / 8, y: r.y + (row + .5) * r.height / 8 }; }
export function pointSquare(x: number, y: number, r: Rect, orientation: Orientation): string { let col = Math.floor((x - r.x) * 8 / r.width), row = Math.floor((y - r.y) * 8 / r.height); if (col < 0 || col > 7 || row < 0 || row > 7)
    throw new Error('Piece outside board'); if (orientation === 'black') {
    col = 7 - col;
    row = 7 - row;
} return String.fromCharCode(97 + col) + (8 - row); }
export function cropCoordinates(r: Rect, viewport: {
    width: number;
    height: number;
}, imageWidth: number, imageHeight: number) { if (r.x < 0 || r.y < 0 || r.x + r.width > viewport.width + 1 || r.y + r.height > viewport.height + 1)
    throw new Error('Board must be fully visible for capture'); const sx = imageWidth / viewport.width, sy = imageHeight / viewport.height; return { x: Math.round(r.x * sx), y: Math.round(r.y * sy), width: Math.round(r.width * sx), height: Math.round(r.height * sy) }; }
const unicode = Object.fromEntries(Object.entries(glyphs).map(([p, g]) => [g, p]));
export function pieceToken(e: Element): string | undefined {
    const data = e.getAttribute('data-piece');
    if (data && /^[PNBRQKpnbrqk]$/.test(data))
        return data;
    const classes = [...e.classList];
    for (const cls of classes) {
        const m = /^([wb])([pnbrqk])$/i.exec(cls);
        if (m)
            return m[1].toLowerCase() === 'w' ? m[2].toUpperCase() : m[2].toLowerCase();
    }
    const label = (e.getAttribute('aria-label') ?? e.getAttribute('alt') ?? '').toLowerCase();
    const match = /\b(white|black)[ -](pawn|knight|bishop|rook|queen|king)\b/.exec(label);
    if (match) {
        const p = ({ pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' } as Record<string, string>)[match[2]];
        return match[1] === 'white' ? p.toUpperCase() : p;
    }
    if (e.children.length === 0) {
        const text = e.textContent?.trim();
        if (text && unicode[text])
            return unicode[text];
    }
    return undefined;
}
function squareToken(e: Element): string | undefined { const data = e.getAttribute('data-square') ?? e.closest('[data-square]')?.getAttribute('data-square'); if (data && /^[a-h][1-8]$/.test(data))
    return data; for (const token of [...e.classList]) {
    const alg = /(?:^|[-_])([a-h][1-8])$/.exec(token);
    if (alg)
        return alg[1];
    const digits = /^square-([1-8])([1-8])$/.exec(token);
    if (digits)
        return String.fromCharCode(96 + Number(digits[1])) + digits[2];
} return undefined; }
export function interfaceElement(element:Element): boolean {
    return !!element.closest('[role="dialog"], dialog, [aria-modal="true"], [data-promotion], [data-promotion-picker], [class*="promotion"], [class*="captured"], [data-captured], [class*="modal"], [class*="popup"]');
}
export function renderedElement(element:Element):boolean {
    const view=element.ownerDocument.defaultView;
    for(let node:Element|null=element;node;node=node.parentElement){
        const style=view?.getComputedStyle(node);
        if(node.hasAttribute('hidden') || style?.display==='none' || /^(hidden|collapse)$/.test(style?.visibility??'') || style?.opacity==='0')return false;
    }
    return true;
}
export function renderedPiece(element: Element, board: Element): boolean {
    if(interfaceElement(element)) return false;
    const view = element.ownerDocument.defaultView;
    for (let node: Element | null = element; node; node = node.parentElement) {
        const style = view?.getComputedStyle(node);
        if (node.hasAttribute('hidden') || style?.display === 'none' || /^(hidden|collapse)$/.test(style?.visibility ?? '')
            || style?.opacity === '0' || style?.getPropertyValue('content-visibility') === 'hidden') return false;
    }
    const r = rectOf(element), bounds = rectOf(board);
    // Measurable off-board pools are not visible chess pieces. Explicit tokens
    // still work when geometry is unavailable (e.g. non-layout DOM fixtures).
    if (r.width > 0 && r.height > 0 && bounds.width > 0 && bounds.height > 0) {
        const x = r.x + r.width / 2, y = r.y + r.height / 2;
        if (x < bounds.x || y < bounds.y || x >= bounds.x + bounds.width || y >= bounds.y + bounds.height) return false;
    }
    return true;
}
/** Generic visible evidence of a moving piece or an unresolved capture overlap. */
export function domTransitionReason(board: Element, orientation: Orientation | null): string | undefined {
    const pendingPromotion=[...board.querySelectorAll('*')].some(e=>pieceToken(e)&&renderedElement(e)&&e.closest('[data-promotion],[data-promotion-picker],[class*="promotion"],[aria-label*="romot"]'));
    if(pendingPromotion)return 'Promotion choice is pending; this is not a complete board position';
    const roots: Element[] = [], squares = new Set<string>();
    for(const animation of board.getAnimations?.({subtree:true})??[]){
        const effect=animation.effect as KeyframeEffect|null;
        const target=effect?.target;
        if(animation.playState==='running' && target instanceof Element && pieceToken(target) && !interfaceElement(target)
            && effect?.getTiming().iterations!==Infinity)return 'Piece animation is still running';
    }
    const bounds = rectOf(board);
    for (const element of [...board.querySelectorAll('*')].slice(0, 4096)) {
        if (roots.some(root => root.contains(element)) || !pieceToken(element) || !renderedPiece(element, board)) continue;
        roots.push(element);
        let square = squareToken(element);
        const r = rectOf(element);
        if (orientation && r.width > 0 && r.height > 0 && bounds.width > 0 && bounds.height > 0) {
            let measured: string;
            try { measured = pointSquare(r.x + r.width / 2, r.y + r.height / 2, bounds, orientation); }
            catch { continue; }
            if (square && square !== measured) return 'Piece geometry has not reached its destination square';
            square ??= measured;
        }
        if (square) {
            if (squares.has(square)) return 'Capture or piece overlap has not settled';
            squares.add(square);
        }
    }
    return undefined;
}
export function parseGeneric(board: Element, orientation: Orientation | null): Observation | null {
    if (!orientation)
        return null;
    const pieces: Observation['pieces'] = [];
    const roots: Element[] = [];
    for (const e of [...board.querySelectorAll('*')].slice(0, 4096)) {
        if (roots.some(root => root.contains(e)))
            continue;
        const piece = pieceToken(e);
        if (!piece || !renderedPiece(e, board))
            continue;
        let square = squareToken(e);
        if (!square) {
            const r = rectOf(e);
            if (r.width <= 0 || r.height <= 0)
                continue;
            try {
                square = pointSquare(r.x + r.width / 2, r.y + r.height / 2, rectOf(board), orientation);
            }
            catch {
                continue;
            }
        }
        pieces.push({ square, piece: piece as Observation['pieces'][number]['piece'] });
        roots.push(e);
    }
    if (!pieces.length)
        return null;
    const parsed = observationSchema.safeParse({ pieces, orientation, sideToMove: null, castlingRights: null, enPassantSquare: null, uncertainSquares: [] });
    return parsed.success ? parsed.data : null;
}
export function parseRule(board: Element, input: ParserRule): Observation {
    const rule = parserRuleSchema.parse(input);
    const nodes = [...board.querySelectorAll(rule.pieceSelector)];
    if (nodes.length > 128)
        throw new Error('Parser selects too many pieces');
    const pieces: Observation['pieces'] = [];
    for (const e of nodes) {
        if(!renderedPiece(e,board))continue;
        const tokens = rule.pieceSource === 'class' ? [...e.classList] : [rule.pieceSource === 'attribute' ? e.getAttribute(rule.pieceAttribute!) ?? '' : e.textContent?.trim() ?? ''];
        const matches = tokens.filter(t => Object.hasOwn(rule.pieceMap, t));
        if (matches.length !== 1)
            throw new Error('Unknown or ambiguous piece token');
        const piece = rule.pieceMap[matches[0]];
        let square: string;
        if (rule.squareSource === 'geometry') {
            const r = rectOf(e);
            square = pointSquare(r.x + r.width / 2, r.y + r.height / 2, rectOf(board), rule.orientation);
        }
        else {
            const target = rule.squareSource === 'attribute' ? (e.getAttribute(rule.squareAttribute!) ?? e.closest(`[${rule.squareAttribute}]`)?.getAttribute(rule.squareAttribute!) ?? '') : e.className.toString();
            const m = rule.squareFormat === 'algebraic' ? /(?:^|[\s_-])([a-h][1-8])(?:$|\s)/.exec(target) : /(?:^|\s)(?:square-)?([1-8])([1-8])(?:$|\s)/.exec(target);
            if (!m)
                throw new Error('Missing square token');
            square = rule.squareFormat === 'algebraic' ? m[1] : String.fromCharCode(96 + Number(m[1])) + m[2];
        }
        pieces.push({ square, piece });
    }
    return observationSchema.parse({ pieces, orientation: rule.orientation, sideToMove: null, castlingRights: null, enPassantSquare: null, uncertainSquares: [] });
}
export function extractDom(board: Element): string {
    const nodes = [board, ...board.querySelectorAll('*')].filter(e => !interfaceElement(e) && renderedElement(e) && !e.matches('script,style,input,textarea,select,iframe') && !e.closest('script,style')).slice(0, 1024);
    const elements = nodes.map(e => { const style = getComputedStyle(e); const attributes: Record<string, string> = {}; for (const a of [...e.attributes])
        if (/^(class|role|aria-label|viewBox|d|fill|transform|x|y|width|height|data-(square|piece|orientation|chessboard|side-to-move))$/.test(a.name))
            attributes[a.name] = a.value.slice(0, 256); return { tag: e.tagName.toLowerCase(), attributes, text: e.children.length === 0 && (pieceToken(e) || /^[a-h1-8]$/.test(e.textContent?.trim() ?? '')) ? e.textContent?.slice(0, 32) : undefined, rect: rectOf(e), style: { transform: style.transform, position: style.position, backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage === 'none' ? 'none' : 'present' } }; });
    let payload = JSON.stringify({ board: rectOf(board), elements });
    while (payload.length > 100000 && elements.length) {
        elements.splice(Math.floor(elements.length * .8));
        payload = JSON.stringify({ board: rectOf(board), elements });
    }
    return payload;
}
export function structuralFingerprint(board: Element) { return [board.tagName, board.className.toString(), ...new Set(Array.from(board.querySelectorAll('*')).slice(0, 1024).map(e => [e.tagName, ...[...e.attributes].map(a => a.name).sort()].join(':')))].join('|'); }
export function orientationOf(board: Element): Orientation | null { const hint = board.getAttribute('data-orientation'); if (hint === 'white' || hint === 'black')
    return hint; const cls = board.className.toString(); if (/\b(flipped|black-bottom)\b/.test(cls))
    return 'black'; const square = board.querySelector('[data-square="a1"]'); if (square) {
    const r = rectOf(square), b = rectOf(board);
    if (r.width > 0)
        return r.y > b.y + b.height / 2 ? 'white' : 'black';
}
    const bounds = rectOf(board);
    if (bounds.width <= 0 || bounds.height <= 0)
        return null;
    const visible = (element: Element) => {
        for (let node: Element | null = element; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (node.hasAttribute('hidden') || style.display === 'none' || /^(hidden|collapse)$/.test(style.visibility)
                || style.opacity !== '' && Number(style.opacity) === 0 || style.contentVisibility === 'hidden')
                return false;
        }
        return true;
    };
    const labels: Array<{ label: string; x: number; y: number }> = [];
    for (const node of [...board.querySelectorAll('text,span,div')].slice(0, 2048)) {
        const label = node.textContent?.trim() ?? '';
        if (node.children.length || !/^[a-h1-8]$/.test(label) || !visible(node))
            continue;
        let piece = false;
        for (let parent: Element | null = node; parent && parent !== board; parent = parent.parentElement)
            if (pieceToken(parent)) { piece = true; break; }
        if (piece)
            continue;
        const r = rectOf(node);
        let x: number, y: number;
        if (r.width > 0 && r.height > 0) {
            x = (r.x + r.width / 2 - bounds.x) / bounds.width;
            y = (r.y + r.height / 2 - bounds.y) / bounds.height;
        }
        else {
            // SVG user coordinates can establish geometry when text rectangles
            // are unavailable, but cannot describe unmeasured transforms.
            const svg = node.closest('svg');
            if (!svg || node.tagName.toLowerCase() !== 'text')
                continue;
            let transformed = false;
            for (let parent: Element | null = node; parent; parent = parent.parentElement) {
                const transform = getComputedStyle(parent).transform;
                if (parent.hasAttribute('transform') || transform && transform !== 'none')
                    transformed = true;
            }
            const viewBox = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
            const localX = node.getAttribute('x') ?? '', localY = node.getAttribute('y') ?? '';
            if (transformed || !viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite)
                || viewBox[2] <= 0 || viewBox[3] <= 0 || Math.abs(viewBox[2] / viewBox[3] - 1) > .18
                || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(localX) || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(localY))
                continue;
            x = (Number(localX) - viewBox[0]) / viewBox[2];
            y = (Number(localY) - viewBox[1]) / viewBox[3];
            const viewport = rectOf(svg);
            if (viewport.width > 0 && viewport.height > 0) {
                if (viewport.width < bounds.width * .85 || viewport.height < bounds.height * .85)
                    continue;
                x = (viewport.x + x * viewport.width - bounds.x) / bounds.width;
                y = (viewport.y + y * viewport.height - bounds.y) / bounds.height;
            }
        }
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1)
            labels.push({ label, x, y });
    }
    const files = labels.filter(p => /^[a-h]$/.test(p.label) && (p.y < .15 || p.y > .85));
    const ranks = labels.filter(p => /^[1-8]$/.test(p.label) && (p.x < .15 || p.x > .85));
    const fileNames = new Set(files.map(p => p.label)), rankNames = new Set(ranks.map(p => p.label));
    if (fileNames.size < 3 || rankNames.size < 3 || !fileNames.has('a') || !fileNames.has('h') || !rankNames.has('1') || !rankNames.has('8'))
        return null;
    const ordered = (items: typeof labels, axis: 'x' | 'y', direction: number) => {
        const groups = new Map<number, number[]>();
        for (const point of items) {
            const index = axis === 'x' ? point.label.charCodeAt(0) - 97 : Number(point.label) - 1;
            const group = groups.get(index) ?? [];
            group.push(point[axis] * direction);
            groups.set(index, group);
        }
        const entries = [...groups].sort((a, b) => a[0] - b[0]);
        return entries.every(([index, positions], i) => Math.max(...positions) - Math.min(...positions) < .06
            && (i === 0 || Math.min(...positions) - Math.max(...entries[i - 1][1]) > .05 * (index - entries[i - 1][0])));
    };
    const matching = (['white', 'black'] as const).filter(orientation =>
        files.every(p => { const file = p.label.charCodeAt(0) - 97; return Math.abs(p.x - ((orientation === 'white' ? file : 7 - file) + .5) / 8) < .09; })
        && ranks.every(p => { const rank = Number(p.label); return Math.abs(p.y - ((orientation === 'white' ? 8 - rank : rank - 1) + .5) / 8) < .09; })
        && ordered(files, 'x', orientation === 'white' ? 1 : -1) && ordered(ranks, 'y', orientation === 'white' ? -1 : 1));
    return matching.length === 1 ? matching[0] : null;
}
export function publicFen(): string | undefined { const node = document.querySelector('[data-chess-fen], [data-fen], [aria-label="FEN"]'); const value = node?.getAttribute('data-chess-fen') ?? node?.getAttribute('data-fen') ?? node?.textContent; return value?.trim().match(/(?:[prnbqkPRNBQK1-8]+\/){7}[prnbqkPRNBQK1-8]+ [wb] (?:-|K?Q?k?q?) (?:-|[a-h][36]) \d+ \d+/)?.[0]; }
export function publicPgn(): string | undefined { const node = document.querySelector('[data-chess-pgn], [data-pgn], [aria-label="PGN"]'); const value = node?.getAttribute('data-chess-pgn') ?? node?.getAttribute('data-pgn') ?? node?.textContent; return value && value.length <= 50000 ? value.trim() : undefined; }

/** Geometry only: never read form values when preparing visual evidence. */
export function formRedactions(region:Rect):Rect[]{
    const fields=[...document.querySelectorAll('input,textarea,[contenteditable="true"]')].filter(renderedElement).map(rectOf).filter(r=>r.width>0&&r.height>0&&r.x<region.x+region.width&&r.x+r.width>region.x&&r.y<region.y+region.height&&r.y+r.height>region.y);
    if(fields.length>256)throw new Error('Too many form fields to mask; screenshot refused');
    return fields;
}
