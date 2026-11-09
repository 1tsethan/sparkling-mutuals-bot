# Cloudflare hosting for the SM Discord bot

## Intent and authority

The owner selected the existing Cloudflare account after reviewing free-hosting options. Move the existing public SM bot off the personal computer and changing Quick Tunnel address. Preserve its approved signed HTTP interactions, verified master/stable/beta announcements, SM-only destinations, no mentions, private command responses and encrypted announcement receipts. Statistics remain disabled pending Hypixel approval and separate activation.

This is a hosting adaptation of the approved bot design, not a new bot or a change to release eligibility. Existing account authorization was verified through the already-installed Wrangler CLI; browser control in this chat is still unavailable. Never copy browser cookies or inspect Wrangler credentials. The current account contains the independently deployed `sm-safari-sync-backup` service. Do not alter that service, its namespaces, secrets, routes or deployment configuration.

## Approaches and engineering choice

1. **Separate Worker with a SQLite Durable Object — selected engineering choice.** The existing WebSocket project already uses the Free plan's SQLite Durable Objects and the CLI has access. A single named actor provides synchronous atomic claims and persistent encrypted SQLite, closely matching the existing receipt ledger. Reuse the account, not the WebSocket service.
2. **Worker plus D1 — considered.** It needs asynchronous receipt-store changes and conditional claims. The current login lacks D1 access. It offers no meaningful advantage for this one-server, low-volume ledger.
3. **Keep the local host/tunnel — existing rollback baseline.** It needs no port, but depends on a personal device and changing tunnel address, which the owner wants to remove.

The actor approach is my implementation choice, not an additional user requirement. No paid plan, custom domain, subscription, new Cloudflare API token or new OAuth scope is authorized by this adaptation. Use an isolated `sparkling-mutuals-discord` Worker with its own SQLite namespace and a free workers.dev hostname. Confirm the account is Free before live provisioning; stop rather than enabling a paid product.

## Runtime and persistence

- A thin Worker accepts only exact `/health`, `/interactions`, `/notifications` and temporary `/migration/receipts` paths, bounds request bodies, rejects other methods, disables caching, and verifies signatures before invoking the actor. No query-string routes, redirects, diagnostics with headers/bodies or public admin UI.
- Share the existing Ed25519 and timestamped notification HMAC checks between the front door and current handlers; no change to authenticated bytes or five-minute windows. The actor independently uses the existing application and release-verifier behavior.
- One actor named `sparkling-mutuals` owns all release claims. Use synchronous SQLite transactions, preserving the `new`, `duplicate`, `needs_review` and `waiting` contract, and pending/sent/uncertain/retryable states. Unknown sends never become automatically retryable. Discord nonce/destination checks remain unchanged.
- Extract the existing AES-256-GCM envelope and ledger into a platform-neutral synchronous SQL adapter. Keep v1 ciphertext, AAD (`sm-receipts-v1:<key hash>`), metadata sentinel and public-key hashes byte-compatible with the local database. Node retains its WAL/FULL-sync adapter and in-memory interaction receipts; the actor uses `storage.sql` and `transactionSync`.
- The Worker supports signed PING and private /help. Registered stats commands return the existing private disabled explanation immediately, without lookups or retained interaction tokens. Reject `SM_STATS_ENABLED=true` in this deployment until global provider budgets and API approval are separately implemented. Do not create permanent player/interaction records or timers/alarms that keep the actor active while idle.
- Cloudflare secrets hold only the existing Discord credential, notification signing secret and receipt key. Do not request, move or enable a Hypixel key. No actual secret may appear in source, logs, arguments, build output or chat.

## Controlled receipt migration

The local host remains authoritative until cutover. Prepare code, local-runtime tests and a reviewable PR first. Provision a disabled, non-sending cloud deployment only after verifying the Free account. The owner must approve the specific credential/receipt transfer before the tool loads the protected bundle for upload.

