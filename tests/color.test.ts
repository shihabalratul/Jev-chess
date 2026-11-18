import { expect, it } from 'vitest';
import { defaults, migrateSettings } from '../packages/shared/src';
import { AutoPlayController } from '../apps/extension/src/controllers/AutoPlayController';
import { Chess } from 'chess.js';
import { piecesFromFen } from '../packages/chess-core/src';
it('defaults to Auto, explicitly migrates old White once, and preserves manual intent',()=>{
    expect(defaults.playingColor).toBe('auto');
    const old={...defaults,settingsVersion:undefined,playingColor:'white'};
    const migrated=migrateSettings(old);
    expect(migrated.playingColor).toBe('auto');expect(migrated.colorMigrationNotice).toBe(true);
    expect(migrateSettings(migrated)).toEqual(migrated);
    expect(migrateSettings({...old,playingColor:'black'}).playingColor).toBe('black');
    expect(migrateSettings({...defaults,playingColor:'white'}).playingColor).toBe('white');
});
it('chooses and executes Black from observed bottom side, and invalidates a choice on flip',async()=>{
    const game=new Chess();game.move('e4');let orientation:'white'|'black'='black',requests=0,inputs=0;
    const controller=new AutoPlayController({read:async()=>({observation:{pieces:piecesFromFen(game.fen()),orientation,sideToMove:null,castlingRights:null,enPassantSquare:null,uncertainSquares:[]},seedPgn:game.pgn(),recognition:'DOM'}),choose:async input=>{requests++;expect(input.playingColor).toBe('black');return {uci:'e7e5',model:'mock',source:'mock',latencyMs:0};},execute:async()=>{inputs++;game.move('e5');},onView:()=>{},cancel:()=>{}},{...defaults,authorizedOrigins:['https://example.com']},'https://example.com');
    await controller.ask();expect(requests).toBe(1);expect(controller.view.playingColor).toBe('black');
    orientation='white';await controller.play();expect(inputs).toBe(0);expect(controller.view.decision).toBeUndefined();
    orientation='black';await controller.ask();await controller.play();expect(inputs).toBe(1);expect(controller.view.error).toBeUndefined();
});
