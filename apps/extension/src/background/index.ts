import { loadSettings } from '../settings';
import { IndexedDbStore, DurableOutbox } from '../logging/outbox';
import { logEventSchema } from '../../../../packages/shared/src';
import { z } from 'zod';
import { settingsSchema, defaults, rectSchema, delay, message } from '../../../../packages/shared/src';
import { cropCoordinates } from '../../../../packages/board-detection/src';
import { isExtensionControl, authorizeBackendPath } from './sender';
const jobs = new Map<string, {
    abort: AbortController;
    tabId?: number;
}>();
let lastCapture = 0;
let captureQueue = Promise.resolve();
const settings=loadSettings;
const inputSchema = z.object({ from: z.object({ x: z.number().finite(), y: z.number().finite() }), to: z.object({ x: z.number().finite(), y: z.number().finite() }), drag: z.boolean(), guardId:z.string().uuid(), jobId: z.string().max(100) });
async function debuggerInput(tabId: number, input: z.infer<typeof inputSchema>, signal: AbortSignal) {
    const target = { tabId };
    const has = await chrome.permissions.contains({ permissions: ['debugger'] });
    if (!has)
        throw new Error('Enable browser input permission from Settings');
    let attached = false,held=false;
    const detached = (source: chrome.debugger.Debuggee) => { if (source.tabId === tabId) {
        jobs.get(input.jobId)?.abort.abort();
    } };
    chrome.debugger.onDetach.addListener(detached);
    try {
        signal.throwIfAborted();
        await chrome.debugger.attach(target, '1.3');
        attached = true;
        const event = async (type: string, p: {
            x: number;
            y: number;
        }, pressed = false) => { signal.throwIfAborted();const check=await chrome.tabs.sendMessage(tabId,{type:'INPUT_CHECK',guardId:input.guardId},{frameId:0});signal.throwIfAborted();if(!check?.ok)throw new Error(check?.error??'Input checkpoint failed');if(type==='mousePressed')held=true;await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type, ...p, button: 'left', buttons: pressed ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });if(type==='mouseReleased')held=false; };
        await event('mouseMoved', input.from);
        await event('mousePressed', input.from, true);
        if (input.drag) {
            for (let i = 1; i <= 8; i++) {
                await event('mouseMoved', { x: input.from.x + (input.to.x - input.from.x) * i / 8, y: input.from.y + (input.to.y - input.from.y) * i / 8 }, true);
                await delay(16, signal);
            }
            await event('mouseReleased', input.to);
        }
        else {
            await event('mouseReleased', input.from);
            if (input.from.x !== input.to.x || input.from.y !== input.to.y) {
                await delay(50, signal);
                await event('mousePressed', input.to, true);
                await event('mouseReleased', input.to);
            }
        }
    }
    finally {
        chrome.debugger.onDetach.removeListener(detached);
        if (attached) {
            try { /* Release a held drag on abort; this is cleanup, not a new click. */
                if (held)
                    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...input.from, button: 'left', buttons: 0, clickCount: 0 });
                await chrome.debugger.detach(target);
            }
            catch { /* Tab navigation/user detach already cleaned it. */ }
        }
    }
}
const outbox = new DurableOutbox(new IndexedDbStore(),async (backendUrl,events)=>{
    const configured=await settings();
    if(configured.backendUrl!==backendUrl)throw new Error('Saved diagnostics await their original backend URL');
    const res=await fetch(new URL('/api/logs',backendUrl),{method:'POST',headers:{'Content-Type':'application/json',...(configured.backendToken?{'X-Jev-Token':configured.backendToken}:{})},body:JSON.stringify({events}),signal:AbortSignal.timeout(12000)});
    if(!res.ok)throw new Error(`Diagnostic backend HTTP ${res.status}`);
    return res.json();
});
let logTimer:ReturnType<typeof setTimeout>|undefined;
function scheduleLogs(){if(logTimer)return;logTimer=setTimeout(()=>{logTimer=undefined;void outbox.flush().catch(()=>{});},1000);}
void outbox.flush().catch(()=>{});
async function handle(raw: any, sender: chrome.runtime.MessageSender) {
    if (sender.id !== chrome.runtime.id)
        throw new Error('Invalid sender');
    if(raw.type==='LOG_STATUS')return {ok:true,data:outbox.status};
    if(raw.type==='LOG'){
        const event=logEventSchema.parse(raw.event);const configured=await settings();
        await outbox.enqueue({event,backendUrl:configured.backendUrl});scheduleLogs();
        return {ok:true,data:{...outbox.status,sessionId:event.sessionId,path:`${outbox.status.logRoot??'logs'}/${event.sessionId}/`}};
    }
    if (raw.type === 'CANCEL') {
        for (const [key, job] of jobs)
            if ((raw.jobId && key === raw.jobId) || (!raw.jobId && job.tabId === sender.tab?.id)) {
                job.abort.abort(new DOMException('Stopped', 'AbortError'));
                jobs.delete(key);
            }
        return { ok: true };
    }
    if (raw.type === 'ATTACH') {
        if (!isExtensionControl(sender, chrome.runtime.id))
            throw new Error('Only extension controls may attach');
        const id = z.number().int().positive().parse(raw.tabId);
        await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] });
        return { ok: true };
    }
    if (raw.type === 'OPEN_PANEL') {
        if (!isExtensionControl(sender, chrome.runtime.id))
            throw new Error('Only extension controls may open panel');
        await chrome.sidePanel.open({ tabId: z.number().int().positive().parse(raw.tabId) });
        return { ok: true };
    }
    const jobId = z.string().min(1).max(100).parse(raw.jobId);
    if (jobs.has(jobId))
        throw new Error('Duplicate background job');
    const abort = new AbortController();
    jobs.set(jobId, { abort, tabId: sender.tab?.id });
    try {
        if (raw.type === 'API') {
            const s = await settings();
            const path = authorizeBackendPath(raw.path,sender,chrome.runtime.id);
            const timeout = AbortSignal.timeout(28000);
            const res = await fetch(new URL(path, s.backendUrl), { method: path === '/health' ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(s.backendToken ? { 'X-Jev-Token': s.backendToken } : {}), ...(typeof raw.sessionId==='string'?{'X-Jev-Session':z.string().uuid().parse(raw.sessionId)}:{}), ...(typeof raw.turnId==='string'?{'X-Jev-Turn':z.string().max(100).parse(raw.turnId)}:{}) }, body: path === '/health' ? undefined : JSON.stringify(raw.body), signal: AbortSignal.any([abort.signal, timeout]) });
            const data = await res.json();
            if (!res.ok)
                throw new Error(data.error ?? `Backend HTTP ${res.status}`);
            return { ok: true, data };
        }
        if (!sender.tab?.id || sender.frameId !== 0)
            throw new Error('Operation requires top-level board tab');
        const tabId = sender.tab.id;
        if (raw.type === 'INPUT') {
            const s = await settings();
            const url = new URL(sender.tab.url!);
            if (!s.authorizedOrigins.includes(url.origin))
                throw new Error('Website not authorized for input');
            const input = inputSchema.parse(raw);
            await debuggerInput(tabId, input, abort.signal);
            return { ok: true };
        }
        if (raw.type === 'CAPTURE') {
            const rect = rectSchema.parse(raw.rect);
            const viewport = z.object({ width: z.number().positive(), height: z.number().positive() }).parse(raw.viewport);
            let release!: () => void;
            const prev = captureQueue;
            captureQueue = new Promise<void>(r => { release = r; });
            await prev;
            try {
                abort.signal.throwIfAborted();
                await delay(Math.max(0, 600 - (Date.now() - lastCapture)), abort.signal);
                const active = (await chrome.tabs.query({ active: true, windowId: sender.tab.windowId }))[0];
                if (active?.id !== tabId)
                    throw new Error('Keep the chessboard tab active during screenshots');
                const data = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
                lastCapture = Date.now();
                abort.signal.throwIfAborted();
                const bitmap = await createImageBitmap(await (await fetch(data)).blob());
                const r = cropCoordinates(rect, viewport, bitmap.width, bitmap.height);
                const canvas = new OffscreenCanvas(r.width, r.height);
                const ctx = canvas.getContext('2d');
                if (!ctx)
                    throw new Error('Screenshot canvas unavailable');
                ctx.drawImage(bitmap, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
                const masks=z.array(rectSchema).max(256).parse(raw.redactions??[]);
                ctx.fillStyle='#111111';
                for(const mask of masks)ctx.fillRect(Math.floor((mask.x-rect.x)*r.width/rect.width)-2,Math.floor((mask.y-rect.y)*r.height/rect.height)-2,Math.ceil(mask.width*r.width/rect.width)+4,Math.ceil(mask.height*r.height/rect.height)+4);
                bitmap.close();
                const blob = await canvas.convertToBlob({ type: 'image/png' });
                const bytes = new Uint8Array(await blob.arrayBuffer());
                let binary = '';
                for (const byte of bytes)
                    binary += String.fromCharCode(byte);
                return { ok: true, data: 'data:image/png;base64,' + btoa(binary) };
            }
            finally {
                release();
            }
        }
        throw new Error('Unknown background operation');
    }
    finally {
        jobs.delete(jobId);
    }
}
chrome.runtime.onMessage.addListener((raw, sender, reply) => { if (!['API', 'CAPTURE', 'INPUT', 'CANCEL', 'ATTACH', 'OPEN_PANEL', 'LOG', 'LOG_STATUS'].includes(raw?.type))
    return; void handle(raw, sender).then(reply).catch(e => reply({ ok: false, error: message(e) })); return true; });
chrome.tabs.onRemoved.addListener(tabId => { for (const [key, j] of jobs)
    if (j.tabId === tabId) {
        j.abort.abort();
        jobs.delete(key);
    } });
chrome.tabs.onUpdated.addListener((tabId, change) => { if (change.status === 'loading')
    for (const [key, j] of jobs)
        if (j.tabId === tabId) {
            j.abort.abort();
            jobs.delete(key);
        } });

chrome.alarms.create('jev-log-flush',{periodInMinutes:1});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='jev-log-flush')void outbox.flush().catch(()=>{});});
