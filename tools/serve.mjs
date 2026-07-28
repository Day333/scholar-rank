// 起一个最小静态服务器，用于打开 test/fixture.html 预览注入效果。
// 用法: node tools/serve.mjs [端口]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] ?? 8123);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const SHIM = '<script src="/test/chrome-shim.js"></script>';

createServer(async (req, res) => {
  const [path, query = ''] = req.url.split('?');
  const url = decodeURIComponent(path);
  const rel = normalize(url === '/' ? '/test/fixture.html' : url).replace(/^([/\\])+/, '');
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  try {
    let body = await readFile(file);
    // ?shim=1：在 <head> 之后注入 chrome.* 垫片，用来在浏览器里直接预览设置页 / 弹窗。
    if (extname(file) === '.html' && /(^|&)shim=1(&|$)/.test(query)) {
      body = Buffer.from(body.toString('utf8').replace(/<head>/i, '<head>' + SHIM), 'utf8');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 ' + rel);
  }
}).listen(PORT, () => {
  console.log(`论文列表预览: http://localhost:${PORT}/test/fixture.html`);
  console.log(`设置页预览:   http://localhost:${PORT}/src/options/options.html?shim=1`);
  console.log(`弹窗预览:     http://localhost:${PORT}/src/popup/popup.html?shim=1`);
});
