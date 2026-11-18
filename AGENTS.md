# JevChess agent guidance

The project specification is `prompt.md`; revised architecture and work tracking are in `docs/architecture.md` and `docs/implementation-plan.md`.
Use Luna (`gpt-6-luna`) only for really easy, repetitive delegated tasks. Use Sol (`gpt-6.1-sol`) for complex delegated tasks, as requested by the user. Keep architectural, cancellation, state integrity, and provider contract work in the main agent.

Use pnpm workspaces (the repository preference supersedes prompt.md's npm commands). Commands from repository root:
- `pnpm install`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm exec playwright install chromium`
- `pnpm test:e2e`

Never silently replace the configured providers, expose OpenRouter credentials to browsers, fabricate missing chess state, or report mocked checks as live-provider verification. Preserve prompt.md. No site-specific state shortcuts in the extension. Browser input must be verified from observed board changes.
