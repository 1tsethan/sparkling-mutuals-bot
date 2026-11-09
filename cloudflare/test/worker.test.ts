import { it, expect, afterEach, beforeEach, vi } from 'vitest';
import { SELF, env, reset, evictDurableObject, runInDurableObject, listDurableObjectIds } from 'cloudflare:test';
import { createPrivateKey, sign, createHmac } from 'node:crypto';
import type { Env } from '../config.ts';
const e=env as unknown as Env;
const privateKey=createPrivateKey({key:Buffer.from('302e020100300506032b657004220420'+'07'.repeat(32),'hex'),format:'der',type:'pkcs8'});
const stamp=()=>Math.floor(Date.now()/1000).toString();
function interaction(data:any,ts=stamp()) {
  const body=JSON.stringify(data);
  return new Request('https://bot.test/interactions',{method:'POST',body,headers:{'x-signature-timestamp':ts,'x-signature-ed25519':sign(null,Buffer.from(ts+body),privateKey).toString('hex')}});
}
function notice(runId='10',ts=stamp()) {
  const body=JSON.stringify({kind:'action',runId,repository:'johnceoskyblock/sparkling-mutuals'});
  return new Request('https://bot.test/notifications',{method:'POST',body,headers:{'x-sm-timestamp':ts,'x-sm-signature':'sha256='+createHmac('sha256','s'.repeat(32)).update(ts+'.'+body).digest('hex')}});
}
const stub=()=>e.BOT.get(e.BOT.idFromName('sparkling-mutuals'));
const routes=new Map<string,(init?:RequestInit)=>Response>();
beforeEach(()=>{routes.clear();vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{const fn=routes.get(String(url));if(!fn)throw new Error('Unexpected outbound request');return fn(init);});});
afterEach(async()=>{vi.restoreAllMocks();await reset();});
it('validates exact routes, methods, body limits and signatures before allocating an actor',async()=>{
  expect((await SELF.fetch('https://bot.test/health')).status).toBe(200);
  for(const path of ['/other','/health?x=1','/interactions/']) expect((await SELF.fetch('https://bot.test'+path)).status).toBe(404);
  expect((await SELF.fetch('https://bot.test/migration/receipts')).status).toBe(404);
  expect((await SELF.fetch('https://bot.test/interactions')).status).toBe(405);
  expect((await SELF.fetch('https://bot.test/interactions',{method:'POST',body:'{}'})).status).toBe(401);
  expect((await SELF.fetch(interaction({type:1},'1'))).status).toBe(401);
  expect((await SELF.fetch('https://bot.test/notifications',{method:'POST',body:'x'.repeat(65537)})).status).toBe(413);
  expect(await listDurableObjectIds(e.BOT)).toHaveLength(0);
  const ping=await SELF.fetch(interaction({type:1}));expect(await ping.json()).toEqual({type:1});
});
it('help, disabled stats and foreign-guild responses stay private with no external calls',async()=>{
  for(const name of ['help','tickets','sparkling','safari']) {
    const r=await SELF.fetch(interaction({type:2,application_id:e.SM_APPLICATION_ID,guild_id:e.SM_GUILD_ID,channel_id:e.SM_COMMAND_CHANNEL_ID,data:{name}}));
    const result=await r.json() as any;
    expect(result.type).toBe(4);expect(result.data.flags).toBe(64);
    if(name!=='help')expect(result.data.content).toMatch(/disabled/);
  }
  const r=await SELF.fetch(interaction({type:2,application_id:e.SM_APPLICATION_ID,guild_id:'123456789012345678',channel_id:e.SM_COMMAND_CHANNEL_ID,data:{name:'help'}}));
  expect((await r.json() as any).data.content).toMatch(/SM bot-commands/);
});
function github(runId='10') {
  const repo='johnceoskyblock/sparkling-mutuals', sha='a'.repeat(40),base='https://api.github.com/repos/'+repo;
  routes.set(base+'/actions/runs/'+runId,()=>Response.json({
    id:Number(runId),path:'.github/workflows/build.yml',status:'completed',conclusion:'success',event:'push',head_branch:'master',head_sha:sha,
    repository:{id:100,full_name:repo},head_repository:{id:100,full_name:repo}
  }));
  routes.set(base+'/actions/runs/'+runId+'/artifacts?per_page=100',()=>Response.json({artifacts:['26.1.2','26.2','26.3'].map((mc,i)=>({
    id:40+i,name:'jar-mc'+mc,size_in_bytes:100,expired:false,expires_at:'2099-01-01T00:00:00Z',
    workflow_run:{id:Number(runId),head_sha:sha,repository_id:100,head_repository_id:100}
  }))}));
}
function channel(){routes.set('https://discord.com/api/v10/channels/'+e.SM_ACTION_CHANNEL_ID,()=>Response.json({guild_id:e.SM_GUILD_ID,type:0}));}
it('actual verifier and SQLite actor send once across concurrent requests and cold actor recreation',async()=>{
  github();channel();let posts=0;
  routes.set('https://discord.com/api/v10/channels/'+e.SM_ACTION_CHANNEL_ID+'/messages',opts=>{
    posts++;const body=JSON.parse(opts!.body as string);expect(body.allowed_mentions).toEqual({parse:[]});expect(body.enforce_nonce).toBe(true);
    return Response.json({id:'1568364377130795149'});
  });
  const responses=await Promise.all([SELF.fetch(notice()),SELF.fetch(notice())]);
  const results=await Promise.all(responses.map(r=>r.json())) as any[];
  expect(results.some(r=>r.status==='sent')).toBe(true);expect(posts).toBe(1);
  await evictDurableObject(stub());
  expect((await (await SELF.fetch(notice())).json() as any).status).toBe('duplicate');expect(posts).toBe(1);
  const raw=await runInDurableObject(stub(),(_instance:any,state)=>JSON.stringify(state.storage.sql.exec('SELECT * FROM encrypted_notices').toArray()));
  expect(raw).not.toContain('1568364377130795149');expect(raw).not.toContain('johnceoskyblock');
});
it('unknown Discord outcomes remain uncertain across actor recreation',async()=>{
  github();channel();let posts=0;
  routes.set('https://discord.com/api/v10/channels/'+e.SM_ACTION_CHANNEL_ID+'/messages',()=>{posts++;return Response.json({});});
  const failed=await SELF.fetch(notice());expect(failed.status).toBe(503);await failed.text();
  await evictDurableObject(stub());
  expect((await (await SELF.fetch(notice())).json() as any).status).toBe('needs_review');expect(posts).toBe(1);
});
it('429 retry deadlines survive actor recreation without an early resend',async()=>{
  github();channel();let posts=0;
  routes.set('https://discord.com/api/v10/channels/'+e.SM_ACTION_CHANNEL_ID+'/messages',()=>{posts++;return Response.json({},{status:429,headers:{'Retry-After':'60'}});});
  const failed=await SELF.fetch(notice());expect(failed.status).toBe(503);await failed.text();
  await evictDurableObject(stub());
  expect((await (await SELF.fetch(notice())).json() as any).status).toBe('waiting');expect(posts).toBe(1);
});
