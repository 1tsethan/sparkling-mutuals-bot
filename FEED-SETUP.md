# Activate GitHub announcements on this computer

The prepared integration watches successful official master push builds and published stable/beta releases. The bot verifies GitHub metadata and all three target JARs before posting, and keeps encrypted receipts to prevent duplicate announcements. No Hypixel key is used; stats stay disabled.

## Private local configuration

1. Run Configure-Feeds.cmd once. At its hidden prompt, right-click Paste the latest Discord bot token and press Enter. This creates account-protected configuration under %LOCALAPPDATA%/SparklingMutualsBot/secrets.dpapi. It generates separate signing and receipt-encryption keys; their plaintext values are not printed or written to source files.
2. Keep the protected configuration file and receipt database. They are tied to this Windows account; losing its profile/key material can prevent reading existing receipts. To replace only the bot token later, run `node tools/configure-feeds.ts --replace-token`. Both other keys are preserved. Do not delete the receipt database to retry an uncertain announcement.
3. Stop the old Start-Local.cmd bot with Ctrl+C, then run Start-Feeds.cmd. Keep the tunnel running. Start-Feeds uses the protected settings and encrypted receipts.sqlite in the same private directory, enables release notices and leaves stats disabled.

## GitHub configuration

In johnceoskyblock/sparkling-mutuals > Settings > Secrets and variables > Actions:

- Add repository variable SM_NOTIFICATION_URL with the active HTTPS tunnel address plus /notifications. The initial address is https://neighbor-restrictions-towers-extra.trycloudflare.com/notifications. Restarting the Quick Tunnel changes its hostname, so update both this variable and Discord's /interactions URL whenever that happens.
- Run Copy-Notification-Secret.cmd yourself. It copies only the notification signing secret into your clipboard, without displaying it. Paste it into the repository secret named SM_NOTIFICATION_SECRET and submit the form yourself. Never paste the bot token, Hypixel key or receipt-encryption key into GitHub. Replace clipboard contents afterward.
- Merge the reviewed .github/workflows/discord-notify.yml and beta-publisher changes into master when ready. The workflow checks out no repository code and executes no build artifacts. It does not rebuild or republish the mod. Its failure is visible in its own workflow run.

The automatic path runs after eligible workflows complete. For a controlled first test or an explicitly reviewed retry, use Actions > Discord notifications > Run workflow on master, select action or release and supply an existing successful official push workflow run ID. The bot verifies that ID again. This posts a real notice for that run; it does not fabricate a build. Repeating a confirmed notice returns duplicate without posting another message.

## Verification and recovery

- Check /health through the current HTTPS tunnel, then /help privately in SM bot-commands.
- Confirm one eligible master build appears once in action-releases with all three artifact links, and confirm replay does not create another post.
- Stable releases belong in releases; tags vX.Y.Z-beta.N must have matching internal versions and GitHub prerelease=true, and belong in beta-releases. Unsupported/mismatched tags are rejected. The mod update checker continues to exclude prereleases.
- Use Review-Receipts.cmd to list announcement receipt states privately on this computer. For an uncertain/pending send, inspect the target channel and notice footer before reconciling an existing message. `node tools/local-receipts.ts resolve NOTICE_KEY MESSAGE_ID --confirmed-in-discord` records that confirmation and sends no Discord message. Do not blindly resend or erase an uncertain receipt.
- If storage/key validation fails, preserve the files and stop posting until resolved. Do not generate a replacement receipt key for an existing database.

No Windows autostart, firewall changes, router forwarding or paid service is configured. A Quick Tunnel remains a development connection with a changing hostname and no uptime guarantee; stable local operation needs a stable route later.
