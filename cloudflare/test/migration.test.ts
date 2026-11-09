import { it, expect, afterEach } from 'vitest';
import { SELF, env, reset } from 'cloudflare:test';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { migrationHeaders } from '../../src/receipt-migration.ts';
import { cloudflareConfig } from '../config.ts';
import type { Env } from '../config.ts';
const e=env as unknown as Env,key=Buffer.from('09'.repeat(32),'hex');
afterEach(()=>reset());
function seal(value:unknown,context:string) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('sm-receipts-v1:'+context));
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});
}
function snapshot(state='sent') {
  const name='johnceoskyblock/sparkling-mutuals:action:42289604201',hash=createHash('sha256').update(name).digest('hex');
  return {version:1,metadata:seal({format:'SM receipts 1'},'metadata'),rows:[{key_hash:hash,payload:seal({key:name,channel:e.SM_ACTION_CHANNEL_ID,digest:'a'.repeat(64),state,message:state==='sent'?'1568364377130795149':null,retry_at:0},hash)}]};
}
function request(method='POST',body='',now=Date.now(),path='/migration/receipts') {
  return new Request('https://bot.test'+path,{method,...(method==='GET'?{}:{body}),headers:migrationHeaders(method,path,Buffer.from(body),key,now)});
}
it('imports local v1 ciphertext atomically, accepts exact replay and exports the same encrypted snapshot',async()=>{
  const original=snapshot(),body=JSON.stringify(original);
  const first=await SELF.fetch(request('POST',body));expect(first.status).toBe(200);const result=await first.json();
  expect(await (await SELF.fetch(request('POST',body))).json()).toEqual(result);
  const exported=await (await SELF.fetch(request('GET'))).json();expect(exported).toEqual(original);
  expect(JSON.stringify(exported)).not.toContain('1568364377130795149');
  const conflicting=await SELF.fetch(request('POST',JSON.stringify(snapshot('uncertain'))));expect(conflicting.status).toBe(503);
  expect(await (await SELF.fetch(request('GET'))).json()).toEqual(original);
});
it('rejects stale, forged and notification signatures, unsupported methods and oversized inputs',async()=>{
  expect((await SELF.fetch(request('GET','',1))).status).toBe(401);
  expect((await SELF.fetch('https://bot.test/migration/receipts',{method:'POST',body:'{}'})).status).toBe(401);
  expect((await SELF.fetch(request('DELETE'))).status).toBe(405);
  expect((await SELF.fetch(request('POST','x'.repeat(2097153)))).status).toBe(413);
  const headers=migrationHeaders('GET','/other',Buffer.alloc(0),key);
  expect((await SELF.fetch('https://bot.test/migration/receipts',{headers})).status).toBe(401);
  const wrong=migrationHeaders('GET','/migration/receipts',Buffer.alloc(0),Buffer.alloc(32,8));
  expect((await SELF.fetch('https://bot.test/migration/receipts',{headers:wrong})).status).toBe(401);
});
it('tampered or structurally invalid encrypted imports leave the cloud ledger empty',async()=>{
  const bad=snapshot();bad.rows[0].payload=bad.rows[0].payload.replace(/"data":"./,'"data":"!');
  expect((await SELF.fetch(request('POST',JSON.stringify(bad)))).status).toBe(503);
  const duplicate=snapshot();duplicate.rows.push(duplicate.rows[0]);
  expect((await SELF.fetch(request('POST',JSON.stringify(duplicate)))).status).toBe(503);
  for(const state of ['unknown','pending']) {
    const s=snapshot(state);
    if(state==='pending')s.rows[0].key_hash='f'.repeat(64);
    expect((await SELF.fetch(request('POST',JSON.stringify(s)))).status).toBe(503);
  }
  const empty=await (await SELF.fetch(request('GET'))).json() as any;expect(empty.rows).toHaveLength(0);
});
it('refuses migration alongside public notifications or stats activation',()=>{
  expect(()=>cloudflareConfig({...e,SM_NOTIFICATIONS_ENABLED:'true'})).toThrow();
  expect(()=>cloudflareConfig({...e,SM_STATS_ENABLED:'true'})).toThrow();
});
