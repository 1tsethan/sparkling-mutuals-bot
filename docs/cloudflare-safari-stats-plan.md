# Cloudflare Safari stats activation

The owner confirmed the Sparkling Mutuals Personal API application is approved on 14 November 2026. Production bot lookups should use that application's key, not the development key. Never request the key in chat, logs, source or command-line arguments.

The existing Cloudflare adapter explicitly rejects stats and currently discards createApp's deferred `after()` callback. The existing Node LookupService rate limits and caches are instance-local, and the Worker currently creates and closes a fresh app per request. Turning on the environment flag or installing a key alone cannot work and would bypass shared limits.

Implement and validate before activation:

- Keep one coordinator Durable Object for all stats interactions. Retain bounded in-memory name/derived-card caches and in-flight coalescing. Preserve provider-wide rate-limit windows across eviction without persisting player identifiers, raw profiles, interaction tokens, or keys. Keyed hashes of Discord user and interaction IDs support cooldowns and duplicate prevention; expired rows are deleted on subsequent command activity. Enforce concurrency and provider 429/reset windows. Do not use alarms or permanent data for player caches; expired bounded in-memory entries are not served and are removed on later access, replacement or actor eviction.
- Return Discord's private deferred response promptly; execute the follow-up with Durable Object `waitUntil` and preserve interaction uniqueness, per-user cooldown, errors and explicit share behavior. Include the bot-commands channel in the allowed Discord destinations.
- Use the existing approved Hypixel application key via a Cloudflare Worker secret supplied with a hidden user-operated prompt. Never log request bodies or headers. Keep stats disabled by default and preserve the existing active notification settings when deploying.
- Exercise actual Workers runtime, including deferred callback delivery, duplicate interactions, cancellation/restarts, fixed quota across eviction, provider 429, cache coalescing, private responses, optional share, foreign-guild/channel rejection and live announcement receipt regression.
- Review current Hypixel API response schema and policy; update the public privacy notice for the implemented retention and providers before activation. Validate the owner's own player data only with their permission or existing explicit instruction; no broad data collection. No change to the independent WebSocket service.
