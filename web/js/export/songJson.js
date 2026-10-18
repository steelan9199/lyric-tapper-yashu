/**
 * 打轴页 → song.json
 *
 * 输出直接喂给 MV 技能的 STORY.lyrics：
 *   { text, start, end, words:[{w,t}|null] }
 * words 与 text 的字符一一对应（空格为 null），t 是「这个字开始唱的秒数」，
 * 相对本段音频起点。引擎有 words 就按真实逐字点亮，没有就退回线性均分。
 *
 * 纯函数：只读 state，不碰 DOM/音频，可在 node 里直接测。
 */
import { stampOf } from '../core/lines.js';
import { isSpace } from '../core/text.js';

const r3 = n => +n.toFixed(3);
const DEFAULT_GAP = 0.35;

/** 一句里相邻字的平均间隔，用来估这句的收尾长度 */
function avgGap(times) {
  if (times.length < 2) return DEFAULT_GAP;
  let sum = 0;
  for (let i = 1; i < times.length; i++) sum += times[i] - times[i - 1];
  return sum / (times.length - 1);
}

export function buildSongJson(state, meta = {}) {
  const lyrics = [];

  state.lines.forEach((L, li) => {
    const unitTimes = L.units.map(u => (u.t == null ? null : stampOf(state, u)));
    const times = unitTimes.filter(t => t != null);
    if (!times.length) return;

    const start = times[0];
    const lastT = times[times.length - 1];
    const gap = avgGap(times);

    // 收尾：留够最后一个字的余韵，但别越过下一句
    let end = Math.min(lastT + Math.max(0.55, gap * 1.7), lastT + 2.4);
    const next = state.lines[li + 1];
    if (next) {
      const nextTimes = next.units.map(u => (u.t == null ? null : stampOf(state, u))).filter(t => t != null);
      if (nextTimes.length && nextTimes[0] > start) end = Math.min(end, nextTimes[0] - 0.06);
    }
    end = Math.max(start + 0.4, Math.min(state.dur || end, end));

    const words = L.chars.map((c, ci) => {
      const ui = L.charUnit[ci];
      if (isSpace(c) || ui < 0) return null;
      const t = unitTimes[ui];
      if (t == null) return null;

      const unit = L.units[ui];
      if (unit.chars.length === 1) return { w: c, t: r3(t) };

      // 英文词/数字串：把它的持续时间摊到每个字母上
      const nextT = unitTimes.slice(ui + 1).find(v => v != null);
      const span = Math.max(0.1, (nextT == null ? t + 0.35 : nextT) - t);
      const off = ((ci - unit.chars[0]) / unit.chars.length) * span;
      return { w: c, t: r3(t + off) };
    });

    lyrics.push({ text: L.text, start: r3(start), end: r3(end), words });
  });

  return {
    _note: '由 lyric-tapper-yashu 生成。words 与 text 字符一一对应（空格为 null），t 为逐字起唱秒数，相对本段音频起点。',
    generator: 'lyric-tapper-yashu',
    createdAt: new Date().toISOString(),
    audio: meta.audio || '',
    duration: r3(state.dur || 0),
    offsetMs: state.offsetMs,
    lyrics,
  };
}
