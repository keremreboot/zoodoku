// Local static server. ES modules need http rather than file://, which is the
// only reason this exists -- `python -m http.server` does the same job.
//
// It also takes POST /snap?name=x with a data-URL body and writes it to
// tools/snaps/x.png. That is how a canvas render gets out of a headless browser
// for review: the page posts canvas.toDataURL() and the picture lands on disk.
//
//   node tools/serve.mjs [root] [port]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] || path.join(here, '..'));
const PORT = Number(process.argv[3] || 8137);
const SNAPS = path.join(here, 'snaps');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

http
  .createServer((req, res) => {
    if (req.method === 'POST' && req.url.startsWith('/snap')) {
      const name = new URL(req.url, 'http://x').searchParams.get('name') || 'snap';
      const safe = name.replace(/[^\w-]/g, '_') + '.png';
      const chunks = [];
      req.on('data', (d) => chunks.push(d));
      req.on('end', () => {
        const b64 = Buffer.concat(chunks).toString('utf8').replace(/^data:image\/\w+;base64,/, '');
        fs.mkdirSync(SNAPS, { recursive: true });
        fs.writeFileSync(path.join(SNAPS, safe), Buffer.from(b64, 'base64'));
        console.log(`saved tools/snaps/${safe}`);
        res.writeHead(200).end('ok');
      });
      return;
    }

    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('no');
      return;
    }
    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    });
  })
  .listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
