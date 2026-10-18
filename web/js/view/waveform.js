/**
 * 波形 + 播放头。只画，不知道「轴」是什么——
 * 调用方把要画的点整理成 marks 传进来。
 *
 * 颜色与 css/tokens.css 保持一致，改配色两边一起改。
 */
const C = {
  axis: '#242a34',
  wave: '#3c4552',
  mark: 'rgba(224,99,47,.85)',
  band: 'rgba(224,99,47,.07)',
};

/**
 * @param canvas  目标画布
 * @param vm      { dur, peaks, marks:[{t, sel}], focus:{s,e}|null }
 */
export function paintWave(canvas, vm) {
  if (!canvas || !canvas.clientWidth) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight || 86;
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
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
    const band = vm.focus;
    if (band && band.e > band.s) {
      const x0 = Math.max(0, (band.s / dur) * w);
      const x1 = Math.min(w, (band.e / dur) * w);
      g.fillStyle = C.band;
      g.fillRect(x0, 0, x1 - x0, h);
    }

    g.fillStyle = C.mark;
    for (const m of vm.marks || []) {
      const x = Math.round((m.t / dur) * w);
      if (x < 0 || x >= w) continue;
      g.fillRect(x, mid - h * 0.46, m.sel ? 2 : 1, h * 0.92);
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
