import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import * as course from '../dist/course.js';
import * as core from '../dist/core.js';

// Run the real application with browser storage and provider boundaries replaced.
// The harness exposes navigation only; no test hooks are shipped to the website.
async function app({configured=true,fail=false,savedNotes=[]}={}){
 const elements=new Map(),events={},stores={documents:[{id:'book',name:'book.pdf',role:'textbook',kind:'pdf',edition:'physiology-10',pages:[{page:24,text:'内环境与稳态'},{page:36,text:'细胞膜与电位'}]}],notes:[...savedNotes]};
 const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){this[type]=fn;},setAttribute(){}});return elements.get(id);};
 let calls=0,release;
 const context=vm.createContext({...course,...core,e:core.escapeHTML,console,URL,AbortSignal,crypto:webcrypto,setTimeout:()=>0,clearTimeout(){},scrollTo(){},scrollY:0,
 location:{hash:'#chapter/1'},window:{},localStorage:{getItem:()=>JSON.stringify({settings:{baseUrl:'https://provider.example/v1',model:'test-model'}}),setItem(){}},
 document:{querySelector:element,querySelectorAll:()=>[],body:{classList:{toggle(){}}},addEventListener(){}},
 addEventListener(type,fn){events[type]=fn;},
 indexedDB:{open(){const request={};queueMicrotask(()=>{request.result={transaction(name){const tx={objectStore(){return {getAll(){const req={result:structuredClone(stores[name])};queueMicrotask(()=>tx.oncomplete());return req;},put(value){const i=stores[name].findIndex(x=>x.id===value.id);if(i<0)stores[name].push(value);else stores[name][i]=value;queueMicrotask(()=>tx.oncomplete());return {result:value.id};}};}};return tx;}};request.onsuccess();});return request;}},
 async fetch(url){if(url==='./api/status')return {ok:true,json:async()=>({backend:true,aiConfigured:configured,baseUrl:'https://provider.example/v1',model:'test-model'})};calls++;await new Promise(resolve=>release=resolve);if(fail)throw new Error('Failed to fetch');return {ok:true,json:async()=>({content:'# 测试讲义'})};}
 });
 const source=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^\uFEFF/,'').replace(/^import .*\r?\n/gm,'');
 const controls=await vm.runInContext(`(async()=>{${source}\nreturn {enterRoute,setMode,render,generate};})()`,context);
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 return {context,elements,stores,get calls(){return calls;},async navigate(hash){context.location.hash=hash;events.hashchange();await tick();},async finish(){release?.();await tick();await tick();},async mode(mode){context.document.querySelectorAll=()=>[]; // mode control uses the same public handler
 await vm.runInContext(`Promise.resolve()`,context);
 // Retained function handles are kept outside the production page.
 await controls.setMode(mode);await tick();},tick};
}

test('chapter opens lecture, missing configuration makes no paid request',async()=>{
 const a=await app({configured:false});assert.equal(a.calls,0);assert.match(a.elements.get('#main').innerHTML,/教材已就绪，连接 AI 后即可生成/);assert.match(a.elements.get('#main').innerHTML,/data-tab="lesson" class="active"/);
 await a.navigate('#settings');assert.match(a.elements.get('#main').innerHTML,/保存并生成本章/);
 a.context.document.querySelector('#base-url').value='https://provider.example/v1';a.context.document.querySelector('#model-name').value='test-model';a.context.document.querySelector('#api-key').value='test-only-key';
 a.elements.get('#main').submit({preventDefault(){},target:{id:'settings-form'}});
 assert.equal(a.context.location.hash,'#chapter/1');await a.navigate('#chapter/1');assert.equal(a.calls,1);await a.finish();assert.equal(a.stores.notes.length,1);
});

test('repeated navigation while generating produces one request; cached note opens directly',async()=>{
 const a=await app();assert.equal(a.calls,1);await a.navigate('#chapter/1');await a.navigate('#chapter/1');assert.equal(a.calls,1);await a.finish();
 await a.navigate('#courses');await a.navigate('#chapter/1');assert.equal(a.calls,1);assert.equal(a.stores.notes.length,1);assert.match(a.elements.get('#main').innerHTML,/测试讲义/);
});

test('failed generation does not retry itself after repeated chapter clicks',async()=>{
 const a=await app({fail:true});await a.navigate('#chapter/1');await a.finish();assert.equal(a.calls,1);assert.equal(a.stores.notes.length,0);assert.match(a.elements.get('#main').innerHTML,/不会自动反复请求/);
});

test('navigating to another chapter queues one generation and saves each to its chapter',async()=>{
 const a=await app();await a.navigate('#chapter/2');assert.equal(a.calls,1);await a.finish();assert.equal(a.calls,2);await a.finish();assert.deepEqual(a.stores.notes.map(n=>n.chapterId),[1,2]);
});

test('switching exam while generating saves the original mode and creates a separate version',async()=>{
 const a=await app();await a.mode('final');assert.equal(a.calls,1);await a.finish();assert.equal(a.calls,2);await a.finish();assert.deepEqual(a.stores.notes.map(n=>n.mode),['midterm','final']);
 await a.mode('midterm');assert.equal(a.calls,2);
});
