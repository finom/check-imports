# check-imports

Checks `import from` declarations, `import` and `require` calls then updates or removes package.json dependencies (if `update` option described below is set to `true`, otherwise you only get informed) from package.json files. Works great with single-package modules as well as with big projects with multiple package.json files (for example if you have a monorepo powered by [lerna](https://github.com/lerna/lerna)).

## TL;DR
Install: `npm i -D check-imports` and use: `npx check-imports`.

![](https://i.imgur.com/NNKg1de.png)

## How it works

1. The library gets all .js, .jsx, .ts files by a given path;
2. Builds their AST trees via [@babel/parser](https://babeljs.io/docs/en/babel-parser);
3. Retrieves import paths from `import from`, `require()`, `import()`;
4. Runs some filters and mappings:
  a. Ignore relative paths;
  b. Ignore built-in NodeJS modules such as `path`, `fs`, `child_process` etc;
  c. Retrieve module names (`lodash/pick` becomes `lodash`);
  d. Retrieve module names from scoped packages (`@scope/module/foo/bar` becomes `@scope/module`);
  e. Get rid of Webpack syntax (`foo!bar!baz?quux=bat&xyzzy=plugh` becomes `baz`);
5. Finds a "parent" (a closest) package.json file;
6. Compares its contents with the retrieved list of imports and if `update` option is set to `true` the script updates it.
  a. If `ignore` option is provided then `"dependencies"` aren't going to be updated with a given dependency or multiple dependencies;
  b. If a dependency already exists either at `"dependencies"`, `"optionalDependencies"` or `"peerDependencies"` then `"dependencies"` aren't going to be updated and a dependency version remains the same;
  c. If neither of things above is happened then a dependency of a latest version retrieved from NPM registry is going to be added to `"dependencies"`.

Note that after an update you still need to run `npm install` manually.

## CLI

The tool can be run via `npx check-imports`.

### Options
- `-u`, `--update` - update parent package.json files.
- `-e`, `--throw-error` - exit process with code 1 in case if there are redundant or missing dependencies (good for CI).
- `-d`, `--directory-path <value>` - a directory where JavaScript/TypeScript/JSX files are located.
- `--ignore-path <items>` - a glob pattern (or coma-delimited patterns) to ignore processed files.
- `-n`, `--ignore-imports <items>` - a comma-delimited list of dependencies that don't need to appear at `"dependencies"`.


## API
```js
const { checkImports } = require('check-imports');
```

The API includes a bit wider set of options. It allows to map dependencies to check if a dependency needs to be ignored or get a wanted version. It also allows to set a list of babel plugin passed to `babelParser` in case if you need to make the tool work with [flow](https://flow.org) syntax for example.

```js
await checkImports(options);
```

### Options
- `update = false` - either update package.json files or not.
- `throwError = false` - throw an error in case if there are redundant or missing dependencies
- `directoryPath = process.cwd()` - a directory where JavaScript/TypeScript/JSX files are located.
- `ignorePath = []` - a glob pattern or an array of patterns to ignore processed files.
- `babelPlugins = require('./defaultBabelPlugins')` - a list of parser plugins described [there](https://babeljs.io/docs/en/babel-parser).
- `processManually = null` - a function which is run agains every found import. You may want to define it in case if you want to ignore some dependencies or set a wanted version. It should return either of the following values:
  - `true` - process a dependency a regular way.
  - `false` - ignore a dependency.
  - An object with optional keys `version` and `type`. `version` field makes possible to forcibly define a dependency version. `type` field defines a key at package.json where a dependency needs to be stored (`"optionalDependencies"`, `"peerDependencies"` or any custom). By default its value is `"dependencies"`.

```js
await checkImports({
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
