---
name: lyric-tapper-yashu
description: 本地跑一个网页打轴工具，给 1 分钟以内的歌曲片段打「逐字时间轴」，输出可直接喂给 vibe-knowledge-mv-yashu 的 lyrics（含 words 逐字时间戳）。触发词：启动本地打轴页面、打开打轴页、打轴、逐字时间轴、给歌词打点、改打轴页的 bug。
version: 1.0.0
---

# 本地打轴页（只干一件事：把歌词打成逐字时间轴）

## 0. 边界

| | |
|---|---|
| 输入 | 一段 ≤1 分钟的音频（mp3/wav/m4a/ogg/flac）+ 这段的歌词，一行一句 |
| 输出 | `{ text, start, end, words:[{w,t}] }` 数组，存进 `songs/*.json`，可直接当 MV 技能的 `lyrics` |
| 手段 | **人工打轴**：跟着唱按空格，一个字一下，3–5 分钟打完 10 句 |
| 不做 | 不做自动识别、不做整首歌、不剪音频（切段用户自己先用 ffmpeg 切好） |

为什么是人工：QQ音乐 QRC / 酷狗 KRC 的逐字时间戳是平台的人工资产，拿不到；纯 ASR 识别唱歌会改字。30–60 秒的量人工打最准、零依赖，这也是整个工具存在的理由。

## 1. 启动

**受管后台启动（首选，安全、可控、能看到日志）**

```bash
node C:/Users/Administrator/.workbuddy/skills/lyric-tapper-yashu/server.mjs
```

用后台任务方式跑（不要 `nohup`），启动横幅会打出真实端口，例如：

```
  ┌─────────────────────────────────────────────┐
  │  本地打轴页已启动                           │
  │  http://127.0.0.1:8787/                     │
  │  关闭：在这个窗口按 Ctrl+C                  │
  └─────────────────────────────────────────────┘
  轴会存到：…/lyric-tapper-yashu/songs/
```

- 端口被占（上一次没关干净）会自动 +1，最多试 20 次 —— **以横幅里的端口为准**，不要假定还是 8787。
- 只绑 `127.0.0.1`，不对外。
- 停止：直接停掉该后台任务即可。

**手动启动（用户在终端里自己跑）**

```bash
cd C:/Users/Administrator/.workbuddy/skills/lyric-tapper-yashu
node server.mjs                 # 起来后自动开浏览器
node server.mjs --no-open       # 不自动开浏览器
PORT=9000 node server.mjs       # 指定端口
```

也可以双击目录下的 `启动打轴页.cmd`。

## 2. 人怎么用

1. **载入屏**：拖入音频 → 贴歌词（一行一句，标点照写，标点会挂到前一个字上，不单独占一下）→ 填存档名 → 「开始打轴」。
   - 时长 >62s 会标红提醒，但**不拦**（打长一点也能存，只是 MV 技能只收 28–62s）。
   - 右边列出 `songs/` 里的历史存档，点一条直接接着改。
2. **打轴屏**：从第一个字开始，**跟着唱，唱到哪个字按一下空格**。
   | 键 | 作用 |
   |---|---|
   | `空格` | 打到当前字，前进一个 |
   | `Backspace` | 退一个点，并**把播放位置退到上一个字之前**（好重唱这一下） |
   | `Enter` | 本句剩下没打的字按 0.32s 间隔糊过去（回头在校验屏重打） |
   | `←` `→` | 播放位置挪 0.3 秒 |
   | `R` | 本句重来 |
   | `Esc` | 回载入屏 |
3. **校验屏**：逐句看表格 → 点「播」听这句 → 点某个字 chips 选中，`←` `→` 微调 0.01s（按住 `Shift` 是 0.05s）→ 「重打」整句重来 → 整体偏移滑块对齐节奏 → 交付。
4. **交付三选一**：`保存到 songs/`（存 json）/ `复制 lyrics 片段`（剪贴板，直接粘进 story.json）/ `下载 JSON`。

## 3. 输出格式

