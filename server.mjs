import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const portArgument = process.argv[2] ?? '3018';
const port = Number(portArgument);
if (process.argv.length > 3 || !/^\d+$/.test(portArgument) || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Usage: node server.mjs [port] — port must be an integer from 1 to 65535.');
  process.exit(1);
}
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
// Serve runtime assets only, including when launched from a Git checkout.
const assets = new Set(['index.html', 'style.css', 'app.mjs', 'physics.mjs', 'diagnostics.mjs', 'gears.svg', 'gear-spec.json']);
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!assets.has(pathname === '/' ? 'index.html' : pathname.slice(1))) { res.writeHead(404); res.end('Not found'); return; }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const content = await fs.readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Gear Works: http://localhost:${port}`));
