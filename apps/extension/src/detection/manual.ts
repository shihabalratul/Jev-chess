import type { Rect } from '../../../../packages/shared/src';
export function manualSelect(signal?: AbortSignal): Promise<Rect> {
    return new Promise((resolve, reject) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:#0005;touch-action:none';
        const box = document.createElement('div');
        box.style.cssText = 'position:absolute;border:2px solid #5de4b9;background:#5de4b920;pointer-events:none';
        const label = document.createElement('div');
        label.textContent = 'Drag around the board · Esc to cancel';
        label.style.cssText = 'position:absolute;top:20px;left:20px;padding:12px;background:#121a25;color:white;font:16px sans-serif';
        overlay.append(box, label);
        document.documentElement.append(overlay);
        let start: {
            x: number;
            y: number;
        } | undefined;
        const cleanup = () => { overlay.remove(); document.removeEventListener('keydown', key); signal?.removeEventListener('abort', abort); };
        const abort = () => { cleanup(); reject(new Error('Board selection cancelled')); };
        const key = (e: KeyboardEvent) => { if (e.key === 'Escape')
            abort(); };
        document.addEventListener('keydown', key);
        signal?.addEventListener('abort', abort, { once: true });
        overlay.onpointerdown = e => { start = { x: e.clientX, y: e.clientY }; overlay.setPointerCapture(e.pointerId); };
        overlay.onpointermove = e => { if (!start)
            return; box.style.left = Math.min(start.x, e.clientX) + 'px'; box.style.top = Math.min(start.y, e.clientY) + 'px'; box.style.width = Math.abs(start.x - e.clientX) + 'px'; box.style.height = Math.abs(start.y - e.clientY) + 'px'; };
        overlay.onpointerup = e => { if (!start)
            return; const rect = { x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY), width: Math.abs(start.x - e.clientX), height: Math.abs(start.y - e.clientY) }; cleanup(); if (rect.width < 100 || rect.height < 100 || Math.abs(rect.width / rect.height - 1) > .12) {
            reject(new Error('Select the square chessboard without surrounding margins'));
            return;
        } resolve(rect); };
    });
}
