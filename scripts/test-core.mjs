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
  clearLine, lineSpan, stampOf, currentRef, setLineEnd, unitSpans, MAX_UNIT_DUR,
  pendingCloseLine, endLineTarget, lineAtTime,
  previewSpans, fillLineEven, setUnitStart, setUnitEnd, MIN_UNIT, applySavedTaps,
} from '../web/js/core/lines.js';
import { buildSongJson } from '../web/js/export/songJson.js';
import { FPS, FRAME, frames } from '../web/js/core/time.js';

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

/* ══════════ 收句：句尾真实终点 ══════════ */
test('收句记录的真实终点优先于公式估的 end', () => {
  const s = makeState('灯一盏');
  tapAll(s, [1.0, 1.5, 2.0]);
  const before = buildSongJson(s).lyrics[0].end;
  setLineEnd(s, 0, 2.6);
  const after = buildSongJson(s).lyrics[0].end;
  assert.equal(after, 2.6);
  assert.notEqual(before, after);
});

test('收句时间早于首字时被拉回首字之后，不会负时长', () => {
  const s = makeState('灯一盏');
  tapAll(s, [3.0, 3.4, 3.8]);
  const r = setLineEnd(s, 0, 2.0);
  assert.ok(r.end > 3.0);
  assert.ok(buildSongJson(s).lyrics[0].end > buildSongJson(s).lyrics[0].start);
});

test('一个字都没打的句子收不了句', () => {
  const s = makeState('灯');
  assert.equal(setLineEnd(s, 0, 5), null);
});

/* ══════════ 收句落点：打完最后一个字后光标已经到下一句 ══════════ */
test('打完本句最后一个字后，pendingCloseLine 指回本句（Enter 不会打到下一句）', () => {
  const s = makeState('再给我两份葱\n下一句');
  tapAll(s, [0.5, 0.9, 1.3, 1.7, 2.1, 2.5]);
  assert.equal(currentRef(s).li, 1, '光标已经落到第 2 句');
  assert.equal(pendingCloseLine(s), 0, '待收句的应该是第 1 句');
  // 按「待收句」那一句收：尾音 3 秒要能落进 end 和末字的 e
  setLineEnd(s, pendingCloseLine(s), 5.5);
  const L = buildSongJson(s).lyrics[0];
  assert.equal(L.end, 5.5);
  assert.equal(L.words.at(-1).e, 5.5);
});

test('句子没打满 / 已经收过句时，pendingCloseLine 不再指着它', () => {
  const s = makeState('灯一盏\n下一句');
  tapAll(s, [1.0, 1.5]);
  assert.equal(pendingCloseLine(s), null, '本句还有字没打，不算待收句');
  tapAll(s, [2.0]);
  assert.equal(pendingCloseLine(s), 0);
  setLineEnd(s, 0, 4.0);
  assert.equal(pendingCloseLine(s), null, '收过句就不再等 Enter');
});

test('已经往下打下一句了，就不能再占着屏幕等上一句的 Enter', () => {
  const s = makeState('灯一盏\n下一句');
  tapAll(s, [1.0, 1.5, 2.0]);
  assert.equal(pendingCloseLine(s), 0);
  tapCurrent(s, 4.0);            // 没按 Enter，直接接着打下一句
  assert.equal(pendingCloseLine(s), null, '画面该让给正在打的那句');
  assert.equal(endLineTarget(s), 1);
});

test('最后一句打满也能等到 Enter，不会提前进校验', () => {
  const s = makeState('灯一盏');
  tapAll(s, [1.0, 1.5, 2.0]);
  assert.equal(currentRef(s), null);
  assert.equal(pendingCloseLine(s), 0);
  setLineEnd(s, 0, 4.2);
  assert.equal(buildSongJson(s).lyrics[0].words.at(-1).e, 4.2);
});

test('收早了要覆盖：光标已在下一句、还没打点时，Enter 仍落回上一句', () => {
  const s = makeState('灯一盏\n下一句');
  tapAll(s, [1.0, 1.5, 2.0]);
  assert.equal(endLineTarget(s), 0);
  setLineEnd(s, 0, 2.2);
  assert.equal(endLineTarget(s), 0, '还没开始打下一句，覆盖的是上一句');
  setLineEnd(s, endLineTarget(s), 4.0);
  assert.equal(buildSongJson(s).lyrics[0].words.at(-1).e, 4.0);
});

test('已经开始打下一句时，Enter 收的是下一句', () => {
  const s = makeState('灯一盏\n下一句');
  tapAll(s, [1.0, 1.5, 2.0]);
  setLineEnd(s, 0, 2.4);
  tapCurrent(s, 5.0);            // 第 2 句第一个字
  assert.equal(endLineTarget(s), 1);
});

