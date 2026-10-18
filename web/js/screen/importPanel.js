/**
 * 载入屏右侧的「导入已有项目」。
 *
 * 它跟「拖音频 / 贴歌词」不是一类事 —— 它是一次**数据恢复**：
 *   音频 + 歌词 + 每个字的开口 + 每句的句尾，四样都从 songs/ 里那份 json 拿。
 * 所以单独一个文件，载入屏只管「凑素材」，这里只管「接旧账」。
 */
import { $, esc } from '../core/dom.js';
import { buildLines, rebuildSeq, applySavedTaps } from '../core/lines.js';
import { computePeaks } from '../core/peaks.js';
import { saveLyrics } from '../core/store.js';

const stamp = ms => {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * @param refreshHint  接完一份轴后让载入屏重算按钮/提示
 * @param review       () => 校验屏实例（ctx.review 是后挂的，所以取函数）
 */
export function createImportPanel({ state, player, api, nav, refreshHint, review }) {
  const box = $('#resume');
  const reload = $('#reload');

  let listSeq = 0;      // 连点刷新时只认最后一次

  /* ── 列表 ── */
  async function refresh() {
    const seq = ++listSeq;
    try {
      const j = await api.list();
      if (seq !== listSeq) return;
      if (!j.ok) throw new Error(j.error || '接口出错');

      const items = j.items || [];
      if (!items.length) {
        box.innerHTML = '<em>还没有存过的轴。打完点「保存到 songs/」，就会出现在这里。</em>';
        return;
      }

      box.innerHTML = '';
      items.forEach(it => box.appendChild(renderItem(it)));
      if (items.length > 6) {
        const foot = document.createElement('div');
        foot.className = 'rFoot';
        foot.textContent = `共 ${items.length} 份 · 最近保存的在最上面`;
        box.appendChild(foot);
      }
    } catch (e) {
      box.innerHTML = `<em>读不到存档列表：${esc(e.message)}（服务没开？）</em>`;
    }
  }

  function renderItem(it) {
    const d = document.createElement('div');
    d.className = 'rItem';
    d.tabIndex = 0;
    d.setAttribute('role', 'button');
    d.setAttribute('aria-label', `导入 ${it.name}`);

    const meta = [];
    if (it.duration) meta.push(`${(+it.duration).toFixed(1)}s`);
    if (it.lines) meta.push(`${it.lines} 句`);
    if (it.words) meta.push(`${it.words} 字`);
    meta.push(stamp(it.mtime));

    // 老版本服务端不返回 audio（undefined），别误报成「缺音频」——只有明确是空串才算缺
    d.innerHTML = `<span class="rMain">
        <span class="rName">${esc(it.name)}</span>
        <span class="rMeta">${esc(meta.join(' · '))}${it.audio === '' ? ' · <b class="rTag">缺音频</b>' : ''}</span>
      </span>
      <span class="rGo">导入 →</span>`;

    const open = () => openSaved(it.name, d);
    d.addEventListener('click', open);
    d.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    return d;
  }

  /* ── 接回来 ── */
  /**
   * 音频找得到 → 直接进校验屏；
   * 找不到 → 留在载入屏等用户补音频（轴已经接回内存，不会丢）。
   */
  async function openSaved(name, itemEl) {
    if (itemEl) itemEl.classList.add('busy');
    try {
      const j = await api.load(name);
      if (!j.ok) { alert(j.error || '载入失败'); return; }

      const d = j.data || {};
      const rows = (d.lyrics || []).filter(Boolean);
      if (!rows.length) { alert('这份轴里没有歌词，没什么可导入的'); return; }

      /* 1. 文字类：名字、整体偏移、歌词 */
      state.songName = name;
      state.offsetMs = Number(d.offsetMs) || 0;
      $('#name').value = name;
      $('#lyr').value = rows.map(L => L.text || '').join('\n');
      saveLyrics($('#lyr').value);

      /* 2. 音频：播放和波形全靠它 */
      // 服务端会告诉我们磁盘上的真实文件名（存档里可能写着 xx.MP3，落盘是 xx.mp3）
      const audioName = j.audioFile || d.audio || '';
      state.file = null;
      state.fileName = audioName;
      let audioOk = false;
      if (audioName) {
        player.load(api.audioURL(audioName));
        audioOk = await player.whenReady(6000);
      }
      state.peaks = null;
      if (audioOk) {
        state.dur = player.dur || Number(d.duration) || 0;
        // 波形只是「看得见歌」，算不出来也不挡导入
        fetch(api.audioURL(audioName))
          .then(r => (r.ok ? r.blob() : null))
          .then(b => (b ? computePeaks(b) : null))
          .then(p => { if (p) state.peaks = p; })
          .catch(() => {});
      } else {
        state.dur = Number(d.duration) || 0;
      }

      /* 3. 轴：逐字开口 + 人按 Enter 标的句尾 */
      const lines = buildLines($('#lyr').value);
      const stat = applySavedTaps(lines, d, state.offsetMs);

      state.lines = lines;
      state.pos = 0;
      rebuildSeq(state);
      state.pos = state.seq.length;      // 点都齐了，光标落在末尾，等人自己挑句子改
      state.revLine = 0;                 // 校验屏从头看起（上一首可能停在第 5 句）
      state.pick = null;
      state.stopAt = null;

      state.imported = { name, audioOk, mismatch: false, audio: audioName, stat };

      refreshHint();
      refresh();                          // 时间戳/顺序可能变了，顺手刷一遍

      if (!audioOk) {
        // 不进校验屏：没有音频等于不能听、不能画波形，进去只能干瞪眼
        alert(`《${name}》的轴已经载入（${stat.lines} 句 / ${stat.units} 个字），但音频没找到：\n${audioName || '（存档里没记音频文件名）'}\n\n把这首的音频拖到上面的框里，按「继续改这份轴」就能接着改。`);
        return;
      }

      nav.show('review');
      review().begin();
    } catch (e) {
      alert('载入失败：' + e.message);
    } finally {
      if (itemEl) itemEl.classList.remove('busy');
    }
  }

  reload.addEventListener('click', refresh);

  return { refresh, openSaved };
}
