import chalk from "chalk";

type Dependency = {
  version: string | null;
  dependency: string;
  type?: string;
};

type Result = {
  added: Dependency[];
  removed: Dependency[];
  existing: Dependency[];
  ignored: Dependency[];
};

type LogResultsOptions = {
  update?: boolean;
  throwError?: boolean;
};

type AllResults = {
  result: Result;
  packagePath: string;
}[];

export function logResults(allResults: AllResults, { update = false, throwError = false }: LogResultsOptions): void {
  for (const { result, packagePath } of allResults) {
    const { added, removed, existing, ignored } = result;
    const needAChange = added.length > 0 || removed.length > 0;

    console.log(chalk[needAChange ? "bgYellow" : "bgGreen"](packagePath));
    console.log(`${existing.length} dependencies remain`);

    for (const { version, type, dependency } of existing) {
      console.log(chalk.cyan(`- ${dependency}${version ? `@${version}` : ""} (${type})`));
    }

    console.log(`${added.length} dependencies to add`);
    for (const { version, dependency } of added) {
      console.log(chalk.green(`- ${dependency}${version ? `@${version}` : ""}`));
    }

    console.log(`${removed.length} dependencies to remove`);
    for (const { version, dependency } of removed) {
      console.log(chalk.red(`- ${dependency}${version ? `@${version}` : ""}`));
    }

    console.log(`${ignored.length} dependencies ignored`);
    for (const { version, dependency } of ignored) {
      console.log(chalk.grey(`- ${dependency}${version ? `@${version}` : ""}`));
    }

    if (needAChange) {
      if (!update) {
        console.log("This package.json can be automatically updated with the --update option");
      }

      if (throwError) {
        if (result.added.length) {
          throw new Error(`Scripts related to ${packagePath} have ${added.length} missing dependencies (${added.map(({ dependency }) => dependency).join(", ")})`);
        }

        if (result.removed.length) {
          throw new Error(`${packagePath} includes ${removed.length} dependencies to remove (${removed.map(({ dependency }) => dependency).join(", ")})`);
        }
      }
    } else {
      console.log("This package.json is fine, no need to update it");
    }

    console.log("\n");
  }
}

export default logResults;
