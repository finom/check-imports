const { promises: fs } = require('fs');
const NpmApi = require('npm-api');
const chalk = require('chalk');

const npm = new NpmApi();

/* eslint-disable no-restricted-syntax, no-await-in-loop */
async function checkOnePackageImports({
  packagePath,
  dependencies,
  processManually,
  update,
  throwError,
  log,
}) {
  const result = {
    existing: [],
    added: [],
    removed: [],
    ignored: [],
  };

  const addExisting = (dependency, version, type) => result.existing.push({
    dependency, version, type, ignore: false,
  });

  const isExisting = (dep) => result.existing.find(({ dependency }) => dependency === dep);
  let pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));

  const newDependencies = {};
  const oldDependencies = pkg.dependencies || {};

  for (const dependency of dependencies) {
    if (dependency in (pkg.dependencies || {})) {
      const version = pkg.dependencies[dependency];
      newDependencies[dependency] = version;
      addExisting(dependency, version, 'dependencies');
    }

    if (dependency in (pkg.peerDependencies || {})) {
      const version = pkg.peerDependencies[dependency];
      addExisting(dependency, version, 'peerDependencies');
    }

    if (dependency in (pkg.optionalDependencies || {})) {
      const version = pkg.optionalDependencies[dependency];
      addExisting(dependency, version, 'optionalDependencies');
    }
  }

  pkg = { ...pkg, dependencies: newDependencies };

  for (const dependency of dependencies) {
    const defaultInfo = {
      type: 'dependencies',
      ignore: false,
    };

    let depInfo = typeof processManually === 'function' ? processManually(dependency) : defaultInfo;

    if (depInfo === true) {
      depInfo = defaultInfo;
    } else if (depInfo === false) {
      depInfo = {
        ignore: true,
      };
    }

    depInfo = {
      ...depInfo,
      dependency,
      type: depInfo.type || 'dependencies',
      verson: depInfo.verson || null,
    };

    const { type, ignore, version } = depInfo;

    if (!isExisting(dependency) && !ignore) {
      if (!(type in pkg)) {
        pkg[type] = {};
      }

      let v;

      if (!version) {
        try {
          const { version: pkgVersion } = await npm.repo(dependency).package();
          v = `^${pkgVersion}`;
          pkg[type][dependency] = v;
        } catch (e) {
          if (!('missingPackageDependencies' in pkg)) {
            pkg.missingPackageDependencies = {};
          }

          pkg.missingPackageDependencies[dependency] = version || '?.?.?';

          if(log) {
            // eslint-disable-next-line no-console
            console.log(chalk.bgRed(`Package "${dependency}" isn't found at NPM registry. It's going to be automatically added to "missingPackageDependencies" at your package.json if "update" option is set to true`));

          }
        }
      } else {
        v = version;
        pkg[type][dependency] = v;
      }


      result.added.push({
        type,
        dependency,
        version: v,
        ignore,
      });
    } else if (!isExisting(dependency) && ignore) {
      result.ignored.push({
        type,
        dependency,
        version: null,
        ignore,
      });
    }
  }

  if (update) {
    await fs.writeFile(packagePath, JSON.stringify(pkg, null, '\t'));
  }

  for (const [dependency, version] of Object.entries(oldDependencies)) {
    if (!(dependency in pkg.dependencies)) {
      result.removed.push({
        dependency,
        version,
        ignore: false,
        type: 'dependencies',
      });
    }
  }

  if (throwError) {
    if (result.added.length) {
      throw new Error(`Scripts relative to ${packagePath} has ${result.added.length} missing dependencies (${result.added.map(({ dependency }) => dependency).join(', ')})`);
    }


    if (result.removed.length) {
      throw new Error(`${packagePath} includes ${result.removed.length} dependencies to remove (${result.added.map(({ dependency }) => dependency).join(', ')})`);
    }
  }

  return {
    ...result,
    package: pkg,
  };
}

module.exports = checkOnePackageImports;
