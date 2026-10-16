import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import checkImports from '../dist/api/index.mjs';
import { fixture, gitInit, names, runCli, startRegistry } from './helpers.mjs';

let registry;
before(async () => {
  registry = await startRegistry();
});
after(() => registry.close());

const files = {
  'package.json': { name: 'p' },
  '.gitignore': 'dist/\n*.generated.js\n',
  'src/a.js': "require('tracked');",
  'src/untracked.js': "require('untracked-not-ignored');",
  'dist/bundle.js': "require('from-dist');",
  'src/x.generated.js': "require('from-generated');",
  'packages/sub/.gitignore': 'out/\n',
  'packages/sub/out/c.js': "require('from-nested-ignored');",
  'packages/sub/d.js': "require('nested-kept');",
};

const added = async (dir, options) => names((await checkImports({ directoryPath: dir, ...options }))[0].result.added);

test('in a git repo, files that .gitignore lists are skipped, nested .gitignore files included', async () => {
  const dir = await fixture(files);
  await gitInit(dir, ['package.json', '.gitignore', 'src/a.js']);
  assert.deepEqual(await added(dir), ['nested-kept', 'tracked', 'untracked-not-ignored']);
});

test('.git/info/exclude counts too', async () => {
  const dir = await fixture({
    'package.json': { name: 'p' },
    'a.js': "require('kept');",
    'local/b.js': "require('excluded');",
  });
  await gitInit(dir);
  await fs.appendFile(path.join(dir, '.git/info/exclude'), 'local/\n');
  assert.deepEqual(await added(dir), ['kept']);
});

test('a tracked file deleted from the working tree is skipped', async () => {
  const dir = await fixture({
    'package.json': { name: 'p' },
    'a.js': "require('kept');",
    'gone.js': "require('gone');",
  });
  await gitInit(dir, ['package.json', 'a.js', 'gone.js']);
  await fs.rm(path.join(dir, 'gone.js'));
  assert.deepEqual(await added(dir), ['kept']);
});

test('a directoryPath inside the repo lists only its own files', async () => {
  const dir = await fixture(files);
  await gitInit(dir);
  assert.deepEqual(await added(path.join(dir, 'packages/sub')), ['nested-kept']);
  const [{ packagePath, result }] = await checkImports({ directoryPath: path.join(dir, 'src') });
  assert.equal(packagePath, path.join(dir, 'package.json'));
  assert.deepEqual(names(result.added), ['tracked', 'untracked-not-ignored']);
});

test('ignorePath still applies in a git repo', async () => {
  const dir = await fixture(files);
  await gitInit(dir);
  assert.deepEqual(await added(dir, { ignorePath: 'src/untracked.js' }), ['nested-kept', 'tracked']);
});

test('gitignore: false checks ignored files too', async () => {
  const dir = await fixture(files);
  await gitInit(dir);
  assert.deepEqual(await added(dir, { gitignore: false }), [
    'from-dist',
    'from-generated',
    'from-nested-ignored',
    'nested-kept',
    'tracked',
    'untracked-not-ignored',
  ]);
});

test('outside a git repo every file is checked', async () => {
  const dir = await fixture(files);
  assert.equal((await added(dir)).length, 6);
});

test('--no-gitignore', async () => {
  const dir = await fixture(files);
  await gitInit(dir);
  const env = { npm_config_registry: registry.url };
  assert.match((await runCli([], { cwd: dir, env })).stdout, /3 dependencies to add/);
  assert.match((await runCli(['--no-gitignore'], { cwd: dir, env })).stdout, /6 dependencies to add/);
});

