import { describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { ChessStateManager, verifiedChess } from '../packages/chess-core/src';
import { exposedPieces, blunderWarnings } from '../apps/server/src/services/tactics';
import { runStagedDecision, stagePlan, type Judge } from '../apps/server/src/services/decisions';
import { planTurn, DecisionCache, plannedReplyFromTrace, estimatedGameSeconds } from '../apps/server/src/lichess/budget';
import { LichessController } from '../apps/server/src/lichess/controller';
import { MockProvider } from '../apps/server/src/providers/mock';
import type { LichessPort } from '../apps/server/src/lichess/client';
import type { Analysis, ChooseRequest } from '../packages/shared/src';
import { PUZZLES, solves } from '../scripts/benchmark-positions';

const input = (fen: string, analysis?: Analysis): ChooseRequest => { const s = new ChessStateManager(fen); return { ...s.decisionInput(s.turn), ...(analysis ? { analysis } : {}) }; };
const firstOption: Judge = async plan => ({ model: 'test', answers: Object.fromEntries(Object.entries(plan.questions).map(([k, q]) => { const keys = Object.keys(q.criteria); return [k, { type: 'choice', choice: keys[0], probabilities: Object.fromEntries(keys.map(x => [x, 1 / keys.length])) }]; })) });
const signal = () => new AbortController().signal;

describe('tactical rule facts', () => {
    it('reports a queen attacked by a pawn as exposed', () => {
        const g = verifiedChess('4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1');
        expect(exposedPieces(g, 'w').map(h => h.square)).toEqual(['d4']);
        expect(exposedPieces(g, 'b').map(h => h.square)).toEqual(['e5']);
    });
    it('reports what the moved piece attacks, naming double attacks', async () => {
        const { moveFacts, factsText } = await import('../apps/server/src/services/tactics');
        const g = verifiedChess('4k3/8/8/1q6/4N3/8/8/4K3 w - - 0 1');
        const f = moveFacts(g, g.moves({ verbose: true }).find(m => m.to === 'd6')!);
        expect(f.attacks.map(a => a.square)).toEqual(['e8', 'b5']);
        expect(factsText(f)).toMatch(/king \(check\), queen on b5 \(undefended\) - that is a double attack/);
        expect(g.fen()).toBe('4k3/8/8/1q6/4N3/8/8/4K3 w - - 0 1');
    });
    it('lists immediate threats: check, mate threats and exposed pieces', async () => {
        const { immediateThreats } = await import('../apps/server/src/services/tactics');
        expect(immediateThreats(verifiedChess('r5k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1'), 'w')).toEqual(['Opponent threatens mate in one: Ra1#.']);
        expect(immediateThreats(verifiedChess('4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1'), 'w')).toEqual([expect.stringMatching(/queen on d4 is exposed/)]);
        expect(immediateThreats(verifiedChess('4k3/8/8/8/8/8/8/r3K3 w - - 0 1'), 'w')).toEqual(['You are in check.']);
        expect(immediateThreats(verifiedChess('4k3/8/8/8/8/8/8/4K3 w - - 0 1'), 'w')).toEqual([]);
    });
    it('puts immediate threats into every question when tactical facts are on', () => {
        const plan = stagePlan(input('r5k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1', { depth: 'quick', tacticalFacts: true, blunderCheck: false }), []);
        expect(plan.questions.move.instructions).toMatch(/IMMEDIATE THREATS RIGHT NOW: Opponent threatens mate in one: Ra1#/);
        expect(stagePlan(input('r5k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1'), []).questions.intent.instructions).not.toMatch(/IMMEDIATE/);
    });
    it('warns about leaving material exposed or allowing mate, but not about mating', () => {
        expect(blunderWarnings(verifiedChess('4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1'), 'e1e2')).toEqual([expect.stringMatching(/queen on d4 exposed/)]);
        expect(blunderWarnings(verifiedChess('r5k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1'), 'g1h1')).toEqual([expect.stringMatching(/mate in one/)]);
        expect(blunderWarnings(verifiedChess('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'), 'a1a8')).toEqual([]);
        expect(blunderWarnings(verifiedChess('4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1'), 'd4e5')).toEqual([]);
    });
});

describe('analysis profiles', () => {
    it('keeps the original six stages and prompts when no analysis is requested', async () => {
        const d = await runStagedDecision(input('4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1'), firstOption, signal(), 'test', 'mock');
        expect(d.trace!.map(t => t.stage)).toEqual(['assess', 'reply', 'nominate', 'shortlist', 'continue', 'choose']);
        expect(JSON.stringify(stagePlan(input('4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1'), []))).not.toMatch(/Tactical facts|exposedPieces/);
    });
    it('runs a single choose stage over every legal move at quick depth', async () => {
        const i = input('4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1', { depth: 'quick', tacticalFacts: true, blunderCheck: false });
        const plan = stagePlan(i, []);
        expect(plan.stage).toBe('choose');
        expect(Object.keys(plan.questions.move.criteria).sort()).toEqual(i.legalMoves.map(m => m.uci).sort());
        expect(plan.questions.move.criteria.d4e5).toMatch(/Tactical facts/);
        expect(plan.state.exposedPieces).toEqual({ yours: [expect.stringMatching(/queen on d4/)], opponent: [expect.stringMatching(/pawn on e5/)] });
    });
    it('skips the reply and continue stages at reduced depth', async () => {
        const d = await runStagedDecision(input('4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1', { depth: 'reduced', tacticalFacts: true, blunderCheck: false }), firstOption, signal(), 'test', 'mock');
        expect(d.trace!.map(t => t.stage)).toEqual(['assess', 'nominate', 'shortlist', 'choose']);
    });
    it('asks Jev to confirm a flagged move and accepts its replacement', async () => {
        const seen: string[] = [];
        const judge: Judge = async plan => { seen.push(plan.stage); return { model: 'test', answers: { move: { type: 'choice', choice: plan.stage === 'choose' ? 'e1e2' : 'd4e5' } } }; };
        const d = await runStagedDecision(input('4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1', { depth: 'quick', tacticalFacts: true, blunderCheck: true }), judge, signal(), 'test', 'mock');
        expect(seen).toEqual(['choose', 'verify']);
        expect(d.uci).toBe('d4e5');
    });
    it('lets Jev keep a flagged move and never offers other flagged moves', async () => {
        let verifyOptions: string[] = [];
        const judge: Judge = async plan => { if (plan.stage === 'verify') verifyOptions = Object.keys(plan.questions.move.criteria); return { model: 'test', answers: { move: { type: 'choice', choice: 'e1e2' } } }; };
        const d = await runStagedDecision(input('4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1', { depth: 'quick', tacticalFacts: true, blunderCheck: true }), judge, signal(), 'test', 'mock');
        expect(d.uci).toBe('e1e2');
        expect(verifyOptions.at(-1)).toBe('e1e2');
        expect(verifyOptions[0]).not.toBe('e1e2');
        expect(verifyOptions).not.toContain('e1f1');
    });
    it('does not add a verify stage when the chosen move is clean', async () => {
        const judge: Judge = async () => ({ model: 'test', answers: { move: { type: 'choice', choice: 'd4e5' } } });
        const d = await runStagedDecision(input('4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1', { depth: 'quick', tacticalFacts: true, blunderCheck: true }), judge, signal(), 'test', 'mock');
        expect(d.trace!.map(t => t.stage)).toEqual(['choose']);
    });
});

describe('clock budget', () => {
    it('chooses depth from an even share of the clock plus increment', () => {
        expect(planTurn(1_800_000, 20_000, 0).depth).toBe('full');
        expect(planTurn(600_000, 5_000, 0).depth).toBe('reduced');
        expect(planTurn(180_000, 2_000, 0).depth).toBe('quick');
        expect(planTurn(1_800_000, 20_000, 0).deadlineMs).toBe(45000);
        const low = planTurn(5_000, 0, 60);
        expect(low.deadlineMs).toBe(3500); expect(low.blunderCheck).toBe(false);
    });
    it('uses the Lichess base-plus-40-increments estimate', () => { expect(estimatedGameSeconds(180, 2)).toBe(260); });
});

describe('decision cache', () => {
    it('reuses same-or-deeper answers for the same position and repetition count only', () => {
        const cache = new DecisionCache(), g = new Chess();
        cache.store(g, 'm', 'reduced', 'e2e4');
        expect(cache.lookup(g, 'm', 'quick')).toEqual({ uci: 'e2e4', kind: 'decision' });
        expect(cache.lookup(g, 'm', 'full')).toBeUndefined();
        expect(cache.lookup(g, 'other', 'quick')).toBeUndefined();
        for (const m of ['g1f3', 'g8f6', 'f3g1', 'f6g8']) g.move(m);
        expect(cache.lookup(g, 'm', 'quick')).toBeUndefined();
    });
    it('offers a planned continuation only when time is short', () => {
        const cache = new DecisionCache(), g = new Chess();
        cache.plan(g, 'e2e4', 'e7e5', 'g1f3', 'm');
        g.move('e4'); g.move('e5');
        expect(cache.lookup(g, 'm', 'full')).toBeUndefined();
        expect(cache.lookup(g, 'm', 'quick')).toEqual({ uci: 'g1f3', kind: 'planned' });
    });
    it('extracts the examined reply and continuation for the chosen move', () => {
        const t = (stage: any, answers: any) => ({ stage, answers, model: 'm', latencyMs: 0, source: 'mock' as const });
        expect(plannedReplyFromTrace([t('reply', { e2e4: { type: 'choice', choice: 'e7e5' } }), t('continue', { e2e4: { type: 'choice', choice: 'g1f3' } })], 'e2e4')).toEqual({ reply: 'e7e5', continuation: 'g1f3' });
        expect(plannedReplyFromTrace([], 'e2e4')).toBeUndefined();
    });
});

describe('benchmark puzzles', () => {
    for (const p of PUZZLES) it(`${p.id} is legal, solvable and failable`, () => {
        const moves = verifiedChess(p.fen).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion ?? ''));
        expect(moves.some(m => solves(p, m))).toBe(true);
        expect(moves.some(m => !solves(p, m))).toBe(true);
    });
});

