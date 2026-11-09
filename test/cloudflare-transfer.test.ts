import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadCloudflareSecrets, workerOrigin, transferReceipts } from '../src/cloudflare-transfer.ts';
import { generateLocalSecrets } from '../src/local-secrets.ts';
import { EncryptedReceiptLedger, snapshotDigest } from '../src/receipt-ledger.ts';
import { nodeReceiptSql } from '../src/encrypted-store.ts';
import { DatabaseSync } from 'node:sqlite';
const origin='https://sparkling-mutuals-discord.example.workers.dev';
test('secret upload uses child stdin only, suppresses child output and drops unrelated secret environment',()=>{
  const secrets=generateLocalSecrets('fictional_token_'+ 'a'.repeat(40));let calls=0;
  uploadCloudflareSecrets(secrets,(program,args,options)=>{
    calls++;assert.equal(program,process.execPath);assert.deepEqual(args.slice(-4),['secret','bulk','--name','sparkling-mutuals-discord']);
    const input=JSON.parse(options.input.toString());assert.equal(input.SM_DISCORD_BOT_TOKEN,secrets.botToken);
    assert.equal(input.SM_NOTIFICATION_SECRET,secrets.notificationSecret);assert.equal(input.SM_RECEIPT_KEY,secrets.receiptKey);
    assert.equal(JSON.stringify(args).includes(secrets.botToken),false);assert.equal(options.windowsHide,true);assert.equal(options.env.SM_HYPIXEL_API_KEY,undefined);
    assert.equal(options.env.WRANGLER_LOG_SANITIZE,'true');assert.equal(options.env.WRANGLER_LOG,'none');
    return {status:0,stdout:Buffer.from(secrets.botToken),stderr:Buffer.from('')};
  });assert.equal(calls,1);
  assert.throws(()=>uploadCloudflareSecrets(secrets,()=>({status:1,stderr:Buffer.from(secrets.botToken)})),error=>!(error as Error).message.includes(secrets.botToken));
});
test('transfer accepts only this Worker HTTPS origin and requires matching imported and exported ciphertext',async()=>{
  for(const url of ['http://sparkling-mutuals-discord.example.workers.dev','https://evil.workers.dev','https://sparkling-mutuals-discord.example.workers.dev/path','https://sparkling-mutuals-discord.example.workers.dev?x=1','https://user:pass@sparkling-mutuals-discord.example.workers.dev','https://sparkling-mutuals-discord.example.workers.dev:444'])assert.throws(()=>workerOrigin(url));
  assert.equal(workerOrigin(origin+'/'),origin);
  const db=new DatabaseSync(':memory:'),ledger=new EncryptedReceiptLedger(nodeReceiptSql(db),Buffer.alloc(32,9));
  try {
    ledger.claim('known','1568145100683485184','a'.repeat(64),1000);ledger.sent('known','1568364377130795149');
    const snapshot=ledger.exportSnapshot();let calls=0;
    const fake=async(url,init)=>{calls++;assert.equal(url,origin+'/migration/receipts');assert.equal(init.redirect,'error');assert.ok(init.headers['x-sm-migration-signature']);
      return Response.json(init.method==='POST'?{count:1,digest:snapshotDigest(snapshot)}:snapshot);};
    assert.deepEqual(await transferReceipts(origin,snapshot,Buffer.alloc(32,9),fake as typeof fetch),{count:1,digest:snapshotDigest(snapshot)});assert.equal(calls,2);
    await assert.rejects(transferReceipts(origin,snapshot,Buffer.alloc(32,9),(async()=>Response.json({count:0,digest:'wrong'})) as typeof fetch),/confirmation/);
  } finally {ledger.close();db.close();}
});
