/**
 * songs/ 目录的唯一入口。别处不许直接拼 songs/ 下的路径。
 * 音频与轴放同一层：xx.mp3 + xx.json，MV 技能直接按名字取。
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { SONGS_DIR, AUDIO_EXT } from '../config.mjs';
import { safeBase, safeAudioExt } from '../lib/naming.mjs';

async function ensureDir() {
  await fsp.mkdir(SONGS_DIR, { recursive: true });
}

export function audioPath(fileName) {
  return path.join(SONGS_DIR, safeBase(fileName) + safeAudioExt(fileName));
}

export function lyricsPath(name) {
  return path.join(SONGS_DIR, safeBase(name) + '.json');
}

export async function saveLyrics(name, data) {
  await ensureDir();
  const dest = lyricsPath(name);
  await fsp.writeFile(dest, JSON.stringify(data, null, 2), 'utf8');
  return path.basename(dest);
}

/** 列表里顺手带上「这份轴有多少内容」，导入卡片要显示，省得用户点开才知道 */
async function peek(full) {
  try {
    const d = JSON.parse(await fsp.readFile(full, 'utf8'));
    const lyrics = Array.isArray(d.lyrics) ? d.lyrics : [];
    let words = 0;
    for (const L of lyrics) {
      if (Array.isArray(L.words)) words += L.words.filter(w => w && w.t != null).length;
    }
    return { lines: lyrics.length, words, duration: +d.duration || 0 };
  } catch {
    return { lines: 0, words: 0, duration: 0 };
  }
}

export async function listLyrics() {
  await ensureDir();
  const names = await fsp.readdir(SONGS_DIR);

  // 同名音频（xx.mp3）算这份轴的伴奏，导入时要一起带回来
  const audioOf = new Map();
  for (const n of names) {
    if (!AUDIO_EXT.includes(path.extname(n).toLowerCase())) continue;
    audioOf.set(safeBase(n), n);
  }

  const items = [];
  for (const n of names) {
    if (!/\.json$/i.test(n)) continue;
    const full = path.join(SONGS_DIR, n);
    const st = await fsp.stat(full);
    const name = n.replace(/\.json$/i, '');
    items.push({
      name,
      size: st.size,
      mtime: st.mtimeMs,
      audio: audioOf.get(name) || '',
      ...(await peek(full)),
    });
  }
  return items.sort((a, b) => b.mtime - a.mtime);
}

/** 找不到返回 null，不抛错——「没存过」是正常状态 */
export async function loadLyrics(name) {
  try {
    return JSON.parse(await fsp.readFile(lyricsPath(name), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 存档里记的音频名 → 磁盘上真实的文件名（找不到返回空串）。
 * 为什么要这一步：存档里可能记着 `xx.MP3`，而落盘时后缀被归一成 `.mp3`（见 safeAudioExt）。
 * Windows 对大小写不敏感，`stat` 能蒙对，但回报的仍是请求时那个名字；
 * 换到大小写敏感的盘（或用户手动改过后缀）就真的找不到。所以这里以目录列表为准。
 */
export async function resolveAudioName(fileName) {
  const base = path.basename(String(fileName || ''));
  if (!base) return '';
  try {
    const names = await fsp.readdir(SONGS_DIR);
    if (names.includes(base)) return base;
    const want = base.toLowerCase();
    return names.find(n => n.toLowerCase() === want) || '';
  } catch { /* 目录还没建：当没找到 */ }
  return '';
}

/** 找 `songs/` 里的音频。名字先对齐磁盘上的真名，再取 stat */
export async function statAudio(fileName) {
  const name = await resolveAudioName(fileName);
  if (!name) return null;
  const file = path.join(SONGS_DIR, name);
  try {
    return { file, st: await fsp.stat(file) };
  } catch {
    return null;
  }
}

export { SONGS_DIR, ensureDir };
