import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
// Fictional deterministic test keypair; never used in deployment.
import { createPrivateKey, createPublicKey } from 'node:crypto';
const key=createPrivateKey({key:Buffer.from('302e020100300506032b657004220420'+'07'.repeat(32),'hex'),format:'der',type:'pkcs8'});
const publicKey=createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32).toString('hex');
export default defineConfig({plugins:[cloudflareTest({
  wrangler:{configPath:'./wrangler.jsonc'},
  miniflare:{bindings:{SM_PUBLIC_KEY:publicKey,SM_NOTIFICATION_SECRET:'s'.repeat(32),SM_RECEIPT_KEY:'09'.repeat(32),SM_DISCORD_BOT_TOKEN:'fictional-test-token',SM_NOTIFICATIONS_ENABLED:'true'}}
})],test:{include:['cloudflare/test/**/*.test.ts']}});
