import { it, expect } from 'vitest';
import { observationSchema, parseRequestSchema, parserRuleSchema, settingsSchema, defaults } from '../packages/shared/src';
it('rejects injected executable rules, oversized DOM, duplicate squares and private plaintext backend destinations', () => {
    expect(parserRuleSchema.safeParse({ version: 1, code: 'eval(x)' }).success).toBe(false);
    expect(parseRequestSchema.safeParse({ dom: 'x'.repeat(100001) }).success).toBe(false);
    expect(observationSchema.safeParse({ pieces: [{ square: 'e1', piece: 'K' }, { square: 'e1', piece: 'k' }], orientation: 'white', sideToMove: null, castlingRights: null, enPassantSquare: null, uncertainSquares: [] }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...defaults, backendUrl: 'http://example.com' }).success).toBe(false);
    expect(parseRequestSchema.safeParse({ image: 'https://site/secret.png' }).success).toBe(false);
});
