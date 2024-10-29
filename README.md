# check-imports [![npm version](https://badge.fury.io/js/check-imports.svg)](https://badge.fury.io/js/check-imports) [![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](https://www.typescriptlang.org)


Checks `import from` declarations, `import` and `require` calls then updates or removes package.json dependencies (if `update` option described below is set to `true`, otherwise you only get informed) from package.json files. Works great with single-package modules as well as with big projects with multiple package.json files (if you have a monorepo, for example).

## TL;DR
Install: `npm i -D check-imports` and use: `npx check-imports`.

<img src="https://i.imgur.com/NNKg1de.png" alt="Screenshot" width="500"/>


## How it works

1. The library gets all .js, .jsx, .ts files by a given path;
2. Builds AST tree via [ts-morph](https://www.npmjs.com/package/ts-morph);
3. Retrieves import paths from `import from`, `require()`, `import()`;
4. Runs the following filtering and mapping:
    1. Ignore relative paths;
    2. Ignore built-in NodeJS modules such as `node:path`, `path`, `node:fs`, `fs`, etc;
    3. Retrieve module names (`lodash/pick` becomes `lodash`);
    4. Retrieve module names from scoped packages (`@scope/module/foo/bar` becomes `@scope/module`);
    5. Get rid of Webpack syntax (`foo!bar!baz?quux=bat&xyzzy=plugh` becomes `baz`);
5. Finds a closest package.json file relative to the file with import;
6. Compares its contents with the retrieved list of imports and if `update` option is set to `true` the script updates it.
    1. If `ignore` option is provided then `"dependencies"` aren't going to be updated with a given dependency or multiple dependencies;
    2. If a dependency already exists either at `"dependencies"`, `"optionalDependencies"`, `"devDependencies"` or `"peerDependencies"` then `"dependencies"` aren't going to be updated and a dependency version remains the same;
    3. If none of these two, a dependency of a latest version is retrieved from NPM registry and going to be added to `"dependencies"`.

Note that after an update you still need to run `npm install` manually.

A bonus: imports can be ignored directly in code via `check-imports-ignore-line` comment

```js
require('lodash'); // check-imports-ignore-line
```

## CLI

The tool can be run via `npx check-imports`.

### Options
- `-u`, `--update` - update parent package.json files.
- `-e`, `--throw-error` - exit process with code 1 in case if there are redundant or missing dependencies (good for CI).
- `-d`, `--directory-path <value>` - a directory where JavaScript/TypeScript/JSX files are located.
- `--ignore-path <items>` - a glob pattern (or coma-delimited patterns) to ignore processed files (`--ignore-path "**/foo/*.js"`).
- `-n`, `--ignore-imports <items>` - a comma-delimited list of dependencies that don't need to appear at `"dependencies"`.


## API
```js
import checkImports from 'check-imports';
```

The API includes a bit wider set of options. It allows to map dependencies to check if a dependency needs to be ignored or get a wanted version.

```js
const results = await checkImports(options);
```

### Options
- `update = false` - either update package.json files or not.
- `throwError = false` - throw an error in case if there are redundant or missing dependencies
- `log = false` - print CLI output
- `directoryPath = process.cwd()` - a directory where JavaScript/TypeScript/JSX files are located.
- `ignorePath = []` - a glob pattern or an array of patterns to ignore processed files.
- `processManually = null` - a function which is run agains every found import. You may want to define it in case if you want to ignore some dependencies or set a wanted version. It should return either of the following values:
    - `true` - process a dependency a regular way.
    - `false` - ignore a dependency.
    - An object with optional keys `version` and `type`. `version` field makes possible to forcibly define a dependency version. `type` field defines a key at package.json where a dependency needs to be stored (`"optionalDependencies"`, `"peerDependencies"` or any custom). By default its value is `"dependencies"`.

```js
const results = await checkImports({
  directoryPath: path.resolve(__dirname, 'foo'),
  ignorePath: ['**/ignored.*'],
  processManually: (dependency) => {
    if (dependency === 'react') {
      // forcibly set version to 1.1.1 and add it to peerDependencies
      return {
        version: '1.1.1',
        type: 'peerDependencies',
      };
    }
    if (dependency === 'react-redux') {
      // add it to customDependencies
      return {
        type: 'customDependencies',
      };
    }
    if (dependency === 'moment') {
      // forcibly set version to ^999.999.999
      return {
        version: '^999.999.999',
      };
    }
    if (dependency === 'redux') {
      // ignore the dependency
      return false;
    }

    // else process regularly
    return true;
  },
  update: true,
});
```
