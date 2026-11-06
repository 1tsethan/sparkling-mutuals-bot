# Sparkling Mutuals Discord Bot

Local implementation of the approved SM bot design. It provides /tickets, /sparkling, /safari and /help through signed HTTP interactions and verifies stable, beta and action-build announcements before posting as the same bot.

The Discord application has been created under ethxn15 and its bot installed in Sparkling Mutuals, with the existing blue sparkle SM logo as its avatar. It is private, supports guild installation only, and was authorized for View Channels, Send Messages and Embed Links. Its public application ID, verification key and actual bot-commands channel ID are recorded in .env.example. No bot token was displayed or reset.

The service has not been deployed and commands are not active. The Hypixel application, hosting, secret configuration, beta channel ID and approved development branch still need to be configured. Publish the privacy policy and deletion/support contact and verify encrypted storage before operation. The mod repository is unchanged. The existing mod's beta publisher also needs the changes described in integration/README.md.

## Local checks

Requires Node 24.18 or newer. Runtime dependencies are all built into Node; no npm install is needed.

Run from this folder:

    node --test test/*.test.ts
    node tools/check.ts
    node tools/demo.ts
    node tools/register.ts
    node tools/notify.ts --kind action --run-id 10

The last three commands print fictional responses, a command registration preview, and an unsigned notification preview. They do not send requests. npm test and npm run check invoke the same checks on hosts with a normal Node/npm shell setup.

Local verification on 6 November 2026: 38/38 controlled tests passed and all 28 TypeScript files passed syntax checks, including the local-startup helper and safe registration diagnostics. The original service received a fresh code review and regression fixes. See ../bot-progress.md for the decisions and verification record. On this preparation host, npm's command shell could not find Node; the direct node commands above were used successfully.

The owner selected local hosting and started both the bot and an approved temporary Cloudflare tunnel. Four SM guild commands are registered, localhost and public HTTPS health checks return status ok, and Discord accepted the interaction endpoint. A real /help invocation in bot-commands returned the expected private response with support and download links. Statistics and release feeds remain disabled, and receipts remain in memory. See LOCAL-START.md for launch instructions. The tunnel address changes when restarted; both user-run windows must remain open.

The separate public repository is https://github.com/1tsethan/sparkling-mutuals-bot. It currently contains the public privacy notice and setup overview; runtime source remains in this local project. The [privacy notice](https://github.com/1tsethan/sparkling-mutuals-bot/blob/main/PRIVACY.md) is linked from the Discord Developer Portal, bot profile and command-channel topic. Contact Discord user ethxn15, or request a private conversation through SM support, for privacy/deletion questions.

Syntax checks are not static TypeScript type checking. The current preparation environment cannot resolve the npm registry, so a TypeScript compiler could not be installed. Its networking also blocks loopback HTTP connections. Controlled tests exercise the real request handler with in-process Node streams and fixture fetch responses. User-launched service sockets, HTTPS routing and Discord help rendering are now verified through the browser. Live Hypixel data, release posting, Docker and GitHub Actions execution remain unverified.

## Configure later

Copy .env.example to a private .env only when ready to configure a deployment, or supply the equivalent host environment variables. Start with both feature switches false.

- SM_APPLICATION_ID and SM_PUBLIC_KEY identify the Discord application.
- SM_COMMAND_CHANNEL_ID must be the new SM bot-commands channel.
- SM_DISCORD_BOT_TOKEN and SM_HYPIXEL_API_KEY go in the host's secret configuration.
- SM_STATS_ENABLED enables stats lookups only when set to true.
- SM_NOTIFICATIONS_ENABLED enables signed release notifications only when set to true. It requires the notification secret, beta channel ID, distinct feed channels and explicitly selected development branch.
- SM_NOTIFICATION_SECRET is a separate random secret shared only by the host and the GitHub notification workflow.
- SM_GITHUB_READ_TOKEN is optional. If public GitHub limits prove insufficient, use a narrowly scoped read credential for the official repository, with no mutation permissions.
- SM_DATA_FILE must reside on durable storage. Keep one service instance using that SQLite file; shared caches/budgets are not yet designed for multiple independent replicas.

The server always restricts guild access to Sparkling Mutuals. Every public message destination is checked against Discord's actual guild metadata. No Administrator, moderation or message-content access is required.

## Run after configuration

    node --env-file-if-exists=.env src/main.ts

The default listener is 127.0.0.1:3000. Put it behind an HTTPS reverse proxy for Discord's public /interactions endpoint. /notifications accepts only timestamped HMAC-signed requests. GET /health reports service liveness without disclosing configuration. Keep deployment/provider access logs free of interaction tokens, request bodies and player identifiers.

Dockerfile is provided for a host with a durable /app/data volume and secret injection. The image has no npm installation step and runs as the node user. Review the base-image version and build/test the image on the selected host; no Docker build has been verified here.

## Register commands

Review the preview first. When the owner has chosen the application and installed it in SM, configure its bot token privately and run:

    node --env-file-if-exists=.env tools/register.ts --apply

This replaces this application's SM guild command list with the four commands in src/commands.ts. It does not register global commands. It should be reviewed before use with any pre-existing application that already has other commands.

Slash commands require a Minecraft player argument. Responses start private. Choosing share sends a successful result to the configured command channel while leaving errors private. /sparkling has a biome choice for filtering its species list.

## Release integration

See integration/README.md. Notifications require successful official push workflows and the three expected target artifacts or digest-bearing release JARs. Reruns use durable notice identities rather than posting blindly.

The notifier verifies the publication metadata and the successful expected workflow; it does not download and execute JARs. The underlying mod CI remains responsible for verifying the actual distributions.

No release or action notice is sent by an ordinary stats command. PRs, forks, failed builds, foreign repositories and mismatched beta tags are rejected. No mass mentions are enabled.

## Uncertain sends and receipts

A durable pending receipt is written before sending. A confirmed Discord ID marks it sent. A 429 can be retried after its documented delay. A timeout, lost response or crash leaves the record requiring review; subsequent deliveries will not blindly create another message.

Inspect the local receipt list:

    node --env-file-if-exists=.env tools/receipts.ts

If a message exists, an operator must inspect the destination and compare its notice footer with the receipt key before recording its ID:

    node --env-file-if-exists=.env tools/receipts.ts resolve NOTICE_KEY MESSAGE_ID --confirmed-in-discord

This records a human-confirmed existing message; it sends nothing and does not independently inspect Discord. If no message can be confirmed, leave the uncertain record in place until an operator resolves the delivery outcome. This favors preventing duplicates over automatic resend after ambiguous failures.

## Data retention and operations

Derived profiles expire after 60 seconds, name mappings after one hour, and member cooldowns after ten seconds. These memory caches are bounded, are deleted by timers even while idle, and are cleared on restart. Duplicate interaction IDs are purged from SQLite on their fifteen-minute deadline while running, or at startup following downtime; they do not contain interaction tokens or player statistics. This is logical database deletion, not guaranteed secure erasure from storage media or backups. Software-notification receipts persist until the integration is retired.

Profile data and credentials are not logged by the application. Logs contain timestamp and error category only. Configure the host's log retention to seven days as proposed, and check any provider-level request logging before publishing the data notice. Disabling stats or notifications separately is supported by the feature switches; restart after changing configuration.

## Source references

The Safari roster and parsing behavior were reviewed against SM commit f2cccafc33f0b7a391a8531189e12a0214303660. The roster credits CritterMod v0.9.0, commit cdfcb8effb4b3158df50f0c0960c11e536931840. The bot is a separate project; its repository and license have not yet been selected.

- https://github.com/johnceoskyblock/sparkling-mutuals/blob/f2cccafc33f0b7a391a8531189e12a0214303660/src/main/kotlin/net/johnceo/sparklingmutuals/api/SafariProfile.kt
- https://github.com/johnceoskyblock/sparkling-mutuals/blob/f2cccafc33f0b7a391a8531189e12a0214303660/src/main/kotlin/net/johnceo/sparklingmutuals/safari/SafariRoster.kt
- https://docs.discord.com/developers/interactions/overview
- https://docs.discord.com/developers/interactions/receiving-and-responding
- https://docs.discord.com/developers/resources/message
- https://developer.hypixel.net/policies/
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run
