export type DependenciesKey = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies';

export type PackageJson = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  checkImportsMissingDependencies?: Record<string, string>;
  [key: string]: unknown;
};
