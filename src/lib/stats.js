/** Google Scholar 个人主页论文统计与作者姓名匹配（浏览器 / Node 共用）。 */
(function (root) {
  'use strict';

  function cleanPersonName(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\([^)]*\)|（[^）]*）/g, ' ')
      .replace(/\b(?:jr|sr|ii|iii|iv)\b\.?/gi, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toLowerCase();
  }

  function personSignatures(value) {
    const clean = cleanPersonName(value);
    const tokens = clean.split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    const uppercaseInitials = new Set((String(value).match(/\b[A-Z]{2,4}\b/g) || []).map((token) => token.toLowerCase()));
    const signature = (surname, given) => ({
      compact: tokens.join(''), surname, given: given.join(''), initials: given.map((token) => token[0]).join(''),
      abbreviated: given.length > 0 && given.every((token) => token.length === 1 || uppercaseInitials.has(token)),
    });
    const signatures = [signature(tokens[tokens.length - 1], tokens.slice(0, -1))];
    if (tokens.length > 1) {
      signatures.push(signature(tokens[0], tokens.slice(1)));
    }
    return signatures;
  }

  /**
   * Scholar 主页名经常把另一种写法放在括号里，例如
   * "Jiawei Liu (刘嘉威)"。括号内容不是普通备注，而是可用于作者匹配的别名；
   * 同时保留完整写法，避免改变已有的英文缩写匹配行为。
   */
  function nameVariants(value) {
    const raw = String(value || '').trim();
    if (!raw) return [];

    const variants = [raw];
    const withoutParentheses = raw
      .replace(/\(([^()]*)\)|（([^（）]*)）/g, (_match, ascii, fullWidth) => {
        const inner = String(ascii || fullWidth || '').trim();
        if (inner) variants.push(inner);
        return ' ';
      })
      .replace(/\s+/g, ' ')
      .trim();
    if (withoutParentheses && withoutParentheses !== raw) variants.push(withoutParentheses);
    return variants;
  }

  function profileNames(value) {
    const values = Array.isArray(value) ? value : [value];
    const names = values
      .flatMap((item) => String(item || '').split(/\r?\n|[;；]+/))
      .map((item) => item.trim())
      .filter(Boolean)
      .flatMap(nameVariants);
    const unique = new Map();
    for (const name of names) {
      const key = cleanPersonName(name);
      if (key && !unique.has(key)) unique.set(key, name);
    }
    return [...unique.values()];
  }

  function firstAuthorNames(authorLine) {
    const parts = String(authorLine || '')
      .replace(/(?:…|\.\.\.).*$/, '')
      .split(/[,，;、]/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (!parts.length) return [];

    // 不同出版商会用星号、井号或 dagger 标记共同一作。
    const hasAsterisk = (name) => /[*＊∗★#＃†‡]/u.test(name);
    const cleanMarker = (name) => name.replace(/[*＊∗★#＃†‡]+/gu, ' ').replace(/\s+/g, ' ').trim();
    const names = [cleanMarker(parts[0])];

    // 首位作者带星号时，紧随其后的连续星号作者都视为共同一作。
    if (hasAsterisk(parts[0])) {
      for (let i = 1; i < parts.length && hasAsterisk(parts[i]); i++) {
        names.push(cleanMarker(parts[i]));
      }
    }
    return names.filter(Boolean);
  }

  function firstAuthorName(authorLine) {
    return firstAuthorNames(authorLine)[0] || '';
  }

  /** Scholar 常把作者缩写成 “K Ding”，因此用姓氏 + 名字首字母匹配主页全名。 */
  function samePerson(a, b) {
    const left = personSignatures(a);
    const right = personSignatures(b);
    if (!left.length || !right.length) return false;
    if (left[0].compact === right[0].compact) return true;
    return left.some((x) => right.some((y) => x.surname === y.surname && x.given && y.given && (
      x.given === y.given
      || (x.abbreviated && (y.abbreviated ? y.given : y.initials).startsWith(x.given))
      || (y.abbreviated && (x.abbreviated ? x.given : x.initials).startsWith(y.given))
    )));
  }

  function isFirstAuthor(authorLine, names) {
    const candidates = firstAuthorNames(authorLine);
    const aliases = profileNames(names);
    return candidates.some((candidate) => aliases.some((name) => samePerson(candidate, name)));
  }

  /** 保留姓名在原文中的位置，便于只标记姓名而不改写 Scholar 的链接。 */
  function authorParts(authorLine) {
    const text = String(authorLine || '');
    const cut = text.search(/…|\.\.\.|\bet\s+al\b/i);
    const visible = cut < 0 ? text : text.slice(0, cut);
    return [...visible.matchAll(/[^,，;、]+/gu)].map((match) => {
      const leading = match[0].length - match[0].trimStart().length;
      const raw = match[0].trim();
      return { name: raw, start: match.index + leading, end: match.index + leading + raw.length };
    }).filter((part) => cleanPersonName(part.name));
  }

  function isLastAuthor(authorLine, names) {
    // 省略号前的最后一个可见姓名不一定是末作。
    if (/…|\.\.\.|\bet\s+al\b/i.test(String(authorLine || ''))) return false;
    const parts = authorParts(authorLine);
    const last = parts[parts.length - 1];
    return !!last && profileNames(names).some((name) => samePerson(last.name, name));
  }

  function authorNameRanges(authorLine, names) {
    const aliases = profileNames(names);
    return authorParts(authorLine).filter((part) => aliases.some((name) => samePerson(part.name, name)));
  }

  function citationCount(value) {
    const match = String(value ?? '').replace(/[,，\s]/gu, '').match(/^\d+/);
    return match ? Number(match[0]) : 0;
  }

  function matchesYear(item, options) {
    const year = Number(item.year);
    if (options.startYear && (!year || year < Number(options.startYear))) return false;
    if (options.endYear && (!year || year > Number(options.endYear))) return false;
    return true;
  }

  /** 高亮角色取并集；分类、年份与角色之间取交集。 */
  function matchesHighlight(item, options, names) {
    if (!matchesYear(item, options)) return false;
    if (!matchesFilter(item, options.category, names)) return false;
    return (options.first && isFirstAuthor(item.authors, names))
      || (options.last && isLastAuthor(item.authors, names)) || false;
  }

  function metrics(entries) {
    // 一个条目即一篇论文，同时命中多个角色也只进入集合一次。
    const unique = [...new Map((entries || []).map((item, index) => [item.id || index, item])).values()];
    const counts = unique.filter((item) => !item.citationExcluded)
      .map((item) => citationCount(item.citations)).sort((a, b) => b - a);
    return {
      papers: unique.length,
      citations: counts.reduce((sum, count) => sum + count, 0),
      hIndex: counts.reduce((h, count, index) => count >= index + 1 ? index + 1 : h, 0),
      i10Index: counts.filter((count) => count >= 10).length,
    };
  }

  function matchesFilter(item, filter, names) {
    if (!filter) return true;
    const result = item && item.result || {};
    if (/^ccf-[abc]$/.test(filter)) {
      return String(result.ccf && result.ccf.rank || '').toLowerCase() === filter.slice(-1);
    }
    if (/^zone-[1-4]$/.test(filter)) {
      return Number(result.journal && result.journal.zone) === Number(filter.slice(-1));
    }
    if (filter === 'first') return isFirstAuthor(item && item.authors, names);
    if (filter === 'last') return isLastAuthor(item && item.authors, names);
    return true;
  }

  /**
   * @param {Array<{authors?:string,result?:object}>} entries
   * @param {string|string[]} names Google Scholar 主页姓名及用户配置的别名
   */
  function summarize(entries, names) {
    const authors = profileNames(names);
    const summary = {
      total: 0,
      ccf: { A: 0, B: 0, C: 0 },
      zones: { 1: 0, 2: 0, 3: 0, 4: 0 },
      firstAuthor: 0,
      lastAuthor: 0,
      truncatedAuthors: 0,
      firstAuthorAvailable: authors.length > 0,
    };

    for (const item of entries || []) {
      summary.total++;
      const result = item.result || {};
      const rank = result.ccf && String(result.ccf.rank || '').toUpperCase();
      if (Object.prototype.hasOwnProperty.call(summary.ccf, rank)) summary.ccf[rank]++;

      const zone = result.journal && Number(result.journal.zone);
      if (Object.prototype.hasOwnProperty.call(summary.zones, zone)) summary.zones[zone]++;

      if (summary.firstAuthorAvailable && isFirstAuthor(item.authors, authors)) {
        summary.firstAuthor++;
      }
      if (summary.firstAuthorAvailable && isLastAuthor(item.authors, authors)) summary.lastAuthor++;
      if (/…|\.\.\.|\bet\s+al\b/i.test(item.authors || '')) summary.truncatedAuthors++;
    }
    return summary;
  }

  root.SRStats = {
    cleanPersonName,
    profileNames,
    firstAuthorNames,
    firstAuthorName,
    samePerson,
    isFirstAuthor,
    isLastAuthor,
    authorNameRanges,
    citationCount,
    matchesYear,
    matchesHighlight,
    metrics,
    matchesFilter,
    summarize,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
