# Changelog

All notable changes to this project. Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Lichess analysis (1.4 work, version not yet bumped)
- **Clock-based depth** per turn: `full` (six stages), `reduced` (assess, nominate, shortlist, choose) or `quick` (one choose).
- **Tactical rule facts** for every candidate (mate-in-one replies, exposed pieces, largest capture) and an immediate-threats headline.
- **Blunder check:** a `verify` stage asks Jev to reconsider moves that allow mate in one or leave a piece worth 3+ exposed.
- **Decision cache** reusing Jev's own answers for repeated positions and examined lines.
- Challenges shorter than `LICHESS_MIN_CLOCK_SECONDS` are refused.
- `pnpm benchmark:puzzles`, `pnpm lichess:stats` and `pnpm lichess:report`.
- First live test series: six games against Lichess AI levels 1–6 (2 wins, 4 losses, 176/176 moves confirmed).

### Open source
- MIT license, new README and docs, contributing guide, issue/PR templates and CI.
- Hosted Board Lab on GitHub Pages with a replay of a real Jev game on Lichess.

## [1.3.0]

- **Lichess BOT mode** via the official Bot API: backend-only `bot:play` token, authoritative move history and color, manual challenge acceptance, separate extension controls.
- Saved execution checkpoints so an uncertain move is never blindly retried after a restart.
- `BACKEND_TOKEN` pairing required for Lichess controls.
- Lichess stats/report scripts.

## [1.2.0]

- Vision provider switched to a configurable `VISION_MODEL` (default `openai/gpt-6-luna`).
- Six-stage Jev decisions (previously four).
- Playing color defaults to **Auto (board bottom)**, with a safe settings migration.
- Chess.com bot-page startup through the public Share/Download export.

## [1.1.0]

- Staged Jev decisions with whole-board intent and opponent-reply forecasts.
- Stable-observation window and vision-based UI recovery (dismiss dialogs, promotions, redetect).
- Persistent session diagnostics: IndexedDB outbox → backend JSONL journal with artifacts.
- `pnpm benchmark:jev` controlled comparison.

## [1.0.0]

- Initial MV3 extension, Fastify backend and React Board Lab.
- DOM, Canvas and hybrid board recognition; click, drag and CDP input; verified moves.
