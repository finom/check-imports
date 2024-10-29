/* eslint-disable import/no-extraneous-dependencies */
import { promises as fs } from 'fs';
import path from 'path';
import assert from 'node:assert/strict';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import test from 'node:test';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const exec = promisify(execCallback);

await test('CLI Dependency Check Test', async (t) => {
  const packagePath = path.resolve(__dirname, './package.json');

  try {
    await fs.unlink(packagePath);
  } catch (e) {
    // noop if file doesn't exist
  }

  const read = async () => JSON.parse(await fs.readFile(packagePath, 'utf8'));
  await fs.copyFile(path.resolve(__dirname, './pkg.json'), packagePath);

  const execResult = await exec(
    '../dist/cli.mjs -d ./cases --ignore-imports redux,react --ignore-path "**/ignored.*" --update',
    { cwd: __dirname }
  );

  // Output the results of the CLI command to the console
  process.stdout.write(execResult.stdout);
  process.stderr.write(execResult.stderr);

  await t.test('Check dependencies in package.json after CLI command', async () => {
    const dependencies = Object.keys((await read()).dependencies).sort();
    assert.deepStrictEqual(
      dependencies,
      ['moment', 'lodash', '@babel/parser', 'react-redux', 'defi', 'recompose', 'request'].sort(),
      'Dependencies do not match expected values'
    );
  });
});
