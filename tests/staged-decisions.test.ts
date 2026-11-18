import { describe, expect, it } from 'vitest';
import { ChessStateManager } from '../packages/chess-core/src';
import { DEFAULT_POSITION } from 'chess.js';
import { readablePosition, stagePlan, runDecisionStage, runStagedDecision } from '../apps/server/src/services/decisions';

describe('staged Jev decisions', () => {
    const input = new ChessStateManager(DEFAULT_POSITION).decisionInput('white');
    it('describes every piece and complete legal consequences without relying on FEN notation', () => {
        const state = readablePosition(input);
        expect(state.pieces).toHaveLength(32);
        expect(state.pieces).toContain('Your white king is on e1.');
        expect(state.pieces).toContain('Opponent black queen is on d8.');
        expect(state.turn).toBe('White to move. You play White.');
        const plan = stagePlan(input, []);
        expect(plan.stage).toBe('assess');
        expect(Object.keys(plan.questions.intent.criteria)).toEqual(['offensive','defensive']);
        expect(JSON.stringify(plan.state)).not.toContain(DEFAULT_POSITION);
    });
    it('passes nominations to a probability shortlist, asks opponent replies, and leaves final choice to Jev', async () => {
        const seen: string[] = [];
        const judge = async (plan: ReturnType<typeof stagePlan>) => {
            if(seen.at(-1)!==plan.stage)seen.push(plan.stage);
            return { model: 'typesafe/jev-1.13', answers: Object.fromEntries(Object.entries(plan.questions).map(([key, q]) => {
                const keys = Object.keys(q.criteria);
                const preferred = ['choose','shortlist'].includes(plan.stage) ? 'g1f3' : key === 'g1' ? 'g1f3' : key === 'e2' ? 'e2e4' : keys[0];
                const choice = keys.includes(preferred) ? preferred : keys[0];
                const ordered = [choice, ...keys.filter(k => k !== choice)];
                return [key, { type: 'choice', choice, probabilities: Object.fromEntries(ordered.map((k, i) => [k, i === 0 ? .8 : .2 / (keys.length - 1 || 1)])) }];
            })) };
        };
        const result = await runStagedDecision(input, judge, new AbortController().signal);
        expect(seen).toEqual(['assess','reply','nominate','shortlist','continue','choose']);
        expect(result.uci).toBe('g1f3');
        expect(result.trace).toHaveLength(6);
        expect(result.source).toBe('provider');
    });
    const firstAnswer=async(plan:ReturnType<typeof stagePlan>)=>({answers:Object.fromEntries(Object.entries(plan.questions).map(([key,q])=>[key,{type:'choice',choice:Object.keys(q.criteria)[0]}]))});
    async function prior(input:Parameters<typeof stagePlan>[0],count:number){let trace:Parameters<typeof stagePlan>[1]=[];for(let i=0;i<count;i++)trace=(await runDecisionStage(input,trace,firstAnswer,new AbortController().signal)).trace;return trace;}
    it('rejects missing shortlist probabilities and invented prior moves',async()=>{
        const trace=await prior(input,3),plan=stagePlan(input,trace);
        await expect(runDecisionStage(input,trace,firstAnswer,new AbortController().signal)).rejects.toThrow(/probabilit/i);
        trace[2].answers.a2.choice='a2a5';expect(()=>stagePlan(input,trace)).toThrow(/illegal|option/i);
        expect(plan.stage).toBe('shortlist');
    });
    it('preserves all promotion choices and rejects inconsistent replay history',async()=>{
        const p=new ChessStateManager('7k/P7/8/8/8/8/8/7K w - - 0 1').decisionInput('white');
        const trace=await prior(p,2);
        expect(Object.keys(stagePlan(p,trace).questions.a7.criteria)).toEqual(expect.arrayContaining(['a7a8q','a7a8r','a7a8b','a7a8n']));
        expect(()=>readablePosition({...input,gamePgn:'1. e4'})).toThrow(/history|match/i);
    });
    it('does not call Jev after cancellation', async () => {
        const abort = new AbortController(); abort.abort();
        await expect(runStagedDecision(input, async () => { throw new Error('must not request'); }, abort.signal)).rejects.toThrow();
    });
    it('releases a cancelled stage even when a transport resolves late',async()=>{
        const abort=new AbortController();let finish!:(value:any)=>void;
        const pending=runDecisionStage(input,[],async()=>new Promise(resolve=>{finish=resolve;}),abort.signal);
        abort.abort(new DOMException('Stopped','AbortError'));
        const outcome=await Promise.race([pending.then(()=> 'completed',()=> 'aborted'),new Promise<string>(r=>setTimeout(()=>r('still running'),80))]);
        finish({answers:{}});
        await pending.catch(()=>{});
        expect(outcome).toBe('aborted');
    });
});
