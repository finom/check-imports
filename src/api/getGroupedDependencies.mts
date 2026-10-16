import path from 'node:path';
import { findUp } from 'find-up';
import { glob } from 'glob';
import getImportsFromFile from './getImportsFromFile.mjs';

// Imported package names per package.json path, each file counted for its closest package.json.
export default async function getGroupedDependencies({
  directoryPath,
  ignorePath = [],
}: {
  directoryPath: string;
  ignorePath?: string | string[];
}): Promise<Record<string, string[]>> {
  const filePaths = await glob('**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}', {
    cwd: directoryPath,
    absolute: true,
    nodir: true,
    ignore: ['**/node_modules/**', ...(typeof ignorePath === 'string' ? [ignorePath] : ignorePath)],
  });

  const packagePaths = new Map<string, Promise<string | undefined>>();
  const groups: Record<string, Set<string>> = {};

  for (const filePath of filePaths.sort()) {
    const dirname = path.dirname(filePath);
    if (!packagePaths.has(dirname)) packagePaths.set(dirname, findUp('package.json', { cwd: dirname }));
    const packagePath = await packagePaths.get(dirname);
    if (!packagePath) continue;

    groups[packagePath] ??= new Set();
    for (const name of await getImportsFromFile(filePath)) groups[packagePath].add(name);
  }

  return Object.fromEntries(Object.entries(groups).map(([packagePath, names]) => [packagePath, [...names]]));
}
