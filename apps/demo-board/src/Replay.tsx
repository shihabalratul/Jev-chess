import type { ReactNode } from 'react';
import replayData from './replays/jev-vs-lichess-ai.json';

export type ReplayCandidate = { san: string; p: number };
export type ReplayDecision = {
    depth: 'full' | 'reduced' | 'quick';
    stages: string[];
    latencyMs: number;
    costUsd: number;
    intent?: { choice: 'offensive' | 'defensive'; p: number };
    nominated: number;
    shortlist: ReplayCandidate[];
    forecasts: number;
    lines: { move: string; reply: string; continuation: string }[];
    final: ReplayCandidate[];
    verify?: { flagged: string; warnings: string[]; final: ReplayCandidate[]; changed: boolean };
};
export type ReplayPly = { san: string; uci: string; fen: string; by: 'jev' | 'opponent'; jev?: ReplayDecision };
export type ReplayGame = {
    title: string;
    description: string;
    source: { site: string; url: string; opponent: string; timeControl: string };
    jevColor: 'white' | 'black';
    model: string;
    date: string;
    result: string;
    totalCostUsd: number;
    plies: ReplayPly[];
};

export const replay = replayData as ReplayGame;

const percent = (p: number) => `${Math.round(p * 100)}%`;
const side = (color: 'white' | 'black') => color === 'white' ? 'WHITE' : 'BLACK';
const depthLabel: Record<ReplayDecision['depth'], string> = { full: 'Full depth · 6 stages', reduced: 'Reduced depth · 4 stages', quick: 'Quick · 1 stage' };

function Bars({ items, chosen }: { items: ReplayCandidate[]; chosen: string }) {
    return (<ul className="prob-bars">
      {items.map((item) => <li key={item.san} className={item.san === chosen ? 'chosen' : undefined}>
        <span className="prob-san">{item.san}</span>
        <span className="prob-track"><span style={{ width: percent(Math.max(item.p, 0.02)) }}/></span>
        <span className="prob-value">{percent(item.p)}</span>
      </li>)}
    </ul>);
}

function Stage({ step, label, children }: { step: number; label: string; children: ReactNode }) {
    return <div className="stage"><span className="stage-step">{step}</span><div><span className="control-label">{label}</span>{children}</div></div>;
}

