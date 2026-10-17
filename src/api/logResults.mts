import chalk from 'chalk';
import countDependencies from './countDependencies.mjs';
import type { CheckImportsResult } from './index.mjs';

export default function logResults(allResults: CheckImportsResult, { update = false }: { update?: boolean }): void {
  for (const { result, packagePath } of allResults) {
    const { added, removed, misplaced, existing, ignored } = result;
    const needAChange = added.length > 0 || removed.length > 0 || misplaced.length > 0;
    const format = (dependency: string, version: string | null) => `- ${dependency}${version ? `@${version}` : ''}`;

    console.log(chalk[needAChange ? 'bgYellow' : 'bgGreen'](packagePath));

    console.log(`${countDependencies(existing.length)} ${existing.length === 1 ? 'remains' : 'remain'}`);
    for (const { version, type, dependency } of existing)
      console.log(chalk.cyan(`${format(dependency, version)} (${type})`));

    console.log(`${countDependencies(added.length)} to add`);
    for (const { version, dependency, type } of added) {
      console.log(chalk.green(`${format(dependency, version)}${type === 'dependencies' ? '' : ` (${type})`}`));
    }

    console.log(`${countDependencies(removed.length)} to remove`);
    for (const { version, dependency } of removed) console.log(chalk.red(format(dependency, version)));

    if (misplaced.length) {
      console.log(`${countDependencies(misplaced.length)} to move from devDependencies to dependencies`);
      for (const { version, dependency } of misplaced) console.log(chalk.magenta(format(dependency, version)));
    }

    console.log(`${countDependencies(ignored.length)} ignored`);
    for (const { version, dependency } of ignored) console.log(chalk.grey(format(dependency, version)));

    if (!needAChange) {
      console.log('This package.json is fine, no need to update it');
    } else if (!update) {
      console.log('This package.json can be automatically updated with the --update option');
    }

    console.log('\n');
  }
}
