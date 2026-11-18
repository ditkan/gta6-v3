// serve.ts — a tiny static file server for playing Port Azura: Heat locally.
//
//   node serve.ts            serves game/ at http://localhost:8080
//   PORT=9090 node serve.ts  serves on another port
//
// Standard library only. It serves nothing outside game/, sends no-cache headers so
// edits show up on reload, and answers 404 for anything that is not a real file.

import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'game');
const port = Number(process.env.PORT ?? 8080);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const wanted = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = normalize(join(root, '.' + wanted));

  // Refuse anything that climbs out of game/.
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  let body: Buffer;
  try {
    if (!statSync(filePath).isFile()) throw new Error('not a file');
    body = readFileSync(filePath);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: ' + wanted);
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(body);
});

server.listen(port, () => {
  console.log(`Port Azura: Heat is playable at http://localhost:${port}`);
});
