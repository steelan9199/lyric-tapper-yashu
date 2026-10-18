/**
 * 全部可调常量集中在这里。
 * 改端口、改大小限制、改允许的音频格式，只动这个文件。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 技能根目录（本文件在 server/ 下一层） */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WEB_DIR = path.join(ROOT, 'web');
export const SONGS_DIR = path.join(ROOT, 'songs');

/** 只绑本机回环：这是单机工具，不该被局域网访问 */
export const HOST = '127.0.0.1';
export const PORT = Number(process.env.PORT) || 8787;
/** 端口被占时向上顺延的次数 */
export const PORT_TRIES = 20;

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_JSON_BYTES = 4 * 1024 * 1024;

export const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.opus'];

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
};

/** node server.mjs --no-open   不开浏览器（自动化实测用） */
export const NO_OPEN = process.argv.includes('--no-open');
