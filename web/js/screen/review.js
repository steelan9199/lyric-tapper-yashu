/**
 * ③ 校验屏：逐句回放、微调单字、整体偏移、交付。
 *
 * 这一屏最容易越写越胖，所以把「表格怎么排」推给了 view/reviewTable.js，
 * 「文件怎么生成」推给了 export/。这里只做编排。
 */
import { $, setText } from '../core/dom.js';
import { stampOf, lineSpan, clearLine } from '../core/lines.js';
import { mountLine, paintAtTime } from '../view/lineView.js';
import { paintWave, movePlayhead, onSeekDrag } from '../view/waveform.js';
import { renderTable } from '../view/reviewTable.js';
import { saveToServer, copyLyrics, downloadJson } from '../export/publish.js';

export function createReviewScreen(ctx) {
  const { state, player, api, nav } = ctx;

  const el = $('#review');
  const box = $('#lineText2');
  const wave = $('#wave2');
  const head = $('#playhead2');
  const clock = $('#clock2');
  const table = $('#table');
  const off = $('#offset');
  const msgEl = $('#saveMsg');

  const msg = (text, kind = '') => {
    msgEl.className = 'hint' + (kind ? ' ' + kind : '');
    msgEl.textContent = text;
  };

  /* ── 绘制 ── */
  function paintWaveNow() {
    if (!state.dur) return;
    const marks = [];
    state.lines.forEach((L, li) => L.units.forEach((u, ui) => {
      if (u.t == null) return;
      marks.push({
        t: stampOf(state, u),
        sel: Boolean(state.pick && state.pick.li === li && state.pick.ui === ui),
      });
    }));
    paintWave(wave, {
      dur: state.dur,
      peaks: state.peaks,
      marks,
      focus: lineSpan(state, state.revLine),
    });
  }

  function paintLine(t) {
    const L = state.lines[state.revLine];
    if (!L) return;
    mountLine(box, L, 'rev:' + state.revLine);
    paintAtTime(box, L, t - state.offsetMs / 1000);
  }

  function renderTableNow() {
    renderTable(table, {
      state,
      onSelect(li) {
        state.revLine = li;
        state.pick = null;
        renderTableNow();
        paintLine(player.t);
      },
      onPlay: li => playLine(li),
      onRedo: li => gotoRedo(li),
      onPick(li, ui, wasOn) {
        state.pick = wasOn ? null : { li, ui };
        renderTableNow();
        const u = state.lines[li].units[ui];
        if (u.t != null) {
          player.seek(u.t - 0.25 + state.offsetMs / 1000, state.dur);
          player.play().catch(() => {});
        }
      },
    });
  }

  /* ── 播放 ── */
  function playLine(li) {
    const sp = lineSpan(state, li);
    state.revLine = li;
    state.pick = null;
    renderTableNow();
    if (!sp) return;

    state.stopAt = Math.min(state.dur || sp.e + 0.45, sp.e + 0.45);
    player.seek(Math.max(0, sp.s - 0.35), state.dur);
    player.play().catch(() => {});
  }

  function gotoRedo(li) {
    const r = clearLine(state, li);
    if (!r) return;
    state.pos = r.firstIdx;
    state.pick = null;
    nav.show('tapping');
    ctx.tapping.focusAt(r.resumeAt);
  }

  /* ── 微调 ── */
  function nudge(dir, step) {
    if (!state.pick) return;
    const u = state.lines[state.pick.li].units[state.pick.ui];
    if (u.t == null) return;
    u.t = +Math.max(0, u.t + dir * step).toFixed(3);
    renderTableNow();
    paintLine(player.t);
    paintWaveNow();
  }

  const stepLine = d => {
    state.revLine = Math.min(state.lines.length - 1, Math.max(0, state.revLine + d));
    state.pick = null;
    renderTableNow();
    paintLine(player.t);
  };

  /* ── 对外 ── */
  function begin() {
    state.pick = null;
    state.stopAt = null;
    setText($('#revName'), state.songName);
    off.value = state.offsetMs;
    setText($('#offsetV'), state.offsetMs + ' ms');
    msg('');
    setTimeout(() => {
      paintWaveNow();
      renderTableNow();
    }, 40);
  }

  /* ── 绑定 ── */
  $('#back2').onclick = () => {
    player.pause();
    nav.show('tapping');
  };
  $('#playSeg').onclick = () => playLine(state.revLine);
  $('#playAll').onclick = () => {
    state.stopAt = null;
    player.seek(0);
    player.play().catch(() => {});
  };
  $('#prevLine').onclick = () => stepLine(-1);
  $('#nextLine').onclick = () => stepLine(1);

  off.oninput = e => {
    state.offsetMs = Number(e.target.value);
    setText($('#offsetV'), state.offsetMs + ' ms');
    renderTableNow();
    paintWaveNow();
    paintLine(player.t);
  };

  onSeekDrag(wave, ratio => {
    if (!state.dur) return;
    player.seek(ratio * state.dur, state.dur);
    state.stopAt = null;
    player.play().catch(() => {});
    paintLine(player.t);
  });

  /* ── 交付 ── */
  $('#save').onclick = async () => {
    const r = await saveToServer(api, state);
    if (!r.ok) return msg('保存失败：' + r.error, 'bad');
    msg('已存到 songs/' + r.file, 'good');
  };

  $('#copy').onclick = async () => {
    try {
      const n = await copyLyrics(state);
      msg(`已复制 ${n} 句 lyrics`, 'good');
    } catch (e) {
      msg('复制失败：' + e.message, 'bad');
    }
  };

  $('#dl').onclick = () => {
    try {
      downloadJson(state);
      msg('已下载 JSON', 'good');
    } catch (e) {
      msg(e.message, 'bad');
    }
  };

  return {
    id: 'review',
    el,
    begin,
    activate() {
      setTimeout(() => {
        paintWaveNow();
        renderTableNow();
      }, 40);
    },
    tick(t) {
      setText(clock, t.toFixed(3));
      movePlayhead(head, t, state.dur);
      paintLine(t);
      if (state.stopAt != null && t >= state.stopAt) {
        player.pause();
        state.stopAt = null;
      }
    },
    onKey(e) {
      if (e.code === 'Space') {
        if (player.paused) {
          state.stopAt = null;
          player.play().catch(() => {});
        } else {
          player.pause();
        }
        return true;
      }
      switch (e.key) {
        case 'Enter': playLine(state.revLine); return true;
        case 'ArrowLeft':
        case 'ArrowRight': {
          const dir = e.key === 'ArrowRight' ? 1 : -1;
          if (state.pick) nudge(dir, e.shiftKey ? 0.05 : 0.01);
          else stepLine(dir);
          return true;
        }
        case 'ArrowUp': stepLine(-1); return true;
        case 'ArrowDown': stepLine(1); return true;
        case 'Escape': player.pause(); nav.show('tapping'); return true;
        default: return false;
      }
    },
  };
}
