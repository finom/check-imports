import { promises as fs } from 'fs';
import chalk from 'chalk';
import type { PackageJson } from "type-fest";
import { DependenciesKey } from '../types/index.mjs';
import fetch from 'npm-registry-fetch';

async function getPackageInfo(dependency: string) {
  const authToken = process.env.NPM_TOKEN; // Ensure your token is secure
  const response = await fetch.json(`/${dependency}`, {
    auth: {
      token: authToken,
    },
  });
  return response;
}

export type ProcessManuallyResult = boolean | {
  type?: DependenciesKey;
  version?: string | null;
  ignore?: boolean;
};

type DependencyInfo = {
  dependency: string;
  version: string | null;
  type: DependenciesKey;
  ignore: boolean;
};

type CheckOnePackageImportsOptions = {
  packagePath: string;
  dependencies: string[];
  processManually?: (dependency: string) => ProcessManuallyResult;
  update?: boolean;
  throwError?: boolean;
  log?: boolean;
};

type CheckResult = {
  existing: DependencyInfo[];
  added: DependencyInfo[];
  removed: DependencyInfo[];
  ignored: DependencyInfo[];
  package?: PackageJson;
};

const checkOnePackageImports = async ({
  packagePath,
  dependencies,
  processManually,
  update = false,
  throwError = false,
  log = false,
}: CheckOnePackageImportsOptions): Promise<CheckResult> => {
  const result: CheckResult = {
    existing: [],
    added: [],
    removed: [],
    ignored: [],
  };

  const addExisting = (dependency: string, version: string, type: DependenciesKey) => result.existing.push({
    dependency, version, type, ignore: false,
  });

  const isExisting = (dep: string) => result.existing.some(({ dependency }) => dependency === dep);

  let pkg = JSON.parse(await fs.readFile(packagePath, 'utf8')) as PackageJson & { missingPackageDependencies: PackageJson['dependencies'] };;
  const newDependencies = {} as Record<string, string>;
  const oldDependencies = pkg.dependencies as Record<string, string> || {};

  for (const dependency of dependencies) {
    if (dependency in oldDependencies) {
      const version = oldDependencies[dependency];
      newDependencies[dependency] = version;
      addExisting(dependency, version, 'dependencies');
    }

    if (dependency in (pkg.peerDependencies || {})) {
      const version = pkg.peerDependencies![dependency] as string;
      addExisting(dependency, version, 'peerDependencies');
    }

    if (dependency in (pkg.optionalDependencies || {})) {
      const version = pkg.optionalDependencies![dependency] as string;
      addExisting(dependency, version, 'optionalDependencies');
    }

    if (dependency in (pkg.devDependencies || {})) {
      const version = pkg.devDependencies![dependency] as string;
      addExisting(dependency, version, 'devDependencies');
    }
  }

  pkg = { ...pkg, dependencies: newDependencies } as PackageJson & { missingPackageDependencies: PackageJson['dependencies'] };

  for (const dependency of dependencies) {
    const defaultInfo = { type: 'dependencies', ignore: false, version: null } as const;
    let depInfo = processManually ? processManually(dependency) : defaultInfo;

    if (depInfo === true) {
      depInfo = defaultInfo;
    } else if (depInfo === false) {
      depInfo = { ignore: true };
    }

    depInfo = {
      ...depInfo, type: depInfo.type || 'dependencies', version: depInfo.version || null,
    } as const;
    const { type, ignore, version } = depInfo as Exclude<typeof depInfo, boolean>;

    if (type && !isExisting(dependency) && !ignore) {
      if (!(type in pkg)) pkg[type] = {};

      let resolvedVersion;

      if (!version) {
        try {
          const { version: pkgVersion } = await getPackageInfo(dependency);
          resolvedVersion = `^${pkgVersion}`;
          if (!pkg[type]) pkg[type] = {};
          pkg[type][dependency] = resolvedVersion;
        } catch (e) {
          if (!pkg.missingPackageDependencies) {
            pkg.missingPackageDependencies = {};
          }
          pkg.missingPackageDependencies[dependency] = '?.?.?';

          if (log) {
            console.log(
              chalk.bgRed(
                `Package "${dependency}" isn't found at NPM registry. It will be added to "missingPackageDependencies" in package.json if "update" is true.`,
              ),
            );
          }
        }
      } else {
        resolvedVersion = version;
        if(!pkg[type]) pkg[type] = {};
        pkg[type][dependency] = resolvedVersion;
      }

      result.added.push({
        type, dependency, version: resolvedVersion || '', ignore: ignore ?? false,
      });
    } else if (type && !isExisting(dependency) && ignore) {
      result.ignored.push({
        type, dependency, version: null, ignore,
      });
    }
  }

  if (update) {
    await fs.writeFile(packagePath, JSON.stringify(pkg, null, 2));
  }

  for (const [dependency, version] of Object.entries(oldDependencies)) {
    if (!(dependency in (pkg.dependencies ?? {}))) {
      result.removed.push({
        dependency, version, ignore: false, type: 'dependencies',
      });
    }
  }

  if (throwError) {
    if (result.added.length) {
      throw new Error(
        `Scripts related to ${packagePath} have ${result.added.length} missing dependencies (${result.added.map(({ dependency }) => dependency).join(', ')})`,
      );
    }

    if (result.removed.length) {
      throw new Error(
        `${packagePath} has ${result.removed.length} dependencies to remove (${result.removed.map(({ dependency }) => dependency).join(', ')})`,
      );
    }
  }

  return { ...result, package: pkg };
};

export default checkOnePackageImports;
