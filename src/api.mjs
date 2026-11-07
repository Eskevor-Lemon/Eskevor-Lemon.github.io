import {searchTerms} from './search.mjs';
const encoder = new TextEncoder();
const REPO = 'Eskevor-Lemon/Eskevor-Lemon.github.io';
const FILE = 'data/terms.json';
const BRANCH = 'main';
const attempts = new Map(); // Best-effort isolate-local throttle; use a strong shared password.
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = s => Uint8Array.from(s.match(/../g) || [], x => parseInt(x, 16));
const equal = (a,b) => { let diff = a.length ^ b.length; for(let i=0;i<a.length;i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i)||0); return diff === 0; };
function configured(env) { return /^[a-f0-9]{32}:[a-f0-9]{64}$/.test(env.ADMIN_PASSWORD_HASH || '') && (env.SESSION_SECRET || '').length >= 32 && !!env.GITHUB_TOKEN; }
async function signature(value, env) {
 const key = await crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET + env.ADMIN_PASSWORD_HASH), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));
}
async function authorized(request, env) {
 if (!configured(env)) return false;
 const value = request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-terms='))?.slice(13);
 if (!value) return false;
 const [expiry,nonce,sig] = value.split('.');
 if (!/^\d+$/.test(expiry)||!nonce||!sig||Number(expiry)<Date.now()||Number(expiry)>Date.now()+8*3600000) return false;
 return equal(await signature(`${expiry}.${nonce}`,env),sig);
}
async function body(request) {
 if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415,'请发送 JSON 数据。');
 if (Number(request.headers.get('content-length')) > 30000) fail(413,'提交内容过大。');
 const reader=request.body?.getReader(); if(!reader) fail(400,'请求内容为空。');
 let size=0, chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>30000){await reader.cancel();fail(413,'提交内容过大。');}chunks.push(value);}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 try { const value=JSON.parse(new TextDecoder().decode(bytes)); if(!value||Array.isArray(value)||typeof value!=='object')throw Error();return value; } catch { fail(400,'请求数据格式不正确。'); }
}
export function validateTerm(input) {
 const term={}; for (const [key,max] of [['name',200],['definition',10000],['english',300],['abbreviation',80]]) {
  if(typeof input?.[key]!=='string') fail(400,'术语字段格式不正确。'); term[key]=input[key].trim();
  if(term[key].length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(term[key]))fail(400,'字段过长或包含无效字符。');
 }
 if(!term.name||!term.definition)fail(400,'请填写专有名词和解释。'); return term;
}

