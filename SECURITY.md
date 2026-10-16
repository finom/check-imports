# Security Policy

## Reporting

Use GitHub's private vulnerability reporting on this repository: [Report a vulnerability](https://github.com/finom/check-imports/security/advisories/new). Do not open a public issue. Include the version and a minimal project that reproduces it.

## Scope

check-imports reads the source files and `package.json` files of the directory it is given, asks the npm registry for the latest versions, and, with `--update`, writes those `package.json` files. It runs no code from the project it checks.

## Verifying a release

Releases from 2.0.0 on are published from GitHub Actions with npm provenance. `npm audit signatures` in a project that installs it checks the signature and the attestation.

## Terms

Fixes ship in the latest version — no backports. The software is provided **as is**, without warranty of any kind, per the [MIT license](./LICENSE).
