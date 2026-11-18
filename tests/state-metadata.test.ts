import { it, expect } from 'vitest';
import { ChessStateManager, verifiedChess, piecesFromFen } from '../packages/chess-core/src';
import { DEFAULT_POSITION } from 'chess.js';
it('accepts valid en-passant FEN while checking the previous king safely', () => { expect(verifiedChess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1').moves()).toContain('exd6'); });
it('rejects contradictory visible turn without mutating the tracked position', () => { const state = new ChessStateManager(DEFAULT_POSITION); expect(() => state.observe({ pieces: piecesFromFen(DEFAULT_POSITION), orientation: 'white', sideToMove: 'black', castlingRights: null, enPassantSquare: null, uncertainSquares: [] })).toThrow(/Turn/); expect(state.fen).toBe(DEFAULT_POSITION); });
it('reconstructs full PGN history only if its resulting position matches observation', () => { const state = new ChessStateManager(); const pgn = '1. e4 e5 2. Nf3 Nc6'; const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'; state.observe({ pieces: piecesFromFen(fen), orientation: 'white', sideToMove: null, castlingRights: null, enPassantSquare: null, uncertainSquares: [] }, undefined, pgn); expect(state.history).toEqual(['e4', 'e5', 'Nf3', 'Nc6']); expect(state.fen).toBe(fen); });
it('accepts a complete FEN pasted with surrounding and wrapped whitespace', () => {
    const pasted = ` \n${DEFAULT_POSITION.replaceAll(' ', '\n\t')} \n`;
    expect(verifiedChess(pasted).fen()).toBe(DEFAULT_POSITION);
});
it('explains incomplete FEN without inventing missing state fields', () => {
    const state = new ChessStateManager();
    const observation = { pieces: piecesFromFen(DEFAULT_POSITION), orientation: 'white' as const, sideToMove: null, castlingRights: null, enPassantSquare: null, uncertainSquares: [] };
    expect(() => state.observe(observation, DEFAULT_POSITION.split(' ')[0])).toThrow(/six fields: pieces, turn, castling, en passant, halfmove clock, fullmove number/);
    expect(state.initialized).toBe(false);
});
