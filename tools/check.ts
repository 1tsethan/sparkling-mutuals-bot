import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
let count = 0;
for (const dir of ['src', 'tools', 'test', 'cloudflare', 'cloudflare/test']) {
  for (const file of readdirSync(dir).filter(name => name.endsWith('.ts'))) {
    const checked = spawnSync(process.execPath, ['--check', join(dir, file)], { stdio: 'inherit' });
    if (checked.status !== 0) process.exit(1);
    count++;
  }
}
console.log('Syntax checked ' + count + ' TypeScript files. This is not static type checking.');
