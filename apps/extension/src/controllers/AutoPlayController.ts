import { ChessStateManager, placementFromPieces, verifiedChess } from '../../../../packages/chess-core/src';
import { DEFAULT_POSITION } from 'chess.js';
import { delay, message, type Observation, type Settings, type SessionView, type Decision, type ChooseRequest, type AutoState, type StepRequest, type StepResponse, type StageTrace, DECISION_STAGES, deadlineSignal, stepResponseSchema, abortable } from '../../../../packages/shared/src';
export interface ReadResult {
    observation: Observation;
    seedFen?: string;
    seedPgn?: string;
    recoveryError?: string;
    recognition: string;
    boardIdentity?: Element;
    geometryKey?: string;
}
export interface ControllerPorts {
    read(signal: AbortSignal): Promise<ReadResult>;
    choose(input: ChooseRequest, signal: AbortSignal): Promise<Decision>;
    execute(uci: string, orientation: 'white' | 'black', signal: AbortSignal,checkpoint?:()=>Promise<void>): Promise<void>;
    onView(view: SessionView): void;
    cancel(): void;
    chooseStep?(input:StepRequest,signal:AbortSignal):Promise<StepResponse>;
    record?(event:string,data:unknown):Promise<void>;
    recover?(reason:string,signal:AbortSignal):Promise<void>;
    recoveryVerified?():void;
}
export class AutoPlayController {
    view: SessionView;
    private state = new ChessStateManager();
    private abort?: AbortController;
    private busy = false;
    private epoch = 0;
    private selectedFen?: string;
    private selectedHistory?:string;
    private selectedColor?:'white'|'black';
    private activeBoard?:Element;
    constructor(private ports: ControllerPorts, private settings: Settings, website: string) { this.view = { state: 'IDLE', running: false, website, debug: {} }; }
    get initialized() { return this.state.initialized; }
    configure(settings: Settings) { this.stop(); this.settings = settings; this.view.playingColor=settings.playingColor==='auto'?undefined:settings.playingColor;this.view.playingColorSource=settings.playingColor==='auto'?'board-bottom':'manual';this.emit(); }
    private record(event:string,data:unknown){return this.ports.record?.(event,data)??Promise.resolve();}
    private emit(state?: AutoState) { if (state)
        this.view.state = state; this.ports.onView({ ...this.view }); }
    stop() { this.epoch++; this.abort?.abort(new DOMException('Stopped', 'AbortError')); this.ports.cancel(); this.view.running = false; this.view.decision = undefined; this.selectedFen = undefined; this.emit('IDLE'); void this.record('session.stop',{epoch:this.epoch}).catch(()=>{}); }
    reset() { this.stop(); this.state = new ChessStateManager(); this.activeBoard=undefined; this.view = { state: 'IDLE', running: false, website: this.view.website, debug: {} }; this.emit(); }
    private async job(fn: (signal: AbortSignal) => Promise<void>) { if (this.busy)
        return; this.busy = true; const epoch = ++this.epoch; const abort = new AbortController(); this.abort = abort; try {
        if(this.ports.record)await this.record('job.start',{epoch});
        abort.signal.throwIfAborted();
        await fn(abort.signal);
    }
    catch (error) {
        if (!abort.signal.aborted && epoch === this.epoch) {
            await this.record('job.error',{error,epoch,fen:this.view.fen,decision:this.view.decision,execution:this.view.debug.execution}).catch(()=>{});
            this.view.error = message(error);
            this.view.running = false;
            this.view.decision = undefined;
            this.selectedFen = undefined;
            this.emit(/backend|openrouter|network|timed out|service worker/i.test(this.view.error) ? 'ERROR' : 'PAUSED');
        }
    }
    finally {
        if (epoch === this.epoch)
            this.abort = undefined;
        this.busy = false;
    } }
    private async stableRead(signal: AbortSignal) {
        let until:number|undefined;
        let previous:ReadResult|undefined;
        let recoveryUsed=false;
        while(true){
            signal.throwIfAborted();
            let current:ReadResult;
            try{current=await this.ports.read(signal);}
            catch(error){
                signal.throwIfAborted();
                if(!recoveryUsed&&this.ports.recover&&!/disagree|contradict|stale|illegal|history|seed|credential|backend|network|removed|page changed/i.test(message(error))){
                    recoveryUsed=true;await this.ports.recover(message(error),signal);previous=undefined;continue;
                }
                throw error;
            }
            signal.throwIfAborted();
            if(previous && placementFromPieces(previous.observation.pieces)===placementFromPieces(current.observation.pieces)
                && previous.observation.orientation===current.observation.orientation && previous.seedFen===current.seedFen && previous.seedPgn===current.seedPgn
                && previous.boardIdentity===current.boardIdentity && previous.geometryKey===current.geometryKey
                && JSON.stringify([previous.observation.sideToMove,previous.observation.castlingRights,previous.observation.enPassantSquare,previous.observation.uncertainSquares])===JSON.stringify([current.observation.sideToMove,current.observation.castlingRights,current.observation.enPassantSquare,current.observation.uncertainSquares])){
                    this.ports.recoveryVerified?.();return current;
                }
            previous=current;
            until??=Date.now()+5000;
            if(Date.now()>=until)throw new Error('Board changed during recognition; animation or metadata did not settle');
            await delay(120,signal);
        }
    }
    private effectiveColor() {
        const color=this.settings.playingColor==='auto'?this.view.observation?.orientation:this.settings.playingColor;
        if(!color)throw new Error('Playing color is unknown; observe board orientation or choose a manual color');
        return color;
    }
    private showObservation(result: ReadResult) {
        this.view.observation = result.observation;
        this.view.recognition = result.recognition;
        this.view.playingColor=this.settings.playingColor==='auto'?result.observation.orientation??undefined:this.settings.playingColor;
        this.view.playingColorSource=this.settings.playingColor==='auto'?'board-bottom':'manual';
        if(this.selectedColor&&this.selectedColor!==this.view.playingColor){this.view.decision=undefined;this.selectedFen=undefined;}
        this.view.debug.playingColor={color:this.view.playingColor,source:this.view.playingColorSource,orientation:result.observation.orientation};
        this.emit();
    }
    private validatePublicState(result: ReadResult, expectedFen: string, allowTerminalTransition = false) {
        if (result.seedFen && verifiedChess(result.seedFen).fen() !== expectedFen)
            throw new Error('Public game state disagrees with tracked history; automatic recovery rejected');
        if (result.seedPgn) {
            const recovered = new ChessStateManager();
            recovered.observe(result.observation, result.seedFen, result.seedPgn);
            if(!allowTerminalTransition && recovered.finished && (!this.state.initialized||!this.state.finished))throw new Error('Public history proves the game is finished; stale decision discarded');
            if (recovered.fen !== expectedFen)
                throw new Error('Public game history disagrees with tracked state; automatic recovery rejected');
        }
        // Validate every available public field even when the piece placement did not change.
        const checkpoint=new ChessStateManager(expectedFen);
        checkpoint.observe(result.observation,expectedFen,result.seedPgn);
    }
    private async sync(signal: AbortSignal) {
        this.emit('READING_BOARD');
        const result = await this.stableRead(signal);
        this.showObservation(result);
        signal.throwIfAborted();
        if(this.activeBoard && result.boardIdentity!==this.activeBoard)throw new Error('Board identity changed; reset the session');
        this.activeBoard=result.boardIdentity;
        if (!result.observation.orientation)
            throw new Error('Board orientation unknown; choose it in Settings');
        const seedPgn = result.seedPgn;
        const seedFen = result.seedFen || (seedPgn ? undefined : this.settings.seedFen);
        if (!this.state.initialized && !seedFen && !seedPgn && result.recoveryError)
            throw new Error(result.recoveryError);
        // Validate public state before changing the live game. Complete history
        // can extend its validated prefix; unexplained jumps still pause.
        if (result.seedFen || result.seedPgn) {
            const candidate = new ChessStateManager(this.state.initialized ? this.state.fen : undefined);
            candidate.observe(result.observation, seedFen, seedPgn);
            this.validatePublicState(result, candidate.fen, true);
        }
        const move = this.state.observe(result.observation, seedFen, seedPgn);
        if (this.selectedFen && (this.selectedFen !== this.state.fen || this.selectedHistory!==this.state.chess.pgn())) {
            this.view.decision = undefined;
            this.selectedFen = undefined;
        }
        if (move && ((move.color === 'w' ? 'white' : 'black') !== this.effectiveColor()))
            this.view.lastOpponentMove = move.san;
        this.view.fen = this.state.fen;
        this.view.gameStatus = this.state.status();
        this.view.debug.legalMoves = this.state.legalMoves();
        this.emit('ANALYZING');
    }
    inspect() { return this.job(async (signal) => { this.view.error = undefined; await this.sync(signal); this.emit(this.state.finished ? 'FINISHED' : 'IDLE'); }); }
    async confirmNewGame(): Promise<boolean> {
        let confirmed = false;
        await this.job(async signal => {
            this.view.error = undefined;
            this.view.decision = undefined;
            this.selectedFen = undefined;
            this.emit('READING_BOARD');
            const result = await this.stableRead(signal);
            this.showObservation(result);
            if (!result.observation.orientation)
                throw new Error('Board orientation unknown; choose it in Settings');
            if (placementFromPieces(result.observation.pieces) !== DEFAULT_POSITION.split(' ')[0])
                throw new Error('New-game confirmation requires the untouched starting pieces. For a game already in progress, enter its current complete FEN in Settings.');
            const candidate = new ChessStateManager();
            candidate.observe(result.observation, DEFAULT_POSITION, result.seedPgn);
            if (result.seedFen && verifiedChess(result.seedFen).fen() !== candidate.fen)
                throw new Error('Public game state contradicts an untouched new game. Enter the current complete FEN in Settings.');
            signal.throwIfAborted();
            this.state = candidate;
            this.view = {
                state: 'IDLE', running: false, website: this.view.website,
                observation: result.observation, recognition: result.recognition,
                fen: candidate.fen, gameStatus: candidate.status(),
                debug: { legalMoves: candidate.legalMoves(), initialization: 'confirmed-new-game' }
            };
            confirmed = true;
            this.emit();
        });
        return confirmed;
    }
    private async decide(signal: AbortSignal) {
        await this.sync(signal);
        if (this.state.finished) {
            this.view.running = false;
            this.emit('FINISHED');
            return;
        }
        if (this.state.turn !== this.effectiveColor()) {
            this.view.decision = undefined;
            this.emit('WAITING_FOR_OPPONENT');
            return;
        }
        const fen = this.state.fen;
        this.view.turnId=crypto.randomUUID();
        this.view.strategicIntent=undefined;
        this.emit('REQUESTING_DECISION');
        const legal = this.state.legalMoves();
        const decisionSignal=deadlineSignal(signal,45000),input=this.state.decisionInput(this.effectiveColor());
        const orientation=this.view.observation?.orientation;
        const checkpoint=async()=>{
            const observed=await this.stableRead(decisionSignal);
            if(observed.boardIdentity!==this.activeBoard || placementFromPieces(observed.observation.pieces)!==fen.split(' ')[0]||observed.observation.orientation!==orientation
                ||(observed.seedFen&&verifiedChess(observed.seedFen).fen()!==fen))throw new Error('Board changed while Jev was processing; stale decision discarded');
            this.validatePublicState(observed,fen);
        };
        let d:Decision;
        if(legal.length===1)d={uci:legal[0].uci,model:'forced',source:'forced',latencyMs:0};
        else if(this.ports.chooseStep){
            let trace:StageTrace[]=[],proof:string|undefined,chosen:Decision|undefined;
            for(let stage=0;stage<DECISION_STAGES.length;stage++){
                decisionSignal.throwIfAborted();
                this.view.decisionStage=DECISION_STAGES[stage];this.emit();
                await this.record('decision.stage_start',{fen,stage:this.view.decisionStage,input});
                const stageSignal=deadlineSignal(decisionSignal,10000);
                const result=stepResponseSchema.parse(await abortable(this.ports.chooseStep({input,trace,proof},stageSignal),stageSignal));
                decisionSignal.throwIfAborted();await this.record('decision.stage_result',result);await checkpoint();
                trace=result.trace;proof=result.proof;
                const intent=trace.find(t=>t.stage==='assess')?.answers.intent.choice;
                if(intent==='offensive'||intent==='defensive')this.view.strategicIntent=intent;
                if(result.decision){chosen=result.decision;break;}
            }
            if(!chosen)throw new Error('Jev did not return a final staged decision');d=chosen;
        } else d=await abortable(this.ports.choose(input,decisionSignal),decisionSignal);
        decisionSignal.throwIfAborted();
        await this.record('decision.selected',{fen,decision:d});
        signal.throwIfAborted();
        const check = await this.stableRead(decisionSignal);
        if (placementFromPieces(check.observation.pieces) !== fen.split(' ')[0] || check.observation.orientation !== this.view.observation?.orientation || (check.seedFen && verifiedChess(check.seedFen).fen() !== fen))
            throw new Error('Board changed while Jev was processing; stale decision discarded');
        this.validatePublicState(check, fen);
        decisionSignal.throwIfAborted();
        if (!legal.some(m => m.uci === d.uci))
            throw new Error('Jev selected an illegal move');
        this.view.decision = d;
        this.view.lastDecision = d;
        this.selectedFen = fen;
        this.selectedHistory=this.state.chess.pgn();
        this.selectedColor=this.effectiveColor();
        this.view.debug.jev = d;
        this.emit('ANALYZING');
    }
    ask() { return this.job(async (signal) => { this.view.error = undefined; this.view.decision = undefined; await this.decide(signal); }); }
    private async execute(signal: AbortSignal) {
        if (!this.settings.authorizedOrigins.includes(this.view.website))
            throw new Error('Authorize this website in extension Settings before executing moves');
        if (!this.view.decision || !this.selectedFen)
            throw new Error('Ask Jev for a current decision first');
        await this.sync(signal);
        if(!this.view.decision||!this.selectedFen)throw new Error('Stale decision: playing color or position changed');
        if(this.state.finished){this.view.decision=undefined;this.selectedFen=undefined;this.emit('FINISHED');return;}
        if (this.state.fen !== this.selectedFen || this.selectedHistory!==this.state.chess.pgn() || this.state.turn !== this.effectiveColor())
            throw new Error('Stale decision: position or turn changed');
        const uci = this.view.decision!.uci;
        const expected = this.state.expected(uci);
        signal.throwIfAborted();
        delete this.view.debug.execution;
        await this.record('execution.intent',{uci,fen:this.selectedFen,expected,orientation:this.view.observation?.orientation,playingColor:this.effectiveColor(),playingColorSource:this.view.playingColorSource});
        signal.throwIfAborted();
        this.emit('EXECUTING_MOVE');
        await this.ports.execute(uci, this.view.observation!.orientation!, signal,async()=>{const current=await this.stableRead(signal);if(current.boardIdentity!==this.activeBoard||placementFromPieces(current.observation.pieces)!==this.state.fen.split(' ')[0]||current.observation.orientation!==this.view.observation?.orientation)throw new Error('Board changed before browser input');this.validatePublicState(current,this.state.fen);});
        signal.throwIfAborted();
        this.emit('VERIFYING_MOVE');
        const until = Date.now() + 5000;
        let verified = false;
        while (Date.now() < until) {
            signal.throwIfAborted();
            const r = await this.stableRead(signal);
            const observed = placementFromPieces(r.observation.pieces);
            if (observed === expected.split(' ')[0]) {
                if (r.seedFen && verifiedChess(r.seedFen).fen() !== expected) throw new Error('Public game state disagrees with expected move; verification rejected');
                this.validatePublicState(r, expected, true);
                this.state.observe(r.observation, r.seedFen, r.seedPgn);
                this.view.fen = this.state.fen;
                this.view.observation = r.observation;
                verified = true;
                break;
            }
            const successor = new ChessStateManager(expected);
            let reply: ReturnType<ChessStateManager['observe']>;
            try { reply = successor.observe(r.observation); }
            catch { /* Wait for the exact expected position or its unique legal opponent reply. */ }
            if (reply) {
                if (r.seedFen && verifiedChess(r.seedFen).fen() !== successor.fen) throw new Error('Public game state disagrees with opponent reply; verification rejected');
                this.validatePublicState(r, successor.fen, true);
                this.state.apply(uci);
                this.state.observe(r.observation, r.seedFen, r.seedPgn);
                this.view.lastOpponentMove = reply.san;
                this.view.fen = this.state.fen;
                this.view.observation = r.observation;
                verified = true;
                break;
            }
            await delay(150, signal);
        }
        if (!verified)
            throw new Error('Move verification failed: board did not reach expected legal position');
        await this.record('execution.outcome',{uci,verified:true,fen:this.state.fen,observation:this.view.observation});
        this.view.debug.execution = { uci, verified: true, fen: this.state.fen };
        this.view.gameStatus = this.state.status();
        this.view.decision = undefined;
        this.selectedFen = undefined;
        this.emit(this.state.finished ? 'FINISHED' : this.state.turn === this.effectiveColor() ? 'ANALYZING' : 'WAITING_FOR_OPPONENT');
    }
    play() { return this.job(async (signal) => { this.view.error = undefined; await this.execute(signal); }); }
    start() { return this.job(async (signal) => { if (!this.settings.authorizedOrigins.includes(this.view.website))
        throw new Error('Authorize this website in Settings'); this.view.error = undefined; this.view.running = true; while (!signal.aborted && this.view.running) {
        await this.decide(signal);
        if (this.view.decision)
            await this.execute(signal);
        if (this.state.finished) {
            this.view.running = false;
            this.emit('FINISHED');
            break;
        }
        await delay(this.settings.pollMs, signal);
    } }); }
}
