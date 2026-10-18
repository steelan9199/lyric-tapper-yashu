/**
 * 启动：端口顺延、打横幅、开浏览器。
 * 端口被占是最常见的启动失败原因（上一次没关），所以自动 +1 重试，而不是报错退出。
 */
import http from 'node:http';
import { exec } from 'node:child_process';
import { HOST, NO_OPEN, PORT, PORT_TRIES, SONGS_DIR } from './config.mjs';
import { handle } from './router.mjs';

/** 路径尾部两段就够认了。绝对路径在 Windows 上可能被目录联结成 D:\CToD\…，打出来只会让人困惑。 */
function shortDir(p) {
  return '…/' + p.split(/[\\/]/).filter(Boolean).slice(-2).join('/');
}

function banner(url) {
  const lines = [
    '',
    '  ┌─────────────────────────────────────────────┐',
    '  │  本地打轴页已启动                           │',
    '  │  ' + url.padEnd(43) + '│',
    '  │  关闭：在这个窗口按 Ctrl+C                  │',
    '  └─────────────────────────────────────────────┘',
    '  轴会存到：' + shortDir(SONGS_DIR) + '/',
    '',
  ];
  console.log(lines.join('\n'));
}

function openBrowser(url) {
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

export function start(port = PORT, tries = 0) {
  const srv = http.createServer(handle);

  srv.on('error', e => {
    if (e.code === 'EADDRINUSE' && tries < PORT_TRIES) return start(port + 1, tries + 1);
    console.error('\n[打轴页] 启动失败：' + e.message + '\n');
    process.exit(1);
  });

  srv.listen(port, HOST, () => {
    const url = `http://${HOST}:${port}/`;
    banner(url);
    if (!NO_OPEN) openBrowser(url);
  });

  return srv;
}
