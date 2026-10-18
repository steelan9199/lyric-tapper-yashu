/**
 * 屏控制器。三个屏是同一套接口：
 *   { id, el, activate(), deactivate?(), tick?(t), onKey?(e) → bool }
 *
 * 加第四个屏 = 造一个对象、register 一下，不改这里的任何代码。
 */
export function createScreenManager() {
  const items = new Map();
  let active = null;

  return {
    register(screen) {
      items.set(screen.id, screen);
      return screen;
    },

    show(id) {
      const next = items.get(id);
      if (!next || next === active) return active;
      if (active) {
        active.el.classList.remove('on');
        active.deactivate?.();
      }
      active = next;
      active.el.classList.add('on');
      active.activate?.();
      return active;
    },

    get active() {
      return active;
    },

    /** 键盘交给当前屏；返回 true 表示已处理 */
    key(e) {
      return Boolean(active && active.onKey && active.onKey(e));
    },

    /** 主循环每帧调一次，只有当前屏在画 */
    tick(t) {
      active?.tick?.(t);
    },
  };
}
