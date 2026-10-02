// Dependency-free local preview; GitHub Pages continues to serve static files.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const root = process.cwd();
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.md':'text/plain; charset=utf-8'};
http.createServer((req, res) => {
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405); res.end(); return;}
  let relative;
  try {relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';}
  catch {res.writeHead(400); res.end(); return;}
  const file = path.resolve(root,relative);
  if (!file.startsWith(root + path.sep) || relative.split('/').some(p => p.startsWith('.') && p !== '.qa') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control','no-store');
  if (req.method === 'HEAD') {res.end();return;}
  fs.createReadStream(file).pipe(res);
}).listen(Number(value('--port','4173')),value('--host','127.0.0.1'),() => console.log('Static GC preview ready'));
