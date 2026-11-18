import { randomUUID, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { SessionJournal, auditContext, audit } from './services/journal';
import { gameForDecision } from './services/decisions';
import Fastify from 'fastify';
import { EXTENSION_ID } from '../../../packages/shared/src/extension-id';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z, ZodError } from 'zod';
import { LichessClient, type LichessPort } from './lichess/client';
import { LichessController } from './lichess/controller';
import { DiskPendingStore } from './lichess/pending';
import { lichessIdSchema } from '../../../packages/shared/src/lichess';
import { parseRequestSchema, chooseRequestSchema, stepRequestSchema, recoveryRequestSchema, recoveryResultSchema, logBatchSchema } from '../../../packages/shared/src';
import { ChessStateManager } from '../../../packages/chess-core/src';
import { OpenRouterProvider, ProviderError } from './providers/openrouter';
import { MockProvider } from './providers/mock';
import type { Provider } from './providers/types';
export interface ServerOptions {
    providerMode?: string;
    provider?: Provider;
    logger?: boolean;
    logDir?: string;
    lichessClient?: LichessPort;
}
export async function buildServer(options: ServerOptions = {}) {
    const providerMode = options.providerMode ?? process.env.PROVIDER_MODE ?? 'live';
    if (!['live', 'mock'].includes(providerMode))
        throw new Error('PROVIDER_MODE must be live or mock');
    const models = { vision: process.env.VISION_MODEL ?? process.env.CLAUDE_MODEL ?? 'openai/gpt-6-luna', jev: process.env.JEV_MODEL ?? 'typesafe/jev-1.13' };
    const provider = options.provider ?? (providerMode === 'mock' ? new MockProvider() : new OpenRouterProvider({ apiKey: process.env.OPENROUTER_API_KEY ?? '', visionModel: models.vision, jevModel: models.jev, timeoutMs: Math.min(60000, Math.max(1000, Number(process.env.API_TIMEOUT_MS ?? 12000))), retries: Math.min(2, Math.max(0, Number(process.env.API_RETRIES ?? 1))) }));
    const journal = new SessionJournal(options.logDir ?? process.env.LOG_DIR ?? resolve('logs'), [process.env.OPENROUTER_API_KEY ?? '', process.env.BACKEND_TOKEN ?? '', process.env.LICHESS_TOKEN ?? '']);
    const lichess = new LichessController({client:options.lichessClient??(process.env.LICHESS_TOKEN?new LichessClient(process.env.LICHESS_TOKEN):undefined),provider,providerMode,model:models.jev,journal,logRoot:journal.root,pending:new DiskPendingStore(journal.root),minClockSeconds:Math.max(0,Number(process.env.LICHESS_MIN_CLOCK_SECONDS??300))});
    const proofKey = randomBytes(32);
    const signTrace = (input: unknown, trace: unknown) => createHmac('sha256', proofKey).update(JSON.stringify({input,trace})).digest('hex');
    const app = Fastify({ logger: options.logger ?? false, bodyLimit: 4500000, requestTimeout: 70000, disableRequestLogging: true });
    const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:4173,http://127.0.0.1:4173').split(',');
    const ids = (process.env.ALLOWED_EXTENSION_IDS ?? EXTENSION_ID).split(',');
    function allowed(origin: string) { if (origins.includes(origin))
        return true; const match = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin); return !!match && (ids.includes('*') || ids.includes(match[1])); }
    await app.register(cors, { origin: (origin, cb) => cb(null, !origin || allowed(origin)), methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-Jev-Token', 'X-Jev-Session', 'X-Jev-Turn'] });
    await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });
    app.addHook('onClose',async()=>{await lichess.close();});
    app.addHook('onRequest', async (req, reply) => { if (req.headers.origin && !allowed(req.headers.origin))
        return reply.code(403).send({ error: 'Origin is not authorized' }); if (req.url.startsWith('/api/') && process.env.BACKEND_TOKEN && req.headers['x-jev-token'] !== process.env.BACKEND_TOKEN)
        return reply.code(401).send({ error: 'Backend pairing token required' }); });
    app.addHook('onRequest', (req, _reply, done) => {
        const raw=req.headers['x-jev-session'];
        const sessionId=typeof raw==='string' && /^[0-9a-f-]{36}$/i.test(raw) ? raw : randomUUID();
        auditContext.run({journal,sessionId,requestId:randomUUID(),turnId:typeof req.headers['x-jev-turn']==='string'?req.headers['x-jev-turn'].slice(0,100):undefined,sequence:0,started:performance.now()},done);
    });
    app.addHook('preHandler',async req=>{if(req.url.startsWith('/api/') && req.url!=='/api/logs') await audit('http.request',{method:req.method,path:req.url.split('?')[0],body:req.body,providerMode,models,version:'1.3.0'});});
    app.addHook('onSend',async(req,reply,payload)=>{if(req.url.startsWith('/api/') && req.url!=='/api/logs'){let body:unknown=payload;if(typeof payload==='string'){try{body=JSON.parse(payload);}catch{}}await audit('http.response',{status:reply.statusCode,path:req.url.split('?')[0],body});}return payload;});
    app.post('/api/logs', {config:{rateLimit:{max:120,timeWindow:'1 minute'}}}, async req=>{
        const batch=logBatchSchema.parse(req.body);
        for(const event of batch.events)await journal.append(event);
        return {acknowledged:batch.events.map(e=>e.id),logRoot:journal.root};
    });
    app.post('/api/recover-ui',async(req,reply)=>{
        const input=recoveryRequestSchema.parse(req.body);
        if(!provider.recover)throw new ProviderError('Configured provider does not support visual UI recovery',503);
        const abort=new AbortController(),cancel=()=>abort.abort();
        req.raw.on('aborted',cancel);const close=()=>{if(!reply.raw.writableEnded)cancel();};reply.raw.on('close',close);
        try{return recoveryResultSchema.parse(await provider.recover(input,abort.signal));}
        finally{req.raw.off('aborted',cancel);reply.raw.off('close',close);}
    });
    app.post('/api/choose-move/step',async(req,reply)=>{
        const {input,trace,proof}=stepRequestSchema.parse(req.body);
        try{gameForDecision(input);}catch(error){return reply.code(400).send({error:(error as Error).message});}
        if(trace.length){
            const expected=signTrace(input,trace);
            if(!proof || proof.length!==expected.length || !timingSafeEqual(Buffer.from(proof),Buffer.from(expected)))return reply.code(400).send({error:'Decision trace proof is invalid or belongs to another position'});
        }
        const abort=new AbortController(),cancel=()=>abort.abort();
        req.raw.on('aborted',cancel);const close=()=>{if(!reply.raw.writableEnded)cancel();};reply.raw.on('close',close);
        try{
            // Custom fixture providers remain explicit mocks; never substitute one for a live provider.
            if(!provider.chooseStep){if(providerMode!=='mock')throw new ProviderError('Provider does not support staged decisions',503);return {trace:[],decision:await provider.choose(input,abort.signal)};}
            const result=await provider.chooseStep(input,trace,abort.signal);
            return {...result,proof:signTrace(input,result.trace)};
        }finally{req.raw.off('aborted',cancel);reply.raw.off('close',close);}
    });
    app.setErrorHandler((err, req, reply) => {
        const error = err instanceof Error ? err : new Error('Unknown request failure');
        const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
        const status = err instanceof ZodError ? 400 : err instanceof ProviderError ? err.status : statusCode;
        req.log.warn({ status, path: req.url }, 'Request failed');
        reply.code(status).send({ error: err instanceof ZodError ? 'Invalid request or provider schema' : status >= 500 ? 'Provider request failed: ' + error.message : error.message });
    });
    app.get('/health', async () => ({ status: 'ok', providerMode, models, credentialsConfigured: !!process.env.OPENROUTER_API_KEY, liveAccessVerified: false }));
    for(const command of ['status','connect','disconnect','accept','select','start','stop'] as const){
        app.post(`/api/lichess/${command}`,{config:{rateLimit:{max:command==='status'?120:30,timeWindow:'1 minute'}}},async(req,reply)=>{
            if(!process.env.BACKEND_TOKEN)return reply.code(503).send({error:'Configure BACKEND_TOKEN in the backend and extension Settings before enabling Lichess controls'});
            const input=(command==='select'||command==='accept'?z.object({id:lichessIdSchema}).strict():z.object({}).strict()).parse(req.body??{});
            if(command==='status')return lichess.status();
            if(command==='connect'&&providerMode!=='live'&&!options.lichessClient)return reply.code(503).send({error:'Use PROVIDER_MODE=live for a real Lichess connection; mock Jev choices cannot play live games'});
            if(command==='accept'||command==='select')return lichess[command]((input as {id:string}).id);
            return lichess[command]();
        });
    }
    for (const [path, method] of [['/api/parse-board', 'parse'], ['/api/discover-parser', 'discover']] as const) {
        app.post(path, async (req, reply) => { const input = parseRequestSchema.parse(req.body); const abort = new AbortController(); const cancel = () => abort.abort(); const disconnected = () => { if (!reply.raw.writableEnded)
            abort.abort(); }; req.raw.on('aborted', cancel); reply.raw.on('close', disconnected); try {
            return await provider[method](input, abort.signal);
        }
        finally {
            req.raw.off('aborted', cancel);
            reply.raw.off('close', disconnected);
        } });
    }
    app.post('/api/choose-move', async (req, reply) => {
        const input = chooseRequestSchema.parse(req.body);
        try { gameForDecision(input); } catch(error) { return reply.code(400).send({error:(error as Error).message}); }
        let state: ChessStateManager;
        try {
            state = new ChessStateManager(input.fen);
        }
        catch (error) {
            return reply.code(400).send({ error: (error as Error).message });
        }
        const legal = state.legalMoves();
        if (state.turn !== input.playingColor || state.finished || input.legalMoves.length !== legal.length || new Set(input.legalMoves.map(m => m.uci)).size !== legal.length || input.legalMoves.some(m => !legal.some(l => l.uci === m.uci && l.san === m.san)))
            return reply.code(400).send({ error: 'Position, turn or legal moves do not match chess.js' });
        const abort = new AbortController();
        const cancel = () => abort.abort();
        const disconnected = () => { if (!reply.raw.writableEnded)
            abort.abort(); };
        req.raw.on('aborted', cancel);
        reply.raw.on('close', disconnected);
        try {
            if (legal.length === 1)
                return { uci: legal[0].uci, model: models.jev, source: 'forced', latencyMs: 0 };
            const decision = await provider.choose({ ...input, fen: state.fen, legalMoves: legal }, abort.signal);
            if (!legal.some(m => m.uci === decision.uci))
                throw new ProviderError('Provider selected an illegal move');
            return decision;
        }
        finally {
            req.raw.off('aborted', cancel);
            reply.raw.off('close', disconnected);
        }
    });
    return app;
}
