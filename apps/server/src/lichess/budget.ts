import { Chess } from 'chess.js';
import type { Analysis, StageTrace } from '../../../../packages/shared/src';

/** Lichess convention for comparing time controls: base + 40 moves of increment. */
export const estimatedGameSeconds = (limitSeconds: number, incrementSeconds: number) => limitSeconds + 40 * incrementSeconds;

export interface TurnPlan { depth: Analysis['depth']; blunderCheck: boolean; targetMs: number; deadlineMs: number; movesLeft: number }

/**
 * Spend roughly an even share of the remaining clock, plus most of the increment.
 * Depth only changes how many Jev questions are asked; Jev still makes every choice.
 */
export function planTurn(remainingMs: number, incrementMs: number, plies: number): TurnPlan {
    const movesLeft = Math.max(15, 40 - Math.floor(plies / 2));
    const targetMs = Math.max(0, remainingMs / movesLeft + 0.8 * incrementMs);
    const depth: Analysis['depth'] = targetMs >= 30000 ? 'full' : targetMs >= 10000 ? 'reduced' : 'quick';
    const deadlineMs = Math.floor(Math.min(45000, remainingMs - 1500, Math.max(targetMs * 2, 6000)));
    return { depth, blunderCheck: targetMs >= 4000, targetMs: Math.round(targetMs), deadlineMs, movesLeft };
}

/** Position identity for reuse: placement, turn, castling, en passant, plus how often it occurred before. */
function positionKey(chess: Chess) {
    const fields = chess.fen().split(' ');
    const key = fields.slice(0, 4).join(' ');
    const seen = chess.history({ verbose: true }).filter(m => m.before.split(' ').slice(0, 4).join(' ') === key).length;
    // Near the fifty-move limit the halfmove clock matters, so do not share answers there.
    return Number(fields[4]) >= 80 ? `${key}|${seen}|hm${fields[4]}` : `${key}|${seen}`;
}

const order: Analysis['depth'][] = ['full', 'reduced', 'quick'];

/** Bounded in-memory reuse of Jev's own earlier answers. Never invents a move. */
export class DecisionCache {
    private decisions = new Map<string, string>();
    private planned = new Map<string, string>();
    constructor(private limit = 2000) {}
    private put(map: Map<string, string>, key: string, uci: string) {
        map.delete(key); map.set(key, uci);
        while (map.size > this.limit) map.delete(map.keys().next().value!);
    }
    store(chess: Chess, model: string, depth: Analysis['depth'], uci: string) { this.put(this.decisions, `${model}|${depth}|${positionKey(chess)}`, uci); }
    /** Remember Jev's continuation for the line it examined, keyed by the position after its move and the forecast reply. */
    plan(chess: Chess, uci: string, reply: string, continuation: string, model: string) {
        // Rebuild history so repetition counts in the key stay correct.
        const replay = new Chess(chess.fen());
        if (chess.history().length) replay.loadPgn(chess.pgn(), { strict: true });
        const step = (u: string) => replay.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
        try { step(uci); step(reply); } catch { return; }
        this.put(this.planned, `${model}|${positionKey(replay)}`, continuation);
    }
    /** Same or deeper analysis of this exact position is reused. Planned continuations only stand in when time is short. */
    lookup(chess: Chess, model: string, depth: Analysis['depth']): { uci: string; kind: 'decision' | 'planned' } | undefined {
        const key = positionKey(chess);
        for (const d of order.slice(0, order.indexOf(depth) + 1)) {
            const uci = this.decisions.get(`${model}|${d}|${key}`);
            if (uci) return { uci, kind: 'decision' };
        }
        if (depth === 'quick') {
            const uci = this.planned.get(`${model}|${key}`);
            if (uci) return { uci, kind: 'planned' };
        }
        return undefined;
    }
}

/** Jev's examined reply and its own continuation for the chosen move, when the full pipeline produced them. */
export function plannedReplyFromTrace(trace: StageTrace[], uci: string) {
    const reply = trace.find(t => t.stage === 'reply')?.answers[uci]?.choice;
    const continuation = trace.find(t => t.stage === 'continue')?.answers[uci]?.choice;
    return reply && continuation ? { reply, continuation } : undefined;
}
