/**
 * ③ 校验屏：逐句回放、微调单字、整体偏移、交付。
 *
 * 这一屏最容易越写越胖，所以把「表格怎么排」推给了 view/reviewTable.js，
 * 「文件怎么生成」推给了 export/。这里只做编排。
 */
import { FRAME } from '../core/time.js';
import { $, setText } from '../core/dom.js';
import { stampOf, lineSpan, clearLine, lineAtTime } from '../core/lines.js';
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

  /** 「中间那行大字跟着播放位置换句」总开关。
   *  一旦你手动点句 / 按 ↑↓ / 选某个字，就先听你的（关掉）；重新点播放或按空格继续再打开。 */
  let follow = true;

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
    // 句尾（Enter 收句的位置）用青绿另画一条，跟打点的橙线分开
    const off = state.offsetMs / 1000;
    const ends = state.lines
      .filter(L => L.endT != null)
      .map(L => +(L.endT + off).toFixed(3));
    paintWave(wave, {
      dur: state.dur,
      peaks: state.peaks,
      marks,
      ends,
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
    // 表格是整块重建的，不记住滚动位置的话，一换句就跳回顶部（长歌词很难受）
    const keep = table.scrollTop;
    renderTable(table, {
      state,
      onSelect(li) {
        state.revLine = li;
        state.pick = null;
        follow = false;                 // 手动选句 = 我要看这句，别被播放位置抢走
        renderTableNow();
        paintLine(player.t);
      },
      onPlay: li => playLine(li),
      onRedo: li => gotoRedo(li),
      onPick(li, ui, wasOn) {
        state.pick = wasOn ? null : { li, ui };
        follow = false;
        renderTableNow();
        const u = state.lines[li].units[ui];
        if (u.t != null) {
          player.seek(u.t - 0.25 + state.offsetMs / 1000, state.dur);
          player.play().catch(() => {});
        }
      },
    });
    table.scrollTop = keep;
  }

  /* ── 播放 ── */
  /**
   * 播放中，中间那行大字跟着音乐换句。
   * 三种情况故意不跟：
   *   ① 暂停 —— 停下来就是要看这一句；
   *   ② 单听某句（stopAt 有值）—— 从这句前 0.35 秒起播，跟的话会被上一句抢走；
   *   ③ 选中了某个字（pick）—— 正在单听这个字。
   */
  function followPlayhead(t) {
    if (!follow || player.paused || state.pick || state.stopAt != null) return;

    const tl = t - state.offsetMs / 1000;    // 和逐字 t 同一口径（原始打点值）
    const li = lineAtTime(state, tl);
    if (li === state.revLine) return;

    state.revLine = li;
    renderTableNow();                       // 表格里那一行的高亮一起走
    const sel = table.querySelector('.tRow.body.sel');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }

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
    follow = false;
    renderTableNow();
    paintLine(player.t);
  };

  /* ── 对外 ── */
  function begin() {
    state.pick = null;
    state.stopAt = null;
    follow = true;
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
  $('#playSeg').onclick = () => { follow = true; playLine(state.revLine); };
  $('#playAll').onclick = () => {
    state.stopAt = null;
    state.pick = null;          // 播全段 = 从头听到尾，不再盯着某个字
    follow = true;              // 从头听就重新跟着走
    renderTableNow();
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
    follow = true;              // 拖到哪就从哪听，跟着走
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
      followPlayhead(t);
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
          follow = true;        // 继续播放 = 接着跟
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
          if (state.pick) nudge(dir, e.shiftKey ? 10 * FRAME : FRAME);
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
