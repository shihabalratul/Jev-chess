# Browser test fixtures

`extension.spec.ts` loads the built extension in a throwaway Chromium profile. Only this profile receives screenshot/debugger permissions automatically. The released manifest retains activeTab and optional debugger permission.

External AI is mocked explicitly through the real backend. Canvas mock recognition classifies the actual cropped screenshot pixels against the demo font glyphs, independently of page FEN or underlying chess.js game. It is a deterministic test fixture, not shipped vision recognition. Shipping image recognition uses GPT-6 Luna. Model requests, provider errors, and wire schemas are tested separately with transport doubles in providers.test.ts; paid validation uses `pnpm test:live`.

The browser executable can be set using `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, otherwise install it with `pnpm exec playwright install chromium`.

The final run `JEV_CHESSCOM_BROWSER=1 pnpm test:e2e` passed 14 tests in 2.7 minutes on sandbox-enabled Chromium 156: eight demo tests, five loaded-extension demo cases and one real-site Chess.com public analysis case. The paid live test was skipped. Demo coverage includes DOM and Canvas observation, all four input modes, repeated autoplay, stopping, navigation and automatic recovery from a visible move list without public FEN or manual seed.

`chesscom.spec.ts` is opt-in with `JEV_CHESSCOM_BROWSER=1`. It uses an anonymous throwaway profile and actual public analysis UI, but mocked AI: automatic fresh export and midgame history recovery, two verified click-input moves, catch-up after three unobserved plies, and Stop. It dismisses onboarding and rejects cookies only in that disposable profile. It does not sign in or operate a human opponent's game. The default click mode passed; an exploratory `JEV_CHESSCOM_INPUT=debugger-click` run aborted and remains unverified. Signed-in playing games and arbitrary sites are unverified.

The DOM click case also replaces literal SAN piece letters with explicit visible figurine icons in its controlled demo fixture, plays two plies between observations, then parses without resetting. It verifies recovered FEN, clears the stale decision and executes a newly requested choice. These UI changes are confined to the demo test fixture.

`live.spec.ts` separately passed a real Claude screenshot and Jev decision flow, executing and verifying one Canvas move through the loaded extension. It is skipped by default. Run `JEV_LIVE_BROWSER=1 pnpm test:e2e tests/e2e/live.spec.ts` to explicitly authorize paid requests using the backend's `.env`. The test uses an isolated sandboxed browser profile and a temporary loopback backend; the OpenRouter key is never placed in browser storage.


Release 1.2 adds `bot-start.spec.ts` for the current anonymous computer-page public Download export, plus a Black-facing live Canvas flow using Luna and six Jev stages. `settings-load.test.ts` reproduces a concurrent legacy migration overwriting a newer saved backend/manual color; read paths now persist only a separate marker. Current passing and failed runs are recorded in docs/verification.md rather than inferred from historical results.

Final 1.2 acceptance on 2026-10-21: `JEV_CHESSCOM_BROWSER=1 JEV_LIVE_BROWSER=1 pnpm test:e2e` passed all 19 tests in 4.8 minutes. The live Black-facing Canvas test selected/verified g8f6 with actual Luna recognition/recovery and six Jev stages. Public bot startup, public analysis captures/underpromotion (mocked AI), all demo inputs and real IndexedDB restart passed. Output: `.test-tmp/1.2-resumed-browser.log`.


Lichess 1.3: `lichess.spec.ts` loads the shipping extension against a local backend
with an explicit simulated Lichess transport and MockProvider. It connects without
a board tab, derives Black from account identity, selects an active game, runs all
six stages, submits exactly once, confirms the move in streamed history and Stops.
It requires no real Lichess token and proves no live authenticated gameplay. Its
screenshot is saved at `.test-tmp/1.3-lichess-panel.png` for visual inspection.
