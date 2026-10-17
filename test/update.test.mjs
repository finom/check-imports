import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import checkImports from '../dist/api/index.mjs';
import { fixture, names, readJson, startRegistry } from './helpers.mjs';

let registry;
before(async () => {
  registry = await startRegistry({
    'new-dep': '2.3.4',
    '@scope/new-dep': '5.6.7',
    existing: '9.9.9',
    'beta-only': { beta: '3.0.0-beta.1' },
    'server-error': 500,
    'no-versions': null,
  });
});
after(() => registry.close());

test('update adds the latest version from the registry and removes unused dependencies', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', dependencies: { existing: '^1.0.0', unused: '^1.0.0' } },
    'a.js': "require('existing'); require('new-dep'); require('@scope/new-dep/sub');",
  });
  const [{ result }] = await checkImports({ directoryPath: dir, update: true });
  assert.deepEqual(names(result.added), ['@scope/new-dep', 'new-dep']);
  assert.deepEqual(names(result.removed), ['unused']);
  assert.deepEqual(await readJson(path.join(dir, 'package.json')), {
    name: 'p',
    dependencies: { existing: '^1.0.0', 'new-dep': '^2.3.4', '@scope/new-dep': '^5.6.7' },
  });
});

test('without update, package.json stays as it is', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', dependencies: { unused: '^1.0.0' } },
    'a.js': "require('new-dep');",
  });
  const before = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
  const [{ result }] = await checkImports({ directoryPath: dir });
  assert.deepEqual(result.added, [{ dependency: 'new-dep', version: '^2.3.4', type: 'dependencies', ignore: false }]);
  assert.equal(await fs.readFile(path.join(dir, 'package.json'), 'utf8'), before);
});

test('a package missing from the registry goes to checkImportsMissingDependencies', async () => {
  const dir = await fixture({ 'package.json': { name: 'p' }, 'a.js': "require('not-published');" });
  await checkImports({ directoryPath: dir, update: true });
  assert.deepEqual(await readJson(path.join(dir, 'package.json')), {
    name: 'p',
    checkImportsMissingDependencies: { 'not-published': '?.?.?' },
  });
});

test('a registry that cannot be reached fails the run and leaves package.json alone', async () => {
  const dir = await fixture({ 'package.json': { name: 'p' }, 'a.js': "require('new-dep');" });
  const before = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
  const previous = process.env.npm_config_registry;
  process.env.npm_config_registry = 'http://127.0.0.1:9/';
  try {
    await assert.rejects(checkImports({ directoryPath: dir, update: true }), /new-dep/);
  } finally {
    process.env.npm_config_registry = previous;
  }
  assert.equal(await fs.readFile(path.join(dir, 'package.json'), 'utf8'), before);
});

test('NPM_TOKEN is sent to the registry', async () => {
  const dir = await fixture({ 'package.json': { name: 'p' }, 'a.js': "require('new-dep');" });
  process.env.NPM_TOKEN = 'secret-token';
  try {
    await checkImports({ directoryPath: dir });
  } finally {
    delete process.env.NPM_TOKEN;
  }
  assert.equal(registry.requests.at(-1).authorization, 'Bearer secret-token');
});

test('update keeps the indentation and the final newline', async () => {
  const dir = await fixture({
    'tabs/package.json': '{\n\t"name": "tabs",\n\t"dependencies": {\n\t\t"unused": "1.0.0"\n\t}\n}\n',
    'tabs/a.js': "require('new-dep');",
    'four/package.json': '{\n    "name": "four",\n    "dependencies": {}\n}',
    'four/a.js': "require('new-dep');",
  });
  await checkImports({ directoryPath: dir, update: true });
  assert.equal(
    await fs.readFile(path.join(dir, 'tabs/package.json'), 'utf8'),
    '{\n\t"name": "tabs",\n\t"dependencies": {\n\t\t"new-dep": "^2.3.4"\n\t}\n}\n',
  );
  assert.equal(
    await fs.readFile(path.join(dir, 'four/package.json'), 'utf8'),
    '{\n    "name": "four",\n    "dependencies": {\n        "new-dep": "^2.3.4"\n    }\n}',
  );
});

test('update does not rewrite a package.json that needs no change', async () => {
  const original = '{"name":"p","dependencies":{"existing":"1.0.0"}}';
  const dir = await fixture({ 'package.json': original, 'a.js': "require('existing');" });
  await checkImports({ directoryPath: dir, update: true });
  assert.equal(await fs.readFile(path.join(dir, 'package.json'), 'utf8'), original);
});

test('dependencies listed in another section count as present', async () => {
  const dir = await fixture({
    'package.json': {
      name: 'p',
      devDependencies: { dev: '1.0.0' },
      peerDependencies: { peer: '1.0.0' },
      optionalDependencies: { optional: '1.0.0' },
    },
    'a.js': "require('dev'); require('peer'); require('optional');",
  });
  const [{ result }] = await checkImports({ directoryPath: dir, update: true });
  assert.deepEqual(result.added, []);
  assert.deepEqual(
    result.existing.map(({ dependency, type }) => `${dependency}:${type}`),
    ['dev:devDependencies', 'peer:peerDependencies', 'optional:optionalDependencies'],
  );
});

