import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
// Fictional deterministic test keypair; never used in deployment.
import { createPrivateKey, createPublicKey } from 'node:crypto';
const key=createPrivateKey({key:Buffer.from('302e020100300506032b657004220420'+'07'.repeat(32),'hex'),format:'der',type:'pkcs8'});
const publicKey=createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32).toString('hex');
const testProject=(name:string,include:string,bindings:Record<string,string>)=>({
  plugins:[cloudflareTest({wrangler:{configPath:'./wrangler.jsonc'},miniflare:{bindings:{
    SM_PUBLIC_KEY:publicKey,SM_NOTIFICATION_SECRET:'s'.repeat(32),SM_RECEIPT_KEY:'09'.repeat(32),SM_DISCORD_BOT_TOKEN:'fictional-test-token',...bindings
  }}})],test:{name,include:[include]}
});
export default defineConfig({test:{projects:[
  testProject('notices','cloudflare/test/worker.test.ts',{SM_NOTIFICATIONS_ENABLED:'true'}),
  testProject('migration','cloudflare/test/migration.test.ts',{SM_NOTIFICATIONS_ENABLED:'false',SM_MIGRATION_ENABLED:'true'})
]}});
