# Changelog

All notable changes to check-imports are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions before 2.0.0 are in the [git tags](https://github.com/finom/check-imports/tags).

## [Unreleased]

2.0.0 needs Node.js 22.12 or later. The options and the result keep their shape; the changes below say what behaves differently.

### Added

- `.tsx` and `.cts` files are checked.
- `export … from`, `import x = require()` and `` require(`pkg`) `` count as imports.
- Exported types: `CheckImportsOptions`, `CheckImportsResult`, `ProcessManuallyResult`, `DependencyInfo`, `PackageJson`; and the `CheckImportsError` class.
- `npm_config_registry` sets the registry the latest versions come from, so `npx check-imports` reads the registry npm is configured with.

### Changed

- Each file is parsed by its extension, so JSX in `.js` and `.jsx` files is read as JSX, not as TypeScript.
- Skipped as non-packages: absolute paths, URLs, any `node:` module, subpath imports (`#internal`), aliases that can't be npm names (`@/components`, `~/utils`), and the package's own name.
- `check-imports-ignore-line` works at any depth (inside a function, an object, a multi-line call) and in block comments. On a line of its own it ignores the next line only; before, any comment above a top-level statement ignored the whole statement. A misspelled marker (`check-imports-ignore-lint`) no longer counts.
- `processManually` is also called for unused dependencies, and `false` keeps them; `-n` keeps them too. Before, there was no way to keep a dependency no file imports, such as `tslib`.
- `ignorePath` globs are relative to `directoryPath`. Before, only globs starting with `**/` matched.
- `throwError` checks every `package.json`, then throws one `CheckImportsError` that lists them all. Before, it threw at the first one. The CLI prints the result, then the error without a stack trace.
- A registry error other than 404, or a registry that can't be reached, fails the run. Before, the package was marked as not on npm (`?.?.?`).
- `--update` writes a `package.json` only when it changes, keeps its indentation and final newline, and doesn't add an empty `"dependencies"`.
- The package has an `exports` map; deep imports such as `check-imports/dist/api/index.mjs` no longer resolve.
- Releases are published from GitHub Actions with npm provenance.

### Fixed

- `-n` and `--ignore-path` split their value at commas. Before, `-n` matched substrings (`-n react-redux` also ignored `react` and `redux`), and `--ignore-path` took the whole value as one glob.
- The `processManually` type accepts the object form.

### Removed

- The unused `@babel/parser` and `@babel/traverse` dependencies, and `npm-registry-fetch` (the built-in `fetch` replaces it). `npm audit` on a fresh install finds nothing.

[Unreleased]: https://github.com/finom/check-imports/compare/v1.0.8...HEAD
[1.0.8]: https://github.com/finom/check-imports/tree/v1.0.8
