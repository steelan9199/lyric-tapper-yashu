/**
 * 核心逻辑单测。跑：node --test scripts/
 *
 * 只测「纯函数层」——text / lines / songJson。这三块不碰 DOM、不碰音频，
 * 但整个页面的时间算法都在这里，改一行就可能让输出格式错位。
 * 视图和屏不测（改版式本来就要用眼睛看）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { tokenize, splitLyrics } from '../web/js/core/text.js';
import {
  buildLines, rebuildSeq, tapCurrent, undoStep, skipRestOfLine,
  clearLine, lineSpan, stampOf, currentRef,
} from '../web/js/core/lines.js';
import { buildSongJson } from '../web/js/export/songJson.js';

/* ── 造一个最小 state ── */
function makeState(raw, dur = 30) {
  const state = {
    lines: buildLines(raw), seq: [], pos: 0, offsetMs: 0, dur,
  };
  rebuildSeq(state);
  return state;
}
const tapAll = (state, times) => times.forEach(t => tapCurrent(state, t));

/* ══════════ text：切单元 ══════════ */
test('中文一字一单元，标点不单独成单元', () => {
  const { chars, units, charUnit } = tokenize('灯一盏，把夜');
  assert.equal(chars.length, 6);
  assert.deepEqual(units.map(u => u.text), ['灯', '一', '盏', '把', '夜']);
  // 「，」挂到前一个字「盏」上
  assert.equal(charUnit[3], 2);
  assert.equal(charUnit[2], 2);
});

test('英文/数字连成一个单元，不按字母拆', () => {
  const { units, charUnit } = tokenize('tonight 我');
  assert.deepEqual(units.map(u => u.text), ['tonight', '我']);
  assert.deepEqual(units[0].chars, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(charUnit[5], 0);
  assert.equal(charUnit[8], 1);
});

test('行首标点挂到后一个单元，不会丢', () => {
  const { charUnit } = tokenize('「灯」');
  assert.equal(charUnit[0], 0);   // 「 → 灯
  assert.equal(charUnit[2], 0);   // 」 → 灯
});

test('空行被丢掉', () => {
  assert.deepEqual(splitLyrics('a\n\n  \nb\n'), ['a', 'b']);
});

/* ══════════ lines：打点与回退 ══════════ */
test('seq 是跨句压平的链', () => {
  const s = makeState('灯一盏\n把夜');
  assert.equal(s.seq.length, 5);
  assert.deepEqual(s.seq[3], { li: 1, ui: 0 });
});

test('打点写入 t 并前进；重复打到同一个字不覆盖原值', () => {
  const s = makeState('灯一盏');
  tapCurrent(s, 1.23456);
  assert.equal(s.pos, 1);
  assert.equal(s.lines[0].units[0].t, 1.235);
});

test('退一个点：清掉自己，回放位置落在上一个字之前', () => {
  const s = makeState('灯一盏');
  tapAll(s, [1.0, 1.4, 1.8]);
  const r = undoStep(s);
  assert.equal(s.pos, 2);
  assert.equal(s.lines[0].units[2].t, null);
  assert.equal(r.resumeAt, 1.25);     // 1.4 - 0.15
});

test('退到句首能跨回上一句（靠扁平 seq 天然实现）', () => {
  const s = makeState('灯\n一');
  tapAll(s, [1.0, 2.0]);
  undoStep(s);                        // 退掉第 2 句
  assert.equal(s.pos, 1);
  undoStep(s);                        // 退掉第 1 句
  assert.equal(s.pos, 0);
  assert.equal(s.lines[0].units[0].t, null);
});

test('最前面再退返回 null，不越界', () => {
  const s = makeState('灯');
  assert.equal(undoStep(s), null);
});

test('跳过本句剩余字：按间隔补值后 pos 落到下一句', () => {
  const s = makeState('灯一盏\n把夜');
  tapCurrent(s, 1.0);
  const n = skipRestOfLine(s, 1.0, 0.3);
  assert.equal(n, 2);
  assert.deepEqual(s.lines[0].units.map(u => u.t), [1, 1, 1.3]);
  assert.deepEqual(currentRef(s), { li: 1, ui: 0 });
});

test('重打一句：清空该句并把 pos 挪回句首', () => {
  const s = makeState('灯一盏\n把夜');
  tapAll(s, [1, 1.4, 1.8, 3, 3.4]);
  const r = clearLine(s, 1);
  assert.equal(r.firstIdx, 3);
  assert.equal(s.lines[1].units[0].t, null);
  assert.equal(s.lines[0].units[0].t, 1);      // 上一句不受影响
  assert.equal(r.resumeAt, 1.6);               // 1.8 - 0.2，留一点前一句的余音
});

test('lineSpan 带上整体偏移', () => {
  const s = makeState('灯一盏');
  tapAll(s, [1.0, 1.5, 2.0]);
  s.offsetMs = 120;
  const sp = lineSpan(s, 0);
  assert.deepEqual(sp, { s: 1.12, e: 2.12 });
  assert.equal(stampOf(s, s.lines[0].units[0]), 1.12);
});

/* ══════════ songJson：输出格式 ══════════ */
test('words 与 text 字符数一致，空格为 null', () => {
  const s = makeState('灯 一盏');
  tapAll(s, [1.0, 1.5, 1.9]);
  const j = buildSongJson(s);
  const L = j.lyrics[0];
  assert.equal(L.words.length, [...L.text].length);
  assert.equal(L.words[1], null);              // 空格
  assert.equal(L.words[0].t, 1);
});

test('英文词内部字母按比例摊开', () => {
  const s = makeState('go on');
  tapAll(s, [1.0, 2.0]);
  const L = buildSongJson(s).lyrics[0];
  assert.equal(L.words[0].w, 'g');
  assert.equal(L.words[1].w, 'o');
  assert.ok(L.words[1].t > L.words[0].t);
  assert.ok(L.words[1].t < 2.0);
});

test('end 不越过下一句起点，且至少 0.4 秒', () => {
  const s = makeState('灯一盏\n把夜点成河');
  tapAll(s, [1.0, 1.2, 1.4, 1.5, 3.0, 3.4, 3.8]);
  const [a, b] = buildSongJson(s).lyrics;
  assert.ok(a.end <= b.start, `第一句 end ${a.end} 越过了 ${b.start}`);
  assert.ok(a.end - a.start >= 0.39);
});

test('一个字都没打的句子不进输出', () => {
  const s = makeState('灯一盏\n把夜');
  tapAll(s, [1, 1.4, 1.8]);
  assert.equal(buildSongJson(s).lyrics.length, 1);
});

test('时间戳单调不倒退', () => {
  const s = makeState('灯一盏把夜点成河');
  const ts = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
  tapAll(s, ts);
  const words = buildSongJson(s).lyrics[0].words.filter(Boolean);
  for (let i = 1; i < words.length; i++) assert.ok(words[i].t >= words[i - 1].t);
});

test('offsetMs 原样进 JSON，且已算进每个 t', () => {
  const s = makeState('灯');
  tapAll(s, [1.0]);
  s.offsetMs = -100;
  const j = buildSongJson(s);
  assert.equal(j.offsetMs, -100);
  assert.equal(j.lyrics[0].start, 0.9);
});
