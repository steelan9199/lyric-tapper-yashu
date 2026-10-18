/**
 * 时间轴：一个字一个矩形，上下交错，左右边可拖。
 *
 * 为什么上下交错：相邻两个字如果排在同一行，拖 `分` 的右边和拖 `手` 的左边会抢同一个点。
 * 一上一下之后，两个边永远分开，鼠标不会点错。
 *
 * 为什么只画「当前这一句」：60 秒铺满 1200px 是 20px/s，一个字 0.2 秒只有 4px，
 * 拖不准也看不清。按句放大到 200~400px/s，才是能下手的分辨率。
 *
 * 这个文件只画和收指针，时间怎么夹、状态怎么写，全在 core/lines.js。
 */
import { FPS } from '../core/time.js';

/** 拖拽时吸附到帧：成片 30fps，比一帧更细的值渲染时会被吞掉 */
const snap = t => Math.round(t * FPS) / FPS;

export function mountTimeline(root, { onDragStart, onDrag, onDragEnd, onPick, onPickEdge }) {
  let key = '';
  let boxes = [];
  let vm = null;

  function build(n) {
    root.innerHTML = '';
    boxes = [];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'tl-box ' + (i % 2 ? 'down b' : 'up a');
      el.dataset.ui = String(i);

      const lh = document.createElement('i');
      lh.className = 'tl-h l';
      lh.dataset.side = 'l';

      const rh = document.createElement('i');
      rh.className = 'tl-h r';
      rh.dataset.side = 'r';

      const ch = document.createElement('span');
      ch.className = 'tl-ch';

      el.append(lh, ch, rh);
      root.appendChild(el);
      boxes.push({ el, ch });
    }
    const head = document.createElement('div');
    head.className = 'tl-head';
    root.appendChild(head);
  }

  /** 指针位置 → 秒（吸附到帧） */
  function timeAt(clientX) {
    const r = root.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const { a, b } = vm.win;
    return +snap(a + p * (b - a)).toFixed(3);
  }

  root.addEventListener('pointerdown', e => {
    if (!vm) return;
    const h = e.target.closest('.tl-h');
    const box = e.target.closest('.tl-box');
    if (!box) return;

    const ui = +box.dataset.ui;

    if (!h) {
      onPick && onPick(ui);
      return;
    }

    e.preventDefault();
    const side = h.dataset.side;
    // 点住这条边 = 选中它：松手不拖也算选中，之后 ←/→ 就改它
    onPickEdge && onPickEdge(ui, side);
    root.classList.add('dragging');
    box.classList.add('hot');
    onDragStart && onDragStart(ui);
    onDrag(ui, side, timeAt(e.clientX));

    const move = ev => onDrag(ui, side, timeAt(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      root.classList.remove('dragging');
      box.classList.remove('hot');
      onDragEnd && onDragEnd(ui, side);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  });

  function paint(next) {
    vm = next;
    const k = next.key + '|' + next.spans.length;
    if (k !== key) { build(next.spans.length); key = k; }

    const { a, b } = next.win;
    const span = Math.max(0.2, b - a);
    const pct = t => ((t - a) / span) * 100;

    next.spans.forEach((s, i) => {
      const box = boxes[i];
      if (!box) return;
      const x0 = pct(s.t);
      const x1 = pct(s.e);
      box.el.style.left = x0 + '%';
      box.el.style.width = Math.max(0, x1 - x0) + '%';
      if (box.ch.textContent !== next.chars[i]) box.ch.textContent = next.chars[i];
      box.el.classList.toggle('ghost', !next.real[i]);
      box.el.classList.toggle('cur', i === next.curUI);
      const pick = next.pick;
      const on = !!pick && pick.ui === i;
      box.el.classList.toggle('sel', on && pick.side === 'box');
      box.el.classList.toggle('sel-l', on && pick.side === 'l');
      box.el.classList.toggle('sel-r', on && pick.side === 'r');
    });

    const head = root.querySelector('.tl-head');
    if (head) {
      const x = pct(next.playT);
      head.style.left = Math.min(100, Math.max(0, x)) + '%';
      head.style.opacity = x >= 0 && x <= 100 ? '1' : '0';
    }
  }

  return { paint };
}
