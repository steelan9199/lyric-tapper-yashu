/**
 * ② 打轴屏：跟着唱，一个字按一下空格。
 *
 * 只负责「按键 → 领域动作 → 重画」，节奏判断全在 core/lines.js 里。
 * 这个文件不应该出现任何时间计算。
 */
import { $, setText, setHTML, esc } from '../core/dom.js';
import {
  currentRef, stampOf, tapCurrent, undoStep, skipRestOfLine, clearLine, lineSpan, doneCount,
} from '../core/lines.js';
import { mountLine, paintTapped } from '../view/lineView.js';
import { paintWave, movePlayhead, onSeekDrag } from '../view/waveform.js';

export function createTappingScreen(ctx) {
  const { state, player, nav } = ctx;

  const el = $('#tapping');
  const box = $('#lineText');
  const wave = $('#wave');
  const head = $('#playhead');
  const clock = $('#clock');
  const hudLine = $('#hudLine');
  const hudPos = $('#hudPos');
  const tip = $('#tapTip');

  const say = msg => setText(tip, msg);

  /* ── 绘制 ── */
  function focusLine() {
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

    mountLine(box, L, 'tap:' + li);
    paintTapped(box, L, ref ? ref.ui : -1);

    setHTML(hudLine, `第 <b>${li + 1}/${state.lines.length}</b> 句　「${esc(L.text)}」`);
    setHTML(hudPos, `第 <b>${doneCount(state)}/${state.seq.length}</b> 字`);
  }

  function repaint() {
    paint();
    paintWaveNow();
  }

  /* ── 打点动作 ── */
  const toReview = () => {
    nav.show('review');
    ctx.review.begin();
  };

  function tap() {
    const { ref, finished } = tapCurrent(state, player.t);
    if (!ref) return toReview();

    repaint();
    if (!finished) return;

    player.pause();
    say('打完了，进校验');
    setTimeout(toReview, 450);
  }

  function undo() {
    const r = undoStep(state);
    if (!r) return;
    player.seek(r.resumeAt, state.dur);
    player.play().catch(() => {});
    repaint();
    say(`退回「${r.unit.text}」，从这儿重唱`);
  }

  function skipLine() {
    const n = skipRestOfLine(state, player.t);
    if (!n) return;
    repaint();
    say(`跳过本句剩余 ${n} 个字（按 0.32s 估的，记得回头重打）`);
  }

  function redoLine() {
    const ref = currentRef(state);
    if (!ref) return;
    const r = clearLine(state, ref.li);
    if (!r) return;

    state.pos = r.firstIdx;
    player.seek(r.resumeAt, state.dur);
    player.play().catch(() => {});
    repaint();
    say(`第 ${ref.li + 1} 句重来`);
  }

  /* ── 对外：开始 / 定位 ── */
  function begin() {
    setText($('#tapName'), state.songName);
    say('');
    setTimeout(repaint, 40);

    const kick = () => {
      player.seek(0);
      player.play()
        .then(() => say('预备…听到第一个字就按空格'))
        .catch(() => say('浏览器拦了自动播放：点一下波形，或按 → 开始'));
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
    player.seek(t, state.dur);

    const idx = state.seq.findIndex(r => {
      const u = state.lines[r.li].units[r.ui];
      return u.t == null || u.t >= t;
    });
    if (idx >= 0) state.pos = idx;

    player.play().catch(() => {});
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
    },
    onKey(e) {
      if (e.code === 'Space') { tap(); return true; }
      switch (e.key) {
        case 'Backspace': undo(); return true;
        case 'Enter': skipLine(); return true;
        case 'ArrowLeft': player.seek(player.t - 0.3, state.dur); return true;
        case 'ArrowRight': player.seek(player.t + 0.3, state.dur); return true;
        case 'r':
        case 'R': redoLine(); return true;
        case 'Escape': player.pause(); nav.show('setup'); return true;
        default: return false;
      }
    },
  };
}
