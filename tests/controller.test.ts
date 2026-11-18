import { it, expect, vi } from 'vitest';
import { AutoPlayController, type ControllerPorts } from '../apps/extension/src/controllers/AutoPlayController';
import { defaults, type Observation, type Decision } from '../packages/shared/src';
import { piecesFromFen } from '../packages/chess-core/src';
import { Chess, DEFAULT_POSITION } from 'chess.js';
function fixture() { const game = new Chess(); let execution = 0; const observation = (): Observation => ({ pieces: piecesFromFen(game.fen()), orientation: 'white', sideToMove: null, castlingRights: null, enPassantSquare: null, uncertainSquares: [] }); const ports: ControllerPorts = { read: async () => ({ observation: observation(), seedFen: game.fen(), recognition: 'DOM' }), choose: async () => ({ uci: 'e2e4', latencyMs: 1, model: 'test', source: 'mock' }), execute: async (uci) => { execution++; game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); }, onView: () => { }, cancel: () => { } }; const c = new AutoPlayController(ports, { ...defaults, authorizedOrigins: ['http://localhost:5173'], pollMs: 750 }, 'http://localhost:5173'); return { c, ports, game, get execution() { return execution; } }; }
it('verifies moves and transitions to opponent wait without duplicating requests', async () => { const f = fixture(); await f.c.ask(); expect(f.c.view.decision?.uci).toBe('e2e4'); await f.c.play(); expect(f.execution).toBe(1); expect(f.c.view.fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'); await f.c.ask(); expect(f.c.view.state).toBe('WAITING_FOR_OPPONENT'); expect(f.execution).toBe(1); });
it('stop aborts a pending decision and prevents later input', async () => { const f = fixture(); let finish: (d: Decision) => void = () => { }; f.ports.choose = () => new Promise(resolve => { finish = resolve; }); const pending = f.c.ask(); await new Promise(r => setTimeout(r, 250)); f.c.stop(); finish({ uci: 'e2e4', latencyMs: 1, model: 'test', source: 'mock' }); await pending; expect(f.execution).toBe(0); expect(f.c.view.state).toBe('IDLE'); expect(f.c.view.decision).toBeUndefined(); });
it('refuses browser input when its execution intent cannot be persisted',async()=>{
    const f=fixture();await f.c.ask();
    f.ports.record=async(event)=>{if(event==='execution.intent')throw new Error('Diagnostic persistence failed: quota');};
    await f.c.play();expect(f.execution).toBe(0);expect(f.c.view.error).toMatch(/persistence/i);
});
it('discards a changed board at a stage checkpoint before asking another Jev question',async()=>{
    const f=fixture();let requests=0;
    f.ports.chooseStep=async()=>{requests++;f.game.move('d4');return {trace:[]};};
    await f.c.ask();expect(requests).toBe(1);expect(f.c.view.error).toMatch(/changed|stale/i);expect(f.execution).toBe(0);
});
it('discards a choice when newly available history proves the unchanged FEN is a finished repetition',async()=>{
    const f=fixture();for(const san of ['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8'])f.game.move(san);
    const read=f.ports.read;
    f.ports.choose=async()=>{f.ports.read=async s=>({...await read(s),seedPgn:f.game.pgn()});return {uci:'g1f3',latencyMs:1,model:'mock/fixture',source:'mock'};};
    await f.c.ask();expect(f.c.view.decision).toBeUndefined();expect(f.c.view.error).toMatch(/finished|history|stale/i);expect(f.execution).toBe(0);
});
it.each(['own mate','opponent mate'])('verifies terminal public PGN after %s and records the outcome',async scenario=>{
    const f=fixture(),events:string[]=[];
    for(const san of scenario==='own mate'?['f3','e5','g4']:['f3','e5'])f.game.move(san);
    if(scenario==='own mate')f.c.configure({...defaults,playingColor:'black',authorizedOrigins:['http://localhost:5173']});
    const read=f.ports.read;f.ports.read=async s=>({...await read(s),seedPgn:f.game.pgn()});
    f.ports.record=async event=>{events.push(event);};
    f.ports.choose=async()=>({uci:scenario==='own mate'?'d8h4':'g2g4',latencyMs:0,model:'mock/mate',source:'mock'});
    if(scenario==='opponent mate')f.ports.execute=async()=>{f.game.move('g4');f.game.move('Qh4#');};
    await f.c.ask();await f.c.play();
    expect(f.c.view.state).toBe('FINISHED');expect(f.c.view.error).toBeUndefined();expect(events).toContain('execution.outcome');
});
it('discards decisions when observed board changes during provider call', async () => { const f = fixture(); f.ports.choose = async () => { f.game.move('d4'); return { uci: 'e2e4', latencyMs: 1, model: 'test', source: 'mock' }; }; await f.c.ask(); expect(f.c.view.state).toBe('PAUSED'); expect(f.c.view.error).toMatch(/changed|stale/i); expect(f.execution).toBe(0); });
it('rejects execution on unapproved origins and false success', async () => { const f = fixture(); f.c.configure({ ...defaults, authorizedOrigins: [] }); await f.c.ask(); await f.c.play(); expect(f.execution).toBe(0); expect(f.c.view.error).toMatch(/authoriz/i); const g = fixture(); g.ports.execute = async () => { }; await g.c.ask(); await g.c.play(); expect(g.c.view.state).toBe('PAUSED'); expect(g.c.view.error).toMatch(/verif/i); }, 8000);
it('tracks the opponent legal move and refuses multiple concurrent jobs', async () => { const f = fixture(); await f.c.ask(); await f.c.play(); f.game.move('e5'); await f.c.inspect(); expect(f.c.view.lastOpponentMove).toBe('e5'); expect(f.c.view.fen).toContain(' w '); });
it('automatically catches up to complete visible history and rejects the old decision before input', async () => {
    const f = fixture();
    const read = f.ports.read;
    f.ports.read = async signal => ({ ...await read(signal), seedPgn: f.game.pgn() || undefined });
    await f.c.ask();
    f.game.move('d4'); f.game.move('d5');
    await f.c.play();
    expect(f.execution).toBe(0);
    expect(f.c.view.fen).toBe(f.game.fen());
    expect(f.c.view.error).toMatch(/stale/i);
    expect(f.c.view.decision).toBeUndefined();
    f.ports.choose = async input => ({ uci: input.legalMoves[0].uci, latencyMs: 1, model: 'test', source: 'mock' });
    await f.c.ask();
    expect(f.c.view.error).toBeUndefined();
    await f.c.play();
    expect(f.execution).toBe(1);
    expect(f.c.view.debug.execution).toMatchObject({ verified: true });
});
it('clears a stale decision when inspection catches up without executing input', async () => {
    const f = fixture();
    const read = f.ports.read;
    f.ports.read = async signal => ({ ...await read(signal), seedPgn: f.game.pgn() || undefined });
    await f.c.ask();
    f.game.move('d4'); f.game.move('d5');
    await f.c.inspect();
    expect(f.c.view.error).toBeUndefined();
    expect(f.c.view.fen).toBe(f.game.fen());
    expect(f.c.view.decision).toBeUndefined();
    expect(f.execution).toBe(0);
});
it('verifies selected move even when a fast opponent has already replied', async () => { const f = fixture(); f.ports.execute = async () => { f.game.move('e4'); f.game.move('e5'); }; await f.c.ask(); await f.c.play(); expect(f.c.view.lastOpponentMove).toBe('e5'); expect(f.c.view.fen).toContain(' w '); expect(f.c.view.error).toBeUndefined(); });
it('reports network failure and sends no move', async () => { const f = fixture(); f.ports.choose = async () => { throw new Error('Backend network failed'); }; await f.c.ask(); expect(f.c.view.state).toBe('ERROR'); expect(f.execution).toBe(0); });
it('rejects verification when public FEN contradicts observed successful input',async()=>{const f=fixture();const read=f.ports.read;f.ports.read=async signal=>{const r=await read(signal);if(f.game.turn()==='b')r.seedFen=DEFAULT_POSITION;return r;};await f.c.ask();await f.c.play();expect(f.c.view.state).toBe('PAUSED');expect(f.c.view.error).toMatch(/Public game state/);expect(f.c.view.debug.execution).toBeUndefined();});
it('waits for an opponent reply to settle between verification snapshots', async () => {
    const f = fixture();
    const read = f.ports.read;
    let verifying = false, reads = 0;
    f.ports.execute = async () => { f.game.move('e4'); verifying = true; };
    f.ports.read = async signal => {
        if (verifying && ++reads === 2) f.game.move('e5');
        return read(signal);
    };
    await f.c.ask();
    await f.c.play();
    expect(f.c.view.error).toBeUndefined();
    expect(f.c.view.lastOpponentMove).toBe('e5');
    expect(f.c.view.debug.execution).toMatchObject({ verified: true });
    expect(reads).toBeGreaterThanOrEqual(3);
});

function withoutPublicState(f: ReturnType<typeof fixture>) {
    const read = f.ports.read;
    f.ports.read = async signal => ({ ...await read(signal), seedFen: undefined });
}
it('keeps recognized pieces visible when complete initial state is missing', async () => {
    const f = fixture();
    withoutPublicState(f);
    await f.c.inspect();
    expect(f.c.view.state).toBe('PAUSED');
    expect(f.c.view.error).toMatch(/Complete state FEN required/);
    expect(f.c.view.observation?.pieces).toEqual(piecesFromFen(DEFAULT_POSITION));
    expect(f.c.view.recognition).toBe('DOM');
    expect(f.c.view.fen).toBeUndefined();
    expect(f.execution).toBe(0);
});
it('confirms an observed untouched new game without requesting or executing a move', async () => {
    const f = fixture();
    withoutPublicState(f);
    f.ports.choose = async () => { throw new Error('Confirmation must not ask a provider'); };
    await f.c.inspect();
    expect(await f.c.confirmNewGame()).toBe(true);
    expect(f.c.view.fen).toBe(DEFAULT_POSITION);
    expect(f.c.view.state).toBe('IDLE');
    expect(f.c.view.error).toBeUndefined();
    expect(f.c.view.running).toBe(false);
    expect(f.c.view.decision).toBeUndefined();
    expect(f.execution).toBe(0);
});
it('rejects new-game confirmation on a midgame board and allows fresh-board recovery', async () => {
    const f = fixture();
    withoutPublicState(f);
    f.game.move('e4');
    expect(await f.c.confirmNewGame()).toBe(false);
    expect(f.c.view.observation?.pieces).toEqual(piecesFromFen(f.game.fen()));
    expect(f.c.view.fen).toBeUndefined();
    expect(f.c.view.state).toBe('PAUSED');
    f.game.reset();
    expect(await f.c.confirmNewGame()).toBe(true);
    expect(f.c.view.fen).toBe(DEFAULT_POSITION);
    expect(f.execution).toBe(0);
});
it('rejects public FEN or PGN history contradicting an untouched starting board', async () => {
    for (const historySource of ['fen', 'pgn']) {
        const f = fixture();
        for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) f.game.move(san);
        const read = f.ports.read;
        f.ports.read = async signal => ({ ...await read(signal), seedFen: historySource === 'fen' ? f.game.fen() : undefined, seedPgn: historySource === 'pgn' ? f.game.pgn() : undefined });
        expect(await f.c.confirmNewGame()).toBe(false);
        expect(f.c.view.fen).toBeUndefined();
        expect(f.c.view.state).toBe('PAUSED');
        expect(f.execution).toBe(0);
    }
});
it('does not commit a new-game confirmation after Stop interrupts recognition', async () => {
    const f = fixture();
    withoutPublicState(f);
    const read = f.ports.read;
    let finish!: (value: Awaited<ReturnType<ControllerPorts['read']>>) => void;
    f.ports.read = () => new Promise(resolve => { finish = resolve; });
    const pending = f.c.confirmNewGame();
    f.c.stop();
    finish(await read(new AbortController().signal));
    expect(await pending).toBe(false);
    expect(f.c.view.state).toBe('IDLE');
    expect(f.c.view.fen).toBeUndefined();
    expect(f.execution).toBe(0);
});
it('preserves a tracked game on failed confirmation and replaces it only after validation', async () => {
    const f = fixture();
    f.game.move('e4');
    await f.c.inspect();
    const previous = f.c.view.fen;
    expect(await f.c.confirmNewGame()).toBe(false);
    expect(f.c.view.fen).toBe(previous);
    f.game.reset();
    expect(await f.c.confirmNewGame()).toBe(true);
    expect(f.c.view.fen).toBe(DEFAULT_POSITION);
    expect(f.c.view.lastOpponentMove).toBeUndefined();
    expect(f.execution).toBe(0);
});
it('automatically recovers public complete state instead of using an obsolete manual seed', async () => {
    const f = fixture();
    f.c.configure({ ...defaults, seedFen: DEFAULT_POSITION });
    for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) f.game.move(san);
    await f.c.inspect();
    expect(f.c.view.fen).toBe(f.game.fen());
    expect(f.c.view.error).toBeUndefined();
});
it('automatically generates complete FEN and history from recovered PGN without a manual seed', async () => {
    const f = fixture();
    f.c.configure({ ...defaults, seedFen: DEFAULT_POSITION });
    for (const san of ['e4', 'e5', 'Nf3', 'Nc6']) f.game.move(san);
    const read = f.ports.read;
    f.ports.read = async signal => ({ ...await read(signal), seedFen: undefined, seedPgn: f.game.pgn() });
    let suppliedHistory: string[] = [];
    f.ports.choose = async input => { suppliedHistory = input.history; return { uci: input.legalMoves[0].uci, latencyMs: 1, model: 'test', source: 'mock' }; };
    await f.c.ask();
    expect(f.c.view.fen).toBe(f.game.fen());
    expect(f.c.view.error).toBeUndefined();
    expect(suppliedHistory).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(f.execution).toBe(0);
});
it('rejects contradictory public PGN before changing a tracked game', async () => {
    const f = fixture();
    await f.c.inspect();
    const previous = f.c.view.fen;
    f.game.move('e4');
    const read = f.ports.read;
    f.ports.read = async signal => ({ ...await read(signal), seedPgn: '1. d4' });
    await f.c.inspect();
    expect(f.c.view.state).toBe('PAUSED');
    expect(f.c.view.fen).toBe(previous);
    expect(f.execution).toBe(0);
    f.ports.read = read;
    await f.c.inspect();
    expect(f.c.view.fen).toBe(f.game.fen());
    expect(f.c.view.error).toBeUndefined();
});
it('discards a decision if public PGN contradicts the position after the provider responds', async () => {
    const f = fixture();
    const read = f.ports.read;
    f.ports.choose = async () => {
        f.ports.read = async signal => ({ ...await read(signal), seedPgn: '1. Nf3 Nf6 2. Ng1 Ng8' });
        return { uci: 'e2e4', latencyMs: 1, model: 'test', source: 'mock' };
    };
    await f.c.ask();
    expect(f.c.view.state).toBe('PAUSED');
    expect(f.c.view.decision).toBeUndefined();
    expect(f.execution).toBe(0);
});
it('rejects successful-looking input if public PGN contradicts the observed move', async () => {
    const f = fixture();
    const read = f.ports.read;
    f.ports.read = async signal => ({ ...await read(signal), seedPgn: f.game.turn() === 'b' ? '1. e4 e5' : undefined });
    await f.c.ask();
    await f.c.play();
    expect(f.c.view.state).toBe('PAUSED');
    expect(f.c.view.debug.execution).toBeUndefined();
    expect(f.c.view.fen).toBe(DEFAULT_POSITION);
});

it('starts the settling window after slow initial recognition, allowing a second corroborating observation',async()=>{
    vi.useFakeTimers();
    try{
        const f=fixture(),read=f.ports.read;let count=0;
        f.ports.read=async signal=>{if(count++===0)await new Promise(r=>setTimeout(r,6000));return read(signal);};
        const pending=f.c.inspect();await vi.runAllTimersAsync();await pending;
        expect(f.c.view.fen).toBe(DEFAULT_POSITION);expect(f.c.view.error).toBeUndefined();expect(count).toBeGreaterThanOrEqual(2);
    }finally{vi.useRealTimers();}
});
it('rejects contradictory public turn metadata after Jev even when placement and exported FEN stay unchanged',async()=>{
    const f=fixture(),read=f.ports.read;let changed=false;
    f.ports.read=async s=>{const r=await read(s);if(changed)r.observation.sideToMove='black';return r;};
    f.ports.choose=async()=>{changed=true;return {uci:'e2e4',latencyMs:0,model:'mock',source:'mock'};};
    await f.c.ask();expect(f.c.view.decision).toBeUndefined();expect(f.c.view.error).toMatch(/turn|metadata|disagree/i);expect(f.execution).toBe(0);
});
it.each(['opponent move','fresh attachment'])('adopts independently verified terminal history on ordinary sync: %s',async scenario=>{
    const f=fixture();for(const san of ['f3','e5','g4'])f.game.move(san);
    const read=f.ports.read;f.ports.read=async s=>({...await read(s),seedPgn:f.game.pgn()});
    if(scenario==='opponent move')await f.c.inspect();
    f.game.move('Qh4#');await f.c.inspect();
    expect(f.c.view.state).toBe('FINISHED');expect(f.c.view.fen).toBe(f.game.fen());expect(f.c.view.error).toBeUndefined();expect(f.execution).toBe(0);
});
