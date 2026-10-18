#!/usr/bin/env node
/**
 * 本地打轴页 · 入口
 * ---------------------------------------------------------------------------
 *   node server.mjs             启动并自动开浏览器
 *   node server.mjs --no-open   只启动（自动化实测用）
 *   PORT=9000 node server.mjs   指定起始端口
 *
 * 零依赖、只绑 127.0.0.1。
 * 代码结构见 SKILL.md「源码地图」：改后端功能去 server/routes/，改页面去 web/js/screen/。
 */
import { start } from './server/boot.mjs';

start();
