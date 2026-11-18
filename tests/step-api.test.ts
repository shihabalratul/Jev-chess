import { it, expect } from 'vitest';
import { buildServer } from '../apps/server/src/app';
import { ChessStateManager } from '../packages/chess-core/src';
import { DEFAULT_POSITION } from 'chess.js';
it('serves six bounded stages and rejects altered or position-replayed traces',async()=>{
    const app=await buildServer({providerMode:'mock'}),input=new ChessStateManager(DEFAULT_POSITION).decisionInput('white');
    try {
        let body:any={input,trace:[]};
        for(let stage=0;stage<6;stage++){
            const response=await app.inject({method:'POST',url:'/api/choose-move/step',payload:body});
            expect(response.statusCode).toBe(200);
            const result=response.json();
            expect(result.trace).toHaveLength(stage+1);
            if(stage===0){const changed=structuredClone(result.trace);changed[0].answers.intent.choice='defensive';const bad=await app.inject({method:'POST',url:'/api/choose-move/step',payload:{input,trace:changed,proof:result.proof}});expect(bad.statusCode).toBe(400);}
            if(stage===5)expect(input.legalMoves.some(m=>m.uci===result.decision.uci)).toBe(true);
            body={input,trace:result.trace,proof:result.proof};
        }
    } finally{await app.close();}
});
