import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fixture, readJson, runCli, startRegistry } from './helpers.mjs';

let registry;
let env;
before(async () => {
  registry = await startRegistry({ 'new-dep': '2.3.4', react: '19.0.0', 'react-redux': '9.0.0', redux: '5.0.0' });
  env = { npm_config_registry: registry.url };
});
after(() => registry.close());

test('--version prints the package version', async () => {
  const { version } = await readJson(new URL('../package.json', import.meta.url));
  const { code, stdout } = await runCli(['--version'], { env });
  assert.equal(code, 0);
  assert.equal(stdout.trim(), version);
});

test('checks the current directory by default and prints the result', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', dependencies: { unused: '1.0.0' } },
    'a.js': "require('new-dep');",
  });
  const { code, stdout } = await runCli([], { cwd: dir, env });
  assert.equal(code, 0);
  assert.match(stdout, /1 dependencies to add\n- new-dep@\^2\.3\.4/);
  assert.match(stdout, /1 dependencies to remove\n- unused@1\.0\.0/);
  assert.match(stdout, /can be automatically updated with the --update option/);
});

test('--update writes package.json', async () => {
  const dir = await fixture({ 'package.json': { name: 'p' }, 'src/a.js': "require('new-dep');" });
  const { code } = await runCli(['-d', 'src', '--update'], { cwd: dir, env });
  assert.equal(code, 0);
  assert.deepEqual((await readJson(path.join(dir, 'package.json'))).dependencies, { 'new-dep': '^2.3.4' });
});

test('--ignore-imports takes a comma-separated list of exact names', async () => {
  const dir = await fixture({
    'package.json': { name: 'p' },
    'a.js': "require('react'); require('redux'); require('react-redux');",
  });
  await runCli(['--ignore-imports', 'react-redux', '-u'], { cwd: dir, env });
  assert.deepEqual(Object.keys((await readJson(path.join(dir, 'package.json'))).dependencies).sort(), [
    'react',
    'redux',
  ]);
  await fs.writeFile(path.join(dir, 'package.json'), '{"name":"p"}');
  await runCli(['-n', 'react,redux', '-u'], { cwd: dir, env });
  assert.deepEqual(Object.keys((await readJson(path.join(dir, 'package.json'))).dependencies), ['react-redux']);
});

test('--ignore-imports keeps a listed dependency that no file imports', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', dependencies: { tslib: '2.0.0', unused: '1.0.0' } },
    'a.js': '',
  });
  await runCli(['-n', 'tslib', '-u'], { cwd: dir, env });
  assert.deepEqual((await readJson(path.join(dir, 'package.json'))).dependencies, { tslib: '2.0.0' });
});

test('--ignore-path takes a comma-separated list of globs', async () => {
  const dir = await fixture({
    'package.json': { name: 'p' },
    'a.js': "require('new-dep');",
    'legacy/b.js': "require('react');",
    'gen/c.js': "require('redux');",
  });
  const { stdout } = await runCli(['--ignore-path', 'legacy/**,gen/**'], { cwd: dir, env });
  assert.match(stdout, /1 dependencies to add\n- new-dep/);
});

test('--throw-error exits with 1 and still prints the result', async () => {
  const dir = await fixture({ 'package.json': { name: 'p' }, 'a.js': "require('new-dep');" });
  const { code, stdout, stderr } = await runCli(['-e'], { cwd: dir, env });
  assert.equal(code, 1);
  assert.match(stdout, /1 dependencies to add\n- new-dep/);
  assert.match(stdout + stderr, /package\.json has 1 missing dependencies \(new-dep\)/);
  assert.doesNotMatch(stdout + stderr, /\n\s+at /, 'no stack trace for a failed check');
});

test('--throw-error exits with 0 when everything is fine', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', dependencies: { 'new-dep': '1' } },
    'a.js': "require('new-dep');",
  });
  const { code, stdout } = await runCli(['-e'], { cwd: dir, env });
  assert.equal(code, 0);
  assert.match(stdout, /This package\.json is fine/);
});

test('a package missing from the registry is reported', async () => {
  const dir = await fixture({ 'package.json': { name: 'p' }, 'a.js': "require('not-published');" });
  const { stdout } = await runCli([], { cwd: dir, env });
  assert.match(stdout, /Package "not-published" isn't found at NPM registry/);
});

test('--json prints the result as JSON and nothing else', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', dependencies: { unused: '1.0.0' } },
    'a.js': "require('new-dep'); require('not-published');",
  });
  const { code, stdout } = await runCli(['--json'], { cwd: dir, env });
  assert.equal(code, 0);
  const [{ packagePath, dependencies, result }] = JSON.parse(stdout);
  assert.equal(packagePath, path.join(dir, 'package.json'));
  assert.deepEqual(dependencies.sort(), ['new-dep', 'not-published']);
  assert.deepEqual(result.added.map(({ dependency }) => dependency).sort(), ['new-dep', 'not-published']);
  assert.deepEqual(
    result.removed.map(({ dependency }) => dependency),
    ['unused'],
  );
});

test('--json with --throw-error exits with 1, the result on stdout and the error on stderr', async () => {
  const dir = await fixture({ 'package.json': { name: 'p' }, 'a.js': "require('new-dep');" });
  const { code, stdout, stderr } = await runCli(['--json', '-e'], { cwd: dir, env });
  assert.equal(code, 1);
  assert.deepEqual(
    JSON.parse(stdout)[0].result.added.map(({ dependency }) => dependency),
    ['new-dep'],
  );
  assert.match(stderr, /package\.json has 1 missing dependencies \(new-dep\)/);
});

test('--json with --throw-error exits with 0 when everything is fine', async () => {
  const dir = await fixture({
    'package.json': { name: 'p', dependencies: { 'new-dep': '1' } },
    'a.js': "require('new-dep');",
  });
  const { code, stdout, stderr } = await runCli(['--json', '-e'], { cwd: dir, env });
  assert.equal(code, 0);
  assert.equal(JSON.parse(stdout).length, 1);
  assert.equal(stderr, '');
});

test('an unexpected error exits with 1 and prints its stack', async () => {
  const dir = await fixture({ 'package.json': { name: 'p' }, 'a.js': "require('new-dep');" });
  const { code, stderr } = await runCli([], { cwd: dir, env: { npm_config_registry: 'http://127.0.0.1:9/' } });
  assert.equal(code, 1);
  assert.match(stderr, /Unable to get the latest version of "new-dep"[\s\S]*\n\s+at /);
});
