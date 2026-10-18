/**
 * 时间粒度。工具栏的微调一律按「帧」走，不按毫秒 —— 因为成片是 30fps，
 * 任何小于 1 帧的调整在渲染时都会被吞掉，按 0.01s 调只是假精度。
 *
 * FPS 必须和 MV 技能 story.json 里的 fps 一致（默认 30）。
 * 如果哪天成片改成 60fps，只改这里一处，两个屏的键位一起变。
 */
export const FPS = 30;
export const FRAME = 1 / FPS;          // 0.0333… 秒
export const FRAME_MS = Math.round(1000 / FPS);   // 33 毫秒，只用于文案

/** 3 帧 → 秒 */
export const frames = n => +(n * FRAME).toFixed(3);
