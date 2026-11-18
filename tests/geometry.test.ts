import { it, expect } from 'vitest';
import { squareCenter, pointSquare, cropCoordinates } from '../packages/board-detection/src';
const rect = { x: 40, y: 80, width: 400, height: 400 };
it.each([['white', 'a1', 65, 455], ['white', 'h8', 415, 105], ['black', 'a1', 415, 105], ['black', 'h8', 65, 455]] as const)('maps %s %s to viewport pixels', (orientation, square, x, y) => { expect(squareCenter(square, rect, orientation)).toEqual({ x, y }); expect(pointSquare(x, y, rect, orientation)).toBe(square); });
it('uses actual bitmap scaling and refuses clipped boards', () => { expect(cropCoordinates(rect, { width: 1000, height: 800 }, 2000, 1600)).toEqual({ x: 80, y: 160, width: 800, height: 800 }); expect(() => cropCoordinates({ ...rect, x: -1 }, { width: 1000, height: 800 }, 2000, 1600)).toThrow(/visible/); expect(() => pointSquare(0, 0, rect, 'white')).toThrow(/outside/); });
