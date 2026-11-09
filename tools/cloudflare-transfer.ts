import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { EncryptedReceiptStore } from '../src/encrypted-store.ts';
import { loadLocalSecrets, localPaths } from '../src/local-secrets.ts';
import { uploadCloudflareSecrets, transferReceipts, exportCloudflareReceipts, workerOrigin } from '../src/cloudflare-transfer.ts';
import { snapshotDigest } from '../src/receipt-ledger.ts';

async function requireStoppedLocalBot() {
  await new Promise<void>((resolve,reject)=>{
    const socket=createConnection({host:'127.0.0.1',port:3000});
    socket.once('connect',()=>{socket.destroy();reject(new Error('Stop the confirmed local SM listener before taking the final migration snapshot.'));});
    socket.once('error',(error:NodeJS.ErrnoException)=>error.code==='ECONNREFUSED'?resolve():reject(new Error('Could not verify the local listener is stopped.')));
    socket.setTimeout(1000,()=>{socket.destroy();reject(new Error('Could not verify the local listener is stopped.'));});
  });
}
async function main() {
  const [action,origin,...extra]=process.argv.slice(2);
  if(!action||action==='--help'){
    console.log('Cloudflare transfer: secrets | import HTTPS_ORIGIN | export HTTPS_ORIGIN. Read docs/cloudflare-hosting.md before cutover. No credentials are accepted as arguments.');return;
  }
  if(extra.length||!['secrets','import','export'].includes(action)||(action==='secrets'?!!origin:!origin))throw new Error('Invalid transfer arguments. Use --help.');
  if(origin)workerOrigin(origin);
  const paths=localPaths(),secrets=loadLocalSecrets(paths.vault),key=Buffer.from(secrets.receiptKey,'hex');
  try {
    if(action==='secrets') {uploadCloudflareSecrets(secrets);console.log('Cloudflare secrets uploaded. Keep notifications disabled until receipt verification.');return;}
    if(action==='import') {
      await requireStoppedLocalBot();
      if(!statSync(paths.receipts).isFile())throw new Error('Existing receipt database is required.');
      const store=new EncryptedReceiptStore(paths.receipts,key);
      let snapshot;try {snapshot=store.exportSnapshot();} finally {store.close();}
      const result=await transferReceipts(origin!,snapshot,key);
      console.log(JSON.stringify({event:'receipts_verified',...result}));return;
    }
    const snapshot=await exportCloudflareReceipts(origin!,key);
    const file=join(paths.root,'cloudflare-receipts-'+Date.now()+'.encrypted.json');
    writeFileSync(file,JSON.stringify(snapshot),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({event:'encrypted_receipt_backup_saved',count:snapshot.rows.length,digest:snapshotDigest(snapshot)}));
  } finally {key.fill(0);secrets.botToken='';secrets.notificationSecret='';secrets.receiptKey='';}
}
try {await main();}catch {console.error('Cloudflare transfer did not complete. Keep the sender disabled, preserve both ledgers and review the hosting instructions.');process.exitCode=1;}
