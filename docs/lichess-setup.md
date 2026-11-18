# Lichess bot setup

Run **Jev** as a real bot on [Lichess](https://lichess.org) through the official
[Bot API](https://lichess.org/api#tag/Bot). This is the cleanest way to test Jev: Lichess sends the exact position and
clock, Jev picks every move, and Lichess confirms each one. **Luna isn't needed** here, because there's no screen to read.

> **In one sentence:** make a separate BOT account, give the backend a `bot:play` token, connect from the extension's
> Lichess panel, accept a challenge, and press **Start Jev**.

---

## Before you start

- [ ] JevChess runs locally in **live** mode with an OpenRouter key ([Getting started](getting-started.md)). Mock mode can't play on Lichess.
- [ ] A **new, separate Lichess account** for the bot. Never use your normal account: upgrading to BOT is **permanent**.
- [ ] About 10 minutes.

---

## Setup, step by step

### 1. Create the bot account
[Sign up](https://lichess.org/signup) for a fresh account and finish its verification yourself.
⚠️ **Don't play any games on it**: only accounts with zero games can become bots.

### 2. Create a token
While signed in to the bot account, [create a personal API token](https://lichess.org/account/oauth/token) with **only**
the **Play games with the bot API (`bot:play`)** scope.

Put it straight into the backend's `.env`:

```env
LICHESS_TOKEN=lip_xxxxxxxxxxxx
```

🔒 Never paste this token into chat, the extension's settings, source files, screenshots or issues.

### 3. Configure the backend

```env
PROVIDER_MODE=live
OPENROUTER_API_KEY=...        # keep your existing key
JEV_MODEL=typesafe/jev-1.13   # keep your existing model
BACKEND_TOKEN=<a long random string>
```

`BACKEND_TOKEN` is a **pairing token** between the extension and your backend. It isn't the Lichess token.
Copy it into the extension's **Settings → Pairing token**. Lichess controls won't work without it.

### 4. Upgrade the account to BOT (one time, irreversible)

JevChess never upgrades accounts on its own. You run this yourself, from the repository root:

```sh
pnpm lichess:account                                   # 1. check which account the token belongs to
pnpm lichess:account --upgrade YOUR_BOT_ACCOUNT_NAME   # 2. upgrade it (asks you to type a confirmation)
pnpm lichess:account                                   # 3. check it now has the BOT title
```

Step 2 checks the username and the zero-games rule, explains what conversion means, and asks for an explicit
confirmation. If you get a missing-scope or eligibility error, fix the token or account. **Don't** switch to your
personal account.

### 5. Connect
Restart the backend (`pnpm dev:server`) and reload the extension from `apps/extension/dist`.
Open JevChess → **Lichess BOT** → **Connect BOT account**.

---

## Playing a game

1. **Get a challenge.** From another account (or a consenting friend), challenge the bot to a **standard game with a clock**.
2. **Accept it** in the Lichess panel. The panel shows whether it's rated or casual before you accept.
3. **Select** the game and press **Start Jev** promptly, because Lichess has a first-move deadline.

Connecting and accepting **don't** start Jev on their own. You can also select a game that's already in progress
if the event stream reports it.

**Recommended time control: 10+5 or slower.** Jev's thinking time depends on the clock:

| Time Jev can spend on this turn | Depth | Stages |
|---|---|---|
| 30 s or more | full | all six |
| 10–30 s | reduced | assess → nominate → shortlist → choose |
| under 10 s | quick | one choose |

A single decision can take up to 45 s. Challenges shorter than `LICHESS_MIN_CLOCK_SECONDS` (default **300**,
counting *base + 40 × increment*) are refused automatically.

---

## The Lichess panel

| You'll see | Meaning |
|---|---|
| Position, move list, clocks | The authoritative state from Lichess (clocks as of the latest update) |
| Jev stage / intent / move | What Jev is doing right now |
| Playing as | Worked out from your account's player ID, never from board orientation |
| Connection, diagnostic session | Stream health and the log session ID |

| Control | What it does |
|---|---|
| **Start Jev** | Jev plays the selected game |
| **Stop Jev** | Cancels pending decisions and queued moves. It can't take back a move already sent. |
| **Disconnect** | Closes the Lichess connection |

⚠️ Play runs in the **backend**, so **closing the popup doesn't stop Jev**. Use **Stop Jev** or **Disconnect**.

---

## If something goes wrong

| Situation | What JevChess does | What you do |
|---|---|---|
| The game stream drops | Pauses play | After it reconnects and Lichess sends a fresh full position, press **Start Jev** again |
| The account stream drops | Pauses | Select the game again once it reappears |
| A move was sent but no reply came back | **Never** blindly resends. The intent is saved to disk and checked against Lichess's full move list, even after a backend restart. | If it still can't be confirmed, leave play paused and look at the session logs |
| Another bot client uses the same token | Lichess allows only one event stream per account | Run only one client per token |

JevChess never restarts on its own, never auto-accepts challenges, and never guesses a replacement move.

**Logs:** `logs/<session-id>/` (change it with `LOG_DIR`). Moves in flight are checkpointed in
`logs/lichess-intents/`. **Don't delete those files to "unstick" a move**, because that could make it repeat.
Credentials, auth headers and unrelated chat are never logged.

---

## What it does and doesn't do

| ✅ Supported | ❌ Not supported (by design) |
|---|---|
| Standard chess with a clock | Variants (not played) |
| Challenges you accept by hand | Seeking opponents, auto-accepting, pools, tournaments |
| One selected game at a time | Offering draws, accepting takebacks, resigning |
| | Upgrading accounts at runtime |

🚫 **Never** use browser mode to automate the Lichess website itself. The Bot API is the allowed way.
Read Lichess's [fair play](https://lichess.org/page/fair-play) and [API usage](https://lichess.org/page/api-tips) guidance.

---

## Stats and reports

The backend journals a summary of every decision and every finished game. These commands read your local
`logs/` only, so they're **free and offline**:

```sh
pnpm lichess:stats            # totals across all journaled Lichess decisions
pnpm lichess:report [--json]  # per game: result, cost, depth mix, blunder checks, material dropped
```

---

## Verification status

**Live play is verified.** On 2026-11-18 Jev played six casual 10+5 games on a BOT account against Lichess's
built-in AI, levels 1–6. The games were started outside JevChess and selected in the panel. All **176 moves were
submitted and confirmed** by Lichess with no stalls, retries or clock trouble. Jev **won against levels 1 and 2** and
lost to levels 3–6. Per-game results, and the earlier 1.3 integration evidence, are in
[verification.md](verification.md#lichess-play-against-lichess-ai-2026-11-18).
