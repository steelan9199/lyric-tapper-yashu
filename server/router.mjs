/**
 * 路由表。加一个接口 = 加一条 route，不用改这里的分发逻辑。
 */
import { HOST } from './config.mjs';
import { sendJson } from './lib/http.mjs';
import { serveStatic } from './routes/static.mjs';
import { routes as audioRoutes } from './routes/audio.mjs';
import { routes as lyricRoutes } from './routes/lyrics.mjs';

const ROUTES = [...audioRoutes, ...lyricRoutes];

export async function handle(req, res) {
  const url = new URL(req.url, `http://${HOST}`);
  const p = url.pathname;

  try {
    for (const r of ROUTES) {
      if (r.method === req.method && r.match(p)) return await r.handler(req, res, url);
    }
    if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res, p);
    return sendJson(res, 405, { ok: false, error: '不支持的方法 ' + req.method });
  } catch (e) {
    // 连不上 body、JSON 写坏、磁盘满，都从这里出去；浏览器拿到的是可读错误
    return sendJson(res, 500, { ok: false, error: e.message });
  }
}
