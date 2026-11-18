# Contributing to JevChess

Thanks for wanting to help! ♞ Bug reports, docs fixes, new board support and ideas are all welcome.

## Quick setup

```sh
git clone https://github.com/shihabalratul/Jev-chess.git
cd Jev-chess
pnpm install
cp -n .env.example .env
PROVIDER_MODE=mock pnpm dev:server   # free, no API key needed
pnpm dev:demo
```

See [docs/getting-started.md](docs/getting-started.md) for loading the extension, and the
[Architecture guide](docs/architecture-guide.md) for how everything fits together, including a "where do I change X?" table.

## Workflow

1. Open an issue first for anything bigger than a small fix, so we can agree on the approach.
2. Fork the repo and create a branch: `git checkout -b fix/short-description`.
3. Make your change with tests where it makes sense (`tests/*.test.ts` uses Vitest).
4. Run the checks:
   ```sh
   pnpm typecheck && pnpm test && pnpm build
   ```
   If you touched the extension, detection or move input, also run `pnpm test:e2e` (see [docs/testing.md](docs/testing.md)).
5. Open a pull request and fill in the template.

## Project rules

These keep JevChess safe and honest (also listed as invariants in the [Architecture guide](docs/architecture-guide.md#6-the-safety-rules-invariants)):

- **Never expose credentials to the browser.** OpenRouter and Lichess tokens stay in the backend `.env`.
- **Never silently swap providers or models.** If a configured model fails, report the error. Never fall back to mock or another model.
- **Never invent chess state.** Missing castling rights, turn or history must pause play, not be guessed.
- **Verify input by observation.** A move is only successful once the board is seen to change.
- **No site-specific state shortcuts** (private game objects, hidden APIs) in the extension.
- **Label mocked results as mocked.** Don't report mock runs as live verification.
- Keep `prompt.md` (the original spec) intact.

## Good first contributions

- Support for more board UIs (promotion dialogs, piece sets, move-list formats)
- Docs, screenshots and translations
- More test fixtures for board detection
- Benchmark positions in `scripts/benchmark-positions.ts`

## Code style

TypeScript in strict mode, ES modules, Zod schemas in `packages/shared` for anything crossing a boundary.
Keep changes focused; match the surrounding code.

## Reporting bugs

Use the [bug report template](https://github.com/shihabalratul/Jev-chess/issues/new/choose).
If possible, attach the session folder `logs/<session-id>/`. Credentials are stripped from it, but take a quick look before sharing.

By contributing you agree your work is released under the [MIT License](LICENSE) and that you'll follow our [Code of Conduct](CODE_OF_CONDUCT.md).
