#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import pkg from '../package.json' with { type: "json" };
import checkImports from './api/index.mjs';

const program = new Command();

program
  .version(pkg.version)
  .option('-n, --ignore-imports <items>', 'ignored packages')
  .option('-d, --directory-path <value>', 'working directory path')
  .option('--ignore-path <items>', 'a glob pattern to ignore processed files')
  .option('-u, --update', 'update package.json files')
  .option(
    '-e, --throw-error',
    'exit process with code 1 if there are redundant or missing dependencies',
  )

program.parse(process.argv);

type RunOptions = {
  ignoreImports?: string[];
  ignorePath?: string | string[];
  directoryPath?: string;
  update?: boolean;
  throwError?: boolean;
};

async function run({
  ignoreImports = [],
  ignorePath = [],
  directoryPath = '.',
  update = false,
  throwError = false,
}: RunOptions) {
  return checkImports({
    log: true,
    directoryPath,
    ignorePath,
    update,
    throwError,
    processManually(dependency: string) {
      return !ignoreImports.includes(dependency);
    },
  });
}

run(program.opts()).catch((e) => {
  console.log(chalk.red(e.stack));
  process.exit(1);
});
