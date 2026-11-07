import {handleApi} from './api.mjs';
const assets=__ASSETS__;
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 let response;
 if(path.startsWith('/api/'))response=await handleApi(request,env);
 else if(!['GET','HEAD'].includes(request.method))response=new Response('Method not allowed',{status:405});
 else {const type=path==='/'?'html':path==='/app.js'?'js':path==='/style.css'?'css':null;response=type?new Response(request.method==='HEAD'?null:assets[type],{headers:{'Content-Type':{html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'}[type],'Cache-Control':'no-cache'}}):new Response('Not found',{status:404});}
 const headers=new Headers(response.headers);
 headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');
 headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com");
 headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 return new Response(response.body,{status:response.status,headers});
}};
