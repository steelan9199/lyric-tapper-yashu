/**
 * ② 打轴屏：跟着唱，一个字按一下 F。
 *
 * 键位设计（跟产品对齐过）：
 *   空格 = 播放/暂停（全网默认，右手拇指）
 *   F    = 打点（左手食指 home row，和空格双手分工）
 *   其余见页面底部键位条。这个文件只管「按键 → 领域动作 → 重画」，
 *   时间计算全在 core/lines.js 里，这里不出现任何时间算法。
 */
import { $, setText, setHTML, esc } from '../core/dom.js';
import {
  currentRef, stampOf, tapCurrent, undoStep, skipRestOfLine, clearLine,
  lineSpan, doneCount, setLineEnd, unitSpans, previewSpans, fillLineEven,
  setUnitStart, setUnitEnd,
} from '../core/lines.js';
import { mountLine, paintTapped } from '../view/lineView.js';
import { paintWave, movePlayhead, onSeekDrag } from '../view/waveform.js';
import { renderRail } from '../view/captureRail.js';
import { mountTimeline } from '../view/timeline.js';
import { FRAME } from '../core/time.js';

export function createTappingScreen(ctx) {
  const { state, player, nav } = ctx;

  const el = $('#tapping');
  const box = $('#lineText');
  const wave = $('#wave');
  const head = $('#playhead');
  const clock = $('#clock');
  const hudLine = $('#hudLine');
  const hudPos = $('#hudPos');
  const hudState = $('#hudState');
  const rail = $('#rail');
  const tlRoot = $('#tl');
  const tip = $('#tapTip');

  const say = msg => setText(tip, msg);

  /* ── 绘制 ── */
  function focusLine() {
    if (state.editLine != null) return state.editLine;
    const ref = currentRef(state);
    return ref ? ref.li : state.lines.length - 1;
  }

  function paintWaveNow() {
    if (!state.dur) return;
    const marks = [];
    state.lines.forEach(L => L.units.forEach(u => {
      if (u.t != null) marks.push({ t: stampOf(state, u) });
    }));
    paintWave(wave, { dur: state.dur, peaks: state.peaks, marks, focus: lineSpan(state, focusLine()) });
  }

  function paint() {
    const ref = currentRef(state);
    const li = focusLine();
    const L = state.lines[li];
    if (!L) return;

    // 时间轴可能停在别的句上，高亮必须按「这一句」算，不能拿错的 pos
    const curUI = ref && ref.li === li ? ref.ui : -1;
    mountLine(box, L, 'tap:' + li);
    paintTapped(box, L, curUI);
    paintTimeline(li, L, curUI);

    setHTML(hudLine, `第 <b>${li + 1}/${state.lines.length}</b> 句　「${esc(L.text)}」`);
    setHTML(hudPos, `第 <b>${doneCount(state)}/${state.seq.length}</b> 字`);

    renderRail(rail, {
      line: L,
      li,
      lineCount: state.lines.length,
      currentUI: ref && ref.li === li ? ref.ui : -1,
      done: doneCount(state),
      total: state.seq.length,
      spans: unitSpans(state, li),
    });
  }

  /** 时间轴的 x 窗口按句冻结：拖动的时候比例不变，边才跟得住鼠标 */
  let tlWin = { li: -1, a: 0, b: 1 };

  function paintTimeline(li, L, curUI) {
    const spans = previewSpans(state, li);
    if (!spans.length) return;

    if (tlWin.li !== li) {
      const t0 = spans[0].t;
      const t1 = spans[spans.length - 1].e;
      const pad = Math.max(0.2, (t1 - t0) * 0.18);
      tlWin = { li, a: Math.max(0, t0 - pad), b: t1 + pad };
    }

    tl.paint({
      key: 'l' + li,
      spans,
      chars: L.units.map(u => u.text),
      real: spans.map(s => s.real),
      curUI,
      pick: state.tlPick,
      playT: player.t,
      win: { a: tlWin.a, b: tlWin.b },
    });
  }

  const tl = mountTimeline(tlRoot, {
    /** 第一次下手才把「均分草案」落成真实值：不拖就不写 state */
    onDragStart() {
      const li = focusLine();
      state.editLine = li;
      fillLineEven(state, li);
      repaint();
    },
    onDrag(ui, side, time) {
      const li = focusLine();
      const r = side === 'l' ? setUnitStart(state, li, ui, time) : setUnitEnd(state, li, ui, time);
      if (!r) return;
      repaint();
      say(`「${state.lines[li].units[ui].text}」 ${r.t.toFixed(2)} → ${r.e.toFixed(2)}s · 长 ${(r.e - r.t).toFixed(2)}s`);
    },
    onDragEnd(ui) {
      const li = focusLine();
      const sp = previewSpans(state, li)[ui];
      if (sp) say(`「${state.lines[li].units[ui].text}」定住：${sp.t.toFixed(2)} → ${sp.e.toFixed(2)}s`);
    },
    /** 点住某条边 = 选中它；之后 ←/→ 精确到 1 帧（Shift 10 帧） */
    onPickEdge(ui, side) {
      const li = focusLine();
      state.editLine = li;
      state.tlPick = { ui, side };
      fillLineEven(state, li);
      repaint();
      const u = state.lines[li].units[ui];
      say(`选中「${u.text}」的${side === 'l' ? '起点' : '终点'} · ←/→ 微调 1 帧（Shift 10 帧）`);
    },

    /** 点盒子 = 只听这一个字 */
    onPick(ui) {
      const li = focusLine();
      const sp = previewSpans(state, li)[ui];
      if (!sp) return;
      state.editLine = li;
      state.tlPick = { ui, side: 'box' };
      repaint();
      player.seek(sp.t, state.dur);
      player.play().catch(() => {});
      say(`选中「${state.lines[li].units[ui].text}」· ←/→ 调起点 1 帧（Shift 10 帧）；点右边缘改调终点`);
    },
  });

  function paintState() {
    setText(hudState, player.paused ? '⏸ 暂停' : '▶ 播放');
    hudState.classList.toggle('playing', !player.paused);
  }

  function repaint() {
    paint();
    paintWaveNow();
    paintState();
  }

  /* ── 播放控制 ── */
  function togglePlay() {
    if (player.paused) {
      player.play()
        .then(() => say('播放中，听到字就按 F'))
        .catch(() => say('播放失败：点一下波形，或再按一次空格'));
    } else {
      player.pause();
      say('已暂停，按空格继续');
    }
    paintState();
  }

  /** 挪播放位置，单位是「帧」（1 帧 = 1/30 秒）。
   *  正在播就继续播，暂停就保持暂停 —— 不替用户改播放状态。 */
  function nudge(frames) {
    const was = !player.paused;
    player.seek(player.t + frames * FRAME, state.dur);
    if (was) player.play().catch(() => {});
    paintState();
    say(`挪 ${frames > 0 ? '+' : ''}${frames} 帧 · ${player.t.toFixed(3)}s`);
  }

  /**
   * 微调「选中的那条边」：1 帧一档，Shift 10 帧。
   * 鼠标只是给个大概位置，精确值靠这里 —— 拖完再点住边按方向键，比一直拖准得多。
   */
  function nudgeEdge(frames) {
    const li = focusLine();
    const pick = state.tlPick;
    if (!pick) return;
    const u = state.lines[li] && state.lines[li].units[pick.ui];
    if (!u) return;

    const sp = previewSpans(state, li)[pick.ui];
    const d = frames * FRAME;
    const isStart = pick.side !== 'r';          // 选中整块时默认调起点
    const r = isStart
      ? setUnitStart(state, li, pick.ui, sp.t + d)
      : setUnitEnd(state, li, pick.ui, sp.e + d);
    if (!r) return;

    repaint();
    const v = isStart ? r.t : r.e;
    say(`「${u.text}」${isStart ? '起点' : '终点'} ${v.toFixed(3)}s · ${frames > 0 ? '+' : ''}${frames} 帧`);
  }

  /* ── 打点动作 ── */
  const toReview = () => {
    nav.show('review');
    ctx.review.begin();
  };

  function tap() {
    state.editLine = null;
    state.tlPick = null;
    const { ref, finished } = tapCurrent(state, player.t);
    if (!ref) return toReview();

    repaint();

    if (!finished) {
      if (player.paused) say(`记下「${ref.unit.text}」，按空格继续播放`);
      return;
    }

    player.pause();
    say('打完了，进校验');
    setTimeout(toReview, 450);
  }

  function undo() {
    state.editLine = null;
    state.tlPick = null;
    const r = undoStep(state);
    if (!r) return;
    const was = !player.paused;
    player.seek(r.resumeAt, state.dur);
    if (was) player.play().catch(() => {});
    repaint();
    say(`退回「${r.unit.text}」，到这儿再打一次`);
  }

  /** 收句：记这一句真实的结束时间。句尾没有下一个字可推，只能这么标一次 */
  function endLine() {
    const ref = currentRef(state);
    const li = ref ? ref.li : focusLine();
    const L = state.lines[li];
    if (!L) return;

    const r = setLineEnd(state, li, player.t);
    if (!r) { say('这句还没打点，先按 F'); return; }

    const left = L.units.filter(u => u.t == null).length;
    repaint();
    say(left
      ? `收句 ${r.dur.toFixed(2)}s，但本句还有 ${left} 个字没打点（Ctrl+Enter 可整句跳过）`
      : `收句 ${r.dur.toFixed(2)}s`);
  }

  function skipLine() {
    const n = skipRestOfLine(state, player.t);
    if (!n) return;
    repaint();
    say(`跳过本句剩余 ${n} 个字（按 0.32s 估的，记得回头重打）`);
  }

  function redoLine() {
    state.editLine = null;
    state.tlPick = null;
    const ref = currentRef(state);
    if (!ref) return;
    const r = clearLine(state, ref.li);
    if (!r) return;

    const was = !player.paused;
    state.pos = r.firstIdx;
    player.seek(r.resumeAt, state.dur);
    if (was) player.play().catch(() => {});
    repaint();
    say(`第 ${ref.li + 1} 句重来`);
  }

  /** ↑↓ 把时间轴切到上一句 / 下一句（不动播放，也不动待打位置） */
  function shiftLine(d) {
    const li = Math.max(0, Math.min(state.lines.length - 1, focusLine() + d));
    state.editLine = li;
    state.tlPick = null;
    tlWin = { li: -1, a: 0, b: 1 };
    repaint();
    say(`时间轴切到第 ${li + 1} 句`);
  }

  /* ── 对外：开始 / 定位 ── */
  function begin() {
    state.editLine = null;
    state.tlPick = null;
    tlWin = { li: -1, a: 0, b: 1 };
    setText($('#tapName'), state.songName);
    say('');
    setTimeout(repaint, 40);

    const kick = () => {
      player.seek(0);
      player.play()
        .then(() => { paintState(); say('预备…听到第一个字按 F，空格随时暂停'); })
        .catch(() => { paintState(); say('浏览器拦了自动播放：按空格开始'); });
    };
    if (state.dur) kick(); else player.whenReady().then(kick);
  }

  /** 校验屏「重打」时把进度接过来 */
  function focusAt(t) {
    player.seek(Math.max(0, t), state.dur);
    player.play().catch(() => {});
    repaint();
  }

  /* ── 波形拖动：跳到该时刻，并把待打位置挪过去 ── */
  onSeekDrag(wave, ratio => {
    if (!state.dur) return;
    const t = ratio * state.dur;
    const was = !player.paused;
    player.seek(t, state.dur);

    const idx = state.seq.findIndex(r => {
      const u = state.lines[r.li].units[r.ui];
      return u.t == null || u.t >= t;
    });
    if (idx >= 0) state.pos = idx;

    if (was) player.play().catch(() => {});
    repaint();
  });

  return {
    id: 'tapping',
    el,
    begin,
    focusAt,
    activate() { setTimeout(repaint, 40); },
    tick(t) {
      setText(clock, t.toFixed(3));
      movePlayhead(head, t, state.dur);
      paint();
      paintState();
    },
    onKey(e) {
      // 空格：播放/暂停。全网默认，右手拇指，优先于一切
      if (e.code === 'Space') { togglePlay(); return true; }

      if (e.key === 'Enter') {
        if (e.ctrlKey || e.metaKey) skipLine(); else endLine();
        return true;
      }

      switch (e.key) {
        case 'Backspace': e.shiftKey ? redoLine() : undo(); return true;
        case 'ArrowLeft': {
          const n = e.shiftKey ? -10 : -1;
          if (state.tlPick) nudgeEdge(n); else nudge(n);
          return true;
        }
        case 'ArrowRight': {
          const n = e.shiftKey ? 10 : 1;
          if (state.tlPick) nudgeEdge(n); else nudge(n);
          return true;
        }
        case 'ArrowUp': shiftLine(-1); return true;
        case 'ArrowDown': shiftLine(1); return true;
        case 'f':
        case 'F': tap(); return true;
        case 'r':
        case 'R': redoLine(); return true;
        case 'Escape': player.pause(); nav.show('setup'); return true;
        default: return false;
      }
    },
  };
}
