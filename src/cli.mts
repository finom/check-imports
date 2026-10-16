#!/usr/bin/env node
import path from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import pkg from '../package.json' with { type: 'json' };
import checkImports, { CheckImportsError } from './api/index.mjs';

const list = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const program = new Command()
  .version(pkg.version)
  .option('-n, --ignore-imports <items>', 'comma-separated dependencies to leave alone', list, [])
  .option('-d, --directory-path <value>', 'directory to check', '.')
  .option('--ignore-path <items>', 'comma-separated globs of files to skip, relative to the directory', list, [])
  .option('--dev-path <items>', 'comma-separated globs of dev files, relative to each package.json', list)
  .option('--no-gitignore', 'check the files .gitignore lists too')
  .option('--json', 'print the result as JSON', false)
  .option('-u, --update', 'update package.json files', false)
  .option('-e, --throw-error', 'exit with code 1 if there are missing or unused dependencies', false)
  .parse();

const { ignoreImports, directoryPath, ignorePath, devPath, gitignore, json, update, throwError } = program.opts<{
  ignoreImports: string[];
  directoryPath: string;
  ignorePath: string[];
  devPath?: string[];
  gitignore: boolean;
  json: boolean;
  update: boolean;
  throwError: boolean;
}>();

const printJson = (results: unknown) => console.log(JSON.stringify(results, null, 2));

try {
  const results = await checkImports({
    log: !json,
    directoryPath: path.resolve(directoryPath),
    ignorePath,
    devPath,
    gitignore,
    update,
    throwError,
    processManually: (dependency) => !ignoreImports.includes(dependency),
  });
  if (json) printJson(results);
} catch (error) {
  if (error instanceof CheckImportsError) {
    if (json) printJson(error.results);
    console.error(json ? error.message : chalk.red(error.message));
  } else {
    console.error(chalk.red((error as Error).stack ?? error));
  }
  process.exitCode = 1;
}
