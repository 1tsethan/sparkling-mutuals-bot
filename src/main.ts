import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadConfig } from './config.ts';
import { BotError } from './profile.ts';
import { LookupService } from './lookup.ts';
import { DiscordClient } from './discord.ts';
import { ReceiptStore } from './store.ts';
import { ReleaseNotifier } from './releases.ts';
import { createApp } from './app.ts';
import { createHttpServer } from './server.ts';

try {
  const config = loadConfig();
  mkdirSync(dirname(resolve(config.dataFile)), { recursive: true });
  const store = new ReceiptStore(config.dataFile);
  const log = (code: string) => console.log(JSON.stringify({ at: new Date().toISOString(), event: code }));
  const discord = new DiscordClient({ token: config.botToken, applicationId: config.applicationId,
    guildId: config.guildId, allowedChannels: [config.commandChannelId, ...Object.values(config.channels)].filter(Boolean) });
  const lookup = new LookupService({ apiKey: config.apiKey });
  const notifier = config.notificationsEnabled ? new ReleaseNotifier({
    secret: config.notificationSecret, developmentBranch: config.developmentBranch, channels: config.channels,
    store, discord, githubReadToken: config.githubReadToken
  }) : undefined;
  const app = createApp({
    ...config, discord, lookup: { lookup: name => {
      if (!config.statsEnabled) throw new BotError('disabled', 'Stats commands are not enabled yet.');
      return lookup.lookup(name);
    } },
    claimInteraction: id => store.claimInteraction(id),
    notify: async (headers, body) => {
      if (!notifier) throw new BotError('disabled', 'Notifications are not enabled.');
      return notifier.notify(headers, body);
    }, log
  });
  const server = createHttpServer(app, log);
  const closeResources = () => { app.close(); lookup.close(); store.close(); };
  server.on('error', () => { log('server_start_failed'); closeResources(); process.exitCode = 1; });
  server.listen(config.port, config.host, () => log('server_ready'));
  const stop = () => {
    server.close(() => { closeResources(); process.exit(0); });
    setTimeout(() => process.exit(1), 25000).unref();
  };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith('Missing configuration:') ? error.message :
    'Bot configuration is invalid. Check the required settings in README.md.');
  process.exitCode = 1;
}
