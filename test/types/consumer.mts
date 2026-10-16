// Type-checks the public API the way a consumer imports it, through the package's own exports.
import checkImports, {
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

const options: CheckImportsOptions = { directoryPath: '.', ignorePath: ['**/x/**'], processManually, update: false };
const results: CheckImportsResult = await checkImports(options);

for (const { packagePath, dependencies, result } of results) {
  const added: string[] = result.added.map(({ dependency }) => dependency);
  const name: string | undefined = result.package.name;
  console.log(packagePath, dependencies, added, name);
}

const isError: boolean = new Error() instanceof CheckImportsError;
console.log(isError);

// @ts-expect-error unknown option
await checkImports({ directory: '.' });
