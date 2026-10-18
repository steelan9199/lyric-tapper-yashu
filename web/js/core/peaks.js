/**
 * 波形峰值。只是为了「看得见歌」——对齐靠耳朵，不靠眼睛。
 * 失败不影响打轴，所以内部吞错返回 null。
 */
export function computePeaks(file, buckets = 2000) {
  return new Promise(resolve => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return resolve(null);

    const ac = new AC();
    file.arrayBuffer()
      .then(buf => ac.decodeAudioData(buf))
      .then(ab => {
        const ch = ab.getChannelData(0);
        const step = Math.max(1, Math.floor(ch.length / buckets));
        const out = new Float32Array(buckets);
        for (let i = 0; i < buckets; i++) {
          let mx = 0;
          const s0 = i * step;
          const s1 = Math.min(ch.length, s0 + step);
          for (let j = s0; j < s1; j += 2) {
            const v = Math.abs(ch[j]);
            if (v > mx) mx = v;
          }
          out[i] = mx;
        }
        resolve(out);
      })
      .catch(e => {
        console.warn('波形失败（不影响打轴）：' + e.message);
        resolve(null);
      })
      .finally(() => ac.close());
  });
}
