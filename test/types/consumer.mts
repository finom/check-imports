// Type-checks the public API the way a consumer imports it, through the package's own exports.
import checkImports, {
  DEFAULT_DEV_PATHS,
  type CheckImportsOptions,
  type CheckImportsResult,
  CheckImportsError,
  type ProcessManuallyResult,
} from 'check-imports';

const processManually = (dependency: string): ProcessManuallyResult => {
  if (dependency === 'react') return { type: 'peerDependencies', version: '>=18' };
  if (dependency === 'custom') return { type: 'customDependencies' };
  return dependency !== 'skipped';
};

const options: CheckImportsOptions = {
  directoryPath: '.',
  ignorePath: ['**/x/**'],
  devPath: [...DEFAULT_DEV_PATHS, 'qa/**'],
  gitignore: false,
  processManually,
  update: false,
};
const results: CheckImportsResult = await checkImports(options);

for (const { packagePath, dependencies, result } of results) {
  const added: string[] = result.added.map(({ dependency }) => dependency);
  const misplaced: (string | null)[] = result.misplaced.map(({ version }) => version);
  console.log(misplaced);
  const name: string | undefined = result.package.name;
  console.log(packagePath, dependencies, added, name);
}

const error: unknown = new Error();
if (error instanceof CheckImportsError) {
  const fromError: CheckImportsResult = error.results;
  console.log(fromError);
}

// @ts-expect-error unknown option
await checkImports({ directory: '.' });
