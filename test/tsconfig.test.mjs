import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, test } from 'node:test';
import checkImports from '../dist/api/index.mjs';
import { fixture, names, startRegistry } from './helpers.mjs';

let registry;
before(async () => {
  registry = await startRegistry();
});
after(() => registry.close());

const check = async (files) => {
  const dir = await fixture({ 'package.json': { name: 'p' }, ...files });
  return (await checkImports({ directoryPath: dir }))[0].result;
};
const added = async (files) => names((await check(files)).added);

test('specifiers that match tsconfig paths are skipped', async () => {
  const result = await added({
    'tsconfig.json': {
      compilerOptions: { paths: { '@app/*': ['./src/*'], '@config': ['./config.ts'], 'lib-*': ['./lib/*'] } },
    },
    'src/utils/x.ts': 'export {};',
    'config.ts': 'export {};',
    'lib/shared/index.js': 'export {};',
    'src/a.ts': [
      "import '@app/utils/x';",
      "import '@config';",
      "import 'lib-shared';",
      "import '@config/sub';",
      "import '@application/real';",
      "import 'real-dep';",
    ].join('\n'),
  });
  assert.deepEqual(result, ['@application/real', '@config/sub', 'real-dep']);
});

test('paths come through extends, and jsconfig.json works too', async () => {
  assert.deepEqual(
    await added({
      'tsconfig.base.json': { compilerOptions: { paths: { '@lib/*': ['./lib/*'] } } },
      'tsconfig.json': { extends: './tsconfig.base.json' },
      'lib/x.ts': 'export {};',
      'a.ts': "import '@lib/x'; import 'real-dep';",
    }),
    ['real-dep'],
  );
  assert.deepEqual(
    await added({
      'jsconfig.json': { compilerOptions: { paths: { 'components/*': ['./src/components/*'] } } },
      'src/components/Button.jsx': 'export {};',
      'a.js': "import 'components/Button'; import 'real-dep';",
    }),
    ['real-dep'],
  );
});

test('paths from referenced projects count (a solution-style tsconfig)', async () => {
  assert.deepEqual(
    await added({
      'tsconfig.json': { files: [], references: [{ path: './tsconfig.app.json' }] },
      'tsconfig.app.json': { compilerOptions: { paths: { '@ui/*': ['./src/ui/*'] } }, include: ['src'] },
      'src/ui/button.tsx': 'export {};',
      'src/a.tsx': "import '@ui/button'; import 'react';",
    }),
    ['react'],
  );
});

test('each file uses its closest config', async () => {
  const dir = await fixture({
    'package.json': { name: 'root' },
    'tsconfig.json': { compilerOptions: { paths: { '@root/*': ['./*'] } } },
    'x.ts': 'export {};',
    'a.ts': "import '@root/x'; import '@pkg/x';",
    'packages/p/package.json': { name: 'p' },
    'packages/p/tsconfig.json': { compilerOptions: { paths: { '@pkg/*': ['./src/*'] } } },
    'packages/p/src/x.ts': 'export {};',
    'packages/p/b.ts': "import '@pkg/x'; import '@root/x';",
  });
  assert.deepEqual(
    (await checkImports({ directoryPath: dir })).map(({ result }) => names(result.added)),
    [['@pkg/x'], ['@root/x']],
  );
});

test('the longest matching pattern wins, and a target that does not exist falls back to the package', async () => {
  const result = await check({
    'tsconfig.json': {
      compilerOptions: { paths: { '@prisma/*': ['./generated/*'], '@prisma/extra/*': ['./none/*'] } },
    },
    'generated/client.ts': 'export {};',
    'a.ts': "import '@prisma/client'; import '@prisma/adapter-neon'; import '@prisma/extra/x';",
  });
  assert.deepEqual(names(result.added), ['@prisma/adapter-neon', '@prisma/extra']);
});

