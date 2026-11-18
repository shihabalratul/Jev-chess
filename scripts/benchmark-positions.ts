import { Chess } from 'chess.js';
import { verifiedChess } from '../packages/chess-core/src';
import { exposedPieces } from '../apps/server/src/services/tactics';

/**
 * Small fixed tactics set. Every goal is checked mechanically after the move, never by an engine:
 * - mate: the move gives checkmate
 * - capture: the move captures the piece on `target`
 * - specific: the move is one of `moves`
 * - avoid-mate: the opponent has no mate in one afterwards
 * - no-exposed: none of the mover's pieces are exposed afterwards (attacked and undefended or attacked by a cheaper piece)
 * tests/benchmark-positions.test.ts proves each puzzle is legal, solvable, and failable.
 */
export type Goal = { kind: 'mate' } | { kind: 'capture'; target: string } | { kind: 'specific'; moves: string[] } | { kind: 'avoid-mate' } | { kind: 'no-exposed' };
export interface Puzzle { id: string; theme: string; fen: string; goal: Goal }

export const PUZZLES: Puzzle[] = [
    { id: 'back-rank-white', theme: 'mate in one', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', goal: { kind: 'mate' } },
    { id: 'queen-king-mate', theme: 'mate in one', fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', goal: { kind: 'mate' } },
    { id: 'back-rank-black', theme: 'mate in one', fen: 'r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1', goal: { kind: 'mate' } },
    { id: 'smothered', theme: 'mate in one', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', goal: { kind: 'mate' } },
    { id: 'long-queen-mate', theme: 'mate in one', fen: 'k7/8/1K6/8/8/8/7Q/8 w - - 0 1', goal: { kind: 'mate' } },
    { id: 'free-queen', theme: 'win material', fen: '4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1', goal: { kind: 'capture', target: 'd5' } },
    { id: 'free-rook', theme: 'win material', fen: 'r3k3/8/8/8/8/8/8/R3K3 w - - 0 1', goal: { kind: 'capture', target: 'a8' } },
    { id: 'free-bishop-black', theme: 'win material', fen: '4k3/8/8/8/2n5/8/1B6/4K3 b - - 0 1', goal: { kind: 'capture', target: 'b2' } },
    { id: 'knight-fork', theme: 'fork', fen: '4k3/8/8/1q6/4N3/8/8/4K3 w - - 0 1', goal: { kind: 'specific', moves: ['e4d6'] } },
    { id: 'back-rank-defence', theme: 'defend mate', fen: 'r5k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1', goal: { kind: 'avoid-mate' } },
    { id: 'queen-attacked-by-pawn', theme: 'save piece', fen: '4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1', goal: { kind: 'no-exposed' } },
    { id: 'promote', theme: 'promotion', fen: '7k/P7/8/8/8/8/8/7K w - - 0 1', goal: { kind: 'specific', moves: ['a7a8q', 'a7a8r'] } },
];

export function solves(puzzle: Puzzle, uci: string): boolean {
    const game = verifiedChess(puzzle.fen), mover = game.turn();
    const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    const g = puzzle.goal;
    switch (g.kind) {
        case 'mate': return game.isCheckmate();
        case 'capture': return move.to === g.target && !!move.captured;
        case 'specific': return g.moves.includes(uci);
        case 'avoid-mate': return !opponentMatesInOne(game);
        case 'no-exposed': return exposedPieces(game, mover).length === 0;
    }
}
function opponentMatesInOne(game: Chess) {
    return game.moves({ verbose: true }).some(m => { game.move(m); const mate = game.isCheckmate(); game.undo(); return mate; });
}
