import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { abortable, deadlineSignal, delay, message, stepResponseSchema, type StageTrace, type Decision, type Analysis } from '../../../../packages/shared/src';
import { nextStage } from '../services/decisions';
import { DecisionCache, planTurn, plannedReplyFromTrace, estimatedGameSeconds } from './budget';
import { lichessIdSchema, type LichessStatus, type PendingMove } from '../../../../packages/shared/src/lichess';
import { challengeSchema, fullGameSchema, gameStateSchema, reconstructGame, playerKey, playerLabel, LichessHttpError, LichessNotDispatchedError, type FullGame, type LichessPort, type Challenge } from './client';
import type { PendingStore } from './pending';
import type { Provider } from '../providers/types';
import { audit, auditContext, type SessionJournal, type AuditContext } from '../services/journal';

/** Abort reason when the stream confirms our own submitted move; this ends a decision successfully. */
class MoveConfirmed extends Error {constructor(){super('Selected move confirmed by authoritative history');}}
interface Options {client?:LichessPort;provider:Provider;providerMode:string;model:string;logRoot:string;pending:PendingStore;journal?:SessionJournal;record?:(event:string,data:unknown)=>Promise<void>;
    /** Minimum estimated game length (limit + 40 x increment) accepted for challenges. */minClockSeconds?:number;}
