// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { Chess } from 'chess.js';
import { MoveExecutor } from '../apps/extension/src/execution/MoveExecutor';
import { piecesFromFen } from '../packages/chess-core/src';
import { defaults } from '../packages/shared/src';
import { squareCenter } from '../packages/board-detection/src';
for(const capture of [false,true])for(const timing of ['click','mousedown'] as const)for(const color of ['w','b'] as const)for(const orientation of ['white','black'] as const)for(const promotion of ['q','r','b','n']){
    it(`executes ${color} ${promotion} promotion with ${orientation} orientation using the exact picker opened on ${timing}, capture=${capture}`,async()=>{
        vi.stubGlobal('PointerEvent',MouseEvent);
        const fen=color==='w'?(capture?'1r5k/P7/8/8/8/8/8/7K w - - 0 1':'7k/P7/8/8/8/8/8/7K w - - 0 1'):(capture?'7k/8/8/8/8/8/p7/1R5K b - - 0 1':'7k/8/8/8/8/8/p7/7K b - - 0 1'),game=new Chess(fen),uci=color==='w'?`a7${capture?'b':'a'}8${promotion}`:`a2${capture?'b':'a'}1${promotion}`;
        document.body.innerHTML='<section data-chessboard></section>';
        const board=document.querySelector('section')!,bounds={x:0,y:0,width:400,height:400};board.getBoundingClientRect=()=>bounds as DOMRect;
        const render=()=>{board.innerHTML=piecesFromFen(game.fen()).map(p=>`<div data-square="${p.square}" data-piece="${p.piece}"></div>`).join('');};render();
        let clicks=0;
        board.addEventListener(timing,event=>{if((event.target as Element).closest('[role=dialog]'))return;if(++clicks!==2)return;if(timing==='mousedown'){board.innerHTML=piecesFromFen(fen).filter(p=>p.square!==uci.slice(2,4)).map(p=>`<div data-square="${p.square===uci.slice(0,2)?uci.slice(2,4):p.square}" data-piece="${p.piece}"></div>`).join('');}const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Promotion');board.append(dialog);
            for(const [i,p]of ['q','r','b','n'].entries()){const button=document.createElement('button');button.className='piece '+color+p;button.textContent=({q:'Queen',r:'Rook',b:'Bishop',n:'Knight'} as Record<string,string>)[p];button.getBoundingClientRect=()=>({x:i*50,y:timing==='mousedown'?(color==='w'?0:350):410,width:40,height:40} as DOMRect);button.addEventListener(timing==='mousedown'?'mousedown':'click',e=>{e.stopPropagation();game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:p});render();if(timing==='mousedown'){board.append(dialog);dialog.style.display='none';}});dialog.append(button);}
            dialog.getBoundingClientRect=()=>({x:0,y:timing==='mousedown'?0:380,width:400,height:timing==='mousedown'?400:80} as DOMRect);
        });
        document.elementFromPoint=(x,y)=>{const dialog=board.querySelector('[role=dialog]');if(dialog&&timing==='mousedown'){const target=[...dialog.querySelectorAll('button')].find(b=>{const r=b.getBoundingClientRect();return x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height;});return target??dialog;}if(y>=410)return board.querySelectorAll('button')[Math.floor(x/50)]??board;return board;};
        const executor=new MoveExecutor(()=>bounds,()=>({...defaults,input:'click'}),{board:()=>board,fen:()=>fen});
        await executor.execute(uci,orientation,new AbortController().signal);
        expect(game.get(uci.slice(2,4) as import('chess.js').Square)?.type).toBe(promotion);
        expect(clicks).toBe(2);
    });
}

for(const requested of ['q','n'])it(`accepts automatic promotion only when it matches the requested ${requested}`,async()=>{
    vi.stubGlobal('PointerEvent',MouseEvent);
    const fen='7k/P7/8/8/8/8/8/7K w - - 0 1',game=new Chess(fen),r={x:0,y:0,width:400,height:400};
    document.body.innerHTML='<section data-chessboard></section>';const board=document.querySelector('section')!;board.getBoundingClientRect=()=>r as DOMRect;
    const render=()=>{board.innerHTML=piecesFromFen(game.fen()).map(p=>`<div data-square="${p.square}" data-piece="${p.piece}"></div>`).join('');};render();let clicks=0;
    board.onclick=()=>{if(++clicks===2){game.move({from:'a7',to:'a8',promotion:'q'});render();}};document.elementFromPoint=()=>board;
    const executor=new MoveExecutor(()=>r,()=>defaults,{board:()=>board,fen:()=>fen,recover:async()=>{throw new Error('Automatic promotion mismatch; paused');}});
    const action=executor.execute('a7a8'+requested,'white',new AbortController().signal);
    if(requested==='q')await expect(action).resolves.toBeUndefined();else await expect(action).rejects.toThrow(/mismatch/);
    expect(clicks).toBe(2);expect(game.get('a8')?.type).toBe('q');
});
