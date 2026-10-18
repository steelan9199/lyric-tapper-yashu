/**
 * 音频路由：收上传、发回放。
 * 只关心字节的进出，不关心轴。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { MAX_AUDIO_BYTES } from '../config.mjs';
import { sendJson } from '../lib/http.mjs';
import { mimeOf, safeAudioExt, safeBase } from '../lib/naming.mjs';
import { audioPath, ensureDir, statAudio } from '../storage/songs.mjs';

/** POST /api/audio?name=xxx.mp3 —— 边收边写盘，不进内存 */
async function upload(req, res, url) {
  const rawName = url.searchParams.get('name') || 'audio.mp3';
  const dest = audioPath(path.basename(rawName) || safeBase(rawName) + safeAudioExt(rawName));
  await ensureDir();

  const out = fs.createWriteStream(dest);
  let n = 0;
  try {
    await new Promise((ok, bad) => {
      req.on('data', c => {
        n += c.length;
        if (n > MAX_AUDIO_BYTES) {
          req.destroy();
          bad(new Error(`音频超过 ${(MAX_AUDIO_BYTES / 1048576).toFixed(0)} MB`));
        }
      });
      req.pipe(out);
      out.on('finish', ok);
      out.on('error', bad);
      req.on('error', bad);
    });
  } catch (e) {
    out.destroy();
    await fsp.rm(dest, { force: true });
    throw e;
  }
  return sendJson(res, 200, { ok: true, file: path.basename(dest), bytes: n });
}

/**
 * `/songs/%E5%8F%AB...mp3` → `叫我老王八.mp3`
 * URL.pathname 保留百分号编码，不解码的话中文名一律 404（ASCII 名字才碰巧能过）。
 * 解码后再取 basename，顺手挡掉 ../。
 */
function fileOf(pathname) {
  let p = pathname;
  try { p = decodeURIComponent(p); } catch { /* 已经是裸字符，保持原样 */ }
  return path.basename(p);
}

/** GET /songs/xxx.mp3 —— 必须支持 Range，否则浏览器拖动进度条失效 */
async function stream(req, res, pathname) {
  const hit = await statAudio(fileOf(pathname));
  if (!hit) return sendJson(res, 404, { ok: false, error: '没有这个音频' });

  const { file, st } = hit;
  const type = mimeOf(file);
  const range = req.headers.range;

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? Number(m[1]) : 0;
    const end = m && m[2] ? Number(m[2]) : st.size - 1;
    res.writeHead(206, {
      'content-type': type,
      'accept-ranges': 'bytes',
      'content-range': `bytes ${start}-${end}/${st.size}`,
      'content-length': end - start + 1,
    });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }

  res.writeHead(200, {
    'content-type': type,
    'accept-ranges': 'bytes',
    'content-length': st.size,
  });
  return fs.createReadStream(file).pipe(res);
}

export const routes = [
  { method: 'POST', match: p => p === '/api/audio', handler: upload },
  { method: 'GET', match: p => p.startsWith('/songs/'), handler: stream },
];
