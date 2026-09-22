// Local static server. ES modules need http rather than file://, which is the
// only reason this exists -- `python -m http.server` does the same job.
//
// Two things can be written through it, both for local development only:
//
//   POST /levels      the level editor saves the levels here -- levels/NN.json
//                     and levels/index.json -- when you
//                     lock a level in, reorder or delete one
//   POST /snap?name=x a data-URL body is written to tools/snaps/x.png -- how a
//                     canvas render gets out of a headless browser for review
//
// Because it writes files, it listens on this machine only (127.0.0.1), never
// on the network.
//
//   node tools/serve.mjs [root] [port]     (port also from $PORT; default 8137)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMAT } from '../src/levels.js';
import { writeBook } from './book.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] || path.join(here, '..'));
const PORT = Number(process.argv[3] || process.env.PORT || 8137);
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
    if (req.method === 'POST' && req.url === '/levels') {
      const chunks = [];
      req.on('data', (d) => chunks.push(d));
      req.on('end', () => {
        let book;
        try {
          book = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (book.format !== FORMAT || !Array.isArray(book.levels)) throw new Error('not a level book');
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'text/plain' }).end(e.message);
          return;
        }
        writeBook(book, ROOT);
        console.log(`saved ${book.levels.length} levels to levels/ (one file each, and index.json)`);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ saved: book.levels.length }));
      });
      return;
    }

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
  .listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
