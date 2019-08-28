const getGroupedDependencies = require('./getGroupedDependencies');
const checkOnePackageImports = require('./checkOnePackageImports');
const defaultBabelPlugins = require('./defaultBabelPlugins');
const logResults = require('./logResults');

/* eslint-disable no-restricted-syntax, no-await-in-loop */
async function checkImports({
  directoryPath = process.cwd(),
  ignorePath = [],
  processManually,
  update = false,
  throwError = false,
  log = false,
  babelPlugins = defaultBabelPlugins,
} = {}) {
  const groupedDependencies = await getGroupedDependencies({
    directoryPath, ignorePath, babelPlugins, throwError, log,
  });
  const results = [];

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

module.exports = { checkImports };
