import {build as viteBuild} from 'vite';
import {build} from 'esbuild';
import {copyFile,rm} from 'node:fs/promises';
try {
await viteBuild({configFile:'apps/extension/vite.config.ts'});
await build({entryPoints:{background:'apps/extension/src/background/index.ts',content:'apps/extension/src/content/index.ts'},bundle:true,outdir:'apps/extension/dist',format:'iife',target:'chrome116',sourcemap:true,minify:false});
await copyFile('apps/extension/manifest.json','apps/extension/dist/manifest.json');
console.log('Load apps/extension/dist as an unpacked extension.');
} catch (error) { await rm('apps/extension/dist', {recursive:true,force:true}); throw error; }
