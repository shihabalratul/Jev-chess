# Usage guide: playing on boards in the browser

How to use the JevChess extension on a chessboard in a web page. New here? Do [Getting started](getting-started.md) first.
For the Lichess bot, see [Lichess bot setup](lichess-setup.md).

> **In one sentence:** the extension finds the board, Luna and chess.js work out the exact position, **Jev** picks a
> move, the extension plays it, and the move only counts once the board is seen to change.

---

## Quick workflow

1. Load the extension: `chrome://extensions` → **Developer mode** → **Load unpacked** → `apps/extension/dist`.
2. Open a tab with a chessboard and click the **JevChess** toolbar icon. (Clicking the icon is what gives the extension permission to read and capture that tab.)
3. Open **Settings**: check the backend URL (`http://127.0.0.1:3001`), playing colour, orientation and input mode, then **Save Settings**.
4. Click **Detect Board** (or **Select Board** to pick one by hand). Check the preview and the FEN, and allow move input for this website.
5. Click **Ask Jev**, then **Play Move**.
6. For continuous play, turn on the Board Lab's mock opponent and press **Start Auto Play**.

**To stop:** press **Stop Auto Play**, or **Esc** in the board tab. Pending decisions and further input are cancelled.
A move that has already been sent to the page can't be undone.

> 💡 The **side panel** has the same controls (popup → **Open side panel**). It stays open while you play.

---

## Settings

| Setting | Default | What it does |
|---|---|---|
| Backend URL | `http://127.0.0.1:3001` | Where the local backend runs. HTTPS hosts other than localhost ask for permission when you save. |
| Pairing token | *(empty)* | Optional. Must match `BACKEND_TOKEN` in the backend's `.env`. Required for Lichess controls. |
| Playing colour | **Auto (board bottom)** | Jev plays the side at the bottom of the board. Use White/Black for flipped or spectator boards. |
| Orientation | detected | If the board flips, any pending decision is discarded before input. Unknown orientation pauses. |
| Recognition | Automatic | How the board is read (see below). |
| Input mode | Click | How moves are made (see below). |
| Advanced position correction | *(off)* | An optional full FEN plus "fresh game" confirmation for pages that don't show enough history. |

<details>
<summary>Upgrading from an older version</summary>

Old settings that only said "White" are treated as **Auto**, with a notice in the panel and a diagnostic event.
Saving settings stores the new format; explicit manual choices are kept as they are.
</details>

---

## How the board is read

| Recognition mode | How it works | Costs |
|---|---|---|
| **Automatic** *(recommended)* | Tries, in order: saved rules for this page → generic DOM/geometry → Luna on a reduced copy of the HTML → Luna on a cropped screenshot | Only pays for Luna when the free methods fail |
| **DOM** | Reads squares and pieces from the page's HTML | Free |
| **Image** | Luna reads a cropped screenshot | One Luna call whenever the cropped image changes |
| **Hybrid** | Combines both | Varies |

- **`<canvas>` boards** have no readable HTML, so they always use screenshot recognition with Luna.
- Results are cached, so an unchanged board doesn't trigger another call.
- Learned page rules are simple declarative selectors. **No generated JavaScript is ever executed.**
- Keep the board tab **active and fully visible** when screenshots are used.

### Why the board alone isn't enough

A picture shows the pieces, but not **whose turn it is, castling rights, en passant or the move counters**. JevChess
never guesses these. It gets them from:

