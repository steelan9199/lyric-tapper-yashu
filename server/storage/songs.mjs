/**
 * songs/ 目录的唯一入口。别处不许直接拼 songs/ 下的路径。
 * 音频与轴放同一层：xx.mp3 + xx.json，MV 技能直接按名字取。
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { SONGS_DIR } from '../config.mjs';
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

export async function listLyrics() {
  await ensureDir();
  const names = await fsp.readdir(SONGS_DIR);
  const items = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    const st = await fsp.stat(path.join(SONGS_DIR, n));
    items.push({ name: n.slice(0, -5), size: st.size, mtime: st.mtimeMs });
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

export async function statAudio(fileName) {
  try {
    const file = path.join(SONGS_DIR, path.basename(fileName));
    return { file, st: await fsp.stat(file) };
  } catch {
    return null;
  }
}

export { SONGS_DIR, ensureDir };
