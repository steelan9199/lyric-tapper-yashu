/**
 * 打轴屏右侧「捕获」面板：把刚打下的时间直接摊开给人看。
 *
 * 存在的理由：波形上那几个竖条看不出「这个字亮多久」，人打完一段心里没底。
 * 这里逐字给出 起点 / 与上一字的间隔 / 点亮时长，并对异常（太快、长间隙）标色。
 *
 * 只画，不改状态。每帧调用，但内容没变就跳过重建。
 */
import { esc } from '../core/dom.js';

const FMT = s => s.toFixed(3);

/** 间隔判据：太快像手抖，太长要么歌手停了、要么漏打了一个字 */
function levelOf(dt) {
  if (dt == null) return '';
  if (dt > 2.5) return 'bad';
  if (dt > 1.2) return 'gap';
  if (dt < 0.1) return 'fast';
  return '';
}

export function renderRail(root, vm) {
  const { line, li, lineCount, currentUI, done, total, spans } = vm;
  if (!line) return;

  const sig = [li, currentUI, line.endT, ...spans.map(s => s.t)].join('|');
  if (root.dataset.sig === sig) return;
  root.dataset.sig = sig;

  let gaps = 0;
  let fast = 0;

  const rows = spans.map((s, ui) => {
    const u = line.units[ui];
    const label = esc(u.text.length > 2 ? u.text.slice(0, 2) + '…' : u.text);
    if (s.t == null) {
      const cur = ui === currentUI ? ' cur' : '';
      return `<div class="rw todo${cur}"><b>${label}</b><span class="t">—</span><span class="d"></span><i class="durbar"></i></div>`;
    }
    const lv = levelOf(s.dt);
    if (lv === 'gap' || lv === 'bad') gaps++;
    if (lv === 'fast') fast++;
    const dur = s.e == null ? 0 : Math.max(0, s.e - s.t);
    const w = Math.min(100, Math.round((dur / 1.4) * 100));
    const dtxt = s.dt == null ? '句末' : (s.dt > 0 ? '+' : '') + s.dt.toFixed(2);
    return `<div class="rw ${lv}${ui === currentUI ? ' cur' : ''}"><b>${label}</b>` +
      `<span class="t">${FMT(s.t)}</span><span class="d">${dtxt}</span>` +
      `<i class="durbar" style="width:${w}%"></i></div>`;
  }).join('');

  const endTxt = line.endT == null ? '未收句' : '+' + line.endT.toFixed(2) + 's';

  root.innerHTML =
    `<div class="rail-hd">
       <span class="rail-t">捕获</span>
       <span class="rail-end${line.endT == null ? ' off' : ''}">${endTxt}</span>
     </div>
     <div class="rail-meta">第 <b>${li + 1}</b>/${lineCount} 句 · 已打 <b>${done}</b>/${total} 字</div>
     <div class="rail-list">${rows}</div>
     <div class="rail-foot">${gaps ? `<span class="w gap">长间隙 ${gaps}</span>` : ''}${
      fast ? `<span class="w fast">太快 ${fast}</span>` : ''}${
      gaps || fast ? '' : '<span class="w ok">节奏正常</span>'}</div>`;

  const cur = root.querySelector('.rw.cur');
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
}
