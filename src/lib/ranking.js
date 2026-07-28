/**
 * 分级查询核心：把一条 Google Scholar 的「出处」字符串解析成一组徽章。
 *
 * 与 normalize.js 一样，挂在 globalThis 上，浏览器扩展与 tools/ 下的脚本共用。
 */
(function (root) {
  'use strict';

  const { normalizeName, venueCandidates } = root.SRNorm;

  // 与 normalizeName 保持同一套切词规则，但保留 token 便于做模糊匹配。
  function tokensOf(name) {
    const raw = String(name || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (!raw) return [];
    const stop = new Set(['the', 'of', 'a', 'an', 'and', 'for', 'on', 'in']);
    return raw.split(' ').filter((t) => t && !stop.has(t));
  }

  const DEFAULTS = {
    showPreprint: true, // 预印本（arXiv / bioRxiv …），提示未经同行评审
    showTags: true,     // 自定义标记（如「ML三大顶会」）
    showCcf: true,
    showCore: true,     // CORE 会议分级（A*/A/B/C）
    showCas: true,      // 中科院分区（升级版）
    showTop: true,      // 中科院 TOP 期刊
    showEi: true,
    showIf: true,
    showJcr: false,     // JCR 分区 Q1-Q4
    showWarn: true,     // 国际期刊预警名单
    minKeyLength: 5,    // 归一化后短于此长度的候选名不参与匹配，避免误命中
    minPrefixLength: 14, // 截断前缀匹配要求的最小 key 长度，比精确匹配严一些
    fuzzyConf: true,    // 会议全称对不上时是否退化到 token 包含度匹配
  };

  /** CORE 的等级里只有这几档代表学术水平，其余（National/Regional/Unranked）不出徽章。 */
  const CORE_BADGE = {
    'A*': { text: 'A*', slug: 'astar' },
    A: { text: 'A', slug: 'a' },
    B: { text: 'B', slug: 'b' },
    C: { text: 'C', slug: 'c' },
    'Australasian A': { text: '澳新A', slug: 'aus' },
    'Australasian B': { text: '澳新B', slug: 'aus' },
    'Australasian C': { text: '澳新C', slug: 'aus' },
  };

  class Ranking {
    /**
     * @param {{ccf:object, core?:object, journals:object, aliases?:object, tags?:object}} data 各数据文件的内容
     * @param {object} [options]
     */
    constructor(data, options) {
      const aliasData = data.aliases || {};
      this.options = Object.assign({}, DEFAULTS, options);

      const journalData = data.journals;
      this.journals = (journalData && journalData.journals) || {};
      this.journalMeta = { generatedAt: journalData && journalData.generatedAt, count: journalData && journalData.count };
      this.ccfMeta = { version: data.ccf && data.ccf.version, count: data.ccf && data.ccf.count };
      this.coreMeta = { version: data.core && data.core.version, count: data.core && data.core.count };

      // 两套会议目录用同一套索引结构，只是别名表要先把 CCF 简称翻译成对方的简称。
      this.missingAliases = [];
      this.ccf = this.buildConfIndex(data.ccf, aliasData, null, true);
      this.core = this.buildConfIndex(data.core, aliasData, aliasData.ccfToCore || {}, false, aliasData.coreNames);

      // 自定义标记：把简称 / 全称都摊平成集合，查的时候一次比对。
      this.tags = ((data.tags && data.tags.groups) || []).map((g) => ({
        id: g.id,
        label: g.label,
        desc: g.desc || '',
        cls: g.cls || 'sr-tag-rose',
        ccf: new Set((g.ccf || []).map((s) => s.toUpperCase())),
        core: new Set((g.core || []).map((s) => s.toUpperCase())),
        nameKeys: new Set((g.names || []).map(normalizeName).filter(Boolean)),
      }));

      this.cache = new Map();
    }

    /**
     * 建立一套会议索引：简称表 + 归一化全称表 + 模糊匹配用的 token 集合。
     * @param {object} confData     ccf.json / core.json 的内容
     * @param {object} aliasData    aliases.json
     * @param {object|null} abbrMap 把 aliases 里的 CCF 简称翻译成本目录简称；null 表示不翻译
     * @param {boolean} report      通用别名指向的简称不存在时是否记进 missingAliases
     * @param {object} [extraNames] 只对本目录生效的别名（简称直接用本目录的写法，不做翻译）
     */
    buildConfIndex(confData, aliasData, abbrMap, report, extraNames) {
      const byAbbr = new Map();
      const byAbbrAll = new Map();   // 同一简称可能对应多个会议（如 FSE 有软工和密码学两个）
      const byKey = new Map();
      const fuzzy = [];
      const addKey = (name, entry) => {
        const key = normalizeName(name);
        if (key && key.length >= 4 && !byKey.has(key)) byKey.set(key, entry);
      };

      for (const e of (confData && confData.entries) || []) {
        const abbr = (e.abbr || '').toUpperCase();
        if (abbr && !byAbbr.has(abbr)) byAbbr.set(abbr, e);
        if (abbr) {
          if (!byAbbrAll.has(abbr)) byAbbrAll.set(abbr, []);
          byAbbrAll.get(abbr).push(e);
        }
        addKey(e.name, e);
        // CORE 的条目名常带后缀说明，如 "Advances in ... (was NIPS)"，去掉再索引一次。
        const bare = String(e.name || '').replace(/\s*\([^()]*\)\s*$/, '');
        if (bare !== e.name) addKey(bare, e);
        // 简称本身也可能被当成刊名写在出处里（如 "TOSEM"）
        addKey(e.abbr, e);
        const toks = tokensOf(e.name);
        if (toks.length >= 4) fuzzy.push({ entry: e, set: new Set(toks) });
      }

      // 简称撞车时，用别名里的全称跟各候选比 token 重合度，挑最贴的那个。
      const resolve = (abbr, hintName) => {
        const target = abbrMap ? (abbrMap[abbr] ?? abbr) : abbr;
        const list = byAbbrAll.get(String(target).toUpperCase());
        if (!list || !list.length) return null;
        if (list.length === 1 || !hintName) return list[0];
        const set = new Set(tokensOf(hintName));
        let best = list[0];
        let bestScore = -1;
        for (const e of list) {
          const score = Ranking.containment(set, new Set(tokensOf(e.name)));
          if (score > bestScore) { bestScore = score; best = e; }
        }
        return best;
      };

      for (const [name, abbr] of Object.entries(aliasData.names || {})) {
        const e = resolve(abbr, name);
        if (!e) { if (report) this.missingAliases.push(`names/${name} -> ${abbr}`); continue; }
        const key = normalizeName(name);
        if (key) byKey.set(key, e);
      }
      for (const [from, abbr] of Object.entries(aliasData.acronyms || {})) {
        const e = resolve(abbr, null);
        if (!e) { if (report) this.missingAliases.push(`acronyms/${from} -> ${abbr}`); continue; }
        if (!byAbbr.has(from.toUpperCase())) byAbbr.set(from.toUpperCase(), e);
      }
      // 本目录专属别名：简称已经是本目录的写法，不经过 abbrMap，且始终校验。
      for (const [name, abbr] of Object.entries(extraNames || {})) {
        const list = byAbbrAll.get(String(abbr).toUpperCase());
        if (!list || !list.length) { this.missingAliases.push(`coreNames/${name} -> ${abbr}`); continue; }
        const key = normalizeName(name);
        if (key) byKey.set(key, list[0]);
      }

      return { byAbbr, byKey, fuzzy };
    }

    /** token 集合包含度：|交集| / |较小集合| */
    static containment(a, b) {
      const [small, big] = a.size <= b.size ? [a, b] : [b, a];
      let hit = 0;
      for (const t of small) if (big.has(t)) hit++;
      return hit / small.size;
    }

    /**
     * 被截断的出处（Scholar 用 … 省略了后半段）没法精确匹配，退而求其次：
     * 找出所有以该 key 开头的条目，唯一时才认。
     * @param {Iterable<[string, object]>} pairs key -> 条目
     */
    static uniquePrefixMatch(pairs, key) {
      let hit = null;
      for (const [k, e] of pairs) {
        if (k.length <= key.length || !k.startsWith(key)) continue;
        if (hit && hit !== e) return null;   // 前缀不唯一，宁可不认
        hit = e;
      }
      return hit;
    }

    /**
     * 在一套会议索引里查。顺序是「全称精确 → 简称 → 截断前缀 → 全称模糊」——
     * 全称比三四个字母的简称可靠得多，简称在两套目录之间还会撞车（如 ATC）。
     */
    findConf(index, names, acronyms, truncated) {
      if (!index) return null;
      for (const n of names) {
        const key = normalizeName(n);
        if (key.length < this.options.minKeyLength) continue;
        const e = index.byKey.get(key);
        if (e) return { entry: e, via: '全称精确匹配' };
      }
      for (const a of acronyms) {
        const e = index.byAbbr.get(a);
        if (e) return { entry: e, via: `简称 ${a}` };
      }
      if (truncated) {
        for (const n of names) {
          const key = normalizeName(n);
          if (key.length < this.options.minPrefixLength) continue;
          const e = Ranking.uniquePrefixMatch(index.byKey, key);
          if (e) return { entry: e, via: '截断前缀匹配' };
        }
      }
      if (!this.options.fuzzyConf) return null;
      // 会议名在 Scholar 上常带届次 / 主办方前后缀，退化到 token 包含度匹配。
      let best = null;
      for (const n of names.slice(0, 6)) {
        const set = new Set(tokensOf(n));
        if (set.size < 4) continue;
        for (const cand of index.fuzzy) {
          const score = Ranking.containment(set, cand.set);
          if (score >= 0.85 && (!best || score > best.score)) best = { entry: cand.entry, score, via: '全称模糊匹配' };
        }
        if (best && best.score === 1) break;
      }
      return best;
    }

    findJournal(names, truncated) {
      for (const n of names) {
        const key = normalizeName(n);
        if (key.length < this.options.minKeyLength) continue;
        const rec = this.journals[key];
        if (rec) return { entry: rec, matchedName: n, via: '全称精确匹配' };
      }
      if (!truncated) return null;
      if (!this.journalPairs) this.journalPairs = Object.entries(this.journals);
      for (const n of names) {
        const key = normalizeName(n);
        if (key.length < this.options.minPrefixLength) continue;
        const rec = Ranking.uniquePrefixMatch(this.journalPairs, key);
        if (rec) return { entry: rec, matchedName: rec.n || n, via: '截断前缀匹配' };
      }
      return null;
    }

    /** 命中哪些自定义标记：CCF 简称、CORE 简称、候选全称，任一命中即算。 */
    findTags(names, ccfEntry, coreEntry) {
      if (!this.tags.length) return [];
      const ccfAbbr = ccfEntry && String(ccfEntry.abbr || '').toUpperCase();
      const coreAbbr = coreEntry && String(coreEntry.abbr || '').toUpperCase();
      const keys = names.map(normalizeName).filter(Boolean);
      return this.tags.filter((g) =>
        (ccfAbbr && g.ccf.has(ccfAbbr))
        || (coreAbbr && g.core.has(coreAbbr))
        || keys.some((k) => g.nameKeys.has(k)));
    }

    /**
     * @param {string} venue Google Scholar 上的出处原文
     * @returns {{kind:string, ccf?:object, core?:object, journal?:object, matchedName?:string, via?:string}}
     */
    lookup(venue) {
      const raw = String(venue || '').trim();
      if (this.cache.has(raw)) return this.cache.get(raw);

      const { names, acronyms, kind, truncated, preprintName } = venueCandidates(raw);
      const result = { kind, raw, truncated, preprintName };
      if (kind === 'normal') {
        const ccf = this.findConf(this.ccf, names, acronyms, truncated);
        if (ccf) { result.ccf = ccf.entry; result.via = ccf.via; }
        const core = this.findConf(this.core, names, acronyms, truncated);
        if (core) { result.core = core.entry; result.coreVia = core.via; }
        const jr = this.findJournal(names, truncated);
        if (jr) { result.journal = jr.entry; result.matchedName = jr.matchedName; result.via = result.via || jr.via; }
        result.tags = this.findTags(names, result.ccf, result.core);
        if (!result.matchedName) {
          const hit = ccf || core;
          if (hit) result.matchedName = hit.entry.abbr || hit.entry.name;
          if (!result.via && core) result.via = core.via;
        }
      }
      this.cache.set(raw, result);
      return result;
    }

    /**
     * 把查询结果转成待渲染的徽章列表。
     * @returns {Array<{key:string, text:string, cls:string, title:string}>}
     */
    badges(result) {
      const o = this.options;
      const out = [];
      if (!result) return out;

      // 预印本不参与分级，但单独标一下：它意味着还没经过同行评审。
      if (result.kind === 'preprint') {
        if (o.showPreprint) {
          out.push({
            key: 'preprint',
            text: result.preprintName || '预印本',
            cls: 'sr-preprint',
            title: `预印本${result.preprintName ? `（${result.preprintName}）` : ''}\n未经同行评审，不参与分级`,
          });
        }
        return out;
      }
      if (result.kind !== 'normal') return out;

      if (o.showTags) {
        for (const t of result.tags || []) {
          out.push({
            key: `tag:${t.id}`,
            text: t.label,
            cls: `sr-tag ${t.cls}`,
            title: t.desc ? `${t.label}\n${t.desc}` : t.label,
          });
        }
      }

      const ccf = result.ccf;
      if (o.showCcf && ccf) {
        out.push({
          key: 'ccf',
          text: `CCF ${ccf.rank}`,
          cls: `sr-ccf sr-ccf-${ccf.rank.toLowerCase()}`,
          title: `CCF ${ccf.rank} 类${ccf.type === 'journal' ? '期刊' : '会议'}\n${ccf.abbr} — ${ccf.name}\n领域：${ccf.field}`,
        });
      }

      const core = result.core;
      if (o.showCore && core && CORE_BADGE[core.rank]) {
        const b = CORE_BADGE[core.rank];
        const field = core.field ? `\n领域：${core.field}` : '';
        out.push({
          key: 'core',
          text: `CORE ${b.text}`,
          cls: `sr-core sr-core-${b.slug}`,
          title: `CORE ${core.rank}（${core.source || 'CORE'}）\n${core.abbr} — ${core.name}${field}`,
        });
      }

      const j = result.journal;
      if (!j) return out;

      if (o.showTop && j.top && j.cat) {
        out.push({
          key: 'top',
          text: `${j.cat}TOP`,
          cls: 'sr-top',
          title: `中科院分区表升级版：${j.cat} TOP 期刊`,
        });
      }
      if (o.showEi && j.ei) {
        out.push({ key: 'ei', text: 'EI检索', cls: 'sr-ei', title: 'EI Compendex 收录（目录版本见设置页）' });
      }
      if (o.showCas && j.zone && j.cat) {
        const sub = j.sub ? `\n小类：${j.sub[0]} ${j.sub[1]}区` : '';
        out.push({
          key: 'cas',
          text: `SCI升级版 ${j.cat}${j.zone}区`,
          cls: `sr-cas sr-zone-${j.zone}`,
          title: `中科院分区表升级版 2025\n大类：${j.cat} ${j.zone}区${sub}\n收录：${j.wos || '—'}`,
        });
      }
      if (o.showJcr && j.q) {
        out.push({ key: 'jcr', text: `JCR ${j.q}`, cls: `sr-jcr sr-${j.q.toLowerCase()}`, title: `JCR 2025 分区 ${j.q}` });
      }
      if (o.showIf && j.if != null) {
        out.push({ key: 'if', text: `IF ${j.if}`, cls: 'sr-if', title: `JCR 2025 影响因子 ${j.if}` });
      }
      if (o.showWarn && j.warn) {
        out.push({ key: 'warn', text: `预警 ${j.warn}`, cls: 'sr-warn', title: `国际期刊预警名单 2025：${j.warn}` });
      }
      return out;
    }
  }

  Ranking.DEFAULTS = DEFAULTS;
  root.SRRanking = Ranking;
})(typeof globalThis !== 'undefined' ? globalThis : this);
