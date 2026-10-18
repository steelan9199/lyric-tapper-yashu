/**
 * 交付动作：存到 songs/、复制、下载。
 * 三个动作共用同一份 buildSongJson，保证「存下来的」和「复制的」永远一致。
 */
import { buildSongJson } from './songJson.js';

const payload = state => buildSongJson(state, { audio: state.fileName });

/** 存到本地服务的 songs/ 目录（MV 技能直接读） */
export async function saveToServer(api, state) {
  const data = payload(state);
  if (!data.lyrics.length) return { ok: false, error: '一个字的轴都没有，保存没意义' };
  try {
    return await api.save(state.songName, data);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** 复制 lyrics 数组（贴进 story.json 用） */
export async function copyLyrics(state) {
  const data = payload(state);
  if (!data.lyrics.length) throw new Error('一个字的轴都没有');
  await navigator.clipboard.writeText(JSON.stringify(data.lyrics, null, 2));
  return data.lyrics.length;
}

export function downloadJson(state) {
  const data = payload(state);
  if (!data.lyrics.length) throw new Error('一个字的轴都没有');

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.songName || 'lyrics') + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return data.lyrics.length;
}
