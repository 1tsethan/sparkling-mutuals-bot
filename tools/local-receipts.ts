import { loadLocalSecrets, localPaths } from '../src/local-secrets.ts';
try {
  const paths = localPaths(), secrets = loadLocalSecrets(paths.vault);
  try {
    process.env.SM_DATA_FILE = paths.receipts;
    process.env.SM_RECEIPT_KEY = secrets.receiptKey;
    await import('./receipts.ts');
  } finally {
    delete process.env.SM_RECEIPT_KEY;
    secrets.botToken = ''; secrets.notificationSecret = ''; secrets.receiptKey = '';
  }
} catch { console.error('Encrypted receipt review failed. Preserve the protected configuration and database.'); process.exitCode = 1; }
