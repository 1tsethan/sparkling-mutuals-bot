import { createHmac } from 'node:crypto';
import { BotError } from '../src/profile.ts';
import { retryAt } from '../src/http.ts';

/** Minimal durable metadata: keyed interaction/user hashes and provider budgets only. */
export class StatsBudget {
  private storage:DurableObjectStorage;
  private secret:string;
  constructor(storage:DurableObjectStorage,secret:string) {
    this.storage=storage;this.secret=secret;
    storage.sql.exec('CREATE TABLE IF NOT EXISTS stats_claims (digest TEXT PRIMARY KEY, expires INTEGER NOT NULL)');
    storage.sql.exec('CREATE TABLE IF NOT EXISTS stats_requests (provider TEXT NOT NULL, at INTEGER NOT NULL)');
    storage.sql.exec('CREATE TABLE IF NOT EXISTS stats_pauses (provider TEXT PRIMARY KEY, until INTEGER NOT NULL)');
  }
  claim(kind:'interaction'|'cooldown',id:string,now=Date.now()):boolean {
    const digest=createHmac('sha256',this.secret).update(kind+':'+id).digest('hex');
    return this.storage.transactionSync(()=>{
      this.storage.sql.exec('DELETE FROM stats_claims WHERE expires<=?',now);
      if(this.storage.sql.exec('SELECT digest FROM stats_claims WHERE digest=?',digest).toArray().length)return false;
      const count=this.storage.sql.exec<{count:number}>('SELECT COUNT(*) AS count FROM stats_claims').one().count;
      if(count>=10000)return false;
      this.storage.sql.exec('INSERT INTO stats_claims (digest,expires) VALUES (?,?)',digest,now+(kind==='interaction'?900000:10000));return true;
    });
  }
  async fetch(url:string,init?:RequestInit):Promise<Response> {
    const host=new URL(url).hostname;
    const provider=host==='api.mojang.com'?'mojang':host==='playerdb.co'?'playerdb':host==='api.hypixel.net'?'hypixel':'';
    if(!provider)throw new BotError('upstream','Unexpected API destination.');
    const now=Date.now();
    this.storage.transactionSync(()=>{
      this.storage.sql.exec('DELETE FROM stats_requests WHERE (provider IN (?,?) AND at<=?) OR (provider=? AND at<=?)','mojang','playerdb',now-60000,'hypixel',now-300000);
      const paused=this.storage.sql.exec<{until:number}>('SELECT until FROM stats_pauses WHERE provider=?',provider).toArray()[0];
      const count=this.storage.sql.exec<{count:number}>('SELECT COUNT(*) AS count FROM stats_requests WHERE provider=?',provider).one().count;
      if((paused?.until??0)>now||count>=20)throw new BotError('rate_limit','The API is busy. Please try again shortly.');
      this.storage.sql.exec('INSERT INTO stats_requests (provider,at) VALUES (?,?)',provider,now);
    });
    const response=await fetch(url,init);
    if(response.status===429||response.headers.get('ratelimit-remaining')==='0'){
      const seconds=Number(response.headers.get('ratelimit-reset'));
      const at=response.status===429?retryAt(response.headers,Date.now()):Date.now()+(Number.isFinite(seconds)&&seconds>0?seconds*1000:60000);
      this.storage.sql.exec('INSERT INTO stats_pauses (provider,until) VALUES (?,?) ON CONFLICT(provider) DO UPDATE SET until=MAX(until,excluded.until)',provider,Math.ceil(at));
    }
    return response;
  }
}
