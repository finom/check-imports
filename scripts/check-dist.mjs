// Packs the package, installs the tarball into an empty project and runs it the way a user would:
// the bin, the ESM import, require(esm), no deep imports, and the published types.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const shell = process.platform === 'win32';
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', shell, stdio: 'pipe' }).trim();
const fail = (message) => {
  console.error(`check:dist: ${message}`);
  process.exit(1);
};

run('npm', ['run', 'build'], root);
const dir = mkdtempSync(path.join(os.tmpdir(), 'check-imports-dist-'));
try {
  run('npm', ['pack', '--pack-destination', dir], root);
  const tarball = readdirSync(dir).find((file) => file.endsWith('.tgz'));
  const { version } = JSON.parse(
    run('npm', ['pkg', 'get', 'version', '--json'], root).replace(/^"(.*)"$/, '{"version":"$1"}'),
  );
  const files = run('tar', ['-tzf', path.join(dir, tarball)], dir).split('\n');
  const outside = files.filter(
    (file) => !/^package\/(dist\/|package\.json$|README\.md$|LICENSE$|CHANGELOG\.md$)/.test(file),
  );
  if (outside.length) fail(`unexpected files in the tarball: ${outside.join(', ')}`);

  writeFileSync(path.join(dir, 'package.json'), '{"name":"consumer","private":true,"type":"module"}');
  run('npm', ['install', '--no-audit', '--no-fund', `./${tarball}`], dir);

  if (run('npx', ['check-imports', '--version'], dir) !== version) fail('the bin prints a wrong version');

  const esm = run(
    process.execPath,
    ['--input-type=module', '-e', "import c from 'check-imports'; console.log(typeof c)"],
    dir,
  );
  if (esm !== 'function') fail(`import gives ${esm}`);

  const cjs = run(process.execPath, ['-e', "console.log(typeof require('check-imports').default)"], dir);
  if (cjs !== 'function') fail(`require gives ${cjs}`);

  try {
    run(process.execPath, ['--input-type=module', '-e', "import 'check-imports/dist/api/index.mjs'"], dir);
    fail('a deep import resolves');
  } catch (error) {
    if (!String(error.stderr).includes('ERR_PACKAGE_PATH_NOT_EXPORTED')) throw error;
  }

  // the installed package checks its consumer: one file importing a missing package
  writeFileSync(path.join(dir, 'index.js'), "import 'check-imports';\nimport 'not-installed-anywhere-0';\n");
  const output = run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import c from 'check-imports'; const [r] = await c({ ignorePath: 'node_modules/**' }); console.log(JSON.stringify(r.result.added.map((d) => d.dependency).concat(r.result.existing.map((d) => d.dependency))))",
    ],
    dir,
  );
  if (output !== '["not-installed-anywhere-0","check-imports"]') fail(`unexpected result ${output}`);

  // the published declarations, as a consumer's TypeScript sees them
  copyFileSync(path.join(root, 'test/types/consumer.mts'), path.join(dir, 'consumer.mts'));
  writeFileSync(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { target: 'es2023', module: 'nodenext', strict: true, noEmit: true, types: [] },
      files: ['consumer.mts'],
    }),
  );
  run(path.join(root, 'node_modules/.bin/tsc'), ['-p', dir], dir);

  console.log(`check:dist: ${tarball} (${files.length} files) installs and runs`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
