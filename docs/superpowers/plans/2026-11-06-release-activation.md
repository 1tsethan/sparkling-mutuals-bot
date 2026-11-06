# SM release-feed activation

The approved bot-design-draft.md in the original task is the specification. The owner selected local hosting and now explicitly selected master for action announcements. Retain its signed workflow notification architecture, official-run/artifact verification, three release destinations and no-mention policy. No Hypixel activation is included.

## Decisions and constraints

- Encrypted SQLite receipt payloads use AES-256-GCM; the existing SQLite transaction machinery coordinates competing requests/processes. The lookup key is a SHA-256 digest of the public software notice identifier. Discord IDs and receipt content are encrypted in every database/WAL record. Interaction duplicate IDs remain in memory.
- Windows DPAPI CurrentUser wraps a local secret bundle outside the source tree, containing only the bot token, notification signing secret and receipt-encryption key. Node passes secret material through pipes/environment, never command arguments or logs. Stats stay off.
- A setup tool prompts privately for the bot token once. Updating that token preserves both signing and encryption keys. A separate explicit action copies only the notification signing secret to the user's clipboard for GitHub's secret form; the user handles credential entry/submission.
- GitHub Actions sends identifiers from successful official master build pushes and verified tag releases. The bot independently verifies metadata before posting. A dedicated failed notification workflow must report failure without changing the build/release outcome.
- Beta tags follow the approved vX.Y.Z-beta.N convention, match internal versions and are true GitHub prereleases. Classification mismatches fail before changing a release; existing distribution/tag/digest checks remain.
- Keep the currently running bot unchanged until reviewed changes are copied back and the owner restarts it. Public policy must be updated before durable receipts are enabled.

## Task 1 — encrypted durable receipts

Files: src/encrypted-store.ts, src/store.ts, src/releases.ts, src/config.ts, src/main.ts, tools/receipts.ts, test/encrypted-store.test.ts, test/runtime.test.ts.

Interface: export ReceiptStorage from store.ts with claimInteraction, claim, sent, uncertain, retryable, list and close. Both stores implement it. EncryptedReceiptStore(file: string, key: Buffer, now?: () => number) implements the same contract. Persistent deployment requires a 32-byte key supplied as 64 hexadecimal characters in SM_RECEIPT_KEY. Notification activation rejects in-memory storage. Main and receipt reconciliation select the encrypted implementation for persistent paths.

1. Write tests proving restart duplicate protection and uncertain handling, two connections claiming the same notice, correct retry timing, wrong key/tampering fail closed, and plaintext identifiers absent from database and WAL. Run them; expect missing implementation failures.
2. Implement authenticated per-record encryption, database key sentinel and BEGIN IMMEDIATE transactions. Preserve pending before send and encrypted transitions afterward. Do not silently reset unreadable data.
3. Add configuration tests rejecting enabled feeds without encrypted durable storage; wire runtime and reconciliation.
4. Run node --test --test-reporter=spec test/*.test.ts and node tools/check.ts; require zero failures. Commit the task.

## Task 2 — local secret bundle and feeds launcher

Files: src/local-secrets.ts, src/local.ts, tools/configure-feeds.ts, tools/start-feeds.ts, Configure-Feeds.cmd, Start-Feeds.cmd, Copy-Notification-Secret.cmd, test/local-secrets.test.ts, test/local.test.ts.

Interfaces: protectLocal(value: Buffer): Buffer and unprotectLocal(value: Buffer): Buffer use Windows DPAPI via a fixed PowerShell script and pipes. saveLocalSecrets(file: string, secrets: LocalSecrets) and loadLocalSecrets(file: string) perform bounded validation and atomic protected-file writes. LocalSecrets = {version:1, botToken:string, notificationSecret:string, receiptKey:string}. generateLocalSecrets(token, previous?) preserves notificationSecret/receiptKey on token updates. runLocalFeeds(secrets, baseEnv, dataFile, run) starts src/main.ts with master, known SM channels, notifications enabled, stats disabled and secrets only in environment.

1. Write and watch failing tests for private DPAPI round-trip, foreign/corrupt input failure, key preservation during token updates, no plaintext in the saved bundle, feed-environment isolation and required persistent configuration. Test clipboard transfer with a controlled child runner; do not read the actual clipboard in agent work.
2. Implement fixed-script DPAPI transport with sanitized errors and no inherited SM secret environment. Build user-run entry points with no policy/security-setting changes or Windows autostart.
3. Require --replace-token to overwrite the token; never automatically rotate receipt/signing keys. Expose --copy-secret as an explicit user action only.
4. Run the whole suite and syntax check. Commit the task.

## Task 3 — mod integration and beta classification

Mod files: .github/workflows/discord-notify.yml, scripts/discord_notify.py, scripts/test_discord_notify.py, buildSrc/src/main/kotlin/ReleasePlanner.kt, buildSrc/src/main/kotlin/PublishReleaseTask.kt and focused existing buildSrc tests.

1. Read the actual planner/API/tests. Add failing Kotlin tests for beta flag creation/reading and classification mismatch on drafts and published no-op paths. Keep tag/internal version, three-target/digest and published immutability checks.
2. Implement beta classification and verify the update checker uses stable release discovery. Run the complete buildSrc test suite under installed JDK 25.
3. Add signed notification script and workflow with no checkout/artifact execution, only contents:read, official repository/run filters and master action branch. Read the signing secret from the runner environment, never print it or upstream bodies. Never follow redirects. A manual test accepts a run ID which the bot must independently verify.
4. Add Python tests covering event filtering, exact canonical signed request, redirects, network failure and safe outputs. Run unittest and the relevant Gradle checks. Copy verified integration files into the bot package.
5. Commit changes on the isolated mod branch; prepare a reviewable PR, retaining successful build/release behavior.

## Task 4 — review and activation handoff

Run full Node, Python and buildSrc suites; inspect diffs and secret-free staging. Obtain one fresh-context whole-change review covering both branches; fix Critical/Important findings using a failing test first and repeat relevant suites. Prepare/update public privacy notice for encrypted durable software receipts, retaining truthful disabled stats status.

Push the bot and mod branches and create reviewable PRs. Do not merge shared mod changes without the required final approval. Prepare GitHub's public endpoint variable and secret form; the user performs the private secret entry. The user runs Configure-Feeds.cmd, stops the prior foreground bot and starts Start-Feeds.cmd. Verify health, a real eligible official-build announcement, duplicate replay and private /help. No invented build/release or mass mention is permitted. If activation awaits user-held credentials or merge approval, finish all preparation first and state the concrete remaining steps.

## Review focus

Ciphertext integrity/key loss; SQLite competing claims and process restart; Node/PowerShell secret transport and owner-bound vault; token updates preserving receipt identity; workflow-run trust and no PR/artifact execution; GitHub prerelease classification preserving published releases; temporary endpoint changes; no plaintext API identifiers in persistent data; no live feature activation before the current policy describes it.
