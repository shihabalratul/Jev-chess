# Revised architecture

The objective is a working, user-authorized chess automation pipeline, with a local DOM/Canvas laboratory and explicit reliability limits. `prompt.md` is the functional spec.

## Boundaries

- Shared Zod schemas describe observations, declarative parser rules, decisions, settings and messages.
- ChessStateManager owns a chess.js game. Visible placement and complete game state are different objects. Public FEN or complete visible history seeds hidden rights/counters automatically; user correction is an advanced fallback. Subsequent observations must be unchanged or exactly one legal successor unless complete history proves a forward extension of the exact tracked FEN and prior moves. No castling or turn guesses. New public metadata is validated independently against current state before mutation or input.
- Content script owns board selection, parsing cache, observation and AutoPlayController. One abortable job runs at a time. Navigation disposes it. Decisions bind to FEN and placement; execution rechecks both. Recognition waits for matching consecutive snapshots, within a five-second consistency window to let animations or opponent replies settle. Unknown, persistently changing or stale positions halt input.
- MV3 background owns backend fetch, screenshot capture/cropping and optional chrome.debugger input. No gameplay loop relies on service-worker memory surviving suspension. Each input job is short, abortable and detaches debugger in finally. Synthetic click is verified on the demo and Chess.com public analysis; CDP is opt-in and verified on the demo. Attach and panel controls require an exact extension popup/side-panel sender identity and URL.
- Backend alone holds OPENROUTER_API_KEY. the configured vision model uses chat completions with text/image content. Jev uses /api/alpha/decisions with a choice question keyed by UCI. chess.js computes candidate captures, checks, mates and resulting FEN; Jev chooses, never a substitute engine.
- React popup and side panel share controls and settings, communicating only with the extension. Debug UI shows bounded/sanitized data and errors, never credentials.

## Recognition and state

Rank generic board candidates from grid semantics, chess attributes, labels, piece classes and square geometry. Explicit selection resolves ambiguity. Parse priority: cached declarative rules, generic DOM/geometry, the configured vision model reduced DOM, cropped screenshot, hybrid. Rules support bounded selectors, attributes/class tokens, explicit piece maps and coordinate formats; never generated code/eval. Validate against independent current placement before caching. Fingerprints invalidate structure updates and avoid calls for unchanged input.

An image does not reveal game history. Canvas recognition reads pixels; complete state independently comes from public FEN/PGN or a complete visible move list. Generic extraction accepts contiguous numbered SAN from move 1 after strict replay. the configured vision model receives bounded sanitized move-history context and may normalize it to PGN; the entire returned sequence must agree with the visible record and observed placement. Partial, truncated, conflicting or invented history cannot seed state. Successful interpretations are cached by context, placement and orientation; transient provider failures remain retryable. Session history survives subsequent observations.

Chess.com has a narrow public UI adapter for pages with a matching visible board and move list. It opens the observed More → Share Game controls, reads only the readonly FEN/PGN export, validates their agreement, and closes its own dialog. It reads no private game object or site API. Public analysis is verified; playing-game routes are gated but not browser-verified. Existing dialogs block this interaction without changing privacy choices. Export caching lasts less than one second, binds to the exact live board element, and is cleared by reset/detection. Detached boards and aborted jobs cannot commit recovered state.

Complete PGN restores repetition history; imported FEN cannot restore earlier repetitions. Recognized board preview remains visible when state recovery fails. Manual correction and fresh-game confirmation remain optional advanced controls.

Explicit visible `data-figurine` piece symbols bind only to adjacent SAN text inside the same wrapper. Hidden, conflicting or orphaned symbols make the record incomplete; they cannot be dropped into different pawn notation. Full-history catch-up requires the old complete FEN at a replay prefix and every already tracked UCI at the suffix ending there. Endpoint placement, public FEN and metadata must agree before adoption. This recovers missed multi-ply observations, including returns to an earlier placement, without rewriting moves, guessing rights/counters or losing repetitions. Changed FEN clears selected decisions; input still rechecks its original FEN.

Before collecting a DOM snapshot, the reader waits up to five seconds when visible pieces overlap on a square or assigned squares disagree with current screen geometry. This catches capture effects and moving sprites without site-specific effect selectors or paid recognition. Polls are abortable and require the same connected board element. Hidden and off-board pools are excluded. Cache lookup/removal can yield during a move, so settling and current history/orientation are rechecked afterward. Unresolved overlaps pause with a settling error rather than guessing a position or launching recognition requests. Canvas recognition and its existing snapshot verification remain separate.

## Alternatives assessed

A background-owned loop is vulnerable to worker suspension and navigation races. A backend-owned loop cannot reliably see local page changes. Keeping the loop beside the board gives direct cancellation and observed-state ownership; short privileged background operations remain replaceable.

Canvas polling compares cropped pixels before paid recognition. Unsupported frames, ambiguous orientation, inaccurate recognition and unsupported promotion controls pause with correction/error, never claim universal support.

