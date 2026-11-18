// @vitest-environment jsdom
import { beforeEach, it, expect, vi } from 'vitest';
import { parseGeneric, parseRule, extractDom, domTransitionReason, formRedactions } from '../packages/board-detection/src';
import { collectRecoveryTargets, validateRecoveryAction, UiRecovery } from '../apps/extension/src/execution/recovery';
vi.mock('../apps/extension/src/content/bridge',()=>({background:async()=> 'data:image/png;base64,YQ=='}));
import { readFileSync } from 'node:fs';
beforeEach(()=>{
    document.body.innerHTML='<section data-chessboard data-orientation="white"><div data-piece="K" data-square="e1"></div><div data-piece="k" data-square="e8"></div></section>';
    for(const node of document.querySelectorAll('*'))node.getBoundingClientRect=()=>({x:0,y:0,width:400,height:400} as DOMRect);
});
it('excludes promotion alternatives and hidden pieces consistently from all readers',()=>{
    const board=document.querySelector('section')!;
    board.insertAdjacentHTML('beforeend','<div role="dialog" aria-label="Promote pawn"><button data-promotion="q" data-piece="Q" data-square="a8">Queen</button><button data-promotion="n" data-piece="N" data-square="a8">Knight</button></div><div hidden data-piece="q" data-square="e1"></div>');
    for(const node of board.querySelectorAll('*'))node.getBoundingClientRect=()=>({x:0,y:0,width:0,height:0} as DOMRect);
    expect(parseGeneric(board,'white')!.pieces).toEqual([{piece:'K',square:'e1'},{piece:'k',square:'e8'}]);
    const rule={version:1,pieceSelector:'[data-piece]',pieceSource:'attribute',pieceAttribute:'data-piece',pieceMap:{K:'K',k:'k',Q:'Q',N:'N',q:'q'},squareSource:'attribute',squareAttribute:'data-square',squareFormat:'algebraic',orientation:'white'};
    expect(parseRule(board,rule as any).pieces).toHaveLength(2);
    expect(extractDom(board)).not.toContain('"data-piece":"Q"');
    expect(domTransitionReason(board,'white')).toMatch(/promotion/i);
});
it('binds promotion targets to the board picker and refuses wrong pieces, settings and detached targets',()=>{
    const board=document.querySelector('section')!;
    board.insertAdjacentHTML('beforeend','<div role="dialog" aria-label="Promotion"><button data-promotion="n">Knight</button><button data-promotion="q">Queen</button><button>Accept agreement</button></div>');
    for(const node of board.querySelectorAll('*'))node.getBoundingClientRect=()=>({x:10,y:10,width:50,height:50} as DOMRect);
    const targets=collectRecoveryTargets(board);
    const knight=targets.find(t=>t.evidence.piece==='n')!;
    expect(validateRecoveryAction({action:'selectPromotion',targetId:knight.evidence.id,reason:'requested knight'},targets,board,'n')).toBe(knight.element);
    expect(()=>validateRecoveryAction({action:'selectPromotion',targetId:knight.evidence.id,reason:'wrong'},targets,board,'q')).toThrow(/piece|promotion/i);
    expect(targets.some(t=>/agreement/.test(t.evidence.label))).toBe(false);
    knight.element.remove();
    expect(()=>validateRecoveryAction({action:'selectPromotion',targetId:knight.evidence.id,reason:'stale'},targets,board,'n')).toThrow(/changed|target/i);
});
it('does not treat Claude claiming finished as independent proof of game over',()=>{
    const board=document.querySelector('section')!;
    expect(()=>validateRecoveryAction({action:'finished',reason:'looks over'},[],board)).toThrow(/finished|terminal|verified/i);
});
it('recognizes the actual recorded Chess.com promotion icons without explicit button labels',()=>{
    const fixture=JSON.parse(readFileSync('tests/fixtures/chesscom-promotion-dom.json','utf8'));
    document.body.innerHTML=fixture.board;
    const board=document.querySelector('wc-chess-board')!;
    board.getBoundingClientRect=()=>fixture.boardRect;
    for(const entry of fixture.rects)document.querySelector(entry.selector)!.getBoundingClientRect=()=>entry;
    const targets=collectRecoveryTargets(board);
    expect(targets.map(t=>t.evidence.piece).sort()).toEqual(['b','n','q','r']);
    expect(domTransitionReason(board,'white')).toMatch(/promotion/i);
    const knight=targets.find(t=>t.evidence.piece==='n')!;
    expect(validateRecoveryAction({action:'selectPromotion',targetId:knight.evidence.id,reason:'Jev requested knight'},targets,board,'n')).toBe(document.querySelector('.promotion-piece.wn'));
});
it('rejects a promotion target whose piece changed after the evidence was captured',()=>{
    const board=document.querySelector('section')!;
    board.insertAdjacentHTML('beforeend','<div role="dialog" aria-label="Promotion"><button data-promotion="n">Knight</button></div>');
    for(const e of board.querySelectorAll('*'))e.getBoundingClientRect=()=>({x:20,y:20,width:30,height:30} as DOMRect);
    const targets=collectRecoveryTargets(board);const target=targets[0];target.element.setAttribute('data-promotion','q');
    expect(()=>validateRecoveryAction({action:'selectPromotion',targetId:target.evidence.id,reason:'stale'},targets,board,'n')).toThrow(/changed|piece/i);
});
it('cancels visual recovery before input even if the model finishes late',async()=>{
    const board=document.querySelector('section')!;
    board.insertAdjacentHTML('afterend','<div role="dialog"><button>Close</button></div>');
    for(const e of document.querySelectorAll('div[role],button'))e.getBoundingClientRect=()=>({x:20,y:20,width:50,height:50} as DOMRect);
    let finish!:(value:any)=>void,started!:()=>void,clicks=0;
    const ready=new Promise<void>(r=>{started=r;});
    const recovery=new UiRecovery(()=>board,()=>({x:0,y:0,width:400,height:400}),async()=>{clicks++;},async()=>{},async()=>{started();return new Promise(r=>{finish=r;});});
    const abort=new AbortController(),pending=recovery.recover('obstructed',abort.signal);
    await ready;abort.abort();finish({action:'dismiss',targetId:'target-0',reason:'close'});
    await expect(pending).rejects.toThrow();expect(clicks).toBe(0);
});
it('masks visible form fields in screenshot evidence without reading their values',()=>{
    document.body.insertAdjacentHTML('beforeend','<input type="password" value="never-record-this"><textarea>private</textarea><input hidden value="hidden">');
    for(const e of document.querySelectorAll('input,textarea'))e.getBoundingClientRect=()=>({x:10,y:10,width:80,height:20} as DOMRect);
    const masks=formRedactions({x:0,y:0,width:400,height:400});
    expect(masks).toHaveLength(2);expect(JSON.stringify(masks)).not.toContain('never-record-this');
});
it('allows a close control outside the board when its own dialog obstructs the board',()=>{
    const board=document.querySelector('section')!;
    const dialog=document.createElement('div');dialog.setAttribute('role','dialog');const close=document.createElement('button');close.textContent='Close';dialog.append(close);document.body.append(dialog);
    dialog.getBoundingClientRect=()=>({x:0,y:0,width:800,height:500} as DOMRect);close.getBoundingClientRect=()=>({x:700,y:20,width:60,height:30} as DOMRect);
    const targets=collectRecoveryTargets(board);expect(targets).toHaveLength(1);
    expect(validateRecoveryAction({action:'dismiss',targetId:targets[0].evidence.id,reason:'Close obstruction'},targets,board)).toBe(close);
});
it('refuses to capture evidence when too many form fields would escape masking',()=>{
    document.body.innerHTML=Array.from({length:257},()=>'<input>').join('');
    for(const e of document.querySelectorAll('input'))e.getBoundingClientRect=()=>({x:10,y:10,width:20,height:20} as DOMRect);
    expect(()=>formRedactions({x:0,y:0,width:400,height:400})).toThrow(/form|mask|limit/i);
});
it('rejects agreement action buttons and unidentified promotion choices',()=>{
    const board=document.querySelector('section')!;
    for(const [label,buttonText,action] of [['Account','Close account','dismiss'],['Terms of Service','Continue','dismiss'],['Terms of Service','Yes','dismiss'],['Promotion','Option A','selectPromotion']] as const){
        document.querySelectorAll('[role="dialog"]').forEach(e=>e.remove());
        const root=document.createElement('div');root.setAttribute('role','dialog');root.setAttribute('aria-label',label);root.innerHTML=`<button>${buttonText}</button>`;document.body.append(root);
        for(const e of [root,root.firstElementChild!])e.getBoundingClientRect=()=>({x:20,y:20,width:80,height:40} as DOMRect);
        const targets=collectRecoveryTargets(board);
        expect(()=>validateRecoveryAction({action,targetId:targets[0]?.evidence.id??'target-0',reason:'untrusted proposal'},targets,board,'n')).toThrow();
    }
});

it('holds recognition for actual recorded Chess.com moving-sprite geometry',()=>{
    const fixture=JSON.parse(readFileSync('tests/fixtures/chesscom-animation-dom.json','utf8'));
    expect(fixture.frames.length).toBeGreaterThan(0);
    for(const frame of fixture.frames){
        document.body.innerHTML='<wc-chess-board></wc-chess-board>';const board=document.querySelector('wc-chess-board')!;board.getBoundingClientRect=()=>frame.boardRect;
        for(const piece of frame.pieces){const node=document.createElement('div');node.className=piece.class;node.getBoundingClientRect=()=>piece.rect;board.append(node);}
        expect(domTransitionReason(board,'white')).toMatch(/geometry|overlap|square|moving/i);
    }
});
