import { DatabaseSync } from 'node:sqlite';
import { ReceiptStore } from './store.ts';
import { EncryptedReceiptLedger } from './receipt-ledger.ts';
import type { ReceiptSql } from './receipt-ledger.ts';
export function nodeReceiptSql(db:DatabaseSync):ReceiptSql {
  return {
    exec(sql){db.exec(sql);},
    all(sql,...values){return db.prepare(sql).all(...values);},
    run(sql,...values){db.prepare(sql).run(...values);},
    transaction<T>(work:()=>T):T {
      db.exec('BEGIN IMMEDIATE');
      try {const result=work();db.exec('COMMIT');return result;}
      catch(error){db.exec('ROLLBACK');throw error;}
    }
  };
}
export class EncryptedReceiptStore extends EncryptedReceiptLedger {
  private native:DatabaseSync;
  private interactions:ReceiptStore;
  private closed=false;
  constructor(file:string,key:Buffer,now:()=>number=Date.now) {
    if(file===':memory:' || key.length!==32) throw new Error('Encrypted receipts require a persistent file and a 32-byte key.');
    const db=new DatabaseSync(file);
    try {
      db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
      super(nodeReceiptSql(db),key);
    } catch(error){db.close();throw error;}
    this.native=db;this.interactions=new ReceiptStore(':memory:',now);
  }
  claimInteraction(id:string,now?:number){return this.interactions.claimInteraction(id,now);}
  override close(){if(this.closed)return;this.closed=true;this.interactions.close();this.native.close();super.close();}
}
