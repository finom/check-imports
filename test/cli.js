/* eslint-disable import/no-extraneous-dependencies */
const fs = require('fs').promises;
const path = require('path');
const expect = require('expect.js');
const chalk = require('chalk');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

async function test() {
  const packagePath = path.resolve(__dirname, './package.json');
  try { await fs.unlink(packagePath); } catch (e) {
    // noop
  }
  const read = async () => JSON.parse(await fs.readFile(packagePath));
  await fs.copyFile(path.resolve(__dirname, './pkg.json'), packagePath);

  const execResult = await exec('../cli.js -d ./cases --ignore-imports redux,react --ignore-path "**/ignored.*" --update ', { cwd: __dirname });

  process.stdout.write(execResult.stdout);
  process.stderr.write(execResult.stderr);
  expect(Object.keys((await read()).dependencies).sort()).to.eql([
    'moment', 'lodash', '@babel/parser', 'react-redux', 'defi', 'recompose', 'request',
  ].sort());
}

// eslint-disable-next-line no-console
module.exports = test().catch((e) => { console.log(chalk.red(e.stack)); process.exit(1); });
