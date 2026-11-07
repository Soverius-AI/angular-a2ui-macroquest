import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

// Static files only. A compile-time fixture replaces the GPU worker for tests.
const root = resolve('dist/angular-a2ui-macroquest/browser');
const prefix = '/demo/'; // Exercise deployment below a subpath, not only '/'.
createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (!path.startsWith(prefix)) {
    response.writeHead(404).end();
    return;
  }
  let file = resolve(root, decodeURIComponent(path.slice(prefix.length)) || 'index.html');
  if (!file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end();
    return;
  }
  if (path === `${prefix}byok/agent-worker.js`)
    file = resolve('tmp/byok-test/byok/agent-worker.js');
  try {
    let content = await readFile(file);
    if (path === prefix || path.endsWith('/index.html'))
      content = Buffer.from(
        content.toString().replace('<base href="/">', `<base href="${prefix}">`),
      );
    const mime =
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.wasm': 'application/wasm',
        '.jpg': 'image/jpeg',
        '.ico': 'image/x-icon',
      }[extname(file)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' }).end(content);
  } catch {
    response.writeHead(404).end();
  }
}).listen(4305, '127.0.0.1', () => console.log('Static fixture site: http://127.0.0.1:4305/demo/'));
