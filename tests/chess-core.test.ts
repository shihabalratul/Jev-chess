import { describe, it, expect } from 'vitest';
import { ChessStateManager, placementFromPieces } from '../packages/chess-core/src/index';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { Observation } from '../packages/shared/src';
function observation(fen: string): Observation { const c = new Chess(fen); return { pieces: c.board().flat().filter(p => p !== null).map(p => ({ square: p.square, piece: (p.color === 'w' ? p.type.toUpperCase() : p.type) as Observation['pieces'][number]['piece'] })), orientation: 'white', sideToMove: null, castlingRights: null, enPassantSquare: null, uncertainSquares: [] }; }
describe('state integrity', () => {
    it('catches up through complete legal history after several observed moves were missed', () => {
        const state = new ChessStateManager(DEFAULT_POSITION);
        state.apply('f2f4');
        const game = new Chess();
        for (const san of ['f4', 'd5', 'Nf3', 'Nh6', 'Nc3', 'f5', 'Nxd5', 'Kf7']) game.move(san);
        expect(state.observe(observation(game.fen()), undefined, game.pgn())?.san).toBe('Kf7');
        expect(state.fen).toBe('rnbq1b1r/ppp1pkpp/7n/3N1p2/5P2/5N2/PPPPP1PP/R1BQKB1R w KQ - 1 5');
        expect(state.history).toEqual(['f4', 'd5', 'Nf3', 'Nh6', 'Nc3', 'f5', 'Nxd5', 'Kf7']);
    });
    it('retains counters and repetition when complete history returns to an earlier placement', () => {
        const state = new ChessStateManager(DEFAULT_POSITION);
        const game = new Chess();
        for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) game.move(san);
        state.observe(observation(game.fen()), undefined, game.pgn());
        expect(state.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 8 5');
        expect(state.status()).toBe('Threefold repetition');
    });
    it('rejects histories that replace tracked moves or rewind the game without mutation', () => {
        const state = new ChessStateManager(DEFAULT_POSITION);
        state.apply('g1f3'); state.apply('b8c6'); state.apply('b1c3'); state.apply('g8f6');
        const previous = state.fen;
        const transposition = new Chess();
        for (const san of ['Nc3', 'Nf6', 'Nf3', 'Nc6']) transposition.move(san);
        expect(transposition.fen()).toBe(previous);
        expect(() => state.observe(observation(previous), undefined, transposition.pgn())).toThrow(/history|tracked/i);
        expect(() => state.observe(observation(DEFAULT_POSITION), undefined, '*')).toThrow(/history|tracked/i);
        expect(state.fen).toBe(previous);
        expect(state.history).toEqual(['Nf3', 'Nc6', 'Nc3', 'Nf6']);
    });
    it('rejects catch-up with contradictory public FEN or turn metadata', () => {
        const state = new ChessStateManager(DEFAULT_POSITION);
        const game = new Chess(); game.move('e4'); game.move('e5');
        expect(() => state.observe(observation(game.fen()), DEFAULT_POSITION, game.pgn())).toThrow(/disagree/i);
        expect(() => state.observe({ ...observation(game.fen()), sideToMove: 'black' }, undefined, game.pgn())).toThrow(/metadata/i);
        expect(state.fen).toBe(DEFAULT_POSITION);
    });
    it('requires complete state even when starting pieces are visible', () => { const s = new ChessStateManager(); expect(() => s.observe(observation(DEFAULT_POSITION))).toThrow(/complete|FEN/i); });
    it('never seeds a FEN that disagrees with observed pieces', () => { const s = new ChessStateManager(); const c = new Chess(); c.move('e4'); expect(() => s.observe(observation(c.fen()), DEFAULT_POSITION)).toThrow(/match/i); });
    it('preserves history and rights by finding a unique legal successor', () => { const s = new ChessStateManager(); s.observe(observation(DEFAULT_POSITION), DEFAULT_POSITION); const c = new Chess(); c.move('e4'); expect(s.observe(observation(c.fen()))?.san).toBe('e4'); expect(s.fen).toBe(c.fen()); expect(s.history).toEqual(['e4']); expect(s.legalMoves()).toHaveLength(20); });
    it('rejects an impossible jump and uncertain recognition', () => { const s = new ChessStateManager(DEFAULT_POSITION); const c = new Chess(); c.move('e4'); c.move('e5'); expect(() => s.observe(observation(c.fen()))).toThrow(/successor/i); const o = observation(DEFAULT_POSITION); o.uncertainSquares = ['e2']; expect(() => s.observe(o)).toThrow(/uncertain/i); });
    it.each([
        ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1', 'O-O'],
        ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5d6', 'exd6'],
        ['4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7a8n', 'a8=N'],
    ])('handles special move %s', (fen, uci, san) => { const s = new ChessStateManager(fen); expect(s.legalMoves().map(m => m.uci)).toContain(uci); s.apply(uci); expect(s.history).toEqual([san]); });
    it('rejects illegal moves without mutating state', () => { const s = new ChessStateManager(DEFAULT_POSITION); expect(() => s.apply('e2e5')).toThrow(); expect(s.fen).toBe(DEFAULT_POSITION); });
    it('reports terminal states', () => { const s = new ChessStateManager('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'); expect(s.status()).toBe('Stalemate'); });
    it('validates duplicates, kings and back-rank pawns', () => { expect(() => placementFromPieces([{ square: 'e1', piece: 'K' }, { square: 'e8', piece: 'k' }, { square: 'a8', piece: 'P' }])).toThrow(); });
});
