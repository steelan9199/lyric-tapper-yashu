#!/usr/bin/env node
/**
 * 冒烟测试。改完代码跑一次，1~3 秒出结果，不用手点浏览器。
 *
 *   node scripts/smoke.mjs            起一个临时服务，全查
 *   node scripts/smoke.mjs --port 8899 复用已经在跑的服务，不再自己起
 *   node scripts/smoke.mjs --no-dom   只查文件与 import 连通性（更快）
 *
 * 它查三件事，正好覆盖「拆模块之后最容易断的地方」：
 *   1. 页面引用的每个 css / js 都能 200
 *   2. 每个 js 里 import 的相对路径都真实存在（拆文件时最常断这条）
 *   3. 无头浏览器跑一遍，<html data-ready="1"> 出现且没有 data-boot-error
 *
 * 零依赖：只用 node 内置模块 + 本机 Edge/Chrome 的 --dump-dom。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');

const arg = (k, d = '') => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? (process.argv[i + 1] || '') : d;
};
const has = k => process.argv.includes('--' + k);

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

let fails = 0;
const bad = m => { fails++; console.log('  ✗ ' + m); };
const ok = m => console.log('  ✓ ' + m);

/* ── 1. 起服务（或用现成的） ── */
const reuse = arg('port');
const PORT = Number(reuse || 8877);

async function waitUp(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/`);
      if (r.ok) return true;
    } catch { /* 还没起来 */ }
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

let child = null;
if (!reuse) {
  child = spawn(process.execPath, [path.join(ROOT, 'server.mjs'), '--no-open'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', d => process.stderr.write('[server] ' + d));
}

const kill = () => { if (child) child.kill(); };
process.on('exit', kill);

console.log(`\n[smoke] 服务 127.0.0.1:${PORT}`);
if (!await waitUp()) {
  console.log('  ✗ 服务没起来\n');
  kill();
  process.exit(1);
}
ok('服务已就绪');

/* ── 2. 静态文件与 import 连通性 ── */
const hit = async u => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}${u}`);
    return r.status;
  } catch { return 0; }
};

const html = readFileSync(path.join(WEB, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(m => m[1])
  .filter(u => !/^(https?:|data:|#)/.test(u));

console.log('\n[smoke] 页面引用');
for (const u of refs) {
  const s = await hit('/' + u.replace(/^\//, ''));
  s === 200 ? ok(u) : bad(`${u} → ${s || '连不上'}`);
}

// 遍历 web 下所有 js，检查 import 的相对路径是否落地
const jsFiles = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) jsFiles.push(p);
  }
})(path.join(WEB, 'js'));

console.log(`\n[smoke] import 连通性（${jsFiles.length} 个模块）`);
for (const f of jsFiles) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(f), m[1]);
    if (existsSync(target)) continue;
    bad(`${path.relative(WEB, f)} → ${m[1]} 不存在`);
  }
}
if (!fails) ok('全部 import 都能落地');

/* ── 3. 无头浏览器真跑一遍 ── */
if (!has('no-dom')) {
  console.log('\n[smoke] 无头渲染');
  const browser = BROWSERS.find(p => existsSync(p));
  if (!browser) {
    bad('找不到 Edge / Chrome，跳过渲染检查（加 --no-dom 可静音）');
  } else {
    const r = spawnSync(browser, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--virtual-time-budget=1500', '--dump-dom',
      `http://127.0.0.1:${PORT}/`,
    ], { encoding: 'utf8', timeout: 30000 });

    const dom = r.stdout || '';
    if (!dom) bad('浏览器没吐出 DOM：' + (r.stderr || '').slice(0, 200));
    else if (dom.includes('data-boot-error')) {
      bad('页面报错：' + (/data-boot-error="([^"]*)"/.exec(dom) || [])[1]);
    } else if (!dom.includes('data-ready="1"')) {
      bad('data-ready 没出现 —— 多半是某个模块加载失败，先看上面 import 那节');
    } else {
      ok('data-ready="1"');
      // 顺手确认三个屏都还在文档里
      for (const id of ['setup', 'tapping', 'review']) {
        dom.includes(`id="${id}"`) ? ok('屏 #' + id) : bad('缺屏 #' + id);
      }
    }
  }
}

kill();
console.log(fails ? `\n[smoke] 失败 ${fails} 项\n` : '\n[smoke] 全通过\n');
process.exit(fails ? 1 : 0);
