import { promises as fs } from 'node:fs';
import chalk from 'chalk';
import type { DependenciesKey, PackageJson } from '../types/index.mjs';
import type { ImportedPackages } from './getGroupedDependencies.mjs';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

// The latest version on the registry npm uses (`npm_config_registry`), or null when the package has none there.
async function getLatestVersion(dependency: string): Promise<string | null> {
  const registry = process.env.npm_config_registry || DEFAULT_REGISTRY;
  // `@scope/name` → `@scope%2Fname`, the form npm itself requests
  const path = dependency.startsWith('@')
    ? `@${encodeURIComponent(dependency.slice(1))}`
    : encodeURIComponent(dependency);
  const url = new URL(path, registry.endsWith('/') ? registry : `${registry}/`);
  const headers: Record<string, string> = {
    accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8',
  };
  if (process.env.NPM_TOKEN) headers.authorization = `Bearer ${process.env.NPM_TOKEN}`;

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    throw new Error(`Unable to get the latest version of "${dependency}" from ${registry}`, { cause: error });
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Unable to get the latest version of "${dependency}" from ${registry}: ${response.status}`);
  }

  const distTags = ((await response.json()) as { 'dist-tags'?: Record<string, string> })['dist-tags'] ?? {};
  return distTags.latest ?? Object.values(distTags)[0] ?? null;
}

export type ProcessManuallyResult =
  | boolean
  | {
      type?: DependenciesKey | (string & {});
      version?: string | null;
      ignore?: boolean;
    };

export type DependencyInfo = {
  dependency: string;
  version: string | null;
  type: DependenciesKey | (string & {});
  ignore: boolean;
};

export type CheckResult = {
  existing: DependencyInfo[];
  added: DependencyInfo[];
  removed: DependencyInfo[];
  misplaced: DependencyInfo[];
  ignored: DependencyInfo[];
  package: PackageJson;
};

const LISTS = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'] as const;

// `json-schema` → `@types/json-schema`, `@babel/core` → `@types/babel__core`
const typesPackage = (name: string) => `@types/${name.startsWith('@') ? name.slice(1).replace('/', '__') : name}`;

function serialize(pkg: PackageJson, original: string): string {
  const indent = original.match(/^[ \t]+(?=")/m)?.[0] ?? 2;
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const json = JSON.stringify(pkg, null, indent).replaceAll('\n', eol);
  return /\n$/.test(original) ? json + eol : json;
}

export default async function checkOnePackageImports({
  packagePath,
  imports,
  processManually,
  update = false,
  log = false,
}: {
  packagePath: string;
  imports: ImportedPackages;
  processManually?: (dependency: string) => ProcessManuallyResult;
  update?: boolean;
  log?: boolean;
}): Promise<{ dependencies: string[]; result: CheckResult }> {
  const text = await fs.readFile(packagePath, 'utf8');
  let original: PackageJson;
  try {
    original = JSON.parse(text);
  } catch (error) {
    throw new Error(`${packagePath} is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
  const pkg = structuredClone(original);
  const result: CheckResult = { existing: [], added: [], removed: [], misplaced: [], ignored: [], package: pkg };

  // a package that only dev files import goes to devDependencies
  const decide = (dependency: string) => {
    const defaultType = imports.get(dependency)?.runtime ? 'dependencies' : 'devDependencies';
    const decision = processManually ? processManually(dependency) : true;
    if (typeof decision === 'boolean') return { type: defaultType, version: null, ignore: !decision };
    return {
      type: decision.type || defaultType,
      version: decision.version || null,
      ignore: decision.ignore ?? false,
    };
  };

  const isListed = (dependency: string) =>
    LISTS.some((type) => original[type] && Object.hasOwn(original[type], dependency));
  // an aliased name counts only when package.json lists it: the code it maps to may need the package
  const imported = [...imports.entries()]
    .filter(([name, { aliased }]) => name !== pkg.name && (!aliased || isListed(name)))
    .map(([name]) => name);
  const listed = new Set<string>();

  // a type-only import is also satisfied by its @types package
  for (const dependency of imported) {
    const names = imports.get(dependency)?.typeOnly ? [dependency, typesPackage(dependency)] : [dependency];
    for (const name of names) {
      for (const type of LISTS) {
        const list = original[type];
        if (list && Object.hasOwn(list, name)) {
          listed.add(dependency);
          result.existing.push({ dependency: name, version: list[name], type, ignore: false });
        }
      }
    }
  }
  const typesOfImported = new Set(imported.map(typesPackage));

  // A dependency that no file imports goes, unless processManually ignores it; @types/x stays while x is imported.
  if (original.dependencies) {
    pkg.dependencies = {};
    for (const [dependency, version] of Object.entries(original.dependencies)) {
      if (imported.includes(dependency) || typesOfImported.has(dependency) || decide(dependency).ignore) {
        pkg.dependencies[dependency] = version;
      } else {
        result.removed.push({ dependency, version, type: 'dependencies', ignore: false });
      }
    }
  }

  // A runtime import listed only in devDependencies breaks the published package; a private one isn't published.
  if (!original.private && original.devDependencies) {
    const devDependencies = original.devDependencies;
    const elsewhere = (dependency: string) =>
      LISTS.some((type) => type !== 'devDependencies' && original[type] && Object.hasOwn(original[type], dependency));
    for (const dependency of imported) {
      if (imports.get(dependency)?.aliased || !Object.hasOwn(devDependencies, dependency) || elsewhere(dependency))
        continue;
      const { type, ignore } = decide(dependency);
      if (ignore || type !== 'dependencies') continue;

      const version = devDependencies[dependency];
      result.misplaced.push({ dependency, version, type: 'devDependencies', ignore: false });
      pkg.dependencies = { ...pkg.dependencies, [dependency]: version };
      pkg.devDependencies = Object.fromEntries(
        Object.entries(pkg.devDependencies ?? {}).filter(([name]) => name !== dependency),
      );
    }
  }

  for (const dependency of imported) {
    if (listed.has(dependency)) continue;
    const { type, version, ignore } = decide(dependency);

    if (ignore) {
      result.ignored.push({ dependency, version: null, type, ignore });
      continue;
    }

    const resolvedVersion = version ?? (await getLatestVersion(dependency).then((latest) => latest && `^${latest}`));
    if (resolvedVersion) {
      pkg[type] = { ...(pkg[type] as Record<string, string> | undefined), [dependency]: resolvedVersion };
    } else {
      pkg.checkImportsMissingDependencies = { ...pkg.checkImportsMissingDependencies, [dependency]: '?.?.?' };
      if (log) {
        console.log(
          chalk.bgRed(
            `Package "${dependency}" isn't found at NPM registry. It will be added to "checkImportsMissingDependencies" in package.json if "update" is true.`,
          ),
        );
      }
    }
    result.added.push({ dependency, version: resolvedVersion ?? '', type, ignore });
  }

  if (update && JSON.stringify(pkg) !== JSON.stringify(original)) {
    await fs.writeFile(packagePath, serialize(pkg, text));
  }

  return { dependencies: imported, result };
}
