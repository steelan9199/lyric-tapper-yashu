/**
 * 轴的领域层：所有「打了几个字 / 退一个 / 一句的起止」都在这儿。
 * 不碰 DOM、不碰音频，所以能单测，也能被两个屏共用。
 *
 * 数据形状：
 *   state.lines[i] = { text, chars, units:[{text,t,chars}], charUnit }
 *   state.seq      = [{li,ui}, ...]  全部单元压平成一条链
 *   state.pos      = 下一个待打的单元下标（跨句回退靠它自然实现）
 *   unit.t         = 原始打点秒数，输出时统一加上 state.offsetMs
 */
import { tokenize, splitLyrics } from './text.js';

export function buildLines(raw) {
  return splitLyrics(raw)
    .map(text => ({ text, ...tokenize(text) }))
    .filter(L => L.units.length > 0);
}

export function rebuildSeq(state) {
  state.seq = [];
  state.lines.forEach((L, li) => L.units.forEach((_, ui) => state.seq.push({ li, ui })));
  state.pos = Math.min(state.pos, state.seq.length);
  return state.seq;
}

export const currentRef = state => state.seq[state.pos] || null;

export const unitOf = (state, ref) => (ref ? state.lines[ref.li].units[ref.ui] : null);

/** 单元的真实时间（已加整体偏移） */
export const stampOf = (state, unit) =>
  unit && unit.t != null ? +(unit.t + state.offsetMs / 1000).toFixed(3) : null;

/** 一句的起止，含偏移；一个字都没打返回 null */
export function lineSpan(state, li) {
  const L = state.lines[li];
  if (!L) return null;
  const ts = L.units.filter(u => u.t != null).map(u => stampOf(state, u));
  return ts.length ? { s: ts[0], e: ts[ts.length - 1] } : null;
}

export function doneCount(state) {
  return state.seq.filter(r => state.lines[r.li].units[r.ui].t != null).length;
}

/** 打一个点。返回 { ref, unit, finished } */
export function tapCurrent(state, t) {
  const ref = currentRef(state);
  if (!ref) return { ref: null, unit: null, finished: true };
  const unit = unitOf(state, ref);
  if (unit.t == null) unit.t = +t.toFixed(3);
  state.pos++;
  return { ref, unit, finished: state.pos >= state.seq.length };
}

/**
 * 退一个点，并把播放位置退到上一个字之前（好让人重新唱这一下）。
 * 返回 { unit, resumeAt }；已经在最前面返回 null。
 */
export function undoStep(state) {
  if (state.pos <= 0) return null;
  state.pos--;
  const unit = unitOf(state, currentRef(state));
  unit.t = null;
  const prev = state.pos > 0 ? state.seq[state.pos - 1] : null;
  const prevUnit = prev ? unitOf(state, prev) : null;
  return { unit, resumeAt: Math.max(0, (prevUnit && prevUnit.t != null ? prevUnit.t : 0) - 0.15) };
}

/** 跳过本句剩下的字，按固定间隔估一个值（回头要重打） */
export function skipRestOfLine(state, t, step = 0.32) {
  const ref = currentRef(state);
  if (!ref) return 0;
  const L = state.lines[ref.li];
  const left = L.units.filter(u => u.t == null);
  left.forEach((u, i) => { u.t = +(t + i * step).toFixed(3); });
  while (state.pos < state.seq.length && state.seq[state.pos].li === ref.li) state.pos++;
  return left.length;
}

export const firstIndexOfLine = (state, li) => state.seq.findIndex(r => r.li === li);

/** 清掉一整句的轴，把 pos 挪回这句开头。返回 { firstIdx, resumeAt } */
export function clearLine(state, li) {
  const firstIdx = firstIndexOfLine(state, li);
  if (firstIdx < 0) return null;
  state.lines[li].units.forEach(u => { u.t = null; });
  const prev = firstIdx > 0 ? state.seq[firstIdx - 1] : null;
  const prevUnit = prev ? unitOf(state, prev) : null;
  return {
    firstIdx,
    resumeAt: Math.max(0, (prevUnit && prevUnit.t != null ? prevUnit.t : 0) - 0.2),
  };
}

/** 一行里某个字的时间是否已确定（渲染用） */
export const isMarked = unit => unit && unit.t != null;
