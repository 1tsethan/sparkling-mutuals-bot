import type { ReceiptSql } from '../src/receipt-ledger.ts';
export function cloudflareReceiptSql(storage:DurableObjectStorage):ReceiptSql {
  return {
    exec(sql){storage.sql.exec(sql).toArray();},
    all(sql,...values){return storage.sql.exec(sql,...values).toArray();},
    run(sql,...values){storage.sql.exec(sql,...values).toArray();},
    transaction<T>(work:()=>T):T {return storage.transactionSync(work);}
  };
}
