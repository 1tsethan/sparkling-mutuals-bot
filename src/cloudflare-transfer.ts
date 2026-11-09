import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { EncryptedReceiptLedger, snapshotDigest } from './receipt-ledger.ts';
import type { ReceiptSnapshot } from './receipt-ledger.ts';
import { nodeReceiptSql } from './encrypted-store.ts';
import type { LocalSecrets } from './local-secrets.ts';
import { migrationHeaders } from './receipt-migration.ts';
import { requestJson } from './http.ts';

export function workerOrigin(value:string):string {
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||
    !/^sparkling-mutuals-discord\.[a-z0-9-]+\.workers\.dev$/.test(u.hostname))throw new Error('Use the exact SM Worker HTTPS origin.');
  return u.origin;
}
export function uploadCloudflareSecrets(secrets:LocalSecrets,runner:typeof spawnSync=spawnSync) {
  const input=Buffer.from(JSON.stringify({SM_DISCORD_BOT_TOKEN:secrets.botToken,SM_NOTIFICATION_SECRET:secrets.notificationSecret,SM_RECEIPT_KEY:secrets.receiptKey}));
  // Wrangler loads its own existing account login; do not inherit unrelated SM keys.
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('SM_')&&name!=='NODE_OPTIONS')) as NodeJS.ProcessEnv;
  env.WRANGLER_LOG_SANITIZE='true';env.WRANGLER_LOG='none';env.WRANGLER_SEND_METRICS='false';
  const root=fileURLToPath(new URL('../',import.meta.url));
  try {
    const result=runner(process.execPath,[fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url)),'secret','bulk','--name','sparkling-mutuals-discord'],
      {cwd:root,input,env,windowsHide:true,timeout:60000,maxBuffer:262144});
    // Never surface child output: failure responses could contain supplied values.
    if(result.status!==0||result.error)throw new Error('Cloudflare secret upload failed. The sender must remain disabled.');
  } catch {throw new Error('Cloudflare secret upload failed. The sender must remain disabled.');}
  finally {input.fill(0);}
}
export function validateSnapshot(value:unknown,key:Buffer):ReceiptSnapshot {
  const db=new DatabaseSync(':memory:');let ledger:EncryptedReceiptLedger|undefined;
  try {ledger=new EncryptedReceiptLedger(nodeReceiptSql(db),key);ledger.importSnapshot(value);return ledger.exportSnapshot();}
  finally {ledger?.close();db.close();}
}
export async function exportCloudflareReceipts(origin:string,key:Buffer,fetcher:typeof fetch=fetch):Promise<ReceiptSnapshot> {
  const body=Buffer.alloc(0),path='/migration/receipts';
  try {
    const response=await requestJson(workerOrigin(origin)+path,fetcher,{method:'GET',headers:migrationHeaders('GET',path,body,key)});
    return validateSnapshot(response.data,key);
  } catch {throw new Error('Cloudflare receipt export failed. Preserve both ledgers.');}
}
export async function transferReceipts(origin:string,input:ReceiptSnapshot,key:Buffer,fetcher:typeof fetch=fetch):Promise<{count:number;digest:string}> {
  const target=workerOrigin(origin),snapshot=validateSnapshot(input,key),body=Buffer.from(JSON.stringify(snapshot)),path='/migration/receipts';
  const expected={count:snapshot.rows.length,digest:snapshotDigest(snapshot)};
  try {
    const response=await requestJson(target+path,fetcher,{method:'POST',headers:{...migrationHeaders('POST',path,body,key),'Content-Type':'application/json'},body});
    if(response.data?.count!==expected.count||response.data?.digest!==expected.digest)throw new Error();
    const exported=await exportCloudflareReceipts(target,key,fetcher);
    if(snapshotDigest(exported)!==expected.digest)throw new Error();
    return expected;
  } catch {throw new Error('Cloudflare receipt confirmation failed. Keep notifications disabled and preserve both ledgers.');}
}
