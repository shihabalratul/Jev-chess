# Set up JevChess on Lichess

Use a separate dedicated BOT account. Keep your normal playing account separate.
Jev makes every strategic choice; API mode uses no chess engine. The optional Luna
vision model is not used in this mode.

1. [Create the dedicated Lichess account](https://lichess.org/signup) and complete
   its verification yourself. **Do not play any games on it before upgrading.**
2. Sign in to that account and [create a personal API token](https://lichess.org/account/oauth/token).
   Give it only the **Play games with the bot API (`bot:play`)** scope. Copy it
   directly into the backend's local `.env` as `LICHESS_TOKEN=...`. Never paste it
   into chat, extension settings, source files, screenshots or issues.
3. Set `PROVIDER_MODE=live`. Keep your existing `OPENROUTER_API_KEY` and `JEV_MODEL`.
   Set a strong random `BACKEND_TOKEN` and copy that *pairing token* into the
   extension's Settings. The Lichess token stays on the backend.
4. Upgrade the fresh account to BOT using the official API. **This cannot be
   reversed.** The runtime never upgrades accounts. From the repository root,
   with your token saved locally, run:

   ```sh
   pnpm lichess:account
   pnpm lichess:account --upgrade YOUR_DEDICATED_ACCOUNT_NAME
   ```

   The first command checks the authenticated identity. The second checks the
   username and zero-game requirement, explains conversion and asks you to type
   an explicit confirmation. Run it only for the dedicated account. Once upgraded,
   run the first command again and verify the BOT title. A missing scope or account
   eligibility error requires fixing the account/token, not using your human account.
5. Restart the backend (`pnpm dev:server`) and reload the unpacked extension from
   `apps/extension/dist`. Open JevChess, select **Lichess BOT**, then **Connect BOT account**.
6. Send a standard clock challenge to the BOT from another account, or have a
   consenting opponent challenge it. Accept that specific challenge in the panel.
   Select the resulting active game and press **Start Jev**. Prefer a casual
   **10+5 or slower** game for initial checks: six decision stages can take up to
   45 seconds, and Lichess also has a first-move deadline. Connecting and accepting
   do not start Jev automatically. Select and start promptly after acceptance.

You can also select a currently playing game that the event stream reports. Only
one selected game is controlled. Do not run another Bot API client for this token:
Lichess permits only one account event stream at a time.

## Controls and recovery

Color is derived from your authenticated account's player ID, never board orientation.
The panel shows the authoritative position, moves, clocks at the latest observation,
Jev stage/intent, selected move, connection and diagnostic session. **Stop Jev**
cancels decisions and queued submissions. It cannot undo a request already sent.
Closing the popup leaves backend play running; Stop or Disconnect explicitly.

On a stream failure, gameplay pauses. After reconnection the game stream must send
a fresh full position; press Start again. If the account stream disconnected, select
the game again after it reappears. No automatic restart or challenge acceptance occurs.
A move with a lost response is never blindly retried. Its intent remains saved
across backend restart and is reconciled against the authoritative full move list.
If the move cannot be confirmed, leave play paused and inspect the session logs.
The app does not guess another move or automatically clear an unresolved intent.

Logs default to `logs/<session-id>/`, configurable by `LOG_DIR`. Current interrupted
move checkpoints live in `LOG_DIR/lichess-intents/`; immutable intent/outcome evidence
stays in the session JSONL files. Do not delete checkpoints to make an uncertain move retry.
Credentials, authorization headers and unrelated chat are excluded.

The first release supports **standard chess with clocks**, incoming manually
accepted challenges and one selected game. It does not seek opponents, auto-accept,
join pools/tournaments, offer draws, accept takebacks, resign or upgrade accounts.
Rated/casual status is shown before you accept. Unsupported variants are not played.
Never use browser mode to automate the Lichess web interface.

Reference: [Bot API](https://lichess.org/api#tag/Bot),
[Fair Play](https://lichess.org/page/fair-play),
[API usage guidance](https://lichess.org/page/api-tips).

## Verification status

The integration passed 304 unit tests, typecheck/build and 16 local browser cases
(four external/paid opt-ins skipped). The panel was also verified at narrow popup
width. Mock Lichess streams and strategic responses are labeled separately from
real-provider and external-browser evidence.

The configured account `unc_s` has been verified as BOT, its token includes
`bot:play`, and the live account-event stream returned HTTP 200 and a keepalive.
The local backend is connected in live mode with autoplay stopped. No conversion
is needed for this account. No challenge was accepted and no live Lichess move
was submitted. Live gameplay and playing strength remain unverified; see
docs/verification.md for the precise evidence.
