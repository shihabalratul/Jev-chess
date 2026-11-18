# Verification ledger

## Lichess play against Lichess AI (2026-11-18)

Live games on the BOT account against Lichess's built-in AI, casual 10+5, with the Lichess analysis
changes (clock-based depth, tactical facts, threat headline, blunder check). The games were started
outside JevChess and selected in the panel. Figures come from the local journals via
`pnpm lichess:report --json` (offline). Real provider: `typesafe/jev-1.13` through OpenRouter.

| AI level | Game | Jev | Result | Jev moves | Depth mix | Blunder check (fired / changed move) | Cost | Mean s/move |
|---|---|---|---|---|---|---|---|---|
| 1 | [6d7SzHji](https://lichess.org/6d7SzHji) | Black | **Win** (mate) | 20 | 18 reduced, 2 full | 2 / 2 | $0.027 | 5.4 |
| 2 | [P5cyQ6JG](https://lichess.org/P5cyQ6JG) | White | **Win** (mate) | 21 | 19 reduced, 2 full | 2 / 2 | $0.030 | 6.3 |
| 3 | [YpZXk22j](https://lichess.org/YpZXk22j) | Black | Loss (mated) | 41 | 19 reduced, 22 full | 4 / 2 | $0.099 | 7.1 |
| 4 | [tA4KYDHR](https://lichess.org/tA4KYDHR) | Black | Loss (mated) | 39 | 20 reduced, 17 full, 2 forced | 21 / 9 | $0.062 | 7.8 |
| 5 | [5Hz0xSDg](https://lichess.org/5Hz0xSDg) | White | Loss (mated) | 36 | 18 reduced, 15 full, 2 forced, 1 cached | 5 / 5 | $0.103 | 9.2 |
| 6 | [cZFpxUrM](https://lichess.org/cZFpxUrM) | White | Loss (mated) | 19 | 14 reduced, 1 full, 4 cached | 3 / 1 | $0.011 | 6.1 |

- **Execution:** 176 of 176 Jev moves were submitted and confirmed by the Lichess game stream, with
  no stalls, retries or clock trouble.
- **Strength:** wins at levels 1–2 and losses from level 3, so roughly between level 2 and 3. One game
  per level against a fixed engine cannot separate luck from skill; this is not a rating.
- **Not verified:** rated games, games against humans, and accepting challenges at scale.
- The hosted demo's "Watch Jev play" replay is game `P5cyQ6JG`, extracted from session
  `7055c7aa-088c-4719-8b46-4a16c001f35f`. Every move and stage answer was cross-checked
  against the Lichess PGN and the journaled positions.

## Lichess BOT integration 1.3 (2026-10-21)

Separate official API mode reuses the six Jev stages and persistent diagnostics.
The user saved the token locally after implementation. Read-only authentication
verified `unc_s` with BOT title, bot:play scope and HTTP 200 account-event stream
with a real keepalive. No account upgrade, challenge acceptance or live game was
performed. Existing credentials are preserved.

Regression evidence uses explicit simulated NDJSON/API streams and mock Jev,
separately from historical real-provider/browser 1.2 evidence below. It covers
fixed official endpoints; token confinement; username punctuation; stream
chunking/keepalives/malformed limits; full-minute 429 cooldown; legal replay and
Black identity; untouched first White turn through all six stages; castling
aliases and exact underpromotion; manual challenge restrictions; Stop/staleness;
durable intent and restart reconciliation; definite pre-dispatch cancellation;
uncertain POSTs without retry; reconnect exhaustion; response-body cancellation;
settings hydration and Stop while switching modes with a pending Start.

Independent read-only review found four Important issues (stream URL, username
schema, queued cancellation retention and reconnect exhaustion) and one settings
hydration issue, regraded Important due to configuration overwrite. Each was
reproduced RED then corrected GREEN. Additional own-confirmation and intent-save
races also have RED/GREEN records. No finding is silently deferred.

Final verification: **304 tests / 28 files passed**, `pnpm typecheck` and full
`pnpm build` passed, and `pnpm test:e2e` passed **16 cases / four opt-in skips** in
3.1 minutes. The four skipped cases are three external chess.com cases and one
paid live-provider Canvas case, whose older 1.2 evidence remains below. A targeted
Lichess repeat passed at desktop and 390px popup widths with no horizontal overflow;
both screenshots were visually inspected. The test streams and strategic choices
in that panel test are explicitly simulated.

Outputs: ignored `.test-tmp/1.3-final-unit.log`, `1.3-final-build.log`,
`1.3-final-typecheck.log`, `1.3-browser.log`, and `1.3-lichess-narrow-browser.log`.
An earlier full
run overlapped adding the mode-switch regression and recorded its real failure
(303 passed / one failed); it is preserved as `1.3-unit-during-mode-race.log`.
The final 304/304 settled rerun supersedes that failure after its RED/GREEN fix.

Live read-only evidence: `logs/9a70bc37-98a5-47ef-bf27-c478a0944633/` records account
scope and actual event-stream connectivity, with no token in the record. The
production backend started on loopback and connected in live provider mode as
`unc_s`; session `21ead54d-b8d4-49e6-b158-39d169907a5c` reported connected=true,
running=false, zero games and zero challenges. Safe reports are in ignored
`1.3-live-lichess-check.json` and `1.3-live-backend-check.json`. This verifies
account/connection, **not** live game history, clock, move submission or playing
strength. No strategic provider call was made during this connection check.

The first local-browser permission request timed out during automatic review
before starting a process; its permitted retry completed successfully.

Release 1.3 archive: 8 files, 208578 bytes, SHA-256
`d79da6c000f5da871ebd2738cfeeeb82fbe440a1b4564f81d69ada1d62ab3145`. CRC, safe paths, exact built extension and all currently
configured credential scans passed. The prior archive is preserved under ignored
`.test-tmp/release-previous/`. `prompt.md` remains unchanged at SHA-256
`6e13c24f136d715f9ca5079e57d71aa9da22516b39b287a65fcc7b6779d8ed31`.

## Release 1.2 verification (2026-10-21)

This resume preserves prior changes and adds the requested Luna vision/recovery provider, Auto color from confirmed board bottom, the current public bot Download export, and six Jev stages with verified opponent context and persistent offensive/defensive intent. Jev retains all strategic choices.

Build/typecheck and all 274 unit tests across 24 files passed. The final resumed acceptance run passed all 19 browser cases in 4.8 minutes. Earlier 1.1 evidence remains historical and is separated below.

| Check | Final 1.2 result |
| --- | --- |
| `pnpm build` including `pnpm typecheck` | Passed; `.test-tmp/1.2-final-build.log` |
| `pnpm test --maxWorkers=1` | 274 passed / 24 files; `.test-tmp/1.2-final-unit.log` |
| `JEV_CHESSCOM_BROWSER=1 JEV_LIVE_BROWSER=1 pnpm test:e2e` | 19 passed / 4.8 minutes; `.test-tmp/1.2-resumed-browser.log` |
| Real Luna + Jev, Black-facing Canvas | Exact initial observation, automatic Black selection, all six stages, Jev g8f6, real Luna popup dismissal, verified resulting position and Stop. Session `bb273add-02f8-48a3-9609-9428d0615038`; final `execution.outcome` is durably present. Model revision `typesafe/jev-1.13-20260917`. |
| Actual public bot startup | Board-linked Download FEN/PGN recovered untouched starting state without manual seed or vision calls; dialog closed afterward. No bot chess move was made. |
| Actual public analysis | Fresh/midgame state, three missed plies, three observed moves including capture, exact knight underpromotion. Public UI/input real; AI choices explicitly mocked. |
| Loaded extension / deterministic providers | DOM and Canvas, all four input modes, repeated autoplay, Stop/navigation, six-stage promotion/recovery and saved diagnostics passed. |
| Durable outbox | Actual IndexedDB offline intent survives full browser restart and reaches durable disk ACK with stable identity. Fixture intentionally has no confirmed outcome. |
| Independent review | One P2 terminal-sync finding reproduced and fixed; same-FEN stale-history regression retained. No deferred review findings. |
| Chrome package | 1.2.0, eight files, 204,919 bytes. CRC, exact build agreement, safe paths, no configured credentials, maps/backend/logs excluded. SHA-256 `5cd32da1d09e2b05c6a59a465f284bd519d8dfe57bbee81798becd44c58ac48a`. |
| Original specification | `prompt.md` unchanged; SHA-256 `6e13c24f136d715f9ca5079e57d71aa9da22516b39b287a65fcc7b6779d8ed31`. |

This is one live Black-side move and recovery, not extended live gameplay or measured chess strength. Unknown layouts and contradictory observations can still pause with evidence. No concealment, fingerprint changes or randomized input intended to evade fair-play detection were added.

- Paid provider contract: Luna recognized the DOM fixture and all six Jev stages returned legal e2e4. Session `a855aa21-3d1f-4d6b-b328-d459eaf12577`; exact Jev revision `typesafe/jev-1.13-20260917`.
- Real Black screenshot regression: initial Luna reasoning-none recognition produced wrong square assignments and was correctly rejected against public state. Explicit orientation-aware image grid plus low reasoning recognized the exact same saved screenshot correctly, with no uncertainty, in 6.55 seconds. Session `7f39f57c-290e-4023-b62c-7d5b553f517a`. The expected position was used only for verification, never supplied to the model.
- Public bot evidence: actual anonymous computer-page `wc-simple-move-list[board-id]`, Download control and readonly FEN/PGN captured in `tests/fixtures/chesscom-bot-export.json`; startup unit regression failed before adapter support and passed afterward. No private objects or game APIs were read.
- Independent Sol review found one P2: normal terminal opponent moves/fresh terminal attachment incorrectly paused. Both were reproduced and fixed; same-FEN terminal history still invalidates a pending decision. A further settings race was reproduced and fixed: readers now persist a separate migration marker and cannot overwrite a newer backend URL/manual color.
- Browser failures are retained in `.test-tmp/resume-browser.log`, `focused-1.2-browser.log` and `startup-live-after-settings.log`: host load reached ~30, persistent browser startup and public navigation timed out. Focused mocked six-stage exact promotion/recovery and actual IndexedDB restart passed. The failed live Black image evidence led to the corrected prompt above. Neither the timeouts nor these focused checks establish complete 1.2 browser acceptance.

### Controlled 1.2 comparison

The successful repeat used `pnpm benchmark:jev --live --games=1 --max-plies=80` after browser acceptance, without concurrent checks. Saved report and sanitized exchanges: `logs/0a09c6cb-252e-4418-9502-b61fe13b09a5/`. All 12 small position goals met. Games use the same seeded uniform legal-move opponent; each variant has only one game.

| Representation and strategy | Outcome | Plies | Cumulative decision latency | Reported cost |
| --- | --- | --- | --- | --- |
| Placement FEN, single stage | Unfinished at cap | 80 | 13.01 s | $0.004832 |
| Readable pieces, single stage | Unfinished at cap | 80 | 12.50 s | $0.004851 |
| Placement FEN, six stages | Win | 37 | 69.22 s | $0.080318 |
| Readable pieces, six stages | Win | 7 | 14.19 s | $0.024547 |

No timeout or illegal move occurred in this repeat. These tiny fixtures and games against a weak opponent do not establish a rating, a causal advantage from readable input, or results against chess.com players/bots. Staging increases requests and cost. Latency is cumulative decision-service time, excluding browser overhead. Benchmark goals/solutions are never supplied as runtime answers.

The earlier overloaded-host attempt remains in `logs/7d5aa533-8571-45f3-9b2a-f349d1af716d/comparison.json`: all 12 small goals met, both single-stage games reached 80 plies, while six-stage variants hit deadlines at 22 and 2 plies. Its completed-decision costs were $0.046380 and $0.004350; failed raw requests remain logged. Deterministic local planning on those final positions took 266–1297 ms total, max stage 367 ms. The timeouts demonstrate that provider/durable-log latency and host contention can still force a safe pause; they have not been erased by the successful repeat.

## Reliable-play release 1.1 (2026-10-21)

The previous results below remain historical evidence. This revision adds four-stage readable Jev decisions, exact promotion transactions, bounded Claude UI recovery and persistent diagnostics. No engine, book, tablebase or code-selected strategic alternative is present in runtime inputs.

| Check | Result |
| --- | --- |
| `pnpm typecheck` and `pnpm build` | Passed after final input/metadata/recovery fixes |
| `pnpm test` | Passed: 262 tests across 21 files |
| Independent Sol review | Five actionable findings reproduced and fixed; no finding deferred |
| Paid live provider contract | Claude recognized the position; all four Jev stages returned legal e2e4, using configured models without fallback |
| Real provider + loaded Canvas | Passed: real Claude screenshot recognition and obstruction dismissal, four Jev stages, observed e2e4 result and Stop. Model revision typesafe/jev-1.13-20260917. This is one move, not extended live autoplay. |
| Public chess.com analysis | Fresh export, midgame recovery, three verified moves including Bxc6, and recovery of three missed plies passed. AI choices explicitly mocked; public UI and extension input were real. |
| Public animation/promotion fixtures | Actual sanitized DOM/geometry captured from chess.com analysis. Regression readers use these original observations; no private game objects or site API. |
| Combined browser acceptance | Passed: 17 cases in 4.4 minutes, plus a separate real IndexedDB restart case (6.6 seconds) |
| Chrome package | 8 files; 203,130 bytes; CRC and exact build agreement passed; configured credentials absent; maps/backend/logs excluded. SHA-256: f80c98211a1bf64c94604c784e06789092bae69cd87934159671f762182dea8f |
| Original specification | prompt.md preserved; SHA-256 6e13c24f136d715f9ca5079e57d71aa9da22516b39b287a65fcc7b6779d8ed31 |

Final unit/build/browser command outputs are retained in the ignored `.test-tmp/` directory. Earlier command outputs are preserved in `.test-tmp/previous-runs/`. Shared /tmp quota exhaustion caused genuine persistence failures and safe pauses in intermediate runs. Disposable Chromium profiles use a task-owned /dev/shm directory because the project is mounted on FUSE. No sandbox disabling or unrelated temporary-file removal was used.

Regressions cover real moving sprites, hidden/captured/promotion pools, capture overlaps, delayed history, geometry/orientation and board changes, cancellation/late transport, signed trace tampering, missing shortlist probabilities, forced choices, terminal history before versus after input, exact promotions and capture-promotions of every piece for both colors/orientations, pickers/options that act on mousedown or click, automatic-promotion mismatch, ambiguous/changed/forbidden recovery targets, offline/restart delivery, backend changes, UTF-8 limits, redaction, rotation, artifact sync failures and preserved interrupted JSONL fragments. Input intentions precede browser events; success still requires an observed legal result.

### Controlled Jev comparison

Command: `pnpm benchmark:jev --live --games=1 --max-plies=80`. Saved report and sanitized raw exchanges: `logs/5b06992f-839c-4d11-b0c9-0da47bed6647/`.

All four variants met the three small fixture goals: legal opening, immediate mate, and avoiding an immediate promotion draw (12/12 checks). Piece lists versus equivalent placement FEN are varied while other generated rule facts stay identical. Benchmark goals/solutions are never supplied as runtime answers.

| Representation and stages | Game outcome | Plies | Total decision latency | Reported cost |
| --- | --- | --- | --- | --- |
| FEN, single stage | Unfinished at cap | 80 | 14.70 s | $0.004692 |
| Readable, single stage | Unfinished at cap | 80 | 14.42 s | $0.004246 |
| FEN, four stages | Win | 39 | 40.18 s | $0.012062 |
| Readable, four stages | Win | 35 | 39.10 s | $0.013915 |

These are one game per variant against the same seeded uniform legal-move opponent, plus three tiny fixtures. They do not establish rating, a causal advantage from readable text, or results against chess.com players/bots. Provider-reported cost and cumulative decision time exclude browser overhead. Unknown layouts may pause when targets or state cannot be verified. Signed-in games, extended live autoplay and universal UI compatibility remain unverified.


## Verified results (2026-10-09)

| Check | Result |
| --- | --- |
| Dependency installation | Completed with pnpm 10.11; `pnpm-lock.yaml` is present |
| `pnpm build` | Passed: typecheck plus extension, demo, and server builds |
| `pnpm test` | Passed: 148 tests across 13 files, including icon-based SAN, forward catch-up, stale-decision clearing, automatic history recovery, public export, cancellation, conflicting metadata, orientation and FEN regressions |
| `pnpm typecheck` | Passed again after the live-history script and final source changes |
| `JEV_CHESSCOM_BROWSER=1 pnpm test:e2e` | Passed: 14 tests in 2.7 minutes on sandbox-enabled Chromium 156; the paid live browser test was skipped |
| Loaded-extension coverage | DOM and Canvas, all four input modes, three AI moves, repeated autoplay, stop, and navigation passed |
| Mock server smoke | `pnpm start:server` in mock mode returned a healthy response on loopback port 3002; the process was stopped afterward |
| `pnpm test:live` | Passed after the user configured credentials: real Claude DOM recognition and Jev legal decision `e2e4`; returned Jev revision `typesafe/jev-1.13-20260917` |
| `JEV_LIVE_BROWSER=1 pnpm test:e2e tests/e2e/live.spec.ts` | Passed: real Claude screenshot recognition and Jev decision, loaded extension Canvas input, observed/FEN verification, and Stop; one test in 25.2 seconds |
| FEN settings update | Build/typecheck and focused DOM browser flow passed: incomplete FEN was rejected before storage, a wrapped complete FEN was saved canonically, and gameplay still passed. The test backend uses a temporary port to avoid the user's running server. |
| Chess.com public analysis | Built extension loaded in an anonymous throwaway profile; fresh state from public export, midgame reset/recovery from visible history, no typed or confirmed seed, two click-input moves verified, then Stop. AI transport was explicitly mocked. |
| `pnpm exec tsx scripts/live-history-check.ts` | Passed: one real Claude request recognized the recorded public Chess.com board and complete visible e4/e5/Nf3 history. Validated automatic FEN: `rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2`. No Chess.com move was made by this provider fixture check. |
| Generic visible-history browser regression | With public FEN removed and no stored seed, the loaded extension recovered four plies. After two additional manual plies, it read icon-based notation, caught up without reset, cleared the old decision, and executed/verified a fresh seventh-ply choice. |
| User's computer-game history | Inspected the visible bot-game DOM and screenshot: `wc-simple-move-list` uses explicit `data-figurine` symbols. The recorded shape now produces exactly `1. f4 d5 2. Nf3 Nh6 3. Nc3 f5 4. Nxd5 Kf7`. Unit coverage confirms legal catch-up and full FEN without guessing missing state. No automated move was made in the user's game. |
| Forward recovery browser regression | Actual Chess.com public analysis accepted three moves between observations; Parse Position recovered the complete forward history without reset or manual FEN. AI transport remained mocked. |
| Chrome release archive | Eight files, 191,639 bytes; CRC, safe paths, exact build agreement and absence of the configured API key verified. SHA-256: `3ed5778dfbb267e5920ec7f1f3d096c0c69dbff735fc7b754cd7af73337094eb`. Source maps and backend files excluded. |

The passing regression coverage includes bounded snapshot retry and DOM grid/canvas resize geometry. Live checks used the configured `anthropic/claude-haiku-5.5` and `typesafe/jev-1.13` without model substitution. Credentials stayed in the backend environment. The paid browser test verified one move; repeated autoplay and all input modes were verified with explicitly mocked providers.

The initial restricted shell could not install dependencies or launch Chrome. A later approved dependency installation succeeded; those initial restrictions are historical and do not describe the verified runs above.

## Remaining limitations

Chess.com public analysis is verified with default synthetic click input. Signed-in Chess.com playing games, playing strength, extended live autoplay reliability and arbitrary website compatibility remain unverified. An exploratory Chess.com debugger-click run aborted, so debugger input is not verified there; all four demo input modes passed. Live tests make paid requests and require the user's own configured key. Ordinary browser tests skip the paid test unless explicitly enabled.

The user's normal Chrome was available for public page inspection. Its control tool blocked navigation to `chrome://extensions`, so extension loading and execution were verified in the isolated sandboxed test profile. The user must install or reload the packaged extension in their normal Chrome.
