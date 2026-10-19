import http from 'node:http';
import { readFile, mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import {normalizeConnection,modelRequest,modelError} from './dist/core.js';
const root=path.dirname(fileURLToPath(import.meta.url));
try {
  const env=await readFile(path.join(root,'.env'),'utf8');
  for (const line of env.split(/\r?\n/)) {const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}
} catch(e) {if(e.code!=='ENOENT')throw e;}
const python=process.env.PYTHON_BIN||'python';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
async function body(req,limit=2*1024*1024){const chunks=[];let size=0;for await(const ch of req){size+=ch.length;if(size>limit){const e=new Error('文件或请求过大');e.status=413;throw e;}chunks.push(ch);}return Buffer.concat(chunks);}
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
function parseDocument(file,ext) {return new Promise((resolve,reject)=>{
  const child=spawn(python,[path.join(root,'scripts','extract.py'),file,ext],{shell:false,windowsHide:true});let output='',error='';
  const timer=setTimeout(()=>{child.kill();reject(new Error('解析超时，请缩小文件或分章上传。'));},90000);
  child.stdout.on('data',c=>{output+=c;if(output.length>32*1024*1024){child.kill();reject(new Error('提取文本过多，请分章上传。'));}});
  child.stderr.on('data',c=>{error+=c;});child.on('error',()=>{clearTimeout(timer);reject(new Error('未找到Python。请安装Python和requirements.txt，或配置PYTHON_BIN。'));});
  child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(new Error('解析失败：'+error.slice(-400)));else{try{resolve(JSON.parse(output));}catch{reject(new Error('文档解析未返回有效结果。'));}}});
});}
export function validateProvider(base){let u;try{u=new URL(base);}catch{throw new Error('模型服务地址无效。');}if(u.username||u.password||u.search||u.hash)throw new Error('服务地址不能包含凭据、参数或片段。');if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw new Error('服务地址需要HTTPS，本机模型可用HTTP。');return u.href.replace(/\/$/,'');}
export async function handle(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='POST'){
      const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`)return json(res,403,{error:'不接受其他网站发起的请求。'});
    }
    if(url.pathname==='/api/status')return json(res,200,{backend:true,aiConfigured:!!process.env.AI_API_KEY,model:process.env.AI_MODEL||'',baseUrl:process.env.AI_BASE_URL||''});
    if(url.pathname==='/api/extract'&&req.method==='POST'){
      const ext=String(req.headers['x-file-extension']||'').toLowerCase();if(!['pdf','doc','docx','txt','md'].includes(ext))return json(res,400,{error:'支持PDF、DOC、DOCX、TXT、Markdown。'});
      const input=await body(req,48*1024*1024);if(!input.length)return json(res,400,{error:'文件为空。'});
      const tmp=await mkdtemp(path.join(os.tmpdir(),'physio-study-'));
      try{const f=path.join(tmp,'upload.'+ext);await writeFile(f,input);const result=await parseDocument(f,ext);json(res,200,result);}finally{await rm(tmp,{recursive:true,force:true});}return;
    }
    if(url.pathname==='/api/test-connection'&&req.method==='POST'){
      const x=JSON.parse((await body(req)).toString()),key=x.apiKey||process.env.AI_API_KEY;
      if(!key)return json(res,400,{error:'请填写 API Key。'});
      const {baseUrl,model}=normalizeConnection(x.baseUrl||process.env.AI_BASE_URL,x.model||process.env.AI_MODEL,{local:true});
      const r=await fetch(baseUrl+'/models',{headers:{Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(20000)});
      const data=await r.json().catch(()=>null);if(!r.ok)return json(res,502,{error:modelError(r.status,data,key)});
      if(!Array.isArray(data?.data))throw new Error('服务未返回有效的模型列表。');
      return json(res,200,{models:data.data.map(m=>m.id).filter(id=>typeof id==='string'),model});
    }
    if(url.pathname==='/api/generate'&&req.method==='POST'){
      const x=JSON.parse((await body(req)).toString());const key=x.apiKey||process.env.AI_API_KEY;
      if(!key)return json(res,400,{error:'请先在设置中填写API Key，或在服务端.env配置。'});
      const {baseUrl:base,model}=normalizeConnection(x.baseUrl||process.env.AI_BASE_URL||'',x.model||process.env.AI_MODEL,{local:true});
      if(!model||!Array.isArray(x.messages)||x.messages.length!==2||x.messages[0]?.role!=='system'||x.messages[1]?.role!=='user')return json(res,400,{error:'模型或讲义请求无效。'});
      const r=await fetch(base+'/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify(modelRequest(base,model,x.messages)),signal:AbortSignal.timeout(180000)});
      const y=await r.json().catch(()=>null);if(!r.ok)return json(res,502,{error:modelError(r.status,y,key)});
      const content=y?.choices?.[0]?.message?.content;if(typeof content!=='string'||!content.trim())throw new Error('模型没有返回讲义正文，请检查模型参数后重试。');if(y.choices[0].finish_reason==='length')throw new Error('本次输出达到长度上限，未保存不完整讲义，请缩小资料范围后重试。');return json(res,200,{content,model,usage:y.usage||null});
    }
    if(url.pathname.startsWith('/api/'))return json(res,404,{error:'接口不存在。'});
    if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'方法不支持。'});
    const rel=decodeURIComponent(url.pathname==='/'?'index.html':url.pathname.slice(1));const f=path.resolve(root,'dist',rel);const publicRoot=path.resolve(root,'dist');
    if(!f.startsWith(publicRoot+path.sep))return json(res,403,{error:'禁止访问。'});
    try{if(!(await stat(f)).isFile())throw new Error();const data=await readFile(f);res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data);}catch{return json(res,404,{error:'页面不存在。'});}
  }catch(e){json(res,e.status||400,{error:e.name==='TimeoutError'?'模型响应超时，请稍后重试。':e.message});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4189),host=process.env.HOST||'127.0.0.1';
  const server=http.createServer(handle);server.requestTimeout=195000;server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${port} 已被占用，请在 .env 修改 PORT。`:e.message);process.exitCode=1;});server.listen(port,host,()=>console.log(`Local: http://${host}:${port}`));
}
