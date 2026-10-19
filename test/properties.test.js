import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import fc from 'fast-check';
import getImportsFromFile from '../dist/api/getImportsFromFile.mjs';

let dir;
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'check-imports-props-'));
});
after(() => fs.rm(dir, { recursive: true, force: true }));

let count = 0;
async function importsOf(source, ext = '.ts') {
  const file = path.join(dir, `f${count++}${ext}`);
  await fs.writeFile(file, source);
  return (await getImportsFromFile(file)).imports;
}

const segment = fc.stringMatching(/^[a-z0-9][a-z0-9._-]{0,12}$/);
const packageName = fc.oneof(
  segment,
  fc.tuple(segment, segment).map(([scope, name]) => `@${scope}/${name}`),
);
const subpath = fc.array(segment, { maxLength: 3 }).map((parts) => parts.map((p) => `/${p}`).join(''));
const form = fc.constantFrom(
  (s) => `import x from '${s}';`,
  (s) => `import * as ns from '${s}';`,
  (s) => `import '${s}';`,
  (s) => `export * from '${s}';`,
  (s) => `export { y } from '${s}';`,
  (s) => `const r = require('${s}');`,
  (s) => `import eq = require('${s}');`,
  (s) => `const d = import('${s}');`,
);

test('any import form of a package path reports the package name', async () => {
  await fc.assert(
    fc.asyncProperty(packageName, subpath, form, async (name, sub, write) => {
      const imports = await importsOf(write(`${name}${sub}`));
      assert.deepEqual(
        imports.map((i) => i.name),
        [name],
      );
    }),
    { numRuns: 200 },
  );
});

test('an import on a line with the ignore marker is never reported', async () => {
  await fc.assert(
    fc.asyncProperty(packageName, packageName, form, async (kept, ignored, write) => {
      fc.pre(kept !== ignored);
      const source = `${write(kept)}\n${write(ignored)} // check-imports-ignore-line\n`;
      assert.deepEqual(
        (await importsOf(source)).map((i) => i.name),
        [kept],
      );
    }),
    { numRuns: 100 },
  );
});

test('relative paths, built-ins and URLs are never reported as packages', async () => {
  const notPackage = fc.oneof(
    subpath.map((s) => `.${s || '/x'}`),
    subpath.map((s) => `..${s || '/x'}`),
    fc.constantFrom('fs', 'node:fs', 'path', 'node:test', 'https://example.com/x.js', '#internal'),
  );
  await fc.assert(
    fc.asyncProperty(notPackage, form, async (specifier, write) => {
      assert.deepEqual(await importsOf(write(specifier)), []);
    }),
    { numRuns: 100 },
  );
});

test('any text parses without throwing', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({ maxLength: 200 }),
      fc.constantFrom('.ts', '.tsx', '.js', '.mjs', '.cjs'),
      async (text, ext) => {
        const imports = await importsOf(text, ext);
        assert.ok(Array.isArray(imports));
      },
    ),
    { numRuns: 200 },
  );
});
