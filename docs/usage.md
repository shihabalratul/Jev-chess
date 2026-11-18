# Usage guide

How to use JevChess on boards in the browser, what the recognition and input modes do,
and where diagnostics are saved. New here? Start with [Getting started](getting-started.md).
For playing through the Lichess Bot API, see [Lichess BOT setup](lichess-setup.md).

## Browser board mode

1. Open `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked**, then select `apps/extension/dist`.
3. Open a chessboard tab and click the JevChess toolbar icon. This user gesture grants `activeTab` to detect/select/capture that tab.
4. Open Settings, confirm the backend URL (`http://127.0.0.1:3001`), playing color, orientation and input mode, then Save Settings.
5. Click **Detect Board** or **Select Board**, review the preview and FEN, and authorize move input for this website.
6. Click **Ask Jev**, then **Play Move**. A move succeeds only after observed placement verifies it.
7. Turn on the demo mock opponent and select **Start Auto Play** to repeat. **Stop Auto Play**, or Escape in the board tab, cancels pending decisions and further input. Input already delivered cannot be undone.

The side panel offers the same controls; open it using the popup's **Open side panel** button. Keep the target board tab active and fully visible when using screenshot recognition. Opening DevTools while using browser input may detach the debugger session.

### Board recognition

For unknown boards, choose DOM, image, hybrid or automatic recognition. Automatic tries validated cached rules, generic DOM/geometry, reduced the vision model HTML and cropped vision fallback. Canvas uses actual screenshot recognition and costs the vision model calls when the cropped image changes. Recognition results are cached for unchanged input. No arbitrary generated JavaScript is executed.

### Chess.com public analysis

On **Chess.com public analysis**, click **Detect Board** with the default click input. The extension reads the visible complete move history or the site's public Share Game FEN/PGN export automatically; no manual FEN is required. Close any obstructing dialog first. After updating the extension, click **Reload** in Chrome's extension manager and refresh the chess tab before detecting it again. Fresh and midgame public analysis positions are verified; signed-in playing games remain unverified.

### Hidden state (castling, turn, counters)

A screenshot reveals pieces, but cannot reveal hidden castling rights, turn or counters. the vision model can recognize the board and interpret its supplied visible history; chess.js validates that complete history and generates FEN. Public state must agree with the observed pieces. Partial or contradictory history pauses. **Advanced position correction** contains an optional complete seed FEN and fresh-game confirmation for unsupported pages. A seed needs six fields and must match the current pieces; after changing it, save settings, reset the session and detect again. Imported FEN cannot recreate prior repetition history.

Visible move lists may use piece icons: explicitly labeled figurines are included in SAN. If several moves occur between observations, a complete legal record can catch the session up automatically, provided it extends the exact tracked FEN and moves. This preserves counters and repetition and clears an old decision before input. Without matching complete history, unexplained jumps still pause.


## Move input and permissions

The shipping extension uses `activeTab`, `scripting`, `storage`, `sidePanel` and localhost host permissions. Other backend HTTPS hosts are requested when saving settings. Debugger permission is optional and requested only when browser input is selected.

Synthetic click/drag input works against sites that support these events; click input is verified on Chess.com public analysis. JavaScript events are not trusted input. Browser input uses `chrome.debugger` and CDP `Input.dispatchMouseEvent`, at viewport CSS coordinates. All four modes are verified on the demo; debugger input on Chess.com remains unverified. Site support requires observed verification; there is no bypass of anti-cheat or site security. Automate only boards you are authorized to control. Cross-origin frames and closed shadow DOM may need additional support.

Promotion supports a generic `[data-promotion="q|r|b|n"]` or `aria-label="Promote to queen|rook|bishop|knight"` interface. Other interfaces pause with an explicit error. Detection and rule learning are generic heuristics, not a guarantee of universal recognition.


## Reliable play and saved diagnostics