```json
{
  "audio": "夜航.mp3",
  "duration": 41.6,
  "offsetMs": 0,
  "lyrics": [
    { "text": "灯一盏一盏", "start": 1.24, "end": 4.83,
      "words": [ {"w":"灯","t":1.24}, {"w":"一","t":1.61}, {"w":"盏","t":1.98}, ... ] }
  ]
}
```

`words` 与 `text` **字符一一对应**（空格位是 `null`），`t` 是相对本段音频起点的秒数。字段细节见 `references/数据格式.md`。

**接到 MV 技能**：`story.json` 的 `lyrics` 直接吃这个数组（`text/start/end/words` 同名字段全对得上），引擎见到 `words` 就按真实轴逐字点亮，没有才退回句内均分。所以打完轴 → 复制 → 粘进 story.json → `build.mjs`，不用手抄任何时间。

## 4. 代码地图（改 bug 先看这张表，别整目录乱翻）

装配入口只有 `web/js/main.js`（37 行）：它建 `ctx`，把三屏挂上。**其余文件都只通过构造参数 `ctx` 拿依赖**。

**服务端**（Node 原生 http，零依赖）

| 文件 | 行 | 管什么 |
|---|---|---|
| `server.mjs` | 14 | 唯一入口，只调 `boot.start()` |
| `server/config.mjs` | 42 | 端口/目录/体积上限/MIME/后缀白名单 —— **改端口、放宽大小改这里** |
| `server/boot.mjs` | 53 | 端口顺延、打横幅、开浏览器 |
| `server/router.mjs` | 26 | 分发。加接口**不用改它** |
| `server/routes/audio.mjs` | 76 | `POST /api/audio` 上传；`GET /songs/*` 音频流（**必须支持 Range**，否则拖进度条失效） |
| `server/routes/lyrics.mjs` | 38 | `POST /api/save`、`GET /api/list`、`GET /api/load` |
| `server/routes/static.mjs` | 24 | 静态文件，一律 `no-store`（改前端刷新就生效） |
| `server/storage/songs.mjs` | 59 | `songs/` 的唯一入口，别处不许拼路径 |
| `server/lib/naming.mjs` | 39 | 名字消毒（`safeBase`）+ 路径穿越防护（`resolveInside`） |
| `server/lib/http.mjs` | 30 | `sendJson` / `readBody`（带体积上限） |

**前端核心层 `web/js/core/`** —— 纯逻辑，不碰 DOM/音频，可在 node 里单测

| 文件 | 行 | 管什么 |
|---|---|---|
| `text.js` | 58 | 歌词切单元：中文一字一单元、英文连串一单元、标点挂到前一个字 |
| `lines.js` | 97 | **轴的领域层**：打点/回退/跳句/重打/一句起止。所有时间算法都在这 |
| `state.js` | 25 | 一个朴素可变对象。视图只读，写入一律走 `lines.js` |
| `audio.js` | 43 | `<audio>` 包一层（`load/seek/play/paused/t/dur`）。以后换 WebAudio 变速只改这 |
| `api.js` | 45 | 所有 `fetch` 都在这里，屏里不写 URL |
| `peaks.js` | 35 | 波形峰值，失败返回 `null`（波形挂了不影响打轴） |
| `screen.js` | 44 | 屏管理器（`register/show/key/tick`） |
| `loop.js` | 20 | 全页唯一一条 rAF |
| `keys.js` | 12 | 全局键绑定；`textarea/input` 里不拦键 |
| `dom.js` | 27 | `$` / `setText`（变了才写）/ `esc` / `fmtClock` |

**视图层 `web/js/view/`**（只管画，不持有状态）

| 文件 | 行 | 管什么 |
|---|---|---|
| `waveform.js` | 93 | 画波形/打点/焦点区；拖动回调只给 0–1 比例 |
| `lineView.js` | 59 | 一行大字的挂载与两种点亮判据 |
| `reviewTable.js` | 75 | 校验屏表格 + 逐字 chips，动作全走回调 |

**屏 `web/js/screen/`**（编排，屏契约 `{ id, el, activate, deactivate?, tick?, onKey? }`）

