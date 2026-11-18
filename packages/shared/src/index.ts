import { z } from 'zod';
export const squareSchema = z.string().regex(/^[a-h][1-8]$/);
export const pieceSchema = z.enum(['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']);
export const orientationSchema = z.enum(['white', 'black']);
export const observationSchema = z.object({
    pieces: z.array(z.object({ square: squareSchema, piece: pieceSchema }).strict()).max(32),
    orientation: orientationSchema.nullable(), sideToMove: orientationSchema.nullable(),
    castlingRights: z.string().regex(/^(?:-|(?=.+$)K?Q?k?q?)$/).nullable(), enPassantSquare: squareSchema.nullable(),
    uncertainSquares: z.array(squareSchema).max(64),
    gamePgn: z.string().max(50000).nullable().optional(),
}).strict().superRefine((v, c) => { if (new Set(v.pieces.map(p => p.square)).size !== v.pieces.length)
    c.addIssue({ code: 'custom', message: 'Duplicate squares' }); });
export type Observation = z.infer<typeof observationSchema>;
export type Orientation = z.infer<typeof orientationSchema>;
export const rectSchema = z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().positive(), height: z.number().positive() });
export type Rect = z.infer<typeof rectSchema>;
const selector = z.string().min(1).max(240).refine(v => !/[{};]|:has\(/.test(v), 'Unsafe selector');
export const parserRuleSchema = z.object({
    version: z.literal(1), pieceSelector: selector,
    pieceSource: z.enum(['attribute', 'class', 'text']), pieceAttribute: z.string().regex(/^[\w-]+$/).optional(),
    pieceMap: z.record(z.string().min(1).max(80), pieceSchema),
    squareSource: z.enum(['attribute', 'class', 'geometry']), squareAttribute: z.string().regex(/^[\w-]+$/).optional(),
    squareFormat: z.enum(['algebraic', 'file-rank-digits']),
    orientation: orientationSchema,
}).strict().superRefine((v, c) => { if (v.pieceSource === 'attribute' && !v.pieceAttribute)
    c.addIssue({ code: 'custom', message: 'Missing piece attribute' }); if (v.squareSource === 'attribute' && !v.squareAttribute)
    c.addIssue({ code: 'custom', message: 'Missing square attribute' }); if (Object.keys(v.pieceMap).length > 64)
    c.addIssue({ code: 'custom', message: 'Too many piece mappings' }); });
export type ParserRule = z.infer<typeof parserRuleSchema>;
export const parseRequestSchema = z.object({ dom: z.string().max(100000).optional(), image: z.string().max(4000000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).optional(), orientation: orientationSchema.optional(), gameContext: z.string().max(20000).optional() }).strict().refine(v => !!(v.dom || v.image), 'DOM or image required');
export type ParseRequest = z.infer<typeof parseRequestSchema>;
export const legalMoveSchema = z.object({ uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/), san: z.string().max(16) });
/** Optional analysis profile. Absent means the original six-stage pipeline with no extra facts or verify stage. */
export const DECISION_DEPTHS = ['full', 'reduced', 'quick'] as const;
export const analysisSchema = z.object({ depth: z.enum(DECISION_DEPTHS).default('full'), tacticalFacts: z.boolean().default(false), blunderCheck: z.boolean().default(false) }).strict();
export type Analysis = z.infer<typeof analysisSchema>;
export const chooseRequestSchema = z.object({ fen: z.string().max(120), playingColor: orientationSchema, legalMoves: z.array(legalMoveSchema).min(1).max(255), history: z.array(z.string().max(16)).max(1000).default([]), gamePgn: z.string().max(50000).optional(), analysis: analysisSchema.optional() }).strict();
export type ChooseRequest = z.infer<typeof chooseRequestSchema>;
export const DECISION_STAGES = ['assess','reply','nominate','shortlist','continue','choose'] as const;
/** 'verify' only follows 'choose' when blunderCheck is enabled and the chosen move triggers a rule-fact warning. */
export const ALL_DECISION_STAGES = [...DECISION_STAGES, 'verify'] as const;
export const decisionStageSchema = z.enum(ALL_DECISION_STAGES);
export function stagesForDepth(depth: Analysis['depth'] = 'full'): readonly (typeof DECISION_STAGES)[number][] {
    return depth === 'quick' ? ['choose'] : depth === 'reduced' ? ['assess', 'nominate', 'shortlist', 'choose'] : DECISION_STAGES;
}
export type DecisionStage = z.infer<typeof decisionStageSchema>;
export const choiceAnswerSchema = z.object({ type: z.literal('choice'), choice: z.string().max(32), confidence: z.number().min(0).max(1).optional(), probabilities: z.record(z.number().finite().min(0).max(1)).optional() }).strict();
export const stageTraceSchema = z.object({ stage: decisionStageSchema, answers: z.record(choiceAnswerSchema), model: z.string().max(200), usage: z.unknown().optional(), latencyMs: z.number().nonnegative(), source: z.enum(['provider', 'mock']) }).strict();
export type StageTrace = z.infer<typeof stageTraceSchema>;
export const stepRequestSchema = z.object({ input: chooseRequestSchema, trace: z.array(stageTraceSchema).max(6), proof: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();
export type StepRequest = z.infer<typeof stepRequestSchema>;
export const decisionSchema = z.object({ uci: legalMoveSchema.shape.uci, confidence: z.number().min(0).max(1).optional(), probabilities: z.record(z.number().min(0).max(1)).optional(), latencyMs: z.number().nonnegative(), model: z.string(), usage: z.unknown().optional(), source: z.enum(['provider', 'forced', 'mock', 'cache']), trace: z.array(stageTraceSchema).max(7).optional() });
export type Decision = z.infer<typeof decisionSchema>;
export const settingsSchema = z.object({ backendUrl: z.string().url().refine(v => { const u = new URL(v); return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) && u.protocol === 'http:' || u.protocol === 'https:'; }, 'Use loopback HTTP or HTTPS'), backendToken: z.string().max(256), settingsVersion: z.literal(2).default(2), colorMigrationNotice: z.boolean().default(false), playingColor: z.enum(['auto','white','black']), orientation: z.enum(['auto', 'white', 'black']), recognition: z.enum(['auto', 'dom', 'image', 'hybrid']), input: z.enum(['click', 'drag', 'debugger-click', 'debugger-drag']), authorizedOrigins: z.array(z.string().url()).max(100), pollMs: z.number().int().min(750).max(10000), seedFen: z.string().max(120) });
export type Settings = z.infer<typeof settingsSchema>;
export const defaults: Settings = { backendUrl: 'http://127.0.0.1:3001', backendToken: '', settingsVersion:2, colorMigrationNotice:false, playingColor: 'auto', orientation: 'auto', recognition: 'auto', input: 'click', authorizedOrigins: [], pollMs: 1000, seedFen: '' };
/** Migrate the legacy default explicitly; versioned manual overrides remain authoritative. */
export function migrateSettings(raw: unknown): Settings {
    const stored = raw && typeof raw === 'object' ? raw as Record<string,unknown> : {};
    const legacyWhite = stored.settingsVersion === undefined && stored.playingColor === 'white';
    return settingsSchema.parse({...defaults,...stored,settingsVersion:2,...(legacyWhite?{playingColor:'auto',colorMigrationNotice:true}:{})});
}
export type AutoState = 'IDLE' | 'DETECTING' | 'READING_BOARD' | 'ANALYZING' | 'WAITING_FOR_OPPONENT' | 'REQUESTING_DECISION' | 'EXECUTING_MOVE' | 'VERIFYING_MOVE' | 'PAUSED' | 'ERROR' | 'FINISHED';
export interface SessionView {
    state: AutoState;
    running: boolean;
    website: string;
    fen?: string;
    observation?: Observation;
    board?: Rect;
    recognition?: string;
    decision?: Decision;
    lastDecision?: Decision;
    lastOpponentMove?: string;
    gameStatus?: string;
    error?: string;
    playingColor?: Orientation;
    playingColorSource?: 'board-bottom'|'manual';
    decisionStage?: string;
    strategicIntent?: 'offensive'|'defensive';
    recoveryProgress?: {attempt:number;activity:string};
    turnId?: string;
    debug: Record<string, unknown>;
}
export const glyphs: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
export function throwIfAborted(signal: AbortSignal) { signal.throwIfAborted(); }
export function delay(ms: number, signal?: AbortSignal): Promise<void> { return new Promise((resolve, reject) => { if (signal?.aborted) {
    reject(signal.reason);
    return;
} const abort = () => { clearTimeout(timer); reject(signal?.reason); }; const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms); signal?.addEventListener('abort', abort, { once: true }); }); }
export function message(error: unknown) { return error instanceof Error ? error.message : String(error); }

