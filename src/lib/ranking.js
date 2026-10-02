/**
 * 分级查询核心：把一条 Google Scholar 的「出处」字符串解析成一组徽章。
 *
 * 与 normalize.js 一样，挂在 globalThis 上，浏览器扩展与 tools/ 下的脚本共用。
 */
(function (root) {
  'use strict';

  const { normalizeName, nameTokens, venueCandidates } = root.SRNorm;

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

  // 这些词通常表示主会的二级轨道，不能继承主会等级。若被匹配条目的正式名称本身
  // 也包含同一标记（例如 IWQoS / HotOS），则说明它本来就是独立收录的 workshop，予以保留。
  const SECONDARY_TRACK_MARKERS = [
    { raw: /\bworkshops?\b/i, official: /\bworkshops?\b/i, label: 'workshop' },
    { raw: /\bfindings\b/i, official: /\bfindings\b/i, label: 'findings' },
    { raw: /\bcompanion\b/i, official: /\bcompanion\b/i, label: 'companion' },
    { raw: /\b(?:demo|demonstration)s?(?:\s+track)?\b/i, official: /\b(?:demo|demonstration)s?\b/i, label: 'demo' },
    { raw: /\bextended\s+abstracts?\b/i, official: /\bextended\s+abstracts?\b/i, label: 'extended abstracts' },
    { raw: /\bdoctoral\s+consortium\b/i, official: /\bdoctoral\s+consortium\b/i, label: 'doctoral consortium' },
    { raw: /\bshort\s+papers?\b/i, official: /\bshort\s+papers?\b/i, label: 'short papers' },
    { raw: /\badjunct\b/i, official: /\badjunct\b/i, label: 'adjunct' },
  ];

  // CCF 的 HotStorage 正式条目名称省略了 “Workshop”，但它本身就是独立收录会议。
  const OFFICIAL_WORKSHOP_EXCEPTIONS = new Set(['HOTSTORAGE']);

  function secondaryTrackReason(raw, entry) {
    if (!entry) return null;
    const officialName = String(entry.name || '');
    const abbr = String(entry.abbr || '').toUpperCase();
    for (const marker of SECONDARY_TRACK_MARKERS) {
      if (!marker.raw.test(raw)) continue;
      if (marker.official.test(officialName)) continue;
      if (marker.label === 'workshop' && OFFICIAL_WORKSHOP_EXCEPTIONS.has(abbr)) continue;
      return marker.label;
    }
    return null;
  }

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
      const named = [];              // [名称原文, 条目]，开头被截断的出处要拿片段去名称内部找
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
        named.push([bare, e]);
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
        named.push([name, e]);
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
        named.push([name, list[0]]);
      }

      return {
        byAbbr, byKey, fuzzy,
        prefixPairs: Ranking.prefixPairs(byKey),
        // CCF 目录里混着期刊（type=journal）；CORE 只有会议，没有 type 字段。
        infixItems: Ranking.infixItems(named, (e) => e.type === 'journal'),
      };
    }

    /**
     * 片段匹配用的索引：保留虚词的 token 序列。
     * minStart 是片段在名称里允许出现的最早位置——期刊名前面不会再套别的东西，开头被截掉
     * 说明片段前面至少还有一个词；会议出处常带 "Proceedings of the 29th" 这类包装，
     * 被截掉的可能只是包装，所以允许从名称第一个词开始。
     * @param {Iterable<[string, object]>} pairs 名称原文 -> 条目
     * @param {(entry:object)=>boolean} isJournal
     */
    static infixItems(pairs, isJournal) {
      const out = [];
      for (const [name, entry] of pairs) {
        const tokens = nameTokens(name);
        if (tokens.length) out.push({ tokens, entry, minStart: isJournal(entry) ? 1 : 0 });
      }
      return out;
    }

    /**
     * 截断匹配同时考虑省略出版机构/刊物前缀的名称。
     * 这些派生写法只参与前缀消歧，不覆盖正式名称的精确索引。
     * 保留一对多条目，避免 Pattern Analysis… 只看到 PAA 而遗漏 TPAMI。
     */
    static prefixPairs(pairs) {
      const out = [...pairs];
      const seen = new Set();
      for (const [, entry] of out.slice()) {
        if (seen.has(entry)) continue;
        seen.add(entry);
        const name = String(entry.name || entry.n || '');
        const short = name.replace(/^(?:(?:IEEE|ACM)(?:\s*\/\s*(?:IEEE|ACM))?\s+)?(?:Transactions|Trans\.?|Journal|J\.?|Proceedings|Proc\.?|Letters)\s+(?:on|of|in)\s+/i, '');
        if (short !== name) out.push([normalizeName(short), entry]);
      }
      return out;
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
        // 派生短名即使恰好等于输入片段，也必须参与消歧。
        if (!k.startsWith(key)) continue;
        if (hit && hit !== e) return null;   // 前缀不唯一，宁可不认
        hit = e;
      }
      return hit;
    }

    /**
     * 开头被截断的出处（"… on Pattern Analysis and …"）剩下的是名称中间或末尾的一段：
     * 找出所有把该片段作为连续词序列包含在内的条目。
     * @param {Array<{tokens:string[], entry:object, minStart:number}>} items 见 infixItems
     * @param {string[]} frag    片段的 token 序列（含虚词）
     * @param {boolean} openEnd  后半段是否也被截断；否则片段必须正好收在名称末尾
     * @returns {object[]} 去重后的条目
     */
    static infixMatches(items, frag, openEnd) {
      const n = frag.length;
      const out = [];
      for (const { tokens, entry, minStart } of items) {
        const last = tokens.length - n;
        let found = false;
        for (let p = openEnd ? minStart : Math.max(minStart, last); p <= last && !found; p++) {
          found = true;
          for (let i = 0; i < n && found; i++) {
            // 后半段被截断时，最后一个词可能只剩半截（"Sec…"）
            found = openEnd && i === n - 1 ? tokens[p + i].startsWith(frag[i]) : tokens[p + i] === frag[i];
          }
        }
        // 同一本期刊在数据集里可能以新旧两个刊名各收一条，按 ISSN 算同一个
        if (found && !out.some((e) => e === entry || (e.issn && e.issn === entry.issn))) out.push(entry);
      }
      return out;
    }

    /**
     * 开头被截断的出处走片段匹配，三套数据一起看：任何一套里对得上不止一个出处，就说明
     * 片段本身有歧义（"… on Image Processing" 既是 TIP 也是 ICIP），三套都不认。
     * @returns {{ccf:?object, core:?object, journal:?object}|null} 各套数据里唯一命中的条目
     */
    findFragment(names, openEnd) {
      if (!this.journalInfix) {
        this.journalInfix = Ranking.infixItems(Object.values(this.journals).map((rec) => [rec.n, rec]), () => true);
      }
      const pick = (list) => (list.length === 1 ? { entry: list[0], via: '截断片段匹配' } : null);
      for (const n of names) {
        if (normalizeName(n).length < this.options.minPrefixLength) continue;
        const frag = nameTokens(n);
        const [ccf, core, journal] = [this.ccf.infixItems, this.core.infixItems, this.journalInfix]
          .map((items) => Ranking.infixMatches(items, frag, openEnd));
        // 期刊库里只数正式期刊：EI 目录带进来的会议录没有 ISSN，名称又常与会议目录重复，不算歧义。
        if (ccf.length > 1 || core.length > 1 || journal.filter((rec) => rec.issn).length > 1) continue;
        const hit = { ccf: pick(ccf), core: pick(core), journal: pick(journal) };
        if (hit.ccf || hit.core || hit.journal) return hit;
      }
      return null;
    }

    /**
     * 片段在期刊库里唯一，不代表它就是会议目录认出的那个出处："… and Pattern Recognition"
     * 在期刊库里只对得上一个冷门会议录，实际是 CVPR。名称登记在同一条目下，或 token 基本重合才算同一个。
     */
    static sameVenue(index, entry, rec) {
      if (index.byKey.get(normalizeName(rec.n)) === entry) return true;
      return Ranking.containment(new Set(tokensOf(rec.n)), new Set(tokensOf(entry.name))) >= 0.85;
    }

    /**
     * 在一套会议索引里查。顺序是「全称精确 → 简称 → 截断前缀 → 全称模糊」——
     * 全称比三四个字母的简称可靠得多，简称在两套目录之间还会撞车（如 ATC）。
     * @param {{head:boolean, tail:boolean, name:boolean}|null} cut 出处被省略号截断的位置
     *   （含义见 venueCandidates 的 truncatedHead / truncatedTail / truncatedName），未截断为 null
     */
    findConf(index, names, acronyms, cut) {
      if (!index) return null;
      for (const n of names) {
        const key = normalizeName(n);
        if (key.length < this.options.minKeyLength) continue;
        const e = index.byKey.get(key);
        if (!e) continue;
        // 开头被截掉的片段恰好等于某本期刊的全名时不能认：
        // "… and Pattern Recognition" 是 CVPR 的尾巴，不是 Pattern Recognition。
        if (cut && cut.head && e.type === 'journal') continue;
        // 后半段被截掉时同理："Artificial Intelligence …" 也可能是 Artificial Intelligence Review，
        // 只有没有别的名称以它开头才认。
        if (cut && cut.name && Ranking.uniquePrefixMatch(index.prefixPairs, key) !== e) continue;
        return { entry: e, via: '全称精确匹配' };
      }
      for (const a of acronyms) {
        const e = index.byAbbr.get(a);
        if (e) return { entry: e, via: `简称 ${a}` };
      }
      if (cut) {
        // 开头被截断的片段不是前缀，交给 findFragment 三套数据一起判。
        for (const n of cut.head ? [] : names) {
          const key = normalizeName(n);
          if (key.length < this.options.minPrefixLength) continue;
          const e = Ranking.uniquePrefixMatch(index.prefixPairs, key);
          if (e) return { entry: e, via: '截断前缀匹配' };
        }
        // 不允许模糊匹配重新猜测已经无法唯一确定的截断出处。
        return null;
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

    /** @param {{head:boolean, tail:boolean, name:boolean}|null} cut 同 findConf */
    findJournal(names, cut) {
      // 开头被截掉的片段既不能精确匹配也不是前缀，理由同 findConf。
      if (cut && cut.head) return null;
      // 前缀索引只在遇到截断出处时才建，两万多条刊名不必每次启动都过一遍。
      if (cut && !this.journalPairs) this.journalPairs = Ranking.prefixPairs(Object.entries(this.journals));
      for (const n of names) {
        const key = normalizeName(n);
        if (key.length < this.options.minKeyLength) continue;
        const rec = this.journals[key];
        if (!rec) continue;
        // "Information …" 截断后恰好等于期刊 Information 的全名，但它更可能是 Information Sciences /
        // Information Fusion：名称没写完时，只有没有别的刊名以它开头才认。
        if (cut && cut.name && Ranking.uniquePrefixMatch(this.journalPairs, key) !== rec) continue;
        return { entry: rec, matchedName: n, via: '全称精确匹配' };
      }
      if (!cut) return null;
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

      const { names, acronyms, kind, truncated, truncatedHead, truncatedTail, truncatedName, preprintName } = venueCandidates(raw);
      const result = { kind, raw, truncated, preprintName };
      const cut = truncated ? { head: truncatedHead, tail: truncatedTail, name: truncatedName } : null;
      if (kind === 'normal') {
        const frag = (cut && cut.head && this.findFragment(names, cut.tail)) || {};
        let ccf = this.findConf(this.ccf, names, acronyms, cut) || frag.ccf;
        const ccfSecondary = ccf && secondaryTrackReason(raw, ccf.entry);
        if (ccfSecondary) {
          result.secondaryTrack = ccfSecondary;
          ccf = null;
        }
        if (ccf) { result.ccf = ccf.entry; result.via = ccf.via; }
        let core = this.findConf(this.core, names, acronyms, cut) || frag.core;
        const coreSecondary = core && secondaryTrackReason(raw, core.entry);
        if (coreSecondary) {
          result.secondaryTrack = result.secondaryTrack || coreSecondary;
          core = null;
        }
        if (core) { result.core = core.entry; result.coreVia = core.via; }
        let jr = this.findJournal(names, cut);
        if (!jr && frag.journal
          && (!ccf || Ranking.sameVenue(this.ccf, ccf.entry, frag.journal.entry))
          && (!core || Ranking.sameVenue(this.core, core.entry, frag.journal.entry))) {
          jr = { entry: frag.journal.entry, matchedName: frag.journal.entry.n, via: frag.journal.via };
        }
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
