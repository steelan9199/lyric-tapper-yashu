/**
 * 校验屏的句子表。纯渲染 + 把点击转成回调，不持有任何状态。
 * 表格结构变了只改这里，review.js 不用动。
 */
import { esc } from '../core/dom.js';
import { lineSpan, stampOf } from '../core/lines.js';

/**
 * @param box     容器
 * @param opts    { state, onSelect, onPlay, onRedo, onPick }
 *                state 里读 revLine 与 pick
 */
export function renderTable(box, opts) {
  const { state } = opts;
  const active = state.revLine;

  box.innerHTML = '';
  box.appendChild(row('tRow head', `
    <div>#</div><div>歌词</div>
    <div class="ta-r">首字</div><div class="ta-r">末字</div><div class="ta-r">时长</div><div></div>
  `));

  state.lines.forEach((L, li) => {
    const sp = lineSpan(state, li);
    const r = row('tRow body' + (li === active ? ' sel' : ''), `
      <div class="idx">${li + 1}</div>
      <div class="txt">${sp ? esc(L.text) : '<span class="faint">未打</span>'}</div>
      <div class="ta-r">${sp ? sp.s.toFixed(2) : '—'}</div>
      <div class="ta-r">${sp ? sp.e.toFixed(2) : '—'}</div>
      <div class="ta-r">${sp ? (sp.e - sp.s).toFixed(2) : '—'}</div>
      <div class="act">
        <button data-play="${li}">播</button>
        <button data-redo="${li}">重打</button>
      </div>
    `);

    r.onclick = e => {
      const play = e.target.closest('[data-play]');
      const redo = e.target.closest('[data-redo]');
      if (play) return opts.onPlay(Number(play.dataset.play));
      if (redo) return opts.onRedo(Number(redo.dataset.redo));
      opts.onSelect(li);
    };

    box.appendChild(r);
    if (li === active) box.appendChild(chips(state, L, li, opts.onPick));
  });
}

function row(cls, html) {
  const n = document.createElement('div');
  n.className = cls;
  n.innerHTML = html;
  return n;
}

function chips(state, line, li, onPick) {
  const box = document.createElement('div');
  box.className = 'chips';

  line.units.forEach((u, ui) => {
    const on = state.pick && state.pick.li === li && state.pick.ui === ui;
    const t = stampOf(state, u);
    const c = document.createElement('span');
    c.className = 'chip' + (on ? ' pick' : '');
    c.innerHTML = `${esc(u.text)} <b>${t == null ? '—' : t.toFixed(3)}</b>`;
    c.onclick = ev => {
      ev.stopPropagation();
      onPick(li, ui, Boolean(on));
    };
    box.appendChild(c);
  });

  return box;
}