export const stepResponseSchema = z.object({ trace: z.array(stageTraceSchema).max(7), proof: z.string().optional(), decision: decisionSchema.optional() }).strict();
export type StepResponse = z.infer<typeof stepResponseSchema>;
export const recoveryTargetSchema = z.object({ id: z.string().regex(/^target-[0-9]+$/), rect: rectSchema, label: z.string().max(160), kind: z.enum(['dismiss', 'promotion']), piece: z.enum(['q','r','b','n']).optional() }).strict();
export type RecoveryTarget = z.infer<typeof recoveryTargetSchema>;
export const recoveryRequestSchema = z.object({ image: z.string().max(4000000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/), dom: z.string().max(100000), board: rectSchema, captureRect:rectSchema, targets: z.array(recoveryTargetSchema).max(64), requestedPromotion: z.enum(['q','r','b','n']).optional(), reason: z.string().max(500) }).strict();
export type RecoveryRequest = z.infer<typeof recoveryRequestSchema>;
export const recoveryResultSchema = z.object({ action: z.enum(['wait','dismiss','selectPromotion','redetect','blocked','finished']), targetId: z.string().regex(/^target-[0-9]+$/).optional(), reason: z.string().max(500) }).strict().superRefine((v,c) => { if (['dismiss','selectPromotion'].includes(v.action) && !v.targetId) c.addIssue({ code: 'custom', message: 'Recovery target required' }); });
export type RecoveryResult = z.infer<typeof recoveryResultSchema>;
export const logEventSchema = z.object({ id: z.string().uuid(), sessionId: z.string().uuid(), sequence: z.number().int().nonnegative(), timestamp: z.string().datetime(), elapsedMs: z.number().nonnegative(), source: z.enum(['content','background','server']), event: z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/), turnId: z.string().max(100).optional(), requestId: z.string().max(100).optional(), actionId: z.string().max(100).optional(), data: z.unknown() }).strict();
export type LogEvent = z.infer<typeof logEventSchema>;
export const logBatchSchema = z.object({ events: z.array(logEventSchema).min(1).max(100) }).strict();
export function deadlineSignal(signal: AbortSignal | undefined, ms: number) { return signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms); }

/** Detach cancelled work even if a third-party transport ignores its signal. */
export function abortable<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
    return new Promise<T>((resolve,reject)=>{
        if(signal.aborted){work.catch(()=>{});reject(signal.reason);return;}
        const cancel=()=>reject(signal.reason??new DOMException('Aborted','AbortError'));
        signal.addEventListener('abort',cancel,{once:true});
        work.then(resolve,reject).finally(()=>signal.removeEventListener('abort',cancel));
    });
}