## Verification

Unit tests cover state reconstruction/special moves, schemas, detection/extraction, provider wire contracts/errors, stale decisions and stop. Playwright loads the built unpacked extension with mock network providers, exercising DOM and Canvas through actual content/background/UI modules. Live checks are a separate opt-in paid script. Available model listings verify documentation, not successful account-level access or chess skill.


## Reliable-play revision (2026-10-21)

The content-owned loop makes six separately cancellable backend step requests: assess, reply, nominate, shortlist, continue, choose. Each regenerates legal options from the original position and replayable PGN. Jev first chooses offensive/defensive intent from the entire board, geometric attack facts and verified recent opponent context. The reply stage covers every legal own complete UCI, including every promotion choice; Jev selects the strongest opposing response for each nonterminal branch. Nomination compares all moves per source using those examined consequences. A probability shortlist retains Jev's selected move and its next two highest options. Jev selects its own continuation for each nonterminal finalist, then the final move. Every later question carries the initial intent. Code calculates rule facts, never strategic move quality. A forced single move stays distinct.

Independent questions are deterministically split into batches of at most four, with at most four concurrent requests and one shared stage deadline. Question contexts retain every option for that question; nominations carry complete per-source forecasts without duplicating unrelated branches. All answers must be present, legal and from one model identity. Invalid batch results abort sibling work. Usage preserves each batch and aggregates reported cost. Earlier results carry a backend HMAC proof over the original input and trace. The compatibility endpoint orchestrates the same service. Unverified client history strings never become opponent context; recent moves are regenerated by strict PGN replay. Imported earlier repetitions remain unknown.

Each model stage has an abortable 10-second limit including retries; content enforces 45 seconds including checkpoints. Stable reads require matching pieces, geometry, orientation and metadata at least 120 ms apart, within a five-second consistency window after the first completed observation. Provider recognition latency is separate; every decision checkpoint remains within the 45-second decision deadline. Checkpoints bind to the same board element and confirmed position, before each subsequent stage and immediately before input. Newly revealed terminal history invalidates a decision before input; terminal history matching the expected move or uniquely verified reply is accepted during outcome verification. A same-FEN history change also invalidates a selected move at execution.

All parsers and DOM extraction exclude hidden/off-board pools and UI pieces. A visible promotion menu is a pending board state, including the Chess.com back-rank pawn captured in the real public fixture. Promotion execution waits for an unambiguous matching choice or the exact automatic result. A picker opening during the destination gesture continues only after the exact pending pawn placement is observed; the original gesture is not replayed. A chosen target that consumes itself on mousedown suppresses remaining events and still requires result verification. Delayed public FEN/PGN must agree with observed pieces and metadata before a snapshot is released. Browser clicks are never evidence of success; the observed expected position or unique immediate opponent reply is required.

the configured vision model visual recovery has a declarative action schema and receives only bounded board/obstruction evidence plus a table of locally observed target IDs and geometry. The captureRect explicitly maps the cropped image origin to CSS viewport coordinates; the configured vision model receives that mapping and pixel-scaling guidance. Form fields are masked in screenshots. Targets must still be connected, visible, unobstructed, unchanged in identity/label/piece/geometry, and associated with an obstruction overlapping the selected board. A dialog's close button may sit outside the board. Dismissal requires positive dismissal semantics; a generic Continue/Yes button is insufficient. Promotion requires an independently observed piece identity equal to Jev's suffix. Validation runs again after asynchronous logging and before the actual click. Move gestures also revalidate hit targets after asynchronous persistence/checkpoints and between awaited steps. Debugger events require a live content-side transaction guard before each dispatch. Recovery does not change Jev's move, navigate, accept agreements or change account settings. A model's finished label alone cannot establish a terminal result. Three attempts and 20 seconds bound one incident; stable verified observation clears the incident.

SessionRecorder serializes content evidence into a background IndexedDB outbox before acknowledging local persistence. Worker alarms and new events retry delivery independently of gameplay cancellation. The server validates event envelopes, serializes append operations, fsyncs journal writes, artifact files and containing directories, externalizes screenshots/large text by digest, and rotates files without deleting history. Server HTTP/provider exchanges use AsyncLocalStorage session/request correlation. Complete Markdown JSON fences from the configured vision model may be removed before strict JSON/schema validation; malformed JSON or extra prose is rejected. The original response and normalization event remain audited. Secrets are redacted on both sides; source mode is recorded explicitly. Outbox events retain their IDs across retries, and interrupted transactions remain unconfirmed. Normal backend operation requires durable server diagnostics; browser input requires durable local intent evidence. Disconnected backends cannot silently lose queued evidence. An unavailable previous backend does not block delivery to the current backend. IndexedDB write transactions use strict durability, and closed database connections are reopened.


## Auto color and bot startup (1.2)

