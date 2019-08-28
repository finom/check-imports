#!/usr/bin/env node
/* eslint-disable no-restricted-syntax, no-console */
const commander = require('commander');
const chalk = require('chalk');
const pkg = require('./package');
const { checkImports } = require('./api');

const program = new commander.Command();
program.version(pkg.version)
  // -n flag is used instead of -i becuse
  // we may want to add a possibility to run npm install later
  .option('-n, --ignore-imports <items>', 'ignored packages')
  .option('-d, --directory-path <value>', 'working directory path')
  .option('--ignore-path <items>', 'a glob pattern to ignore processed files')
  .option('-u, --update', 'update package.json files')
  .option('-e, --throw-error', 'exit process with code 1 in case if there are redundant or missing dependencies')
  .option('--flow', 'use flow syntax parser');

program.parse(process.argv);

async function run({
  ignoreImports = [], ignorePath = [], directoryPath = '.', update = false, throwError = false,
}) {
  return checkImports({
    log: true,
    directoryPath,
    ignorePath,
    update,
    throwError,
    processManually(dependency) {
      return !ignoreImports.includes(dependency);
    },
  });
}

run(program.opts()).catch((e) => {
  console.log(chalk.red(e.stack));
  process.exit(1);
});
