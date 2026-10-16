import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const cliPath = fileURLToPath(new URL('../dist/cli.mjs', import.meta.url));

// A fake npm registry. `versions` maps a name to its latest version, to its dist-tags, or to an HTTP status;
// any other name is a 404.
export async function startRegistry(versions = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.slice(1));
    requests.push({ name, authorization: req.headers.authorization });
    const entry = versions[name];
    if (typeof entry === 'number') {
      res.writeHead(entry);
      res.end();
    } else if (entry !== undefined) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ name, 'dist-tags': typeof entry === 'string' ? { latest: entry } : entry }));
    } else {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":"Not found"}');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const previous = process.env.npm_config_registry;
  process.env.npm_config_registry = url;
  return {
    url,
    requests,
    async close() {
      if (previous === undefined) delete process.env.npm_config_registry;
      else process.env.npm_config_registry = previous;
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// Writes `files` (path → string, or object for JSON) into a fresh temp dir.
export async function fixture(files) {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'check-imports-')));
  for (const [file, content] of Object.entries(files)) {
    const filePath = path.join(dir, file);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
  return dir;
}

export const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

export function runCli(args, { cwd, env = {} } = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cliPath, ...args],
      { cwd, env: { ...process.env, FORCE_COLOR: '0', ...env } },
      (error, stdout, stderr) => {
        resolve({ code: error ? error.code : 0, stdout, stderr });
      },
    );
  });
}

export const names = (list) => list.map(({ dependency }) => dependency).sort();
