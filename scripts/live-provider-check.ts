import { randomUUID } from 'node:crypto';
import { SessionJournal, auditContext, audit } from '../apps/server/src/services/journal';
import 'dotenv/config';
import { OpenRouterProvider } from '../apps/server/src/providers/openrouter';
import { ChessStateManager, piecesFromFen, placementFromPieces } from '../packages/chess-core/src';
import { DEFAULT_POSITION } from 'chess.js';
if (!process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY required. No live provider request was made.');
    process.exit(1);
}
const vision = process.env.VISION_MODEL ?? process.env.CLAUDE_MODEL ?? 'openai/gpt-6-luna';
const jev = process.env.JEV_MODEL ?? 'typesafe/jev-1.13';
console.log(`Paid live check: Vision ${vision}; Jev ${jev}. No model fallback.`);
const sessionId=randomUUID();
auditContext.enterWith({journal:new SessionJournal(undefined,[process.env.OPENROUTER_API_KEY]),sessionId,requestId:randomUUID(),sequence:0,started:performance.now()});
await audit('live_check.start',{vision,jev});
console.log('Diagnostic session: '+sessionId);
const provider = new OpenRouterProvider({ apiKey: process.env.OPENROUTER_API_KEY, visionModel: vision, jevModel: jev, timeoutMs: 20000, retries: 0 });
const dom = JSON.stringify({ board: { x: 0, y: 0, width: 480, height: 480 }, elements: piecesFromFen(DEFAULT_POSITION).map(p => ({ tag: 'div', attributes: { 'data-piece': p.piece, 'data-square': p.square } })) });
const observation = await provider.parse({ dom, orientation: 'white' });
if (observation.uncertainSquares.length || placementFromPieces(observation.pieces) !== DEFAULT_POSITION.split(' ')[0])
    throw new Error('Live Vision placement did not match supplied board fixture');
const state = new ChessStateManager();
state.observe(observation, DEFAULT_POSITION);
const decision = await provider.choose(state.decisionInput('white'));
state.apply(decision.uci);
console.log(JSON.stringify({ visionRecognitionVerified: true, jevDecisionVerified: true, decision, resultingFen: state.fen }, null, 2));
console.log('This checks live provider contracts, not browser execution or chess strength.');
