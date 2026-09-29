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

    const signatures = [{ compact: tokens.join(''), surname: tokens[tokens.length - 1], initial: tokens[0][0] }];
    if (tokens.length > 1) {
      signatures.push({ compact: tokens.join(''), surname: tokens[0], initial: tokens[1][0] });
    }
    return signatures;
  }

  function profileNames(value) {
    const values = Array.isArray(value) ? value : [value];
    const names = values
      .flatMap((item) => String(item || '').split(/\r?\n|[;；]+/))
      .map((item) => item.trim())
      .filter(Boolean);
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
      .split(/[,，;]/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (!parts.length) return [];

    const hasAsterisk = (name) => /[*＊∗★]/u.test(name);
    const cleanMarker = (name) => name.replace(/[*＊∗★]+/gu, ' ').replace(/\s+/g, ' ').trim();
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
    return left.some((x) => right.some((y) =>
      x.surname === y.surname && x.initial && x.initial === y.initial));
  }

  function isFirstAuthor(authorLine, names) {
    const candidates = firstAuthorNames(authorLine);
    const aliases = profileNames(names);
    return candidates.some((candidate) => aliases.some((name) => samePerson(candidate, name)));
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
    matchesFilter,
    summarize,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
