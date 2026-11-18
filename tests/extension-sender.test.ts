import { expect, it } from 'vitest';
import { isExtensionControl, authorizeBackendPath } from '../apps/extension/src/background/sender';
const id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
it('allows toolbar and side-panel controls including a standalone extension tab', () => {
    expect(isExtensionControl({ id, url: `chrome-extension://${id}/popup.html` }, id)).toBe(true);
    expect(isExtensionControl({ id, url: `chrome-extension://${id}/sidepanel.html?view=board`, tab: { id: 1 } as chrome.tabs.Tab }, id)).toBe(true);
});
it('rejects content scripts, spoofed extension URLs and unrelated extension documents', () => {
    for (const url of ['https://www.chess.com/analysis', `https://example.com/chrome-extension://${id}/popup.html`, `chrome-extension://${id}/other.html`, `chrome-extension://${id}/popup.html/extra`])
        expect(isExtensionControl({ id, url }, id)).toBe(false);
    expect(isExtensionControl({ id: 'other', url: `chrome-extension://${id}/popup.html` }, id)).toBe(false);
    expect(isExtensionControl({ id }, id)).toBe(false);
});
it('reserves Lichess controls for extension UI and rejects arbitrary backend routes',()=>{
    const page={id,url:'https://lichess.org/abcdefgh'};
    expect(()=>authorizeBackendPath('/api/lichess/start',page,id)).toThrow();
    expect(authorizeBackendPath('/api/lichess/stop',{id,url:`chrome-extension://${id}/popup.html`},id)).toBe('/api/lichess/stop');
    expect(authorizeBackendPath('/api/choose-move',page,id)).toBe('/api/choose-move');
    expect(()=>authorizeBackendPath('https://attacker.invalid',page,id)).toThrow();
});
