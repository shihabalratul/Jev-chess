// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { corroboratePgn, gameContext, publicMovePgn } from '../packages/board-detection/src';
const chesscomAnalysis = JSON.parse(readFileSync('tests/fixtures/chesscom-analysis-dom.json', 'utf8')) as { board: string; moveList: string };

beforeEach(() => { document.body.innerHTML = ''; });

it('extracts the recorded public Chess.com analysis list as one complete history', () => {
    document.body.innerHTML = chesscomAnalysis.board + chesscomAnalysis.moveList;
    expect(publicMovePgn()).toBe('1. e4 e5 2. Nf3');
    expect(JSON.parse(gameContext()!).sources).toHaveLength(1);
    expect(corroboratePgn('1. e4 e5 2. Nf3', gameContext()!)).toBe(true);
});

it('recognizes generic move-list custom elements without requiring provider-specific classes', () => {
    document.body.innerHTML = '<wc-move-list><div class="move-list-row">1. e4 e5</div><div class="move-list-row">2. Nf3</div></wc-move-list>';
    expect(publicMovePgn()).toBe('1. e4 e5 2. Nf3');
});

it('replays ordinary numbered ordered-list rows from the standard initial position', () => {
    document.body.innerHTML = '<ol aria-label="Move history"><li>e4 e5</li><li>Nf3 Nc6</li><li>Bb5 a6</li></ol>';
    expect(publicMovePgn()).toBe('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
    expect(gameContext()).toContain('1. e4 e5');
});

it('keeps wrapped move cells separated and accepts castling and a final white ply', () => {
    document.body.innerHTML = `<div class="move-list"><div><span>1.</span><span>e4</span><span>e5</span></div>
      <div>2. <span>Nf3</span> <span>Nc6</span></div><div>3. Bb5 a6</div><div>4. Ba4 Nf6</div><div>5. O-O</div></div>`;
    expect(publicMovePgn()).toBe('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O');
});

it('preserves numbered markers split across adjacent React-style text nodes', () => {
    document.body.innerHTML = '<div class="move-list"><div><span></span><span>e4</span><span>e5</span></div><div><span></span><span>Nf3</span><span>Nc6</span></div></div>';
    const markers = document.querySelectorAll('.move-list > div > span:first-child');
    markers.forEach((marker, index) => {
        marker.append(document.createTextNode(String(index + 1)), document.createTextNode('.'));
    });
    expect(gameContext()).toContain('1. e4 e5 2. Nf3 Nc6');
    expect(publicMovePgn()).toBe('1. e4 e5 2. Nf3 Nc6');
    expect(corroboratePgn('1. e4 e5 2. Nf3 Nc6', gameContext()!)).toBe(true);
});

it('keeps separately rendered move cells apart while preserving adjacent SAN text fragments', () => {
    document.body.innerHTML = '<section aria-label="Move history"><span>1.</span><span></span><span>e5</span></section>';
    document.querySelectorAll('section > span')[1].append(document.createTextNode('e'), document.createTextNode('4'));
    expect(publicMovePgn()).toBe('1. e4 e5');
});

it.each([
    '8. e4 e5 9. Nf3 Nc6',
    '1... e5 2. Nf3 Nc6',
    '1. e4 e5 3. Nf3 Nc6',
    '1. e4 2. Nf3 Nc6',
    '1. e4 e5 Nf3 Nc6',
    '1. e4 e5 2. Nc3 Nc6 2. Nf3 Nf6',
    '1. e5 e4',
    '1. e2e4 e7e5',
    '1. e4 e5 ... 2. Nf3 Nc6',
])('rejects incomplete, inconsistent or nonstandard numbered history: %s', history => {
    document.body.innerHTML = `<section aria-label="Game notation">${history}</section>`;
    expect(publicMovePgn()).toBeUndefined();
});

it('rejects ordered lists starting later or reversing the move order', () => {
    document.body.innerHTML = '<ol aria-label="Move history" start="8"><li>e4 e5</li></ol>';
    expect(publicMovePgn()).toBeUndefined();
    document.body.innerHTML = '<ol aria-label="Move history" reversed><li>e4 e5</li></ol>';
    expect(publicMovePgn()).toBeUndefined();
});

it.each(['style="list-style-type:none"', 'type="a"', 'type="I"'])('does not invent decimal numbering when native list markers are absent or different: %s', attributes => {
    document.body.innerHTML = `<ol aria-label="Move history" ${attributes}><li>e4 e5</li><li>Nf3 Nc6</li></ol>`;
    expect(publicMovePgn()).toBeUndefined();
});

it('keeps separate unlabelled lists in a history panel as separate games', () => {
    document.body.innerHTML = '<section class="move-history"><ol><li>e4 e5</li></ol><ol><li>d4 d5</li></ol></section>';
    const context = JSON.parse(gameContext()!);
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0].text).toBe('1. e4 e5');
    expect(context.sources[1].text).toBe('1. d4 d5');
    expect(publicMovePgn()).toBeUndefined();
});

