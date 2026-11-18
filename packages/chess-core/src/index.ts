import { Chess, validateFen, type Move, type Square } from 'chess.js';
import { observationSchema, type Observation, type ChooseRequest } from '../../shared/src/index';
export function placementFromPieces(pieces: Observation['pieces']): string {
    const map = new Map<string, string>();
    for (const p of pieces) {
        if (map.has(p.square))
            throw new Error('Duplicate square');
        map.set(p.square, p.piece);
        if (/[Pp]/.test(p.piece) && /[18]$/.test(p.square))
            throw new Error('Pawn on back rank');
    }
    if (pieces.filter(p => p.piece === 'K').length !== 1 || pieces.filter(p => p.piece === 'k').length !== 1)
        throw new Error('Exactly one king per color required');
    return Array.from({ length: 8 }, (_, row) => { let out = '', empty = 0; for (let f = 0; f < 8; f++) {
        const p = map.get(`${String.fromCharCode(97 + f)}${8 - row}`);
        if (!p)
            empty++;
        else {
            if (empty)
                out += empty;
            empty = 0;
            out += p;
        }
    } return out + (empty || ''); }).join('/');
}
export const moveUci = (m: Move) => m.from + m.to + (m.promotion || '');
export function verifiedChess(fen: string): Chess {
    fen = fen.trim().replace(/\s+/g, ' ');
    if (fen.split(' ').length !== 6)
        throw new Error('Invalid FEN: needs six fields: pieces, turn, castling, en passant, halfmove clock, fullmove number. Paste the complete FEN, including its final five fields.');
    const v = validateFen(fen);
    if (!v.ok) throw new Error(v.error ?? 'Invalid FEN');
    const c = new Chess(fen);
    const previousSideFen = fen.split(' ');
    previousSideFen[1] = c.turn() === 'w' ? 'b' : 'w';
    previousSideFen[3] = '-';
    const other = new Chess(previousSideFen.join(' '));
    if (other.isCheck()) throw new Error('Invalid position: side that just moved is in check');
    return c;
}
export class ChessStateManager {
    private game?: Chess;
    constructor(fen?: string) { if (fen)
        this.game = verifiedChess(fen); }
    get fen() { if (!this.game)
        throw new Error('Complete state FEN required'); return this.game.fen(); }
    get initialized() { return !!this.game; }
    get history() { return this.game?.history() ?? []; }
    get turn() { return this.chess.turn() === 'w' ? 'white' : 'black'; }
    get chess() { if (!this.game)
        throw new Error('Complete state FEN required'); return this.game; }
    observe(input: Observation, seedFen?: string, seedPgn?: string): Move | undefined {
        const o = observationSchema.parse(input);
        if (o.uncertainSquares.length)
            throw new Error('Uncertain squares require correction');
        const placement = placementFromPieces(o.pieces);
        if (seedPgn) {
            const recovered = new Chess();
            recovered.loadPgn(seedPgn, { strict: true });
            verifiedChess(recovered.fen());
            if (recovered.fen().split(' ')[0] !== placement)
                throw new Error('PGN history does not match observed pieces');
            if (seedFen && verifiedChess(seedFen).fen() !== recovered.fen())
                throw new Error('PGN and public FEN disagree');
            this.checkMetadata(o, recovered);
            let advanced: Move | undefined;
            if (this.game) {
                const path = recovered.history({ verbose: true });
                const tracked = this.game.history({ verbose: true }).map(moveUci);
                const states = [path[0]?.before ?? recovered.fen(), ...path.map(move => move.after)];
                const anchor = states.findIndex((fen, index) => fen === this.fen
                    && index >= tracked.length
                    && tracked.every((uci, offset) => moveUci(path[index - tracked.length + offset]) === uci));
                if (anchor === -1)
                    throw new Error('Public history does not extend the tracked game; automatic recovery rejected');
                if (anchor < path.length) advanced = path.at(-1);
            }
            this.game = recovered;
            return advanced;
        }
        if (!this.game) {
            if (!seedFen)
                throw new Error('Complete state FEN required: turn, castling, en passant and counters are unknown');
            const c = verifiedChess(seedFen);
            if (c.fen().split(' ')[0] !== placement)
                throw new Error('Seed FEN does not match observed pieces');
            this.checkMetadata(o, c);
            this.game = c;
            return;
        }
        if (this.fen.split(' ')[0] === placement) {
            this.checkMetadata(o);
            return;
        }
        const matches = this.chess.moves({ verbose: true }).filter(m => { const c = new Chess(this.fen); c.move({ from: m.from, to: m.to, promotion: m.promotion }); return c.fen().split(' ')[0] === placement; });
        if (matches.length !== 1)
            throw new Error('Board is not a unique legal successor; pause and correct FEN');
        const next = new Chess(this.fen);
        next.move(matches[0]);
        this.checkMetadata(o, next);
        return this.chess.move(matches[0]);
    }
    private checkMetadata(o: Observation, c = this.chess) { const f = c.fen().split(' '); if (o.sideToMove && (o.sideToMove === 'white' ? 'w' : 'b') !== f[1])
        throw new Error('Turn metadata disagrees with tracked game'); if (o.castlingRights !== null && o.castlingRights !== f[2])
        throw new Error('Castling metadata disagrees with tracked game'); /* null en-passant means unknown, not absent */ /* null en-passant means unknown, not absent */ if (o.enPassantSquare !== null && o.enPassantSquare !== f[3])
        throw new Error('En passant metadata disagrees'); }
    legalMoves() { return this.chess.moves({ verbose: true }).map(m => ({ uci: moveUci(m), san: m.san })); }
    apply(uci: string): Move { if (!this.legalMoves().some(m => m.uci === uci))
        throw new Error('Illegal UCI move'); return this.chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] }); }
    expected(uci: string) { const c = new ChessStateManager(this.fen); c.apply(uci); return c.fen; }
    status() { const c = this.chess; if (c.isCheckmate())
        return 'Checkmate'; if (c.isStalemate())
        return 'Stalemate'; if (c.isThreefoldRepetition())
        return 'Threefold repetition'; if (c.isInsufficientMaterial())
        return 'Insufficient material'; if (c.isDraw())
        return 'Draw'; return c.isCheck() ? 'Check' : 'In progress'; }
    get finished() { return this.chess.isGameOver(); }
    decisionInput(playingColor: ChooseRequest['playingColor']): ChooseRequest { return { fen: this.fen, playingColor, legalMoves: this.legalMoves(), history: this.history.slice(-1000), gamePgn: this.chess.pgn() }; }
}
export function candidateFacts(fen: string) { const c = verifiedChess(fen); return c.moves({ verbose: true }).map(m => { const n = new Chess(fen); n.move(m); return { uci: moveUci(m), san: m.san, piece: m.piece, captured: m.captured ?? null, promotion: m.promotion ?? null, isCheck: n.isCheck(), isCheckmate: n.isCheckmate(), isDraw: n.isDraw(), resultingFen: n.fen() }; }); }
export function piecesFromFen(fen: string): Observation['pieces'] { return new Chess(fen).board().flat().filter(p => p !== null).map(p => ({ square: p.square, piece: (p.color === 'w' ? p.type.toUpperCase() : p.type) as Observation['pieces'][number]['piece'] })); }
