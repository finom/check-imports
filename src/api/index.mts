import getGroupedDependencies from "./getGroupedDependencies.mjs";
import checkOnePackageImports from "./checkOnePackageImports.mjs";
import logResults from "./logResults.mjs";

type CheckImportsOptions = {
  directoryPath?: string;
  ignorePath?: string | string[];
  processManually?: (dependency: string) => boolean;
  update?: boolean;
  throwError?: boolean;
  log?: boolean;
};

export default async function checkImports({
  directoryPath = process.cwd(),
  ignorePath = [],
  processManually,
  update = false,
  throwError = false,
  log = false,
}: CheckImportsOptions = {}) {
  const groupedDependencies = await getGroupedDependencies({
    directoryPath,
    ignorePath,
    throwError,
    log,
  });

  const results: {
    result: Awaited<ReturnType<typeof checkOnePackageImports>>,
    packagePath: string,
    dependencies: string[],
  }[] = [];

  for (const [packagePath, dependenciesGroup] of Object.entries(groupedDependencies)) {
    const dependencies = Object.keys(dependenciesGroup);
    const result = await checkOnePackageImports({
      packagePath,
      dependencies,
      processManually,
      update,
      throwError,
      log,
    });

    results.push({ packagePath, dependencies, result });
  }

  if (log) {
    logResults(results, { throwError, update });
  }

  return results;
}