export function githubStore(env, fetcher=fetch) {
 const headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Lemon-Term-Library',...(env.GITHUB_TOKEN?{Authorization:`Bearer ${env.GITHUB_TOKEN}`}:{})};
 async function call(path,options={}) {try{return await fetcher(`https://api.github.com/repos/${REPO}/${path}`,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(15000),redirect:'error'});}catch{fail(502,'暂时无法连接 GitHub，请稍后重试。');}}
 return {
 async read() {
  const response=await call(`contents/${FILE}?ref=${BRANCH}`);
  if(response.status===404){ const branch=await call(`branches/${BRANCH}`);if(!branch.ok)fail(502,'无法读取 GitHub 仓库，请检查服务端连接配置。');return {terms:[],revision:null}; }
  if(!response.ok)fail(502,'无法读取 GitHub 数据，请稍后重试或检查连接配置。');
  const data=await response.json();
  try {const decoded=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
   if(decoded.version!==1||!Array.isArray(decoded.terms)||decoded.terms.length>5000)throw Error();
   const ids=new Set();for(const term of decoded.terms){validateTerm(term);if(typeof term.id!=='string'||ids.has(term.id))throw Error();ids.add(term.id);}
   return {terms:decoded.terms,revision:data.sha};
  }catch{fail(502,'GitHub 中的术语文件格式异常，请检查文件历史。');}
 },
 async write(terms,revision,message) {
  const bytes=encoder.encode(JSON.stringify({version:1,terms},null,2)+'\n');if(bytes.length>700000)fail(413,'术语库已达到当前容量上限。');
  let binary=''; for(const byte of bytes)binary+=String.fromCharCode(byte);
  const response=await call(`contents/${FILE}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,content:btoa(binary),branch:BRANCH,...(revision?{sha:revision}:{})})});
  if(response.status===409||response.status===422)fail(409,'资料已更新或仓库拒绝提交。请刷新后重试，原输入仍保留。');
  if(!response.ok)fail(502,'GitHub 未确认保存成功。请刷新核对后重试，或检查服务端写入权限。');
  const result=await response.json();return {revision:result.content.sha,commit:result.commit.sha};
 }
 };
}
export async function handleApi(request,env,store=githubStore(env)) {
 try {
  const url=new URL(request.url), path=url.pathname, method=request.method;
  if(method!=='GET'&&method!=='HEAD'&&request.headers.get('origin')!==url.origin)fail(403,'请求来源无效，请从本站操作。');
  if(path==='/api/session'&&method==='GET')return json({authenticated:await authorized(request,env),configured:configured(env)});
  if(path==='/api/login'&&method==='POST'){
   if(!configured(env))fail(503,'编辑功能尚未启用，请联系站点管理员完成配置。');
   const key=request.headers.get('cf-connecting-ip')||'shared';const now=Date.now();
   for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
   if(attempts.size>=10000&&!attempts.has(key))fail(429,'登录请求繁忙，请稍后重试。');
   const item=attempts.get(key)||{count:0,until:now+15*60000};if(item.count>=5)fail(429,'尝试次数过多，请 15 分钟后重试。');item.count++;attempts.set(key,item);
   const input=await body(request);if(typeof input.password!=='string'||input.password.length>512)fail(400,'密码格式不正确。');
   const [salt,expected]=env.ADMIN_PASSWORD_HASH.split(':');const material=await crypto.subtle.importKey('raw',encoder.encode(input.password),'PBKDF2',false,['deriveBits']);
   const actual=hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(salt),iterations:100000},material,256));
   if(!equal(actual,expected))fail(401,'密码不正确。');attempts.delete(key);
   const payload=`${Date.now()+8*3600000}.${crypto.randomUUID()}`;
   return json({authenticated:true},200,{'Set-Cookie':`__Host-terms=${payload}.${await signature(payload,env)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`});
  }
  if(path==='/api/logout'&&method==='POST')return json({ok:true},200,{'Set-Cookie':'__Host-terms=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
  if(path==='/api/terms'&&method==='GET'){const data=await store.read();return json({...data,terms:searchTerms(data.terms,url.searchParams.get('q')||'')});}
  if((path==='/api/terms'&&method==='POST')||(path.startsWith('/api/terms/')&&['PUT','DELETE'].includes(method))){
   if(!await authorized(request,env))fail(401,'请先输入管理密码。');
   const input=await body(request);if(!Object.hasOwn(input,'revision'))fail(400,'缺少数据版本，请刷新后重试。');
   const data=await store.read();if(input.revision!==data.revision)fail(409,'其他人已更新术语库。请刷新后重新保存，原输入仍保留。');
   const id=decodeURIComponent(path.slice('/api/terms/'.length));let terms=[...data.terms],name;
   if(method==='POST'){if(terms.length>=5000)fail(413,'术语数量已达到上限。');const term={...validateTerm(input.term),id:crypto.randomUUID(),updatedAt:new Date().toISOString()};terms.unshift(term);name=term.name;}
   else {const index=terms.findIndex(t=>t.id===id);if(index<0)fail(404,'该术语已不存在。');name=terms[index].name;if(method==='DELETE')terms.splice(index,1);else {terms[index]={...validateTerm(input.term),id,updatedAt:new Date().toISOString()};name=terms[index].name;}}
   const result=await store.write(terms,data.revision,`${{POST:'新增',PUT:'修改',DELETE:'删除'}[method]}术语：${name.replace(/[\r\n]/g,' ')}`);
   return json({terms,...result});
  }
  return json({error:'接口不存在。'},404);
 } catch(error){return json({error:error instanceof HttpError?error.message:'服务暂时不可用，请稍后重试。'},error instanceof HttpError?error.status:500);}
}
