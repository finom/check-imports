import findUp from "find-up";
import path from "path";
import glob from "glob-promise";
import getImportsFromFile from "./getImportsFromFile.mjs";

type GetGroupedDependenciesOptions = {
  directoryPath: string;
  ignorePath?: string | string[];
  throwError?: boolean;
  log?: boolean;
};

export default async function getGroupedDependencies({
  directoryPath,
  ignorePath,
  throwError = false,
  log = false,
}: GetGroupedDependenciesOptions): Promise<Record<string, Record<string, boolean>>> {
  const filePaths = await glob(path.resolve(directoryPath, "**/*.{ts,js,jsx}"), {
    ignore: [
      "**/node_modules/**",
      ...(typeof ignorePath === "string" ? [ignorePath] : ignorePath || []),
    ],
  });

  const groups: Record<string, Record<string, boolean>> = {};
  const groupedDependencies: Record<string, Record<string, boolean>> = {};

  for (const filePath of filePaths) {
    const dirname = path.dirname(filePath);
    const packagePath = await findUp("package.json", { cwd: dirname });

    if (packagePath) {
      groups[packagePath] = groups[packagePath] || {};
      groups[packagePath][filePath] = true;
    }
  }

  for (const [packagePath, filesGroup] of Object.entries(groups)) {
    const deps: Record<string, boolean> = {};
    groupedDependencies[packagePath] = deps;

    for (const filePath of Object.keys(filesGroup)) {
      const imports = await getImportsFromFile({
        filePath,
        throwError,
        log,
      });

      for (const imp of imports) {
        deps[imp] = true;
      }
    }
  }

  return groupedDependencies;
}
