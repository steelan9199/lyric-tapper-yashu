/**
 * 歌词文本切分。打轴的最小单位叫「单元」：
 *   中文 = 一字一个单元（「灯」就是一下）
 *   英文/数字 = 连续字母数字算一个单元（「tonight」是一下，不是一个字母一下）
 *   标点 = 不单独成单元，挂在最近的字上（唱到「了」时「，」跟着亮）
 *
 * 这个文件是纯函数，不碰 DOM、不碰时间，可以直接在 node 里测。
 */

const SPACE = /[\s\u3000]/;
const PUNCT = /[，。、；：！？…—～·「」『』（）()《》〈〉【】\[\]{}"'“”‘’,.!?;:~/\\|]/;
const WORDISH = /[a-zA-Z0-9'’-]/;

export const isSpace = c => SPACE.test(c);
export const isPunct = c => PUNCT.test(c);
export const isWordish = c => WORDISH.test(c);

/** 一行歌词 → { chars, units, charUnit } */
export function tokenize(text) {
  const chars = [...text];
  const units = [];
  const charUnit = new Array(chars.length).fill(-1);

  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    if (isSpace(c) || isPunct(c)) { i++; continue; }

    if (isWordish(c)) {
      let j = i;
      while (j < chars.length && isWordish(chars[j])) j++;
      units.push({ text: chars.slice(i, j).join(''), t: null, chars: [] });
      const ui = units.length - 1;
      for (let k = i; k < j; k++) { charUnit[k] = ui; units[ui].chars.push(k); }
      i = j;
    } else {
      units.push({ text: c, t: null, chars: [i] });
      charUnit[i] = units.length - 1;
      i++;
    }
  }

  // 标点挂到前一个单元；行首标点挂到后一个
  for (let k = 0; k < chars.length; k++) {
    if (charUnit[k] >= 0 || isSpace(chars[k])) continue;
    let ui = -1;
    for (let p = k - 1; p >= 0; p--) if (charUnit[p] >= 0) { ui = charUnit[p]; break; }
    if (ui < 0) for (let p = k + 1; p < chars.length; p++) if (charUnit[p] >= 0) { ui = charUnit[p]; break; }
    charUnit[k] = ui;
  }

  return { chars, units, charUnit };
}

/** 整段歌词 → 非空行数组 */
export function splitLyrics(raw) {
  return String(raw || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}
