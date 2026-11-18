# JevChess

A Manifest V3 chess extension with a local Fastify backend and a React board laboratory. Board recognition uses GPT-6 Luna through OpenRouter; Jev 1.13 chooses among chess.js legal moves through OpenRouter's Decisions API. Model IDs are configurable and never silently replaced.

**Lichess BOT mode:** Follow [the dedicated account setup guide](docs/lichess-setup.md).
Version 1.3 adds official Bot API play with backend-only credentials, authoritative
move history/color, manual challenges, separate extension controls and saved
execution checkpoints. Jev keeps all strategic choices; vision is unnecessary in
API mode. A dedicated BOT account and `bot:play` token are required; conversion is
irreversible and never automatic. Never automate Lichess through the browser mode.
`BACKEND_TOKEN` pairing is required for Lichess controls (optional in browser mode).

**Verification status (1.3):** Typecheck/build and all 304 unit tests passed. The local browser suite passed 16 cases, with four external-site/paid-provider opt-ins skipped; the Lichess panel also passed a narrow-width repeat. The configured BOT account, bot:play scope and live event stream are verified, and the backend is connected with autoplay stopped. Live Lichess move submission remains unverified. Historical real Luna/Jev and public chess.com evidence is retained separately in [docs/verification.md](docs/verification.md).

## Setup

Use Node.js 22.13+ and pnpm 10.11.0 (all commands run from this directory):

```sh
pnpm install
# Only create .env if it does not already exist; preserve your existing key.
cp -n .env.example .env
```

Set `OPENROUTER_API_KEY` in `.env`. Keep `.env` on the backend; never enter this key into the extension or page. The defaults are:

```env
VISION_MODEL=openai/gpt-6-luna
JEV_MODEL=typesafe/jev-1.13
PORT=3001
HOST=127.0.0.1
PROVIDER_MODE=live
```

`BACKEND_TOKEN` is an optional separate pairing token. If set, enter it in extension Settings. The included public manifest key gives a stable unpacked extension ID; the backend allows only that ID by default. If you change the manifest key or publish to the Chrome store, set `ALLOWED_EXTENSION_IDS` to your installed extension ID from `chrome://extensions`. Ordinary website origins are restricted by `CORS_ORIGINS`. Bind to loopback for local use. The backend has no cookies/session credentials, limits request bodies and rate, and never logs credentials. Session diagnostics now save sanitized board evidence and model exchanges locally (see below).

Start the backend:

```sh
pnpm dev:server
```

Start the demo in another terminal:

```sh
pnpm dev:demo
```

Open **http://127.0.0.1:4173**. The board can render DOM squares or Canvas pixels, flip orientation, load FEN, choose promotions, show history, and run a simple Black mock opponent. Human versus AI uses the extension. No hidden demo game object is exposed to it. The public FEN text supplies complete state independently of piece recognition.

## Build and load Chrome

```sh
pnpm build
```

For just the extension:

```sh
pnpm build:extension
```

1. Open `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked**, then select `apps/extension/dist`.
3. Open a chessboard tab and click the JevChess toolbar icon. This user gesture grants `activeTab` to detect/select/capture that tab.
4. Open Settings, confirm the backend URL (`http://127.0.0.1:3001`), playing color, orientation and input mode, then Save Settings.
5. Click **Detect Board** or **Select Board**, review the preview and FEN, and authorize move input for this website.
6. Click **Ask Jev**, then **Play Move**. A move succeeds only after observed placement verifies it.
7. Turn on the demo mock opponent and select **Start Auto Play** to repeat. **Stop Auto Play**, or Escape in the board tab, cancels pending decisions and further input. Input already delivered cannot be undone.

The side panel offers the same controls; open it using the popup's **Open side panel** button. Keep the target board tab active and fully visible when using screenshot recognition. Opening DevTools while using browser input may detach the debugger session.

For unknown boards, choose DOM, image, hybrid or automatic recognition. Automatic tries validated cached rules, generic DOM/geometry, reduced the vision model HTML and cropped vision fallback. Canvas uses actual screenshot recognition and costs the vision model calls when the cropped image changes. Recognition results are cached for unchanged input. No arbitrary generated JavaScript is executed.

On **Chess.com public analysis**, click **Detect Board** with the default click input. The extension reads the visible complete move history or the site's public Share Game FEN/PGN export automatically; no manual FEN is required. Close any obstructing dialog first. After updating the extension, click **Reload** in Chrome's extension manager and refresh the chess tab before detecting it again. Fresh and midgame public analysis positions are verified; signed-in playing games remain unverified.

A screenshot reveals pieces, but cannot reveal hidden castling rights, turn or counters. the vision model can recognize the board and interpret its supplied visible history; chess.js validates that complete history and generates FEN. Public state must agree with the observed pieces. Partial or contradictory history pauses. **Advanced position correction** contains an optional complete seed FEN and fresh-game confirmation for unsupported pages. A seed needs six fields and must match the current pieces; after changing it, save settings, reset the session and detect again. Imported FEN cannot recreate prior repetition history.

Visible move lists may use piece icons: explicitly labeled figurines are included in SAN. If several moves occur between observations, a complete legal record can catch the session up automatically, provided it extends the exact tracked FEN and moves. This preserves counters and repetition and clears an old decision before input. Without matching complete history, unexplained jumps still pause.

## Move input and permissions

The shipping extension uses `activeTab`, `scripting`, `storage`, `sidePanel` and localhost host permissions. Other backend HTTPS hosts are requested when saving settings. Debugger permission is optional and requested only when browser input is selected.

