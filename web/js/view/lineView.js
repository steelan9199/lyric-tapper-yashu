/**
 * 一行大字。打轴屏和校验屏共用同一份「字 → span」逻辑，
 * 但「什么时候亮」的判据不同，所以拆成两个 paint：
 *   paintTapped  —— 打过点的字亮（列表状态，跟播放无关）
 *   paintAtTime  —— 播放到这一刻亮（跟唱状态）
 */
import { isSpace, isPunct } from '../core/text.js';

const baseCls = c => 'ch' + (isSpace(c) || isPunct(c) ? ' skip' : '');

function setCls(node, cls) {
  if (node.className !== cls) node.className = cls;
}

/** 只有换了行才重建 span。返回 true 表示重建过 */
export function mountLine(box, line, key) {
  if (box.dataset.key === key) return false;
  box.dataset.key = key;
  box.innerHTML = '';
  line.chars.forEach(c => {
    const sp = document.createElement('span');
    sp.className = baseCls(c);
    sp.textContent = isSpace(c) ? '\u00a0' : c;
    box.appendChild(sp);
  });
  return true;
}

/** 打轴屏：已打点的字常亮，当前待打的字高亮 */
export function paintTapped(box, line, currentUI) {
  line.chars.forEach((c, i) => {
    const node = box.children[i];
    if (!node) return;
    const ui = line.charUnit[i];
    let cls = baseCls(c);
    if (ui >= 0) {
      const u = line.units[ui];
      if (u.t != null) cls += ' done';
      else if (ui === currentUI) cls += ' cur';
    }
    setCls(node, cls);
  });
}

/** 校验屏：按播放时间点亮，提前 0.45s 给个「马上要唱」的提示 */
export function paintAtTime(box, line, tLocal, lead = 0.45) {
  line.chars.forEach((c, i) => {
    const node = box.children[i];
    if (!node) return;
    const ui = line.charUnit[i];
    const u = ui >= 0 ? line.units[ui] : null;
    let cls = baseCls(c);
    if (u && u.t != null) {
      if (tLocal >= u.t) cls += ' done';
      else if (tLocal >= u.t - lead) cls += ' cur';
    }
    setCls(node, cls);
  });
}
