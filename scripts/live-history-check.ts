import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Chess } from 'chess.js';
import { OpenRouterProvider } from '../apps/server/src/providers/openrouter';
import { ChessStateManager, placementFromPieces } from '../packages/chess-core/src';
import { corroboratePgn } from '../packages/board-detection/src';

if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY required; no request made');
const fixture = JSON.parse(await readFile('tests/fixtures/chesscom-analysis-dom.json', 'utf8')) as { board: string; moveList: string };
const context = JSON.stringify({ version: 1, sources: [{ index: 0, tag: 'wc-move-list', evidence: 'move-history', text: fixture.moveList.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(), truncated: false }], truncated: false });
const model = process.env.VISION_MODEL ?? process.env.CLAUDE_MODEL ?? 'openai/gpt-6-luna';
console.log(`Paid live history check: ${model}, one parse request, recorded public Chess.com analysis fixture.`);
const provider = new OpenRouterProvider({ apiKey: process.env.OPENROUTER_API_KEY, visionModel: model, jevModel: process.env.JEV_MODEL ?? 'typesafe/jev-1.13', timeoutMs: 20000, retries: 0 });
const observation = await provider.parse({ dom: fixture.board, gameContext: context, orientation: 'white' });
const expected = new Chess();
for (const san of ['e4', 'e5', 'Nf3']) expected.move(san);
if (observation.uncertainSquares.length || placementFromPieces(observation.pieces) !== expected.fen().split(' ')[0])
    throw new Error('Live Vision placement disagreed with the recorded board');
if (!observation.gamePgn || !corroboratePgn(observation.gamePgn, context))
    throw new Error('Live Vision history did not match the complete visible record');
const state = new ChessStateManager();
state.observe(observation, undefined, observation.gamePgn);
if (state.fen !== expected.fen()) throw new Error('Automatically recovered FEN disagreed with fixture history');
console.log(JSON.stringify({ visionModel: model, liveRecognitionVerified: true, liveHistoryVerified: true, automaticFen: state.fen, history: state.history }));
console.log('This is a live provider fixture check; it does not make moves on Chess.com.');
