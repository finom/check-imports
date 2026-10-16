import checkOnePackageImports, { type CheckResult, type ProcessManuallyResult } from './checkOnePackageImports.mjs';
import getGroupedDependencies, { DEFAULT_DEV_PATHS } from './getGroupedDependencies.mjs';
import logResults from './logResults.mjs';

export type { DependenciesKey, PackageJson } from '../types/index.mjs';
export type { CheckResult, DependencyInfo, ProcessManuallyResult } from './checkOnePackageImports.mjs';

export { DEFAULT_DEV_PATHS };

export type CheckImportsOptions = {
  directoryPath?: string;
  ignorePath?: string | string[];
  devPath?: string | string[];
  gitignore?: boolean;
  processManually?: (dependency: string) => ProcessManuallyResult;
  update?: boolean;
  throwError?: boolean;
  log?: boolean;
};

export type CheckImportsResult = {
  packagePath: string;
  dependencies: string[];
  result: CheckResult;
}[];

// Thrown with `throwError` when a package.json has missing, unused or misplaced dependencies.
export class CheckImportsError extends Error {
  name = 'CheckImportsError';

  constructor(
    message: string,
    readonly results: CheckImportsResult,
  ) {
    super(message);
  }
}

export default async function checkImports({
  directoryPath = process.cwd(),
  ignorePath = [],
  devPath,
  gitignore = true,
  processManually,
  update = false,
  throwError = false,
  log = false,
}: CheckImportsOptions = {}): Promise<CheckImportsResult> {
  const groupedDependencies = await getGroupedDependencies({ directoryPath, ignorePath, devPath, gitignore });
  const results: CheckImportsResult = [];

  for (const [packagePath, imports] of Object.entries(groupedDependencies)) {
    const { dependencies, result } = await checkOnePackageImports({
      packagePath,
      imports,
      processManually,
      update,
      log,
    });
    results.push({ packagePath, dependencies, result });
  }

  if (log) logResults(results, { update });

  if (throwError) {
    const problems = results.flatMap(({ packagePath, result }) =>
      (
        [
          [result.added, 'missing dependencies'],
          [result.removed, 'dependencies to remove'],
          [result.misplaced, 'dependencies to move to "dependencies"'],
        ] as const
      )
        .filter(([list]) => list.length)
        .map(
          ([list, what]) => `${packagePath} has ${list.length} ${what} (${list.map((d) => d.dependency).join(', ')})`,
        ),
    );
    if (problems.length) throw new CheckImportsError(problems.join('\n'), results);
  }

  return results;
}
