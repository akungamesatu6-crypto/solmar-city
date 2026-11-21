// Harbor Heat — Solmar Bay: a tiny static server for local play-testing.
//
// Serves this repo's game/ folder on http://localhost:8080 (or --port N):
//   node serve.ts
//   node serve.ts --port 9000
//
// Node 22 standard library only. It answers with the MIME types a browser
// game needs, refuses any path that escapes game/, and is a development
// convenience — not a server for the open internet.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The game folder sits beside this file.
const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));

// Pick the port: --port N wins, anything invalid falls back to 8080.
function pickPort(): number {
  const argv = process.argv.slice(2);
  const flagAt = argv.indexOf('--port');
  const wanted = flagAt === -1 ? 8080 : Number(argv[flagAt + 1]);
  return Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : 8080;
}

const port = pickPort();

// MIME types a browser game needs; anything else is a generic byte stream.
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

function mimeFor(file: string): string {
  return MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(gameRoot, normalize(pathname)));
  // Never serve anything outside game/.
  if (file !== gameRoot && !file.startsWith(gameRoot + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': mimeFor(file),
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Harbor Heat is on http://localhost:${port}`);
});
