# Bottom-side playing color (opencode plan)

Owner: opencode only. Do not edit docs/architecture.md, docs/implementation-plan.md, docs/plans/reliable-play.md, README.md, verification.md or prompt.md; they stay as Sol authored them. All findings, design decisions and progress for this change live in this file only.

Authority: the user's instructions in this chat (2026-10-21), together with prompt.md and AGENTS.md.

## Problem

The extension currently treats "playing color" as a manual setting that defaults to `white`
(`defaults` in packages/shared/src/index.ts:44). Every gate uses it
(apps/extension/src/controllers/AutoPlayController.ts:131,176,185,234,285):
Jev acts only when `state.turn === settings.playingColor`, the backend legality
check and the prompt wording ("You play …", "Your …") all use it.

On Chess.com the user does not always hold white. When the user holds black, or
loads a game where black sits at the bottom of the rendered board, the extension
today waits for a white turn that never becomes actionable, and the side panel
permanently displays "PLAYING AS ♔ White".

## Target behavior

The user's rule: **the side rendered at the bottom of the observed board is
Jev's side, regardless of color.**

- Board observation already derives orientation from visible file/rank
  geometry (`orientationOf` in packages/board-detection/src/index.ts:209) for
  both 'white' and 'black' boards, and `packages/shared` wears
  `orientationSchema = ['white','black']` already. Derivation needs no new
  perception ability.
- Effective playing color is derived from the confirmed observation's
  orientation ("bottom side"), not from a checkbox that defaults to white.
- The panel shows the derived color and where it came from (board bottom),
  replacing the current static "PLAYING AS ♔ White".
- The manual select stays, but gains an explicit `auto (bottom side)` value and
  remains an escape hatch (`black` or `white`) for spectator or flipped boards
  where the bottom is not the user's side.

## Design

1. Settings schema (packages/shared/src/index.ts:44)
   - `playingColor` gains the value `'auto'`; `defaults.playingColor = 'auto'`.
   - `orientation` watch: observation orientation continues to feed it; nothing new needed there.
   - Version/migration: stored settings from <1.2 keep `playingColor:'white'`.
     Add `settingsVersion`; if absent on load, migrate an untouched stored
     default `white` to `'auto'` exactly once and persist. The panel logs this
     migration in its session evidence so it is never silent.

2. AutoPlayController (apps/extension/src/controllers/AutoPlayController.ts)
   - New private accessor `effectiveColor()`:
     `'auto'` → confirmed observation orientation (bottom side);
     manual value → the manual value.
   - Replace direct reads of `this.settings.playingColor` at lines 131, 176,
     185, 234, 285 with `this.effectiveColor()`.
   - If orientation is unknown when needed, keep the existing safe pause
     (WAITING / paused status) — never guess a color from pixels alone.
   - The mid-cycle re-check (line 234) also re-derives after re-detection, and
     existing move-safety verification (already rejects orientation flips
     during input, see the earlier 2026-10-21 rulings) still applies.

3. Charts of truth flow to the server
   - `decisionInput(effectiveColor)` auto-collects the change: `/choose` and
     all four Jev stages reuse the backend legality/turn verification and the
     readable descriptions ("You play black") with no server change.
   - `state-metadata` turn consistency checking is unchanged; it already
     rejects contradictory visible turn against the tracked FEN.

4. UI (apps/extension/src/popup/App.tsx:101,115)
   - "PLAYING AS" renders effective color plus origin, e.g.
     `♚ Black (board bottom)` or `♔ White (manual)`.
   - Settings select: `auto (bottom side)` default, then `white`/`black`.
   - When the derived color disagrees with a stale manual override the panel
     surfaces that fact in the existing alert region (no silent switch).

5. Solver view compatibility
   - journal/outbox event payloads gain effective playing color and its origin
     per session so evidence shows exactly which color derivation ran; payload
     size limits and redaction rules already tested for events travel.

## Scope of changes (files)

- packages/shared/src/index.ts (schema + defaults + settingsVersion)
- packages/shared consumers: settings load/migrate path in the extension
- apps/extension/src/controllers/AutoPlayController.ts (derivation + gates)
- apps/extension/src/popup/App.tsx (display + select + alert)
- apps/extension/src/background persistence for settingsVersion
- tests: shared schemas, controller gates, popup regression, journal payload

Focused browser regression: demo board flipped to black (`data-orientation="
black"`) auto-playing as black with default settings, plus the existing
black-turn Canvas opponent case which already exercises real black turns.

Chess.com real-site evidence: analysis board flipped using its Flip control,
confirming derived `black` with public FEN/history still recovering state;
recorded-markup fixtures for a black-oriented Chess.com board must be added
without private state, reusing the public adapter evidence format already in
use for promotion and history.

## Test plan

- [ ] Schema/back-compat: `playingColor:'auto'` parses; stored old settings version bump is explicit, user-visible.
- [ ] Controller: auto color acts when bottom side's turn; black explicit still works; manual override never switches silently; unknown orientation keeps safe pause; play-color change between detection cycles is observed and re-derived before any input is sent.
- [ ] UI: PLAYING AS shows correct piece glyph and origin for auto and manual; mismatch alert for a stale stored version.
- [ ] Journal: event includes effective color origin; no credential or private page data in payload.
- [ ] Demo e2e: default settings; black-at-bottom board plays black via existing Canvas opponent; no seed FEN.
- [ ] Chess.com fixture: recorded black-orientation public analysis DOM recognized; colors derived correctly.

## Verification evidence still required before release 1.2

- Full unit + typecheck + build green at the new default.
- Loaded-extension browser run: auto-derived black turn executed and verified with mocked provider.
- One real Canvas flip regression through the popup with default settings.
- Chess.com black-orientation public flow if available; otherwise record the limitation in this file (not in Sol's docs).

## Risks and non-goals

- A spectator/analysis-only page where the bottom side is not the user's side
  will be adopted wrongly by `auto`; the manual select and the alert are the
  escape hatch, and no state mutation happens before a confirmed positive turn.
- Does not introduce any private-page reads, site APIs or move suggestion UX;
  syntax and archive flows are untouched.
- Signed-in playing games and arbitrary websites remain outside verification.

## Work ledger

- [ ] Schema/derivation with migration and journal payloads.
- [ ] Controller gates converted to effective color.
- [ ] Popup display and alert.
- [ ] Unit red/green + demo black-turn e2e.
- [ ] Chess.com black-orientation fixture and public flip evidence.
- [ ] Full suite, release 1.2 package refresh.


## Primary-agent implementation record, 2026-10-21

The design-only plan above was implemented during the reliable-play 1.2 resume. Auto resolves the playing color from stable orientation, manual settings remain explicit, and color/board flips invalidate pending choices. Legacy migration stores an independent marker rather than rewriting settings on read; a reproduced concurrency regression proves a newer URL/manual color cannot be overwritten. The panel displays resolved color and origin and warns about manual mismatches. Controller/session records include that color evidence. See `docs/plans/reliable-play.md` and `docs/verification.md` for final checks, limits and real versus mocked evidence. The original design text is retained as provenance.
