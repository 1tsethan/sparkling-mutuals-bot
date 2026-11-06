import { createHmac } from 'node:crypto';
import { REPOSITORY } from '../src/releases.ts';
function argument(name: string) { return process.argv[process.argv.indexOf(name) + 1]; }
const kind = argument('--kind'), runId = argument('--run-id');
if (!['action', 'release'].includes(kind) || !/^\d{1,20}$/.test(runId ?? '')) throw new Error('Use --kind action|release --run-id ID.');
const raw = JSON.stringify({ repository: REPOSITORY, kind, runId });
if (!process.argv.includes('--send')) console.log(raw);
else {
  const destination = new URL(process.env.SM_NOTIFICATION_URL || '');
  const secret = process.env.SM_NOTIFICATION_SECRET || '';
  if (destination.protocol !== 'https:' || destination.username || destination.password || destination.search || destination.hash ||
    destination.pathname !== '/notifications' || secret.length < 32) throw new Error('Set the HTTPS notification endpoint and secret.');
  const stamp = Math.floor(Date.now() / 1000).toString();
  const signature = 'sha256=' + createHmac('sha256', secret).update(stamp + '.').update(raw).digest('hex');
  try {
    const response = await fetch(destination, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'x-sm-timestamp': stamp, 'x-sm-signature': signature
    }, body: raw, signal: AbortSignal.timeout(45000), redirect: 'error' });
    if (!response.ok) throw new Error('notification rejected');
    const receipt = await response.json() as any;
    if (!['sent', 'duplicate'].includes(receipt.status)) throw new Error('notification needs review');
    console.log('Notification ' + receipt.status + '.');
  } catch { console.error('Notification not confirmed. Check the bot receipt before retrying.'); process.exitCode = 1; }
}
