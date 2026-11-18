import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ChessStateManager } from '../packages/chess-core/src';
import { deadlineSignal, DECISION_DEPTHS, type Analysis, type Decision } from '../packages/shared/src';
import { runStagedDecision, type Judge } from '../apps/server/src/services/decisions';
import { OpenRouterProvider } from '../apps/server/src/providers/openrouter';
import { SessionJournal, auditContext, audit } from '../apps/server/src/services/journal';
import { PUZZLES, solves } from './benchmark-positions';

/**
 * Tactics solve-rate benchmark for Jev.
 *   pnpm benchmark:puzzles --live [--depth=quick|reduced|full] [--no-facts] [--no-verify]
 *   pnpm benchmark:puzzles --mock   (harness dry run: always picks the first option; NOT a measurement of Jev)
 * Live runs append one line to logs/benchmark-history.jsonl so changes can be compared over time.
 */
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
async function main() {
    const live = process.argv.includes('--live'), mock = process.argv.includes('--mock');
    if (live === mock) throw new Error('Pass exactly one of --live (paid OpenRouter calls) or --mock (no requests). No request was made.');
    const depth = (arg('depth') ?? 'reduced') as Analysis['depth'];
    if (!DECISION_DEPTHS.includes(depth)) throw new Error(`--depth must be one of ${DECISION_DEPTHS.join(', ')}`);
    const analysis: Analysis = { depth, tacticalFacts: !process.argv.includes('--no-facts'), blunderCheck: !process.argv.includes('--no-verify') };
    const model = process.env.JEV_MODEL ?? 'typesafe/jev-1.13', root = resolve(process.env.LOG_DIR ?? 'logs'), sessionId = randomUUID();
    let judge: Judge;
    if (live) {
        if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY required for --live');
        auditContext.enterWith({ journal: new SessionJournal(root, [process.env.OPENROUTER_API_KEY]), sessionId, requestId: randomUUID(), sequence: 0, started: performance.now() });
        const provider = new OpenRouterProvider({ apiKey: process.env.OPENROUTER_API_KEY, visionModel: process.env.VISION_MODEL ?? 'openai/gpt-6-luna', jevModel: model, timeoutMs: 10000, retries: 1 });
        judge = (plan, signal) => provider.judge(plan, signal);
    } else {
        judge = async plan => ({ model: 'mock/first-option', answers: Object.fromEntries(Object.entries(plan.questions).map(([k, q]) => { const keys = Object.keys(q.criteria); return [k, { type: 'choice', choice: keys[0], probabilities: Object.fromEntries(keys.map(x => [x, 1 / keys.length])) }]; })) });
    }
    const cost = (d: Decision) => (d.trace ?? []).reduce((n, t) => n + (t.usage && typeof t.usage === 'object' && 'cost' in t.usage && typeof t.usage.cost === 'number' ? t.usage.cost : 0), 0);
    const results = [];
    for (const puzzle of PUZZLES) {
        const state = new ChessStateManager(puzzle.fen), color = state.turn;
        try {
            const decision = await runStagedDecision({ ...state.decisionInput(color), analysis }, judge, deadlineSignal(undefined, 45000), live ? model : 'mock/first-option', live ? 'provider' : 'mock');
            const solved = solves(puzzle, decision.uci);
            const result = { id: puzzle.id, theme: puzzle.theme, uci: decision.uci, solved, stages: decision.trace?.map(t => t.stage) ?? [], latencyMs: Math.round(decision.latencyMs), cost: cost(decision) };
            results.push(result); await audit('benchmark.puzzle', result);
            console.log(`${solved ? 'PASS' : 'FAIL'}  ${puzzle.id.padEnd(24)} ${decision.uci}`);
        } catch (error) {
            const result = { id: puzzle.id, theme: puzzle.theme, solved: false, error: (error as Error).message };
            results.push(result); await audit('benchmark.puzzle', result);
            console.log(`ERROR ${puzzle.id.padEnd(24)} ${(error as Error).message}`);
        }
    }
    const solved = results.filter(r => r.solved).length;
    const summary = { timestamp: new Date().toISOString(), sessionId, source: live ? 'live' : 'mock', model: live ? model : 'mock/first-option', analysis, puzzles: PUZZLES.length, solved, solveRate: solved / PUZZLES.length,
        totalCost: results.reduce((n, r) => n + ('cost' in r ? r.cost : 0), 0), meanLatencyMs: Math.round(results.reduce((n, r) => n + ('latencyMs' in r ? r.latencyMs : 0), 0) / PUZZLES.length) };
    const directory = join(root, sessionId); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'puzzles.json'), JSON.stringify({ ...summary, results }, null, 2));
    if (live) await appendFile(join(root, 'benchmark-history.jsonl'), JSON.stringify(summary) + '\n');
    console.log(JSON.stringify({ ...summary, report: join(directory, 'puzzles.json') }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
