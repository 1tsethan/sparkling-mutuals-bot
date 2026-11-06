# Mod repository integration

These are preparation files. The mod repository, publisher and GitHub secrets have not been changed.

## Verified build notifications

After the bot is deployed, review discord-notify.yml and add it as .github/workflows/discord-notify.yml on the mod repository's default branch. Configure SM_NOTIFICATION_URL as a repository variable and SM_NOTIFICATION_SECRET as a repository secret. The latter must match the bot host's dedicated notification secret. No bot token or Hypixel key belongs in GitHub Actions.

The template listens for completed build/release workflows, executes no checked-out code or artifacts, and forwards only the official repository and run identifier. The bot independently verifies that the run is a successful official push, its workflow path and approved branch/tag, and the expected artifacts or release assets. Unapproved branches are rejected rather than posted.

Review the Actions workflow template on GitHub before enabling it. It has not been executed on a GitHub runner in this local environment.

## Beta publication change still required

The current mod publisher in buildSrc/src/main/kotlin/PublishReleaseTask.kt creates a draft with prerelease=false. For the proposed vX.Y.Z-beta.N convention, change publication classification and its tests before publishing a beta:

1. Validate the tag against the version inside all three target JARs.
2. Mark beta tags as GitHub prereleases when staging and verify that classification on existing drafts and published-release no-op checks.
3. Preserve the current exactly-three-target, digest, staging and tag-commit checks.
4. Reject a stable-tag/prerelease or beta-tag/stable mismatch rather than silently reclassifying a published release.
5. Verify beta updates do not displace the latest stable release and are handled correctly by the mod's update checker.
6. Add focused Kotlin tests and run the mod's existing build/release checks in its own checkout.

No untested Kotlin patch is supplied here. The bot rejects incorrectly classified beta publications until the publisher is updated. Modrinth publication is a separate optional integration.

## Credentials and hosting

Select hosting and register the Discord and Hypixel applications separately. The local package can be reviewed and tested without either credential. Keep live feature switches off until those setup steps and an SM-only trial have been completed.
