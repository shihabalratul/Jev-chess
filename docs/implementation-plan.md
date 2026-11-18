# JevChess implementation plan

Goal: implement prompt.md using the revised modular architecture in architecture.md. Execute directly in the supplied workspace; it has no usable Git repository, so no branch/worktree or commits are available.

Global constraints: MV3; pnpm workspaces; real OpenRouter model IDs configurable; secrets server-only; chess.js authoritative; untrusted DOM; no generated JavaScript; authorized input; stop/stale safety; mock vs live evidence separate.

- [x] Foundation: root scripts, workspace manifests, strict TypeScript, extension build and schemas.
- [x] Chess core: explicit FEN seed and validated observations; legal UCI choices and candidate facts. Tests cover incomplete state, successors, castling, en passant, promotion and outcomes.
- [x] Demo (Luna isolated task): interactive React DOM/Canvas board, orientation, public FEN/history, promotion and mock opponent. Focused browser flows exercise legal interactions.
- [x] Detection/parsing: ranked DOM/geometry candidates, bounded extractor, DSL parser, cache, manual selection and crop. Unit and focused integration tests cover orientation, sanitization, parser rejection and geometry.
- [x] Backend: Fastify validated routes, bounded network retry/timeout, multimodal Claude and Decisions Jev, explicit mocks and health. Unit tests cover provider payloads and error handling.
- [x] Extension/controller: cancellable backend jobs, screenshots, optional CDP/synthetic input, observed-state verification, debounced DOM/pixel polling and stale checks. Unit tests and focused DOM/Canvas flows cover cancellation and move verification.
- [x] Interface: dark popup/side panel, settings, authorization, state correction, board preview and debug.
- [x] Verification/docs: typecheck, unit tests, build and Playwright loaded-browser flows passed; live-provider limitation and setup are recorded.

Review focus: stopped requests cannot execute; metadata must match pixels; changed DOM rules cannot corrupt position; navigation cannot resume stale job; promotion choice must equal selected UCI. Track findings in verification.md.

## Automatic state recovery update

User steering: normal gameplay must not require typing or confirming FEN. Recognize pieces using the existing DOM/Claude pipeline; recover complete state automatically from public FEN/PGN or a visible complete move list, then track legal successors. A board image cannot establish hidden rights/history, so unsupported pages pause with an explanation instead of fabricating fields. Manual seed correction remains an advanced optional escape hatch, not the primary workflow.

Design: add bounded sanitized extraction of chess move-history containers (no whole-page extraction, inputs, scripts, private state or site APIs). Accept numbered standard-game history starting at move 1 only after strict replay and exact observed placement/metadata agreement. Use Claude to normalize unfamiliar visible move-history layouts into PGN, never invent missing moves; validate against the supplied history evidence before use. Cache state interpretation per visible context and board, and retain live session history. Existing public FEN/PGN takes precedence; contradictions pause without mutating live state.

- [x] Extract visible numbered move history and bounded context; unit tests for partial, ambiguous, hidden and unsafe content.
- [x] Extend Claude request/response for evidenced game context and PGN, preserving old observation compatibility; provider contract tests.
- [x] Integrate automatic recovery in BoardReader/controller and make UI describe automatic recovery first; cancellation and no-manual browser regression.
- [x] Add the bounded Chess.com public Share Game export adapter, visible coordinate orientation, and recorded-markup regressions without reading private site state.
- [x] Build, unit/browser verification, independent Sol review, documentation and Chrome package refresh.

## Historical baseline progress

All implementation phases above are complete for the tested demo and Chess.com public analysis flows. Typecheck, build and 154 unit tests passed; browser verification is recorded in verification.md. Real Claude recognition of the recorded Chess.com board/history also passed; earlier real provider contract checks and one loaded-extension Canvas move passed. Signed-in playing games, extended live gameplay and arbitrary websites remain outside this verification.

## Midgame stop correction

- [x] Inspect the user's computer-game DOM: visible piece icons were omitted from SAN extraction.
- [x] Bind explicit visible figurines to adjacent SAN text; reject hidden, conflicting or orphaned icons.
- [x] Replay full evidenced history to catch up after missed moves only when the exact prior FEN and tracked move suffix occur at its prefix; preserve counters and repetition.
- [x] Clear old decisions when recovered FEN changes; stale execution remains blocked.
- [x] Red/green unit regressions, full unit/build/typecheck, independent Sol review, loaded-extension history recovery checks and package refresh.

