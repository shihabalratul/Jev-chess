import { message } from '../../../../packages/shared/src';
const inputGuards=new Map<string,()=>void>();
export function validateInputGuard(id:string){const guard=inputGuards.get(id);if(!guard)throw new Error('Input transaction is no longer active');guard();}
export async function guardedInput(payload:Record<string,unknown>,guard:()=>void,signal:AbortSignal){
    const guardId=crypto.randomUUID();inputGuards.set(guardId,guard);
    try{guard();await background('INPUT',{...payload,guardId},signal);}
    finally{inputGuards.delete(guardId);}
}
const active = new Set<string>();
let requestContext:()=>Record<string,unknown>=()=>({});
export function setRequestContext(context:()=>Record<string,unknown>){requestContext=context;}
const metrics = { apiRequests: 0, screenshots: 0, totalApiLatencyMs: 0 };
export const getMetrics = () => ({ ...metrics });
export async function background<T>(type: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    const started = performance.now();
    if (type === 'API')
        metrics.apiRequests++;
    if (type === 'CAPTURE')
        metrics.screenshots++;
    const jobId = crypto.randomUUID();
    active.add(jobId);
    const cancel = () => { void chrome.runtime.sendMessage({ type: 'CANCEL', jobId }).catch(() => { }); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
        const response = await chrome.runtime.sendMessage({ type, ...requestContext(), ...payload, jobId });
        signal?.throwIfAborted();
        if (!response?.ok)
            throw new Error(response?.error ?? 'Extension service worker disconnected');
        return response.data as T;
    }
    catch (error) {
        throw new Error(message(error));
    }
    finally {
        if (type === 'API')
            metrics.totalApiLatencyMs += performance.now() - started;
        active.delete(jobId);
        signal?.removeEventListener('abort', cancel);
    }
}
export function cancelBackground() { for (const jobId of active)
    void chrome.runtime.sendMessage({ type: 'CANCEL', jobId }).catch(() => { }); active.clear(); }
