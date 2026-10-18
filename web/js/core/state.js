/**
 * 全局状态。一个朴素可变对象——页面每帧都在读它，用 Proxy/订阅反而更慢。
 * 约定：视图只读，写入一律走 core/lines.js 里的动作函数。
 */
export function createState() {
  return {
    /* 素材 */
    file: null,        // File 对象，只在载入屏用
    fileName: '',      // 存进 songs/ 的文件名
    songName: '',      // 存档名
    dur: 0,
    peaks: null,       // Float32Array，波形用

    /* 轴 */
    lines: [],         // [{ text, chars, units, charUnit }]
    seq: [],           // [{li,ui}] 扁平打点序列
    pos: 0,            // 下一个待打单元
    offsetMs: 0,       // 整体偏移（毫秒），只影响输出与显示，不改原始 t

    /* 校验屏 */
    revLine: 0,
    pick: null,        // {li,ui} 正在微调的字
    stopAt: null,      // 试听到此为止
  };
}
