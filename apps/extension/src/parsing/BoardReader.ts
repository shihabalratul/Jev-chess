import { detectBoards, rectOf, parseGeneric, parseRule, extractDom, orientationOf, structuralFingerprint, publicFen, publicPgn, publicMovePgn, gameContext, corroboratePgn, domTransitionReason, pieceToken, renderedPiece, formRedactions } from '../../../../packages/board-detection/src';
import { Chess } from 'chess.js';
import { placementFromPieces, verifiedChess } from '../../../../packages/chess-core/src';
import { delay, observationSchema, parserRuleSchema, type Rect, type Settings, type Observation, type ParserRule } from '../../../../packages/shared/src';
import { background } from '../content/bridge';
import type { ReadResult } from '../controllers/AutoPlayController';
import { readChesscomState } from './chesscom-state';
function hash(text: string) { let h = 2166136261; for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0).toString(36); }
export class BoardReader {
    element?: Element;
    private manual?: Rect;
    private scrollAtSelection = { x: 0, y: 0 };
    private cachedObservation?: {
        fingerprint: string;
        observation: Observation;
        recognition: string;
    };
    private cachedState?: { key: string; pgn?: string };
    private cachedExport?: { key: string; board: Element; capturedAt: number; seedFen?: string; seedPgn?: string };
    debug: Record<string, unknown> = {};
    constructor(private settings: () => Settings, private needsState: () => boolean = () => true) { }
    detect() { const list = detectBoards(document); this.debug.candidates = list.map(c => ({ rect: c.rect, score: c.score, reason: c.reason })); if (!list.length)
        throw new Error('No reliable board found. Use Select Board for a canvas or unfamiliar layout.'); if (list.length > 1 && list[0].score - list[1].score < 2)
        throw new Error('Multiple board candidates. Use Select Board to confirm the target.'); this.element = list[0].element; this.manual = undefined; this.cachedObservation = undefined; this.cachedState = undefined; this.cachedExport = undefined; return list[0].rect; }
    select(rect: Rect) { const center = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); const candidates = detectBoards(document); const match = candidates.find(c => center && (c.element === center || c.element.contains(center)) && Math.abs(c.rect.width - rect.width) < rect.width * .15 && Math.abs(c.rect.x - rect.x) < rect.width * .1); this.element = match?.element; this.manual = match ? undefined : rect; this.scrollAtSelection = { x: scrollX, y: scrollY }; this.cachedObservation = undefined; this.cachedState = undefined; this.cachedExport = undefined; }
    region(): Rect { if (this.element) {
        if (!this.element.isConnected)
            throw new Error('Board removed or page changed. Detect again.');
        return rectOf(this.element);
    } if (this.manual)
        return { ...this.manual, x: this.manual.x + this.scrollAtSelection.x - scrollX, y: this.manual.y + this.scrollAtSelection.y - scrollY }; throw new Error('Detect or select a board first'); }
    invalidate() { this.cachedObservation = undefined; this.cachedState = undefined; this.cachedExport = undefined; }
    private async image(signal: AbortSignal) { return background<string>('CAPTURE', { rect: this.region(), redactions:formRedactions(this.region()), viewport: { width: innerWidth, height: innerHeight } }, signal); }
    private async waitForDom(signal: AbortSignal) {
        const board = this.element;
        if (!board || board.tagName.toLowerCase() === 'canvas') return;
        const started = Date.now(), deadline = started + 5000;
        let polls = 0;
        while (true) {
            signal.throwIfAborted();
            if (!board.isConnected || board !== this.element) throw new Error('Board removed or page changed. Detect again.');
            const selected = this.settings().orientation;
            const reason = domTransitionReason(board, selected === 'auto' ? orientationOf(board) : selected);
            if (!reason) {
                if (polls) this.debug.domSettling = { polls, waitMs: Date.now() - started };
                return;
            }
            this.debug.domSettling = { reason, polls, waitMs: Date.now() - started };
            if (Date.now() >= deadline) throw new Error('Board animation or piece overlap did not settle; wait and retry automatic game setup');
            polls++;
            await delay(40, signal);
        }
    }
    async read(signal:AbortSignal):Promise<ReadResult>{
        let deadline:number|undefined;
        while(true){
            const result=await this.readSnapshot(signal);
            let state=result.seedFen?verifiedChess(result.seedFen):undefined;
            if(result.seedPgn){const replay=new Chess();replay.loadPgn(result.seedPgn,{strict:true});if(state&&state.fen()!==replay.fen())state=undefined;else state=replay;}
            const fields=state?.fen().split(' '),o=result.observation;
            const agrees=(!result.seedFen&&!result.seedPgn)||!!fields&&fields[0]===placementFromPieces(o.pieces)
                &&(!o.sideToMove||(o.sideToMove==='white'?'w':'b')===fields[1])&&(o.castlingRights===null||o.castlingRights===fields[2])&&(o.enPassantSquare===null||o.enPassantSquare===fields[3]);
            if(agrees){delete this.debug.metadataPending;return result;}
            deadline??=Date.now()+5000;this.debug.metadataPending={reason:'Public metadata has not caught up with observed pieces'};
            if(Date.now()>=deadline)throw new Error('Public metadata disagrees with observed board after waiting for delayed history');
            await delay(120,signal);
        }
    }
    private async readSnapshot(signal: AbortSignal): Promise<ReadResult> {
        signal.throwIfAborted();
        if (!this.element && !this.manual)
            this.detect();
        if (this.element && !this.element.isConnected)
            throw new Error('Board removed or page changed. Detect again.');
        // Capture effects and destination classes can disagree with current
        // screen geometry. Wait before collecting pieces/history or paying for
        // recognition; never turn an animation into a guessed board snapshot.
        await this.waitForDom(signal);
        signal.throwIfAborted();
        const settings = this.settings();
        let hint = settings.orientation === 'auto' ? (this.element ? orientationOf(this.element) : null) : settings.orientation;
        let seedFen = publicFen();
        let seedPgn = publicPgn() ?? publicMovePgn();
        let recoveryError: string | undefined;
        let context = gameContext();
        let contextPayload = context ? { gameContext: context } : {};
        let contextFingerprint = this.needsState() && context ? ':' + hash(context) : '';
        this.debug.gameContext = context ? JSON.parse(context) : undefined;
        const refreshMetadata = () => {
            hint = settings.orientation === 'auto' ? (this.element ? orientationOf(this.element) : null) : settings.orientation;
            seedFen = publicFen();
            seedPgn = publicPgn() ?? publicMovePgn();
            context = gameContext();
            contextPayload = context ? { gameContext: context } : {};
            contextFingerprint = this.needsState() && context ? ':' + hash(context) : '';
            this.debug.gameContext = context ? JSON.parse(context) : undefined;
        };
        let observation: Observation | undefined, recognition = '';
        const isVisual = !this.element || (this.element.tagName.toLowerCase() === 'canvas' || !!this.element.querySelector('canvas')) || settings.recognition === 'image';
        if (!isVisual && settings.recognition !== 'hybrid') {
            const board = this.element!;
            this.debug.extractedDom = extractDom(board);
            const structure = structuralFingerprint(board);
            const key = 'parser:' + location.origin + ':' + hash(structure);
            const stored = (await chrome.storage.local.get(key))[key];
            // A move can start while the cache lookup yields. Recheck animation
            // and collect the matching current history/orientation before parsing.
            await this.waitForDom(signal);
            signal.throwIfAborted();
            refreshMetadata();
            if (stored) {
                try {
                    const rule = parserRuleSchema.parse(stored);
                    if (hint && hint !== rule.orientation)
                        rule.orientation = hint;
                    const parsed = parseRule(board, rule);
                    placementFromPieces(parsed.pieces);
                    const generic = parseGeneric(board, hint);
                    if (generic && placementFromPieces(generic.pieces) !== placementFromPieces(parsed.pieces))
                        throw new Error('Cached parser disagrees with generic board');
                    observation = parsed;
                    recognition = 'Cached DOM parser';
                }
                catch {
                    await chrome.storage.local.remove(key);
                    this.debug.parserInvalidated = true;
                    await this.waitForDom(signal);
                    signal.throwIfAborted();
                    refreshMetadata();
                }
            }
            if (!observation) {
                const generic = parseGeneric(board, hint);
                if (generic) {
                    try {
                        placementFromPieces(generic.pieces);
                        observation = generic;
                        recognition = 'Generic DOM / geometry';
                    }
                    catch { /* Fall through to Vision, never treat partial placement as complete. */ }
                }
            }
            if (!observation && settings.recognition === 'dom' && board.querySelectorAll('*').length === 0)
                throw new Error('DOM contains no pieces; choose image or hybrid recognition');
            if (!observation) {
                const dom = extractDom(board);
                this.debug.extractedDom = dom;
                const fingerprint = 'dom:' + hash(dom) + contextFingerprint;
                if (this.cachedObservation?.fingerprint === fingerprint) {
                    observation = this.cachedObservation.observation;
                    recognition = this.cachedObservation.recognition;
                }
                else {
                    try {
                        const discovered = parserRuleSchema.parse(await background<ParserRule>('API', { path: '/api/discover-parser', body: { dom, ...(hint ? { orientation: hint } : {}) } }, signal));
                        if (hint)
                            discovered.orientation = hint;
                        const parsed = parseRule(board, discovered);
                        placementFromPieces(parsed.pieces);
                        const interpreted = observationSchema.parse(await background('API', { path: '/api/parse-board', body: { dom, ...contextPayload, ...(hint ? { orientation: hint } : {}) } }, signal));
                        if (interpreted.uncertainSquares.length || placementFromPieces(interpreted.pieces) !== placementFromPieces(parsed.pieces))
                            throw new Error('Discovered parser failed independent recognition validation');
                        await chrome.storage.local.set({ [key]: discovered });
                        observation = interpreted;
                        recognition = 'Vision validated parser';
                        this.debug.parser = discovered;
                    }
                    catch (error) {
                        signal.throwIfAborted();
                        this.debug.parserDiscoveryError = (error as Error).message;
                        try {
                            observation = observationSchema.parse(await background('API', { path: '/api/parse-board', body: { dom, ...contextPayload, ...(hint ? { orientation: hint } : {}) } }, signal));
                            recognition = 'Vision HTML';
                        }
                        catch (e) {
                            if (settings.recognition === 'dom')
                                throw e;
                            this.debug.htmlError = (e as Error).message;
                        }
                    }
                }
                if (observation)
                    this.cachedObservation = { fingerprint, observation, recognition };
            }
        }
        if (!observation || settings.recognition === 'hybrid') {
            const image = await this.image(signal);
            const fingerprint = 'image:' + hash(image) + contextFingerprint;
            if (this.cachedObservation?.fingerprint === fingerprint) {
                observation = this.cachedObservation.observation;
                recognition = this.cachedObservation.recognition;
            }
            else {
                const dom = settings.recognition === 'hybrid' && this.element ? extractDom(this.element) : undefined;
                observation = observationSchema.parse(await background('API', { path: '/api/parse-board', body: { image, ...contextPayload, ...(dom ? { dom } : {}), ...(hint ? { orientation: hint } : {}) } }, signal));
                recognition = dom ? 'Vision hybrid' : 'Vision image';
                this.cachedObservation = { fingerprint, observation, recognition };
            }
        }
        if (!seedFen && !seedPgn && this.needsState() && this.element) {
            const exportKey = document.URL + '|' + (context ?? '') + '|' + placementFromPieces(observation.pieces) + '|' + observation.orientation;
            try {
                const exported = this.cachedExport?.key === exportKey && this.cachedExport.board === this.element && Date.now() - this.cachedExport.capturedAt < 1000
                    ? this.cachedExport : await readChesscomState(this.element, signal,reason=>{this.debug.publicStateUnavailable=reason;});
                signal.throwIfAborted();
                if (exported) {
                    seedFen = exported.seedFen;
                    seedPgn = exported.seedPgn;
                    this.cachedExport = { key: exportKey, board: this.element, capturedAt: Date.now(), seedFen, seedPgn };
                }
            } catch (error) {
                signal.throwIfAborted();
                recoveryError = (error as Error).message;
                this.debug.stateRecoveryError = recoveryError;
            }
        }
        if (!seedFen && !seedPgn && context && this.needsState()) {
            const stateKey = context + '|' + placementFromPieces(observation.pieces) + '|' + observation.orientation;
            if (this.cachedState?.key === stateKey) {
                seedPgn = this.cachedState.pgn;
            } else {
                let interpreted = observation;
                let recoveryFailed = false;
                if (!observation.gamePgn && this.element && !isVisual && settings.recognition !== 'hybrid') {
                    try {
                        interpreted = observationSchema.parse(await background('API', { path: '/api/parse-board', body: { dom: extractDom(this.element), ...contextPayload, ...(hint ? { orientation: hint } : {}) } }, signal));
                        if (interpreted.uncertainSquares.length || placementFromPieces(interpreted.pieces) !== placementFromPieces(observation.pieces)
                            || (interpreted.orientation && observation.orientation && interpreted.orientation !== observation.orientation))
                            throw new Error('State recovery recognition disagrees with observed board');
                    } catch (error) {
                        signal.throwIfAborted();
                        this.debug.stateRecoveryError = (error as Error).message;
                        recoveryFailed = true;
                        interpreted = observation;
                    }
                }
                if (interpreted.gamePgn && corroboratePgn(interpreted.gamePgn, context)) {
                    seedPgn = interpreted.gamePgn;
                } else if (interpreted.gamePgn) {
                    this.debug.stateRecoveryError = 'Vision history did not match the complete visible move record; rejected';
                }
                signal.throwIfAborted();
                if (!recoveryFailed) this.cachedState = { key: stateKey, pgn: seedPgn };
            }
        }
        if (hint) {
            if (observation.orientation && observation.orientation !== hint)
                throw new Error('Recognition orientation disagrees with selected orientation');
            observation.orientation = hint;
        }
        placementFromPieces(observation.pieces);
        signal.throwIfAborted();
        if (this.element && !this.element.isConnected)
            throw new Error('Board removed or page changed. Detect again.');
        this.debug.visionOutput = observation;
        this.debug.stateSource = seedPgn ? 'visible-history' : seedFen ? 'public-fen' : 'tracked-session-or-unavailable';
        return { observation, seedFen, seedPgn, recognition, recoveryError: !seedFen && !seedPgn ? recoveryError : undefined,
            boardIdentity:this.element,geometryKey:this.element?JSON.stringify([rectOf(this.element),...Array.from(this.element.querySelectorAll('*')).filter(e=>pieceToken(e)&&renderedPiece(e,this.element!)).map(e=>{const r=rectOf(e);return [Math.round(r.x*2),Math.round(r.y*2),Math.round(r.width*2),Math.round(r.height*2)];})]):undefined };
    }
}