1. **A public FEN or PGN** on the page (for example Chess.com's *Share Game* export), or
2. **A complete visible move list**, replayed move by move with chess.js. Luna can help read it, but the whole list has to agree with the pieces on the board.
3. As a last resort, **Advanced position correction**: a full six-field seed FEN that must match the current pieces. After changing it: save settings, reset the session, detect again.

Partial or contradictory history **pauses** play. An imported FEN can't recreate earlier repetitions (only a full PGN can).

**Catching up:** if several moves happen between two looks at the board, a complete, legal move list that extends the
tracked game lets JevChess catch up automatically. Counters and repetition history are kept, and any old decision is
discarded first. Without that, an unexplained jump pauses play.

**Piece icons in move lists:** clearly labelled figurine icons (for example `♞f3`) are understood. Hidden, conflicting
or orphaned icons make the record count as incomplete.

---

## How moves are made

| Input mode | Mechanism | Verified on |
|---|---|---|
| **Click** *(default)* | Synthetic pointer events: click the source square, then the target square | Board Lab, Chess.com public analysis |
| **Drag** | Synthetic drag from source to target | Board Lab |
| **Browser click** | Real input through Chrome's debugger (CDP `Input.dispatchMouseEvent`) | Board Lab |
| **Browser drag** | Same, as a drag | Board Lab |

- Before input, JevChess re-checks that the position is still the one Jev decided on.
- After input it looks again. **A move only succeeds once the new position matches.**
- The browser modes ask for the optional **debugger** permission when selected. Opening DevTools on the tab can detach it.
- Some sites ignore synthetic events. Cross-origin frames and closed shadow DOM may not work yet.
- **There is no bypass of anti-cheat or site security.** Only automate boards you're allowed to control.

**Permissions the extension uses:** `activeTab`, `scripting`, `storage`, `sidePanel`, `alarms` (retrying log delivery)
and localhost access for the backend. `debugger` is optional and only requested for the browser input modes.

**Promotions:** JevChess clicks generic pickers that use `data-promotion="q|r|b|n"` or `aria-label="Promote to queen|rook|bishop|knight"`,
and the piece must match Jev's choice. Any other picker pauses with an error ([help wanted](https://github.com/shihabalratul/Jev-chess/issues/2)).

---

## When something gets in the way

If a popup or overlay blocks the board, **Luna** can help recover. It gets up to **3 attempts within 20 seconds**, and may:

- ✅ wait, dismiss a clearly identified **Close / Dismiss / Cancel / Skip** control, pick the promotion Jev already chose, or re-detect the board;
- ❌ never pick a different chess move, accept agreements, navigate away, or change account settings.

Anything it can't identify safely pauses play, with evidence saved. A model saying "the game is finished" isn't
taken as proof on its own.

---

## Chess.com notes

- **Public analysis boards:** click **Detect Board** with the default Click input. The extension reads the visible move
  list or the public *Share Game* FEN/PGN automatically. Close any open dialog first. Fresh and mid-game positions are verified.
- **Bot games:** the board's **Download** control opens the public share export. JevChess reads the read-only FEN/PGN,
  checks it against the pieces, and closes only the dialog it opened.
- **Signed-in games against people:** not verified, and see the [fair-play note](../README.md#-a-friendly-note-on-fair-play-from-someone-who-learned-the-hard-way). 🪦
- After updating the extension, click **Reload** in `chrome://extensions` and refresh the chess tab before detecting again.

---

## What Jev receives in browser mode

- A description that names every piece, colour and square, plus exact rule facts from chess.js (FEN stays the internal source of truth).
- The recent verified moves, including the opponent's last move.
- The **full six stages** every time: assess → forecast replies → nominate → shortlist → continue → choose. Jev's intent carries through every stage.
- Limits of 10 s per stage and 45 s per decision. A single legal move is labelled *forced*.

No engine evaluation, opening book or hardcoded strategy is involved. Clock-based depth and the blunder check are
currently Lichess-only ([issue #3](https://github.com/shihabalratul/Jev-chess/issues/3)). Details: [How it works](how-it-works.md).

---

## Diagnostics and logs

Every board tab you attach gets a **session ID** (shown in the debug panel).

| Where | What |
|---|---|
| Extension | Events go into a persistent **IndexedDB outbox** first, so a suspended worker or an offline backend doesn't lose them |
| Delivery | The background worker sends them to `POST /api/logs`, retrying on new events and every minute, and deletes them only once the backend confirms |
| Backend | Writes `logs/<session-id>/events.0001.jsonl` and onward (append-only, rotated at 20 MiB, never auto-deleted) plus `artifacts/` (screenshots, large text) |

- Change the folder with `LOG_DIR`. Logs are git-ignored and never included in the extension zip.
- Events include timestamps, observations, FEN and history evidence, Jev's stage results, sanitized model exchanges, input attempts and their verification, errors, Stop and navigation.
- **Removed from logs:** credentials, auth headers, pairing tokens and form values. Screenshots mask form fields.
- If diagnostics can't be saved locally, browser input **pauses**.
- Events stay tied to the backend URL they were recorded for. If you switch backends, older events wait for that backend.

**Reading logs:**
- An *input intent* without a verified outcome means **unconfirmed**, not a successful move.
- Retried deliveries can repeat an event, so deduplicate by event ID.
- A damaged last line after a crash is kept as evidence. Skip malformed lines rather than trusting them.

**Reporting a bug?** Zip the whole `logs/<session-id>/` folder and attach it to a
[bug report](https://github.com/shihabalratul/Jev-chess/issues/new/choose).

<details>
<summary>Technical: how the staged API works</summary>

The extension calls `POST /api/choose-move/step` once per stage. Each response includes a **proof** that ties Jev's
earlier answers to the exact validated request, so stages can't be mixed up between positions. Restarting the backend
invalidates an in-flight proof, so just ask for a fresh decision. `POST /api/choose-move` runs the same staged service in a single call.
</details>

---

## Providers

- `VISION_MODEL` (default `openai/gpt-6-luna`) is **Luna**. It receives text and image chat input with low reasoning
  effort. The old `CLAUDE_MODEL` name is still accepted, but only when `VISION_MODEL` isn't set.
- `JEV_MODEL` (default `typesafe/jev-1.13`) is **Jev**, which makes every chess choice.
- A failing provider is **never** swapped for another one, and mock mode never switches on by itself.

---

## Upgrading

After pulling new code: rebuild (`pnpm build`), reload the extension from `apps/extension/dist` (or a fresh
[release zip](https://github.com/shihabalratul/Jev-chess/releases)), refresh the chess tab, and restart the backend.

---

## Limits

- Signed-in Chess.com games, long autoplay sessions and arbitrary websites aren't verified. Playing strength is only roughly estimated ([verification log](verification.md)).
- Leaving or reloading the page ends the session. Detect the board again afterwards.
- Unsupported or uncertain situations stop with an error instead of guessing.
