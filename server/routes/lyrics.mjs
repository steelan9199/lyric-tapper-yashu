/**
 * 轴的路由：存 / 列 / 取。
 * 轴的格式由前端决定，这里只校验「是不是一份带 lyrics 数组的 JSON」。
 */
import { MAX_JSON_BYTES } from '../config.mjs';
import { readBody, sendJson } from '../lib/http.mjs';
import { safeBase } from '../lib/naming.mjs';
import { listLyrics, loadLyrics, saveLyrics } from '../storage/songs.mjs';

/** POST /api/save  { name, data } */
async function save(req, res) {
  const body = await readBody(req, MAX_JSON_BYTES);
  const { name, data } = JSON.parse(body.toString('utf8') || '{}');
  if (!data || !Array.isArray(data.lyrics)) {
    return sendJson(res, 400, { ok: false, error: 'data.lyrics 缺失' });
  }
  const file = await saveLyrics(name, data);
  return sendJson(res, 200, { ok: true, file });
}

/** GET /api/list */
async function list(req, res) {
  return sendJson(res, 200, { ok: true, items: await listLyrics() });
}

/** GET /api/load?name=xxx */
async function load(req, res, url) {
  const name = safeBase(url.searchParams.get('name'));
  const data = await loadLyrics(name);
  if (!data) return sendJson(res, 404, { ok: false, error: '没有这份轴：' + name });
  return sendJson(res, 200, { ok: true, data });
}

export const routes = [
  { method: 'POST', match: p => p === '/api/save', handler: save },
  { method: 'GET', match: p => p === '/api/list', handler: list },
  { method: 'GET', match: p => p === '/api/load', handler: load },
];
