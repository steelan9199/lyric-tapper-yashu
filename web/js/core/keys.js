/**
 * 全局键盘分发。
 * 输入框里打字时一律不拦（否则歌词里打不出空格），其余交给当前屏。
 */
export function bindKeys(dispatch) {
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input') return;
    if (e.repeat) return;
    if (dispatch(e)) e.preventDefault();
  });
}
