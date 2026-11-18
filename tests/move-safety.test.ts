// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { DEFAULT_POSITION } from 'chess.js';
import { MoveExecutor } from '../apps/extension/src/execution/MoveExecutor';
import { piecesFromFen } from '../packages/chess-core/src';
import { defaults } from '../packages/shared/src';
it('does not click an obstruction that appears while the input intent is being persisted',async()=>{
    vi.stubGlobal('PointerEvent',MouseEvent);
    document.body.innerHTML='<section data-chessboard>'+piecesFromFen(DEFAULT_POSITION).map(p=>`<div data-piece="${p.piece}" data-square="${p.square}"></div>`).join('')+'</section>';
    const board=document.querySelector('section')!,rect={x:0,y:0,width:400,height:400};board.getBoundingClientRect=()=>rect as DOMRect;
    document.elementFromPoint=()=>board;let overlayClicks=0;
    const executor=new MoveExecutor(()=>rect,()=>defaults,{board:()=>board,fen:()=>DEFAULT_POSITION,record:async event=>{if(event!=='input.move_intent')return;const button=document.createElement('button');button.textContent='Unrelated action';button.onclick=()=>overlayClicks++;document.body.append(button);document.elementFromPoint=()=>button;}});
    await expect(executor.execute('e2e4','white',new AbortController().signal)).rejects.toThrow(/obstruct|target/i);
    expect(overlayClicks).toBe(0);
});
it('uses the mandatory observation checkpoint after obstruction recovery on a Canvas board',async()=>{
    vi.stubGlobal('PointerEvent',MouseEvent);document.body.innerHTML='<canvas data-chessboard></canvas><div role="dialog"><button>Close</button></div>';
    const board=document.querySelector('canvas')!,button=document.querySelector('button')!,rect={x:0,y:0,width:400,height:400};board.getBoundingClientRect=()=>rect as DOMRect;let obstructed=true,checkpoints=0,clicks=0;
    document.elementFromPoint=()=>obstructed?button:board;board.onclick=()=>clicks++;
    const executor=new MoveExecutor(()=>rect,()=>defaults,{board:()=>board,fen:()=>DEFAULT_POSITION,recover:async()=>{obstructed=false;button.parentElement!.remove();}});
    await executor.execute('e2e4','white',new AbortController().signal,async()=>{checkpoints++;});
    expect(checkpoints).toBe(1);expect(clicks).toBe(2);
});
it('rejects a board flip while the input intent is being persisted',async()=>{
    vi.stubGlobal('PointerEvent',MouseEvent);document.body.innerHTML='<section data-chessboard data-orientation="white">'+piecesFromFen(DEFAULT_POSITION).map(p=>`<div data-piece="${p.piece}" data-square="${p.square}"></div>`).join('')+'</section>';
    const board=document.querySelector('section')!,rect={x:0,y:0,width:400,height:400};board.getBoundingClientRect=()=>rect as DOMRect;document.elementFromPoint=()=>board;let clicks=0;board.onclick=()=>clicks++;
    const executor=new MoveExecutor(()=>rect,()=>defaults,{board:()=>board,fen:()=>DEFAULT_POSITION,record:async event=>{if(event==='input.move_intent')board.setAttribute('data-orientation','black');}});
    await expect(executor.execute('e2e4','white',new AbortController().signal)).rejects.toThrow(/orientation|flipped/i);expect(clicks).toBe(0);
});
it('rejects resized geometry between source and destination clicks',async()=>{
    vi.stubGlobal('PointerEvent',MouseEvent);document.body.innerHTML='<section data-chessboard></section>';const board=document.querySelector('section')!;let rect={x:0,y:0,width:400,height:400},clicks=0;board.getBoundingClientRect=()=>rect as DOMRect;document.elementFromPoint=()=>board;
    board.onclick=()=>{clicks++;rect={...rect,width:450,height:450};};
    const executor=new MoveExecutor(()=>rect,()=>defaults,{board:()=>board});
    await expect(executor.execute('e2e4','white',new AbortController().signal)).rejects.toThrow(/geometry|resize/i);expect(clicks).toBe(1);
});
