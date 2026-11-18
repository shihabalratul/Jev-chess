import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({ root, plugins: [react(), tailwind()], base: './', build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: { popup: root + 'popup.html', sidepanel: root + 'sidepanel.html' } } } });
