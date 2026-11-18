import { z } from 'zod';
/** Chrome supplies sender identity; webpage content must never attach scripts. */
export function isExtensionControl(sender: chrome.runtime.MessageSender, extensionId: string): boolean {
    if (sender.id !== extensionId || !sender.url) return false;
    const documentUrl = sender.url.split(/[?#]/)[0];
    return ['popup.html', 'sidepanel.html'].some(path => documentUrl === `chrome-extension://${extensionId}/${path}`);
}
export function authorizeBackendPath(path:unknown,sender:chrome.runtime.MessageSender,extensionId:string){
    const parsed=z.enum(['/health','/api/parse-board','/api/discover-parser','/api/choose-move','/api/choose-move/step','/api/recover-ui','/api/lichess/status','/api/lichess/connect','/api/lichess/disconnect','/api/lichess/accept','/api/lichess/select','/api/lichess/start','/api/lichess/stop']).parse(path);
    if(parsed.startsWith('/api/lichess/')&&!isExtensionControl(sender,extensionId))throw new Error('Only extension controls may manage Lichess gameplay');
    return parsed;
}
