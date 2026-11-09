# Sparkling Mutuals Discord Bot — Privacy Notice

Effective date: 9 November 2026

This notice covers the Sparkling Mutuals Discord bot (application ID 1568203972978679888) in the Sparkling Mutuals server. The operator is the server owner, Johnkuudra (Discord username ethxn15). This community project is not affiliated with or endorsed by Hypixel.

## Current service

The bot provides private HTTP command responses and verified software release/build announcements. Safari statistics remain disabled pending API approval and separate activation. Cloudflare hosting is being prepared as a replacement for the operator's Windows computer and temporary Cloudflare Tunnel. Until the verified cutover, the Windows host remains in use; after cutover, a dedicated Cloudflare Worker handles HTTPS requests and a SQLite Durable Object stores the encrypted announcement receipts described below. The existing SM WebSocket service is separate.


## Information processed and why

Discord sends the bot the slash-command interaction, including command arguments, interaction ID, server/channel identifiers and requester information. The bot checks the server and channel, verifies Discord's signature and sends a response. It uses Discord user IDs for short command cooldowns and interaction IDs to prevent duplicate work. It does not request ordinary channel message history or link Discord accounts to Minecraft accounts.

When statistics are enabled, the Minecraft username supplied in /tickets, /sparkling or /safari is sent to Mojang to resolve the public player identity. The player's UUID is then sent to Hypixel to request SkyBlock profiles. The bot extracts the requested member's Safari data from the selected profile, including ticket balances, discoveries, catches and available Hunting/Safari fields. Other members' profile data is not retained as a lookup result. Statistics are fetched only in response to a command; the bot does not continuously poll players or keep a statistics history.

Replies are private to the requester by default. Selecting share publishes a successful result in bot-commands. Do not share a result you do not want other server members to see. Errors stay private.

## Retention and storage

The initial Start-Local launcher uses process memory, including an in-memory receipt database. The release-feed service stores software-announcement receipts in an encrypted SQLite database (locally before cutover, in Cloudflare Durable Object storage after cutover) so restarts and retries do not duplicate posts. These receipts contain the public software notice identifier, destination channel ID, Discord message ID when confirmed, content hash and delivery state; they do not contain player statistics or interaction tokens. They remain until the integration is retired or the operator removes them after reconciling delivery. A pending or uncertain receipt is kept for review rather than automatically resent.

The local release-feed configuration saves the bot credential and its separate signing/encryption keys in a Windows account-protected local file. Cloudflare hosting stores those three values as Worker secrets; no Hypixel key is transferred. The migration uses a temporarily enabled authenticated endpoint that transfers encrypted receipts and then closes. The local protected bundle and encrypted receipts may be retained for recovery; any operator-exported cloud receipt backups are also encrypted. Only processes running as that Windows user can normally decrypt that configuration. Secrets, Discord receipt identifiers and receipt content are not intentionally written as plaintext to source files or the persistent receipt database. Interaction payloads and profile results are not intentionally saved to disk. Command duplicate IDs and cooldowns continue to be held in memory with the following limits:

- Derived player results expire after 60 seconds.
- Minecraft name-to-UUID mappings expire after one hour.
- Discord user cooldowns expire after ten seconds.
- Duplicate-interaction IDs expire after fifteen minutes.
- Caches are bounded and expire while idle; closing the service clears the in-memory data.

Statistics caches remain unused while statistics are disabled. In the Cloudflare deployment, registered statistics commands return a private disabled explanation immediately; there are no player lookups, retained interaction tokens or stored command cooldown/duplicate IDs for those disabled requests. Interaction response tokens are handled temporarily to send a reply and are not retained in the receipt database.

Application logs contain timestamps and event/error categories, not command bodies, player identifiers or credentials. Cloudflare hosting has Worker observability disabled in its deployment configuration and does not intentionally log application request headers or bodies. They currently appear in the operator's terminal; terminal scrollback or copies retained by the operator are separate from the bot's in-memory caches. No persistent application log archive is configured by the bot. The retained local encrypted data and any explicitly exported encrypted cloud snapshots serve as recovery copies.

Public replies and support messages remain on Discord under Discord's retention and server moderation controls. Deleting a bot cache does not delete a Discord message or data held independently by another provider.

## Service providers and disclosure

Discord delivers commands and responses; Cloudflare transports HTTPS requests to the local bot before cutover and hosts the bot runtime, Worker secrets and encrypted Durable Object receipt storage after cutover. Cloudflare may retain platform recovery copies and operational metadata under its policies; the operator has not configured an additional cloud application-data backup service. Mojang and Hypixel receive the lookup identifiers described above when statistics are enabled. GitHub hosts this notice and public software information. GitHub Actions sends signed software workflow identifiers to request announcements; the bot reads the official public run/release/artifact metadata before posting. GitHub stores only the dedicated notification signing secret, not the Discord bot token, Hypixel key or local receipt-encryption key. These services may process network metadata and maintain their own logs under their policies:

- [Discord privacy policy](https://discord.com/privacy)
- [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/)
- [Microsoft privacy statement, including Mojang services](https://www.microsoft.com/privacy/privacystatement)
- [Hypixel privacy policy](https://hypixel.net/privacy)
- [GitHub privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)

The bot does not sell user data, use it for advertising, profile relationships or use Discord content to train AI models. Account passwords and personal API keys are not required from members; do not send them to the bot or support channels.

## Support, deletion and reports

For bot issues, privacy questions, data-deletion requests or reports of misuse, contact the server owner **ethxn15** on Discord. You can also use [SM support](https://discord.com/channels/1567856303341051905/1567859199491186749) to request a private conversation with the owner. Do not put credentials or sensitive details in a public support post.

The operator can clear the bot's current memory by stopping it. For a shared bot reply or announcement, provide its message link so the operator can review removal in Discord and any associated receipt. Database deletion is logical deletion and does not guarantee secure erasure from storage media or backups. Requests concerning providers' independent records must also be directed to the relevant provider. You may stop using the bot at any time.

## Changes

Account linking, additional providers or other material changes require an updated notice before those features are enabled. The memory-only trial creates no permanent announcement receipts; the release-feed launcher uses the encrypted receipt retention described above.
