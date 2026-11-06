import { existsSync } from 'node:fs';
import { readSecret } from '../src/local.ts';
import { copyNotificationSecret, generateLocalSecrets, loadLocalSecrets, localPaths, saveLocalSecrets } from '../src/local-secrets.ts';

try {
  const args = process.argv.slice(2), paths = localPaths();
  if (args.length > 1 || args.some(arg => !['--copy-secret','--replace-token'].includes(arg)))
    throw new Error('Use no arguments, --replace-token, or --copy-secret.');
  if (args.includes('--copy-secret')) {
    copyNotificationSecret(loadLocalSecrets(paths.vault).notificationSecret);
    console.log('Notification signing secret copied privately. Paste it into the GitHub Actions secret named SM_NOTIFICATION_SECRET.');
    console.log('Do not paste it into chat or another field. Clipboard contents remain until you replace them.');
  } else {
    const previous = existsSync(paths.vault) ? loadLocalSecrets(paths.vault) : undefined;
    if (previous && !args.includes('--replace-token')) {
      console.log('Protected bot configuration already exists. Use Start-Feeds.cmd, or --replace-token to update only the bot token.');
    } else {
      const value = generateLocalSecrets(await readSecret(), previous);
      saveLocalSecrets(paths.vault, value);
      value.botToken = ''; value.notificationSecret = ''; value.receiptKey = '';
      console.log('Saved protected local configuration for this Windows account. No plaintext secret file was created.');
      console.log('Keep the protected secrets file and receipt database together. Token replacement preserves the receipt and signing keys.');
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local feed configuration failed.');
  process.exitCode = 1;
}
