/**
 * 期刊 / 会议名称规范化与候选名生成。
 *
 * 该文件同时被浏览器扩展（作为普通 content script）和 tools/ 下的 Node 构建脚本
 * 使用，因此写成挂在 globalThis 上的形式，保证「建库时的 key」与「查库时的 key」
 * 由同一份代码生成，不会漂移。
 */
(function (root) {
  'use strict';

  // 常见缩写 -> 全称。Google Scholar 与分区表的写法经常不一致。
  const ABBREV = new Map(Object.entries({
    trans: 'transactions',
    tran: 'transactions',
    j: 'journal',
    jnl: 'journal',
    int: 'international',
    intl: 'international',
    natl: 'national',
    proc: 'proceedings',
    conf: 'conference',
    symp: 'symposium',
    sci: 'science',
    tech: 'technology',
    technol: 'technology',
    comput: 'computer',
    eng: 'engineering',
    res: 'research',
    lett: 'letters',
    rev: 'review',
    appl: 'applied',
    ann: 'annals',
    arch: 'archives',
    bull: 'bulletin',
    med: 'medicine',
    biol: 'biology',
    chem: 'chemistry',
    phys: 'physics',
    math: 'mathematics',
    syst: 'systems',
    sys: 'systems',
    mag: 'magazine',
    assoc: 'association',
  }));

  // 出现在刊名里、对匹配没有帮助的虚词。
  const STOPWORDS = new Set(['the', 'of', 'a', 'an', 'and', 'for', 'on', 'in']);

  /** 去掉变音符号、花体引号、各种连字符。 */
  function deburr(s) {
    return s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[‐-―−]/g, '-');
  }

  /**
   * 生成用于查表的归一化 key：去符号、展开缩写、丢弃虚词、去空格。
   *
   * 例：IEEE Trans. on Pattern Analysis & Machine Intelligence
   *  -> ieeetransactionspatternanalysismachineintelligence
   */
  function normalizeName(input) {
    if (!input) return '';
    let s = deburr(String(input)).toLowerCase();
    s = s.replace(/&/g, ' and ');
    s = s.replace(/[^a-z0-9]+/g, ' ').trim();
    if (!s) return '';
    const tokens = s.split(' ')
      .map((t) => ABBREV.get(t) ?? t)
      .filter((t) => t && !STOPWORDS.has(t));
    return tokens.join('');
  }

  const PREFIXES = [
    /^proceedings\s+of\s+the\s+/i,
    /^proceedings\s+of\s+/i,
    /^proceedings\s+/i,
    /^proc\.?\s+of\s+the\s+/i,
    /^proc\.?\s+of\s+/i,
    /^in\s+proceedings\s+of\s+the\s+/i,
    /^in\s+/i,
    /^the\s+/i,
  ];

  // IEEE 风格的出处常以「简称 + 年份」开头："ICASSP 2026-2026 IEEE International Conference on …"。
  // 要求这个 token 至少有两个大写字母，免得把 "Nature 2023" 这种当成简称给剥掉。
  const LEAD_ACRONYM_YEAR = /^([A-Za-z][A-Za-z0-9'&.-]{1,13})\s+((19|20)\d{2})\b/;

  function isAcronymToken(t) {
    return /^[A-Z]/.test(t) && /[A-Z][^A-Z]*[A-Z]/.test(t);
  }

  /** 剥掉 "Proceedings of the ..." / 前导简称年份 / 前导年份 / 前导届次序数词等包装。 */
  function stripWrappers(s) {
    let out = String(s).trim();
    let changed = true;
    while (changed) {
      changed = false;
      for (const re of PREFIXES) {
        const next = out.replace(re, '');
        if (next !== out) { out = next.trim(); changed = true; }
      }
      const lead = LEAD_ACRONYM_YEAR.exec(out);
      if (lead && isAcronymToken(lead[1])) {
        out = out.slice(lead[0].length).trim();
        changed = true;
      }
      const next = out
        .replace(/^\s*[-]\s*/, '')
        .replace(/^(19|20)\d{2}(\s*[-/]\s*(19|20)?\d{2})?\s+/, '')
        .replace(/^\d{1,3}(st|nd|rd|th)\s+/i, '')
        .trim();
      if (next !== out) { out = next; changed = true; }
    }
    return out;
  }

  /** 去掉末尾的卷 / 期 / 页码等文献计量信息。 */
  function stripTrailingNumerics(s) {
    let out = String(s).trim();
    let prev = null;
    while (prev !== out) {
      prev = out;
      out = out
        .replace(/[\s,;:]+$/, '')
        // "30 (6), 351" / "44 (11)" / "1-10"
        .replace(/[\s,]+\(?\d+[\d\s\-/]*\)?$/, '')
        .replace(/[\s,]+\(\s*\d+[^()]*\)$/, '')
        .replace(/[\s,]+(vol|volume|no|issue|pp|p)\.?\s*\d+.*$/i, '')
        .trim();
    }
    return out;
  }

  const PREPRINT_RE = /\b(arxiv|biorxiv|medrxiv|chemrxiv|ssrn|preprint|techrxiv|research\s*square|working\s+paper)\b/i;

  // 各预印本平台的规范写法，用来给徽章取名。顺序有讲究：
  // "arXiv preprint arXiv:xxxx" 里 arxiv 先于泛化的 preprint 命中。
  const PREPRINT_SERVERS = [
    [/\bbiorxiv\b/i, 'bioRxiv'],
    [/\bmedrxiv\b/i, 'medRxiv'],
    [/\bchemrxiv\b/i, 'ChemRxiv'],
    [/\btechrxiv\b/i, 'TechRxiv'],
    [/\barxiv\b/i, 'arXiv'],
    [/\bssrn\b/i, 'SSRN'],
    [/\bresearch\s*square\b/i, 'Research Square'],
    [/\bosf\b/i, 'OSF Preprints'],
    [/\bworking\s+paper\b/i, '工作论文'],
  ];

  /** 出处属于哪个预印本平台；认不出具体平台时返回「预印本」。 */
  function preprintSource(raw) {
    const s = String(raw || '');
    for (const [re, name] of PREPRINT_SERVERS) if (re.test(s)) return name;
    return '预印本';
  }
  const THESIS_RE = /(\bphd\s+thesis\b|\bmaster'?s?\s+thesis\b|\bdissertation\b|学位论文|博士论文|硕士论文)/i;
  const PATENT_RE = /(\bpatent\b|专利)/i;

  /** 粗分出处类型：预印本 / 学位论文 / 专利 不参与分级匹配。 */
  function classifyVenue(raw) {
    if (!raw || !String(raw).trim()) return 'empty';
    if (PREPRINT_RE.test(raw)) return 'preprint';
    if (THESIS_RE.test(raw)) return 'thesis';
    if (PATENT_RE.test(raw)) return 'patent';
    return 'normal';
  }

  /**
   * 从 Google Scholar 的出处字符串里提取候选刊名与会议缩写。
   *
   * 输入例：
   *   Multimedia Systems 30 (6), 351
   *   2023 IEEE International Conference on Robotics and Automation (ICRA), 123-130
   *   Proceedings of the IEEE/CVF Conference on Computer Vision ..., 1-10
   *
   * 返回 { names, acronyms, kind, truncated }，names 按可信度从高到低排序。
   * truncated 表示原串被 Scholar 用省略号截断过——此时全称一定对不上，需要前缀匹配兜底。
   */
  function venueCandidates(raw) {
    const kind = classifyVenue(raw);
    const truncated = /…|\.{3}/.test(String(raw || ''));
    const result = { names: [], acronyms: [], kind, truncated };
    if (kind === 'preprint') result.preprintName = preprintSource(raw);
    if (kind !== 'normal') return result;

    const names = [];
    const acronyms = [];
    const pushName = (s) => {
      const v = s && String(s).trim().replace(/[\s,;:.\-]+$/, '').trim();
      if (v && v.length >= 3 && !names.includes(v)) names.push(v);
    };
    const pushAcronym = (s) => {
      const v = s && String(s).trim().toUpperCase();
      if (v && v.length >= 2 && v.length <= 12 && !acronyms.includes(v)) acronyms.push(v);
    };

    const text = String(raw).replace(/…/g, '').replace(/\.\.\./g, '').replace(/\s+/g, ' ').trim();

    // 括号里的大写缩写通常就是会议简称："... (ICRA)"
    for (const m of text.matchAll(/\(([A-Za-z][A-Za-z0-9'&-]{1,11})\)/g)) {
      if (isAcronymToken(m[1])) pushAcronym(m[1]);
    }

    // 开头的「简称 + 年份」也是简称："ICASSP 2026-2026 IEEE International Conference on …"。
    // 长出处被截断时括号里的简称会被切掉，这个前导简称往往是唯一还留着的线索。
    const lead = LEAD_ACRONYM_YEAR.exec(text);
    if (lead && isAcronymToken(lead[1])) pushAcronym(lead[1]);

    // 出处一般位于逗号分段的最前面，取由长到短的前缀作候选。
    const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
    for (let i = parts.length; i >= 1; i--) {
      const prefix = parts.slice(0, i).join(', ');
      for (const base of [stripTrailingNumerics(prefix), prefix]) {
        if (!base) continue;
        pushName(base);
        pushName(base.replace(/\s*\([^()]*\)\s*$/, ''));
        const stripped = stripWrappers(base);
        pushName(stripped);
        pushName(stripped.replace(/\s*\([^()]*\)\s*$/, ''));
      }
    }

    // 整串本身就是缩写："CVPR" / "NeurIPS"
    const first = parts[0] || '';
    if (/^[A-Za-z][A-Za-z0-9'&-]{1,11}$/.test(first)) pushAcronym(first);

    result.names = names;
    result.acronyms = acronyms;
    return result;
  }

  // 域名段：Scholar 搜索结果 .gs_a 的末段通常是来源站点。
  const SITE_RE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i;

  /**
   * 从搜索结果的 .gs_a 文本里取出候选出处。
   *
   * .gs_a 形如「作者 - 出处, 年份 - 站点」，但这三段并不稳定：站点段可能整个缺失，
   * 作者名和刊名里也可能自带短横线。所以不去猜哪一段是出处，而是把所有可能的段
   * 都返回，交给调用方逐个查，取第一个查得到的。
   *
   * @returns {string[]} 候选出处，按可信度从高到低
   */
  function venuesFromByline(text) {
    const parts = String(text || '')
      .replace(/ /g, ' ')
      .split(/\s+-\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 2) return [];

    const stripYear = (s) => s.replace(/,?\s*(19|20)\d{2}\s*$/, '').replace(/[\s,]+$/, '').trim();
    const out = [];
    const push = (s) => {
      const v = stripYear(s);
      if (v && v.length >= 3 && !out.includes(v)) out.push(v);
    };

    // 首段是作者，末段若像域名则是站点，都去掉；剩下的才可能是出处。
    const body = parts.slice(1).filter((s) => !SITE_RE.test(s));
    if (!body.length) return [];
    push(body.join(' - '));            // 刊名自带短横线时，合起来才是完整刊名
    for (const p of body) push(p);     // 否则逐段试
    return out;
  }

  root.SRNorm = {
    normalizeName, venueCandidates, venuesFromByline,
    classifyVenue, preprintSource, stripWrappers, stripTrailingNumerics,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
