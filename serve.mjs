import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json'
};

createServer(async (request, response) => {
  const route = request.url === '/' ? '/index.html' : decodeURIComponent(request.url.split('?')[0]);
  const file = normalize(join(root, route));
  if (!file.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(8080, '0.0.0.0', () => {
  console.log('Living Jungle Wall: http://localhost:8080');
});
