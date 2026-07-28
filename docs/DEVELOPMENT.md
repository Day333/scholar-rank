# 开发说明

面向想改代码、补数据或提 PR 的人。只是想装来用的话看 [README](../README.md) 就够了。

## 目录结构

```
manifest.json                 MV3 清单
icons/                        由 tools/make-icons.mjs 生成
src/
  lib/normalize.js            刊名归一化与候选名生成（浏览器 / Node 共用）
  lib/ranking.js              查表与徽章生成（浏览器 / Node 共用）
  lib/settings.js             设置项默认值、外观风格清单
  data/ccf.json               CCF 目录（构建产物）
  data/core.json              CORE 会议分级（构建产物）
  data/journals.json          分区 / IF / EI 合并数据集（构建产物）
  data/aliases.json           Scholar 写法 → CCF/CORE 简称的人工别名表
  data/tags.json              自定义标记（默认含「ML三大顶会」「数据库四大」）
  content/scholar.js          页面注入
  content/badges.css          徽章样式
  options/                    设置页
  popup/                      工具栏弹窗
tools/
  build-ccf.mjs               抓取并解析 ccf.atom.im
  build-core.mjs              抓取 CORE 门户的 Export 接口
  build-journals.mjs          抓取并合并分区表 / JCR / 预警 / EI
  make-icons.mjs              手写 PNG 生成图标
  selftest.mjs                匹配回归测试
  lookup.mjs                  命令行单条查询
  serve.mjs                   本地预览服务器
test/
  fixture.html                离线 DOM 预览页
  chrome-shim.js              预览用的最小 chrome.* 垫片
```

## 匹配是怎么做的

Scholar 上的出处写法非常不统一，所以匹配分五步，见
[src/lib/normalize.js](../src/lib/normalize.js) 与 [src/lib/ranking.js](../src/lib/ranking.js)：

1. **候选名生成** —— 剥掉卷期页码、`Proceedings of the`、届次与年份前缀、
   IEEE 风格的前导「简称+年份」（`ICASSP 2026-2026 IEEE International Conference on …`）、尾部括号，
   按逗号切段后生成一组由长到短的候选串；同时抽出括号里和开头的会议简称。
2. **归一化** —— 去符号、展开常见缩写（`Trans.`→`transactions`、`J.`→`journal`…）、
   丢掉 `the/of/and` 一类虚词、去空格，得到查表 key。建库和查库共用同一份代码，key 不会漂移。
3. **查表** —— 会议先按归一化全称精确查，再按简称查（全称比三四个字母的简称可靠得多，
   简称在 CCF 与 CORE 之间还会撞车，比如 `ATC` 两边指的不是同一个会）；期刊按归一化全称查。
4. **截断兜底** —— Scholar 会把过长的出处截成 `… `，此时全称一定对不上。检测到省略号就退到
   **唯一前缀匹配**：找出所有以该 key 开头的条目，只有唯一命中才认。截到只剩
   `IEEE Transactions on …` 这种共同前缀时前缀不唯一，宁可不出徽章也不瞎猜。
5. **模糊兜底** —— 会议全称仍然对不上时，用 token 集合包含度（≥0.85）做模糊匹配；
   另有 [src/data/aliases.json](../src/data/aliases.json) 手工兜住
   `Advances in Neural Information Processing Systems → NeurIPS`、
   `Proceedings of the ACM on Management of Data → SIGMOD` 这类硬骨头。

CCF 与 CORE 共用同一套索引和匹配逻辑，别名表也共用 —— `names` / `acronyms` 里填的是 CCF 简称，
`ccfToCore` 负责翻译成 CORE 的写法（`SIGKDD → KDD`、`S&P → SP`、`ACM MM → ACMMM` 等），
`coreNames` 放只对 CORE 生效的别名（CCF 目录里没有的会议，如 WACV、CoRL）。
同一简称对应多个会议时（`FSE` 在两套目录里都既是软件工程也是密码学会议），
会用别名里的全称跟各候选比 token 重合度挑最贴的那个。

**发现漏标 / 错标，绝大多数情况下只要往 `aliases.json` 里补一行就够了**，不用动代码。

## 自定义标记

[src/data/tags.json](../src/data/tags.json) 里的分组命中后排在所有徽章最前面，并且比其它徽章加粗一档。
加一组只要追加一项：