function Thinking({ d, played }: { d: ReplayDecision; played: string }) {
    let step = 0;
    const has = (s: string) => d.stages.includes(s);
    const choseBeforeVerify = d.final[0]?.san ?? played;
    return (<div className="thinking">
      <span className={`depth-badge depth-${d.depth}`}>{depthLabel[d.depth]}{d.verify ? ' + blunder check' : ''}</span>
      {d.intent && <Stage step={++step} label="ASSESS"><p>Whole-board intent: <strong>{d.intent.choice}</strong> ({percent(d.intent.p)}).</p></Stage>}
      {has('reply') && <Stage step={++step} label="FORECAST REPLIES"><p>Predicted the opponent's answer to each of {d.forecasts} legal moves.</p></Stage>}
      {has('nominate') && <Stage step={++step} label="NOMINATE"><p>One best move proposed for each of {d.nominated} movable pieces.</p></Stage>}
      {has('shortlist') && <Stage step={++step} label="SHORTLIST"><Bars items={d.shortlist} chosen={played}/></Stage>}
      {has('continue') && d.lines.length > 0 && <Stage step={++step} label="CONTINUATIONS">
        <ul className="reply-list">{d.lines.map((l) => <li key={l.move}><span>{l.move}</span><span className="reply-arrow">→</span><span>{l.reply}</span><span className="reply-arrow">→</span><span>{l.continuation}</span></li>)}</ul></Stage>}
      <Stage step={++step} label="CHOOSE"><Bars items={d.final} chosen={d.verify ? choseBeforeVerify : played}/></Stage>
      {d.verify && <Stage step={++step} label="BLUNDER CHECK">
        <p className="verify-warning">⚠ {d.verify.flagged}: {d.verify.warnings.join(' ')}</p>
        <Bars items={d.verify.final} chosen={played}/>
        <p>{d.verify.changed ? <>Jev reconsidered and switched to <strong>{played}</strong>.</> : <>Jev kept <strong>{played}</strong>.</>}</p>
      </Stage>}
    </div>);
}

type Props = { index: number; playing: boolean; onSeek: (index: number) => void; onTogglePlay: () => void };

export function ReplayPanel({ index, playing, onSeek, onTogglePlay }: Props) {
    const plies = replay.plies;
    const current = index > 0 ? plies[index - 1] : null;
    const thinking = current?.by === 'jev' ? current.jev : undefined;
    const rows = Array.from({ length: Math.ceil(plies.length / 2) }, (_, row) => row);
    const opponentColor = replay.jevColor === 'white' ? 'black' : 'white';
    return (<>
      <section className="panel-card replay-card">
        <div className="card-heading compact"><div><p className="eyebrow">REAL {replay.source.site.toUpperCase()} GAME · {replay.date}</p><h2>Watch Jev play</h2></div><span className="heading-icon">♞</span></div>
        <p className="replay-intro">{replay.description} <a href={replay.source.url} target="_blank" rel="noreferrer">View it on Lichess ↗</a></p>
        <div className="replay-controls" role="group" aria-label="Replay controls">
          <button type="button" onClick={() => onSeek(0)} disabled={index === 0} aria-label="Go to start">⏮</button>
          <button type="button" onClick={() => onSeek(index - 1)} disabled={index === 0} aria-label="Previous move">◀</button>
          <button type="button" className="play-button" onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚ Pause' : index >= plies.length ? '↺ Replay' : '▶ Play'}</button>
          <button type="button" onClick={() => onSeek(index + 1)} disabled={index >= plies.length} aria-label="Next move">▶</button>
          <button type="button" onClick={() => onSeek(plies.length)} disabled={index >= plies.length} aria-label="Go to end">⏭</button>
        </div>
        <p className="replay-progress">Move {Math.ceil(index / 2)} of {Math.ceil(plies.length / 2)} · {index}/{plies.length} plies</p>
      </section>

      <section className="panel-card thinking-card" aria-live="polite">
        <div className="card-heading compact"><div><p className="eyebrow">{current ? (current.by === 'jev' ? `JEV (${side(replay.jevColor)}) DECIDED` : `${replay.source.opponent.toUpperCase()} (${side(opponentColor)})`) : 'BEFORE THE FIRST MOVE'}</p><h2>{current ? current.san : 'Press play'}</h2></div>{thinking && <span className="move-count">{(thinking.latencyMs / 1000).toFixed(1)} s</span>}</div>
        {!current && <p className="empty-history">For each of Jev's moves you'll see the stages it ran (more when the clock allows), its shortlist, the lines it examined, its final probabilities, and any blunder-check warning.</p>}
        {current?.by === 'opponent' && <p className="empty-history">{replay.source.opponent}'s move. Jev sees it through the Lichess game stream and decides its reply.</p>}
        {thinking && <Thinking d={thinking} played={current!.san}/>}
      </section>

      <section className="panel-card moves-card">
        <div className="card-heading compact"><div><p className="eyebrow">GAME RECORD</p><h2>{replay.result}</h2></div><span className="move-count">{plies.length} plies</span></div>
        <ol className="move-list replay-moves" aria-label="Replay move list">{rows.map((row) => <li key={row}>
          <span className="move-number">{row + 1}.</span>
          {[row * 2, row * 2 + 1].map((i) => plies[i] ? <button key={i} type="button" className={`move-san move-jump${index === i + 1 ? ' current' : ''}${plies[i].jev?.verify?.changed ? ' verified' : ''}`} onClick={() => onSeek(i + 1)}>{plies[i].san}</button> : <span key={i} className="move-san">·</span>)}
        </li>)}</ol>
        <p className="replay-meta">Model <code>{replay.model}</code> · {replay.source.timeControl} · live API cost ${replay.totalCostUsd.toFixed(3)} for the whole game. One casual game against a low-level engine; not a rating.</p>
      </section>
    </>);
}
