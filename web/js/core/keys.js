/**
 * 全局键盘分发。
 * 输入框里打字时一律不拦（否则歌词里打不出空格），其余交给当前屏。
 *
 * 长按重复只放给方向键：挪 1 帧的步长很小，要能按住连续挪；
 * 空格/F/Enter 一律不吃 repeat，否则会连打、连播暂停。
 */
export function bindKeys(dispatch) {
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input') return;
    const isArrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      || e.key === 'ArrowUp' || e.key === 'ArrowDown';
    if (e.repeat && !isArrow) return;
    if (dispatch(e)) e.preventDefault();
  });
}
