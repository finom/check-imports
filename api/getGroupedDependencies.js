const findUp = require('find-up');
const path = require('path');
const glob = require('glob-promise');

const getImportsFromFile = require('./getImportsFromFile');

/* eslint-disable no-restricted-syntax, no-await-in-loop */
async function getGroupedDependencies({
  directoryPath,
  ignorePath,
  babelPlugins,
}) {
  const filePaths = await glob(path.resolve(directoryPath, '**/*.{ts,js,jsx}'), {
    ignore: [
      '**/node_modules/**',
      ...(typeof ignorePath === 'string' ? [ignorePath] : ignorePath)],
  });
  const groups = {};
  const groupedDependencies = {};


  for (const filePath of filePaths) {
    const dirname = path.dirname(filePath);
    // const sameLevelPackagePath
    const packagePath = await findUp('package.json', { cwd: dirname });
    groups[packagePath] = groups[packagePath] || {};
    groups[packagePath][filePath] = true;
  }


  for (const [packagePath, filesGroup] of Object.entries(groups)) {
    const deps = {};
    groupedDependencies[packagePath] = deps;

    for (const filePath of Object.keys(filesGroup)) {
      const imports = await getImportsFromFile({ filePath, babelPlugins });

      for (const imp of imports) {
        deps[imp] = true;
      }
    }
  }
  return groupedDependencies;
}

module.exports = getGroupedDependencies;
