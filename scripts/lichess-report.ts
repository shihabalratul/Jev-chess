import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Chess } from 'chess.js';
import { exposedPieces } from '../apps/server/src/services/tactics';

/**
 * Per-game breakdown of Lichess BOT games from local journals (no network).
 *   pnpm lichess:report [--json]
 * "Hanging after Jev's move" counts Jev moves that left a piece worth 3+ exposed which the opponent then captured
 * on the next ply. It uses the same rule arithmetic as the blunder check, not an engine.
 */
interface Game { id: string; session: string; finishedAt: string; white: string; black: string; color: 'white' | 'black'; status: string; winner: string | null; plies: number; pgn: string;
    decisions: number; cost: number; meanLatencyMs: number; depths: Record<string, number>; verifyTriggered: number; verifyChanged: number; materialDropped: { ply: number; san: string; piece: string }[] }
const value: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const names: Record<string, string> = { n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };

async function* events(root: string) {
    for (const session of await readdir(root).catch(() => [] as string[])) {
        const files = (await readdir(join(root, session)).catch(() => [] as string[])).filter(n => /^events\.\d+\.jsonl$/.test(n)).sort();
        for (const file of files) for await (const line of createInterface({ input: createReadStream(join(root, session, file)), crlfDelay: Infinity })) {
            if (!line.includes('"lichess.finished"') && !line.includes('"lichess.decision.summary"')) continue;
            try { yield { session, ...JSON.parse(line) }; } catch { /* torn line */ }
        }
    }
}
function dropped(pgn: string, color: 'white' | 'black') {
    const replay = new Chess(); replay.loadPgn(pgn, { strict: true });
    const moves = replay.history({ verbose: true }), own = color === 'white' ? 'w' : 'b', out: Game['materialDropped'] = [];
    const g = new Chess(moves[0]?.before);
    moves.forEach((m, i) => {
        g.move(m);
        const next = moves[i + 1];
        if (m.color !== own || !next?.captured || value[next.captured] < 3) return;
        if (exposedPieces(g, own).some(h => h.square === next.to)) out.push({ ply: i + 1, san: `${Math.floor(i / 2) + 1}${m.color === 'w' ? '.' : '...'}${m.san}`, piece: names[next.captured] });
    });
    return out;
}
export async function report(root: string) {
    const games = new Map<string, Game>(), summaries = new Map<string, any[]>();
    for await (const e of events(root)) {
        if (e.event === 'lichess.decision.summary') { const k = e.data.gameId; summaries.set(k, [...(summaries.get(k) ?? []), e.data]); }
        if (e.event === 'lichess.finished' && e.data.pgn && !games.has(e.data.id)) games.set(e.data.id, { id: e.data.id, session: e.session, finishedAt: e.timestamp, white: e.data.white, black: e.data.black, color: e.data.color, status: e.data.status, winner: e.data.winner, plies: e.data.plies, pgn: e.data.pgn,
            decisions: 0, cost: 0, meanLatencyMs: 0, depths: {}, verifyTriggered: 0, verifyChanged: 0, materialDropped: [] });
    }
    for (const g of games.values()) {
        const s = summaries.get(g.id) ?? [];
        g.decisions = s.length; g.cost = s.reduce((n, x) => n + x.cost, 0);
        const timed = s.filter(x => x.source === 'provider');
        g.meanLatencyMs = timed.length ? Math.round(timed.reduce((n, x) => n + x.latencyMs, 0) / timed.length) : 0;
        for (const x of s) { const k = x.source === 'provider' ? x.depth : x.source; g.depths[k] = (g.depths[k] ?? 0) + 1; }
        g.verifyTriggered = s.filter(x => x.verified).length; g.verifyChanged = s.filter(x => x.changedByVerify).length;
        g.materialDropped = dropped(g.pgn, g.color);
    }
    return [...games.values()].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
}
async function main() {
    const games = await report(resolve(process.env.LOG_DIR ?? 'logs'));
    if (process.argv.includes('--json')) { console.log(JSON.stringify(games, null, 2)); return; }
    for (const g of games) {
        const opp = g.color === 'white' ? g.black : g.white, result = g.winner ? (g.winner === g.color ? 'WIN ' : 'LOSS') : 'DRAW';
        console.log(`${result} ${g.id} vs ${opp} as ${g.color}, ${g.status} after ${Math.ceil(g.plies / 2)} moves | ${g.decisions} decisions, $${g.cost.toFixed(4)}, ${(g.meanLatencyMs / 1000).toFixed(1)}s/move, depths ${JSON.stringify(g.depths)} | verify ${g.verifyChanged}/${g.verifyTriggered} changed | hanging pieces lost: ${g.materialDropped.map(d => `${d.san} (${d.piece})`).join(', ') || 'none'}`);
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
