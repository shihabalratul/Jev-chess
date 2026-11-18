import {expect,it,vi} from 'vitest';
import {loadSettings} from '../apps/extension/src/settings';
import {defaults} from '../packages/shared/src';
it('does not overwrite a newer saved backend or manual color while migrating legacy settings',async()=>{
    const saved={...defaults,playingColor:'white',backendUrl:'http://127.0.0.1:4001'};
    let current:any={settings:{...defaults,settingsVersion:undefined,playingColor:'white'}},writes=0;
    vi.stubGlobal('chrome',{storage:{local:{get:async()=>structuredClone(current),set:async(value:any)=>{if(writes++===0)current.settings=saved;Object.assign(current,value);}}}});
    try{const loaded=await loadSettings();expect(current.settings).toEqual(saved);expect(loaded.backendUrl).toBe(saved.backendUrl);expect(loaded.playingColor).toBe('white');}
    finally{vi.unstubAllGlobals();}
});