test('收过句后，时间轴上尾字画到真实句尾，不再是一小截草案宽度', () => {
  const s = makeState('灯一盏');
  tapAll(s, [1.0, 1.5, 2.0]);
  assert.ok(previewSpans(s, 0)[2].e - 2.0 < 0.5, '没收句前是草案短块');
  setLineEnd(s, 0, 5.0);
  assert.equal(previewSpans(s, 0)[2].e, 5.0);
});

/* ══════════ 播全段：大字跟着音乐换句 ══════════ */
test('lineAtTime 按当前时刻选中该唱的那一句', () => {
  const s = makeState('一\n二\n三');           // 一句一个字，时间点是确定的
  tapAll(s, [1.0, 4.0, 7.0]);
  assert.equal(lineAtTime(s, 0), 0, '还没开口也显示第一句');
  assert.equal(lineAtTime(s, 1.0), 0);
  assert.equal(lineAtTime(s, 3.9), 0, '第一句唱完、第二句还没开口 → 仍停第一句');
  assert.equal(lineAtTime(s, 4.0), 1);
  assert.equal(lineAtTime(s, 6.0), 1);
  assert.equal(lineAtTime(s, 9.9), 2, '最后一句之后仍停在最后一句');
});

test('没打点的句子跳过，不会把大字抢走', () => {
  const s = makeState('第一句\n第二句\n第三句');
  tapAll(s, [1.0, 1.5]);                 // 只有第一句打了
  assert.equal(lineAtTime(s, 8), 0);
});

/* ══════════ 缝隙：长停顿不该把前一个字拉亮到底 ══════════ */
test('两个字的间隔超过上限时，前一个字的 e 被收住', () => {
  const s = makeState('灯一盏');
  tapAll(s, [1.0, 1.5, 4.0]);   // 「一」→「盏」间隔 2.5s，中间是停顿
  const words = buildSongJson(s).lyrics[0].words;
  const one = words.find(w => w && w.w === '一');
  assert.ok(one.e - one.t <= MAX_UNIT_DUR + 1e-6, `e-t=${one.e - one.t}`);
  assert.ok(one.e < words.find(w => w && w.w === '盏').t, '停顿处应该留白');
});

test('每个字都带 e，且 e > t', () => {
  const s = makeState('灯一盏把夜');
  tapAll(s, [1, 1.4, 1.8, 2.2, 2.6]);
  for (const w of buildSongJson(s).lyrics[0].words.filter(Boolean)) {
    assert.ok(Number.isFinite(w.e), `${w.w} 缺 e`);
    assert.ok(w.e > w.t, `${w.w} e=${w.e} <= t=${w.t}`);
  }
});

test('unitSpans 能报出长间隙的间隔', () => {
  const s = makeState('灯一盏');
  tapAll(s, [1.0, 1.5, 4.0]);
  const spans = unitSpans(s, 0);
  assert.equal(spans[1].dt, 2.5);
  assert.equal(spans[2].dt, null);   // 句末没有下一个字
});

/* ══════════ 帧粒度 ══════════ */
test('30fps 下 1 帧 = 1/30 秒，10 帧 = 0.333 秒', () => {
  assert.equal(FPS, 30);
  assert.ok(Math.abs(FRAME - 1 / 30) < 1e-9, `FRAME=${FRAME}`);
  assert.equal(frames(10), 0.333);
  assert.equal(frames(-3), -0.1);
});

/* ══════════ 时间轴：均分草案 / 拖左右边 ══════════ */
test('没打点的句子，草案按等长均分且首尾相接', () => {
  const s = makeState('分手吧');
  const sp = previewSpans(s, 0);
  assert.equal(sp.length, 3);
  assert.equal(sp[0].t, 0);
  const w0 = sp[0].e - sp[0].t;
  for (const x of sp) assert.ok(Math.abs((x.e - x.t) - w0) < 1e-6, '宽度不一致');
  assert.equal(sp[0].real, false);
});

test('第一次拖动把整句均分落成真实值，pos 跟着往前走', () => {
  const s = makeState('分手吧');
  fillLineEven(s, 0);
  assert.ok(s.lines[0].units.every(u => u.t != null && u.e != null));
  assert.equal(s.pos, 3);
});

test('拖右边不能越过下一个字的左边（分.e <= 手.t）', () => {
  const s = makeState('分手吧');
  fillLineEven(s, 0);
  const handT = s.lines[0].units[1].t;
  setUnitEnd(s, 0, 0, 99);
  assert.equal(s.lines[0].units[0].e, handT);
  assert.ok(s.lines[0].units[0].e <= s.lines[0].units[1].t);
});

test('拖左边不能越过上一个字的右边，也不能短于最小长度', () => {
  const s = makeState('分手吧');
  fillLineEven(s, 0);
  const [a, b] = s.lines[0].units;
  setUnitStart(s, 0, 1, -99);
  assert.equal(b.t, a.e);
  setUnitStart(s, 0, 1, 99);
  assert.ok(b.e - b.t >= MIN_UNIT - 1e-6, `长度 ${b.e - b.t}`);
});

