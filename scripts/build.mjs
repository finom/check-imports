// Compiles src to dist from a clean folder, so a renamed or deleted module never reaches the tarball.
import { execFileSync } from 'node:child_process';
import { chmodSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
rmSync('dist', { recursive: true, force: true });
// npm run puts node_modules/.bin on PATH
execFileSync('tsc', { stdio: 'inherit', shell: true });
chmodSync('dist/cli.mjs', 0o755);
