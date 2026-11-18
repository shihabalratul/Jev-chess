import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type PointerEvent } from 'react';
type BoardMode = 'DOM' | 'Canvas';
type Promotion = 'q' | 'r' | 'b' | 'n';
const files = 'abcdefgh';
const whiteSymbols: Record<PieceSymbol, string> = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };
const blackSymbols: Record<PieceSymbol, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const pieceNames: Record<PieceSymbol, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const promoNames: Record<Promotion, string> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };
function orderedSquares(flipped: boolean): Square[] {
    const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
    const orderedFiles = flipped ? [...files].reverse() : [...files];
    return ranks.flatMap((rank) => orderedFiles.map((file) => `${file}${rank}` as Square));
}
function squareFromPoint(clientX: number, clientY: number, rect: DOMRect, flipped: boolean): Square | null {
    if (!rect.width || clientX < rect.left || clientY < rect.top || clientX > rect.right || clientY > rect.bottom)
        return null;
    const col = Math.min(7, Math.floor(((clientX - rect.left) / rect.width) * 8));
    const row = Math.min(7, Math.floor(((clientY - rect.top) / rect.height) * 8));
    const fileIndex = flipped ? 7 - col : col;
    const rank = flipped ? row + 1 : 8 - row;
    return `${files[fileIndex]}${rank}` as Square;
}
function getStatus(game: Chess): string {
    if (game.isCheckmate())
        return `Checkmate — ${game.turn() === 'w' ? 'Black' : 'White'} wins`;
    if (game.isStalemate())
        return 'Draw by stalemate';
    if (game.isThreefoldRepetition())
        return 'Draw by threefold repetition';
    if (game.isInsufficientMaterial())
        return 'Draw by insufficient material';
    if (game.isDraw())
        return 'Draw';
    const side = game.turn() === 'w' ? 'White' : 'Black';
    return game.isCheck() ? `${side} to move · Check` : `${side} to move`;
}
export default function App() {
    const gameRef = useRef(new Chess());
    const boardRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dragFromRef = useRef<Square | null>(null);
    const mockTimerRef = useRef<number | undefined>(undefined);
    const [revision, setRevision] = useState(0);
    const [mode, setMode] = useState<BoardMode>('DOM');
    const [flipped, setFlipped] = useState(false);
    const [selected, setSelected] = useState<Square | null>(null);
    const [mockOpponent, setMockOpponent] = useState(false);
    const [fenInput, setFenInput] = useState(new Chess().fen());
    const [fenError, setFenError] = useState('');
    const [promotionMove, setPromotionMove] = useState<{
        from: Square;
        to: Square;
    } | null>(null);
    const game = gameRef.current;
    const squares = useMemo(() => orderedSquares(flipped), [flipped]);
    const fen = game.fen();
    const history = game.history();
    const status = getStatus(game);
    const refresh = useCallback(() => setRevision((value) => value + 1), []);
    const tryMove = useCallback((from: Square, to: Square, promotion?: Promotion) => {
        const activeGame = gameRef.current;
        if (!promotion) {
            const needsPromotion = activeGame.moves({ square: from, verbose: true })
                .some((candidateMove) => candidateMove.to === to && candidateMove.promotion);
            if (needsPromotion) {
                setPromotionMove({ from, to });
                return true;
            }
        }
        try {
            const move = activeGame.move({ from, to, ...(promotion ? { promotion } : {}) });
            if (!move)
                return false;
            setSelected(null);
            setPromotionMove(null);
            setFenInput(activeGame.fen());
            refresh();
            return true;
        }
        catch {
            return false;
        }
    }, [refresh]);
    const chooseSquare = useCallback((square: Square) => {
        const activeGame = gameRef.current;
        const piece = activeGame.get(square);
        if (!selected) {
            if (piece?.color === activeGame.turn())
                setSelected(square);
            return;
        }
        if (selected === square) {
            setSelected(null);
            return;
        }
        if (tryMove(selected, square))
            return;
        if (piece?.color === activeGame.turn())
            setSelected(square);
        else
            setSelected(null);
    }, [selected, tryMove]);
    const eventSquare = (event: PointerEvent<HTMLDivElement>): Square | null => {
        if (mode === 'DOM') {
            const target = event.target as HTMLElement;
            const squareElement = target.closest<HTMLElement>('[data-square]');
            return (squareElement?.dataset.square as Square | undefined) ?? null;
        }
        const rect = boardRef.current?.getBoundingClientRect();
        return rect ? squareFromPoint(event.clientX, event.clientY, rect, flipped) : null;
    };
    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        dragFromRef.current = eventSquare(event);
    };
    const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
        const from = dragFromRef.current;
        const to = eventSquare(event);
        dragFromRef.current = null;
        if (from && to && from !== to)
            tryMove(from, to);
    };
    const onBoardClick = (event: MouseEvent<HTMLDivElement>) => {
        if (mode === 'DOM') {
            const target = event.target as HTMLElement;
            const squareElement = target.closest<HTMLElement>('[data-square]');
            if (squareElement?.dataset.square)
                chooseSquare(squareElement.dataset.square as Square);
            return;
        }
        const rect = boardRef.current?.getBoundingClientRect();
        const square = rect && squareFromPoint(event.clientX, event.clientY, rect, flipped);
        if (square)
            chooseSquare(square);
    };
    const resetGame = () => {
        if (mockTimerRef.current !== undefined)
            window.clearTimeout(mockTimerRef.current);
        mockTimerRef.current = undefined;
        gameRef.current = new Chess();
        setFenInput(gameRef.current.fen());
        setFenError('');
        setSelected(null);
        setPromotionMove(null);
        refresh();
    };
    const loadFen = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        try {
            const next = new Chess(fenInput.trim());
            if (mockTimerRef.current !== undefined)
                window.clearTimeout(mockTimerRef.current);
            mockTimerRef.current = undefined;
            gameRef.current = next;
            setFenInput(next.fen());
            setFenError('');
            setSelected(null);
            setPromotionMove(null);
            refresh();
        }
        catch {
            setFenError('That FEN is not a valid chess position.');
        }
    };
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        const draw = () => {
            const context = canvas.getContext('2d');
            if (!context)
                return;
            const bounds = canvas.getBoundingClientRect();
            const size = Math.max(1, bounds.width);
            const pixelRatio = window.devicePixelRatio || 1;
            canvas.width = Math.max(1, Math.round(bounds.width * pixelRatio));
            canvas.height = Math.max(1, Math.round(bounds.height * pixelRatio));
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            const cell = size / 8;
            orderedSquares(flipped).forEach((square, index) => {
                const row = Math.floor(index / 8);
                const col = index % 8;
                const isLight = (files.indexOf(square[0]) + Number(square[1])) % 2 === 0;
                context.fillStyle = isLight ? '#eadfcb' : '#748866';
                context.fillRect(col * cell, row * cell, cell, cell);
                if (selected === square) {
                    context.fillStyle = 'rgba(225, 188, 74, .55)';
                    context.fillRect(col * cell, row * cell, cell, cell);
                }
                const piece = game.get(square);
                if (piece) {
                    context.font = `${cell * 0.72}px "Arial Unicode MS", "DejaVu Sans", serif`;
                    context.textAlign = 'center';
                    context.textBaseline = 'middle';
                    context.fillStyle = piece.color === 'w' ? '#fffdf7' : '#1c2922';
                    context.shadowColor = piece.color === 'w' ? '#18251f' : 'rgba(255,255,255,.42)';
                    context.shadowBlur = 2;
                    context.fillText((piece.color === 'w' ? whiteSymbols : blackSymbols)[piece.type], col * cell + cell / 2, row * cell + cell / 2 + cell * 0.015);
                    context.shadowBlur = 0;
                }
            });
        };
        draw();
        const observer = new ResizeObserver(draw);
        observer.observe(canvas);
        window.addEventListener('resize', draw);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', draw);
        };
    }, [game, flipped, mode, revision, selected]);
    useEffect(() => {
        if (mockTimerRef.current !== undefined) {
            window.clearTimeout(mockTimerRef.current);
            mockTimerRef.current = undefined;
        }
        if (!mockOpponent || game.turn() !== 'b' || game.isGameOver())
            return;
        mockTimerRef.current = window.setTimeout(() => {
            mockTimerRef.current = undefined;
            const current = gameRef.current;
            const replies = current.moves({ verbose: true });
            if (replies.length && current.turn() === 'b' && !current.isGameOver()) {
                current.move(replies[0]);
                setSelected(null);
                setFenInput(current.fen());
                refresh();
            }
        }, 800);
        return () => {
            if (mockTimerRef.current !== undefined) {
                window.clearTimeout(mockTimerRef.current);
                mockTimerRef.current = undefined;
            }
        };
    }, [game, mockOpponent, revision, refresh]);
    useEffect(() => () => {
        if (mockTimerRef.current !== undefined)
            window.clearTimeout(mockTimerRef.current);
    }, []);
    const moveRows = Array.from({ length: Math.ceil(history.length / 2) }, (_, index) => ({
        number: index + 1,
        white: history[index * 2],
        black: history[index * 2 + 1],
    }));
    return (<main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="JevChess Board Lab home">
          <span className="brand-mark">J</span><span>JevChess <span className="brand-light">/ Board Lab</span></span>
        </a>
        <span className="topbar-note"><span className="live-dot"/> Local demo · no account required</span>
      </header>

      <section className="workspace" id="top">
        <div className="board-column">
          <div className="page-heading">
            <div><p className="eyebrow">INTERACTIVE BOARD</p><h1>Make your next move.</h1></div>
            <div className="turn-indicator"><span className={`turn-piece ${game.turn() === 'w' ? 'white-token' : 'black-token'}`}>{game.turn() === 'w' ? '♙' : '♟'}</span><span>{status}</span></div>
          </div>

          <div className="board-frame">
            <div className="board-coordinates ranks" aria-hidden="true">
              {(flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1]).map((rank) => <span key={rank}>{rank}</span>)}
            </div>
            <div className="board-stage">
              <div ref={boardRef} className={`chessboard ${mode === 'DOM' ? 'dom-board' : 'canvas-board'}`} data-chessboard="true" data-orientation={flipped ? 'black' : 'white'} role={mode === 'DOM' ? 'grid' : 'img'} aria-label={mode === 'Canvas' ? 'Chessboard' : undefined} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onClick={onBoardClick}>
                {mode === 'DOM' ? squares.map((square) => {
            const piece = game.get(square);
            const isLight = (files.indexOf(square[0]) + Number(square[1])) % 2 === 0;
            const isSelected = selected === square;
            const label = piece ? `${square}, ${piece.color === 'w' ? 'white' : 'black'} ${pieceNames[piece.type]}` : square;
            return (<div key={square} role="gridcell" tabIndex={0} className={`square ${isLight ? 'light' : 'dark'}${isSelected ? ' selected' : ''}`} data-square={square} {...(piece ? { 'data-piece': piece.color === 'w' ? piece.type.toUpperCase() : piece.type } : {})} aria-label={label}>
                      {piece && <span className={`piece ${piece.color === 'w' ? 'piece-white' : 'piece-black'}`} aria-hidden="true">{(piece.color === 'w' ? whiteSymbols : blackSymbols)[piece.type]}</span>}
                      {square[0] === (flipped ? 'h' : 'a') && <span className="rank-label" aria-hidden="true">{square[1]}</span>}
                      {square[1] === (flipped ? '8' : '1') && <span className="file-label" aria-hidden="true">{square[0]}</span>}
                    </div>);
        }) : <canvas ref={canvasRef} aria-label="Chessboard"/>}
              </div>
              <div className="board-coordinates files" aria-hidden="true">
                {(flipped ? [...files].reverse() : [...files]).map((file) => <span key={file}>{file}</span>)}
              </div>
            </div>
          </div>

          {promotionMove && <div className="dialog-backdrop">
            <div className="promotion-dialog" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
              <h2 id="promotion-title">Promote your pawn</h2>
              <p>Choose a piece to complete the move.</p>
              <div className="promotion-options">
                {(['q', 'r', 'b', 'n'] as Promotion[]).map((promotion) => <button key={promotion} type="button" data-promotion={promotion} aria-label={`Promote to ${promoNames[promotion]}`} onClick={() => tryMove(promotionMove.from, promotionMove.to, promotion)}>{(game.turn() === 'w' ? whiteSymbols : blackSymbols)[promotion]}</button>)}
              </div>
            </div>
          </div>}
        </div>

        <aside className="side-panel">
          <section className="panel-card controls-card">
            <div className="card-heading"><div><p className="eyebrow">GAME CONTROLS</p><h2>Set the board</h2></div><span className="heading-icon">♞</span></div>

            <div className="control-group">
              <span className="control-label">BOARD RENDERING</span>
              <div className="segmented" role="group" aria-label="Board rendering">
                {(['DOM', 'Canvas'] as BoardMode[]).map((option) => <button key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)}>{option}</button>)}
              </div>
            </div>

            <div className="control-row">
              <div><span className="control-label">ORIENTATION</span><span className="control-value">{flipped ? 'Black at bottom' : 'White at bottom'}</span></div>
              <button type="button" className="icon-button" aria-label="Flip board" onClick={() => setFlipped((value) => !value)}><span className="flip-icon">⇅</span></button>
            </div>

            <label className="opponent-toggle">
              <span className="toggle-copy"><span className="control-label">MOCK OPPONENT</span><span className="control-value">Plays as Black</span></span>
              <input type="checkbox" checked={mockOpponent} onChange={(event) => setMockOpponent(event.target.checked)}/>
              <span className="toggle-track" aria-hidden="true"><span /></span>
            </label>
            <p className="helper-text">A local demo move follows after about a second. Connect an extension for an external AI opponent.</p>

            <button className="reset-button" type="button" onClick={resetGame}><span>↺</span> New game</button>
          </section>

          <section className="panel-card moves-card">
            <div className="card-heading compact"><div><p className="eyebrow">GAME RECORD</p><h2>Move history</h2></div><span className="move-count">{history.length} {history.length === 1 ? 'ply' : 'plies'}</span></div>
            {moveRows.length ? <ol className="move-list" aria-label="Move history">{moveRows.map((row) => <li key={row.number}><span className="move-number">{row.number}.</span><span className="move-san">{row.white}</span><span className="move-san">{row.black ?? '·'}</span></li>)}</ol> : <p className="empty-history">Your moves will appear here.</p>}
          </section>

          <section className="panel-card fen-card">
            <div className="card-heading compact"><div><p className="eyebrow">POSITION DATA</p><h2>Current FEN</h2></div><span className="fen-badge">FEN</span></div>
            <output className="fen-value" data-testid="current-fen" data-chess-fen={fen} aria-label="Current FEN">{fen}</output>
            <form className="fen-form" onSubmit={loadFen}>
              <label htmlFor="fen-input">Load a position</label>
              <textarea id="fen-input" value={fenInput} onChange={(event) => setFenInput(event.target.value)} rows={3} spellCheck={false}/>
              {fenError && <p className="form-error" role="alert">{fenError}</p>}
              <button type="submit" className="load-button">Load FEN <span>→</span></button>
            </form>
          </section>
        </aside>
      </section>

      <footer className="footer"><span>JevChess Board Lab</span><span>Local rules powered by chess.js</span></footer>
    </main>);
}
