/* eslint-disable import/no-extraneous-dependencies */
const fs = require('fs').promises;
const path = require('path');
const expect = require('expect.js');
const chalk = require('chalk');

const { checkImports } = require('../api');

async function test() {
  const packagePath = path.resolve(__dirname, './package.json');
  try { await fs.unlink(packagePath); } catch (e) {
    // noop
  }
  await fs.copyFile(path.resolve(__dirname, './pkg.json'), packagePath);
  const oldPkg = JSON.parse(await fs.readFile(packagePath));

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

  expect(Object.keys(result.package.dependencies).sort()).to.eql(['defi', 'request', 'recompose', 'moment', 'lodash', '@babel/parser'].sort());
  expect(result.package).to.eql(pkg);
  expect(Object.keys(result.package.peerDependencies).sort()).to.eql(['body-parser', 'react', 'jquery'].sort());
  expect(Object.keys(result.package.customDependencies).sort()).to.eql(['react-redux'].sort());
  expect(result.package.peerDependencies.react).to.eql('1.1.1');
  expect(result.package.dependencies.moment).to.eql('^999.999.999');
  expect(Object.keys(result.package.missingPackageDependencies)).to.eql(['azaza-lol-bar']);

  expect(result.existing).to.eql([{
    dependency: 'defi', version: '1.0.0', type: 'dependencies', ignore: false,
  }, {
    dependency: 'jquery', version: '100.100.100', type: 'peerDependencies', ignore: false,
  }]);

  expect(result.ignored).to.eql([{
    dependency: 'redux', version: null, type: 'dependencies', ignore: true,
  }]);

  expect(result.removed).to.eql([{
    dependency: 'express',
    version: oldPkg.dependencies.express,
    type: 'dependencies',
    ignore: false,
  }]);
}

// eslint-disable-next-line no-console
module.exports = test().catch((e) => { console.log(chalk.red(e.stack)); process.exit(1); });
