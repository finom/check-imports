import checkOnePackageImports, { type CheckResult, type ProcessManuallyResult } from './checkOnePackageImports.mjs';
import getGroupedDependencies from './getGroupedDependencies.mjs';
import logResults from './logResults.mjs';

export type { DependenciesKey, PackageJson } from '../types/index.mjs';
export type { CheckResult, DependencyInfo, ProcessManuallyResult } from './checkOnePackageImports.mjs';

export type CheckImportsOptions = {
  directoryPath?: string;
  ignorePath?: string | string[];
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

// Thrown with `throwError` when a package.json has missing or unused dependencies.
export class CheckImportsError extends Error {
  name = 'CheckImportsError';
}

export default async function checkImports({
  directoryPath = process.cwd(),
  ignorePath = [],
  processManually,
  update = false,
  throwError = false,
  log = false,
}: CheckImportsOptions = {}): Promise<CheckImportsResult> {
  const groupedDependencies = await getGroupedDependencies({ directoryPath, ignorePath });
  const results: CheckImportsResult = [];

  for (const [packagePath, dependencies] of Object.entries(groupedDependencies)) {
    const result = await checkOnePackageImports({ packagePath, dependencies, processManually, update, log });
    results.push({ packagePath, dependencies, result });
  }

  if (log) logResults(results, { update });

  if (throwError) {
    const problems = results.flatMap(({ packagePath, result: { added, removed } }) => [
      ...(added.length
        ? [`${packagePath} has ${added.length} missing dependencies (${added.map((d) => d.dependency).join(', ')})`]
        : []),
      ...(removed.length
        ? [
            `${packagePath} has ${removed.length} dependencies to remove (${removed.map((d) => d.dependency).join(', ')})`,
          ]
        : []),
    ]);
    if (problems.length) throw new CheckImportsError(problems.join('\n'));
  }

  return results;
}
