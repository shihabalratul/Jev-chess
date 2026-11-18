import { z } from 'zod';
import type { Decision, DecisionStage } from './index';
export const lichessIdSchema=z.string().regex(/^[a-zA-Z0-9]{2,40}$/);
export const lichessUserIdSchema=z.string().regex(/^[a-zA-Z0-9_-]{2,40}$/);
export const pendingMoveSchema=z.object({id:z.string().min(1).max(100),gameId:lichessIdSchema,accountId:lichessUserIdSchema,moves:z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)).max(10000),uci:z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)}).strict();
export type PendingMove=z.infer<typeof pendingMoveSchema>;
export interface LichessStatus {
    configured:boolean;connected:boolean;running:boolean;busy:boolean;providerMode:string;
    account?:{id:string;username:string;title?:string};
    games:{id:string}[];
    challenges:{id:string;challenger:string;variant:string;rated:boolean;clock:string;supported:boolean}[];
    game?:{id:string;opponent:string;color:'white'|'black';fen:string;moves:string[];status:string;wtime:number;btime:number;connected:boolean};
    stage?:DecisionStage;depth?:'full'|'reduced'|'quick';intent?:'offensive'|'defensive';decision?:Decision;pending?:PendingMove;
    error?:string;sessionId:string;logLocation:string;
}
