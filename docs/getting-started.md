# Getting started

This guide takes you from a fresh clone to Jev playing a move on the local Board Lab.

## Requirements

- **Node.js 22.13+**
- **pnpm 10.11.0**: `corepack enable` sets it up automatically from `package.json`
- **Google Chrome or Chromium** (for the extension)
- *(Live mode only)* an [OpenRouter](https://openrouter.ai) API key with credits

## 1. Install

```sh
git clone https://github.com/shihabalratul/Jev-chess.git
cd Jev-chess
pnpm install
cp -n .env.example .env      # -n never overwrites an existing .env
```

## 2. Choose a mode

### Option A: free mock mode

Mock mode needs **no API key and makes no external requests**, so it costs nothing.

```sh
PROVIDER_MODE=mock pnpm dev:server
```

(or set `PROVIDER_MODE=mock` in `.env`). The backend's `/health` endpoint will report `"providerMode":"mock"`.

What mock mode does:

| Step | Live mode | Mock mode |
|---|---|---|
| Reading the board | Vision model (DOM or screenshot) | Reads `data-piece` / `data-square` attributes from the demo board's DOM |
| Choosing a move | Jev's staged decision (up to six stages) | Same staged pipeline, but every question takes its first option |
| Moving and verifying | Real | Real (the extension still clicks and verifies) |

So mock mode is great for **trying the extension, developing and running tests**, but:

- moves are deterministic placeholders, not real chess thinking;
- it can't recognise **Canvas** boards or real websites. Use the demo board with **DOM** rendering;
- **Lichess BOT mode is disabled** in mock mode.

Every mock response is labeled `mock`, and mock mode never switches on by itself when a live provider fails.

### Option B: live mode (real AI)

Put your key in `.env`:

```env
OPENROUTER_API_KEY=sk-or-...
VISION_MODEL=openai/gpt-6-luna
JEV_MODEL=typesafe/jev-1.13
PROVIDER_MODE=live
```

```sh
pnpm dev:server
```

Each decision makes several model calls (up to six Jev stages, plus vision when a screenshot is needed), so watch your OpenRouter usage. For reference, a whole casual 10+5 Lichess game cost about $0.01–0.10 in the first test series.
The key **only lives in the backend** and is never sent to the extension or any web page.

## 3. Start the Board Lab

In a second terminal:

```sh
pnpm dev:demo
```

Open **http://127.0.0.1:4173**. You can switch DOM/Canvas rendering, flip the board, load a FEN,
and turn on a simple mock opponent that plays Black.

## 4. Build and load the extension

```sh
pnpm build:extension      # or `pnpm build` for everything
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select `apps/extension/dist`.
3. Pin the JevChess icon to the toolbar.

> Prefer not to build? Download the zip from the [Releases page](https://github.com/shihabalratul/Jev-chess/releases), if one is attached, unzip it, and load that folder.

## 5. Play your first move

1. Go to the Board Lab tab and click the **JevChess** icon.
2. Open **Settings**: confirm the backend URL `http://127.0.0.1:3001`, playing color (Auto is fine) and input mode, then **Save Settings**.
3. Click **Detect Board** and check the preview/FEN.
4. Authorize move input for the site when asked.
5. Click **Ask Jev**, then **Play Move**. The move only counts once the board is seen to change.
6. Turn on the demo's mock opponent and press **Start Auto Play** to keep going.
   **Stop Auto Play** (or **Esc** in the board tab) cancels everything pending.

## Optional settings

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `3001` / `127.0.0.1` | Backend address. Keep it on loopback for local use. |
| `BACKEND_TOKEN` | *(empty)* | Optional pairing token entered in the extension's Settings. Required for Lichess controls. |
| `ALLOWED_EXTENSION_IDS` | bundled ID | Change it if you alter the manifest key or publish your own build. |
| `CORS_ORIGINS` | demo origins | Allowed web origins. |
| `LOG_DIR` | `./logs` | Where session diagnostics are written. |
| `API_TIMEOUT_MS` / `API_RETRIES` | `12000` / `1` | Provider timeouts and retries. |

## Next steps

- [Usage guide](usage.md): recognition modes, input modes, real websites, diagnostics
- [Lichess BOT setup](lichess-setup.md): play through the official Bot API
- [How it works](how-it-works.md)

## Troubleshooting

- **Extension can't reach the backend:** is `pnpm dev:server` running, and does the Settings URL match `PORT`?
- **"Detect Board" finds nothing in mock mode:** switch the demo to **DOM** rendering.
- **After updating the code:** rebuild, click **Reload** on `chrome://extensions`, refresh the chess tab and restart the backend.
- **Something failed mid-game:** zip the `logs/<session-id>/` folder and attach it to a [bug report](https://github.com/shihabalratul/Jev-chess/issues/new/choose). Credentials are never written to logs.
