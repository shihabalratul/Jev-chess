import ts from 'typescript';
import {readdir,readFile} from 'node:fs/promises';
const files=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(['node_modules','dist'].includes(entry.name))continue;const path=dir+'/'+entry.name;if(entry.isDirectory())await walk(path);else if(/\.(ts|tsx|mjs)$/.test(path))files.push(path);}}
for(const dir of ['apps','packages','tests','scripts'])await walk(dir);
for(const entry of await readdir('.'))if(/\.ts$/.test(entry))files.push(entry);
let failures=0;
for(const file of files){const content=await readFile(file,'utf8');const kind=file.endsWith('.tsx')?ts.ScriptKind.TSX:file.endsWith('.mjs')?ts.ScriptKind.JS:ts.ScriptKind.TS;const source=ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true,kind);for(const d of source.parseDiagnostics){failures++;console.error(ts.flattenDiagnosticMessageText(d.messageText,'\n'),file);}}
if(failures)process.exit(1);
console.log(`${files.length} source files passed syntax parsing. This does not replace typecheck or runtime tests.`);
