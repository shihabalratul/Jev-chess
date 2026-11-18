import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    root: new URL('.', import.meta.url).pathname,
    // GitHub Pages serves the demo from /<repo>/; local dev and tests keep '/'.
    base: process.env.DEMO_BASE ?? '/',
    plugins: [react()],
    server: { host: '127.0.0.1', port: 4173, strictPort: true },
});