test('ignored files that checked code imports are read too, for the importing package', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', dependencies: { 'vovk-ajv': '1.0.0', '@prisma/client': '7.0.0' } },
    '.gitignore': 'src/client/\ngenerated/\ndist/\n',
    'tsconfig.json': { compilerOptions: { paths: { '@/*': ['./src/*'], '@/client': ['./src/client/index.ts'] } } },
    'src/page.tsx': "import { api } from '@/client'; import { db } from '../generated/db.js';",
    'src/client/index.ts': "export const api = import('vovk-ajv'); export * from './schema';",
    'src/client/schema.ts': "import 'from-transitive'; import './index';",
    'generated/package.json': { name: 'generated' },
    'generated/db.ts': "import '@prisma/client';",
    'dist/bundle.js': "require('from-dist');",
  });
  await gitInit(dir);
  const results = await checkImports({ directoryPath: dir });
  assert.equal(results.length, 1);
  const [{ result }] = results;
  assert.deepEqual(names(result.existing), ['@prisma/client', 'vovk-ajv']);
  assert.deepEqual(names(result.added), ['from-transitive']);
  assert.deepEqual(result.removed, []);
});

test('an import resolves .js to .ts, a folder to its index, and skips non-source files', async () => {
  const dir = await fixture({
    'package.json': { name: 'p' },
    '.gitignore': 'gen/\n',
    'a.ts': "import './gen/a.js'; import './gen/folder'; import './gen/styles.css'; import './gen/missing';",
    'gen/a.ts': "import 'from-a';",
    'gen/folder/index.tsx': "import 'from-index';",
    'gen/styles.css': '',
  });
  await gitInit(dir);
  assert.deepEqual(names((await checkImports({ directoryPath: dir }))[0].result.added), ['from-a', 'from-index']);
});

test('a dev file passes its dev status to the ignored files it imports', async () => {
  const dir = await fixture({
    'package.json': { name: 'p' },
    '.gitignore': 'gen/\n',
    'src/a.test.ts': "import '../gen/fixtures';",
    'src/b.ts': "import '../gen/runtime';",
    'gen/fixtures.ts': "import 'dev-only';",
    'gen/runtime.ts': "import 'runtime-dep';",
  });
  await gitInit(dir);
  const [{ result }] = await checkImports({ directoryPath: dir });
  assert.deepEqual(result.added.map(({ dependency, type }) => `${dependency}:${type}`).sort(), [
    'dev-only:devDependencies',
    'runtime-dep:dependencies',
  ]);
});

test('ignorePath files and files outside the directory are not followed', async () => {
  const dir = await fixture({
    'package.json': { name: 'p' },
    '.gitignore': 'gen/\n',
    'src/a.ts': "import '../gen/x'; import './skipped'; import '../outside';",
    'src/skipped.ts': "import 'from-skipped';",
    'gen/x.ts': "import 'from-gen';",
    'outside.ts': "import 'from-outside';",
  });
  await gitInit(dir);
  const [{ result }] = await checkImports({ directoryPath: path.join(dir, 'src'), ignorePath: 'skipped.ts' });
  assert.deepEqual(names(result.added), []);
  const [{ result: fromRoot }] = await checkImports({ directoryPath: dir, ignorePath: 'src/skipped.ts' });
  assert.deepEqual(names(fromRoot.added), ['from-gen', 'from-outside']);
});

test('an ignored file inside another package counts for neither package', async () => {
  const dir = await fixture({
    'packages/a/package.json': { name: 'a' },
    'packages/a/test/x.test.ts': "import '../../b/dist/index.js';",
    'packages/b/package.json': { name: 'b', dependencies: { 'b-dep': '1.0.0' } },
    'packages/b/.gitignore': 'dist/\n',
    'packages/b/src/index.ts': "import 'b-dep';",
    'packages/b/dist/index.js': "import 'b-dep'; import 'b-bundled-dep';",
  });
  await gitInit(dir);
  const byPackage = Object.fromEntries(
    (await checkImports({ directoryPath: dir })).map(({ packagePath, result }) => [
      path.basename(path.dirname(packagePath)),
      names(result.added),
    ]),
  );
  assert.deepEqual(byPackage, { a: [], b: [] });
});
