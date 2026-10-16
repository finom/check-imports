import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import checkImports from '../dist/api/index.mjs';
import { fixture, names, startRegistry } from './helpers.mjs';

let registry;
before(async () => {
  registry = await startRegistry();
});
after(() => registry.close());

async function addedFor(files, options = {}) {
  const dir = await fixture({ 'package.json': { name: 'fixture-pkg', version: '1.0.0' }, ...files });
  const results = await checkImports({ directoryPath: dir, ...options });
  assert.equal(results.length, 1);
  return names(results[0].result.added);
}

test('scans .ts, .tsx, .js, .jsx, .mjs, .cjs, .mts and .cts files', async () => {
  const added = await addedFor({
    'a.ts': "import 'from-ts';",
    'b.tsx': "import 'from-tsx';\nexport const B = () => <div />;",
    'c.js': "require('from-js');",
    'd.jsx': "import 'from-jsx';",
    'e.mjs': "import 'from-mjs';",
    'f.cjs': "require('from-cjs');",
    'g.mts': "import 'from-mts';",
    'h.cts': "import x = require('from-cts');",
  });
  assert.deepEqual(added, [
    'from-cjs',
    'from-cts',
    'from-js',
    'from-jsx',
    'from-mjs',
    'from-mts',
    'from-ts',
    'from-tsx',
  ]);
});

test('parses JSX in .js and .jsx files', async () => {
  const added = await addedFor({
    'a.jsx': 'export const A = () => <div title="x">{require(\'inside-jsx\')}</div>;',
    'b.js': "export const B = () => <b>{require('inside-js-jsx')}</b>;",
  });
  assert.deepEqual(added, ['inside-js-jsx', 'inside-jsx']);
});

test('finds every import form', async () => {
  const added = await addedFor({
    'a.ts': [
      "import def from 'default-import';",
      "import * as ns from 'namespace-import';",
      "import 'side-effect-import';",
      "import type { T } from 'type-import';",
      "export * from 'export-star';",
      "export { x } from 'export-named';",
      "import eq = require('import-equals');",
      "const r = require('require-call');",
      "const d = import('dynamic-import');",
      'const t = require(`template-literal`);',
      "function nested() { return require('nested-require'); }",
    ].join('\n'),
  });
  assert.deepEqual(added, [
    'default-import',
    'dynamic-import',
    'export-named',
    'export-star',
    'import-equals',
    'namespace-import',
    'nested-require',
    'require-call',
    'side-effect-import',
    'template-literal',
    'type-import',
  ]);
});

test('skips calls that are not literal requires or imports', async () => {
  const added = await addedFor({
    'a.js': [
      'const name = "x";',
      'require(name);',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: source text of a template literal
      'import(`computed-${name}`);',
      "foo.require('not-a-require');",
      `const s = 'require("in-a-string")';`,
    ].join('\n'),
  });
  assert.deepEqual(added, []);
});

test('maps specifiers to package names', async () => {
  const added = await addedFor({
    'a.js': [
      "require('lodash/pick');",
      "require('@scope/pkg/deep/path');",
      "require('style-loader!css-loader!loaded-module?query=1');",
      "require('with-query?x=1');",
    ].join('\n'),
  });
  assert.deepEqual(added, ['@scope/pkg', 'loaded-module', 'lodash', 'with-query']);
});

test('skips relative paths, built-ins, URLs and names npm cannot publish', async () => {
  const added = await addedFor({
    'a.ts': [
      "import './relative';",
      "import '../parent';",
      "import 'fs';",
      "import 'fs/promises';",
      "import 'node:path';",
      "import 'node:test';",
      "import 'node:sqlite';",
      "import '/absolute/path';",
      "import 'https://esm.sh/remote';",
      "import 'data:text/javascript,export default 1';",
      "import '#internal';",
      "import '@/components/button';",
      "import '~/utils';",
      "import 'real-dep';",
    ].join('\n'),
  });
  assert.deepEqual(added, ['real-dep']);
});

test('skips the package importing itself by name', async () => {
  const added = await addedFor({ 'a.js': "require('fixture-pkg/sub'); require('other');" });
  assert.deepEqual(added, ['other']);
});

test('check-imports-ignore-line ignores the import on its line, at any depth', async () => {
  const added = await addedFor({
    'a.js': [
      "require('top-ignored'); // check-imports-ignore-line",
      'function f() {',
      "  return require('nested-ignored'); // check-imports-ignore-line",
      '}',
      "const x = { a: require('object-ignored') }; /* check-imports-ignore-line */",
      'const y = [',
      "  require('multiline-ignored'), // check-imports-ignore-line",
      "  require('multiline-kept'),",
      '];',
      "require('kept'); // check-imports-ignore-lint",
      "require('also-kept'); // unrelated comment",
    ].join('\n'),
  });
  assert.deepEqual(added, ['also-kept', 'kept', 'multiline-kept']);
});

test('check-imports-ignore-line on its own line ignores the next line', async () => {
  const added = await addedFor({
    'a.js': [
      '// check-imports-ignore-line',
      "import above from 'ignored-from-above';",
      "require('kept-after');",
      'const a = 1; // check-imports-ignore-line',
      "require('kept-below-trailing-comment');",
    ].join('\n'),
  });
  assert.deepEqual(added, ['kept-after', 'kept-below-trailing-comment']);
});

test('groups files by the closest package.json', async () => {
  const dir = await fixture({
    'package.json': { name: 'root' },
    'index.js': "require('root-dep');",
    'packages/a/package.json': { name: 'a' },
    'packages/a/src/index.ts': "import 'a-dep';",
    'packages/b/package.json': { name: 'b' },
    'packages/b/lib/x.mjs': "import 'b-dep';",
    'node_modules/some/index.js': "require('from-node-modules');",
    'node_modules/some/package.json': { name: 'some' },
  });
  const results = await checkImports({ directoryPath: dir });
  const byPackage = Object.fromEntries(
    results.map(({ packagePath, result }) => [
      packagePath.slice(dir.length + 1).replaceAll('\\', '/'),
      names(result.added),
    ]),
  );
  assert.deepEqual(byPackage, {
    'package.json': ['root-dep'],
    'packages/a/package.json': ['a-dep'],
    'packages/b/package.json': ['b-dep'],
  });
});

test('ignorePath takes globs relative to directoryPath, as a string or an array', async () => {
  const files = {
    'src/a.js': "require('kept');",
    'src/legacy/b.js': "require('legacy-dep');",
    'src/gen/c.js': "require('generated-dep');",
    'x.test.js': "require('test-dep');",
  };
  assert.deepEqual(await addedFor(files, { ignorePath: 'src/legacy/**' }), ['generated-dep', 'kept', 'test-dep']);
  assert.deepEqual(await addedFor(files, { ignorePath: ['src/legacy/**', 'src/gen/**', '**/*.test.js'] }), ['kept']);
});

test('files with no package.json above them are skipped', async () => {
  const dir = await fixture({ 'a.js': "require('orphan');" });
  assert.deepEqual(await checkImports({ directoryPath: dir }), []);
});

test('a package named like an Object.prototype key is not taken as listed', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', dependencies: {}, devDependencies: {} },
    'a.js': "require('constructor'); require('toString');",
  });
  const [{ result }] = await checkImports({ directoryPath: dir });
  assert.deepEqual(result.existing, []);
  assert.deepEqual(names(result.added), ['constructor', 'toString']);
});
