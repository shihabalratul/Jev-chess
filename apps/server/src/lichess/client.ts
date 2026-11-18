import { z } from 'zod';
import { Chess } from 'chess.js';
import { verifiedChess, moveUci } from '../../../../packages/chess-core/src';
import { abortable, delay, type ChooseRequest } from '../../../../packages/shared/src';
import { lichessUserIdSchema } from '../../../../packages/shared/src/lichess';

const idSchema=z.string().regex(/^[a-zA-Z0-9]{2,40}$/);
export const gameStateSchema=z.object({type:z.literal('gameState'),moves:z.string().max(100000),wtime:z.number().int().nonnegative(),btime:z.number().int().nonnegative(),winc:z.number().int().nonnegative(),binc:z.number().int().nonnegative(),status:z.enum(['created','started','aborted','mate','resign','stalemate','timeout','draw','outoftime','cheat','noStart','unknownFinish','variantEnd']),winner:z.enum(['white','black']).optional(),expiration:z.object({idleMillis:z.number().nonnegative(),millisToMove:z.number().nonnegative()}).optional()});
const player=z.object({id:lichessUserIdSchema,name:z.string().max(100)});
/** A game seat is either a Lichess account or Lichess's built-in computer, which streams only {aiLevel}. */
const gamePlayer=z.object({id:lichessUserIdSchema.optional(),name:z.string().max(100).optional(),aiLevel:z.number().int().min(1).max(8).optional()})
    .refine(p=>p.aiLevel!==undefined?p.id===undefined:p.id!==undefined&&p.name!==undefined,'Game player must be an account (id and name) or a Lichess AI (aiLevel)');
export type GamePlayer=z.infer<typeof gamePlayer>;
export const playerKey=(p:GamePlayer)=>p.aiLevel!==undefined?`ai:${p.aiLevel}`:`user:${p.id!.toLowerCase()}`;
export const playerLabel=(p:GamePlayer)=>p.aiLevel!==undefined?`Lichess AI level ${p.aiLevel}`:p.name!;
export const fullGameSchema=z.object({type:z.literal('gameFull'),id:idSchema,variant:z.object({key:z.literal('standard')}),initialFen:z.string().max(200),white:gamePlayer,black:gamePlayer,state:gameStateSchema});
export type FullGame=z.infer<typeof fullGameSchema>;
export const challengeSchema=z.object({id:idSchema,challenger:player,variant:z.object({key:z.string().max(40)}),rated:z.boolean(),direction:z.enum(['in','out']).optional(),timeControl:z.object({type:z.string().max(40),limit:z.number().nonnegative().optional(),increment:z.number().nonnegative().optional()})});
export type Challenge=z.infer<typeof challengeSchema>;
export interface LichessPort {
    account(signal:AbortSignal):Promise<{id:string;username:string;title?:string}>;
    events(signal:AbortSignal):AsyncIterable<unknown>;
    game(id:string,signal:AbortSignal):AsyncIterable<unknown>;
    accept(id:string,signal:AbortSignal):Promise<void>;
    move(id:string,uci:string,signal:AbortSignal):Promise<void>;
}

/** A stalled stream is unusable evidence. Blank server keepalives reset this timer. */
export async function* readNdjson(response:Response,signal:AbortSignal):AsyncGenerator<unknown>{
    if(!response.body)throw new Error('Lichess stream has no body');
    const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let pending='';
    const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
    const parse=(line:string)=>{const value:unknown=JSON.parse(line);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid Lichess event');return value;};
    try{
        while(true){
            signal.throwIfAborted();const chunk=await abortable(reader.read(),AbortSignal.any([signal,AbortSignal.timeout(45000)]));
            signal.throwIfAborted();pending+=decoder.decode(chunk.value,{stream:!chunk.done});
            if(pending.length>1024*1024)throw new Error('Lichess stream line too large');
            let end:number;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end).trim();pending=pending.slice(end+1);if(line)yield parse(line);}
            if(chunk.done){if(pending.trim())yield parse(pending.trim());break;}
        }
    }finally{signal.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
}