Temporary migration mode requires notifications disabled and a separate domain-separated HMAC derived from the receipt key. Requests include timestamp, method, exact path and raw body in the signed data. Reject stale/forged requests before actor access. The route is 404 by default and after cutover. It accepts at most 2 MiB and 2,000 encrypted rows. It returns only encrypted export data or non-sensitive counts/digests; it never returns plaintext receipts or keys.

Import validates every envelope/row using the configured receipt key, public-key hash, allowed states and required fields before writes. Import is atomic. It may fill an empty ledger or recognize the exact same complete snapshot as an idempotent replay. It must never overwrite, merge around or reset a nonempty conflicting cloud ledger. Preserve pending/uncertain states, retry deadlines, content digests and message IDs. Wrong keys or tampering fail closed. Exports are consistent snapshots of the metadata plus sorted encrypted rows.

Cutover order:

1. Verify source, tests, account, cloud disabled configuration and secrets destination. Keep local delivery active during preparation.
2. After explicit transfer approval, upload the existing secrets using Wrangler stdin through an encapsulated local helper. No secret files/arguments or raw helper error logs. Never read the vault into the model context.
3. Stop only the confirmed local bot listener. Export the latest encrypted SQLite snapshot, then import it into the disabled cloud actor. Check counts/digests and state parity; retain the original local files.
4. Publish the updated privacy notice before cloud delivery; enable cloud notices and disable migration mode. Validate health and Discord's signed endpoint challenge, then update GitHub's notification URL and Discord's interaction URL to the stable cloud address.
5. Replay a confirmed existing run: it must return duplicate with the same Discord message ID and no post. Test private /help. A new eligible build/release is announced normally; never manufacture a release/tag merely to test.
6. Keep local source/keys/receipts for recovery, but leave the local sender stopped. Stop only the old bot-specific Quick Tunnel once the new route is verified. No dual senders.

Rollback before cloud delivery is enabled can resume the original ledger. After cloud delivery starts, first disable cloud notifications and enable authenticated migration mode, export its latest ledger, and reconcile/import that ledger before any local sender restarts. Pending/uncertain records always require review. Switching endpoints back to a stale local ledger risks duplicates and is prohibited.

## Validation and operating limits

Run the existing native suite, SQL-adapter restart/tamper/key tests, and real local Cloudflare-runtime tests (not a mocked D1/actor). Pin free-compatible Wrangler/test versions. Verify signed PING, private help/disabled stats, foreign guild/channel rejection, forged/stale signatures, body/method bounds, concurrent duplicate claims, state persistence across actor reload, send ambiguity, migration replay/conflict/tamper/limits and no plaintext in SQL/export. Execute the real notifier with controlled GitHub/Discord boundaries inside the runtime.

Use no heartbeats, background polling or periodic alarms. Free Worker/DO quotas are shared with the WebSocket project. Measure CPU/requests/storage on the actual cloud smoke test; a successful build does not establish sustained free usage. Free quota exhaustion can interrupt service and is not a promise of uptime. Report any validation that remains unavailable.

## Completion

Completion means reviewed code, passing checks, the approved cloud migration performed, public notice/endpoint settings saved, real signed HTTPS requests working and a known notice deduplicated against the migrated ledger. Until then report the precise remaining step and leave the current host's recoverable data intact.

## Live acceptance amendment: GitHub client compatibility

Live checks found Cloudflare rejects Python-urllib's default client identity (403/1010) and the shared Cloudflare egress IP has exhausted GitHub's anonymous quota (403, zero remaining). Use an explicit honest `Sparkling-Mutuals-Notifications` User-Agent in the existing notification sender. Grant that workflow only contents:read/actions:read and include its automatically generated temporary `github.token` as `githubReadToken` in the HMAC-signed JSON. The Worker validates a temporary `ghs_` installation token after raw-body signature verification and passes it to the existing verifier's fixed official GitHub API requests. Never store, log, return or put that token in Worker secrets/receipt data. No new long-lived credential or mod runtime change is needed. Keep no-redirect behavior, existing eligibility and notice identity/digest, and replay a known sent run after both small changes merge. This is the builder's operational compatibility choice under the approved hosting request.
