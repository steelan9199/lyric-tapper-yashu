/**
 * ① 载入屏：放音频、贴歌词、导入已有项目。
 * 职责只有「把素材凑齐」，不参与打点；导入那摊事在 importPanel.js。
 */
import { $, esc, fmtClock } from '../core/dom.js';
import { buildLines, rebuildSeq } from '../core/lines.js';
import { computePeaks } from '../core/peaks.js';
import { loadLyrics, saveLyrics } from '../core/store.js';
import { createImportPanel } from './importPanel.js';

export function createSetupScreen(ctx) {
  const { state, player, api, nav } = ctx;

  const el = $('#setup');
  const drop = $('#drop');
  const fileIn = $('#file');
  const lyr = $('#lyr');
  const nameIn = $('#name');
  const hint = $('#hint');
  const go = $('#go');

  /** 当前这份轴是「导入来的、歌词还没被改过」吗 —— 决定主按钮是继续还是重开 */
  const sameText = lines => Boolean(state.lines.length)
    && lines.length === state.lines.length
    && lines.every((L, i) => state.lines[i] && state.lines[i].text === L.text);

  const importedTaps = () => Boolean(state.imported && state.lines.length && state.pos > 0);

  /* ── 提示与按钮状态 ── */
  function refreshHint() {
    const lines = buildLines(lyr.value);
    const units = lines.reduce((a, L) => a + L.units.length, 0);
    const hasAudio = Boolean(state.file) || Boolean(state.imported && state.imported.audioOk);
    const imp = importedTaps();

    go.disabled = !(hasAudio && lines.length);
    go.textContent = imp && sameText(lines) ? '继续改这份轴 →' : '开始打轴 →';

    hint.className = 'hint';

    if (imp) {
      const n = state.imported.name;
      if (!sameText(lines)) {
        hint.className = 'hint bad';
        hint.textContent = `导入的《${n}》是按旧歌词打的。歌词改过 → 点按钮会按新歌词从头开始（原来的点作废）`;
        return;
      }
      if (!state.imported.audioOk) {
        hint.className = 'hint bad';
        hint.textContent = `轴已载入《${n}》：${state.lines.length} 句 / ${state.seq.length} 个字，但音频没找到 → 把音频拖进来就能接着改`;
        return;
      }
      if (state.imported.mismatch) {
        hint.className = 'hint bad';
        hint.textContent = `注意：拖进来的音频叫「${state.fileName}」，存档里记的是「${state.imported.audio}」。确认是同一段再点继续，不然点会对不上`;
        return;
      }
      hint.textContent = `已导入《${n}》：${state.lines.length} 句 / ${state.seq.length} 个字，点右边继续改`;
      return;
    }

    if (!hasAudio && !lines.length) hint.textContent = '先放音频，再贴歌词，或者从右边导入已有的轴';
    else if (!hasAudio) hint.textContent = '还差音频';
    else if (!lines.length) hint.textContent = '还差歌词';
    else {
      hint.textContent = `${lines.length} 句 / ${units} 个字，预计 ${Math.ceil(units / 28)} 分钟打完`;
      if (state.dur > 62) {
        hint.className = 'hint bad';
        hint.textContent += ` · 时长 ${state.dur.toFixed(1)}s 超过 62s，MV 技能只收 28–62s`;
      }
    }
  }

  /* ── 选文件 ── */
  async function loadFile(file) {
    state.file = file;
    state.fileName = file.name;
    state.songName = file.name.replace(/\.[^.]+$/, '');
    nameIn.value = state.songName;

    // 导入存档时音频丢了，用户会在这里补一个 —— 补上就算接好了，轴还在内存里
    if (state.imported) {
      state.imported.audioOk = true;
      const base = s => String(s || '').replace(/\.[^.]+$/, '').toLowerCase();
      state.imported.mismatch = Boolean(state.imported.audio)
        && base(state.imported.audio) !== base(file.name);
    }

    player.load(URL.createObjectURL(file));
    drop.classList.add('ok');
    drop.innerHTML = `<div class="drop-t">♪ ${esc(file.name)}</div><div class="drop-s" id="dropS">读取中…</div>`;

    const ok = await player.whenReady(8000);
    state.dur = ok ? player.dur : 0;
    const ds = $('#dropS');
    if (ds) {
      ds.textContent = ok
        ? `${fmtClock(state.dur)} / ${state.dur.toFixed(2)}s · ${(file.size / 1048576).toFixed(2)} MB`
        : '这个文件读不出时长，换一个试试';
    }

    computePeaks(file).then(p => { state.peaks = p; });

    // 音频顺手存进 songs/，MV 技能那边按名字就能取到同一段
    // 落盘时服务端会把后缀归一成小写（xx.MP3 → xx.mp3），所以以它返回的名字为准，
    // 否则存档里记着一个磁盘上不存在的名字，下次导入就找不到音频了。
    api.uploadAudio(file)
      .then(r => { if (r && r.ok && r.file) state.fileName = r.file; })
      .catch(e => console.warn('音频保存失败：' + e.message));

    refreshHint();
  }

  const onPick = f => { if (f) loadFile(f); };
  drop.addEventListener('click', () => fileIn.click());
  drop.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); }
  });
  ['dragenter', 'dragover'].forEach(k => drop.addEventListener(k, e => {
    e.preventDefault();
    drop.classList.add('hot');
  }));
  ['dragleave', 'drop'].forEach(k => drop.addEventListener(k, e => {
    e.preventDefault();
    drop.classList.remove('hot');
  }));
  drop.addEventListener('drop', e => onPick(e.dataTransfer.files[0]));
  fileIn.addEventListener('change', () => onPick(fileIn.files[0]));

  /* ── 歌词记忆：贴过一次就不用再贴 ── */
  let saveTimer = 0;
  const remember = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveLyrics(lyr.value), 250);
  };

  lyr.addEventListener('input', () => { refreshHint(); remember(); });

  $('#lyrClear').addEventListener('click', () => {
    lyr.value = '';
    saveLyrics('');
    refreshHint();
    lyr.focus();
  });

  // 进来先回填上次的歌词（用户已经动过就不覆盖）
  if (!lyr.value.trim()) {
    const kept = loadLyrics();
    if (kept) { lyr.value = kept; refreshHint(); }
  }

  /* ── 导入已有项目（列表 + 接回来，都在 importPanel 里） ── */
  const importer = createImportPanel({
    state, player, api, nav,
    refreshHint,
    review: () => ctx.review,
  });

  /* ── 开始打轴 / 继续改 ── */
  go.addEventListener('click', () => {
    const lines = buildLines(lyr.value);
    if (!lines.length) return;

    // 导入后没动歌词：直接回到那份轴上接着改。
    // 这里绝不能重建 lines —— 重建等于把已经打好的点全删了。
    if (importedTaps() && sameText(lines)) {
      nav.show('review');
      ctx.review.begin();
      return;
    }

    // 已经有进度还点「开始打轴」= 重建 lines，已打的点全作废且不可撤销。
    // 改了歌词更要命（字符都变了，救不回来），所以先问一句。
    if (state.pos > 0 && !confirm('重新开始会清空已经打好的轴（不可撤销）。\n\n继续？')) return;

    state.lines = lines;
    state.offsetMs = 0;
    state.pos = 0;
    state.pick = null;
    state.stopAt = null;
    state.imported = null;
    state.songName = (nameIn.value || state.songName || 'song').trim();
    rebuildSeq(state);

    nav.show('tapping');
    ctx.tapping.begin();
  });

  return {
    id: 'setup',
    el,
    activate() {
      refreshHint();
      importer.refresh();
    },
    onKey() {
      return false;  // 载入屏不占用键盘
    },
  };
}
