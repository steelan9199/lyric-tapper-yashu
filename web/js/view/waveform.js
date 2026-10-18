/**
 * 波形 + 播放头。只画，不知道「轴」是什么——
 * 调用方把要画的点整理成 marks 传进来。
 *
 * 颜色与 css/tokens.css 保持一致，改配色两边一起改。
 */
const C = {
  axis: '#242a34',
  wave: '#3c4552',
  mark: 'rgba(224,99,47,.78)',
  markFar: 'rgba(224,99,47,.22)',
  band: 'rgba(224,99,47,.13)',
  bandEdge: 'rgba(224,99,47,.55)',
  end: 'rgba(61,215,155,.92)',     // 句尾（Enter 收句）：青绿，和打点的橙一眼分开
};

/**
 * @param canvas  目标画布
 * @param vm      { dur, peaks, marks:[{t, sel}], ends:[t], focus:{s,e}|null }
 */
export function paintWave(canvas, vm) {
  if (!canvas || !canvas.clientWidth) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight || 172;
  // 宽和高都要盯：只盯宽的话，改 CSS 高度之后画布位图还是旧高度，波形会被拉扁
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }

  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const mid = h / 2;
  g.strokeStyle = C.axis;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, mid + 0.5);
  g.lineTo(w, mid + 0.5);
  g.stroke();

  const { dur, peaks } = vm;

  if (peaks && dur) {
    g.fillStyle = C.wave;
    for (let x = 0; x < w; x++) {
      const i = Math.min(peaks.length - 1, Math.floor((x / w) * peaks.length));
      const a = Math.pow(peaks[i], 0.72) * (h * 0.46);
      g.fillRect(x, mid - a, 1, Math.max(1, a * 2));
    }
  }

  if (dur) {
    // 时间轴现在放大的是哪一段：整条波形上标出这段，人就不会把「放大后的 5 个字」
    // 误当成「整首歌的前 5 个字」
    const band = vm.focus;
    if (band && band.e > band.s) {
      const x0 = Math.max(0, (band.s / dur) * w);
      const x1 = Math.min(w, (band.e / dur) * w);
      g.fillStyle = C.band;
      g.fillRect(x0, 0, x1 - x0, h);
      g.fillStyle = C.bandEdge;
      g.fillRect(Math.round(x0), 0, 1, h);
      g.fillRect(Math.round(x1) - 1, 0, 1, h);
    }

    // 打点竖线。挤在一起（<2px）只画一根，否则会糊成一条橙色带，看着像渲染坏了。
    // 当前放大区间之外的画淡一点：它们只是背景信息，不该抢戏。
    const bandPx = band && band.e > band.s
      ? [(band.s / dur) * w, (band.e / dur) * w]
      : null;

    for (const pass of [0, 1]) {
      g.fillStyle = pass ? C.mark : C.markFar;
      let lastX = -99;
      for (const m of vm.marks || []) {
        const x = Math.round((m.t / dur) * w);
        if (x < 0 || x >= w) continue;
        const inside = !bandPx || (x >= bandPx[0] && x <= bandPx[1]);
        if (inside !== !!pass) continue;
        if (x - lastX < 2) continue;
        lastX = x;
        g.fillRect(x, mid - h * 0.46, m.sel ? 2 : 1, h * 0.92);
      }
    }

    // 句尾：按 Enter 收句记下的那一刻。
    // 橙线 = 字的开口（F），青绿整条 + 顶部小横杠 = 一句唱完了（Enter）。
    // 颜色和高度都刻意不同 —— 两种线混成一色，就分不清「字」和「句」了。
    g.fillStyle = C.end;
    for (const e of vm.ends || []) {
      const x = Math.round((e / dur) * w);
      if (x < 0 || x >= w) continue;
      g.fillRect(x, 0, 2, h);
      g.fillRect(Math.max(0, x - 4), 0, 10, 4);
    }
  }
}

export function movePlayhead(node, t, dur) {
  if (!node || !dur) return;
  node.style.left = Math.min(100, Math.max(0, (t / dur) * 100)) + '%';
}

/**
 * 点/拖波形 = 跳到那个位置。回调只收一个 0–1 的比例，
 * 至于「跳过去之后做什么」由屏决定。
 */
export function onSeekDrag(canvas, onJump) {
  const ratioAt = e => {
    const r = canvas.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    onJump(ratioAt(e));

    const move = ev => { if (ev.buttons) onJump(ratioAt(ev)); };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', () => canvas.removeEventListener('pointermove', move), { once: true });
  });
}
