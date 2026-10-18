/**
 * ① 载入屏：放音频、贴歌词、选存档。
 * 职责只有「把三样东西凑齐」，不参与打点。
 */
import { $, esc, fmtClock } from '../core/dom.js';
import { buildLines, rebuildSeq } from '../core/lines.js';
import { computePeaks } from '../core/peaks.js';
import { loadLyrics, saveLyrics } from '../core/store.js';

export function createSetupScreen(ctx) {
  const { state, player, api, nav } = ctx;

  const el = $('#setup');
  const drop = $('#drop');
  const fileIn = $('#file');
  const lyr = $('#lyr');
  const nameIn = $('#name');
  const hint = $('#hint');
  const go = $('#go');

  /* ── 提示与按钮状态 ── */
  function refreshHint() {
    const lines = buildLines(lyr.value);
    const units = lines.reduce((a, L) => a + L.units.length, 0);
    go.disabled = !(state.file && lines.length);

    hint.className = 'hint';
    if (!state.file && !lines.length) hint.textContent = '先放音频，再贴歌词';
    else if (!state.file) hint.textContent = '还差音频';
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

    player.load(URL.createObjectURL(file));
    drop.classList.add('ok');
    drop.innerHTML = `<div class="drop-t">♪ ${esc(file.name)}</div><div class="drop-s" id="dropS">读取中…</div>`;

    await player.whenReady();
    state.dur = player.dur;
    const ds = $('#dropS');
    if (ds) {
      ds.textContent = `${fmtClock(state.dur)} / ${state.dur.toFixed(2)}s · ${(file.size / 1048576).toFixed(2)} MB`;
    }

    computePeaks(file).then(p => { state.peaks = p; });

    // 音频顺手存进 songs/，MV 技能那边按名字就能取到同一段
    api.uploadAudio(file).catch(e => console.warn('音频保存失败：' + e.message));

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

  /* ── 已有存档 ── */
  async function loadResume() {
    const box = $('#resume');
    try {
      const j = await api.list();
      if (!j.ok || !j.items.length) { box.innerHTML = '<em>还没有存过的轴</em>'; return; }
      box.innerHTML = '';
      j.items.slice(0, 20).forEach(it => {
        const d = document.createElement('div');
        d.className = 'rItem';
        d.innerHTML = `<span class="rName">${esc(it.name)}</span>`
          + `<span>${new Date(it.mtime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>`;
        d.onclick = () => openSaved(it.name);
        box.appendChild(d);
      });
    } catch {
      box.innerHTML = '<em>读不到存档列表</em>';
    }
  }

  async function openSaved(name) {
    try {
      const j = await api.load(name);
      if (!j.ok) return alert(j.error);

      const d = j.data;
      state.songName = name;
      state.offsetMs = d.offsetMs || 0;
      nameIn.value = name;
      lyr.value = (d.lyrics || []).map(L => L.text).join('\n');
      saveLyrics(lyr.value);
      if (d.audio) {
        state.fileName = d.audio;
        player.load(api.audioURL(d.audio));
      }
      state.dur = d.duration || 0;

      const lines = buildLines(lyr.value);
      (d.lyrics || []).forEach((src, li) => {
        const L = lines[li];
        if (!L) return;
        const w = src.words || [];
        L.units.forEach(u => {
          const hit = w[u.chars[0]];
          if (hit && Number.isFinite(+hit.t)) u.t = +hit.t - state.offsetMs / 1000;
        });
      });

      state.lines = lines;
      rebuildSeq(state);
      state.pos = state.seq.length;   // 已经有轴了，定位在末尾，等人自己挑句子改
      refreshHint();
      nav.show('review');
      ctx.review.begin();
    } catch (e) {
      alert('载入失败：' + e.message);
    }
  }

  /* ── 开始打轴 ── */
  go.addEventListener('click', () => {
    const lines = buildLines(lyr.value);
    if (!lines.length) return;

    state.lines = lines;
    state.offsetMs = 0;
    state.pos = 0;
    state.pick = null;
    state.stopAt = null;
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
      loadResume();
    },
    onKey() {
      return false;  // 载入屏不占用键盘
    },
  };
}
