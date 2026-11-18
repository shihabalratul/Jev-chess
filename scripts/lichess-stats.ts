import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Summarise Lichess BOT play from the local session journals (no network).
 *   pnpm lichess:stats [--since=2026-11-01]
 */
interface Summary { depth: string; source: string; latencyMs: number; cost: number; verified: boolean; changedByVerify: boolean }
export async function collect(root: string, since?: Date) {
    const decisions: Summary[] = [], games = new Map<string, { status: string; winner: string | null; color: string; plies: number }>();
    let sessions: string[] = [];
    try { sessions = await readdir(root); } catch { return { decisions, games }; }
    for (const session of sessions) {
        let files: string[] = [];
        try { files = (await readdir(join(root, session))).filter(n => /^events\.\d+\.jsonl$/.test(n)).sort(); } catch { continue; }
        for (const file of files) {
            const lines = createInterface({ input: createReadStream(join(root, session, file)), crlfDelay: Infinity });
            for await (const line of lines) {
                if (!line.includes('lichess.decision.summary') && !line.includes('lichess.finished')) continue;
                let event: { event: string; timestamp: string; data: any };
                try { event = JSON.parse(line); } catch { continue; }
                if (since && new Date(event.timestamp) < since) continue;
                if (event.event === 'lichess.decision.summary') decisions.push(event.data);
                if (event.event === 'lichess.finished' && event.data?.color) games.set(`${session}:${event.data.id}`, event.data);
            }
        }
    }
    return { decisions, games };
}
async function main() {
    const sinceArg = process.argv.find(a => a.startsWith('--since='))?.split('=')[1];
    const { decisions, games } = await collect(resolve(process.env.LOG_DIR ?? 'logs'), sinceArg ? new Date(sinceArg) : undefined);
    const results = { win: 0, loss: 0, draw: 0, other: 0 };
    for (const g of games.values()) {
        if (g.winner) results[g.winner === g.color ? 'win' : 'loss']++;
        else if (['draw', 'stalemate'].includes(g.status)) results.draw++;
        else results.other++;
    }
    const byDepth: Record<string, { count: number; meanLatencyMs: number; cost: number }> = {};
    for (const d of decisions) {
        const key = d.source === 'provider' ? d.depth : d.source;
        const b = byDepth[key] ??= { count: 0, meanLatencyMs: 0, cost: 0 };
        b.meanLatencyMs = (b.meanLatencyMs * b.count + d.latencyMs) / (b.count + 1); b.count++; b.cost += d.cost;
    }
    for (const b of Object.values(byDepth)) b.meanLatencyMs = Math.round(b.meanLatencyMs);
    const verified = decisions.filter(d => d.verified).length;
    console.log(JSON.stringify({
        games: games.size, results, decisions: decisions.length, byDepthOrSource: byDepth,
        blunderCheck: { triggered: verified, changedMove: decisions.filter(d => d.changedByVerify).length },
        totalCost: decisions.reduce((n, d) => n + d.cost, 0),
        note: 'Only games played after the decision summary logging was added are counted.',
    }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