test('an aliased import that package.json lists counts as used', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', dependencies: { '@prisma/client': '^7.0.0', unused: '1.0.0' } },
    'tsconfig.json': { compilerOptions: { paths: { '@prisma/*': ['./generated/*'] } } },
    'generated/client.ts': 'export {};',
    'a.ts': "import '@prisma/client';",
  });
  const [{ dependencies, result }] = await checkImports({ directoryPath: dir });
  assert.deepEqual(dependencies, ['@prisma/client']);
  assert.deepEqual(names(result.existing), ['@prisma/client']);
  assert.deepEqual(names(result.removed), ['unused']);
  assert.deepEqual(result.added, []);
});

test('an aliased devDependency is not misplaced', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', devDependencies: { '@prisma/client': '^7.0.0' } },
    'tsconfig.json': { compilerOptions: { paths: { '@prisma/*': ['./generated/*'] } } },
    'generated/client.ts': 'export {};',
    'a.ts': "import '@prisma/client';",
  });
  const [{ result }] = await checkImports({ directoryPath: dir });
  assert.deepEqual(result.misplaced, []);
});

test('a paths entry that points at a workspace package with that name is a real import', async () => {
  const dir = await fixture({
    'tsconfig.base.json': {
      compilerOptions: { paths: { '@scope/*': ['./packages/*/src'], '@app/*': ['./packages/app/src/*'] } },
    },
    'packages/core/package.json': { name: '@scope/core' },
    'packages/core/src/index.ts': 'export {};',
    'packages/app/package.json': {
      name: '@scope/app',
      dependencies: { '@scope/core': '^1.0.0', '@scope/other': '^1.0.0' },
    },
    'packages/app/tsconfig.json': { extends: '../../tsconfig.base.json' },
    'packages/app/src/index.ts': "import '@scope/core'; import '@scope/util'; import '@app/local';",
    'packages/app/src/local.ts': 'export {};',
    'packages/util/package.json': { name: '@scope/util' },
    'packages/util/src/index.ts': 'export {};',
  });
  const [{ result }] = await checkImports({ directoryPath: path.join(dir, 'packages/app') });
  assert.deepEqual(names(result.existing), ['@scope/core']);
  assert.deepEqual(names(result.added), ['@scope/util']);
  assert.deepEqual(names(result.removed), ['@scope/other']);
});

test('baseUrl: a bare specifier that is a file or folder under baseUrl is skipped', async () => {
  assert.deepEqual(
    await added({
      'tsconfig.json': { compilerOptions: { baseUrl: './src' } },
      'src/utils/format.ts': 'export {};',
      'src/components/index.tsx': 'export {};',
      'src/a.ts': "import 'utils/format'; import 'components'; import 'real-dep';",
    }),
    ['real-dep'],
  );
});

test('a broken tsconfig or a missing referenced one is ignored', async () => {
  assert.deepEqual(await added({ 'tsconfig.json': '{ not json', 'a.ts': "import 'real-dep';" }), ['real-dep']);
  assert.deepEqual(
    await added({
      'tsconfig.json': {
        compilerOptions: { paths: { '@x/*': ['./*'] } },
        references: [{ path: './tsconfig.missing.json' }],
      },
      'y.ts': 'export {};',
      'a.ts': "import '@x/y'; import 'real-dep';",
    }),
    ['real-dep'],
  );
});

test('project references that point at each other end', async () => {
  assert.deepEqual(
    await added({
      'tsconfig.json': { files: [], references: [{ path: './tsconfig.a.json' }] },
      'tsconfig.a.json': {
        compilerOptions: { paths: { '@a/*': ['./*'] } },
        references: [{ path: './tsconfig.json' }],
      },
      'x.ts': 'export {};',
      'a.ts': "import '@a/x'; import 'real-dep';",
    }),
    ['real-dep'],
  );
});

test('a broken package.json at an alias target counts as another package', async () => {
  const dir = await fixture({
    'package.json': { name: 'p' },
    'tsconfig.json': { compilerOptions: { paths: { '@gen/*': ['./gen/*'] } } },
    'gen/package.json': '{ broken',
    'gen/client.ts': 'export {};',
    'a.ts': "import '@gen/client';",
  });
  const [{ result }] = await checkImports({ directoryPath: dir, ignorePath: 'gen/**' });
  assert.deepEqual(result.added, []);
});
