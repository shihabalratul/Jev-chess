import { expect,it } from 'vitest';
import { Chess,DEFAULT_POSITION } from 'chess.js';
import { ChessStateManager,piecesFromFen } from '../packages/chess-core/src';
import { stagePlan,runStagedDecision } from '../apps/server/src/services/decisions';
it('carries Jev intent through all stages and forecasts every legal move before nominations',async()=>{
    const game=new Chess();game.move('e4');game.move('d5');
    const manager=new ChessStateManager();manager.observe({pieces:piecesFromFen(game.fen()),orientation:'white',sideToMove:null,castlingRights:null,enPassantSquare:null,uncertainSquares:[]},game.fen(),game.pgn());
    const input=manager.decisionInput('white'),stages:string[]=[],forecast=new Set<string>();
    const result=await runStagedDecision(input,async plan=>{
        if(stages.at(-1)!==plan.stage)stages.push(plan.stage);
        if(plan.stage==='assess'){
            expect(plan.state.lastOpponentMove).toMatchObject({uci:'d7d5'});
            expect(JSON.stringify(plan.state.lastOpponentMove)).toContain('black pawn');
        }else{
            expect(plan.state.strategicIntent).toBe('defensive');
            for(const q of Object.values(plan.questions))expect(q.instructions).toContain('defensive');
        }
        if(plan.stage==='reply')for(const key of Object.keys(plan.questions))forecast.add(key);
        if(plan.stage==='nominate')for(const [source,detail] of Object.entries(plan.state.questionContexts as Record<string,Record<string,unknown>>)){
            expect(Object.keys(detail).sort()).toEqual(input.legalMoves.filter(m=>m.uci.startsWith(source)).map(m=>m.uci).sort());
            for(const line of Object.values(detail))expect(line).toHaveProperty('afterOpponentReply');
        }
        const answers=Object.fromEntries(Object.entries(plan.questions).map(([key,q])=>{
            const options=Object.keys(q.criteria),choice=plan.stage==='assess'?'defensive':options[0];
            return [key,{type:'choice',choice,probabilities:Object.fromEntries(options.map(k=>[k,k===choice?1:0]))}];
        }));return {model:'test/jev',answers};
    },new AbortController().signal);
    expect(stages).toEqual(['assess','reply','nominate','shortlist','continue','choose']);
    expect([...forecast].sort()).toEqual(input.legalMoves.map(m=>m.uci).sort());
    expect(result.trace).toHaveLength(6);
    expect(stagePlan(input,result.trace!.slice(0,5)).state.examinedLines).toBeDefined();
});
it('marks missing opponent history unknown and never uses unverified client move strings',()=>{
    const input=new ChessStateManager(DEFAULT_POSITION).decisionInput('white');input.history=['e4','d5'];
    const state=stagePlan(input,[]).state;
    expect(state.lastOpponentMove).toBeNull();expect(state.recentMoves).toEqual([]);
});
it('bounds independent batches and rejects omitted answers',async()=>{
    const input=new ChessStateManager(DEFAULT_POSITION).decisionInput('white');
    await expect(runStagedDecision(input,async plan=>({answers:Object.fromEntries(Object.entries(plan.questions).slice(1).map(([k,q])=>[k,{type:'choice',choice:Object.keys(q.criteria)[0]}]))}),new AbortController().signal)).rejects.toThrow(/missing/i);
});