Versioned settings default to Auto; confirmed board orientation defines the bottom-side playing color. Manual overrides are preserved. Legacy unversioned White resolves to Auto with a visible notice and log event. An idempotent version marker is stored separately from the configuration, so read paths cannot overwrite a newer URL, token or manual color. Saving in the panel persists the versioned settings object. Backend requests contain only resolved White/Black. A pending decision binds to its resolved color as well as position/history/orientation; flips discard it. Every pre-input checkpoint validates all available public metadata even if placement stays unchanged.

The computer-page export adapter recognizes the observed `wc-simple-move-list[board-id]` plus a unique Download button under `.game-controls-controller-component` bearing the observed download glyph. One visible selected board, matching list binding, permitted route and no preexisting modal/menu are required. It opens the same public readonly FEN/PGN dialog as analysis Share, checks strict replay, and closes its own UI on completion/Stop. No empty-history or initial-placement heuristic fabricates hidden state. The sanitized public fixture records this real DOM shape.

Vision/recovery defaults to OpenRouter `openai/gpt-6-luna`, text/image chat JSON, reasoning effort low, no unsupported temperature and no fallback providers. `VISION_MODEL` takes precedence; explicit legacy `CLAUDE_MODEL` remains compatible. Jev is unchanged.


## Lichess BOT mode (1.3)

The backend owns a fixed-origin official Bot API client. It keeps credentials
server-side, serializes ordinary requests, shares a full-minute 429 cooldown, and
consumes bounded, cancellable NDJSON streams with keepalive/stall detection. The
account title must be BOT; configured mocks cannot connect to live games. Pairing
is mandatory for every Lichess route, and the extension background accepts those
routes only from its popup or side panel. No content script can arm BOT mode.

The new LichessController is separate from DOM gameplay. Full game streams replay
initialFen and every legal UCI move, normalizing standard castling aliases. Account
ID determines color. History becomes the same verified PGN/readable six-stage Jev
input as browser mode. The backend supplies legal facts without strategic ranking.
Clocks and first-move expiration bound the existing 45-second total / 10-second
stage limits. Game identity, history, connection and cancellation epochs guard
submission. Connect/restart never arms gameplay; challenges require individual
acceptance and a selected game requires Start.

A dedicated audit context carries long-lived provider and game evidence. The
journal must durably retain intent before a separate fsynced interrupted-move
checkpoint and one POST. Extending legal history confirms the exact move, even
when an opponent reply already followed it. HTTP success alone is insufficient.
Known cancellation before transport dispatch is recorded and cleared; uncertain
submitted input is retained across Stop, disconnect and process restart. There is
no blind resend. Confirmation is bounded; stream errors pause rather than choose
a fallback. A fresh full stream and explicit Start resume only verified games.
The extension can be closed while backend play continues; Stop/Disconnect remain
explicit lifecycle controls. Account conversion exists only in an interactive CLI
with identity, zero-game and typed irreversible-action confirmation gates.


## Lichess time management and analysis profiles (1.4)

`ChooseRequest.analysis` is optional. When absent the original six-stage pipeline
runs unchanged, which is what browser mode still sends. The Lichess controller
always sets it:

- **Depth** comes from `planTurn`: an even share of the remaining clock
  (`remaining / max(15, 40 - moves played)`) plus 80% of the increment. At least
  30s gives `full` (six stages), at least 10s gives `reduced` (assess, nominate,
  shortlist, choose), and less gives `quick` (one choose over every legal move).
  The decision deadline is `min(45s, remaining - 1.5s, max(2 x target, 6s))`.
- **Tactical facts** add exposed-piece lists for both sides and, for every
  candidate, one-ply facts: opponent mate-in-one replies, your exposed pieces
  afterwards, and the opponent's largest capture. These are attack and defence
  counts that ignore pins and x-rays. They are not a ranking.
- **Blunder check** (when the target is at least 4s): if Jev's chosen move
  allows mate in one, or leaves a piece worth 3 or more exposed beyond what it
  captured, a `verify` stage follows `choose`. It offers to keep the move plus
  every unflagged legal alternative. Jev decides either way.
- **Reuse:** `DecisionCache` keeps Jev's own answers by position (placement, turn,
  castling, en passant, prior occurrences; the halfmove clock once it reaches 80)
  and model. A same-or-deeper answer is reused. After a full decision, Jev's
  examined reply and continuation are stored and used only at `quick` depth when
  that exact line occurs.
- **Challenges:** incoming challenges whose base + 40 x increment is below
  `LICHESS_MIN_CLOCK_SECONDS` (default 300) are marked unsupported and refused.
- **Measurement:** `lichess.decision.summary` and an enriched `lichess.finished`
  are journaled. `pnpm lichess:stats` summarises them. `pnpm benchmark:puzzles
  --live` scores a fixed, mechanically checked tactics set and appends to
  `logs/benchmark-history.jsonl`. `--mock` is a harness dry run, not a measurement.
