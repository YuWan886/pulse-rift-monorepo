const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'F:/ai-test';
const OUT = path.join(__dirname, '..', 'capture');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp4': 'video/mp4'
};

function start(port = 8125) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url.startsWith('/upload')) {
        const name = new URL(req.url, 'http://x').searchParams.get('name') || 'capture.webm';
        const file = path.join(OUT, path.basename(name));
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
          fs.writeFileSync(file, Buffer.concat(chunks));
          res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
          res.end('ok');
          console.log('saved', file, Buffer.concat(chunks).length);
        });
        return;
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        });
        res.end();
        return;
      }
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/pulse-rift/index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(path.resolve(ROOT))) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(port, () => resolve(server));
  });
}

module.exports = { start };
