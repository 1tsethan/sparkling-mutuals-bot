import { loadConfig } from '../src/config.ts';
export interface Env extends Record<string,unknown> {
  BOT: DurableObjectNamespace;
  SM_APPLICATION_ID:string; SM_PUBLIC_KEY:string; SM_GUILD_ID:string; SM_COMMAND_CHANNEL_ID:string;
  SM_RELEASE_CHANNEL_ID:string; SM_ACTION_CHANNEL_ID:string; SM_BETA_CHANNEL_ID:string;
  SM_STATS_ENABLED:string; SM_NOTIFICATIONS_ENABLED:string; SM_MIGRATION_ENABLED:string;
  SM_DISCORD_BOT_TOKEN?:string; SM_NOTIFICATION_SECRET?:string; SM_RECEIPT_KEY?:string;
}
export function cloudflareConfig(env:Env) {
  if(env.SM_STATS_ENABLED!=='false')throw new Error('Cloudflare stats are disabled.');
  if(!['true','false'].includes(env.SM_MIGRATION_ENABLED))throw new Error('Invalid migration configuration.');
  const migrationEnabled=env.SM_MIGRATION_ENABLED==='true';
  if(migrationEnabled&&env.SM_NOTIFICATIONS_ENABLED!=='false')throw new Error('Migration requires notifications disabled.');
  if((migrationEnabled||env.SM_NOTIFICATIONS_ENABLED==='true')&&!/^[a-f0-9]{64}$/i.test(env.SM_RECEIPT_KEY??''))throw new Error('Missing receipt key.');
  const values=Object.fromEntries(Object.entries(env).filter(([,value])=>typeof value==='string')) as Record<string,string>;
  return {...loadConfig({...values,SM_DATA_FILE:env.SM_RECEIPT_KEY?'cloudflare-sqlite':':memory:'}),migrationEnabled};
}