test('拖出来的终点会进导出的 words[i].e', () => {
  const s = makeState('分手吧');
  fillLineEven(s, 0);
  setUnitEnd(s, 0, 0, 0.2);
  const w = buildSongJson(s).lyrics[0].words[0];
  assert.equal(w.e, 0.2);
  assert.ok(w.t < w.e);
});

test('拖动后导出仍然逐字单调、且终点不超过下一个字', () => {
  const s = makeState('分手吧');
  fillLineEven(s, 0);
  setUnitEnd(s, 0, 1, 0.55);
  const words = buildSongJson(s).lyrics[0].words.filter(Boolean);
  for (let i = 1; i < words.length; i++) assert.ok(words[i].t >= words[i - 1].t);
  for (let i = 1; i < words.length; i++) assert.ok(words[i - 1].e <= words[i].t + 1e-6);
});

/* ══════════ 导入已有项目：applySavedTaps ══════════ */

test('存档往返：导出 → 导入，逐字时间一点不差', () => {
  const s = makeState('再给我两份葱\n下一句');
  tapAll(s, [0.166, 0.622, 1.033, 1.597, 2.05, 2.51]);
  setLineEnd(s, 0, 5.21);
  tapAll(s, [6.0, 6.5]);
  setLineEnd(s, 1, 7.4);
  const out = buildSongJson(s);

  const lines = buildLines('再给我两份葱\n下一句');
  const stat = applySavedTaps(lines, out, 0);
  assert.equal(stat.lines, 2);
  assert.equal(stat.ends, 2);

  const again = buildSongJson({ lines, offsetMs: 0, dur: 30 });
  assert.deepEqual(again.lyrics.map(L => [L.start, L.end]), out.lyrics.map(L => [L.start, L.end]));
  out.lyrics.forEach((L, li) => assert.deepEqual(again.lyrics[li].words, L.words));
});

test('带整体偏移的存档：贴回来要减掉偏移', () => {
  const s = makeState('分手吧', 40);
  tapAll(s, [1.0, 1.5, 2.0]);
  setLineEnd(s, 0, 4.0);
  s.offsetMs = 120;
  const out = buildSongJson(s);          // t = 1.12 / 1.62 / 2.12，end = 4.12

  const lines = buildLines('分手吧');
  applySavedTaps(lines, out, 120);
  assert.deepEqual(lines[0].units.map(u => u.t), [1.0, 1.5, 2.0]);
  assert.equal(lines[0].endT, 4.0);
});

test('endManual:false 的估价句尾不恢复，留给公式重算', () => {
  const lines = buildLines('分手吧');
  const stat = applySavedTaps(lines, {
    lyrics: [{
      text: '分手吧', end: 4, endManual: false,
      words: [{ w: '分', t: 1, e: 1.2 }, { w: '手', t: 1.5, e: 2 }, { w: '吧', t: 2, e: 4 }],
    }],
  }, 0);
  assert.equal(stat.ends, 0);
  assert.equal(lines[0].endT, null, '没按过 Enter 的句子不该凭空长出句尾');
});

test('老存档没写 endManual：当成「人标过的」恢复句尾', () => {
  const lines = buildLines('分手吧');
  applySavedTaps(lines, {
    lyrics: [{
      text: '分手吧', end: 4,
      words: [{ w: '分', t: 1, e: 1.2 }, { w: '手', t: 1.5, e: 2 }, { w: '吧', t: 2, e: 4 }],
    }],
  }, 0);
  assert.equal(lines[0].endT, 4);
});

test('歌词改过（行数对不上）时能贴多少贴多少，不报错', () => {
  const lines = buildLines('分手吧\n下一句');
  const stat = applySavedTaps(lines, {
    lyrics: [{
      text: '分手吧', end: 4, endManual: true,
      words: [{ w: '分', t: 1, e: 1.2 }, { w: '手', t: 1.5, e: 2 }, { w: '吧', t: 2, e: 4 }],
    }],
  }, 0);
  assert.equal(stat.lines, 1);
  assert.equal(stat.units, 3);
  assert.ok(lines[1].units.every(u => u.t == null), '多出来的句子保持空着');
});

test('导出的每句都带 endManual，标明句尾是人标的还是估的', () => {
  const s = makeState('分手吧\n下一句');
  tapAll(s, [1.0, 1.5, 2.0]);
  setLineEnd(s, 0, 4.0);
  tapAll(s, [6, 6.5, 7]);
  const out = buildSongJson(s).lyrics;
  assert.equal(out[0].endManual, true);
  assert.equal(out[1].endManual, false);
});
