const getGroupedDependencies = require('./getGroupedDependencies');
const checkOnePackageImports = require('./checkOnePackageImports');
const defaultBabelPlugins = require('./defaultBabelPlugins');

/* eslint-disable no-restricted-syntax, no-await-in-loop */
async function checkImports({
  directoryPath = process.cwd(),
  ignorePath = [],
  processManually,
  update = false,
  throwError = false,
  babelPlugins = defaultBabelPlugins,
} = {}) {
  const groupedDependencies = await getGroupedDependencies({
    directoryPath, ignorePath, babelPlugins,
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
    });

    results.push({ packagePath, dependencies, result });
  }

  return results;
}

module.exports = { checkImports };
