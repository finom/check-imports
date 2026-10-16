import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, test } from 'node:test';
import checkImports from '../dist/api/index.mjs';
import { fixture, names, readJson, runCli, startRegistry } from './helpers.mjs';

let registry;
before(async () => {
  registry = await startRegistry({ vitest: '4.0.0', zod: '4.1.0', lodash: '4.17.21', tsx: '4.0.0' });
});
after(() => registry.close());

test('a package imported only by dev files is added to devDependencies', async () => {
  const dir = await fixture({
    'package.json': { name: 'p' },
    'src/index.ts': "import 'zod';",
    'src/index.test.ts': "import 'vitest'; import 'zod';",
    'test/helper.js': "require('lodash');",
    'scripts/build.mjs': "import 'tsx';",
  });
  const [{ result }] = await checkImports({ directoryPath: dir, update: true });
  assert.deepEqual(result.added.map(({ dependency, type }) => `${dependency}:${type}`).sort(), [
    'lodash:devDependencies',
    'tsx:devDependencies',
    'vitest:devDependencies',
    'zod:dependencies',
  ]);
  const pkg = await readJson(path.join(dir, 'package.json'));
  assert.deepEqual(pkg.dependencies, { zod: '^4.1.0' });
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['lodash', 'tsx', 'vitest']);
});

test('the default dev files', async () => {
  const devFiles = [
    'a.test.ts',
    'a.spec.jsx',
    '__tests__/a.js',
    '__mocks__/a.js',
    'test/a.js',
    'tests/deep/a.ts',
    'e2e/a.ts',
    'src/a.stories.tsx',
    'vite.config.ts',
    'scripts/a.mjs',
  ];
  const dir = await fixture({
    'package.json': { name: 'p' },
    ...Object.fromEntries(devFiles.map((file, i) => [file, `import 'dev-${i}';`])),
    'src/testing.ts': "import 'runtime-0';",
    'src/contest/a.ts': "import 'runtime-1';",
  });
  const [{ result }] = await checkImports({ directoryPath: dir });
  const types = Object.fromEntries(result.added.map(({ dependency, type }) => [dependency, type]));
  for (let i = 0; i < devFiles.length; i++) assert.equal(types[`dev-${i}`], 'devDependencies', devFiles[i]);
  assert.equal(types['runtime-0'], 'dependencies');
  assert.equal(types['runtime-1'], 'dependencies');
});

test('a runtime import listed only in devDependencies is misplaced; update moves it', async () => {
  const dir = await fixture({
    'package.json': {
      name: 'p',
      dependencies: { lodash: '^4.0.0' },
      devDependencies: { zod: '^4.0.0', vitest: '^4.0.0', peer: '1.0.0' },
      peerDependencies: { peer: '^1.0.0' },
    },
    'src/index.ts': "import 'zod'; import 'lodash'; import 'peer';",
    'src/index.test.ts': "import 'vitest';",
  });
  const [{ result }] = await checkImports({ directoryPath: dir });
  assert.deepEqual(result.misplaced, [
    { dependency: 'zod', version: '^4.0.0', type: 'devDependencies', ignore: false },
  ]);

  await checkImports({ directoryPath: dir, update: true });
  const pkg = await readJson(path.join(dir, 'package.json'));
  assert.deepEqual(pkg.dependencies, { lodash: '^4.0.0', zod: '^4.0.0' });
  assert.deepEqual(pkg.devDependencies, { vitest: '^4.0.0', peer: '1.0.0' });
  assert.deepEqual((await checkImports({ directoryPath: dir }))[0].result.misplaced, []);
});

test('a private package is not checked for misplaced dependencies', async () => {
  const dir = await fixture({
    'package.json': { name: 'app', private: true, devDependencies: { react: '^19.0.0' } },
    'src/main.tsx': "import 'react';",
  });
  const [{ result }] = await checkImports({ directoryPath: dir });
  assert.deepEqual(result.misplaced, []);
});

test('processManually false or a devDependencies type leaves a misplaced dependency alone', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', devDependencies: { bundled: '1.0.0', chosen: '1.0.0', moved: '1.0.0' } },
    'src/index.ts': "import 'bundled'; import 'chosen'; import 'moved';",
  });
  const [{ result }] = await checkImports({
    directoryPath: dir,
    processManually: (dependency) =>
      dependency === 'bundled' ? false : dependency === 'chosen' ? { type: 'devDependencies' } : true,
  });
  assert.deepEqual(names(result.misplaced), ['moved']);
});

