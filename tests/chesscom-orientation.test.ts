// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { orientationOf } from '../packages/board-detection/src';

beforeEach(() => { document.body.innerHTML = ''; });
function labelledBoard(orientation: 'white' | 'black' = 'white') {
    const files = orientation === 'white' ? 'abcdefgh' : 'hgfedcba';
    const ranks = orientation === 'white' ? '87654321' : '12345678';
    document.body.innerHTML = `<wc-chess-board class="board"><svg viewBox="0 0 100 100" class="coordinates" aria-hidden="true">${[...ranks].map((rank, i) => `<text x="0.75" y="${i === 0 ? 3.5 : 3.25 + i * 12.5}">${rank}</text>`).join('')}${[...files].map((file, i) => `<text x="${10 + i * 12.5}" y="99">${file}</text>`).join('')}</svg><div class="piece bb square-68"></div></wc-chess-board>`;
    const board = document.querySelector('wc-chess-board')!;
    board.getBoundingClientRect = () => ({ x: 40, y: 80, width: 400, height: 400, top: 80, left: 40, right: 440, bottom: 480 } as DOMRect);
    return board;
}
it.each(['white', 'black'] as const)('derives %s orientation from coherent SVG file and rank labels', orientation => {
    expect(orientationOf(labelledBoard(orientation))).toBe(orientation);
});
it('requires both coordinate axes and their endpoint evidence', () => {
    const board = labelledBoard();
    for (const label of board.querySelectorAll('text')) if (/^[1-8]$/.test(label.textContent!)) label.remove();
    expect(orientationOf(board)).toBeNull();
    const complete = labelledBoard();
    [...complete.querySelectorAll('text')].find(label => label.textContent === 'a')!.remove();
    expect(orientationOf(complete)).toBeNull();
});
it('refuses conflicting file and rank directions or inconsistent label positions', () => {
    const board = labelledBoard();
    for (const label of board.querySelectorAll('text')) if (/^[1-8]$/.test(label.textContent!)) label.textContent = String(9 - Number(label.textContent));
    expect(orientationOf(board)).toBeNull();
    const inconsistent = labelledBoard();
    [...inconsistent.querySelectorAll('text')].find(label => label.textContent === 'd')!.setAttribute('x', '90');
    expect(orientationOf(inconsistent)).toBeNull();
});
it('refuses overlapping adjacent coordinates instead of accepting approximate positions alone', () => {
    const board = labelledBoard();
    [...board.querySelectorAll('text')].find(label => label.textContent === 'd')!.setAttribute('x', '35');
    expect(orientationOf(board)).toBeNull();
});
it.each(['display:none', 'visibility:hidden', 'opacity:0'])('ignores labels hidden by ancestor style %s', style => {
    const board = labelledBoard();
    board.querySelector('svg')!.setAttribute('style', style);
    expect(orientationOf(board)).toBeNull();
});
it('does not use a hidden endpoint or SVG labels with unmeasured transforms', () => {
    const board = labelledBoard();
    [...board.querySelectorAll('text')].find(label => label.textContent === '8')!.setAttribute('style', 'display:none');
    expect(orientationOf(board)).toBeNull();
    const transformed = labelledBoard();
    transformed.querySelector('svg')!.setAttribute('transform', 'rotate(180 50 50)');
    expect(orientationOf(transformed)).toBeNull();
    const transformedBoard = labelledBoard();
    transformedBoard.setAttribute('style', 'transform:rotate(180deg)');
    expect(orientationOf(transformedBoard)).toBeNull();
});
it('uses rendered label rectangles when SVG coordinates do not describe their transformed positions', () => {
    const board = labelledBoard();
    board.querySelector('svg')!.setAttribute('transform', 'rotate(180 50 50)');
    for (const label of board.querySelectorAll('text')) {
        const file = /^[a-h]$/.test(label.textContent!);
        const index = file ? label.textContent!.charCodeAt(0) - 97 : Number(label.textContent) - 1;
        const x = file ? 40 + (7 - index + .5) * 50 : 430;
        const y = file ? 85 : 80 + (index + .5) * 50;
        label.getBoundingClientRect = () => ({ x, y, width: 5, height: 5 } as DOMRect);
    }
    expect(orientationOf(board)).toBe('black');
});
it('preserves explicit orientation and square geometry without assuming a normal board class', () => {
    const board = labelledBoard();
    board.innerHTML = '';
    expect(orientationOf(board)).toBeNull();
    board.setAttribute('data-orientation', 'white');
    expect(orientationOf(board)).toBe('white');
    board.removeAttribute('data-orientation');
    board.classList.add('flipped');
    expect(orientationOf(board)).toBe('black');
    board.classList.remove('flipped');
    board.innerHTML = '<div data-square="a1"></div>';
    board.firstElementChild!.getBoundingClientRect = () => ({ x: 40, y: 430, width: 50, height: 50 } as DOMRect);
    expect(orientationOf(board)).toBe('white');
});
