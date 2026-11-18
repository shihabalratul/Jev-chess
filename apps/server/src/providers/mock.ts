import { runDecisionStage } from '../services/decisions';
import type { StageTrace } from '../../../../packages/shared/src';
import type { Provider } from './types';
import { observationSchema, type ParseRequest, type ChooseRequest } from '../../../../packages/shared/src';
// Explicit offline fixture provider, never selected as a fallback for a live failure.
export class MockProvider implements Provider {
    async parse(input: ParseRequest) {
        if (!input.dom)
            throw new Error('Mock vision needs a test HTTP fixture; no image recognition is performed by mock provider');
        const parsed = JSON.parse(input.dom);
        const pieces = parsed.elements?.filter((e: any) => e.attributes?.['data-piece'] && e.attributes?.['data-square']).map((e: any) => ({ square: e.attributes['data-square'], piece: e.attributes['data-piece'] })) ?? [];
        return observationSchema.parse({ pieces, orientation: input.orientation ?? 'white', sideToMove: null, castlingRights: null, enPassantSquare: null, uncertainSquares: [] });
    }
    async discover() { return { version: 1 as const, pieceSelector: '[data-piece]', pieceSource: 'attribute' as const, pieceAttribute: 'data-piece', pieceMap: { P: 'P' as const, N: 'N' as const, B: 'B' as const, R: 'R' as const, Q: 'Q' as const, K: 'K' as const, p: 'p' as const, n: 'n' as const, b: 'b' as const, r: 'r' as const, q: 'q' as const, k: 'k' as const }, squareSource: 'attribute' as const, squareAttribute: 'data-square', squareFormat: 'algebraic' as const, orientation: 'white' as const }; }
    async chooseStep(input:ChooseRequest,trace:StageTrace[],signal?:AbortSignal) {
        return runDecisionStage(input,trace,async plan=>({model:'mock/fixture',answers:Object.fromEntries(Object.entries(plan.questions).map(([key,q])=>{const keys=Object.keys(q.criteria);return [key,{type:'choice',choice:keys[0],probabilities:Object.fromEntries(keys.map(k=>[k,1/keys.length]))}];}))}),signal??new AbortController().signal,'mock/fixture','mock');
    }
    async recover(){return {action:'blocked' as const,reason:'Mock provider does not interpret unfamiliar interfaces'};}
    async choose(input: ChooseRequest) { return { uci: input.legalMoves[0].uci, latencyMs: 0, model: 'mock/fixture', source: 'mock' as const }; }
}
