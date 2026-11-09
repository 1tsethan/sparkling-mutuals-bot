import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EncryptedReceiptStore } from '../src/encrypted-store.ts';
import { createCipheriv, randomBytes } from 'node:crypto';

const key = Buffer.alloc(32, 9), channel = '1568145100683485184', digest = 'a'.repeat(64);
function fixture(work: (a:any,b:any,c:any)=>void) {
  const dir = mkdtempSync(join(tmpdir(), 'sm-ledger-'));
  const stores = ['a','b','c'].map(name=>new EncryptedReceiptStore(join(dir,name+'.sqlite'),key));
  try { work(...stores as [any,any,any]); } finally { stores.forEach(s=>s.close()); rmSync(dir,{recursive:true,force:true}); }
}
test('encrypted snapshots migrate exact v1 ciphertext and preserve sent, pending, uncertain and retry deadlines',()=>fixture((a,b)=>{
  for(const name of ['sent','pending','uncertain','retry']) a.claim(name,channel,digest,1000);
  a.sent('sent','1568364377130795149'); a.uncertain('uncertain'); a.retryable('retry',3000);
  const snapshot = a.exportSnapshot();
  assert.equal(snapshot.version,1); assert.equal(snapshot.rows.length,4);
  assert.throws(()=>b.importSnapshot({...snapshot,rows:Array(2001).fill(snapshot.rows[0])}));
  assert.equal(b.list().length,0);
  assert.equal(JSON.stringify(snapshot).includes(channel),false);
  assert.deepEqual(b.importSnapshot(snapshot),b.importSnapshot(snapshot));
  assert.deepEqual(b.exportSnapshot(),snapshot);
  assert.equal(b.claim('sent',channel,digest,4000),'duplicate');
  assert.equal(b.claim('pending',channel,digest,4000),'needs_review');
  assert.equal(b.claim('uncertain',channel,digest,4000),'needs_review');
  assert.equal(b.claim('retry',channel,digest,2999),'waiting');
  assert.equal(b.claim('retry',channel,digest,3000),'new');
}));
test('migration fails atomically for tampering, wrong keys and conflicting nonempty snapshots',()=>fixture((a,b,c)=>{
  a.claim('one',channel,digest,1000); a.claim('two',channel,digest,1000);
  const snapshot=a.exportSnapshot(), bad=structuredClone(snapshot);
  bad.rows[1].payload=bad.rows[1].payload.replace(/"data":"./,'"data":"!');
  assert.throws(()=>b.importSnapshot(bad)); assert.equal(b.list().length,0);
  assert.throws(()=>b.importSnapshot({...snapshot,rows:[snapshot.rows[0],snapshot.rows[0]]}));
  const wrongDir=mkdtempSync(join(tmpdir(),'sm-wrong-'));
  const wrong=new EncryptedReceiptStore(join(wrongDir,'receipts.sqlite'),Buffer.alloc(32,10));
  try { assert.throws(()=>wrong.importSnapshot(snapshot)); assert.equal(wrong.list().length,0); }
  finally { wrong.close(); rmSync(wrongDir,{recursive:true,force:true}); }
  b.claim('existing',channel,digest,1000); const before=b.exportSnapshot();
  assert.throws(()=>b.importSnapshot(snapshot)); assert.deepEqual(b.exportSnapshot(),before);
  c.importSnapshot(snapshot); c.uncertain('one'); assert.throws(()=>c.importSnapshot(snapshot));
}));
test('authenticated ciphertext still requires valid receipt fields before import',()=>fixture((a,b)=>{
  a.claim('one',channel,digest,1000);const original=a.exportSnapshot(),hash=original.rows[0].key_hash;
  const record={key:'one',channel,digest,state:'sent',message:'1568364377130795149',retry_at:0};
  for(const change of [{channel:1568145100683485184},{message:1568364377130795149},{state:'unknown'},{digest:'short'},{retry_at:-1},{key:'different'},{message:null}]) {
    const bad=structuredClone(original),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(Buffer.from('sm-receipts-v1:'+hash));
    const data=Buffer.concat([cipher.update(JSON.stringify({...record,...change}),'utf8'),cipher.final()]);
    bad.rows[0].payload=JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});
    assert.throws(()=>b.importSnapshot(bad));assert.equal(b.list().length,0);
  }
}));