```json
{
  "id": "sec-top4",
  "label": "安全四大",
  "desc": "S&P / CCS / USENIX Security / NDSS",
  "cls": "sr-tag-violet",
  "ccf": ["S&P", "CCS", "USENIX Security", "NDSS"],
  "core": ["SP", "CCS", "USENIX-Security", "NDSS"],
  "names": []
}
```

`ccf` / `core` 填两套目录里的简称（两边简称不一样时各填各的），`names` 填出处全称
（归一化后匹配，用来兜住两套目录都没收的会议），三者任一命中即算。
`cls` 可选 `sr-tag-rose` / `sr-tag-bronze` / `sr-tag-amber` / `sr-tag-violet` / `sr-tag-slate`。
改完刷新扩展即可，不需要重新构建数据。

## 外观风格

样式分成两层，见 [src/content/badges.css](../src/content/badges.css)：每种徽章只声明
`--sr-tint`（浅色底）和 `--sr-key`（主色）两个变量，风格类 `.sr-theme-*` 决定这两个变量怎么用。

**加新风格只要追加一段 `.sr-theme-xxx` 规则，再往 [src/lib/settings.js](../src/lib/settings.js)
的 `THEMES` 里加一行**，不用碰任何一种徽章的配色，设置页的选择卡和弹窗下拉框都会自动多出一项。

## 测试

```bash
npm test                  # 62 项断言，含学位论文/截断歧义/标记误报的负向用例
npm run probe -- "IEEE Internet of Things Journal 11 (3), 4000-4012"
```

`selftest.mjs` 里有几类断言：`CASES`（必须出现的徽章）、`BYLINES`（搜索结果页 `.gs_a`
整行文本走一遍拆分再查表）、`FORBIDDEN`（不允许出现的徽章，防止改动引入误报）、
`NEGATIVE`（完全不该出徽章）。别名表里指向不存在简称的条目也会直接判失败。

**改匹配逻辑或补别名后请跑一遍**，并把新场景补进对应的列表。

## 本地预览

不装扩展、不打开 Scholar 也能看渲染效果：

```bash
npm run serve
```

| 预览地址 | 内容 |
| --- | --- |
| <http://localhost:8123/test/fixture.html> | 复刻 Scholar 论文列表 / 搜索结果的 DOM，跑真实的 content script |
| <http://localhost:8123/src/options/options.html?shim=1> | 设置页 |
| <http://localhost:8123/src/popup/popup.html?shim=1> | 工具栏弹窗 |

`?shim=1` 会让预览服务器注入 `test/chrome-shim.js`（一套最小的假 `chrome.*` API，
用 `localStorage` 顶替 `chrome.storage.sync`），只在预览时生效，不参与打包。

预览地址还支持 `?theme=` / `?bold=1` / `?scale=` 指定外观，`?bare=1` 只留论文列表
（README 里的效果图就是这么生成的）：

```
http://localhost:8123/test/fixture.html?theme=outline
http://localhost:8123/test/fixture.html?theme=solid&bold=1&scale=115
```

## 更新数据

各数据源都由构建脚本抓取，随时可以重新生成：

```bash
npm run build             # 全量重建（CCF + CORE + 期刊数据集 + 图标）
npm run build:ccf         # 重新抓取 ccf.atom.im
npm run build:core        # 重新抓取 CORE 会议分级
npm run build:journals    # 重新抓取分区表 / JCR / 预警名单 / EI 目录
```

`build-core.mjs` 用的是 CORE 门户搜索页上那个 Export 按钮背后的 GET 接口，一次性导出全量，
不需要翻页。换版本设环境变量即可（门户的 Source 下拉里能看到所有版本号）：

```bash
CORE_SOURCE=CORE2023 npm run build:core
```

`build-journals.mjs` 会把原始文件缓存到 `tools/.cache/`，删掉该目录即可强制重新下载；
换数据源或换年份时改脚本顶部的 `SOURCES` 即可。

几个已知的数据现状：

- **EI 目录是 2019 年版本**，公开可得的最新完整列表就到这里。拿到新版 Compendex source list 后，
  整理成一行一个刊名的文本，替换 `SOURCES.ei` 即可。
- 中科院分区表自 2026 年起不再更新发布，2025 版是最后一版。
- CORE 里 `National: China`、`Regional`、`Unranked`、`Multiconference` 这类不代表学术水平的等级
  不出徽章（ICASSP 在 ICORE2026 里就是 `Multiconference`）；`Australasian B/C` 显示为 `CORE 澳新B`。
