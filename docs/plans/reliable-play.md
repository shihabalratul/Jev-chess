# Reliable play implementation ledger

Authority: the user's approved plan and subsequent instructions in this chat (2026-10-21), together with prompt.md. The latest user instruction revoked the earlier AGENTS.md guidance.

## Work sequence
- [x] Shared staged-decision/recovery/log contracts and factual readable chess state.
- [x] Four-stage Jev service, signed step API, deadlines and verified history.
- [x] Durable session journal, artifact storage and extension outbox.
- [x] Consistent piece filtering, five-second settling, promotion and visual recovery.
- [x] Controller/extension integration, progress, cancellation and diagnostics UI.
- [x] Regression/browser verification, comparisons and documentation.

## Pre-flight and rulings
- This supplied directory has no Git repository. Work in place as requested; no worktree, branch or commits can be created. Preserve this ledger rather than deleting it.
- Decision stages consume the same confirmed position; recovery may manipulate UI but never choose a chess move. Logging must precede input and survive gameplay cancellation.
- Stage transport must remain below the MV3 fetch lifetime; use separate step requests and a 45-second content-owned overall deadline.
- All strategic work and provider/state/cancellation architecture remain in the main agent. A final independent Sol review will inspect the completed work.
- No chess.com page is currently open. Capture public promotion evidence in a disposable analysis session; if the site is unavailable, label fixtures and live verification honestly.

## Evidence
- Red/green: staged service, signed API, journal/outbox, pre-input persistence, icon promotions and stale recovery targets. Main unit suite passed 184 tests before the final safety additions.
- Captured actual public Chess.com promotion DOM in tests/fixtures/chesscom-promotion-dom.json through the in-app browser; manually selected knight and observed .piece.square-18.wn. This is UI evidence, not a Jev or loaded-extension smoke.
- Build/typecheck passed; Playwright needed sandbox escalation to bind localhost. The first loaded-extension DOM flow passed. Further checks remain in progress.
- Ruling: keep unknown game-over claims paused unless independently verified; a model label alone cannot mark a game finished.
- Ruling: preserve the outbox across worker suspension using IndexedDB plus a one-minute alarm; add only the alarms permission. Logs never auto-delete.
- Ruling: signed step proofs bind prior model results to the entire input. Backend restart invalidates in-flight proofs; the user can request a fresh decision.
- Ruling: imported FEN replay is a verified suffix, not proof of earlier repetition history. Mark earlier history unknown even when a SetUp PGN exists.

- Live contract passed (session 73fbb844-c8c1-475e-9598-100efe711646): Claude recognized the board; four Jev stages selected e2e4 legally.
- Controlled paid comparison completed (session 5b06992f-839c-4d11-b0c9-0da47bed6647): 12/12 small fixture goals met. One seeded opponent per variant: FEN single 80 plies unfinished, readable single 80 unfinished, FEN staged won in 39 plies, readable staged won in 35. Sample is too small and opponent too weak to establish rating or language superiority.
- Existing browser suite: 13 passed / 2 optional skips in 3 minutes. Focused new browser test now performs real overlay dismissal and exact knight promotion; its remaining failure was the test reading innerText inside a closed details element, corrected to textContent.
- Additional red/green safety regressions: late transport cancellation, newly revealed terminal repetition history, changed promotion targets, close controls outside an obstructed board, interrupted journal fragments, URL/header redaction, screenshot form masking and UTF-8 event size limits.

## Independent review and final corrections
- Sol's independent review identified five actionable findings. All five were reproduced with failing regressions and fixed: late-overlay input race, overly permissive dismissal controls, unidentified promotion choices, successful terminal-history verification, and artifact/directory durability before acknowledgement. No review finding was deferred.
- Additional browser findings were reproduced and fixed: previous-backend events blocking current-backend delivery, late public export controls, and slow initial vision consuming the consistency timer. These were verified with regression tests.
- All 205 unit tests passed after corrections; typecheck and full build passed. Final loaded-browser verification remains in progress.
- Test environment: shared /tmp reached its user quota, causing genuine IndexedDB/logging failures and safe input pauses. Chromium also crashed with profiles on the project's FUSE filesystem. Isolated profiles moved to a task-owned /dev/shm directory; unrelated temporary data was not touched. Earlier task command outputs are preserved under ignored .test-tmp/previous-runs/.
- Safe boundary: recovery can interpret unfamiliar layouts, but an unidentified piece or a control without independently checkable dismissal semantics pauses; it does not trust a model label to grant an action.

