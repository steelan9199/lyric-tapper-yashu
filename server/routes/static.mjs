/**
 * 静态文件。改前端之后刷新即生效，所以一律 no-store。
 */
import fsp from 'node:fs/promises';
import { WEB_DIR } from '../config.mjs';
import { sendJson, sendText } from '../lib/http.mjs';
import { mimeOf, resolveInside } from '../lib/naming.mjs';

export async function serveStatic(req, res, pathname) {
  const file = resolveInside(WEB_DIR, pathname);
  if (!file) return sendJson(res, 403, { ok: false, error: '越界路径' });

  try {
    const buf = await fsp.readFile(file);
    res.writeHead(200, {
      'content-type': mimeOf(file),
      'cache-control': 'no-store',
      'content-length': buf.length,
    });
    res.end(buf);
  } catch {
    return sendText(res, 404, '404 ' + pathname);
  }
}
