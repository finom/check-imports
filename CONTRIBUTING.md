# Contributing

Issues and pull requests are welcome at https://github.com/finom/check-imports. For a security problem, see [SECURITY.md](./SECURITY.md) instead.

## Setup

Node.js 24 for development (the package itself supports 22.12 and later).

```sh
npm ci
npm test
```

## Before a pull request

- `npm run lint`: Biome, the linter and the formatter; warnings fail too. `npx biome format --write .` formats.
- `npm run typecheck`: strict TypeScript, for the source and for a consumer of the public types.
- `npm run test:coverage`: builds, then runs the tests with `node --test`. Every line must be covered.
- `npm run check-imports`: the tool checks its own repository.
- `npm run check:dist`: packs the package, installs it in an empty project and runs it.

CI runs all of them on Linux, macOS and Windows, with Node.js 22.12 and 24.

## Tests

New behavior comes with tests, and a bug fix comes with a test that fails without the fix. Tests live in `test/*.test.mjs` and build their projects as temporary fixtures, with a local fake registry, so they need no network.

## Changes

Add a line to the `[Unreleased]` section of [CHANGELOG.md](./CHANGELOG.md) for anything a user would notice. Releases are made by the maintainer from tags; see `scripts/release.mjs`.