- Final additions reproduced from real browser evidence: chess.com opens both the picker and selected option on mousedown; its consumed picker may remain connected but hidden. Suppress remaining events, verify the exact pending pawn placement before continuing, and verify the final result. All promotion/capture combinations and automatic mismatches are covered.
- Real Claude recovery now receives captureRect and explicit viewport/crop scaling semantics. A model's safe refusal exposed this missing wire-contract context; a provider regression verifies the crop origin reaches Claude.
- Final source checks: pnpm typecheck/build passed, and pnpm test passed 259 tests across 21 files. Final complete browser run remains pending.

- Final gesture regressions bind orientation/geometry after persistence and between awaited input steps. Canvas uses its mandatory independent checkpoint after recovery instead of requiring DOM pieces.
- The most recent real Claude recovery returned a complete valid JSON object inside a Markdown json fence. Added narrowly bounded wrapper normalization, with unchanged raw-response audit and strict rejection of malformed/prose-wrapped content. No move or action is invented or repaired.

## Resumed work, 2026-10-21

The previous implementation is retained. Baseline verification completed while usage was unavailable: 262 unit tests, build/typecheck, 17 combined browser acceptance cases and one persistent IndexedDB restart case passed (outputs `.test-tmp/unit-final.log`, `acceptance-final.log`, `outbox-browser.log`). The archive and documentation still needed refresh.

The latest user instructions authorize these additional tasks:

- [x] Replace the vision/recovery default with verified OpenRouter `openai/gpt-6-luna`; preserve Jev and explicit provider choices. Omit unsupported temperature; use reasoning effort low. Verify real access.
- [x] Implement Auto playing color from confirmed bottom-side orientation, retain manual overrides, migrate legacy White with a visible notice, bind color to decisions and input. The other model's `bottom-side-color.md` contains design only; preserve its record.
- [x] Reproduce the opening-state failure on the public computer UI. Extend only observed public export adapters, retain exact FEN/PGN validation and fixtures.
- [x] Extend Jev stages to assess → reply (every legal own move) → nominate → shortlist → continue → choose. Jev chooses offensive/defensive intent and every strategic branch. Carry intent throughout, include verified recent opponent context, and calculate only rule consequences in code. Batch independent questions within existing 10-second stage / 45-second overall limits.
- [x] Run focused and full checks, actual Luna/Jev and browser verification, controlled comparison, independent review; update docs and archive.

Ruling: follow the latest user request for six smaller dependent stages rather than the earlier four-stage order. Opponent analysis must precede nominations to include every legal move. A final continuation stage examines Jev's response for each finalist. No strategic pruning or engine substitutes are allowed; more requests/context may increase latency and cost.
Ruling: no Git metadata exists in this workspace; preserve the current checkout and use the existing persistent ledger and test outputs instead of creating a worktree or commits.

Pre-flight interfaces: shared schemas drive server proofs and extension progress; all must change together. Auto color must resolve to white/black before generating backend input; it must never reach the legal position contract as `auto`. Batched stage results must merge complete question IDs without losing provenance. Existing cancellation and durable input intent remain mandatory.

### Resumed verification ledger

- Auto color: two new regressions failed against White-only defaults, then passed with versioned migration, resolved color and flip invalidation. Controller/color coverage passed 33 cases after final fixes.
- Luna: configured-model/sampling regression failed against Haiku, passed after vision migration. Real Luna recognition + all six Jev stages passed in session `a855aa21-3d1f-4d6b-b328-d459eaf12577`, exact Jev revision `typesafe/jev-1.13-20260917`, selected legal e2e4. This was a provider contract check, not browser execution.
- Bot startup: observed real anonymous bot Download dialog, captured sanitized DOM/export fixture. Its regression failed before adapter support, passed after. Existing public-export Stop, ambiguity, readonly and replay checks retained.
- Six-stage regressions cover intent propagation, every legal own branch, per-source complete examined contexts, verified opponent move, unknown history, promotion types, missing probabilities, malformed options, signed proof tampering and late cancellation.
- Additional checkpoint finding: contradictory sideToMove after Jev could pass with unchanged placement/FEN. Reproduced RED, now independently validates all metadata GREEN.
- Independent Sol review: one P2 normal-terminal-sync finding. Valid opponent mate and fresh terminal attachment were rejected by a guard intended for pending decisions. Both tests failed, then passed after allowing verified terminal transitions during sync and avoiding the uninitialized state getter. Existing same-FEN newly terminal repetition still rejects the pending decision. No other actionable finding or minor was reported.
- Final review judgments: loaded-browser acceptance requires actual rerun; account/provider access claims require explicit live evidence; extended autoplay reliability and playing strength remain unestablished. These are verification limits, not promises of universal compatibility.
- Full build/typecheck passed after final review fixes (`.test-tmp/resume-build-final3.log`). Final unit/browser outputs are being collected separately.
- First resumed full browser attempt: 8 demo tests passed, 7 timeouts, 1 interrupted, 3 not run. Host load reached approximately 30; public navigation and browser launch stalled. This attempt is retained as failure evidence, not counted as passing acceptance.
- Controlled new six-stage comparison: 12/12 small position goals met; single-stage games unfinished at 80 plies; FEN six-stage stopped at 22 plies, readable six-stage at 2, both due deadlines. Report `logs/7d5aa533-8571-45f3-9b2a-f349d1af716d/comparison.json` retains failures, costs and raw evidence. Local deterministic planning for those final positions took 266–1297 ms total, individual stage maximum 367 ms (`.test-tmp/plan-performance.log`). No increased-strength claim follows from this run.
- Further browser investigation: previous 1.1 and current 1.2 both launched in isolated probes (642 ms and 286 ms); a shared-memory variant also launched. The earlier launch stalls were transient. Focused retry passed real IndexedDB restart and mocked six-stage promotion/recovery, but bot startup stalled at launch and live Black recognition did not finish. Its diagnostics showed old-backend outbox records.
- Settings concurrency finding reproduced RED: a read/migration could rewrite a stale full settings object after a newer backend URL/manual color was saved. Fixed by persisting only a separate idempotent migration marker, rereading current settings, and backfilling initial configuration after listeners attach. Read paths never rewrite the configuration object. Saving in the panel persists versioned settings. Marker changes do not cancel gameplay. Focused race/color regressions passed; browser rerun required.


