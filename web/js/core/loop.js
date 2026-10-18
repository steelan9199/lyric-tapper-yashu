/** 单条 rAF 主循环。整页只跑一条，谁在台上谁画。 */
export function createLoop(onFrame) {
  let id = 0;

  const tick = () => {
    onFrame();
    id = requestAnimationFrame(tick);
  };

  return {
    start() {
      cancelAnimationFrame(id);
      id = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(id);
      id = 0;
    },
  };
}
