import replayData from './replays/jev-vs-random.json';

export type ReplayCandidate = { san: string; p: number };
export type ReplayPly = {
    san: string;
    uci: string;
    fen: string;
    by: 'jev' | 'opponent';
    jev?: {
        nominated: number;
        shortlist: ReplayCandidate[];
        replies: { move: string; reply: string }[];
        final: ReplayCandidate[];
        latencyMs: number;
    };
};
export type ReplayGame = {
    title: string;
    description: string;
    model: string;
    date: string;
    result: string;
    stages: string[];
    totalCostUsd: number;
    plies: ReplayPly[];
};

export const replay = replayData as ReplayGame;

const percent = (p: number) => `${Math.round(p * 100)}%`;

function Bars({ items, chosen }: { items: ReplayCandidate[]; chosen: string }) {
    return (<ul className="prob-bars">
      {items.map((item) => <li key={item.san} className={item.san === chosen ? 'chosen' : undefined}>
        <span className="prob-san">{item.san}</span>
        <span className="prob-track"><span style={{ width: percent(Math.max(item.p, 0.02)) }}/></span>
        <span className="prob-value">{percent(item.p)}</span>
      </li>)}
    </ul>);
}

type Props = {
    index: number;
    playing: boolean;
    onSeek: (index: number) => void;
    onTogglePlay: () => void;
};

export function ReplayPanel({ index, playing, onSeek, onTogglePlay }: Props) {
    const plies = replay.plies;
    const current = index > 0 ? plies[index - 1] : null;
    const thinking = current?.by === 'jev' ? current.jev : undefined;
    const rows = Array.from({ length: Math.ceil(plies.length / 2) }, (_, row) => row);
    return (<>
      <section className="panel-card replay-card">
        <div className="card-heading compact"><div><p className="eyebrow">REAL RECORDED GAME</p><h2>Watch Jev play</h2></div><span className="heading-icon">♞</span></div>
        <p className="replay-intro">{replay.description}</p>
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
        <div className="card-heading compact"><div><p className="eyebrow">{current ? (current.by === 'jev' ? 'JEV (WHITE) DECIDED' : 'RANDOM OPPONENT (BLACK)') : 'BEFORE THE FIRST MOVE'}</p><h2>{current ? current.san : 'Press play'}</h2></div>{thinking && <span className="move-count">{(thinking.latencyMs / 1000).toFixed(1)} s</span>}</div>
        {!current && <p className="empty-history">Each of Jev's moves shows what it considered: nominated moves, a shortlist, the reply it expected and its final probabilities.</p>}
        {current?.by === 'opponent' && <p className="empty-history">The opponent picks a uniformly random legal move. No thinking here!</p>}
        {thinking && <div className="thinking">
          <div className="stage"><span className="stage-step">1</span><div><span className="control-label">NOMINATE</span><p>One best move proposed for each of {thinking.nominated} movable pieces.</p></div></div>
          <div className="stage"><span className="stage-step">2</span><div><span className="control-label">SHORTLIST</span><Bars items={thinking.shortlist} chosen={current!.san}/></div></div>
          {thinking.replies.length > 0 && <div className="stage"><span className="stage-step">3</span><div><span className="control-label">FORECAST REPLIES</span>
            <ul className="reply-list">{thinking.replies.map((r) => <li key={r.move}><span>{r.move}</span><span className="reply-arrow">→</span><span>{r.reply}</span></li>)}</ul></div></div>}
          <div className="stage"><span className="stage-step">4</span><div><span className="control-label">CHOOSE</span><Bars items={thinking.final} chosen={current!.san}/></div></div>
        </div>}
      </section>

      <section className="panel-card moves-card">
        <div className="card-heading compact"><div><p className="eyebrow">GAME RECORD</p><h2>{replay.result}</h2></div><span className="move-count">{plies.length} plies</span></div>
        <ol className="move-list replay-moves" aria-label="Replay move list">{rows.map((row) => <li key={row}>
          <span className="move-number">{row + 1}.</span>
          {[row * 2, row * 2 + 1].map((i) => plies[i] ? <button key={i} type="button" className={`move-san move-jump${index === i + 1 ? ' current' : ''}`} onClick={() => onSeek(i + 1)}>{plies[i].san}</button> : <span key={i} className="move-san">·</span>)}
        </li>)}</ol>
        <p className="replay-meta">Model <code>{replay.model}</code> · {replay.date} · live API cost ${replay.totalCostUsd.toFixed(4)}. A single game against a random mover; it says nothing about playing strength.</p>
      </section>
    </>);
}
