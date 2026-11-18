# Changelog

All notable changes to this project. Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

- Open-source release: MIT license, new README and docs, contributing guide, CI.

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
