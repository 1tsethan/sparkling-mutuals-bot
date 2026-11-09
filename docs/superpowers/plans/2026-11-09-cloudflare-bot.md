# Cloudflare Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare and validate an independently hosted Cloudflare version of the existing SM bot, preserving encrypted release receipts and a reversible cutover.

**Architecture:** Extract the synchronous encrypted ledger behind a SQL interface, retain the Node adapter, and add a SQLite Durable Object adapter. A thin authenticated Worker forwards approved requests to one actor; a temporarily enabled signed migration route transfers ciphertext only.

**Tech Stack:** Node >=24.18, TypeScript, Wrangler 4.158.0, Cloudflare SQLite Durable Objects, Vitest 4.1 and Cloudflare test plugin 1.6.

**Spec:** `docs/superpowers/specs/2026-11-09-cloudflare-bot-design.md`

## Global Constraints

- Separate `sparkling-mutuals-discord` Worker; leave `sm-safari-sync-backup` untouched.
- Free plan only; no paid upgrade, custom domain or new OAuth scopes.
- Same SM guild, command/release destinations, master eligibility, signatures, no mentions and encrypted v1 receipt format.
- Statistics remain disabled; no Hypixel key transfer.
- Secrets never enter source, arguments, diagnostic logs or chat.
- Preserve the local host and latest receipt database until a verified single-host cutover.

## Review Focus

- Concurrent authenticated deliveries must claim once before any Discord send (Task 2 concurrent actual notifier test).
- Cold actor recreation must retain sent/uncertain/retryable state (Task 2 storage test).
- Migration replay/conflict or malformed encrypted row must never erase live receipts (Task 1 and 3 validation tests).
- Signed foreign-guild commands and disabled stats must stay private without external requests (Task 2 interaction tests).
- Interrupted secret upload or cutover must leave a disabled cloud sender and a clear rollback boundary (Task 3 helper and operations checks).

### Task 1: Portable encrypted ledger and authentication

**Files:** create `src/receipt-ledger.ts`, `src/signatures.ts`, `test/receipt-ledger.test.ts`; modify `src/encrypted-store.ts`, `src/app.ts`, `src/releases.ts`.

**Interfaces:** `ReceiptSql` exposes `exec`, `all`, `run`, `transaction<T>`; `EncryptedReceiptLedger` exposes existing notice operations plus `exportSnapshot(): ReceiptSnapshot`, `importSnapshot(snapshot): {count:number,digest:string}`, `close()`. `ReceiptSnapshot` contains version 1, encrypted metadata and sorted `{key_hash,payload}` rows. `verifyInteraction(headers,raw,publicKey,now)` and `verifyNotification(headers,raw,secret,now)` return boolean.

- [ ] Add tests for old Node receipt compatibility, atomic import, exact replay/conflict, wrong key, ciphertext tampering, invalid state/hash/fields and preserved retry deadline.
- [ ] Run `node --test test/receipt-ledger.test.ts`; observe missing API failure.
- [ ] Extract ledger; retain Node WAL/FULL-sync and memory interactions. Share signature verification and add optional `statsEnabled` (default true) for immediate disabled private replies.
- [ ] Run native `npm test` and `npm run check`; require all green.
- [ ] Commit the independently working extraction.

### Task 2: Authenticated Worker and real SQLite actor

**Files:** create `cloudflare/worker.ts`, `cloudflare/storage.ts`, `cloudflare/config.ts`, `cloudflare/test/worker.test.ts`, `vitest.config.ts`, `wrangler.jsonc`; modify `package.json`, `.gitignore`, CI workflow.

**Interfaces:** Worker exports `fetch(Request,Env):Promise<Response>` and `BotActor`; actor owns `EncryptedReceiptLedger` and uses `ReleaseNotifier` and `createApp`. `CloudflareReceiptSql(storage)` implements Task 1's interface. Fixed actor name `sparkling-mutuals`.

- [ ] Pin development tooling in this repo. Add real workerd tests for signatures, exact routes/methods, body limits, private help/disabled commands and no actor calls for rejected authentication.
- [ ] Observe failure before implementing Worker/adapter.
- [ ] Implement bounded request reading, double authentication, disabled-by-default configuration, SQLite adapter, no timers while stats disabled, and actual notifier integration.
- [ ] Add controlled GitHub/Discord fixtures exercising concurrent duplicate, unknown send, 429 and actor recreation with persisted receipts.
- [ ] Run native suite, Cloudflare suite and `wrangler deploy --dry-run`; ensure no `node:sqlite` bundled.
- [ ] Commit Worker and tests.

### Task 3: Ciphertext migration and operator handoff

**Files:** create `src/receipt-migration.ts`, `tools/cloudflare-transfer.ts`, `test/cloudflare-transfer.test.ts`, `docs/cloudflare-hosting.md`; modify Worker tests, `PRIVACY.md`, README and CI.

**Interfaces:** domain-separated `migrationHeaders(method,path,raw,key,now)` and `verifyMigration(...)`; `/migration/receipts` GET exports and POST imports only when migration enabled and notices disabled. Local operator tool loads DPAPI internally, uploads secrets by child stdin with captured output, exports/imports encrypted snapshots over an exact HTTPS workers.dev endpoint, emits only counts/digests/status.

- [ ] Add failing tests for default 404, migration/notifications mutual exclusion, stale/forged signatures, method/path binding, limits, exact import replay and conflicting snapshot preservation.
- [ ] Implement transfer helpers with no auto retry of uncertain public sends; test child failures redact output and no secret argv/files.
- [ ] Document deployment flags, Free-plan verification, cloud privacy/storage, endpoint changes, known-receipt replay, old host shutdown and post-send rollback export/reconciliation.
- [ ] Run all suites, type/build checks and whole-branch fresh review; fix important findings with RED/GREEN tests.
- [ ] Commit and prepare an attached reviewable PR. Keep live resources untouched until the Free-plan check and concrete cutover requirements are satisfied.

## Completion boundary

Local preparation ends with reviewed code, green tests and a deployable PR. Live completion requires verified Free account, secret/receipt transfer, matching receipt digest/count, old sender stopped, migration route disabled, stable endpoint configuration, Discord PING/help and duplicate replay. Never describe preparation as live migration.

### Task 4: Live GitHub client compatibility

- [x] Reproduce default Python User-Agent 403 versus explicit SM client 200 and shared remote GitHub quota 403/zero remaining.
- [x] Pin failures in real Worker tests (required temporary token and outbound Authorization) and actual inline sender tests (signed token binding, User-Agent, read scopes and secret-safe failures).
- [x] Forward only authenticated per-request Actions token to fixed GitHub verifier; set sender identity/read scopes; update privacy and synchronized template. Ten Worker tests and five sender tests green.
- [ ] Fresh review the two small compatibility changes, merge and redeploy; replay known already-sent run from GitHub and require duplicate.
