const chalk = require('chalk');
/* eslint-disable no-console, no-restricted-syntax */

function logResults(allResults, { update, throwError }) {
  for (const { result, packagePath } of allResults) {
    const {
      added, removed, existing, ignored,
    } = result;
    console.log(chalk.bgGreen(packagePath));

    console.log(`${existing.length} dependencies remain`);
    for (const { version, type, dependency } of existing) {
      console.log(chalk.cyan(`- ${dependency}${version ? `@${version}` : ''} (${type})`));
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
        console.log('This package.json can be automatically updated with the --update option');
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

    console.log('\n');
  }
}

module.exports = logResults;
