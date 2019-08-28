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
  .option('--ignore-path <value>', 'a glob pattern to ignore processed files')
  .option('-u, --update', 'update package.json files')
  .option('-e, --throw-error', 'exit process with code 1 in case if there are redundant or missing dependencies');

program.parse(process.argv);

async function run({
  ignoreImports = [], ignorePath, directoryPath = '.', update = false, throwError = false,
}) {
  const allResults = await checkImports({
    directoryPath,
    ignorePath,
    update,
    processManually(dependency) {
      return !ignoreImports.includes(dependency);
    },
  });

  for (const { result, packagePath } of allResults) {
    const {
      added, removed, existing, ignored,
    } = result;
    console.log(chalk.bgGreen(packagePath));

    console.log(`${existing.length} dependencies remain`);
    for (const { version, type, dependency } of existing) {
      console.log(chalk.blue(`- ${dependency}${version ? `@${version}` : ''} (${type})`));
    }

    console.log(`${added.length} dependencies to add`);
    for (const { version, dependency } of added) {
      console.log(chalk.green(`- ${dependency}${version ? `@${version}` : ''}`));
    }

    console.log(`${removed.length} dependencies to remove`);
    for (const { version, dependency } of removed) {
      console.log(chalk.red(`- ${dependency}${version ? `@${version}` : ''}`));
    }

    console.log(`${ignored.length} dependencies ignored`);
    for (const { version, dependency } of ignored) {
      console.log(chalk.grey(`- ${dependency}${version ? `@${version}` : ''}`));
    }

    if (added.length || removed.length) {
      if (!update) {
        console.log('package.json can be automatically updated with the --update option');
      }

      if (throwError) {
        if (result.added.length) {
          throw new Error(`Scripts relative to ${packagePath} has ${added.length} missing dependencies (${added.map(({ dependency }) => dependency).join(', ')})`);
        }


        if (result.removed.length) {
          throw new Error(`${packagePath} includes ${removed.length} dependencies to remove (${added.map(({ dependency }) => dependency).join(', ')})`);
        }
      }
    } else {
      console.log('This package.json is fine, no need to update it');
    }
  }
}

run(program.opts()).catch((e) => {
  console.log(chalk.red(e.message));
  process.exit(1);
});