test('processManually sets the version and the section, or ignores a dependency', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', dependencies: { 'kept-unused': '1.0.0', 'removed-unused': '1.0.0' } },
    'a.js': "require('new-dep'); require('pinned'); require('peer-one'); require('custom-one'); require('skipped');",
  });
  const [{ result }] = await checkImports({
    directoryPath: dir,
    update: true,
    processManually(dependency) {
      if (dependency === 'pinned') return { version: '~1.0.0' };
      if (dependency === 'peer-one') return { type: 'peerDependencies', version: '>=1' };
      if (dependency === 'custom-one') return { type: 'customDependencies', version: '3.0.0' };
      if (dependency === 'skipped' || dependency === 'kept-unused') return false;
      return true;
    },
  });
  assert.deepEqual(names(result.ignored), ['skipped']);
  assert.deepEqual(names(result.removed), ['removed-unused']);
  assert.deepEqual(await readJson(path.join(dir, 'package.json')), {
    name: 'p',
    dependencies: { 'kept-unused': '1.0.0', 'new-dep': '^2.3.4', pinned: '~1.0.0' },
    peerDependencies: { 'peer-one': '>=1' },
    customDependencies: { 'custom-one': '3.0.0' },
  });
});

test('throwError rejects after checking every package and names each problem', async () => {
  const dir = await fixture({
    'a/package.json': { name: 'a', dependencies: { unused: '1.0.0' } },
    'a/x.js': '',
    'b/package.json': { name: 'b' },
    'b/x.js': "require('new-dep');",
    'c/package.json': { name: 'c' },
    'c/x.js': '',
  });
  await assert.rejects(checkImports({ directoryPath: dir, throwError: true }), (error) => {
    assert.match(error.message, /a[/\\]package\.json has 1 dependency to remove \(unused\)/);
    assert.match(error.message, /b[/\\]package\.json has 1 missing dependency \(new-dep\)/);
    assert.doesNotMatch(error.message, /c[/\\]package\.json/);
    return true;
  });
});

test('throwError with update still writes every package.json first', async () => {
  const dir = await fixture({
    'a/package.json': { name: 'a', dependencies: { unused: '1.0.0' } },
    'a/x.js': '',
    'b/package.json': { name: 'b' },
    'b/x.js': "require('new-dep');",
  });
  await assert.rejects(checkImports({ directoryPath: dir, throwError: true, update: true }));
  assert.deepEqual((await readJson(path.join(dir, 'a/package.json'))).dependencies, {});
  assert.deepEqual((await readJson(path.join(dir, 'b/package.json'))).dependencies, { 'new-dep': '^2.3.4' });
});

test('throwError passes when every package is fine', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', dependencies: { existing: '1' } },
    'a.js': "require('existing');",
  });
  const [{ result }] = await checkImports({ directoryPath: dir, throwError: true });
  assert.deepEqual(names(result.existing), ['existing']);
});

test('a package with no latest tag gets its first dist-tag', async () => {
  const dir = await fixture({ 'package.json': { name: 'p' }, 'a.js': "require('beta-only');" });
  const [{ result }] = await checkImports({ directoryPath: dir });
  assert.equal(result.added[0].version, '^3.0.0-beta.1');
});

test('a registry error other than 404 fails the run', async () => {
  const dir = await fixture({ 'package.json': { name: 'p' }, 'a.js': "require('server-error');" });
  await assert.rejects(checkImports({ directoryPath: dir, update: true }), /"server-error" .*: 500/);
});

test('a registry URL without a trailing slash works', async () => {
  const dir = await fixture({ 'package.json': { name: 'p' }, 'a.js': "require('@scope/new-dep');" });
  process.env.npm_config_registry = registry.url.slice(0, -1);
  try {
    const [{ result }] = await checkImports({ directoryPath: dir });
    assert.equal(result.added[0].version, '^5.6.7');
  } finally {
    process.env.npm_config_registry = registry.url;
  }
});

test('a package with no versions on the registry counts as not published', async () => {
  const dir = await fixture({ 'package.json': { name: 'p' }, 'a.js': "require('no-versions');" });
  await checkImports({ directoryPath: dir, update: true });
  assert.deepEqual((await readJson(path.join(dir, 'package.json'))).checkImportsMissingDependencies, {
    'no-versions': '?.?.?',
  });
});

test('a CheckImportsError carries the results', async () => {
  const dir = await fixture({ 'package.json': { name: 'p' }, 'a.js': "require('new-dep');" });
  await assert.rejects(checkImports({ directoryPath: dir, throwError: true }), (error) => {
    assert.equal(error.name, 'CheckImportsError');
    assert.deepEqual(names(error.results[0].result.added), ['new-dep']);
    return true;
  });
});

test('a package.json that is not valid JSON fails with its path', async () => {
  const dir = await fixture({ 'package.json': '{ "name": ', 'a.js': "require('new-dep');" });
  await assert.rejects(checkImports({ directoryPath: dir }), (error) => {
    assert.match(error.message, /package\.json is not valid JSON/);
    assert.ok(error.message.includes(path.join(dir, 'package.json')));
    return true;
  });
});
