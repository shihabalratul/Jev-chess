import { describe, expect, it, vi } from 'vitest';
import { LichessClient, readNdjson, reconstructGame } from '../apps/server/src/lichess/client';
import { LichessController } from '../apps/server/src/lichess/controller';
import { MockProvider } from '../apps/server/src/providers/mock';
import type { LichessPort } from '../apps/server/src/lichess/client';
import type { PendingMove } from '../packages/shared/src/lichess';
import { DiskPendingStore } from '../apps/server/src/lichess/pending';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function response(parts:string[]) {
    return new Response(new ReadableStream({start(c){for(const p of parts)c.enqueue(new TextEncoder().encode(p));c.close();}}));
}
describe('Lichess public API transport',()=>{
    it('opens the official Bot game stream endpoint',async()=>{
        let url='';const client=new LichessClient('token',async input=>{url=String(input);return response(['{"type":"gameFull"}\n']);});
        for await(const _ of client.game('abcdefgh',new AbortController().signal)){}
        expect(url).toBe('https://lichess.org/api/bot/game/stream/abcdefgh');
    });
    it('accepts Lichess account IDs with hyphens and underscores',async()=>{
        const client=new LichessClient('token',async()=>Response.json({id:'jev-bot_1',username:'Jev-Bot_1',title:'BOT'}));expect((await client.account(new AbortController().signal)).id).toBe('jev-bot_1');
        const value={...full('e2e4'),black:{id:'jev-bot_1',name:'Jev-Bot_1'}};expect(reconstructGame(value,'jev-bot_1').color).toBe('black');
        expect(reconstructGame({...value,white:{id:'other_player',name:'Other_Player'}},'jev-bot_1').color).toBe('black');
    });
    it('reads split lines and keepalives without losing a final event',async()=>{
        const events=[];for await(const event of readNdjson(response(['\n{"type":"ga','meState"}\n\n','{"type":"gameFinish"}']),new AbortController().signal))events.push(event);
        expect(events).toEqual([{type:'gameState'},{type:'gameFinish'}]);
    });
    it('cancels the underlying fetch when stopped after headers during JSON consumption',async()=>{
        let sentSignal:AbortSignal|undefined;const stop=new AbortController();
        const client=new LichessClient('token',async(_url,init)=>{sentSignal=init?.signal as AbortSignal;return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}}));});
        const work=client.account(stop.signal).catch(e=>e);await vi.waitFor(()=>expect(sentSignal).toBeDefined());stop.abort();await work;expect(sentSignal!.aborted).toBe(true);
    });
    it('rejects malformed or oversized stream evidence',async()=>{
        await expect(async()=>{for await(const _ of readNdjson(response(['{bad}\n']),new AbortController().signal)){} }).rejects.toThrow();
        await expect(async()=>{for await(const _ of readNdjson(response(['x'.repeat(1100000)]),new AbortController().signal)){} }).rejects.toThrow(/large/i);
    });
    it('keeps credentials on the fixed API origin and never retries a move',async()=>{
        const calls:{url:string,auth:string|null}[]=[];
        const client=new LichessClient('private-token',async(input,init)=>{calls.push({url:String(input),auth:new Headers(init?.headers).get('Authorization')});throw new Error('connection lost');});
        await expect(client.move('abcdefgh','a7a8n',new AbortController().signal)).rejects.toThrow();
        expect(calls).toEqual([{url:'https://lichess.org/api/bot/game/abcdefgh/move/a7a8n',auth:'Bearer private-token'}]);
        await expect(client.move('../evil','a7a8n',new AbortController().signal)).rejects.toThrow();expect(calls).toHaveLength(1);
    });
    it('waits a full minute after 429 and cancels a queued request without sending it',async()=>{
        vi.useFakeTimers();try{
            let calls=0;const client=new LichessClient('token',async()=>{calls++;return calls===1?new Response('',{status:429}):Response.json({id:'jevbot',username:'JevBot',title:'BOT'});});
            const first=client.account(new AbortController().signal).catch(e=>e);await vi.advanceTimersByTimeAsync(1);expect((await first).status).toBe(429);
            const stopped=new AbortController(),second=client.account(stopped.signal).catch(e=>e);await vi.advanceTimersByTimeAsync(100);stopped.abort();await second;expect(calls).toBe(1);
            const third=client.account(new AbortController().signal);await vi.advanceTimersByTimeAsync(59898);expect(calls).toBe(1);await vi.advanceTimersByTimeAsync(2);expect((await third).id).toBe('jevbot');expect(calls).toBe(2);
        }finally{vi.useRealTimers();}
    });
});