it('excludes hidden history, unrelated history, inputs and private nested content', () => {
    document.body.innerHTML = `<div hidden><ol aria-label="Move history"><li>d4 d5</li></ol></div>
      <section class="move-history"><div>1. e4 e5</div><script>secretScript</script><style>.secretStyle{}</style>
      <form><p>secretForm</p><input value="secretInput"></form><textarea>secretTextarea</textarea>
      <aside aria-label="Private chat">secretChat</aside><span style="display:none">secretHidden</span>
      <div class="player-profile">secretProfile</div><a href="?secretLink" data-token="secretAttribute">2. Nf3 Nc6</a></section>
      <section aria-label="Account history">secretAccount</section><p>secretOutside</p>`;
    expect(publicMovePgn()).toBe('1. e4 e5 2. Nf3 Nc6');
    const context = gameContext()!;
    expect(context).not.toContain('secret');
    expect(context).not.toContain('Account');
    expect(context).not.toContain('href');
});

it.each(['display: none', 'visibility: hidden', 'opacity: 0', 'content-visibility: hidden'])('excludes a CSS-hidden ancestor: %s', style => {
    document.body.innerHTML = `<div style="${style}"><div class="move-list">1. e4 e5</div></div>`;
    expect(gameContext()).toBeUndefined();
    expect(publicMovePgn()).toBeUndefined();
});

it('retains parseable-looking but unsupported notation as context without manufacturing PGN', () => {
    document.body.innerHTML = '<section id="game-notation">1. e4 e5 2. Nf3 ??</section>';
    expect(gameContext()).toContain('1. e4 e5 2. Nf3 ??');
    expect(publicMovePgn()).toBeUndefined();
});

it('only exposes a reliable visible empty-history label and never invents an initial PGN', () => {
    document.body.innerHTML = '<ol aria-label="Move history"></ol>';
    expect(gameContext()).toBeUndefined();
    expect(publicMovePgn()).toBeUndefined();
    document.body.innerHTML = '<section aria-label="Move history"><p>No moves yet</p></section>';
    expect(gameContext()).toContain('No moves yet');
    expect(publicMovePgn()).toBeUndefined();
});

it('exposes an explicit visible empty-history aria label without manufacturing a PGN', () => {
    document.body.innerHTML = '<section aria-label="Move history: no moves yet"></section>';
    expect(gameContext()).toContain('No moves yet');
    expect(publicMovePgn()).toBeUndefined();
});

it('preserves source boundaries and rejects multiple conflicting complete games', () => {
    document.body.innerHTML = '<section aria-label="Move history">1. e4 e5</section><ol class="move-list"><li>d4 d5</li></ol>';
    const context = JSON.parse(gameContext()!);
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0].text).toBe('1. e4 e5');
    expect(context.sources[1].text).toBe('1. d4 d5');
    expect(publicMovePgn()).toBeUndefined();
    expect(corroboratePgn('1. e4 e5', gameContext()!)).toBe(false);
});

it('does not merge separate incomplete histories to manufacture a complete game', () => {
    document.body.innerHTML = '<div class="move-list">1. e4 e5</div><div class="game-notation">2. Nf3 Nc6</div>';
    expect(publicMovePgn()).toBeUndefined();
    expect(corroboratePgn('1. e4 e5 2. Nf3 Nc6', gameContext()!)).toBe(false);
});

it('deduplicates nested and identical histories while preserving one complete sequence', () => {
    document.body.innerHTML = '<section class="move-history"><ol class="move-list"><li>e4 e5</li></ol></section><div class="game-notation">1. e4 e5</div>';
    expect(JSON.parse(gameContext()!).sources).toHaveLength(2);
    expect(publicMovePgn()).toBe('1. e4 e5');
});

it('corroborates the entire exact SAN sequence including figurines and annotations', () => {
    document.body.innerHTML = '<div class="move-list">1. e4! e5 2. ♘f3 ♞c6</div>';
    const context = gameContext()!;
    expect(corroboratePgn('1. e4 e5 2. Nf3 Nc6', context)).toBe(true);
    expect(corroboratePgn('1. e4 e5', context)).toBe(false);
    expect(corroboratePgn('1. e4 e5 2. Nf3 Nc6 3. Bb5', context)).toBe(false);
    expect(corroboratePgn('1. e4 e5 2. Nc3 Nc6', context)).toBe(false);
    expect(corroboratePgn('1. e4 e5', 'not JSON')).toBe(false);
});

