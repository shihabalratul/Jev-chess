# Lichess BOT mode — design, implementation and ledger

Approved scope: the user accepted the proposed separate Lichess BOT API mode with
standard chess, one selected game, manually accepted challenges, backend-only token,
extension controls and existing Jev decisions and persistent diagnostics. The user
does not yet have a BOT account; prepare explicit setup steps without converting
an account or accepting agreements on their behalf.

## Design

The backend owns the fixed https://lichess.org connection, account identity,
incoming challenges, event and game streams. It reconstructs chess.js positions
from initialFen and every UCI move. Color comes exclusively from account ID.
The extension selects a game, accepts individual incoming challenges and explicitly
starts or stops play. Connecting or restarting never arms gameplay automatically.
Browser mode remains separate. Jev uses its existing six stages, readable position,
verified history, objective and limits; there is no engine or strategic fallback.

Ordinary requests serialize; a 429 establishes a shared one minute cooldown.
Streams reconnect with bounded backoff, cancel in-flight decisions and require
a fresh full game before allowing more input. Move submission occurs once after
a durable intent. Only an authoritative extending game history confirms it;
uncertain outcomes pause and are reconciled on reconnect, never blindly replayed.
All control mutations require backend pairing and extension-control sender identity.
The token is environment-only, redacted from logs and never sent to the extension.
Account conversion is deliberately outside the runtime API.

## Tasks and verification

1. Transport and authoritative state: test NDJSON chunking, keepalives, malformed
   data, cancellation, auth, cooldown, black identity, legal replay, castling and
   promotions. Implement typed client and shared public status contracts.
2. Backend game lifecycle: test manual challenge acceptance, explicit arming,
   stage cancellation, stale results, exact move confirmation, uncertain submission,
   stream reconnect and logging failures. Implement controller and paired routes.
3. Extension and setup: add separate mode/panel, protected background routing,
   account instructions and local-token configuration; verify build and browser UI.
4. Run typecheck, unit tests, build and e2e sequentially. Fresh-context whole-change
   review, address important findings with regression tests. Record mocked versus
   live evidence; no live account or game verification without credentials.

Review focus: castling stream aliases, game replaced mid-decision, Stop during
queued input, HTTP success before stream confirmation, restart after uncertain
input, and no secrets in the extension.

## Ledger

- Ruling: implement the already approved scope directly — repeated design approval
  would contradict the user's setup instruction and developer autonomy guidance.
  Account conversion remains an explicit separate irreversible action.
- Ruling: this directory has no Git repository, so preserve the implementation and
  ledger in place; worktree/commit/branch workflow cannot apply.
- Preflight interfaces: client streams feed controller schemas; controller exposes
  shared status and commands consumed by paired routes and extension panel. Existing
  Provider.chooseStep remains the strategic interface, journal the durability gate.
- Tasks 1–4 pending. No product changes yet. Existing v1.2 verification is recorded
  in docs/verification.md; it does not verify this new integration.

- Tasks 1–3 implemented: typed fixed-origin client, authoritative legal replay,
  backend lifecycle/pairing, durable checkpoints, dedicated extension controls,
  interactive account helper and setup docs. No account/token exists yet.
- Whole-change independent review found wrong game-stream URL, valid username
  rejection, queued cancellation ambiguity, and retry-exhaustion dead end. Each
  reproduced RED and fixed GREEN in focused regressions. Settings hydration was
  regraded Important because saving stale defaults can overwrite user configuration;
  its reproduction and fix are recorded separately.
- Additional timing regressions fixed RED→GREEN: Stop during checkpoint save and
  confirmed own move versus async journal. All-stage progress preserves Jev intent.
- Ruling: definite pre-dispatch cancellation clears only its own saved intent after
  a durable notSubmitted outcome; uncertain dispatched requests remain unconfirmed
  — avoids a false permanent block without ever replaying ambiguous input.
- Ruling: authenticated live compatibility and strength are not claimed without
  account credentials; simulated evidence is explicitly separated.
- Task 4 final verification and packaging in progress.

- Review fix pass: protocol path, account/opponent username schema, definitely
  undispatched queue cancellation, reconnect exhaustion and initial settings
  hydration each reproduced RED→GREEN. No review findings deferred.
- Added cancellation-through-response-body regression (RED→GREEN), independent
  White untouched-start/all-six-stage test and account/opponent punctuation cases.
- Reviewer declined live authenticated compatibility and strength: kept as an
  explicit verification limit, since no account/token has been supplied.

- Final settled unit suite: 304 tests / 28 files passed. Full pnpm build including
  pnpm typecheck passed. The complete local browser suite is next; external-site
  and paid-provider opt-ins remain distinct historical 1.2 evidence.
- UI pending-Start mode-switch regression reproduced RED→GREEN before the final
  settled suite. Earlier concurrent-edit unit failure is retained, not relabeled.

- Task 4 complete: 304/304 unit cases across 28 files; typecheck and full build;
  local browser 16 passed / four explicit external/paid skips; one narrow-width
  Lichess panel repeat passed, screenshots visually inspected.
- User then supplied the token locally. Read-only identity confirmed unc_s/BOT;
  scope verification confirmed bot:play, and the official account-event stream
  returned HTTP 200 and a keepalive. Session 9a70bc37-98a5-47ef-bf27-c478a0944633.
- Started the production backend and connected it to unc_s in live mode, autoplay
  stopped. Session 21ead54d-b8d4-49e6-b158-39d169907a5c; zero games/challenges.
  No conversion, challenge acceptance or live game move occurred. Live gameplay
  and strength remain unverified. Account conversion is unnecessary for unc_s.
- Packaged version 1.3; exact build, CRC, safe paths and configured credential
  scans passed. Previous archive preserved. prompt.md digest unchanged.
