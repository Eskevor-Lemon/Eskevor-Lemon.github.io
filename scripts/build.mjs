import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});
const client=await build({entryPoints:['src/client.mjs'],bundle:true,minify:true,write:false,platform:'browser',format:'iife'});
const assets={html:await readFile('src/index.html','utf8'),css:await readFile('src/style.css','utf8'),js:client.outputFiles[0].text};
await build({entryPoints:['src/worker.mjs'],bundle:true,minify:true,format:'esm',platform:'browser',outfile:'dist/server/index.js',define:{__ASSETS__:JSON.stringify(assets)}});
