import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ts } from 'ts-morph';

type Aliases = { paths: { pattern: string; targets: string[]; base: string }[]; baseUrls: string[] };

const NO_ALIASES: Aliases = { paths: [], baseUrls: [] };
const EXTENSIONS = ['', '.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json'];

const configByDir = new Map<string, string | null>();
const aliasesByConfig = new Map<string, Aliases>();

// Node 22 throws ENOTDIR for a path under a file even with `throwIfNoEntry: false`
export const statOrNull = (filePath: string) => {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
};
const isFile = (filePath: string) => statOrNull(filePath)?.isFile() ?? false;
const exists = (filePath: string) => statOrNull(filePath) !== null;

// The closest tsconfig.json or jsconfig.json above `dir`.
function findConfig(dir: string): string | null {
  const cached = configByDir.get(dir);
  if (cached !== undefined) return cached;
  const own = ['tsconfig.json', 'jsconfig.json'].map((name) => path.join(dir, name)).find(isFile);
  const parent = path.dirname(dir);
  const config = own ?? (parent === dir ? null : findConfig(parent));
  configByDir.set(dir, config);
  return config;
}

// `paths` and `baseUrl` of a config, through `extends` and its project references.
function loadAliases(configPath: string, visiting = new Set<string>()): Aliases {
  const cached = aliasesByConfig.get(configPath);
  if (cached) return cached;
  if (visiting.has(configPath)) return NO_ALIASES;
  visiting.add(configPath);

  // a missing or unreadable config has no aliases
  const { config: json, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error) return NO_ALIASES;
  const parsed = ts.parseJsonConfigFileContent(json, ts.sys, path.dirname(configPath), undefined, configPath);
  const options = parsed.options;
  // paths are relative to baseUrl, or to the config that declares them
  const base = options.baseUrl ?? (options.pathsBasePath as string | undefined) ?? path.dirname(configPath);

  const aliases: Aliases = {
    paths: Object.entries(options.paths ?? {}).map(([pattern, targets]) => ({ pattern, targets, base })),
    baseUrls: options.baseUrl ? [options.baseUrl] : [],
  };
  for (const reference of parsed.projectReferences ?? []) {
    const referenced = loadAliases(ts.resolveProjectReferencePath(reference), visiting);
    aliases.paths.push(...referenced.paths);
    aliases.baseUrls.push(...referenced.baseUrls);
  }

  aliasesByConfig.set(configPath, aliases);
  return aliases;
}

// The `*` part of `request` for `pattern`, or null when it doesn't match.
function match(pattern: string, request: string): string | null {
  const star = pattern.indexOf('*');
  if (star === -1) return pattern === request ? '' : null;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  const fits =
    request.length >= prefix.length + suffix.length && request.startsWith(prefix) && request.endsWith(suffix);
  return fits ? request.slice(prefix.length, request.length - suffix.length) : null;
}

// The name in the closest package.json at or above `target`.
function packageNameAt(target: string): string | undefined {
  for (let dir = target; ; dir = path.dirname(dir)) {
    const packagePath = path.join(dir, 'package.json');
    if (isFile(packagePath)) {
      try {
        return JSON.parse(readFileSync(packagePath, 'utf8')).name;
      } catch {
        return undefined;
      }
    }
    if (path.dirname(dir) === dir) return undefined;
  }
}

// The existing path `target` stands for: itself, or with one of the extensions TypeScript tries.
const existingPath = (target: string) =>
  EXTENSIONS.map((extension) => target + extension).find((candidate) => exists(candidate));

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;

// The source file an import of `target` loads: the file, `.js` written for `.ts`, an added extension, or an index file.
export function resolveSourceFile(target: string): string | null {
  const candidates = [
    target,
    ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'].map((extension) => target + extension),
    ...[
      [/\.js$/, '.ts'],
      [/\.js$/, '.tsx'],
      [/\.jsx$/, '.tsx'],
      [/\.mjs$/, '.mts'],
      [/\.cjs$/, '.cts'],
    ].map(([from, to]) => target.replace(from as RegExp, to as string)),
    ...['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts'].map((extension) =>
      path.join(target, `index.${extension}`),
    ),
  ];
  return candidates.find((candidate) => SOURCE.test(candidate) && isFile(candidate)) ?? null;
}

// The project path the file's tsconfig/jsconfig maps `request` to: a `paths` target that exists, or a file under
// `baseUrl`; null when it is a package. As in TypeScript, the longest matching `paths` pattern wins, and a target that
// doesn't exist falls back to the package. A target inside a package named `packageName` (a workspace package) is the
// package.
export default function resolveAlias(filePath: string, request: string, packageName: string): string | null {
  const config = findConfig(path.dirname(filePath));
  if (!config) return null;
  const aliases = loadAliases(config);

  const best = aliases.paths
    .map((entry) => ({ ...entry, captured: match(entry.pattern, request) }))
    .filter((entry): entry is typeof entry & { captured: string } => entry.captured !== null)
    .sort((a, b) => b.pattern.indexOf('*') - a.pattern.indexOf('*') || b.pattern.length - a.pattern.length)[0];
  if (best) {
    const target = best.targets
      .map((t) =>
        path.resolve(
          best.base,
          t.replaceAll('*', () => best.captured),
        ),
      )
      .find((t) => existingPath(t));
    if (target) return packageNameAt(target) === packageName ? null : target;
  }
  for (const baseUrl of aliases.baseUrls) {
    const target = path.join(baseUrl, request);
    if (existingPath(target)) return target;
  }
  return null;
}