/** No site objects, browser automation or strategic evaluation enter API mode. */
export function reconstructGame(value:unknown,accountId:string){
    const full=fullGameSchema.parse(value);
    const self=`user:${accountId.toLowerCase()}`;
    const color:'white'|'black'|undefined=playerKey(full.white)===self?'white':playerKey(full.black)===self?'black':undefined;
    if(!color)throw new Error('Authenticated account is not a player in this game');
    const chess=full.initialFen==='startpos'?new Chess():verifiedChess(full.initialFen);
    const moves:string[]=[];
    for(const raw of full.state.moves.trim().split(/\s+/).filter(Boolean)){
        if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(raw))throw new Error('Invalid streamed UCI move');
        let uci=raw;
        // Lichess streams may encode castling as king-to-rook, including standard chess.
        const aliases:Record<string,string>={e1h1:'e1g1',e1a1:'e1c1',e8h8:'e8g8',e8a8:'e8c8'};
        if(aliases[raw]&&chess.get(raw.slice(0,2) as 'e1')?.type==='k')uci=aliases[raw];
        const legal=chess.moves({verbose:true}).find(m=>moveUci(m)===uci);
        if(!legal)throw new Error('Illegal move in authoritative Lichess history');
        chess.move(legal);moves.push(uci);
    }
    const input:ChooseRequest={fen:chess.fen(),playingColor:color,legalMoves:chess.moves({verbose:true}).map(m=>({uci:moveUci(m),san:m.san})),history:chess.history(),gamePgn:chess.pgn()};
    return {full,chess,color,moves,input};
}

export class LichessHttpError extends Error {constructor(readonly status:number){super(`Lichess HTTP ${status}`);}}
export class LichessNotDispatchedError extends Error {constructor(cause:unknown){super('Lichess request cancelled before dispatch',{cause});}}
export class LichessClient implements LichessPort {
    private queue:Promise<unknown>=Promise.resolve();private cooldown=0;
    constructor(private token:string,private transport:typeof fetch=fetch){if(!token.trim()||/\s/.test(token))throw new Error('Set LICHESS_TOKEN in the backend environment');}
    private async request(path:string,signal:AbortSignal,method='GET'){
        try{signal.throwIfAborted();await delay(Math.max(0,this.cooldown-Date.now()),signal);signal.throwIfAborted();}
        catch(error){throw new LichessNotDispatchedError(error);}
        const abort=new AbortController(),cancel=()=>abort.abort(signal.reason);signal.addEventListener('abort',cancel,{once:true});
        const timer=setTimeout(()=>abort.abort(new Error('Lichess connection timed out')),15000);
        const dispose=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);abort.abort();};
        try{
            const response=await this.transport(`https://lichess.org${path}`,{method,headers:{Authorization:`Bearer ${this.token}`,Accept:'application/json'},signal:abort.signal,redirect:'error'});
            clearTimeout(timer);
            if(response.status===429)this.cooldown=Date.now()+60000;
            if(!response.ok){await response.body?.cancel();throw new LichessHttpError(response.status);}
            return {response,dispose};
        }catch(error){dispose();throw error;}
    }
    private json(path:string,signal:AbortSignal,method='GET'):Promise<unknown>{
        const work=this.queue.then(async()=>{
            const connection=await this.request(path,signal,method);
            // Bound body consumption too; request() only bounds the connection headers.
            try{return await abortable(connection.response.json(),AbortSignal.any([signal,AbortSignal.timeout(15000)]));}
            finally{connection.dispose();}
        });this.queue=work.catch(()=>{});return work;
    }
    async account(signal:AbortSignal){return z.object({id:lichessUserIdSchema,username:z.string().max(100),title:z.string().optional()}).parse(await this.json('/api/account',signal));}
    async *events(signal:AbortSignal){const connection=await this.request('/api/stream/event',signal);try{yield* readNdjson(connection.response,signal);}finally{connection.dispose();}}
    async *game(id:string,signal:AbortSignal){idSchema.parse(id);const connection=await this.request(`/api/bot/game/stream/${id}`,signal);try{yield* readNdjson(connection.response,signal);}finally{connection.dispose();}}
    async accept(id:string,signal:AbortSignal){idSchema.parse(id);z.object({ok:z.literal(true)}).parse(await this.json(`/api/challenge/${id}/accept`,signal,'POST'));}
    async move(id:string,uci:string,signal:AbortSignal){idSchema.parse(id);z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/).parse(uci);z.object({ok:z.literal(true)}).parse(await this.json(`/api/bot/game/${id}/move/${uci}`,signal,'POST'));}
}
