// @vitest-environment jsdom
import { it,expect,vi } from 'vitest';
import { act,createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../apps/extension/src/popup/App';
import { LichessPanel } from '../apps/extension/src/popup/LichessPanel';
import { defaults } from '../packages/shared/src';
it('hydrates saved connection settings before initializing a persisted Lichess panel',async()=>{
    let release!:(settings:unknown)=>void;const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    vi.stubGlobal('chrome',{storage:{local:{get:async(key:unknown)=>key==='playMode'?{playMode:'lichess'}:new Promise(r=>{release=r;}),set:async()=>{}}},runtime:{sendMessage:async()=>({ok:false,error:'Backend offline'}),onMessage:{addListener(){},removeListener(){}}}});
    try{
        await act(async()=>{root.render(createElement(App));});
        await act(async()=>{release({settings:{...defaults,backendUrl:'http://127.0.0.1:3999',backendToken:'saved-pairing',playingColor:'black'}});});
        await act(async()=>{(node.querySelector('button[aria-label="Connection settings"]') as HTMLButtonElement).click();});
        expect((node.querySelector('input') as HTMLInputElement).value).toBe('http://127.0.0.1:3999');
        expect((node.querySelector('input[type=password]') as HTMLInputElement).value).toBe('saved-pairing');
    }finally{await act(async()=>root.unmount());node.remove();vi.unstubAllGlobals();}
});
it('stops a pending Start before switching back to browser mode',async()=>{
    const node=document.createElement('div');document.body.append(node);const root=createRoot(node);const commands:string[]=[];let release!:(r:unknown)=>void;const onBrowser=vi.fn();
    const view={configured:true,connected:true,running:false,games:[{id:'abcdefgh'}],challenges:[],game:{id:'abcdefgh',opponent:'Other',color:'black',fen:'',moves:[],status:'started',wtime:300000,btime:300000,connected:true},sessionId:'test-session',logLocation:'/test/logs',providerMode:'mock'};
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('chrome',{runtime:{sendMessage:async(msg:{path:string})=>{const command=msg.path.split('/').at(-1)!;commands.push(command);if(command==='start')return new Promise(r=>{release=r;});return {ok:true,data:view};}}});
    try{
        await act(async()=>root.render(createElement(LichessPanel,{settings:defaults,onSave:async()=>{},onBrowser})));
        await act(async()=>{([...node.querySelectorAll('button')].find(b=>b.textContent==='Start Jev')!).click();});
        await act(async()=>{([...node.querySelectorAll('button')].find(b=>b.textContent==='Browser board')!).click();});
        expect(commands).toContain('stop');expect(onBrowser).toHaveBeenCalledOnce();
    }finally{if(release)await act(async()=>release({ok:true,data:view}));await act(async()=>root.unmount());node.remove();vi.unstubAllGlobals();}
});
