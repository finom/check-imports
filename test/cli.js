/* eslint-disable import/no-extraneous-dependencies */
const fs = require('fs').promises;
const path = require('path');
const expect = require('expect.js');
const chalk = require('chalk');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

/*
resulting dep list:
request
react
react-redux
redux
moment
recompose
lodash
@babel/parser
*/

async function test() {
  const packagePath = path.resolve(__dirname, './package.json');
  const read = async () => JSON.parse(await fs.readFile(packagePath));
  await fs.copyFile(path.resolve(__dirname, './pkg.json'), packagePath);
  await exec('../cli.js -d ./cases --ignore redux,react --update --ignore-path */ignored.*', { cwd: __dirname });
  expect(Object.keys((await read()).dependencies).sort()).to.eql([
    'moment', 'lodash', '@babel/parser', 'react-redux', 'defi', 'recompose', 'request',
  ].sort());
  await fs.unlink(packagePath);
}

// eslint-disable-next-line no-console
module.exports = test().catch((e) => { console.log(chalk.red(e.stack)); process.exit(1); });
