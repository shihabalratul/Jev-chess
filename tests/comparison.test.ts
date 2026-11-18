import { it, expect } from 'vitest';
import { encodePositions } from '../scripts/jev-comparison';
it('changes only the piece encoding for controlled FEN versus readable comparisons',()=>{
    const source={position:{pieces:['Your white king is on h1.','Your white pawn is on a7.','Opponent black king is on h8.'],turn:'White to move.',check:'No check.'},facts:{capture:'nothing'}};
    const result=encodePositions(source) as any;
    expect(result.position.placementFen).toBe('7k/P7/8/8/8/8/8/7K');
    expect(result.position.turn).toBe('White to move.');expect(result.facts.capture).toBe('nothing');
    expect(source.position.pieces).toHaveLength(3);
});
