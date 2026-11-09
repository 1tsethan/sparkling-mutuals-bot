import { DurableObject } from 'cloudflare:workers';
import { cloudflareConfig } from './config.ts';
import type { Env } from './config.ts';
import { cloudflareReceiptSql } from './storage.ts';
import { EncryptedReceiptLedger } from '../src/receipt-ledger.ts';
import { verifyInteraction, verifyNotification } from '../src/signatures.ts';
import { createApp } from '../src/app.ts';
import { DiscordClient } from '../src/discord.ts';
import { ReleaseNotifier } from '../src/releases.ts';
import { verifyMigration } from '../src/receipt-migration.ts';
import { BotError } from '../src/profile.ts';

export function json(body:unknown,status=200) {
  return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
async function boundedBody(request:Request,limit:number):Promise<Buffer|null> {
  if(Number(request.headers.get('Content-Length'))>limit)return null;
  const reader=request.body?.getReader();if(!reader)return Buffer.alloc(0);
  const chunks:Uint8Array[]=[];let size=0;
  try {
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>limit){await reader.cancel();return null;}chunks.push(value);}
    return Buffer.concat(chunks,size);
  } finally {reader.releaseLock();}
}
async function authorize(request:Request,env:Env):Promise<{path:string;raw:Buffer;headers:Record<string,string>}|Response> {
  const url=new URL(request.url),path=url.pathname;
  if(url.search||!['/health','/interactions','/notifications','/migration/receipts'].includes(path))return json({error:'Not found'},404);
  if(path==='/health')return request.method==='GET'?json({status:'ok',hosting:'cloudflare'}):json({error:'Method not allowed'},405);
  const config=cloudflareConfig(env),headers=Object.fromEntries(request.headers);
  if(path==='/migration/receipts') {
    if(!config.migrationEnabled)return json({error:'Not found'},404);
    if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
    const raw=await boundedBody(request,2097152);if(!raw)return json({error:'Request too large'},413);
    if(!verifyMigration(request.method,path,headers,raw,Buffer.from(env.SM_RECEIPT_KEY??'','hex')))return json({error:'Invalid signature'},401);
    return {path,raw,headers};
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const raw=await boundedBody(request,65536);if(!raw)return json({error:'Request too large'},413);
  if(path==='/notifications'&&!config.notificationsEnabled)return json({error:'disabled'},503);
  const valid=path==='/interactions'?verifyInteraction(headers,raw,config.publicKey):verifyNotification(headers,raw,config.notificationSecret);
  if(!valid)return json({error:'Invalid signature'},401);
  return {path,raw,headers};
}
export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    try {
      const authorized=await authorize(request,env);if(authorized instanceof Response)return authorized;
      return await env.BOT.get(env.BOT.idFromName('sparkling-mutuals')).fetch(new Request(request.url,{method:request.method,headers:request.headers,...(request.method==='POST'?{body:Uint8Array.from(authorized.raw).buffer}:{})}));
    } catch {return json({error:'unavailable'},503);}
  }
};
export class BotActor extends DurableObject<Env> {
  private ledger?:EncryptedReceiptLedger;
  private receipts() {
    if(!this.ledger)this.ledger=new EncryptedReceiptLedger(cloudflareReceiptSql(this.ctx.storage),Buffer.from(this.env.SM_RECEIPT_KEY??'','hex'));
    return this.ledger;
  }
  async fetch(request:Request):Promise<Response> {
    try {
      const authorized=await authorize(request,this.env);if(authorized instanceof Response)return authorized;
      const config=cloudflareConfig(this.env);
      if(authorized.path==='/migration/receipts') {
        if(request.method==='GET')return json(this.receipts().exportSnapshot());
        let snapshot:unknown;try{snapshot=JSON.parse(authorized.raw.toString('utf8'));}catch{return json({error:'Invalid JSON'},400);}
        return json(this.receipts().importSnapshot(snapshot));
      }
      const discord=new DiscordClient({token:config.botToken,applicationId:config.applicationId,guildId:config.guildId,allowedChannels:Object.values(config.channels)});
      const app=createApp({...config,statsEnabled:false,discord,
        claimInteraction:()=>false,lookup:{lookup:async()=>{throw new Error('Stats disabled');}},
        notify:async(headers,body)=>{
          // Both front door and actor have authenticated the exact raw body.
          // This Actions installation token lives only for this request and is
          // sent only to the verifier's fixed official GitHub API origin.
          let input:any;try{input=JSON.parse(body.toString('utf8'));}catch{throw new BotError('invalid','Invalid notification.');}
          if(typeof input?.githubReadToken!=='string'||(!/^ghs_[A-Za-z0-9_.-]{20,4092}$/.test(input.githubReadToken)||input.githubReadToken.trim()!==input.githubReadToken))
            throw new BotError('invalid','A temporary GitHub Actions read token is required.');
          return new ReleaseNotifier({secret:config.notificationSecret,developmentBranch:config.developmentBranch,channels:config.channels,
            githubReadToken:input.githubReadToken,store:{claimInteraction:()=>false,...this.noticeStore()},discord}).notify(headers,body);
        }
      });
      try {
        const reply=await app(authorized.path,authorized.headers,authorized.raw);
        return json(reply.body,reply.status);
      } finally {app.close();}
    } catch {return json({error:'unavailable'},503);}
  }
  private noticeStore() {
    const store=this.receipts();
    return {claim:store.claim.bind(store),sent:store.sent.bind(store),uncertain:store.uncertain.bind(store),retryable:store.retryable.bind(store),list:store.list.bind(store),close:()=>{}};
  }
}