class Feed {
    queue: unknown[] = []; wake?: () => void;
    push(e: unknown) { this.queue.push(e); this.wake?.(); }
    async *read(s: AbortSignal) { while (!s.aborted) { if (this.queue.length) { yield this.queue.shift(); continue; } await new Promise<void>(r => { this.wake = r; s.addEventListener('abort', r as () => void, { once: true }); }).finally(() => { this.wake = undefined; }); } }
}
const game = (moves: string, clockMs: number, incMs: number) => ({ type: 'gameFull', id: 'abcdefgh', variant: { key: 'standard' }, initialFen: 'startpos', white: { id: 'jevbot', name: 'JevBot' }, black: { id: 'other', name: 'Other' }, state: { type: 'gameState', moves, wtime: clockMs, btime: clockMs, winc: incMs, binc: incMs, status: 'started' } });
async function controllerWith(clockMs: number, incMs: number) {
    const events = new Feed(), feed = new Feed(), sent: string[] = [], records: { event: string; data: any }[] = [];
    const port: LichessPort = { account: async () => ({ id: 'jevbot', username: 'JevBot', title: 'BOT' }), events: s => events.read(s), game: (_i, s) => feed.read(s), accept: async () => {}, move: async (_i, uci) => { sent.push(uci); } };
    let pending: any;
    const controller = new LichessController({ client: port, provider: new MockProvider(), model: 'mock', providerMode: 'mock', logRoot: '/test/logs', record: async (event, data) => { records.push({ event, data }); }, pending: { load: async () => pending, save: async p => { pending = p; }, clear: async () => { pending = undefined; } } });
    await controller.connect(); events.push({ type: 'gameStart', game: { id: 'abcdefgh' } });
    await vi.waitFor(() => expect(controller.status().games).toHaveLength(1));
    await controller.select('abcdefgh'); feed.push(game('', clockMs, incMs));
    await vi.waitFor(() => expect(controller.status().game?.color).toBe('white'));
    return { controller, events, feed, sent, records };
}

