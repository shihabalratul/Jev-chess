# Testing

All commands run from the repository root. The CI workflow runs typecheck, unit tests and the build on every push and pull request.

## Everyday checks (free)

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

## Benchmarks and game reports

These measure Jev itself. `--live` runs make **paid** OpenRouter requests; the mock and report commands are free.

```sh
pnpm benchmark:puzzles --live [--depth=quick|reduced|full] [--no-facts] [--no-verify]
pnpm benchmark:puzzles --mock      # harness dry run, always picks the first option; NOT a measurement
pnpm benchmark:jev --live --games=1 --max-plies=80
pnpm lichess:stats                 # totals from journaled Lichess decisions (offline)
pnpm lichess:report [--json]       # per-game Lichess breakdown (offline)
```

- `benchmark:puzzles` scores a fixed, mechanically checked tactics set and appends one line per live run to
  `logs/benchmark-history.jsonl`, so changes can be compared over time.
- `benchmark:jev` is a small 2×2 comparison (named pieces vs FEN, single vs staged) plus optional capped games
  against a seeded random-move opponent. It can't establish a rating.

## Contributor checklist

Before opening a pull request:

```sh
pnpm typecheck && pnpm test && pnpm build
```

Run `pnpm test:e2e` too if you touched the extension, board detection or move input.
Never report mocked runs as live-provider verification. Record real-provider evidence in [verification.md](verification.md).
