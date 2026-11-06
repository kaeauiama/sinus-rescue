// 検証ページ用の静的サーバー。外部からはトンネル経由でのみ届くよう、ローカルにだけ待ち受ける。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const PORT = Number(process.env.PORT ?? 5173);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const target = normalize(join(PUBLIC_DIR, relative));
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(target);
    response.writeHead(200, {
      'Content-Type': MIME[extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`m0-audio: http://localhost:${PORT}`);
});
