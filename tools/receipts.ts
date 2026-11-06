import { ReceiptStore } from '../src/store.ts';
const file = process.env.SM_DATA_FILE || './data/receipts.sqlite';
const store = new ReceiptStore(file);
try {
  if (process.argv[2] === 'resolve') {
    const key = process.argv[3], message = process.argv[4];
    if (!process.argv.includes('--confirmed-in-discord') || !key || !/^\d{17,22}$/.test(message ?? ''))
      throw new Error('Inspect the notice footer and destination in Discord first, then supply resolve NOTICE_KEY MESSAGE_ID --confirmed-in-discord.');
    store.sent(key, message);
    console.log('Recorded the operator-confirmed existing message. No Discord message was sent.');
  } else console.log(JSON.stringify(store.list(), null, 2));
} finally { store.close(); }
