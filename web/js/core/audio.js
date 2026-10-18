/**
 * 播放器封装。屏里只调这几个方法，不直接摸 <audio>。
 * 好处：以后换成 WebAudio 做变速/降调，只改这一个文件。
 */
export function createPlayer(el) {
  return {
    el,

    load(url) {
      el.src = url;
    },

    /** 元数据就绪（拿得到 duration） */
    whenReady() {
      if (el.readyState >= 1) return Promise.resolve();
      return new Promise(ok => el.addEventListener('loadedmetadata', ok, { once: true }));
    },

    get dur() {
      return el.duration || 0;
    },

    get t() {
      return el.currentTime;
    },

    get paused() {
      return el.paused;
    },

    seek(t, max = 1e9) {
      try { el.currentTime = Math.max(0, Math.min(max, t)); } catch { /* 元数据没到，忽略 */ }
    },

    play() {
      return el.play();
    },

    pause() {
      el.pause();
    },
  };
}
