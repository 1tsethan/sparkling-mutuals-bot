import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { getJson } from '../src/http.ts';
const listen=(server:Server)=>new Promise<string>(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+(server.address() as any).port)));
const close=(server:Server)=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
test('shared transport rejects redirects without forwarding credentials to another origin',async()=>{
  let forwarded=0;
  const target=createServer((_req,res)=>{forwarded++;res.end('{}');});
  const destination=await listen(target);
  const source=createServer((_req,res)=>{res.writeHead(302,{Location:destination});res.end();});
  const origin=await listen(source);
  try {
    await assert.rejects(getJson(origin,fetch,{Authorization:'Bearer fictional-test-token'}),{code:'upstream',status:302});
    assert.equal(forwarded,0);
  } finally {await Promise.all([close(source),close(target)]);}
});
