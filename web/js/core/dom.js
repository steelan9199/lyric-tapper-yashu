/** DOM 与格式化小工具。不含任何业务。 */

export const $ = (sel, root = document) => root.querySelector(sel);

/** 只在真的变了才写，避免每帧触发重排 */
export function setText(el, v) {
  const s = String(v);
  if (el && el.textContent !== s) el.textContent = s;
}

export function setHTML(el, v) {
  if (el && el.innerHTML !== v) el.innerHTML = v;
}

export const esc = s =>
  String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 95.3 → 01:35.3 */
export const fmtClock = s =>
  String(Math.floor(s / 60)).padStart(2, '0') + ':' + (s % 60).toFixed(1).padStart(4, '0');

export function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
