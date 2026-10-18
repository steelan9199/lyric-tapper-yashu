/**
 * 装配入口。整个页面只有这里知道「有哪几屏、谁依赖谁」，
 * 其余模块都只通过构造参数拿到自己需要的东西。
 */
import { $ } from './core/dom.js';
import { createState } from './core/state.js';
import { createPlayer } from './core/audio.js';
import { createApi } from './core/api.js';
import { createScreenManager } from './core/screen.js';
import { createLoop } from './core/loop.js';
import { bindKeys } from './core/keys.js';
import { createSetupScreen } from './screen/setup.js';
import { createTappingScreen } from './screen/tapping.js';
import { createReviewScreen } from './screen/review.js';

const ctx = {
  state: createState(),
  player: createPlayer($('#au')),
  api: createApi(),
  nav: createScreenManager(),
};

// 三屏互相引用（打完 → 校验，校验里重打 → 回打轴），
// 所以先建好、再挂到 ctx 上，屏里一律用 ctx.xxx 延迟取。
ctx.tapping = ctx.nav.register(createTappingScreen(ctx));
ctx.review = ctx.nav.register(createReviewScreen(ctx));
ctx.nav.register(createSetupScreen(ctx));

bindKeys(e => ctx.nav.key(e));
createLoop(() => ctx.nav.tick(ctx.player.t)).start();
ctx.nav.show('setup');

// 自检用：外部（含 headless 冒烟测试）可以看 <html data-ready> 判断有没有启动成功
document.documentElement.dataset.ready = '1';
window.addEventListener('error', e => {
  document.documentElement.dataset.bootError = String(e.message || e);
});
