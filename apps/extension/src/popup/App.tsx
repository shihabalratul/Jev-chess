import { loadSettings } from '../settings';
import { useEffect, useState } from 'react';
import { defaults, settingsSchema, glyphs, message, type Settings, type SessionView } from '../../../../packages/shared/src';
import { verifiedChess } from '../../../../packages/chess-core/src';
import { LichessPanel } from './LichessPanel';
const initial: SessionView = { state: 'IDLE', running: false, website: '', debug: {} };
export function App() {
    const [mode,setMode]=useState<'browser'|'lichess'>('browser');
    useEffect(()=>{void chrome.storage.local.get('playMode').then(r=>{if(r.playMode==='lichess')setMode('lichess');});},[]);
    function changeMode(next:'browser'|'lichess'){setMode(next);void chrome.storage.local.set({playMode:next});}
    const [settings, setSettings] = useState<Settings>(defaults);
    const [settingsReady,setSettingsReady]=useState(false);
    const [view, setView] = useState<SessionView>(initial);
    const [tabId, setTabId] = useState<number>();
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [health, setHealth] = useState<any>();
    useEffect(() => { void loadSettings().then(setSettings).catch(e => setError(message(e))).finally(()=>setSettingsReady(true)); const listener = (msg: any, sender: chrome.runtime.MessageSender) => { if (msg.type === 'VIEW' && sender.tab?.id === tabId)
        setView(msg.view); }; chrome.runtime.onMessage.addListener(listener); return () => chrome.runtime.onMessage.removeListener(listener); }, [tabId]);
    async function findTab() { const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); const target = tabs.find(t => t.url && !t.url.startsWith('chrome-extension:') && !t.url.startsWith('chrome:')); if (!target?.id)
        throw new Error('Select a normal chessboard browser tab, then open JevChess'); setTabId(target.id); return target.id; }
    async function send(command: string, payload: Record<string, unknown> = {}) { const id = tabId ?? await findTab(); let response; try {
        response = await chrome.tabs.sendMessage(id, { type: 'COMMAND', command, ...payload });
    }
    catch {
        const result = await chrome.runtime.sendMessage({ type: 'ATTACH', tabId: id });
        if (!result?.ok)
            throw new Error(result?.error ?? 'Could not attach to this tab. Open the popup using the toolbar action to grant activeTab.');
        await new Promise(r => setTimeout(r, 120));
        response = await chrome.tabs.sendMessage(id, { type: 'COMMAND', command, ...payload });
    } if (response?.view)
        setView(response.view); if (!response?.ok)
        throw new Error(response?.error ?? 'Content script disconnected'); return response; }
    async function action(command: string) { if (command === 'STOP') {
        setBusy(false);
        setError('');
        try {
            await send('STOP');
        }
        catch (e) {
            setError(message(e));
        }
        return;
    } setBusy(true); setError(''); try {
        await send(command);
    }
    catch (e) {
        setError(message(e));
    }
    finally {
        setBusy(false);
    } }
    useEffect(() => { let mounted = true; const tick = () => { if (tabId)
        void chrome.tabs.sendMessage(tabId, { type: 'COMMAND', command: 'STATUS' }).then(r => { if (mounted && r?.view)
            setView(r.view); }).catch(() => { }); }; const timer = setInterval(tick, 750); tick(); return () => { mounted = false; clearInterval(timer); }; }, [tabId]);
    async function save() { setError(''); try {
        const seedFen = settings.seedFen.trim() ? verifiedChess(settings.seedFen).fen() : '';
        const parsed = settingsSchema.parse({ ...settings, seedFen, colorMigrationNotice:false });
        const origin = new URL(parsed.backendUrl).origin + '/*';
        if (!await chrome.permissions.contains({ origins: [origin] })) {
            const allowed = await chrome.permissions.request({ origins: [origin] });
            if (!allowed)
                throw new Error('Backend host permission denied');
        }
        if (parsed.input.startsWith('debugger') && !await chrome.permissions.request({ permissions: ['debugger'] }))
            throw new Error('Browser input permission denied');
        await chrome.storage.local.set({ settings: parsed });
        setSettings(parsed);
        if (tabId)
            await send('CONFIGURE', { settings: parsed });
        setShowSettings(false);
    }
    catch (e) {
        setError(message(e));
    } }
    async function authorize() { try {
        const id = tabId ?? await findTab();
        const tab = await chrome.tabs.get(id);
        if (!tab.url)
            throw new Error('Tab URL unavailable');
        const origin = new URL(tab.url).origin;
        const next = { ...settings, authorizedOrigins: [...new Set([...settings.authorizedOrigins, origin])] };
        await chrome.storage.local.set({ settings: next });
        setSettings(next);
        await send('CONFIGURE', { settings: next });
    }
    catch (e) {
        setError(message(e));
    } }
    async function checkBackend() { try {
        const r = await chrome.runtime.sendMessage({ type: 'API', path: '/health', jobId: crypto.randomUUID() });
        if (!r.ok)
            throw new Error(r.error);
        setHealth(r.data);
    }
    catch (e) {
        setError(message(e));
    } }
    if(!settingsReady)return <main className="app"><p className="notice">Loading saved settings…</p></main>;
    if(mode==='lichess')return <LichessPanel settings={settings} onSave={async next=>{
        const parsed=settingsSchema.parse(next),origin=new URL(parsed.backendUrl).origin+'/*';
        if(!await chrome.permissions.contains({origins:[origin]})&&!await chrome.permissions.request({origins:[origin]}))throw new Error('Backend host permission denied');
        await chrome.storage.local.set({settings:parsed});setSettings(parsed);
    }} onBrowser={()=>changeMode('browser')}/>;
    const shownDecision = view.decision ?? view.lastDecision;
    const authorized = settings.authorizedOrigins.includes(view.website);
    const pieces = new Map(view.observation?.pieces.map(p => [p.square, p.piece]));
    const orientation = view.observation?.orientation ?? 'white';
    const needsGameSetup = !view.fen || /fen|initial|starting|untouched|tracked history|expected move|opponent reply/i.test(error || view.error || '');
    return <main className="app"><header><div className="brand-icon">♞</div><div><h1>JevChess <span>LAB</span></h1><p>Observe. Decide. Verify.</p></div><button className="icon-button" aria-label="Settings" onClick={() => setShowSettings(!showSettings)}>⚙</button></header>
 <nav className="mode-controls" aria-label="Play mode"><button aria-pressed="true">Browser board</button><button onClick={async()=>{try{if(view.running||busy)await send('STOP');changeMode('lichess');}catch(e){setError(message(e));}}}>Lichess BOT</button></nav>
 <div className="connection"><i className={view.fen ? 'dot connected' : 'dot'}/><span>{view.website || 'Connect to an open chessboard'}</span><button onClick={checkBackend}>Backend</button></div>
 {settings.colorMigrationNotice && <p className="notice">Playing color now follows the observed board bottom. This replaces the old White default. Choose a manual color in Settings if needed; saving dismisses this notice.</p>}
 {settings.playingColor!=='auto' && view.observation?.orientation && settings.playingColor!==view.observation.orientation && <p className="notice">Manual playing color differs from the board bottom. Jev follows your manual choice.</p>}
 <section className="status"><div><small>SESSION</small><strong data-testid="session-state">{view.state.replaceAll('_', ' ')}</strong></div><div><small>PLAYING AS</small><strong>{view.playingColor ? `${view.playingColor === 'white' ? '♔ White' : '♚ Black'} (${view.playingColorSource==='board-bottom'?'board bottom':'manual'})` : settings.playingColor==='auto'?'Auto · detect board':`${settings.playingColor} (manual)`}</strong></div></section>
 {view.recoveryProgress && <p className="notice" role="status">UI recovery: {view.recoveryProgress.activity} · attempt {view.recoveryProgress.attempt}/3</p>}
 {view.decisionStage && view.state==='REQUESTING_DECISION' && <p className="notice">Jev stage: {view.decisionStage}{view.strategicIntent ? ` · ${view.strategicIntent} intent` : ''} · up to 45 seconds total</p>}
 {!!view.debug.logging && <p className="notice">Session {String((view.debug.logging as Record<string,unknown>).sessionId)} · logs: {String((view.debug.logging as Record<string,unknown>).path)} · {String((view.debug.logging as Record<string,unknown>).delivery)}</p>}
 {health && <p className="notice">Backend: {health.providerMode} · {health.models.jev}{!health.credentialsConfigured && health.providerMode === 'live' ? ' · API key needed' : ''}</p>}
 {(error || view.error) && <p className="error" role="alert">{error || view.error}</p>}
 <section className="board-section"><div className="preview" aria-label="Recognized board preview">{Array.from({ length: 64 }, (_, i) => { const row = Math.floor(i / 8), col = i % 8; const square = orientation === 'white' ? String.fromCharCode(97 + col) + (8 - row) : String.fromCharCode(104 - col) + (row + 1); const p = pieces.get(square); return <div key={square} className={(row + col) % 2 ? 'dark' : 'light'} title={square}>{p && <span className={p === p.toUpperCase() ? 'white-piece' : 'black-piece'}>{glyphs[p]}</span>}<small>{square}</small></div>; })}</div><div className="board-caption"><span>{view.recognition || 'Board not read'}</span><span>{view.gameStatus || 'Awaiting position'}</span></div></section>
 {needsGameSetup && <section className="game-setup" aria-labelledby="game-setup-heading"><h2 id="game-setup-heading">Automatic game setup</h2><p>Detect Board and Parse Position read the pieces and visible move history to recover the complete game state automatically on supported pages.</p><p>{view.observation ? 'If setup is unavailable, show the complete move history from the start of the game and retry. A missing or partial record cannot establish whose turn it is, castling rights or move counters reliably.' : 'Open your chessboard with its move history visible, then select Detect Board.'}</p><button disabled={busy || view.running} onClick={() => action('DETECT')}>Retry automatic game setup</button></section>}
 <div className="buttons"><button disabled={busy || view.running} onClick={() => action('DETECT')}>Detect Board</button><button disabled={busy || view.running} onClick={() => action('SELECT')}>Select Board</button><button disabled={busy || view.running} onClick={() => action('PARSE')}>Parse Position</button><button disabled={busy || view.running} onClick={() => action('ASK')}>Ask Jev</button><button disabled={busy || view.running || !view.decision || !authorized} onClick={() => action('PLAY')}>Play Move</button><button disabled={busy || view.running} onClick={() => action('RESET')}>Reset Session</button></div>
 {view.website && !authorized && <div className="authorization"><p>Enable move input for this website after confirming that you may automate this board.</p><button onClick={authorize}>Authorize {view.website}</button></div>}
 <div className="auto-controls"><button className="primary" disabled={busy || view.running || !authorized} onClick={() => action('START')}>▶ Start Auto Play</button><button className="stop" onClick={() => action('STOP')}>■ Stop Auto Play</button></div>
 <section className="details"><div><small>JEV MOVE</small><strong>{shownDecision?.uci ?? '—'}</strong></div><div><small>OPPONENT</small><strong>{view.lastOpponentMove ?? '—'}</strong></div><div><small>API LATENCY</small><strong>{shownDecision ? Math.round(shownDecision.latencyMs) + ' ms' : '—'}</strong></div><div><small>CONFIDENCE</small><strong>{shownDecision?.confidence !== undefined ? (shownDecision.confidence * 100).toFixed(1) + '%' : '—'}</strong></div></section>
 {shownDecision && <p className="notice">Decision: {shownDecision.model} · {shownDecision.source}</p>}
 <label className="fen-label">CURRENT FEN<textarea readOnly value={view.fen ?? ''} placeholder="Detect a board to reconstruct its position"/></label>
 {showSettings && <section className="settings"><h2>Settings</h2><label>Backend URL<input value={settings.backendUrl} onChange={e => setSettings({ ...settings, backendUrl: e.target.value })}/></label><label>Backend pairing token<input type="password" value={settings.backendToken} onChange={e => setSettings({ ...settings, backendToken: e.target.value })}/></label><label>Playing color<select value={settings.playingColor} onChange={e => setSettings({ ...settings, playingColor: e.target.value as Settings['playingColor'] })}><option value="auto">Auto (board bottom)</option><option>white</option><option>black</option></select></label><label>Board orientation<select value={settings.orientation} onChange={e => setSettings({ ...settings, orientation: e.target.value as Settings['orientation'] })}>{['auto', 'white', 'black'].map(v => <option key={v}>{v}</option>)}</select></label><label>Recognition<select value={settings.recognition} onChange={e => setSettings({ ...settings, recognition: e.target.value as Settings['recognition'] })}>{['auto', 'dom', 'image', 'hybrid'].map(v => <option key={v}>{v}</option>)}</select></label><label>Move input<select value={settings.input} onChange={e => setSettings({ ...settings, input: e.target.value as Settings['input'] })}><option value="click">Synthetic clicks (demo / supported boards)</option><option value="drag">Synthetic drag (supported boards)</option><option value="debugger-click">Browser input: clicks (debugger permission)</option><option value="debugger-drag">Browser input: drag (debugger permission)</option></select></label><details className="advanced-correction"><summary>Advanced position correction</summary><p>Use these corrections only when automatic recovery is unavailable. FEN is a text description of the pieces, whose turn it is, castling rights, en passant and move counters. Copy the complete current FEN from the game.</p><label>Confirmed seed FEN<textarea value={settings.seedFen} placeholder="Complete current FEN, including all six fields" onChange={e => setSettings({ ...settings, seedFen: e.target.value })}/></label><p>FEN correction applies after Reset Session when public game state is unavailable. The FEN must match the observed pieces. Imported FEN does not restore repetition history.</p><p>For an untouched new game only: confirm that no moves have been played. JevChess checks all 32 pieces on their starting squares before initializing this session. This button sets up the position without playing a move or authorizing move input.</p><button disabled={busy || view.running || !view.observation} onClick={() => action('CONFIRM_NEW_GAME')}>Confirm untouched new game</button></details><label>Poll interval (ms)<input type="number" min="750" max="10000" value={settings.pollMs} onChange={e => setSettings({ ...settings, pollMs: Number(e.target.value) })}/></label><button className="primary" onClick={save}>Save Settings</button><button onClick={async () => { const next = { ...settings, authorizedOrigins: [] }; await chrome.storage.local.set({ settings: next }); setSettings(next); if (tabId)
        await send('CONFIGURE', { settings: next }); }}>Revoke all move authorizations</button></section>}
 <details className="debug"><summary>Recognition & decision debug</summary><pre>{JSON.stringify({ ...view.debug, fen: view.fen, decision: view.decision }, null, 2)}</pre></details>
 <footer><span>Keys stay on your backend</span><button onClick={async () => { try {
        const id = tabId ?? await findTab();
        const r = await chrome.runtime.sendMessage({ type: 'OPEN_PANEL', tabId: id });
        if (!r.ok)
            throw new Error(r.error);
    }
    catch (e) {
        setError(message(e));
    } }}>Open side panel ↗</button></footer>
 </main>;
}