### Final resume after interruption

The user revoked the earlier AGENTS.md instructions. Previously completed source is retained. The drive was mounted on the host but briefly unavailable in the sandbox; no mount or disk repair was performed. Access returned after the user's retry. The old test process had ended, so browser acceptance restarted using a new task-owned RAM-backed profile directory.

Final pre-interruption source checks: `pnpm build` (including typecheck) passed; `pnpm test --maxWorkers=1` passed all 274 tests across 24 files. The corrected low-reasoning Luna prompt includes an explicit orientation-aware square grid. The interrupted final browser run had already passed the actual public bot starting-state export. The resumed run has independently repeated that pass and passed public analysis/capture/missed-history recovery and exact knight underpromotion. Remaining acceptance cases are in `.test-tmp/1.2-resumed-browser.log`.

A 1.2 archive matching the built extension was created and checked: eight files, CRC/exact build agreement, no configured credentials, no maps/backend/logs. Its final SHA will be recorded after installation-note updates. `prompt.md` still matches its original SHA.

Scope clarification: preserve the no-cheating requirement. Reliability uses verified state, bounded input and cancellation. No stealth, fingerprint masking or timing randomization intended to conceal automation or evade fair-play detection was added.

- Final resumed acceptance completed: 19/19 browser cases passed in 4.8 minutes. Live Black Canvas session `bb273add-02f8-48a3-9609-9428d0615038` contains all six stage starts, actual Luna/Jev requests, selected g8f6 and durable verified `execution.outcome`. Real Luna dismissed the injected training popup. Fresh public bot export, public analysis captures/missed-history recovery/exact knight promotion, all input modes and actual IndexedDB restart passed. Earlier failed attempts remain preserved.

- Final archive refreshed after installation notes: 1.2.0, eight files, 204,919 bytes, SHA-256 `5cd32da1d09e2b05c6a59a465f284bd519d8dfe57bbee81798becd44c58ac48a`. CRC/exact build/credential scan passed. Earlier archives and verification records were preserved by their SHA under `.test-tmp/release-previous/`.

- Final controlled comparison repeated without concurrent checks: session `0a09c6cb-252e-4418-9502-b61fe13b09a5`. All 12 fixture goals passed. Single-stage FEN/readable games both reached 80-ply cap unfinished; six-stage FEN won in 37 plies and readable won in 7. Cumulative decision latency/cost: 13.01 s/$0.004832, 12.50 s/$0.004851, 69.22 s/$0.080318, 14.19 s/$0.024547 respectively. No timeouts/illegal moves occurred. One weak seeded opponent per variant cannot establish a rating or representation superiority. Earlier failures remain saved.
- Completion: approved implementation, requested Luna/color/startup/strategy updates, independent review fixes, full source checks, real-provider/public-browser acceptance, controlled comparison, documentation and verified 1.2 package are complete. Universal layouts, signed-in games, extended real-provider autoplay and strength remain explicit unverified limits. No Git worktree/branch cleanup applies; diagnostic evidence is preserved.