## Capture verification correction

- [x] Reproduce the user's Nxa8 snapshot: destination class changes before geometry settles while the captured rook and effects remain in the DOM.
- [x] Wait on generic visible overlap/geometry evidence before recognition; bound waits, preserve Stop and avoid provider fallback during animation.
- [x] Recheck settling and refresh history/orientation after asynchronous parser-cache access; ignore non-rendered pools.
- [x] Add capture, ordinary-motion, Stop, persistent-overlap, cache-race and hidden-pool unit regressions; independent Sol review.
- [x] Extend the actual public analysis smoke with verified Bxc6 capture and zero parse/discover provider calls.


## Reliable play, staged Jev and diagnostics update

Approved plan and active ledger: `docs/plans/reliable-play.md`.

- [x] Readable factual position descriptions, replayable-history validation and explicit incomplete-history handling.
- [x] Four dependent Jev stages, signed step proofs, compatibility endpoint and bounded cancellation.
- [x] Append-only rotated JSONL journal, artifact storage, redaction, crash-fragment preservation and durable extension outbox.
- [x] Shared piece filtering, five-second settling, exact promotion execution and real public Chess.com promotion fixture.
- [x] Bounded declarative Claude UI recovery, target revalidation, form-field masking and pre-input checkpoints.
- [x] Progress/session logging UI and reproducible paid 2×2 comparison command.
- [x] Final combined browser regressions, independent Sol review, complete verification and release refresh (historical 1.1 evidence below; 1.2 supersedes its decision stages/provider).

Initial evidence: existing 13 default browser tests passed; real Claude parsing and all four Jev decision stages passed. The live 2×2 comparison passed all 12 small position checks. Against one seeded weak opponent, staged variants won while single-stage variants reached the 80-ply limit. This is limited experiment evidence, not a rating or a claim of superiority against Chess.com players/bots. The final baseline regression passed; its scope is recorded separately in verification.md.


## Resumed 1.2 work

- [x] Audit the other model's color plan; source still used White. Implement Auto, migration notice/log, manual preservation, color-bound execution and flip rejection (focused red/green).
- [x] Observe the real anonymous bot UI; add its board-linked Download export and sanitized fixture (red/green startup regression).
- [x] Migrate configured/default vision to Luna; preserve Jev and explicit compatibility; paid Luna/Jev six-stage contract passed.
- [x] Six dependent stages, all-move opponent forecasts, verified last-opponent context, persistent intent and finalist continuations; batched model answers validated without strategic pruning.
- [x] Additional public-turn checkpoint gap reproduced and fixed; 31 focused controller/color cases passed.
- [x] Independent review and corrections, 274 unit tests, full build/typecheck, and all 19 browser cases including live Black-side Luna/Jev. Final comparison/package checks recorded in verification.md.

The baseline four-stage release finished 262 unit tests, 17 browser acceptance cases and a separate persistent IndexedDB restart case before the resume. Current 1.2 evidence is tracked separately in verification.md. Host-load browser timeouts and benchmark errors remain failures, not successful gameplay evidence.


Final 1.2 acceptance: all 19 cases passed in 4.8 minutes. Real Luna/JeV selected and verified g8f6 as Black, including actual Luna obstruction recovery and Stop; its session includes the durable execution outcome. Public bot startup, analysis/capture/exact underpromotion, all demo input modes and actual outbox restart passed. Signed-in games, extended real-provider autoplay and strength remain outside this verification. No stealth or fair-play evasion changes were made.

The quiet 1.2 controlled comparison also completed: all 12 fixture goals passed; both six-stage variants won their one capped game against the weak seeded opponent, while single-stage variants were unfinished. No timeout/illegal move occurred in that repeat. Results, costs, latency and earlier failed runs are retained in verification.md; this does not establish playing strength. Release 1.2 archive CRC/exact-build/credential checks passed; prompt.md is preserved.


## Lichess integration (1.3)

Official BOT API mode is implemented separately from the existing browser mode.
See docs/plans/lichess-bot.md for scope, tests, review corrections and ledger,
and docs/lichess-setup.md for dedicated account/token/upgrade instructions.
The user saved a token locally: BOT account unc_s, bot:play scope and live event
stream are verified. The backend is connected with autoplay stopped. No account
was converted, challenge accepted or live move submitted. Gameplay remains unverified.