test('throwError fails on a misplaced dependency', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', devDependencies: { zod: '1' } },
    'index.js': "require('zod');",
  });
  await assert.rejects(
    checkImports({ directoryPath: dir, throwError: true }),
    /package\.json has 1 dependencies to move to "dependencies" \(zod\)/,
  );
});

test('devPath replaces the default dev files; --dev-path takes a comma-separated list', async () => {
  const files = {
    'package.json': { name: 'p' },
    'src/a.test.ts': "import 'vitest';",
    'qa/check.ts': "import 'lodash';",
    'tools/x.ts': "import 'tsx';",
  };
  const dir = await fixture(files);
  const [{ result }] = await checkImports({ directoryPath: dir, devPath: 'qa/**' });
  assert.deepEqual(result.added.map(({ dependency, type }) => `${dependency}:${type}`).sort(), [
    'lodash:devDependencies',
    'tsx:dependencies',
    'vitest:dependencies',
  ]);

  await runCli(['--dev-path', 'qa/**,tools/**', '-u'], { cwd: dir, env: { npm_config_registry: registry.url } });
  const pkg = await readJson(path.join(dir, 'package.json'));
  assert.deepEqual(pkg.dependencies, { vitest: '^4.0.0' });
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['lodash', 'tsx']);
});

test('the CLI prints misplaced dependencies and where added ones go', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', devDependencies: { zod: '1.0.0' } },
    'index.js': "require('zod'); require('lodash');",
    'index.test.js': "require('vitest');",
  });
  const { stdout } = await runCli([], { cwd: dir, env: { npm_config_registry: registry.url } });
  assert.match(stdout, /2 dependencies to add\n- lodash@\^4\.17\.21\n- vitest@\^4\.0\.0 \(devDependencies\)\n/);
  assert.match(stdout, /1 dependencies to move to "dependencies"\n- zod@1\.0\.0/);
  assert.match(stdout, /can be automatically updated/);
});

test('type-only imports and .d.ts files are not runtime imports', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', devDependencies: { 'types-only': '1.0.0', 'mixed-inline': '1.0.0' } },
    'src/a.ts': [
      "import type { A } from 'types-only';",
      "export type { B } from 'types-only';",
      "import { type C } from 'mixed-inline';",
      "import type { D } from 'missing-types';",
    ].join('\n'),
    'src/env.d.ts': "import 'declared-types';",
  });
  const [{ result }] = await checkImports({ directoryPath: dir });
  assert.deepEqual(names(result.misplaced), ['mixed-inline']);
  assert.deepEqual(result.added.map(({ dependency, type }) => `${dependency}:${type}`).sort(), [
    'declared-types:devDependencies',
    'missing-types:devDependencies',
  ]);
});

test('a package imported both as a type and at runtime is a runtime import', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', devDependencies: { zod: '4.0.0' } },
    'src/a.ts': "import type { ZodType } from 'zod';",
    'src/b.ts': "import { z } from 'zod';",
  });
  const [{ result }] = await checkImports({ directoryPath: dir });
  assert.deepEqual(names(result.misplaced), ['zod']);
});

test('@types packages count for the package they type', async () => {
  const dir = await fixture({
    'package.json': {
      name: 'p',
      dependencies: { '@types/express': '5.0.0', express: '5.0.0', '@types/unused': '1.0.0' },
      devDependencies: { '@types/json-schema': '7.0.0', '@types/babel__core': '7.0.0' },
    },
    'src/a.ts': [
      "import type { JSONSchema7 } from 'json-schema';",
      "import type { PluginObj } from '@babel/core';",
      "import express from 'express';",
      "import type { Missing } from 'no-types-listed';",
    ].join('\n'),
  });
  const [{ result }] = await checkImports({ directoryPath: dir });
  assert.deepEqual(names(result.added), ['no-types-listed']);
  assert.deepEqual(names(result.removed), ['@types/unused']);
  assert.deepEqual(result.misplaced, []);
});