Jev now receives generated descriptions naming every piece, color and square, plus exact rule facts. FEN remains the internal authority. In browser mode it always runs the full six stages (Lichess mode adapts depth to the clock; see [How it works](how-it-works.md#depth-depends-on-the-mode)). The six stages assess the whole board and choose offensive/defensive intent; forecast Jev-selected opposing replies for every legal own move; nominate a move for each movable source; shortlist using Jev's probabilities; choose a continuation for each finalist; and select the final move. Verified recent moves and the last opponent move accompany the initial state. Every later stage carries Jev's intent. Independent questions are batched with bounded concurrency, without removing legal options. Each stage has a 10-second limit; the entire decision including checkpoints has a 45-second limit. A single forced move is labeled explicitly. There is no engine evaluation, opening book or hardcoded strategic selection.

The extension waits for stable geometry, pieces and public metadata, with a five-second consistency window after the first completed observation. Promotion choices belong to the selected board and retain the full UCI suffix. Automatic promotion must match Jev's choice. Unknown obstructions can trigger vision-model screenshot/DOM recovery, limited to three attempts and 20 seconds. Recovery can wait, dismiss a verified obstruction, select an independently identified requested promotion or redetect; it cannot choose a different chess move, accept agreements, navigate or change account settings. Dismissal requires an identifiable Close/Dismiss/Cancel/Skip control. Unidentified promotion icons, ambiguous state and unsupported controls pause with evidence. A model saying "finished" alone is not proof that play ended.

Every attached board tab gets a session UUID shown in the debug panel. Events first enter the extension's persistent IndexedDB outbox. The background worker delivers them to the backend, retries on subsequent events and a one-minute alarm, and removes them only after durable acknowledgement. Worker suspension or a temporary backend failure does not erase queued events. Events remain bound to their original backend URL. Changing that URL retains older queued events for delivery when that backend is selected again, while events for the current backend can still be delivered. If local diagnostics cannot be persisted, further browser input pauses.

By default files are saved beneath **`logs/<session-id>/`**, relative to the backend's working directory. Set `LOG_DIR` to change the root. `events.0001.jsonl` and subsequent files are append-only JSON Lines, rotating at 20 MiB without automatic deletion. `artifacts/` contains content-addressed screenshots and large text evidence. These files are ignored by Git and excluded from the extension archive. Logs contain UTC timestamps, sequence/correlation IDs, observations, FEN/history evidence, stage results, sanitized model requests/responses, input intentions, verification, errors, Stop and navigation. Server sequence numbers are per request; content sequence numbers are per session. Retried deliveries retain their event IDs and may appear more than once; deduplicate by event ID during analysis.

Credentials, authentication headers, pairing tokens and form values are excluded. Screenshot evidence masks visible form fields. Save the whole session directory when reporting a failure; the journal references its artifacts. An input-intent without a verified outcome is **unconfirmed**, not a successful move. A damaged final line from a crash is retained as evidence and separated from subsequent records; analysis should report/skip malformed lines rather than assuming they are valid events.

Backend additions: `POST /api/choose-move/step`, `POST /api/recover-ui`, and `POST /api/logs`. Step proofs bind prior Jev answers to the entire validated request. Backend restart invalidates an in-flight proof: request a fresh decision. The original choose-move endpoint runs the same staged service. An imported FEN supplies only known history from that import; it cannot restore earlier repetitions.

Run the opt-in paid comparison with:

```bash
pnpm benchmark:jev --live --games=1 --max-plies=80
```

This saves `comparison.json` and raw sanitized exchanges in a diagnostic session. The controlled 2×2 comparison changes named-piece lists versus equivalent placement FEN, and single-stage versus six-stage selection. All other rule facts remain identical. Three fixtures test legality, immediate mate and avoiding an immediate promotion draw. Optional games use a seeded uniform legal-move opponent, not an engine; capped games are recorded as unfinished. This small experiment cannot establish a rating or guarantee stronger play against Chess.com opponents.

Reload the unpacked extension from `apps/extension/dist` (or the refreshed release ZIP), refresh the chessboard tab, and restart the backend after upgrading. The added `alarms` permission supports retrying saved diagnostic deliveries.


## Playing color and provider settings

Playing color defaults to **Auto (board bottom)**. After stable detection, a Black-facing board makes Jev play Black. Manual White/Black overrides remain available for flipped or spectator boards. Legacy unversioned White settings resolve to Auto with a panel notice and diagnostic event; a separate persistent migration marker avoids concurrent settings overwrites, and Save Settings stores the versioned configuration; versioned manual settings and legacy Black remain explicit. A flip invalidates a pending choice before input. Unknown orientation pauses.

`VISION_MODEL` defaults to `openai/gpt-6-luna`; legacy `CLAUDE_MODEL` is accepted only when `VISION_MODEL` is absent. The repository's local configuration was explicitly migrated at the user's request. Other configured providers are never substituted on errors. Luna receives text/image chat input with reasoning effort low and no unsupported temperature. Jev remains the strategic provider.

On chess.com bot pages, the board-linked Download control opens the public Share export. The adapter reads readonly FEN/PGN, verifies replay against the observed pieces, and closes only its own dialog. This supports untouched games without assuming hidden rights from piece placement.

## Current limits

Verification is tracked in `docs/verification.md`, with regression, real-provider and public-site evidence distinguished. Signed-in Chess.com playing games, playing strength, extended live autoplay and arbitrary website compatibility remain unverified. Reliable rights/history and usable page input are required; unsupported states stop with errors. Navigation ends the content session and requests must be initiated again after detecting the new board.

