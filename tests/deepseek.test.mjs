import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {normalizeConnection,modelRequest,modelError} from '../dist/core.js';
import {handle} from '../server.mjs';

test('official DeepSeek typo is corrected without rewriting other providers',()=>{
 assert.deepEqual(normalizeConnection('http://api.deepseek.com/chat/completions','v4-flash'),{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'});
 assert.equal(normalizeConnection('https://api.deepseek.com/v1/','v4-pro').model,'deepseek-v4-pro');
 assert.equal(normalizeConnection('https://other.example/v1/chat/completions','v4-flash').model,'v4-flash');
 assert.throws(()=>normalizeConnection('http://other.example/v1','x'));
 assert.throws(()=>normalizeConnection('https://chat.deepseek.com','x'));
 assert.throws(()=>normalizeConnection('https://api.deepseek.com?api_key=secret','x'));
});

test('DeepSeek request reserves output for lecture text and leaves other providers compatible',()=>{
 const messages=[{role:'user',content:'lecture'}];
 const payload=modelRequest('https://api.deepseek.com','deepseek-flash',messages);
 assert.deepEqual(payload.thinking,{type:'disabled'});assert.equal(payload.stream,false);assert.equal(payload.max_tokens,12000);
 const generic=modelRequest('https://other.example','test',messages);assert.equal(generic.thinking,undefined);assert.equal(generic.temperature,.2);
});

test('provider failures explain model, authentication and balance without exposing credentials',()=>{
 const secret='test-only-secret';
 const err=modelError(400,{error:{message:'Invalid model; key='+secret+' sk-dummy123'}},secret);
 assert.match(err,/模型名/);assert.match(err,/Invalid model/);assert.ok(!err.includes(secret));assert.ok(!err.includes('sk-dummy123'));
 assert.match(modelError(401,null),/API Key/);assert.match(modelError(402,null),/余额不足/);
});

test('connection check reads models without creating a completion or returning a key',async()=>{
 let path,auth;
 const provider=http.createServer((req,res)=>{path=req.url;auth=req.headers.authorization;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'test-model'}]}));});
 const server=http.createServer(handle);
 await Promise.all([new Promise(r=>provider.listen(0,'127.0.0.1',r)),new Promise(r=>server.listen(0,'127.0.0.1',r))]);
 try{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/test-connection`,{method:'POST',body:JSON.stringify({baseUrl:`http://127.0.0.1:${provider.address().port}/v1`,model:'test-model',apiKey:'test-only-key'})});
 const data=await r.json();assert.equal(r.status,200);assert.equal(path,'/v1/models');assert.equal(auth,'Bearer test-only-key');assert.deepEqual(data.models,['test-model']);assert.ok(!JSON.stringify(data).includes('test-only-key'));
 }finally{await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>provider.close(r))]);}
});
