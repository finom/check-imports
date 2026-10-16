import { promises as fs } from 'node:fs';
import chalk from 'chalk';
import type { DependenciesKey, PackageJson } from '../types/index.mjs';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

// The latest version on the registry npm uses (`npm_config_registry`), or null when the package isn't there.
async function getLatestVersion(dependency: string): Promise<string | null> {
  const registry = process.env.npm_config_registry || DEFAULT_REGISTRY;
  const url = new URL(dependency.replace('/', '%2f'), registry.endsWith('/') ? registry : `${registry}/`);
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

  const distTags = ((await response.json()) as { 'dist-tags': Record<string, string> })['dist-tags'];
  return distTags.latest ?? Object.values(distTags)[0];
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
  ignored: DependencyInfo[];
  package: PackageJson;
};

const LISTS = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'] as const;

function serialize(pkg: PackageJson, original: string): string {
  const indent = original.match(/^[ \t]+(?=")/m)?.[0] ?? 2;
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const json = JSON.stringify(pkg, null, indent).replaceAll('\n', eol);
  return /\n$/.test(original) ? json + eol : json;
}

export default async function checkOnePackageImports({
  packagePath,
  dependencies,
  processManually,
  update = false,
  log = false,
}: {
  packagePath: string;
  dependencies: string[];
  processManually?: (dependency: string) => ProcessManuallyResult;
  update?: boolean;
  log?: boolean;
}): Promise<CheckResult> {
  const text = await fs.readFile(packagePath, 'utf8');
  const original = JSON.parse(text) as PackageJson;
  const pkg = structuredClone(original);
  const result: CheckResult = { existing: [], added: [], removed: [], ignored: [], package: pkg };

  const decide = (dependency: string) => {
    const decision = processManually ? processManually(dependency) : true;
    if (typeof decision === 'boolean') return { type: 'dependencies', version: null, ignore: !decision };
    return {
      type: decision.type || 'dependencies',
      version: decision.version || null,
      ignore: decision.ignore ?? false,
    };
  };

  const imported = dependencies.filter((dependency) => dependency !== pkg.name);
  const listed = new Set<string>();

  for (const dependency of imported) {
    for (const type of LISTS) {
      const version = original[type]?.[dependency];
      if (version !== undefined) {
        listed.add(dependency);
        result.existing.push({ dependency, version, type, ignore: false });
      }
    }
  }

  // A dependency that no file imports goes, unless processManually ignores it.
  if (original.dependencies) {
    pkg.dependencies = {};
    for (const [dependency, version] of Object.entries(original.dependencies)) {
      if (imported.includes(dependency) || decide(dependency).ignore) {
        pkg.dependencies[dependency] = version;
      } else {
        result.removed.push({ dependency, version, type: 'dependencies', ignore: false });
      }
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

  return result;
}