it('reads explicitly evidenced visible figurine icons in the recorded computer move-list shape', () => {
    document.body.innerHTML = `<wc-simple-move-list class="play-controller-moveList move-list chessboard-pkg-move-list-component" board-id="board-play-computer"><div>
      <div class="main-line-row move-list-row light-row" data-whole-move-number="1">1.
        <div data-node="0-0" class="node white-move main-line-ply"><span class="node-highlight-content">f4 </span></div>
        <div data-node="0-1" class="node black-move main-line-ply"><span>d5 </span></div></div>
      <div class="main-line-row move-list-row dark-row">2.
        <div class="node white-move main-line-ply"><span class="node-highlight-content"><span class="icon-font-chess knight-white" data-figurine="N"></span> f3 </span></div>
        <div class="node black-move main-line-ply"><span><span class="icon-font-chess knight-black" data-figurine="N"></span> h6 </span></div></div>
      <div class="main-line-row move-list-row light-row">3.
        <div class="node white-move main-line-ply"><span><span data-figurine="N"></span> c3 </span></div><div class="node black-move main-line-ply"><span>f5</span></div></div>
      <div class="main-line-row move-list-row dark-row">4.
        <div class="node white-move main-line-ply"><span><span data-figurine="N"></span> xd5 </span></div>
        <div class="node black-move main-line-ply"><span><span data-figurine="K"></span> f7 </span></div></div>
    </div></wc-simple-move-list>`;
    expect(publicMovePgn()).toBe('1. f4 d5 2. Nf3 Nh6 3. Nc3 f5 4. Nxd5 Kf7');
    expect(corroboratePgn('1. f4 d5 2. Nf3 Nh6 3. Nc3 f5 4. Nxd5 Kf7', gameContext()!)).toBe(true);
    expect(gameContext()).not.toContain('data-figurine');
});

it('binds a figurine to its split adjacent SAN text without joining separate move cells', () => {
    document.body.innerHTML = '<div class="move-list">1. e4 e5 2. <span><i data-figurine="N"></i></span><span>Nc6</span></div>';
    const cell = document.querySelector('.move-list > span')!;
    cell.append(document.createTextNode(' f'), document.createComment('React boundary'), document.createTextNode('3'));
    expect(publicMovePgn()).toBe('1. e4 e5 2. Nf3 Nc6');
});

it('uses a matching rendered piece letter and its figurine attribute only once', () => {
    document.body.innerHTML = '<div class="move-list">1. e4 e5 2. <span><i data-figurine="N">N</i> f3</span> Nc6</div>';
    expect(publicMovePgn()).toBe('1. e4 e5 2. Nf3 Nc6');
});

it.each(['K', 'Q', 'R', 'B', 'N', 'P'])('serializes only an explicit visible %s figurine symbol with its SAN tail', piece => {
    document.body.innerHTML = `<div class="move-list">1. <span><i data-figurine="${piece}"></i>e4</span> e5</div>`;
    const expected = piece === 'P' ? '1. e4 e5' : `1. ${piece}e4 e5`;
    expect(JSON.parse(gameContext()!).sources[0].text).toBe(expected);
    if (piece === 'P') expect(publicMovePgn()).toBe('1. e4 e5');
    else expect(publicMovePgn()).toBeUndefined();
});

it.each([
    '<span><i data-figurine="N" hidden></i>f3</span>',
    '<span><i data-figurine="N" style="display:none"></i>f3</span>',
    '<span><i data-figurine="N Q"></i>f3</span>',
    '<span><i data-figurine="N"></i><i data-figurine="Q"></i>f3</span>',
    '<span><i data-figurine="N">♕</i>f3</span>',
    '<span><i data-figurine="N"></i></span><span>f3</span>',
    '<span><i data-figurine="N"></i></span>',
])('rejects hidden, ambiguous or orphaned figurines rather than losing a piece prefix: %s', cell => {
    document.body.innerHTML = `<div class="move-list">1. e4 e5 2. ${cell} Nc6</div>`;
    expect(publicMovePgn()).toBeUndefined();
    expect(corroboratePgn('1. e4 e5 2. f3 Nc6', gameContext()!)).toBe(false);
});

it('bounds context as valid JSON and refuses to treat a truncated source as complete', () => {
    document.body.innerHTML = `<div class="move-history">${'1. e4 e5 '.repeat(5000)}</div>`;
    const context = gameContext()!;
    expect(context.length).toBeLessThanOrEqual(20000);
    expect(() => JSON.parse(context)).not.toThrow();
    expect(publicMovePgn()).toBeUndefined();
    expect(corroboratePgn('1. e4 e5', context)).toBe(false);
});

it('does not accept private prose embedded directly in a history container', () => {
    document.body.innerHTML = '<div class="move-history">1. e4 e5 my password is secretPassword</div>';
    expect(gameContext()).toBeUndefined();
    expect(publicMovePgn()).toBeUndefined();
});
