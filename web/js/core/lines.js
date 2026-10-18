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
    .map(text => ({ text, endT: null, ...tokenize(text) }))
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
 * 一个字最长点亮多久。
 * 有停顿的地方，下一个字的起点会很晚；不设上限的话前一个字会被拉亮整个停顿，
 * MV 里就是「一个字亮两秒」。超过这个值就收住，缝隙留白。
 */
export const MAX_UNIT_DUR = 1.4;

/**
 * 收句：记下这一句真实的结束时间（原始值，输出时统一加偏移）。
 * 句尾没有「下一个字」可推，这是整个轴里唯一需要人肉标一次的地方。
 * 返回 { li, end, dur }；本句一个字都没打返回 null。
 */
export function setLineEnd(state, li, t) {
  const L = state.lines[li];
  if (!L) return null;
  const ts = L.units.filter(u => u.t != null).map(u => u.t);
  if (!ts.length) return null;
  const first = Math.min(...ts);
  const v = +Math.max(first + 0.1, t).toFixed(3);
  L.endT = v;
  return { li, end: v, dur: +(v - first).toFixed(3) };
}

/**
 * 一句里每个单元的「起点 / 显示终点 / 与下一字的间隔」，给捕获面板画条形用。
 * 已加整体偏移；绝对秒数，和输出口径一致。
 */
export function unitSpans(state, li) {
  const L = state.lines[li];
  if (!L) return [];
  const ts = L.units.map(u => stampOf(state, u));
  const off = state.offsetMs / 1000;
  return L.units.map((u, i) => {
    const t = ts[i];
    if (t == null) return { t: null, e: null, dt: null };
    const next = ts.slice(i + 1).find(v => v != null);
    const dt = next == null ? null : +(next - t).toFixed(3);
    let e;
    if (u.e != null) e = Math.min(+(u.e + off).toFixed(3), next != null ? next : Infinity);
    else if (next != null) e = Math.min(next, t + MAX_UNIT_DUR);
    else if (L.endT != null) e = Math.min(+(L.endT + off).toFixed(3), t + MAX_UNIT_DUR * 3);
    else e = t + MAX_UNIT_DUR;
    return { t, e, dt };
  });
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
  unit.e = null;
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
  state.lines[li].units.forEach(u => { u.t = null; u.e = null; });
  state.lines[li].endT = null;
  const prev = firstIdx > 0 ? state.seq[firstIdx - 1] : null;
  const prevUnit = prev ? unitOf(state, prev) : null;
  return {
    firstIdx,
    resumeAt: Math.max(0, (prevUnit && prevUnit.t != null ? prevUnit.t : 0) - 0.2),
  };
}

/** 一行里某个字的时间是否已确定（渲染用） */
export const isMarked = unit => unit && unit.t != null;

/* ══════════ 时间轴拖拽：一个字 = 一个 [t, e] 区间 ══════════ */

/** 一个字最短多长（约 2.4 帧）。再短就没法看、也没法唱。 */
export const MIN_UNIT = 0.08;

/** 没打点的句子里，每个字先按这个宽度均分（秒） */
export const EVEN_STEP = 0.33;

/**
 * 本句的「草案布局」：已落定的字用真实值，没落定的字在前后锚点之间等分。
 * 时间轴视图用它画初始状态 —— 一进来所有字就是平分的，只是没落定的画虚线。
 * 纯读，不改 state。
 */
export function previewSpans(state, li) {
  const L = state.lines[li];
  if (!L) return [];
  const n = L.units.length;
  const sp = new Array(n).fill(null);

  L.units.forEach((u, i) => {
    if (u.t != null) sp[i] = { t: u.t, e: u.e != null ? u.e : null, real: true };
  });

  // 先给「有 t 没 e」的补一个临时终点，好让后面的等分有参照
  for (let k = 0; k < n; k++) {
    if (sp[k] && sp[k].e == null) sp[k].e = sp[k].t + EVEN_STEP;
  }

  // 空档：在前后锚点之间等分；尾部没有锚点就按 0.33s 顺排
  let i = 0;
  while (i < n) {
    if (sp[i]) { i++; continue; }
    let j = i;
    while (j < n && !sp[j]) j++;
    const from = i > 0 ? sp[i - 1].e + 0.04 : 0;
    const tail = from + (j - i) * EVEN_STEP;
    const to = j < n ? Math.max(from + (j - i) * MIN_UNIT, sp[j].t - 0.04) : tail;
    const slot = (to - from) / (j - i);
    for (let k = i; k < j; k++) sp[k] = { t: from + (k - i) * slot, e: from + (k - i + 1) * slot, real: false };
    i = j;
  }

  // 终点不许越过后一个字；长度不够就压到 MIN_UNIT
  for (let k = 0; k < n; k++) {
    if (k + 1 < n) sp[k].e = Math.min(sp[k].e, sp[k + 1].t);
    sp[k].e = Math.max(sp[k].e, sp[k].t + MIN_UNIT);
  }
  return sp.map(s => ({ t: +s.t.toFixed(3), e: +s.e.toFixed(3), real: !!s.real }));
}

/** 把草案布局落成真实值（已落定的不动）。第一次拖动前调用。 */
export function fillLineEven(state, li) {
  const sp = previewSpans(state, li);
  state.lines[li].units.forEach((u, i) => {
    if (u.t == null) u.t = sp[i].t;
    if (u.e == null) u.e = sp[i].e;
  });
  syncPos(state);
  return sp;
}

/** 拖左边缘 = 改起点。不能越过上一个字的终点，也不能吃掉自己的最小长度 */
export function setUnitStart(state, li, ui, t) {
  const L = state.lines[li];
  const u = L && L.units[ui];
  if (!u) return null;
  const sp = previewSpans(state, li);
  const prevE = ui > 0 ? sp[ui - 1].e : 0;
  const v = Math.max(prevE, Math.min(t, sp[ui].e - MIN_UNIT));
  u.t = +v.toFixed(3);
  if (u.e == null) u.e = sp[ui].e;
  return { t: u.t, e: u.e };
}

/** 拖右边缘 = 改终点。不能越过下一个字的起点（你画的那条规矩） */
export function setUnitEnd(state, li, ui, t) {
  const L = state.lines[li];
  const u = L && L.units[ui];
  if (!u) return null;
  const sp = previewSpans(state, li);
  const nextT = ui + 1 < sp.length ? sp[ui + 1].t : (state.dur || Infinity);
  const v = Math.min(nextT, Math.max(t, sp[ui].t + MIN_UNIT));
  u.e = +v.toFixed(3);
  if (u.t == null) u.t = sp[ui].t;
  syncPos(state);
  return { t: u.t, e: u.e };
}

/** 把 pos 推到第一个还没落定的字（拖完时间轴后跟唱打点要接得上） */
export function syncPos(state) {
  while (state.pos < state.seq.length && unitOf(state, state.seq[state.pos]).t != null) state.pos++;
  return state.pos;
}