class Feed {
    queue:unknown[]=[];wake?:()=>void;
    push(event:unknown){this.queue.push(event);this.wake?.();}
    async *read(signal:AbortSignal){while(!signal.aborted){if(this.queue.length){yield this.queue.shift();continue;}await new Promise<void>(r=>{this.wake=r;signal.addEventListener('abort',r as ()=>void,{once:true});}).finally(()=>{this.wake=undefined;});}}
}
async function fixture(options:{white?:boolean;failLog?:boolean;pending?:PendingMove;provider?:MockProvider;move?:(uci:string,signal:AbortSignal)=>Promise<void>;record?:(event:string)=>Promise<void>;save?:()=>Promise<void>}={}){
    const events=new Feed(),game=new Feed(),sent:string[]=[],records:{event:string;data:any}[]=[];let pending=options.pending;
    const port:LichessPort={account:async()=>({id:'jevbot',username:'JevBot',title:'BOT'}),events:s=>events.read(s),game:(_id,s)=>game.read(s),accept:async()=>{},move:async(_id,uci,signal)=>{sent.push(uci);await options.move?.(uci,signal);}};
    const provider=options.provider??new MockProvider();
    const controller=new LichessController({client:port,provider,model:'mock',providerMode:'mock',logRoot:'/test/logs',record:async(event,data)=>{if(options.failLog&&event==='execution.intent')throw new Error('disk full');await options.record?.(event);records.push({event,data});},pending:{load:async()=>pending,save:async p=>{await options.save?.();pending=p;},clear:async()=>{pending=undefined;}}});
    await controller.connect();events.push({type:'gameStart',game:{id:'abcdefgh'}});
    await vi.waitFor(()=>expect(controller.status().games).toHaveLength(1));
    await controller.select('abcdefgh');game.push(options.white?{...full(),white:{id:'jevbot',name:'JevBot'},black:{id:'other',name:'Other'}}:full('e2e4'));
    await vi.waitFor(()=>expect(controller.status().game?.color).toBe(options.white?'white':'black'));
    return {controller,events,game,sent,records,provider};
}
describe('Lichess gameplay safety',()=>{
    it('plays the first turn as White through all six stages from the untouched starting state',async()=>{
        const f=await fixture({white:true});try{await f.controller.start();await vi.waitFor(()=>expect(f.sent).toHaveLength(1));f.game.push({...full().state,moves:f.sent[0]});await vi.waitFor(()=>expect(f.controller.status().pending).toBeUndefined());expect(f.controller.status().game?.color).toBe('white');expect(f.controller.status().running).toBe(true);expect(f.records.filter(r=>r.event==='decision.stage.start').map(r=>r.data.stage)).toEqual(['assess','reply','nominate','shortlist','continue','choose']);}finally{await f.controller.disconnect();}
    });
    it('can reconnect after exhausting account stream retries',async()=>{
        vi.useFakeTimers();let healthy=false,calls=0;const port:LichessPort={account:async()=>{calls++;return{id:'jevbot',username:'JevBot',title:'BOT'};},async *events(signal){if(!healthy)throw new Error('offline');await new Promise<void>(r=>signal.addEventListener('abort',()=>r(),{once:true}));},async *game(){},move:async()=>{},accept:async()=>{}};
        const controller=new LichessController({client:port,provider:new MockProvider(),model:'mock',providerMode:'mock',logRoot:'/test',record:async()=>{},pending:{load:async()=>undefined,save:async()=>{},clear:async()=>{}}});
        try{await controller.connect();await vi.advanceTimersByTimeAsync(15001);expect(controller.status().connected).toBe(false);healthy=true;await controller.connect();expect(calls).toBe(2);expect(controller.status().connected).toBe(true);}finally{await controller.disconnect();vi.useRealTimers();}
    });
    it('requires Start, confirms a single submitted move using stream history',async()=>{
        const f=await fixture();try{
            expect(f.sent).toEqual([]);await f.controller.start();
            await vi.waitFor(()=>expect(f.sent).toHaveLength(1));
            expect(f.controller.status().pending?.uci).toBe(f.sent[0]);
            f.game.push({...full().state,moves:`e2e4 ${f.sent[0]}`});
            await vi.waitFor(()=>expect(f.controller.status().pending).toBeUndefined());
            expect(f.controller.status().running).toBe(true);expect(f.controller.status().error).toBeUndefined();
            expect(f.records.some(r=>r.event==='execution.outcome'&&r.data.confirmed)).toBe(true);
            expect(f.sent).toHaveLength(1);
        }finally{await f.controller.disconnect();}
    });
    it('Stop blocks a late model response from sending input',async()=>{
        let release!:(v:any)=>void;const provider=new MockProvider();provider.chooseStep=()=>new Promise(r=>{release=r;});
        const f=await fixture({provider});try{
            await f.controller.start();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
            await f.controller.stop();release({trace:[],decision:{uci:'b8c6',source:'mock',model:'mock',latencyMs:1}});
            await new Promise(r=>setTimeout(r,10));expect(f.sent).toEqual([]);expect(f.controller.status().running).toBe(false);
        }finally{await f.controller.disconnect();}
    });
    it('pauses before input when durable intent cannot be saved',async()=>{
        const f=await fixture({failLog:true});try{await f.controller.start();await vi.waitFor(()=>expect(f.controller.status().error).toMatch(/disk full/));expect(f.sent).toEqual([]);}finally{await f.controller.disconnect();}
    });
    it('never retries an uncertain POST on a subsequent Start',async()=>{
        const f=await fixture({move:async()=>{throw new Error('network lost');}});try{
            await f.controller.start();await vi.waitFor(()=>expect(f.controller.status().running).toBe(false));
            expect(f.sent).toHaveLength(1);await expect(f.controller.start()).rejects.toThrow(/unconfirmed/i);expect(f.sent).toHaveLength(1);
        }finally{await f.controller.disconnect();}
    });
    it('loads an interrupted intent on restart and confirms a rapid opponent reply',async()=>{
        const f=await fixture({pending:{gameId:'abcdefgh',accountId:'jevbot',moves:['e2e4'],uci:'e7e5',id:'saved-action'}});try{
            await expect(f.controller.start()).rejects.toThrow(/unconfirmed/i);
            f.game.push({...full().state,moves:'e2e4 e7e5 g1f3'});
            await vi.waitFor(()=>expect(f.controller.status().pending).toBeUndefined());expect(f.sent).toEqual([]);
            expect(f.controller.status().running).toBe(false);
        }finally{await f.controller.disconnect();}
    });
    it('does not rearm a Start whose logging completed after Stop',async()=>{
        let release!:()=>void;const f=await fixture({record:async event=>{if(event==='lichess.start')await new Promise<void>(r=>{release=r;});}});try{
            const starting=f.controller.start();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));await f.controller.stop();release();await expect(starting).rejects.toThrow(/changed/i);expect(f.sent).toEqual([]);
        }finally{await f.controller.disconnect();}
    });
    it('records that a saved intent was cancelled before submission when Stop wins the race',async()=>{
        let release!:()=>void;const f=await fixture({save:()=>new Promise<void>(r=>{release=r;})});try{
            await f.controller.start();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));await f.controller.stop();release();
            await vi.waitFor(()=>expect(f.controller.status().busy).toBe(false));expect(f.sent).toEqual([]);expect(f.controller.status().pending).toBeUndefined();expect(f.records.some(r=>r.event==='execution.outcome'&&r.data.notSubmitted)).toBe(true);
        }finally{await f.controller.disconnect();}
    });
    it('clears only a definitely undispatched move when Stop cancels the API queue',async()=>{
        let release!:(r:Response)=>void;const urls:string[]=[];const client=new LichessClient('token',async input=>{urls.push(String(input));return new Promise<Response>(r=>{release=r;});});
        const first=client.account(new AbortController().signal);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
        const f=await fixture({move:(uci,signal)=>client.move('abcdefgh',uci,signal)});try{
            await f.controller.start();await vi.waitFor(()=>expect(f.sent).toHaveLength(1));await f.controller.stop();release(Response.json({id:'jevbot',username:'JevBot',title:'BOT'}));await first;
            await vi.waitFor(()=>expect(f.controller.status().busy).toBe(false));expect(urls).toEqual(['https://lichess.org/api/account']);expect(f.controller.status().pending).toBeUndefined();
        }finally{await f.controller.disconnect();}
    });
    it('cancels a decision when another client changes the authoritative position',async()=>{
        let release!:(v:any)=>void;const provider=new MockProvider();provider.chooseStep=()=>new Promise(r=>{release=r;});
        const f=await fixture({provider});try{await f.controller.start();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));f.game.push({...full().state,moves:'e2e4 e7e5'});await vi.waitFor(()=>expect(f.controller.status().game?.moves).toHaveLength(2));release({trace:[],decision:{uci:'b8c6',source:'mock',model:'mock',latencyMs:1}});await new Promise(r=>setTimeout(r,10));expect(f.sent).toEqual([]);}finally{await f.controller.disconnect();}
    });
    it('does not accept unsupported challenges or start another active game',async()=>{
        const f=await fixture();try{
            f.events.push({type:'challenge',challenge:{id:'challenge1',challenger:{id:'other',name:'Other'},variant:{key:'chess960'},rated:false,direction:'in',timeControl:{type:'clock',limit:600,increment:5}}});
            await vi.waitFor(()=>expect(f.controller.status().challenges).toHaveLength(1));expect(f.controller.status().challenges[0].supported).toBe(false);await expect(f.controller.accept('challenge1')).rejects.toThrow(/standard/);
            f.events.push({type:'challenge',challenge:{id:'challenge2',challenger:{id:'other',name:'Other'},variant:{key:'standard'},rated:false,direction:'in',timeControl:{type:'clock',limit:600,increment:5}}});await vi.waitFor(()=>expect(f.controller.status().challenges).toHaveLength(2));await expect(f.controller.accept('challenge2')).rejects.toThrow(/one active/);
        }finally{await f.controller.disconnect();}
    });
});
it('retains an interrupted intent on disk for a new controller and removes only confirmed checkpoints',async()=>{
    const root=await mkdtemp(join(tmpdir(),'jev-lichess-intent-'));try{const saved:PendingMove={id:'action-1',gameId:'abcdefgh',accountId:'jevbot',moves:['e2e4'],uci:'e7e5'};await new DiskPendingStore(root).save(saved);expect(await new DiskPendingStore(root).load('jevbot','abcdefgh')).toEqual(saved);expect(await new DiskPendingStore(root).load('different','abcdefgh')).toBeUndefined();await new DiskPendingStore(root).clear('jevbot','abcdefgh');expect(await new DiskPendingStore(root).load('jevbot','abcdefgh')).toBeUndefined();}finally{await rm(root,{recursive:true,force:true});}
});
const full=(moves='',initialFen='startpos')=>({type:'gameFull',id:'abcdefgh',variant:{key:'standard'},initialFen,white:{id:'other',name:'Other'},black:{id:'jevbot',name:'JevBot'},state:{type:'gameState',moves,wtime:1800000,btime:1800000,winc:20000,binc:20000,status:'started'}});
describe('Lichess authoritative game replay',()=>{
    it('derives Black from account ID and retains full verified history',()=>{
        const game=reconstructGame(full('e2e4'),'jevbot');
        expect(game.color).toBe('black');expect(game.input.playingColor).toBe('black');
        expect(game.input.fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
        expect(game.input.gamePgn).toContain('1. e4');
        expect(()=>reconstructGame(full(),'spectator')).toThrow(/account/i);
        expect(()=>reconstructGame(full('e2e5'),'jevbot')).toThrow();
    });
    it('normalizes king-to-rook castling in standard stream history',()=>{
        const game=reconstructGame(full('e1h1','4k3/8/8/8/8/8/8/4K2R w K - 0 1'),'jevbot');
        expect(game.input.fen).toBe('4k3/8/8/8/8/8/8/5RK1 b - - 1 1');
        expect(game.moves).toEqual(['e1g1']);
    });
    it('preserves the exact promotion choice',()=>{
        const game=reconstructGame(full('a7a8n','7k/P7/8/8/8/8/8/7K w - - 0 1'),'jevbot');
        expect(game.input.fen).toBe('N6k/8/8/8/8/8/8/7K b - - 0 1');
    });
});