describe('Lichess controller time management', () => {
    it('uses a single quick stage on a blitz clock and records a decision summary', async () => {
        const f = await controllerWith(180_000, 2_000);
        try {
            await f.controller.start(); await vi.waitFor(() => expect(f.sent).toHaveLength(1));
            expect(f.records.filter(r => r.event === 'decision.stage.start').map(r => r.data.stage)).toEqual(['choose']);
            expect(f.records.find(r => r.event === 'decision.stage.start')!.data.input.analysis).toEqual({ depth: 'quick', tacticalFacts: true, blunderCheck: true });
            expect(f.records.find(r => r.event === 'lichess.decision.summary')!.data).toMatchObject({ depth: 'quick', uci: f.sent[0], source: 'mock' });
            f.feed.push({ ...game(f.sent[0], 180_000, 2_000).state, moves: f.sent[0] });
            await vi.waitFor(() => expect(f.records.some(r => r.event === 'lichess.decision.confirmed')).toBe(true));
            expect(f.records.some(r => r.event === 'lichess.decision.failure')).toBe(false);
        } finally { await f.controller.disconnect(); }
    });
    it('rejects challenges too fast for Jev and flags them unsupported', async () => {
        const f = await controllerWith(1_800_000, 20_000);
        try {
            f.events.push({ type: 'gameFinish', game: { id: 'abcdefgh' } });
            await vi.waitFor(() => expect(f.controller.status().games).toHaveLength(0));
            f.events.push({ type: 'challenge', challenge: { id: 'bullet01', challenger: { id: 'other', name: 'Other' }, variant: { key: 'standard' }, rated: false, direction: 'in', timeControl: { type: 'clock', limit: 60, increment: 0 } } });
            await vi.waitFor(() => expect(f.controller.status().challenges).toHaveLength(1));
            expect(f.controller.status().challenges[0].supported).toBe(false);
            await expect(f.controller.accept('bullet01')).rejects.toThrow(/too fast/);
        } finally { await f.controller.disconnect(); }
    });
});

