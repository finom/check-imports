/* eslint-disable import/no-extraneous-dependencies */
import { promises as fs } from 'fs';
import path from 'path';
import assert from 'node:assert/strict';
import checkImports from '../dist/api/index.mjs';
import test from 'node:test';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

await test('Package Import Check Test', async (t) => {
  const packagePath = path.resolve(__dirname, './package.json');

  try {
    await fs.unlink(packagePath);
  } catch (e) {
    // noop if file doesn't exist
  }

  await fs.copyFile(path.resolve(__dirname, './pkg.json'), packagePath);
  const oldPkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));

  const [{ result }] = await checkImports({
    directoryPath: path.resolve(__dirname, 'cases'),
    ignorePath: ['**/ignored.*'],
    processManually: (dependency) => {
      if (dependency === 'react') {
        return {
          version: '1.1.1',
          type: 'peerDependencies',
        };
      }
      if (dependency === 'react-redux') {
        return {
          type: 'customDependencies',
        };
      }
      if (dependency === 'moment') {
        return {
          version: '^999.999.999',
        };
      }
      if (dependency === 'redux') {
        return false;
      }

      return true;
    },
    update: true,
    log: true,
  });

  const pkg = JSON.parse(await fs.readFile(path.resolve(__dirname, './package.json'), 'utf8'));

  await t.test('Check dependencies in package', () => {
    assert.deepStrictEqual(
      Object.keys(result.package.dependencies).sort(),
      ['defi', 'request', 'recompose', 'moment', 'lodash', '@babel/parser'].sort()
    );
    assert.deepStrictEqual(result.package, pkg);
    assert.deepStrictEqual(
      Object.keys(result.package.peerDependencies).sort(),
      ['body-parser', 'react', 'jquery'].sort()
    );
    assert.deepStrictEqual(
      Object.keys(result.package.customDependencies).sort(),
      ['react-redux'].sort()
    );
    assert.strictEqual(result.package.peerDependencies.react, '1.1.1');
    assert.strictEqual(result.package.dependencies.moment, '^999.999.999');
    assert.deepStrictEqual(
      Object.keys(result.package.missingPackageDependencies),
      ['azaza-lol-bar']
    );
  });

  await t.test('Check existing dependencies', () => {
    assert.deepStrictEqual(result.existing, [
      {
        dependency: 'defi',
        version: '1.0.0',
        type: 'dependencies',
        ignore: false,
      },
      {
        dependency: 'tailwind-to-object',
        ignore: false,
        type: 'devDependencies',
        version: '^8.3.2'
      },
      {
        dependency: 'jquery',
        version: '100.100.100',
        type: 'peerDependencies',
        ignore: false,
      },
    ]);
  });

  await t.test('Check ignored dependencies', () => {
    assert.deepStrictEqual(result.ignored, [
      {
        dependency: 'redux',
        version: null,
        type: 'dependencies',
        ignore: true,
      },
    ]);
  });

  await t.test('Check removed dependencies', () => {
    assert.deepStrictEqual(result.removed, [
      {
        dependency: 'express',
        version: oldPkg.dependencies.express,
        type: 'dependencies',
        ignore: false,
      },
    ]);
  });
});
