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

    /**
     * 元数据就绪（拿得到 duration）。成功 true，失败 / 超时 false。
     * 导入存档时音频可能被删了：src 指过去 404，loadedmetadata 永远不来，
     * 不设超时这里就会一直挂着，界面卡在「读取中」。
     */
    whenReady(ms = 0) {
      if (el.readyState >= 1) return Promise.resolve(true);
      return new Promise(ok => {
        let done = false;
        const finish = v => {
          if (done) return;
          done = true;
          el.removeEventListener('loadedmetadata', onMeta);
          el.removeEventListener('error', onErr);
          if (timer) clearTimeout(timer);
          ok(v);
        };
        const onMeta = () => finish(true);
        const onErr = () => finish(false);
        const timer = ms > 0 ? setTimeout(() => finish(false), ms) : 0;
        el.addEventListener('loadedmetadata', onMeta);
        el.addEventListener('error', onErr);
      });
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
