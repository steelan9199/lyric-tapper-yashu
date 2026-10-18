/**
 * 文件名与路径。所有来自请求的名字都必须先过这里，防止 ../ 和盘符穿越。
 */
import path from 'node:path';
import { MIME, AUDIO_EXT } from '../config.mjs';

/**
 * 任意用户输入 → 安全的文件名主干（不含扩展名）。
 * 「周杰伦 - 晴天.mp3」→「周杰伦_-_晴天」
 */
export function safeBase(raw) {
  const noDir = path.basename(String(raw || '').replace(/\\/g, '/'));
  const stem = noDir.replace(/\.[^.]*$/, '');
  const clean = stem
    .replace(/[^\w\u4e00-\u9fa5.-]+/gu, '_')
    .replace(/^[.\-]+/, '')
    .slice(0, 60);
  return clean || 'song';
}

/** 后缀只留白名单内的，其余一律 .mp3 */
export function safeAudioExt(raw) {
  const ext = path.extname(String(raw || '')).toLowerCase();
  return AUDIO_EXT.includes(ext) ? ext : '.mp3';
}

export function mimeOf(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/**
 * 把 URL 里的路径解析到某个根目录内。
 * 越界的返回 null，调用方负责 403。
 */
export function resolveInside(rootDir, pathname) {
  const rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const file = path.join(rootDir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  return file.startsWith(rootDir + path.sep) ? file : null;
}
