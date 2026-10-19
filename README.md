# check-imports [![npm version](https://img.shields.io/npm/v/check-imports.svg)](https://www.npmjs.com/package/check-imports) [![CI](https://github.com/finom/check-imports/actions/workflows/ci.yml/badge.svg)](https://github.com/finom/check-imports/actions/workflows/ci.yml) [![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15698/badge)](https://www.bestpractices.dev/projects/15698)

Reads the imports of a JavaScript or TypeScript project and reports, for each `package.json`:

- packages that files import but no section of the closest `package.json` lists;
- dependencies listed in `"dependencies"` that no file imports;
- packages that runtime code imports but only `"devDependencies"` lists.

With `--update` it fixes `package.json`: adds the missing packages at their latest version, removes the unused ones and moves the misplaced ones to `"dependencies"`.

It works with any number of `package.json` files, so a monorepo is checked in one run.

## TL;DR

```sh
npx check-imports
```

<img src="https://raw.githubusercontent.com/finom/check-imports/master/docs/screenshot.png" alt="npx check-imports output: dependencies that remain, to add, to remove and to move" width="500"/>

Requires Node.js 22.12 or later.

## How it works

1. **Finds the files.** The `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts` and `.cts` files in the directory (the current one, or `-d`). In a git repository the list comes from git, so what `.gitignore` lists is skipped: build output, caches, generated code. Outside a repository every file is read except `node_modules`. When a checked file imports an ignored file (a generated client, for example) by a relative path or a tsconfig alias, that file is read too, for the importing package.
2. **Collects the imports.** Each file is parsed with the TypeScript parser ([ts-morph](https://www.npmjs.com/package/ts-morph)), JSX included, for the specifiers of `import … from`, `import()`, `require()`, `export … from` and `import x = require()`. A specifier counts only when it is a string literal.
3. **Turns each specifier into a package name:**
    1. `lodash/pick` becomes `lodash`, `@scope/pkg/foo` becomes `@scope/pkg`;
    2. webpack syntax goes: `style-loader!css-loader!pkg?query` becomes `pkg`;
    3. skipped: relative and absolute paths, Node.js built-ins (`fs`, `node:test`), URLs, subpath imports (`#internal`), names npm can't publish (`@/components`, `~/utils`), and the package's own name;
    4. skipped as well: aliases from the closest `tsconfig.json` or `jsconfig.json` (`extends` and project references included): a `paths` entry whose target exists, and a file under `baseUrl`. As in TypeScript, a `paths` target that doesn't exist falls back to the package. A `paths` entry that points into a workspace package with that name is the package. An aliased name that `package.json` lists counts as used, since the code it maps to may need it.
4. **Sorts the files into runtime and dev.** Dev files are tests, stories, config files and scripts (the list is under `devPath` below). Type-only imports (`import type`, `export type … from`) and imports in `.d.ts` files count as dev too.
5. **Groups the names by the closest `package.json` of each file and compares:**
    1. a package listed in `"dependencies"`, `"devDependencies"`, `"peerDependencies"` or `"optionalDependencies"` is present, and its version stays. A type-only import is also satisfied by its `@types` package (`@types/json-schema`, `@types/babel__core`);
    2. a package listed nowhere is missing; with `--update` it is added at `^<latest version>`: to `"devDependencies"` when only dev files import it, to `"dependencies"` otherwise. The version comes from the registry npm uses (`npm_config_registry`, or registry.npmjs.org). A package the registry doesn't have goes to `"checkImportsMissingDependencies"` with the version `?.?.?`;
    3. a package in `"dependencies"` that no file imports is unused; with `--update` it is removed. An `@types` package stays while the package it types is imported;
    4. a package that runtime code imports but only `"devDependencies"` lists is misplaced: installing the published package wouldn't install it. With `--update` it moves to `"dependencies"` with its version. A `package.json` with `"private": true` isn't published, so this check skips it.

`--update` keeps the file's indentation and final newline, and doesn't touch a `package.json` that needs no change. Run `npm install` afterwards.

For a private registry, set `NPM_TOKEN`; it is sent as a bearer token.

### Ignoring an import

A `check-imports-ignore-line` comment ignores the imports on its line. On a line of its own, it ignores the next line.

```js
require('lodash'); // check-imports-ignore-line

// check-imports-ignore-line
import foo from 'foo';
```

## CLI

```sh
npx check-imports [options]
```

- `-d`, `--directory-path <path>`: the directory to check. Default: the current one.
- `-u`, `--update`: update the `package.json` files.
- `-e`, `--throw-error`: exit with code 1 when a `package.json` has missing, unused or misplaced dependencies (for CI). The result is printed first.
- `-n`, `--ignore-imports <names>`: comma-separated packages to leave alone: never added, removed or moved (`-n react,tslib`).
- `--ignore-path <globs>`: comma-separated globs of files to skip, relative to the directory (`--ignore-path "legacy/**,**/*.test.js"`).
- `--dev-path <globs>`: comma-separated globs of dev files, relative to each `package.json`; they replace the default list.
- `--no-gitignore`: read the files `.gitignore` lists too.
- `--json`: print the result as JSON (the API's result below) and nothing else. With `-e`, the error goes to stderr.
- `-V`, `--version`, `-h`, `--help`.

## API

```js
import checkImports from 'check-imports';

const results = await checkImports(options);
```

### Options

- `directoryPath = process.cwd()`: the directory to check.
- `update = false`: update the `package.json` files.
- `throwError = false`: after checking every `package.json`, throw a `CheckImportsError` that lists each one with missing, unused or misplaced dependencies. The error's `results` holds the result. With `update`, the files are written first.
- `log = false`: print the result, as the CLI does.
- `ignorePath = []`: a glob or an array of globs of files to skip, relative to `directoryPath`.
- `devPath = DEFAULT_DEV_PATHS`: a glob or an array of globs of dev files, relative to each `package.json`. The default, exported as `DEFAULT_DEV_PATHS`: `**/*.{test,spec}.*`, `**/__tests__/**`, `**/__mocks__/**`, `**/test/**`, `**/tests/**`, `**/e2e/**`, `**/*.stories.*`, `*.config.*` and `**/scripts/**`. To add to it: `devPath: [...DEFAULT_DEV_PATHS, 'qa/**']`.
- `gitignore = true`: in a git repository, skip what `.gitignore` lists.
- `processManually`: a function called with each package name: every imported package missing from `package.json`, every misplaced one, and every unused one in `"dependencies"`. It returns:
    - `true`: handle the package the regular way;
    - `false`: leave it alone: an imported one isn't added (it shows in `ignored`), a misplaced one isn't moved, an unused one isn't removed;
    - an object with optional `version` and `type`: `version` sets the version instead of the latest one, `type` sets the section it goes to (`"peerDependencies"`, `"optionalDependencies"` or any custom key). The default type is `"dependencies"`, or `"devDependencies"` for a package only dev files import. A misplaced package with a `type` other than `"dependencies"` stays where it is.

```js
import { DEFAULT_DEV_PATHS } from 'check-imports';

const results = await checkImports({
  directoryPath: path.resolve(import.meta.dirname, 'foo'),
  ignorePath: ['**/ignored.*'],
  devPath: [...DEFAULT_DEV_PATHS, 'qa/**'],
  processManually: (dependency) => {
    if (dependency === 'react') {
      // add it to peerDependencies with this version
      return { version: '>=18', type: 'peerDependencies' };
    }
    if (dependency === 'react-redux') {
      // add it to customDependencies at the latest version
      return { type: 'customDependencies' };
    }
    if (dependency === 'moment') {
      // add it at this version
      return { version: '^2.30.0' };
    }
    if (dependency === 'redux') {
      // leave it alone
      return false;
    }

    return true;
  },
  update: true,
});
```

### Result

An array with one item per `package.json`:

```ts
{
  packagePath: string; // the package.json
  dependencies: string[]; // the package names its files import
  result: {
    existing: DependencyInfo[]; // imported and listed
    added: DependencyInfo[]; // imported, not listed
    removed: DependencyInfo[]; // in "dependencies", not imported
    misplaced: DependencyInfo[]; // imported by runtime code, listed only in "devDependencies"
    ignored: DependencyInfo[]; // imported, left alone by processManually
    package: PackageJson; // the package.json as it is after the check
  };
}

type DependencyInfo = { dependency: string; version: string | null; type: string; ignore: boolean };
```

The types (`CheckImportsOptions`, `CheckImportsResult`, `ProcessManuallyResult`, `DependencyInfo`, `PackageJson`) are exported.

## License

MIT
