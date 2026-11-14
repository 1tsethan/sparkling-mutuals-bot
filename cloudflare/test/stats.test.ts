import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SELF, env, reset, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { StatsBudget } from '../stats-budget.ts';
import { createPrivateKey, sign } from 'node:crypto';
import type { Env } from '../config.ts';
const e=env as unknown as Env;
const key=createPrivateKey({key:Buffer.from('302e020100300506032b657004220420'+'07'.repeat(32),'hex'),format:'der',type:'pkcs8'});
const uuid='a'.repeat(32),token='fictional-interaction-token';
function signed(id='123456789012345670',share=false,user='123456789012345671'){
  const body=JSON.stringify({type:2,application_id:e.SM_APPLICATION_ID,guild_id:e.SM_GUILD_ID,channel_id:e.SM_COMMAND_CHANNEL_ID,id,token,
    member:{user:{id:user}},data:{name:'tickets',options:[{name:'player',type:3,value:'Example'},...(share?[{name:'share',type:5,value:true}]:[])]}});
  const timestamp=Math.floor(Date.now()/1000).toString();
  return new Request('https://bot.test/interactions',{method:'POST',body,headers:{'x-signature-timestamp':timestamp,'x-signature-ed25519':sign(null,Buffer.from(timestamp+body),key).toString('hex')}});
}
let edits:any[],posts:any[],names:number,profiles:number;
beforeEach(()=>{
  edits=[];posts=[];names=0;profiles=0;
  vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
    const request=new Request(String(url),init),path=new URL(request.url);
    if(path.hostname==='api.mojang.com'){names++;return Response.json({id:uuid,name:'Example'});}
    if(path.hostname==='api.hypixel.net'){
      profiles++;expect(request.headers.get('API-Key')).toBe('fictional-hypixel-key');
      return Response.json({success:true,profiles:[{profile_id:'profile',selected:true,members:{[uuid]:{safari:{tickets:{basic:2}}}}}]});
    }
    if(path.hostname==='discord.com'&&path.pathname.endsWith('/messages/@original')){edits.push(JSON.parse(init!.body as string));return Response.json({id:'123456789012345679'});}
    if(path.hostname==='discord.com'&&path.pathname.endsWith('/channels/'+e.SM_COMMAND_CHANNEL_ID))return Response.json({guild_id:e.SM_GUILD_ID,type:0});
    if(path.hostname==='discord.com'&&path.pathname.endsWith('/messages')){posts.push(JSON.parse(init!.body as string));return Response.json({id:'123456789012345679'});}
    throw new Error('Unexpected test request');
  });
});
afterEach(async()=>{vi.restoreAllMocks();await reset();});
it('returns an immediate private deferral and completes a private live lookup',async()=>{
  const r=await SELF.fetch(signed());expect(await r.json()).toMatchObject({type:5,data:{flags:64}});
  for(let i=0;i<30&&!edits.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
  expect(edits).toHaveLength(1);expect(JSON.stringify(edits[0])).toContain('Safari tickets');
  expect(names).toBe(1);expect(profiles).toBe(1);expect(posts).toHaveLength(0);
});
it('duplicate delivery remains rejected after actor recreation',async()=>{
  const r=await SELF.fetch(signed());expect((await r.json() as any).type).toBe(5);
  for(let i=0;i<30&&!edits.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
  const stub=e.BOT.get(e.BOT.idFromName('sparkling-mutuals'));await evictDurableObject(stub);
  const dup=await SELF.fetch(signed());expect((await dup.json() as any).data.content).toMatch(/already received/);
  expect(profiles).toBe(1);
});
it('provider request budgets and pauses survive a cold actor restart',async()=>{
  const stub=e.BOT.get(e.BOT.idFromName('sparkling-mutuals'));
  await runInDurableObject(stub,async(_actor,state)=>{
    const budget=new StatsBudget(state.storage,'fixture-secret');
    for(let i=0;i<20;i++)await budget.fetch('https://api.mojang.com/users/profiles/minecraft/Example');
  });
  await evictDurableObject(stub);
  await runInDurableObject(stub,async(_actor,state)=>{
    const budget=new StatsBudget(state.storage,'fixture-secret');
    await expect(budget.fetch('https://api.mojang.com/users/profiles/minecraft/Example')).rejects.toMatchObject({code:'rate_limit'});
  });
  expect(names).toBe(20);
});
it('enforces the same-user cooldown for concurrent lookups',async()=>{
  const requests=[signed('123456789012345670'),signed('123456789012345672')];
  const replies=await Promise.all(requests.map(x=>SELF.fetch(x)));
  const bodies=await Promise.all(replies.map(x=>x.json())) as any[];
  expect(bodies.filter(x=>x.type===5)).toHaveLength(1); // same user cooldown
  for(let i=0;i<30&&!edits.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
  expect(profiles).toBe(1);expect(names).toBe(1);
});
it('shares a cached player result across different requesters',async()=>{
  const first=await SELF.fetch(signed());expect((await first.json() as any).type).toBe(5);
  for(let i=0;i<30&&edits.length<1;i++)await new Promise(resolve=>setTimeout(resolve,10));
  const second=await SELF.fetch(signed('123456789012345672',false,'123456789012345673'));
  expect((await second.json() as any).type).toBe(5);
  for(let i=0;i<30&&edits.length<2;i++)await new Promise(resolve=>setTimeout(resolve,10));
  expect(edits).toHaveLength(2);expect(names).toBe(1);expect(profiles).toBe(1);
});
it('never looks up a request from a different server or an invalid signature',async()=>{
  const request=signed();const body=JSON.parse(await request.text());body.guild_id='987654321012345678';
  const raw=JSON.stringify(body),ts=Math.floor(Date.now()/1000).toString();
  const foreign=new Request('https://bot.test/interactions',{method:'POST',body:raw,headers:{'x-signature-timestamp':ts,'x-signature-ed25519':sign(null,Buffer.from(ts+raw),key).toString('hex')}});
  const result=await SELF.fetch(foreign);expect((await result.json() as any).data.flags).toBe(64);
  const bad=await SELF.fetch('https://bot.test/interactions',{method:'POST',body:'{}'});expect(bad.status).toBe(401);
  expect(names).toBe(0);expect(profiles).toBe(0);
});
it('shares only when requested and only in the SM command channel',async()=>{
  const response=await SELF.fetch(signed('123456789012345670',true));expect((await response.json() as any).type).toBe(5);
  for(let i=0;i<30&&!edits.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
  expect(posts).toHaveLength(1);expect(posts[0].allowed_mentions).toEqual({parse:[]});
  expect(edits[0].content).toMatch(/Shared/);
});
it('persists provider 429 backoff through eviction',async()=>{
  const stub=e.BOT.get(e.BOT.idFromName('sparkling-mutuals'));
  vi.mocked(globalThis.fetch).mockImplementationOnce(async()=>new Response('{}',{status:429,headers:{'Retry-After':'60'}}));
  await runInDurableObject(stub,async(_actor,state)=>{
    const budget=new StatsBudget(state.storage,'fixture-secret');expect((await budget.fetch('https://api.hypixel.net/v2/skyblock/profiles?uuid='+uuid)).status).toBe(429);
  });
  await evictDurableObject(stub);
  await runInDurableObject(stub,async(_actor,state)=>{
    const budget=new StatsBudget(state.storage,'fixture-secret');
    await expect(budget.fetch('https://api.hypixel.net/v2/skyblock/profiles?uuid='+uuid)).rejects.toMatchObject({code:'rate_limit'});
  });
});
it('keeps a five-minute Hypixel budget across actor restarts',async()=>{
  let clock=2_000_000;vi.spyOn(Date,'now').mockImplementation(()=>clock);
  const stub=e.BOT.get(e.BOT.idFromName('sparkling-mutuals'));
  await runInDurableObject(stub,async(_actor,state)=>{
    const budget=new StatsBudget(state.storage,'fixture-secret');
    for(let i=0;i<20;i++)await budget.fetch('https://api.hypixel.net/v2/skyblock/profiles?uuid='+uuid,{headers:{'API-Key':'fictional-hypixel-key'}});
  });
  await evictDurableObject(stub);clock+=60000;
  await runInDurableObject(stub,async(_actor,state)=>{
    const budget=new StatsBudget(state.storage,'fixture-secret');
    await expect(budget.fetch('https://api.hypixel.net/v2/skyblock/profiles?uuid='+uuid)).rejects.toMatchObject({code:'rate_limit'});
    clock+=240000;
    expect((await budget.fetch('https://api.hypixel.net/v2/skyblock/profiles?uuid='+uuid,{headers:{'API-Key':'fictional-hypixel-key'}})).status).toBe(200);
  });
  expect(profiles).toBe(21);
});