| 文件 | 行 | 管什么 |
|---|---|---|
| `setup.js` | 168 | 载入屏：选文件、贴歌词、历史存档 |
| `tapping.js` | 171 | 打轴屏：四个动作 + 键盘。**这里不该出现时间计算**，都去 `lines.js` |
| `review.js` | 234 | 校验屏：编排播放/微调/交付，表格与导出都推给别人 |

**导出 `web/js/export/`**：`songJson.js`（纯函数，state → JSON）、`publish.js`（存/复制/下载，共用同一份 `songJson`）。

**样式 `web/css/`**：`app.css` 只是 `@import` 汇总，**不要在这里写样式**；加区域 = 加文件 + 加一行 import。`tokens.css` 里的颜色如果改了，`view/waveform.js` 顶部的 canvas 颜色常量要同步。

## 5. 改 bug 的标准动作

```bash
cd C:/Users/Administrator/.workbuddy/skills/lyric-tapper-yashu

node --test scripts/test-core.mjs   # ① 时间算法有没有被改坏（18 项，0.2 秒）
node scripts/smoke.mjs              # ② 页面还能不能起来（自起服务，1~3 秒）
                                    #    查：静态文件 200、每个 import 都落地、data-ready 出现
node scripts/smoke.mjs --port 8787  #    复用正在跑的服务
```

改完前两条必须都过，再让用户手点。判断「哪个文件该改」的顺序：

1. **时间算错 / 回退位置不对 / 收尾太长** → `core/lines.js` 或 `export/songJson.js`（先写个单测复现）
2. **字为什么亮错了 / 亮早了** → `view/lineView.js`（打轴屏）或引擎的 `updateLyric`（MV 侧）
3. **键盘没反应 / 抢了输入框** → `core/keys.js` + 对应屏的 `onKey`
4. **点不动 / 按钮没反应** → 对应 `view/*.js` 的事件绑定（注意 `e.target.closest('[data-x]')`）
5. **存不上 / 读不到存档 / 拖进度条卡住** → `server/routes/*.js`、`server/storage/songs.mjs`
6. **白屏** → 先跑 `smoke.mjs`，它会指出是哪个 import 断了

拆分红线：单个屏文件超过 250 行就要拆（把「怎么画」推到 `view/`，把「怎么算」推到 `core/`，把「怎么存」推到 `export/`）。现在最大的是 `screen/review.js` 234 行，已经贴线。

## 6. 故障排查

| 现象 | 原因 / 处理 |
|---|---|
| 启动报 `EADDRINUSE` 但没退 | 正常，端口自动 +1，看横幅里的真实端口 |
| 端口试满 20 个还失败 | 上一次的进程没死。让用户杀掉 node 进程，或 `PORT=9000 node server.mjs` |
| 打开是白屏 | 跑 `node scripts/smoke.mjs`，它会报是哪个模块 404 或 `data-boot-error` |
| 改了前端没生效 | 服务端对所有静态文件发 `no-store`，正常情况下刷新即可；还不行就强制刷新（Ctrl+Shift+R） |
| 波形是空的 | `computePeaks` 失败会静默返回 null，不影响打轴；多半是音频编码浏览器解不了，换 mp3 试 |
| 拖进度条跳回去 | `routes/audio.mjs` 的 Range 分支被改坏了 |
| 存档列表不出现 | 看 `songs/` 里有没有 json；`GET /api/list` 直接访问一下看返回 |
| 上传 413 / 断 | `config.mjs` 的 `MAX_AUDIO_BYTES`（默认 25MB）。真需要大文件改这里，别改路由 |
| 打轴时字不跟着亮 | 打轴屏的 `tick` 里 `paint()` 没用当前 `t`；看 `screen/tapping.js` |

## 7. references

- `references/数据格式.md` —— `song.json` 每个字段的含义、`words` 对齐规则、MV 引擎怎么消费它

## 8. 自进化

改了这个工具，回来同步两处，否则下次会按旧地图改错文件：

1. 新增/拆分了文件 → 更新 §4 代码地图（表格里那一行）
2. 修的是「以后还会踩」的坑（不是一次性笔误）→ 加进 §6 故障排查
3. 输出格式有任何字段变化 → 同步 `references/数据格式.md` **并且** 检查 MV 技能的 `assets/papercut.html` 里 `buildLyric()` 是否还认得
