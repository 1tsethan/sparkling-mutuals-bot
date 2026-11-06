export const SM_GUILD = '1567856303341051905';
export function loadConfig(env: Record<string, string | undefined> = process.env) {
  function required(name: string) {
    const value = env[name]?.trim();
    if (!value) throw new Error('Missing configuration: ' + name);
    return value;
  }
  function id(name: string, fallback?: string) {
    const value = env[name]?.trim() || fallback || '';
    if (!/^\d{17,22}$/.test(value)) throw new Error('Invalid or missing configuration: ' + name);
    return value;
  }
  function enabled(name: string) {
    if (env[name] !== undefined && !['true', 'false'].includes(env[name]!)) throw new Error('Use true or false for ' + name);
    return env[name] === 'true';
  }
  const guildId = env.SM_GUILD_ID || SM_GUILD;
  if (guildId !== SM_GUILD) throw new Error('This application is restricted to the SM server.');
  const applicationId = id('SM_APPLICATION_ID');
  const publicKey = required('SM_PUBLIC_KEY');
  if (!/^[a-f0-9]{64}$/i.test(publicKey)) throw new Error('SM_PUBLIC_KEY must be the Discord public verification key.');
  const commandChannelId = id('SM_COMMAND_CHANNEL_ID');
  const statsEnabled = enabled('SM_STATS_ENABLED'), notificationsEnabled = enabled('SM_NOTIFICATIONS_ENABLED');
  const botToken = statsEnabled || notificationsEnabled ? required('SM_DISCORD_BOT_TOKEN') : env.SM_DISCORD_BOT_TOKEN || '';
  const apiKey = statsEnabled ? required('SM_HYPIXEL_API_KEY') : '';
  const notificationSecret = notificationsEnabled ? required('SM_NOTIFICATION_SECRET') : '';
  if (notificationsEnabled && notificationSecret.length < 32) throw new Error('SM_NOTIFICATION_SECRET must be at least 32 characters.');
  const developmentBranch = notificationsEnabled ? required('SM_DEVELOPMENT_BRANCH') : '';
  if (developmentBranch && (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(developmentBranch) || developmentBranch.includes('..')))
    throw new Error('Invalid SM_DEVELOPMENT_BRANCH.');
  const channels = {
    stable: id('SM_RELEASE_CHANNEL_ID', '1568145030500057098'),
    action: id('SM_ACTION_CHANNEL_ID', '1568145100683485184'),
    beta: notificationsEnabled ? id('SM_BETA_CHANNEL_ID') : env.SM_BETA_CHANNEL_ID || ''
  };
  if (notificationsEnabled && new Set([commandChannelId, ...Object.values(channels)]).size !== 4)
    throw new Error('Command, stable, beta and action channels must be distinct.');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  return { applicationId, publicKey, commandChannelId, guildId, statsEnabled, notificationsEnabled,
    botToken, apiKey, notificationSecret, developmentBranch, channels,
    githubReadToken: env.SM_GITHUB_READ_TOKEN || '', host: env.HOST || '127.0.0.1', port,
    dataFile: env.SM_DATA_FILE || './data/receipts.sqlite' };
}
