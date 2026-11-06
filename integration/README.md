# Mod repository integration

The adjacent discord-notify.yml is the tested template for .github/workflows/discord-notify.yml in johnceoskyblock/sparkling-mutuals. The same file is prepared on the isolated codex/discord-release-notifications mod branch, along with beta-publisher classification checks. It is not active until that change reaches master and its configuration is supplied.

See [FEED-SETUP.md](../FEED-SETUP.md) for local configuration, GitHub variable/secret names, a controlled official-run test and manual receipt reconciliation.

The workflow responds to completed official build/release workflows. Action builds must be successful master pushes; releases must use vX.Y.Z or vX.Y.Z-beta.N tags. A manual workflow test takes a real official run ID and is permitted only from master. The workflow checks out no repository code and executes no artifacts or downloaded scripts. It has contents:read only. Its inline Python sender is exercised by scripts/test_discord_notify.py in the mod change.

The bot independently validates the HMAC, official repository/run metadata, workflow path, branch/tag and all three artifact or JAR targets. A failed notification marks only the dedicated notification workflow as failed; it does not rebuild or republish software. Pending or uncertain sends require receipt review rather than a blind retry.

GitHub stores only SM_NOTIFICATION_SECRET for this connection. The bot token and receipt-encryption key remain protected on the local Windows host. Hypixel is not involved in GitHub announcements, and stats stay disabled.

Beta publication has a prepared, regression-tested change: beta tags become GitHub prereleases and cannot become latest stable; stable/beta classification mismatches on drafts and published releases are rejected. Existing three-target, tag-commit, digest, staged-upload and published-immutability checks remain. The mod update checker already excludes drafts and prereleases. Modrinth publication remains a separate integration.
