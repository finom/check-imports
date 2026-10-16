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
  .option('-u, --update', 'update package.json files', false)
  .option('-e, --throw-error', 'exit with code 1 if there are missing or unused dependencies', false)
  .parse();

const { ignoreImports, directoryPath, ignorePath, update, throwError } = program.opts<{
  ignoreImports: string[];
  directoryPath: string;
  ignorePath: string[];
  update: boolean;
  throwError: boolean;
}>();

try {
  await checkImports({
    log: true,
    directoryPath: path.resolve(directoryPath),
    ignorePath,
    update,
    throwError,
    processManually: (dependency) => !ignoreImports.includes(dependency),
  });
} catch (error) {
  console.error(chalk.red(error instanceof CheckImportsError ? error.message : ((error as Error).stack ?? error)));
  process.exitCode = 1;
}
