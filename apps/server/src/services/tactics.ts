import { Chess, type Color, type Move, type Square } from 'chess.js';
import { moveUci } from '../../../../packages/chess-core/src';

/**
 * Rule-level tactical facts: attack/defence counts and one-ply consequences.
 * These are arithmetic over the board, not a strategic ranking; Jev still decides.
 * Pins and x-ray attacks are ignored, so counts are geometric approximations.
 */
const value: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const names: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export interface HangingPiece { square: Square; piece: string; value: number; attackers: number; defenders: number; cheapestAttacker: number }

/** A piece is exposed when attacked and either undefended or attacked by a cheaper piece. */
export function exposedPieces(game: Chess, color: Color): HangingPiece[] {
    const out: HangingPiece[] = [];
    for (const p of game.board().flat()) {
        if (!p || p.color !== color || p.type === 'k') continue;
        const attackers = game.attackers(p.square, other(color));
        if (!attackers.length) continue;
        const defenders = game.attackers(p.square, color);
        const cheapest = Math.min(...attackers.map(s => value[game.get(s)!.type] || 100));
        if (defenders.length && cheapest >= value[p.type]) continue;
        out.push({ square: p.square, piece: p.type, value: value[p.type], attackers: attackers.length, defenders: defenders.length, cheapestAttacker: cheapest });
    }
    return out.sort((a, b) => b.value - a.value || a.square.localeCompare(b.square));
}

const label = (h: HangingPiece) => `${names[h.piece]} on ${h.square} (attacked ${h.attackers}x, defended ${h.defenders}x)`;
export const describeExposed = (list: HangingPiece[]) => list.map(label);

export interface MoveFacts {
    givesMate: boolean;
    capturedValue: number;
    opponentMatesInOne: string[];
    yourExposedAfter: HangingPiece[];
    /** Highest value among your pieces still or newly exposed after the move. */
    exposedValue: number;
    largestOpponentCapture: { san: string; value: number; recapturePossible: boolean } | null;
    /** Opponent pieces the moved piece attacks from its new square (two or more is a fork). */
    attacks: { square: Square; piece: string; value: number; defended: boolean }[];
}

/** One-ply facts for a candidate. The game is restored before returning. */
export function moveFacts(game: Chess, move: Move): MoveFacts {
    const mover = move.color;
    game.move(move);
    try {
        const givesMate = game.isCheckmate();
        const replies = givesMate || game.isGameOver() ? [] : game.moves({ verbose: true });
        const opponentMatesInOne: string[] = [];
        let largest: MoveFacts['largestOpponentCapture'] = null;
        for (const r of replies) {
            if (r.captured && (!largest || value[r.captured] > largest.value)) {
                game.move(r);
                const recapturePossible = game.moves({ verbose: true }).some(x => x.to === r.to);
                game.undo();
                largest = { san: r.san, value: value[r.captured], recapturePossible };
            }
            if (r.san.endsWith('#')) opponentMatesInOne.push(r.san);
        }
        const attacks: MoveFacts['attacks'] = [];
        for (const p of game.board().flat()) {
            if (!p || p.color === mover || !game.attackers(p.square, mover).includes(move.to)) continue;
            attacks.push({ square: p.square, piece: p.type, value: p.type === 'k' ? 100 : value[p.type], defended: game.attackers(p.square, other(mover)).length > 0 });
        }
        attacks.sort((a, b) => b.value - a.value || a.square.localeCompare(b.square));
        const exposed = exposedPieces(game, mover);
        const exposedValue = exposed.reduce((n, h) => Math.max(n, h.value), 0);
        return { givesMate, capturedValue: move.captured ? value[move.captured] : 0, opponentMatesInOne: opponentMatesInOne.slice(0, 3), yourExposedAfter: exposed, exposedValue, largestOpponentCapture: largest, attacks };
    } finally { game.undo(); }
}

export function factsText(f: MoveFacts): string {
    if (f.givesMate) return ' Tactical facts: this move is checkmate.';
    const targets = f.attacks.map(a => a.piece === 'k' ? 'king (check)' : `${names[a.piece]} on ${a.square} (${a.defended ? 'defended' : 'undefended'})`);
    const parts = [
        targets.length ? `The moved piece then attacks: ${targets.join(', ')}${targets.length >= 2 ? ' - that is a double attack' : ''}.` : 'The moved piece attacks no opponent piece afterwards.',
        f.opponentMatesInOne.length ? `Opponent then has mate in one: ${f.opponentMatesInOne.join(', ')}.` : 'Opponent has no mate in one afterwards.',
        f.yourExposedAfter.length ? `Your exposed pieces afterwards: ${describeExposed(f.yourExposedAfter).join('; ')}.` : 'None of your pieces are exposed afterwards.',
        f.largestOpponentCapture ? `Largest opponent capture afterwards: ${f.largestOpponentCapture.san} (${f.largestOpponentCapture.value} points, you ${f.largestOpponentCapture.recapturePossible ? 'can' : 'cannot'} recapture on that square).` : 'Opponent has no capture afterwards.',
    ];
    return ` Tactical facts: ${parts.join(' ')}`;
}

/** Warnings worth a second look: allowing mate, or leaving material exposed that this capture does not pay for. */
export function blunderWarnings(game: Chess, uci: string): string[] {
    const move = game.moves({ verbose: true }).find(m => moveUci(m) === uci);
    if (!move) throw new Error('Blunder check move is not legal');
    const f = moveFacts(game, move);
    if (f.givesMate) return [];
    const warnings: string[] = [];
    if (f.opponentMatesInOne.length) warnings.push(`It allows the opponent mate in one (${f.opponentMatesInOne.join(', ')}).`);
    if (f.exposedValue >= 3 && f.exposedValue > f.capturedValue) {
        const worst = f.yourExposedAfter.find(h => h.value === f.exposedValue)!;
        warnings.push(`It leaves your ${names[worst.piece]} on ${worst.square} exposed (attacked ${worst.attackers}x, defended ${worst.defenders}x) while capturing ${f.capturedValue} points.`);
    }
    return warnings;
}

/**
 * Plain-language list of what is wrong right now for `color`: check, opponent mate threats
 * (what the opponent could mate with if it were their move) and exposed pieces.
 */
export function immediateThreats(game: Chess, color: Color): string[] {
    const out: string[] = [];
    if (game.turn() === color && game.isCheck()) out.push('You are in check.');
    else if (game.turn() === color) {
        const f = game.fen().split(' '); f[1] = other(color); f[3] = '-';
        try {
            const pass = new Chess(f.join(' '));
            const mates = pass.moves({ verbose: true }).filter(m => { pass.move(m); const mate = pass.isCheckmate(); pass.undo(); return mate; }).map(m => m.san);
            if (mates.length) out.push(`Opponent threatens mate in one: ${mates.slice(0, 3).join(', ')}.`);
        } catch { /* not a valid position to pass in; no threat information */ }
    }
    for (const h of exposedPieces(game, color)) out.push(`Your ${names[h.piece]} on ${h.square} is exposed (attacked ${h.attackers}x, defended ${h.defenders}x).`);
    return out;
}
