import { commandDefinitions } from '../src/commands.ts';
import { SM_GUILD } from '../src/config.ts';
import { HttpError, readJson } from '../src/http.ts';
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ guild: SM_GUILD, commands: commandDefinitions }, null, 2));
} else {
  const app = process.env.SM_APPLICATION_ID ?? '', token = process.env.SM_DISCORD_BOT_TOKEN ?? '';
  if (!/^\d{17,22}$/.test(app) || !token || (process.env.SM_GUILD_ID && process.env.SM_GUILD_ID !== SM_GUILD))
    throw new Error('Set the approved SM application and bot token through secret configuration.');
  let receivedResponse = false;
  try {
    const response = await fetch('https://discord.com/api/v10/applications/' + app + '/guilds/' + SM_GUILD + '/commands', {
      method: 'PUT', headers: { Authorization: 'Bot ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(commandDefinitions), redirect: 'error', signal: AbortSignal.timeout(10000)
    });
    receivedResponse = true;
    const saved = await readJson(response);
    if (!Array.isArray(saved) || saved.length !== commandDefinitions.length) throw new Error('Unexpected command response.');
    console.log('Registered ' + saved.length + ' guild commands in SM.');
  } catch (error) {
    const hints: Record<number, string> = {
      400: 'Discord rejected the command data. The command definitions need investigation.',
      401: 'The bot token was rejected. Check that you copied the latest token from Sparkling Mutuals > Bot, not the public key or Hypixel key.',
      403: 'Discord denied access. Check the token belongs to the SM application and that the app is installed in SM with application commands authorized.',
      404: 'Discord could not find or expose the application or server. Check the application and server configuration.',
      429: 'Discord rate limited this request. Wait before trying again.'
    };
    if (error instanceof HttpError) {
      console.error('Command registration failed (HTTP ' + error.status + '). ' +
        (hints[error.status] ?? (error.status >= 500 ? 'Discord is temporarily unavailable. Try again later.' : 'Unexpected HTTP response from Discord.')));
    } else {
      console.error('Command registration failed. ' + (receivedResponse
        ? 'Discord returned an unexpected or unreadable response.'
        : 'The connection to Discord failed or timed out. Check Internet connectivity.'));
    }
    console.error('Credentials and response bodies are not logged.');
    process.exitCode = 1;
  }
}