Synthetic click/drag input works against sites that support these events; click input is verified on Chess.com public analysis. JavaScript events are not trusted input. Browser input uses `chrome.debugger` and CDP `Input.dispatchMouseEvent`, at viewport CSS coordinates. All four modes are verified on the demo; debugger input on Chess.com remains unverified. Site support requires observed verification; there is no bypass of anti-cheat or site security. Automate only boards you are authorized to control. Cross-origin frames and closed shadow DOM may need additional support.

Promotion supports a generic `[data-promotion="q|r|b|n"]` or `aria-label="Promote to queen|rook|bishop|knight"` interface. Other interfaces pause with an explicit error. Detection and rule learning are generic heuristics, not a guarantee of universal recognition.

## Tests

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright tests use a new throwaway profile and a built unpacked extension. External AI is explicitly mocked; Canvas fixture recognition classifies screenshot pixels, not the demo's FEN. Test profile permissions are broader than the shipping extension. See [tests/e2e/README.md](tests/e2e/README.md). Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if using an existing compatible Chromium binary.

Provider tests check the configured vision-model chat and Jev Decisions HTTP payloads, malformed outputs, illegal moves, retries, timeout and server validation. Controller tests check stop, stale decisions, verification and opponent tracking. Chess tests cover rights, promotion and incomplete state. Detection/schema tests cover orientation, DPR crop, DOM sanitization and declarative parser validation.

Paid, opt-in provider verification:

```sh
pnpm test:live
```

To test the loaded extension with real the vision model screenshot recognition and Jev on the Canvas demo:

```sh
JEV_LIVE_BROWSER=1 pnpm test:e2e tests/e2e/live.spec.ts
```

The opt-in real-site smoke test uses mocked AI and an anonymous sandboxed Chrome profile:

```sh
JEV_CHESSCOM_BROWSER=1 pnpm test:e2e tests/e2e/chesscom.spec.ts
```

To make one paid the vision model request against the recorded public Chess.com board and visible history:

```sh
pnpm exec tsx scripts/live-history-check.ts
```

This makes paid requests through the local backend using a throwaway, sandboxed Chrome profile. The test is skipped without the explicit opt-in flag. It verifies one live move; the ordinary browser suite uses mocks to check repeated autoplay and input modes.

This uses the configured real models, parses a supplied DOM board fixture with the configured vision model, requests Jev's choice and validates it. It requires your own key/credits. It does not measure playing strength. If a model is unavailable, the client reports that error and does not substitute a different model. Jev is a decision classifier; chess.js supplies facts, but strong chess performance remains unmeasured.

Offline mock backend for development:

```sh
PROVIDER_MODE=mock pnpm dev:server
```

Mock mode labels responses as `mock`. It can parse explicit DOM fixture attributes and chooses the first legal move. It does not do general image recognition; loaded-extension Canvas tests provide their own pixel recognition fixture. Mock mode is never activated automatically on provider failure.

Production backend after build:

```sh
pnpm start:server
```

## Structure

- `apps/extension`: MV3 background, content observation, board reader, move executor, controller, shared popup/side-panel UI.
- `apps/server`: validated Fastify routes, live OpenRouter and explicit mock providers.
- `apps/demo-board`: interactive DOM/Canvas laboratory.
- `packages/shared`: Zod schemas and serializable contracts.
- `packages/chess-core`: validated chess.js state/history/legal successors.
- `packages/board-detection`: DOM/geometry heuristics, declarative parser, bounded sanitized extractor and coordinates.
- `tests`: unit/contract and loaded-browser integration checks.
- `docs/architecture.md`: revised architecture and alternatives.
- `docs/providers.md`: verified official provider and Chrome references.

## Current limits

Verification is tracked in `docs/verification.md`, with regression, real-provider and public-site evidence distinguished. Signed-in Chess.com playing games, playing strength, extended live autoplay and arbitrary website compatibility remain unverified. Reliable rights/history and usable page input are required; unsupported states stop with errors. Navigation ends the content session and requests must be initiated again after detecting the new board.


## Reliable play and saved diagnostics (1.1)

Jev now receives generated descriptions naming every piece, color and square, plus exact rule facts. FEN remains the internal authority. Its six stages assess the whole board and choose offensive/defensive intent; forecast Jev-selected opposing replies for every legal own move; nominate a move for each movable source; shortlist using Jev's probabilities; choose a continuation for each finalist; and select the final move. Verified recent moves and the last opponent move accompany the initial state. Every later stage carries Jev's intent. Independent questions are batched with bounded concurrency, without removing legal options. Each stage has a 10-second limit; the entire decision including checkpoints has a 45-second limit. A single forced move is labeled explicitly. There is no engine evaluation, opening book or hardcoded strategic selection.

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

### Playing color and provider migration

Playing color defaults to **Auto (board bottom)**. After stable detection, a Black-facing board makes Jev play Black. Manual White/Black overrides remain available for flipped or spectator boards. Legacy unversioned White settings resolve to Auto with a panel notice and diagnostic event; a separate persistent migration marker avoids concurrent settings overwrites, and Save Settings stores the versioned configuration; versioned manual settings and legacy Black remain explicit. A flip invalidates a pending choice before input. Unknown orientation pauses.

`VISION_MODEL` defaults to `openai/gpt-6-luna`; legacy `CLAUDE_MODEL` is accepted only when `VISION_MODEL` is absent. The repository's local configuration was explicitly migrated at the user's request. Other configured providers are never substituted on errors. Luna receives text/image chat input with reasoning effort low and no unsupported temperature. Jev remains the strategic provider.

On chess.com bot pages, the board-linked Download control opens the public Share export. The adapter reads readonly FEN/PGN, verifies replay against the observed pieces, and closes only its own dialog. This supports untouched games without assuming hidden rights from piece placement.
