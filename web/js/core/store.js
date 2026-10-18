/**
 * 浏览器端的记忆。只记「下次还要用」的东西，别的一概不存。
 *
 * 现在只记歌词：打轴用的歌词每次都要现找现贴，太烦。
 * localStorage 按 origin 隔离（含端口），所以服务换了端口就记不到 ——
 * 这是浏览器规则，不是 bug；端口稳定在 8787 就没事。
 *
 * 全部 try/catch：无痕模式、被封的存储都不该让页面挂掉。
 */
const LYRICS_KEY = 'lyric-tapper.lyrics';

export function loadLyrics() {
  try { return localStorage.getItem(LYRICS_KEY) || ''; } catch { return ''; }
}

export function saveLyrics(text) {
  try {
    if (text && text.trim()) localStorage.setItem(LYRICS_KEY, text);
    else localStorage.removeItem(LYRICS_KEY);
  } catch { /* 存不了就算了，不影响打轴 */ }
}

export function hasSavedLyrics() {
  return !!loadLyrics();
}