export class LichessController {
    private view:LichessStatus;private connection?:AbortController;private gameStream?:AbortController;private decisionAbort?:AbortController;
    private epoch=0;private selection=0;private tasks=new Set<Promise<unknown>>();private challenges=new Map<string,Challenge>();private games=new Set<string>();private finished=new Set<string>();
    private current?:ReturnType<typeof reconstructGame>;private cache=new DecisionCache();private observedAt=0;private deciding=false;private accepting?:string;private context?:AuditContext;
    constructor(private options:Options){
        const sessionId=randomUUID();this.view={configured:!!options.client,connected:false,running:false,busy:false,providerMode:options.providerMode,games:[],challenges:[],sessionId,logLocation:join(options.logRoot,sessionId)};
        if(options.journal)this.context={journal:options.journal,sessionId,requestId:randomUUID(),sequence:0,started:performance.now()};
    }
    status():LichessStatus{return structuredClone({...this.view,games:[...this.games].map(id=>({id})),challenges:[...this.challenges.values()].map(c=>({id:c.id,challenger:c.challenger.name,variant:c.variant.key,rated:c.rated,clock:c.timeControl.type==='clock'?`${c.timeControl.limit??0}s + ${c.timeControl.increment??0}s`:c.timeControl.type,supported:this.supported(c)}))});}
    private minClock(){return this.options.minClockSeconds??300;}
    private supported(c:Challenge){return c.variant.key==='standard'&&c.timeControl.type==='clock'&&estimatedGameSeconds(c.timeControl.limit??0,c.timeControl.increment??0)>=this.minClock();}
    private scope<T>(fn:()=>T):T{return this.context?auditContext.run(this.context,fn):fn();}
    private record(event:string,data:unknown):Promise<void>{return this.scope(()=>this.options.record?this.options.record(event,data):audit(event,data));}
    private fail(error:unknown){this.invalidate();this.view.error=message(error);}
    private invalidate(){this.epoch++;this.decisionAbort?.abort(new Error('Lichess gameplay stopped or position changed'));this.view.running=false;this.view.stage=undefined;}
    private task(work:()=>Promise<void>){const promise=this.scope(work).catch(e=>{this.fail(e);});this.tasks.add(promise);void promise.finally(()=>this.tasks.delete(promise));}
    async connect(){
        if(this.connection&&!this.connection.signal.aborted)return this.status();
        if(!this.options.client)throw new Error('Set LICHESS_TOKEN in the backend .env, then restart the backend');
        const abort=new AbortController();this.connection=abort;this.view.error=undefined;this.view.busy=true;
        try{
            await this.record('lichess.connect',{version:'1.3.0',providerMode:this.options.providerMode,model:this.options.model});
            const account=await this.options.client.account(abort.signal);abort.signal.throwIfAborted();
            if(account.title!=='BOT')throw new Error('This is not a BOT account. Follow docs/lichess-setup.md; account conversion is never automatic.');
            this.view.account=account;this.view.connected=true;
            this.task(()=>this.streamLoop(()=>this.options.client!.events(abort.signal),event=>this.event(event),abort.signal,false));
        }catch(error){this.view.connected=false;abort.abort();this.fail(error);throw error;}
        finally{this.view.busy=false;}
        return this.status();
    }
    async disconnect(){
        this.connection?.abort();this.gameStream?.abort();this.selection++;this.view.connected=false;if(this.view.game)this.view.game.connected=false;
        this.invalidate();this.accepting=undefined;this.games.clear();this.challenges.clear();
        await this.record('lichess.disconnect',{pending:this.view.pending});return this.status();
    }
    async stop(){this.invalidate();await this.record('lichess.stop',{pending:this.view.pending});return this.status();}
    async close(){if(this.connection)await this.disconnect();await Promise.allSettled([...this.tasks]);}
    async accept(id:string){
        lichessIdSchema.parse(id);const c=this.challenges.get(id);
        if(!this.view.connected||!this.connection)throw new Error('Connect the BOT account first');
        if(!c||c.direction==='out'||c.variant.key!=='standard'||c.timeControl.type!=='clock')throw new Error('Only incoming standard clock challenges are supported');
        if(!this.supported(c))throw new Error(`Time control too fast for Jev decisions: needs at least ${this.minClock()}s estimated (limit + 40 x increment)`);
        if(this.games.size||this.accepting)throw new Error('Only one active or accepted game is supported');
        this.accepting=id;
        await this.record('lichess.challenge.accept.intent',{id,rated:c.rated,challenger:c.challenger});
        // An uncertain accept is not retried; reserve this slot until reconnect/gameStart.
        await this.options.client!.accept(id,this.connection.signal);
        await this.record('lichess.challenge.accept.result',{id,accepted:true});return this.status();
    }
    async select(id:string){
        lichessIdSchema.parse(id);
        if(!this.view.connected||!this.connection||!this.games.has(id))throw new Error('Select a current game from the authenticated event stream');
        this.invalidate();this.gameStream?.abort();const selection=++this.selection;this.current=undefined;this.view.game=undefined;this.view.pending=undefined;this.view.decision=undefined;this.view.error=undefined;
        const abort=new AbortController();this.gameStream=abort;const signal=AbortSignal.any([abort.signal,this.connection.signal]);
        const pending=await this.options.pending.load(this.view.account!.id,id);signal.throwIfAborted();
        if(selection!==this.selection)throw new Error('Game selection changed');this.view.pending=pending;
        await this.record('lichess.game.select',{id,pending});
        this.task(()=>this.streamLoop(()=>this.options.client!.game(id,signal),event=>this.gameEvent(id,event,selection),signal,true,()=>this.finished.has(id)));return this.status();
    }
    async start(){
        const epoch=this.epoch;
        if(this.view.pending)throw new Error('An execution is unconfirmed. Wait for authoritative stream reconciliation; it will not be resent.');
        if(!this.view.connected||!this.view.game?.connected||!this.current)throw new Error('Select a game and wait for its full verified position');
        if(this.current.full.state.status!=='started'||this.current.chess.isGameOver())throw new Error('Game is finished or not started');
        if(this.deciding)throw new Error('Previous decision is still stopping');
        await this.record('lichess.start',{id:this.current.full.id,color:this.current.color,fen:this.current.input.fen});
        if(epoch!==this.epoch||!this.view.connected||!this.view.game?.connected)throw new Error('Session changed while starting');
        this.view.error=undefined;this.view.running=true;this.kick();return this.status();
    }
    private async streamLoop(open:()=>AsyncIterable<unknown>,consume:(event:unknown)=>Promise<void>,signal:AbortSignal,game:boolean,done:()=>boolean=()=>false){
        let failures=0;
        while(!signal.aborted){
            try{
                let first=true;
                for await(const event of open()){
                    signal.throwIfAborted();
                    if(game&&first&&(event as {type?:string})?.type!=='gameFull')throw new Error('Game stream did not begin with a full position');
                    first=false;await consume(event);failures=0;
                }
                // Lichess closes a game stream once the game is over; that is the normal end, not a failure.
                if(!signal.aborted&&done())return;
                if(!signal.aborted)throw new Error('Lichess stream ended');
            }catch(error){
                if(signal.aborted)return;
                this.invalidate();if(game){if(this.view.game)this.view.game.connected=false;}else{this.view.connected=false;this.gameStream?.abort();this.games.clear();this.challenges.clear();this.accepting=undefined;if(this.view.game)this.view.game.connected=false;}
                this.view.error=`Lichess stream interrupted: ${message(error)}. Reconnecting; press Start after verification.`;
                await this.record('lichess.stream.failure',{game,error,attempt:failures+1,pending:this.view.pending});
                if(++failures>=5){if(!game)this.connection?.abort();throw new Error('Repeated Lichess stream failure; disconnect and reconnect to retry');}
                await delay(error instanceof LichessHttpError&&error.status===429?60000:Math.min(1000*2**(failures-1),10000),signal);
            }
        }
    }
    private async event(value:unknown){
        const event=z.object({type:z.string(),game:z.object({id:lichessIdSchema}).optional(),challenge:z.unknown().optional()}).parse(value);
        this.view.connected=true;
        if(event.type==='challenge'){
            const c=challengeSchema.parse(event.challenge);if(c.direction!=='out'&&c.challenger.id.toLowerCase()!==this.view.account!.id.toLowerCase())this.challenges.set(c.id,c);
        }else if(['challengeCanceled','challengeDeclined'].includes(event.type)){
            const c=z.object({id:lichessIdSchema}).parse(event.challenge);this.challenges.delete(c.id);if(this.accepting===c.id)this.accepting=undefined;
        }else if(event.type==='gameStart'&&event.game){this.games.add(event.game.id);this.accepting=undefined;}
        else if(event.type==='gameFinish'&&event.game){this.games.delete(event.game.id);if(this.view.game?.id===event.game.id)this.invalidate();}
        await this.record('lichess.event',{type:event.type,game:event.game,challenge:event.type==='challenge'?challengeSchema.parse(event.challenge):undefined});
    }
    private async gameEvent(id:string,value:unknown,selection:number){
        if(selection!==this.selection)return;
        const type=z.object({type:z.string()}).parse(value).type;
        // Ignore chat and opponentGone: neither is position evidence nor a strategic input.
        if(type!=='gameFull'&&type!=='gameState')return;
        const full:FullGame=type==='gameFull'?fullGameSchema.parse(value):{...this.current!.full,state:gameStateSchema.parse(value)};
        if(full.id!==id)throw new Error('Game stream identity mismatch');
        if(this.current&&type==='gameFull'&&(full.initialFen!==this.current.full.initialFen||playerKey(full.white)!==playerKey(this.current.full.white)||playerKey(full.black)!==playerKey(this.current.full.black)))throw new Error('Game identity or initial position changed');
        const next=reconstructGame(full,this.view.account!.id),old=this.current;
        const changed=!!old&&next.moves.join(' ')!==old.moves.join(' ');
        const awaiting=this.view.pending;
        const confirms=!!awaiting&&next.moves.length>awaiting.moves.length&&awaiting.moves.every((m,i)=>next.moves[i]===m)&&next.moves[awaiting.moves.length]===awaiting.uci;
        if(changed){
            // Finish durable confirmation before interrupting a successful move transaction.
            if(!confirms)this.decisionAbort?.abort(new Error('Authoritative position changed'));this.epoch++;
            if(!old!.moves.every((m,i)=>next.moves[i]===m)){this.invalidate();this.view.error='History changed or a takeback occurred. Inspect the position before pressing Start.';}
        }
        this.current=next;this.observedAt=performance.now();
        this.view.game={id,color:next.color,opponent:playerLabel(next.color==='white'?full.black:full.white),fen:next.input.fen,moves:next.moves,status:full.state.status,wtime:full.state.wtime,btime:full.state.btime,connected:true};
        await this.record('lichess.position',{id,color:next.color,fen:next.input.fen,moves:next.moves,state:full.state,history:next.input.gamePgn});
        if(selection!==this.selection)return;
        const pending=this.view.pending;
        if(pending&&next.moves.length>pending.moves.length){
            const confirmed=pending.moves.every((m,i)=>next.moves[i]===m)&&next.moves[pending.moves.length]===pending.uci;
            await this.record('execution.outcome',{actionId:pending.id,confirmed,pending,observedMoves:next.moves,fen:next.input.fen});
            if(selection!==this.selection)return;
            if(!confirmed){this.invalidate();this.view.error='Observed history contradicts the unconfirmed move. Input is paused.';return;}
            await this.options.pending.clear(pending.accountId,pending.gameId);if(selection!==this.selection)return;this.view.pending=undefined;
            if(this.view.error?.startsWith('Move is unconfirmed:'))this.view.error=undefined;
            this.decisionAbort?.abort(new MoveConfirmed());
        }
        if(full.state.status!=='started'||next.chess.isGameOver()){this.invalidate();if(!this.finished.has(id)){this.finished.add(id);await this.record('lichess.finished',{id,status:full.state.status,winner:full.state.winner??null,color:next.color,plies:next.moves.length,white:playerLabel(full.white),black:playerLabel(full.black),pgn:next.chess.pgn()});}return;}
        this.kick();
    }
    private kick(){if(this.deciding||!this.view.running||this.view.pending||!this.view.connected||!this.view.game?.connected||!this.current||this.current.chess.turn()!==(this.current.color==='white'?'w':'b'))return;this.deciding=true;this.task(async()=>{try{await this.decide();}finally{this.deciding=false;this.view.busy=false;queueMicrotask(()=>this.kick());}});}
    private remaining(){const full=this.current!.full,clock=this.current!.color==='white'?full.state.wtime:full.state.btime;const expiry=full.state.expiration;return Math.min(clock,expiry?Math.max(0,expiry.millisToMove-expiry.idleMillis):Infinity)-(performance.now()-this.observedAt);}
    private async decide(){
        const original=this.current!,epoch=this.epoch,selection=this.selection,abort=new AbortController();this.decisionAbort=abort;this.view.busy=true;
        const full=original.full,turn=planTurn(this.remaining(),original.color==='white'?full.state.winc:full.state.binc,original.moves.length);
        const budget=turn.deadlineMs;if(budget<1000)throw new Error('Too little clock time for a verified Jev decision');
        const analysis:Analysis={depth:turn.depth,tacticalFacts:true,blunderCheck:turn.blunderCheck};
        const input={...original.input,analysis};this.view.depth=turn.depth;
        const signal=deadlineSignal(abort.signal,budget);
        const checkpoint=()=>{signal.throwIfAborted();if(epoch!==this.epoch||selection!==this.selection||!this.view.running||!this.view.connected||!this.view.game?.connected||this.current?.input.fen!==original.input.fen)throw new Error('Stale Lichess decision');};
        let trace:StageTrace[]=[];let decision:Decision|undefined;let savedIntent:PendingMove|undefined;let submitted=false;
        try{
            const cached=original.input.legalMoves.length===1?undefined:this.cache.lookup(original.chess,this.options.model,turn.depth);
            if(original.input.legalMoves.length===1)decision={uci:original.input.legalMoves[0].uci,source:'forced' as const,model:this.options.model,latencyMs:0};
            else if(cached&&original.input.legalMoves.some(m=>m.uci===cached.uci)){decision={uci:cached.uci,source:'cache',model:this.options.model,latencyMs:0};await this.record('decision.cache.hit',{fen:original.input.fen,uci:cached.uci,kind:cached.kind,depth:turn.depth});}
            else{
                if(!this.options.provider.chooseStep)throw new Error('Lichess mode requires a staged Jev provider');
                const start=performance.now();
                await this.record('decision.plan',{...turn,fen:original.input.fen});
                for(let step=0;step<8;step++){
                    const stage=nextStage(input,trace);if(!stage)throw new Error('Decision ended without a final choice');
                    checkpoint();this.view.stage=stage;
                    await this.record('decision.stage.start',{stage,input,trace});checkpoint();
                    const stageSignal=deadlineSignal(signal,10000);
                    const result=stepResponseSchema.parse(await abortable(this.options.provider.chooseStep(input,trace,stageSignal),stageSignal));checkpoint();
                    if(result.trace.length!==trace.length+1||result.trace.at(-1)?.stage!==stage)throw new Error('Invalid staged decision progression');
                    trace=result.trace;const intent=trace[0]?.answers.intent?.choice;if(intent==='offensive'||intent==='defensive')this.view.intent=intent;
                    await this.record('decision.stage.result',{stage,result});
                    if(result.decision){if(stage!=='choose'&&stage!=='verify')throw new Error('Provider returned a premature strategic choice');decision={...result.decision,latencyMs:performance.now()-start};break;}
                }
                if(decision){
                    this.cache.store(original.chess,this.options.model,turn.depth,decision.uci);
                    const planned=plannedReplyFromTrace(trace,decision.uci);if(planned)this.cache.plan(original.chess,decision.uci,planned.reply,planned.continuation,this.options.model);
                }
            }
            checkpoint();const chosen=decision;if(!chosen||!original.input.legalMoves.some(m=>m.uci===chosen.uci))throw new Error('Jev did not return a complete legal choice');
            if(this.remaining()<500)throw new Error('Clock expired before move submission');
            this.view.decision=chosen;this.view.stage=undefined;
            const cost=trace.reduce((n,t)=>n+(t.usage&&typeof t.usage==='object'&&'cost'in t.usage&&typeof t.usage.cost==='number'?t.usage.cost:0),0);
            await this.record('lichess.decision.summary',{gameId:original.full.id,ply:original.moves.length,depth:turn.depth,deadlineMs:turn.deadlineMs,targetMs:turn.targetMs,uci:chosen.uci,source:chosen.source,stages:trace.map(t=>t.stage),verified:trace.some(t=>t.stage==='verify'),changedByVerify:trace.some(t=>t.stage==='verify')&&trace.find(t=>t.stage==='choose')?.answers.move?.choice!==chosen.uci,latencyMs:chosen.latencyMs,cost});checkpoint();
            const pending:PendingMove={id:randomUUID(),accountId:this.view.account!.id,gameId:original.full.id,moves:original.moves,uci:chosen.uci};
            const expected=reconstructGame(original.full,pending.accountId).chess;expected.move({from:chosen.uci.slice(0,2),to:chosen.uci.slice(2,4),promotion:chosen.uci[4]});
            await this.record('execution.intent',{...pending,decision:chosen,expectedFen:expected.fen()});checkpoint();
            await this.options.pending.save(pending);savedIntent=pending;if(selection===this.selection)this.view.pending=pending;checkpoint();
            // HTTP success alone is not confirmation. Preserve this checkpoint across Stop/restarts.
            submitted=true;await this.options.client!.move(pending.gameId,pending.uci,deadlineSignal(signal,12000));
            await this.record('execution.submitted',{actionId:pending.id,confirmed:false});
            await delay(10000,signal);
            if(this.view.pending?.id===pending.id)throw new Error('No authoritative move confirmation arrived within ten seconds');
        }catch(error){
            if(savedIntent&&(!submitted||error instanceof LichessNotDispatchedError)){
                await this.record('execution.outcome',{actionId:savedIntent.id,confirmed:false,notSubmitted:true,error});
                await this.options.pending.clear(savedIntent.accountId,savedIntent.gameId);
                if(this.view.pending?.id===savedIntent.id)this.view.pending=undefined;
            }
            if(selection===this.selection&&(!abort.signal.aborted||this.view.pending)){this.invalidate();this.view.error=this.view.pending?`Move is unconfirmed: ${message(error)}. It will not be resent.`:message(error);}
            if(abort.signal.reason instanceof MoveConfirmed)await this.record('lichess.decision.confirmed',{actionId:savedIntent?.id,uci:savedIntent?.uci});
            else await this.record('lichess.decision.failure',{error,pending:savedIntent,submitted});
        }
    }
}
