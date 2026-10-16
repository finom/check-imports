# check-imports [![npm version](https://img.shields.io/npm/v/check-imports.svg)](https://www.npmjs.com/package/check-imports) [![CI](https://github.com/finom/check-imports/actions/workflows/ci.yml/badge.svg)](https://github.com/finom/check-imports/actions/workflows/ci.yml)

Reads the imports of a JavaScript or TypeScript project and reports, for each `package.json`:

- dependencies listed in `"dependencies"` that no file imports;
- packages that files import but no section of the closest `package.json` lists.

With `--update` it fixes `package.json`: adds the missing packages at their latest version and removes the unused ones.

It works with any number of `package.json` files, so a monorepo is checked in one run.

## TL;DR

```sh
npx check-imports
```

<img src="https://i.imgur.com/NNKg1de.png" alt="Screenshot" width="500"/>

Requires Node.js 22.12 or later.

## How it works

1. Finds the `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts` and `.cts` files in the directory (the current one, or `-d`), skipping `node_modules`.
2. Parses each file with the TypeScript parser ([ts-morph](https://www.npmjs.com/package/ts-morph)), JSX included, and collects the specifiers of `import … from`, `import()`, `require()`, `export … from` and `import x = require()`. A specifier counts only when it is a string literal.
3. Turns each specifier into a package name:
    1. `lodash/pick` becomes `lodash`, `@scope/pkg/foo` becomes `@scope/pkg`;
    2. webpack syntax goes: `style-loader!css-loader!pkg?query` becomes `pkg`;
    3. skipped: relative and absolute paths, Node.js built-ins (`fs`, `node:test`), URLs, subpath imports (`#internal`), aliases that can't be npm names (`@/components`, `~/utils`), and the package's own name.
4. Groups the names by the closest `package.json` of each file.
5. Compares each group with its `package.json`:
    1. a package listed in `"dependencies"`, `"devDependencies"`, `"peerDependencies"` or `"optionalDependencies"` is present, and its version stays;
    2. a package listed nowhere is missing; with `--update` it is added to `"dependencies"` at `^<latest version>`, read from the registry npm uses (`npm_config_registry`, or registry.npmjs.org). A package the registry doesn't have goes to `"checkImportsMissingDependencies"` with the version `?.?.?`;
    3. a package in `"dependencies"` that no file imports is unused; with `--update` it is removed.

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
- `-e`, `--throw-error`: exit with code 1 when a `package.json` has missing or unused dependencies (for CI). The result is printed first.
- `-n`, `--ignore-imports <names>`: comma-separated packages to leave alone: never added, never removed (`-n react,tslib`).
- `--ignore-path <globs>`: comma-separated globs of files to skip, relative to the directory (`--ignore-path "legacy/**,**/*.test.js"`).
- `-V`, `--version`, `-h`, `--help`.

## API

```js
import checkImports from 'check-imports';

const results = await checkImports(options);
```

### Options

- `directoryPath = process.cwd()`: the directory to check.
- `update = false`: update the `package.json` files.
- `throwError = false`: after checking every `package.json`, throw a `CheckImportsError` that lists each one with missing or unused dependencies. With `update`, the files are written first.
- `log = false`: print the result, as the CLI does.
- `ignorePath = []`: a glob or an array of globs of files to skip, relative to `directoryPath`.
- `processManually`: a function called with each package name: every imported package missing from `package.json`, and every unused one in `"dependencies"`. It returns:
    - `true`: handle the package the regular way;
    - `false`: leave it alone: an imported one isn't added (it shows in `ignored`), an unused one isn't removed;
    - an object with optional `version` and `type`: `version` sets the version instead of the latest one, `type` sets the section it goes to (`"peerDependencies"`, `"optionalDependencies"` or any custom key). The default type is `"dependencies"`.

```js
const results = await checkImports({
  directoryPath: path.resolve(import.meta.dirname, 'foo'),
  ignorePath: ['**/ignored.*'],
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
    ignored: DependencyInfo[]; // imported, left alone by processManually
    package: PackageJson; // the package.json as it is after the check
  };
}

type DependencyInfo = { dependency: string; version: string | null; type: string; ignore: boolean };
```

The types (`CheckImportsOptions`, `CheckImportsResult`, `ProcessManuallyResult`, `DependencyInfo`, `PackageJson`) are exported.

## License

MIT
