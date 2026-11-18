# Testing

Run everything from the repository root. **GitHub CI** runs typecheck, unit tests and the build on every push and
pull request. The release workflow runs them again before publishing.

> **In one sentence:** the everyday checks are free and offline (mocked AI); anything that calls Jev or Luna for real
> is opt-in and costs a little, and is never confused with the mocked results.

---

## Free checks: run these before every PR

| Command | What it checks | Time |
|---|---|---|
| `pnpm typecheck` | TypeScript across all apps and packages | seconds |
| `pnpm test` | 340+ Vitest unit tests | ~30 s |
| `pnpm build` | Extension, Board Lab and backend all build | ~1 min |
| `pnpm exec playwright install chromium` | One-time browser download for the e2e tests | once |
| `pnpm test:e2e` | Playwright loads the **real built extension** in a throwaway profile against the Board Lab | a few min |

```sh
pnpm typecheck && pnpm test && pnpm build
```

Add `pnpm test:e2e` if you touched the extension, board detection or move input. To use a Chromium you already have,
set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

### What the tests cover

| Area | Covered by |
|---|---|
| Providers | The exact Luna chat and Jev Decisions payloads, malformed answers, illegal moves, retries, timeouts, server validation |
| Play loop | Stop, stale decisions, move verification, opponent tracking |
| Chess state | Castling rights, promotion, incomplete or contradictory history |
| Board detection | Orientation, high-DPI cropping, DOM sanitising, declarative parser rules |
| Lichess | Stream handling, time budget, decision cache, move submission and confirmation (against a simulated Lichess) |
| Browser (e2e) | DOM and Canvas boards, all four input modes, auto-play, Stop, navigation, saved diagnostics |

**How the e2e tests stay honest:** the AI is explicitly mocked. Canvas recognition in tests classifies the real
screenshot pixels against the demo's font, not the page's FEN. The test browser profile gets broader permissions
than the shipped extension. Details: [tests/e2e/README.md](../tests/e2e/README.md).

---

## Develop without an API key

```sh
PROVIDER_MODE=mock pnpm dev:server
```

Mock mode is free and offline. It reads pieces from explicit DOM attributes (like the Board Lab's `data-piece`) and
always takes the first option. It can't read images; the Canvas e2e tests bring their own pixel fixture. Every mock
response is labelled `mock`, and mock mode **never switches on by itself** when a live provider fails.

To run the built backend instead of the dev server: `pnpm build`, then `pnpm start:server`.

---

## Live checks (paid, opt-in)

These use your real `OPENROUTER_API_KEY` and cost a few cents. They're **skipped unless you opt in**.

| Command | What it does |
|---|---|
| `pnpm test:live` | Luna parses a DOM fixture, Jev picks a move, and the move is checked for legality |
| `JEV_LIVE_BROWSER=1 pnpm test:e2e tests/e2e/live.spec.ts` | Loaded extension + real Luna screenshot recognition + Jev on the Canvas Board Lab |
| `pnpm exec tsx scripts/live-history-check.ts` | One real Luna request against a recorded public Chess.com board and move list |
| `JEV_CHESSCOM_BROWSER=1 pnpm test:e2e tests/e2e/chesscom.spec.ts` | Real Chess.com public analysis page in an anonymous sandboxed profile, **with mocked AI** (free) |

Live checks prove the integration works. They **don't measure playing strength**. If a model is unavailable, the
error is reported and no other model is substituted.

---

## Measuring Jev

These test Jev itself. `--live` runs are paid; `--mock` and the report commands are free.

```sh
pnpm benchmark:puzzles --live [--depth=quick|reduced|full] [--no-facts] [--no-verify]
pnpm benchmark:puzzles --mock      # harness dry run: always picks the first option, NOT a measurement
pnpm benchmark:jev --live --games=1 --max-plies=80
pnpm lichess:stats                 # totals from journaled Lichess decisions (offline)
pnpm lichess:report [--json]       # per-game Lichess breakdown (offline)
```

| Benchmark | What it measures |
|---|---|
| `benchmark:puzzles` | Solve rate on a fixed, mechanically checked tactics set. Each live run appends a line to `logs/benchmark-history.jsonl`, so you can compare changes over time. |
| `benchmark:jev` | A small 2×2 comparison (named pieces vs FEN × single stage vs staged) on three fixtures (legality, mate in one, avoiding a promotion draw), plus optional capped games against a seeded random-move opponent. Saves `comparison.json`. Not a rating. |
| `lichess:report` | Real games: result, cost, depth mix, blunder checks, material dropped |

---

## Rules for reporting results

- **Never report mocked runs as live verification.**
- Record real-provider evidence (dates, sessions, numbers) in [verification.md](verification.md).
- A failure or timeout is a failure, not "probably fine". Keep the log and say so.
