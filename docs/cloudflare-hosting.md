# Cloudflare hosting and cutover

The owner selected the existing account and confirmed **Workers Free** on 9 November 2026. This bot uses a separate `sparkling-mutuals-discord` Worker and SQLite Durable Object namespace. Never edit, delete, deploy over or attach the existing `sm-safari-sync-backup` service. No paid upgrade or domain purchase is needed. Account free quotas are shared with that service; exhaustion can interrupt delivery.

The checked-in configuration is deliberately disabled for notifications and migration. `/help` and disabled-stat explanations need only the public Discord settings. Statistics cannot be enabled in this Worker; no Hypixel key belongs here. No Gateway connection, scheduled polling or keep-alive is needed.

## Prepare

Use Node >=24.18 and the existing Wrangler account login. Never paste credentials in chat or shell arguments. From the isolated bot repository:

```powershell
npm ci
npm test
npm run check
npm run check:cloudflare
npm run test:cloudflare
npm run cloudflare:build
```

The real workerd tests use fictional credentials and controlled outbound fixtures. The migration tests exercise actual SQLite Durable Objects, encrypted imports/exports, replay/conflicts and HMAC boundaries. Native tests preserve the Windows adapter. A dry build does not establish live Discord/GitHub connectivity or production CPU usage.

Before any deployment, verify `wrangler whoami` identifies the intended existing account, the Workers plan is Free, the worker name is exactly `sparkling-mutuals-discord`, and the diff contains no WebSocket project changes. Keep account-identifying output private. Do not run `wrangler login` to grant extra scopes as an incidental workaround.

## Controlled move

1. Review/merge the prepared bot change and publish its updated privacy notice. Keep the local host authoritative during preparation. Record the current GitHub notification URL, Discord interaction URL and known notice/message pair privately.
2. Deploy the separate disabled Worker with `npm run cloudflare:deploy`. Record the returned stable `https://sparkling-mutuals-discord.<account>.workers.dev` origin. Check GET `/health` returns `status: ok`. This deployment changes neither existing endpoint.
3. After owner approval of moving the existing bot credential, signing/encryption keys and encrypted announcement receipts to Cloudflare, run `node tools/cloudflare-transfer.ts secrets`. It reads the Windows DPAPI bundle internally and streams only the three required secrets to Wrangler stdin. Child output is suppressed. It never loads a Hypixel key. Failure means leave the cloud sender disabled; retrying secret installation cannot publish messages.
4. Enable migration while keeping notifications disabled:

   `npx wrangler deploy --var SM_MIGRATION_ENABLED:true --var SM_NOTIFICATIONS_ENABLED:false`

5. Stop only the confirmed SM local bot listener/launcher, allow in-flight sends to finish, and verify its process is gone. Preserve `%LOCALAPPDATA%\SparklingMutualsBot\secrets.dpapi`, `receipts.sqlite` and any SQLite WAL/SHM files. Never terminate every Node process or a process based on an old PID. Do not stop the independent WebSocket service.
6. Run `node tools/cloudflare-transfer.ts import HTTPS_ORIGIN`. It refuses an active localhost:3000 listener, validates the latest encrypted local snapshot, imports it atomically, exports it again and requires identical count and ciphertext digest. It prints only the count/digest. A pending or uncertain row stays pending/uncertain. An exact replay is safe; a conflicting nonempty target cannot be overwritten. If the ledger exceeds 2 MiB or 2,000 rows, stop and design a bounded bulk migration; never truncate history.
7. Check the public privacy notice is available; then enable notifications and close the migration route:

   `npx wrangler deploy --var SM_NOTIFICATIONS_ENABLED:true --var SM_MIGRATION_ENABLED:false`

8. Update the mod repository's `SM_NOTIFICATION_URL` to `HTTPS_ORIGIN/notifications` and Discord application's interactions endpoint to `HTTPS_ORIGIN/interactions`. Retain the existing `SM_NOTIFICATION_SECRET` in GitHub. Do not transfer the bot token or receipt key to GitHub. Discord must validate its signed PING. Test private `/help` in the SM bot-commands channel. No other Discord server may be messaged.
9. Replay a known already-sent official master run via the existing GitHub notification workflow. The result must be `duplicate`, retaining the same Discord message ID; do not create a synthetic release/tag. Verify `/migration/receipts` is 404 and an unsigned notification is 401. Recheck the independent WebSocket service still has the same deployment.
10. Keep the local sender stopped. Stop only the obsolete bot-specific temporary tunnel after the stable endpoint is verified. Record the Worker deployment and evidence. Do not run the local feed launcher as a second sender.

The worker returns private immediate explanations for stats commands. Its presence badge can show offline because this is an HTTP application.

## Rollback and ambiguous outcomes

Before the cloud sender has been enabled, the preserved local ledger remains authoritative and can be used to restore the previous endpoints and local host. Disable cloud migration first.

After any cloud send, **do not restart using the stale local database**. First disable cloud notifications, enable migration, and run `node tools/cloudflare-transfer.ts export HTTPS_ORIGIN`. The helper saves a validated encrypted snapshot under `%LOCALAPPDATA%\SparklingMutualsBot`, and prints its count/digest without plaintext receipts. Close migration again. Preserve all versions. Reconcile the newer confirmed IDs, retry deadlines and pending/uncertain notices into a new local ledger using the same receipt key before any local restart; the import API intentionally refuses overwriting a conflicting nonempty ledger. A reviewed operator migration is required for that reconciliation, not a blind file replacement or an automatic resend.

A failure/timeout after a Discord POST can leave a pending or uncertain receipt. Inspect the actual message footer and reconcile the existing message ID; do not clear a row to force a retry. A 429 is the only automatic retryable delivery outcome. Incomplete cutover should favor temporarily paused announcements over two active senders.

## Secrets and retention

Only Cloudflare Worker secrets hold the bot credential, notification secret and AES receipt key. Durable Object SQL stores v1 AES-256-GCM envelopes indexed by notice-key hashes; public notice/channel/message identifiers remain encrypted. Migration responses contain ciphertext only and require a separate domain-separated, fresh HMAC derived from the receipt key. Migration is 404 by default and whenever disabled. Do not turn on request body/header logging. Worker observability is disabled in the deployment configuration. Cloudflare still processes network metadata under its own policies.

Keep the local protected bundle and encrypted database for recovery until retirement is deliberately arranged. Receipt deletion is logical deletion; Cloudflare platform recovery/backups and provider records are separate. Budget monitoring must cover both account services; no paid upgrade is implicit in this guide.