describe('Lichess AI opponents', () => {
    it('reconstructs a game against the built-in Lichess AI, which streams only aiLevel', async () => {
        const { reconstructGame } = await import('../apps/server/src/lichess/client');
        const g = { ...game('e2e4', 600_000, 0), white: { aiLevel: 3 }, black: { id: 'jevbot', name: 'JevBot' } };
        const r = reconstructGame(g, 'jevbot');
        expect(r.color).toBe('black');
        expect(r.moves).toEqual(['e2e4']);
    });
    it('still rejects seats that are neither an account nor an AI', async () => {
        const { reconstructGame } = await import('../apps/server/src/lichess/client');
        expect(() => reconstructGame({ ...game('', 600_000, 0), white: {} }, 'jevbot')).toThrow();
        expect(() => reconstructGame({ ...game('', 600_000, 0), white: { id: 'x1', name: 'X', aiLevel: 2 } }, 'jevbot')).toThrow();
        expect(() => reconstructGame({ ...game('', 600_000, 0), white: { aiLevel: 3 }, black: { aiLevel: 4 } }, 'jevbot')).toThrow(/not a player/);
    });
    it('plays and labels a game against the Lichess AI through the controller', async () => {
        const events = new Feed(), feed = new Feed(), sent: string[] = [];
        const port: LichessPort = { account: async () => ({ id: 'jevbot', username: 'JevBot', title: 'BOT' }), events: s => events.read(s), game: (_i, s) => feed.read(s), accept: async () => {}, move: async (_i, uci) => { sent.push(uci); } };
        let pending: any;
        const controller = new LichessController({ client: port, provider: new MockProvider(), model: 'mock', providerMode: 'mock', logRoot: '/test/logs', record: async () => {}, pending: { load: async () => pending, save: async p => { pending = p; }, clear: async () => { pending = undefined; } } });
        try {
            await controller.connect(); events.push({ type: 'gameStart', game: { id: 'abcdefgh' } });
            await vi.waitFor(() => expect(controller.status().games).toHaveLength(1));
            await controller.select('abcdefgh'); feed.push({ ...game('e2e4', 1_800_000, 20_000), white: { aiLevel: 3 }, black: { id: 'jevbot', name: 'JevBot' } });
            await vi.waitFor(() => expect(controller.status().game?.color).toBe('black'));
            expect(controller.status().game?.opponent).toBe('Lichess AI level 3');
            await controller.start(); await vi.waitFor(() => expect(sent).toHaveLength(1));
        } finally { await controller.disconnect(); }
    });
});

describe('finished Lichess games', () => {
    it('records the finish once and does not reconnect when Lichess closes the stream', async () => {
        const events = new Feed(), records: string[] = [];let opens = 0;
        const port: LichessPort = { account: async () => ({ id: 'jevbot', username: 'JevBot', title: 'BOT' }), events: s => events.read(s),
            game: async function* () { opens++; yield { ...game('f2f3 e7e5 g2g4 d8h4', 600_000, 0), state: { ...game('f2f3 e7e5 g2g4 d8h4', 600_000, 0).state, status: 'mate', winner: 'black' } }; },
            accept: async () => {}, move: async () => {} };
        let pending: any;
        const controller = new LichessController({ client: port, provider: new MockProvider(), model: 'mock', providerMode: 'mock', logRoot: '/test/logs', record: async e => { records.push(e); }, pending: { load: async () => pending, save: async p => { pending = p; }, clear: async () => { pending = undefined; } } });
        try {
            await controller.connect(); events.push({ type: 'gameStart', game: { id: 'abcdefgh' } });
            await vi.waitFor(() => expect(controller.status().games).toHaveLength(1));
            await controller.select('abcdefgh');
            await vi.waitFor(() => expect(records).toContain('lichess.finished'));
            await new Promise(r => setTimeout(r, 1500));
            expect(opens).toBe(1);
            expect(records.filter(e => e === 'lichess.finished')).toHaveLength(1);
            expect(records).not.toContain('lichess.stream.failure');
        } finally { await controller.disconnect(); }
    });
});
