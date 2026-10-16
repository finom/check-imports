import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { findUp } from 'find-up';
import { glob } from 'glob';
import { minimatch } from 'minimatch';
import getImportsFromFile from './getImportsFromFile.mjs';

const SOURCE_FILES = '**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}';

// Files whose imports belong in devDependencies, relative to their package.json.
export const DEFAULT_DEV_PATHS = [
  '**/*.{test,spec}.*',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/test/**',
  '**/tests/**',
  '**/e2e/**',
  '**/*.stories.*',
  '*.config.*',
  '**/scripts/**',
];

const toArray = (value: string | string[]) => (typeof value === 'string' ? [value] : value);

// The files git sees in `directoryPath`: tracked or untracked, without what .gitignore lists. Null outside a repo.
async function listGitFiles(directoryPath: string): Promise<string[] | null> {
  try {
    const { stdout } = await promisify(execFile)(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { cwd: directoryPath, maxBuffer: 256 * 1024 * 1024 },
    );
    return [...new Set(stdout.split('\0').filter(Boolean))];
  } catch {
    return null;
  }
}

// The source files to check, and the package.json files git sees (null outside a repo or with gitignore off).
async function listFiles(
  directoryPath: string,
  ignore: string[],
  gitignore: boolean,
): Promise<{ files: string[]; packageJsons: Set<string> | null }> {
  const gitFiles = gitignore ? await listGitFiles(directoryPath) : null;
  if (!gitFiles) {
    return {
      files: await glob(SOURCE_FILES, { cwd: directoryPath, absolute: true, nodir: true, ignore }),
      packageJsons: null,
    };
  }

  const existing = (file: string) => statSync(file, { throwIfNoEntry: false })?.isFile();
  const files = gitFiles
    .filter((file) => minimatch(file, SOURCE_FILES) && !ignore.some((pattern) => minimatch(file, pattern)))
    .map((file) => path.resolve(directoryPath, file))
    .filter(existing);
  const packageJsons = gitFiles
    .filter((file) => path.basename(file) === 'package.json')
    .map((file) => path.resolve(directoryPath, file));
  return { files, packageJsons: new Set(packageJsons) };
}

export type ImportedPackages = Map<string, { runtime: boolean; aliased: boolean; typeOnly: boolean }>;

// Imported package names per package.json path, each file counted for its closest package.json.
// `runtime`: a file outside the dev paths imports the package, not only as a type. `aliased`: every import of it is a
// tsconfig alias. `typeOnly`: every import of it is type-only.
// An ignored file that a checked file imports (generated code) is read too, and counts for the importing package.
export default async function getGroupedDependencies({
  directoryPath,
  ignorePath = [],
  devPath = DEFAULT_DEV_PATHS,
  gitignore = true,
}: {
  directoryPath: string;
  ignorePath?: string | string[];
  devPath?: string | string[];
  gitignore?: boolean;
}): Promise<Record<string, ImportedPackages>> {
  const ignore = ['**/node_modules/**', ...toArray(ignorePath)];
  const { files, packageJsons } = await listFiles(directoryPath, ignore, gitignore);
  const filePaths = files.sort();
  const listed = new Set(filePaths);
  const devPatterns = toArray(devPath);
  const packagePaths = new Map<string, Promise<string | undefined>>();
  const groups: Record<string, ImportedPackages> = {};
  const followed = new Set<string>();

  const isFollowable = (file: string) => {
    const relativePath = path.relative(directoryPath, file).split(path.sep).join('/');
    return (
      !listed.has(file) &&
      !relativePath.startsWith('../') &&
      !path.isAbsolute(relativePath) &&
      !ignore.some((pattern) => minimatch(relativePath, pattern, { dot: true }))
    );
  };

  const closestPackageJson = (filePath: string) => {
    const dirname = path.dirname(filePath);
    if (!packagePaths.has(dirname)) packagePaths.set(dirname, findUp('package.json', { cwd: dirname }));
    return packagePaths.get(dirname) as Promise<string | undefined>;
  };

  // A followed file counts for the importer when it is in the importer's package, or under a package.json git ignores
  // too (a generated stub); a file in another package belongs to that package.
  const belongsTo = async (file: string, packagePath: string) => {
    const owner = await closestPackageJson(file);
    return !owner || owner === packagePath || !packageJsons?.has(owner);
  };

  const read = async (filePath: string, packagePath: string, runtime: boolean) => {
    groups[packagePath] ??= new Map();
    const group = groups[packagePath];
    const { imports, localFiles } = await getImportsFromFile(filePath);
    for (const { name, aliased, typeOnly } of imports) {
      const known = group.get(name);
      group.set(name, {
        runtime: (runtime && !typeOnly) || (known?.runtime ?? false),
        aliased: aliased && (known?.aliased ?? true),
        typeOnly: typeOnly && (known?.typeOnly ?? true),
      });
    }
    for (const file of localFiles) {
      const key = `${file}\0${packagePath}\0${runtime}`;
      if (followed.has(key) || !isFollowable(file)) continue;
      followed.add(key);
      if (!(await belongsTo(file, packagePath))) continue;
      await read(file, packagePath, runtime);
    }
  };

  for (const filePath of filePaths) {
    const packagePath = await closestPackageJson(filePath);
    if (!packagePath) continue;

    const relativePath = path.relative(path.dirname(packagePath), filePath).split(path.sep).join('/');
    await read(filePath, packagePath, !devPatterns.some((pattern) => minimatch(relativePath, pattern, { dot: true })));
  }

  return groups;
}
