/**
 * 与本地服务的唯一通道。所有 fetch 都在这里，屏里不写 URL。
 * 换成别的后端（比如以后要传云端）只改这一个文件。
 */
async function asJson(res) {
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error('服务返回的不是 JSON：' + txt.slice(0, 60));
  }
}

export function createApi() {
  return {
    async uploadAudio(file) {
      const res = await fetch('/api/audio?name=' + encodeURIComponent(file.name), {
        method: 'POST',
        body: file,
      });
      return asJson(res);
    },

    async save(name, data) {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, data }),
      });
      return asJson(res);
    },

    async list() {
      return asJson(await fetch('/api/list'));
    },

    async load(name) {
      return asJson(await fetch('/api/load?name=' + encodeURIComponent(name)));
    },

    audioURL(fileName) {
      return '/songs/' + encodeURIComponent(fileName);
    },
  };
}
