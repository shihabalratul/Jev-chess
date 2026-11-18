// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { detectBoards, orientationOf, parseGeneric, publicMovePgn } from '../packages/board-detection/src';
import { ChessStateManager } from '../packages/chess-core/src';
it('selects the actual Chess.com board over an equally sized wrapper and recovers its game', () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/chesscom-analysis-dom.json', 'utf8'));
    document.body.innerHTML = `<div class="board-wrapper">${fixture.board}</div>${fixture.moveList}`;
    const board = document.querySelector('wc-chess-board')!;
    for (const node of [board, board.parentElement!])
        node.getBoundingClientRect = () => ({ x: 0, y: 0, width: 400, height: 400, top: 0, left: 0, right: 400, bottom: 400, toJSON() {} });
    expect(detectBoards(document)[0].element).toBe(board);
    const orientation = orientationOf(board);
    expect(orientation).toBe('white');
    const observation = parseGeneric(board, orientation)!;
    const state = new ChessStateManager();
    state.observe(observation, undefined, publicMovePgn());
    const game = new Chess();
    for (const san of ['e4', 'e5', 'Nf3']) game.move(san);
    expect(state.fen).toBe(game.fen());
    expect(state.history).toEqual(['e4', 'e5', 'Nf3']);
});
