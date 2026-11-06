# Sparkling Mutuals Discord Bot — Privacy Notice

Effective date: 6 November 2026

This notice covers the Sparkling Mutuals Discord bot (application ID 1568203972978679888) in the Sparkling Mutuals server. The operator is the server owner, Johnkuudra (Discord username ethxn15). This community project is not affiliated with or endorsed by Hypixel.

## Current service

The bot is being tested on the operator's Windows computer, connected through a temporary Cloudflare Tunnel. The /help command is available for testing. Safari statistics and automatic release announcements are disabled during setup. This notice describes the current handling and the implemented statistics features that will be enabled only after API approval and activation.

## Information processed and why

Discord sends the bot the slash-command interaction, including command arguments, interaction ID, server/channel identifiers and requester information. The bot checks the server and channel, verifies Discord's signature and sends a response. It uses Discord user IDs for short command cooldowns and interaction IDs to prevent duplicate work. It does not request ordinary channel message history or link Discord accounts to Minecraft accounts.

When statistics are enabled, the Minecraft username supplied in /tickets, /sparkling or /safari is sent to Mojang to resolve the public player identity. The player's UUID is then sent to Hypixel to request SkyBlock profiles. The bot extracts the requested member's Safari data from the selected profile, including ticket balances, discoveries, catches and available Hunting/Safari fields. Other members' profile data is not retained as a lookup result. Statistics are fetched only in response to a command; the bot does not continuously poll players or keep a statistics history.

Replies are private to the requester by default. Selecting share publishes a successful result in bot-commands. Do not share a result you do not want other server members to see. Errors stay private.

## Retention and storage

The current launcher uses process memory, including an in-memory receipt database. It does not intentionally save credentials, interaction payloads, player profiles or interaction receipts to disk.

- Derived player results expire after 60 seconds.
- Minecraft name-to-UUID mappings expire after one hour.
- Discord user cooldowns expire after ten seconds.
- Duplicate-interaction IDs expire after fifteen minutes.
- Caches are bounded and expire while idle; closing the service clears the in-memory data.

Statistics caches remain unused while statistics are disabled. Interaction response tokens are handled temporarily to send a reply and are not retained in the receipt database.

Application logs contain timestamps and event/error categories, not command bodies, player identifiers or credentials. They currently appear in the operator's terminal; terminal scrollback or copies retained by the operator are separate from the bot's in-memory caches. No persistent application log archive or application-data backup is configured for this trial.

Public replies and support messages remain on Discord under Discord's retention and server moderation controls. Deleting a bot cache does not delete a Discord message or data held independently by another provider.

## Service providers and disclosure

Discord delivers commands and responses; Cloudflare transports HTTPS requests to the local bot. Mojang and Hypixel receive the lookup identifiers described above when statistics are enabled. GitHub hosts this notice and the project's public software information. These services may process network metadata and maintain their own logs under their policies:

- [Discord privacy policy](https://discord.com/privacy)
- [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/)
- [Microsoft privacy statement, including Mojang services](https://www.microsoft.com/privacy/privacystatement)
- [Hypixel privacy policy](https://hypixel.net/privacy)
- [GitHub privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)

The bot does not sell user data, use it for advertising, profile relationships or use Discord content to train AI models. Account passwords and personal API keys are not required from members; do not send them to the bot or support channels.

## Support, deletion and reports

For bot issues, privacy questions, data-deletion requests or reports of misuse, contact the server owner **ethxn15** on Discord. You can also use [SM support](https://discord.com/channels/1567856303341051905/1567859199491186749) to request a private conversation with the owner. Do not put credentials or sensitive details in a public support post.

The operator can clear the bot's current memory by stopping it. For a shared bot reply, provide its message link so the operator can review removal in Discord. Requests concerning providers' independent records must also be directed to the relevant provider. You may stop using the bot at any time.

## Changes

Persistent storage, release-notification receipts, account linking, additional providers or other material changes require an updated notice before those features are enabled. The current trial does not create permanent release-announcement receipts because release feeds are disabled.
