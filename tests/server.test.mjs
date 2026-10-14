import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {handle,validateProvider} from '../server.mjs';
test('provider URLs reject credentials, fragments and insecure remote HTTP',()=>{assert.throws(()=>validateProvider('http://remote.example/v1'));assert.throws(()=>validateProvider('https://user:pass@remote.example/v1'));assert.throws(()=>validateProvider('https://remote.example/v1#key'));assert.equal(validateProvider('http://127.0.0.1:11434/v1'),'http://127.0.0.1:11434/v1');});
test('real server serves page, blocks cross-origin writes and keeps secrets out of status',async()=>{
 const server=http.createServer(handle);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try{let r=await fetch(base);assert.equal(r.status,200);assert.ok((await r.text()).includes('生理学学习台'));
 r=await fetch(base+'/api/status');const status=await r.json();assert.equal(status.backend,true);assert.equal(status.apiKey,undefined);
 r=await fetch(base+'/api/extract',{method:'POST',headers:{Origin:'https://other.example','X-File-Extension':'txt'},body:'x'});assert.equal(r.status,403);
 r=await fetch(base+'/api/extract',{method:'POST',headers:{'X-File-Extension':'exe'},body:'x'});assert.equal(r.status,400);
 r=await fetch(base+'/.env');assert.equal(r.status,404);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('generation forwards model requests without returning the API key',async()=>{
 let request;
 const provider=http.createServer(async(req,res)=>{let data='';for await(const chunk of req)data+=chunk;request={url:req.url,authorization:req.headers.authorization,data:JSON.parse(data)};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'# Test note'}}]}));});
 const server=http.createServer(handle);
 await Promise.all([new Promise(r=>provider.listen(0,'127.0.0.1',r)),new Promise(r=>server.listen(0,'127.0.0.1',r))]);
 try {const r=await fetch(`http://127.0.0.1:${server.address().port}/api/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:'test-only-key',baseUrl:`http://127.0.0.1:${provider.address().port}/v1`,model:'test',messages:[{role:'system',content:'grounded'},{role:'user',content:'sources'}]})});const data=await r.json();assert.equal(r.status,200);assert.equal(data.content,'# Test note');assert.equal(request.url,'/v1/chat/completions');assert.equal(request.authorization,'Bearer test-only-key');assert.ok(!JSON.stringify(data).includes('test-only-key'));}
 finally {await Promise.all([new Promise(r=>provider.close(r)),new Promise(r=>server.close(r))]);}
});
test('text extraction endpoint preserves Chinese text',async()=>{
 const server=http.createServer(handle);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {const r=await fetch(`http://127.0.0.1:${server.address().port}/api/extract`,{method:'POST',headers:{'X-File-Extension':'txt'},body:'肺泡通气量测试'});assert.equal(r.status,200);const x=await r.json();assert.equal(x.pages[0].text,'肺泡通气量测试');}
 finally {await new Promise(r=>server.close(r));}
});
