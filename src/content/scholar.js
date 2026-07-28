/**
 * Google Scholar 页面注入：找到每条文献的「出处」，查表后在其上方插入分级徽章。
 *
 * 覆盖三处：
 *   1. 个人主页论文列表   #gsc_a_b tr.gsc_a_tr
 *   2. 搜索结果 / 引用列表 / 相关文章  .gs_a
 *   3. 单篇论文详情浮层   #gsc_vcd_table 里的「期刊 / 会议 / 来源」字段
 */
(function () {
  'use strict';

  const MARK = 'srDone';           // dataset 标记，避免重复注入
  const CONTAINER_CLASS = 'sr-badges';

  let ranking = null;
  let settings = null;

  async function loadJson(path) {
    const res = await fetch(chrome.runtime.getURL(path));
    if (!res.ok) throw new Error(`无法读取 ${path}: HTTP ${res.status}`);
    return res.json();
  }

  /** 取节点纯文本，但排除 Scholar 用来放年份的 .gs_oph（", 2024"）。 */
  function venueTextOf(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('.gs_oph, .' + CONTAINER_CLASS).forEach((el) => el.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }

  function buildBadges(venue) {
    const result = ranking.lookup(venue);
    const badges = ranking.badges(result);
    if (!badges.length) {
      if (!settings.showUnmatched || result.kind !== 'normal') return null;
      badges.push({ key: 'none', text: '未收录', cls: 'sr-none', title: `未在本地数据集中匹配到：${venue}` });
    }
    const box = document.createElement('div');
    box.className = CONTAINER_CLASS + ' ' + SRSettings.themeClass(settings.theme)
      + (settings.boldBadges ? ' sr-bold' : '');
    if (settings.badgeScale && settings.badgeScale !== 100) {
      box.style.fontSize = (11 * settings.badgeScale / 100).toFixed(1) + 'px';
    }
    for (const b of badges) {
      const span = document.createElement('span');
      span.className = `sr-badge ${b.cls}`;
      span.textContent = b.text;
      span.title = b.title;
      box.appendChild(span);
    }
    return box;
  }

  /**
   * 在 anchor 之前（before=true）或之后插入徽章行。
   * venues 可以给多个候选出处，取第一个能出徽章的。
   */
  function inject(host, venues, anchor, before) {
    if (host.dataset[MARK]) return;
    host.dataset[MARK] = '1';
    const list = Array.isArray(venues) ? venues : [venues];
    let box = null;
    for (const v of list) {
      box = buildBadges(v);
      if (box) break;
    }
    if (!box) return;
    if (before) anchor.parentNode.insertBefore(box, anchor);
    else anchor.parentNode.insertBefore(box, anchor.nextSibling);
  }

  // ---- 1. 个人主页论文列表 ----
  function annotateProfile() {
    if (!settings.showOnProfile) return;
    for (const row of document.querySelectorAll('#gsc_a_b tr.gsc_a_tr')) {
      if (row.dataset[MARK]) continue;
      const cell = row.querySelector('.gsc_a_t');
      if (!cell) continue;
      const grays = cell.querySelectorAll(':scope > .gs_gray');
      // 第一行是作者，第二行是出处；只有一行时那一行就是出处。
      const venueEl = grays.length >= 2 ? grays[1] : grays[0];
      if (!venueEl) continue;
      const venue = venueTextOf(venueEl);
      if (!venue) continue;
      inject(row, venue, venueEl, true);
    }
  }

  // ---- 2. 搜索结果 / 引用列表 / 相关文章 ----
  // .gs_a 形如 "X Yang, K Ding… - IEEE Transactions on …, 2026 - ieeexplore.ieee.org"
  // 具体拆法见 SRNorm.venuesFromByline（放在 lib 里是为了能进回归测试）。
  function annotateSearch() {
    if (!settings.showOnSearch) return;
    for (const meta of document.querySelectorAll('.gs_a')) {
      if (meta.dataset[MARK]) continue;
      const venues = SRNorm.venuesFromByline(venueTextOf(meta));
      if (!venues.length) { meta.dataset[MARK] = '1'; continue; }
      inject(meta, venues, meta, false);
    }
  }

  // ---- 3. 单篇论文详情浮层 ----
  const DETAIL_FIELDS = new Set([
    '期刊', '会议', '来源', '图书', '刊物',
    'journal', 'conference', 'source', 'book', 'publication',
  ]);

  function annotateDetail() {
    if (!settings.showOnDetail) return;
    for (const row of document.querySelectorAll('#gsc_vcd_table .gs_scl')) {
      if (row.dataset[MARK]) continue;
      const field = row.querySelector('.gsc_vcd_field');
      const value = row.querySelector('.gsc_vcd_value');
      if (!field || !value) continue;
      const name = field.textContent.trim().toLowerCase();
      if (!DETAIL_FIELDS.has(name)) continue;
      const venue = venueTextOf(value);
      if (!venue) continue;
      inject(row, venue, value, false);
    }
  }

  function annotateAll() {
    if (!ranking || !settings || !settings.enabled) return;
    try {
      annotateProfile();
      annotateSearch();
      annotateDetail();
    } catch (err) {
      console.error('[学术分级标注] 注入失败:', err);
    }
  }

  /** 清掉已注入的徽章，用于设置变更后重绘。 */
  function clearAll() {
    document.querySelectorAll('.' + CONTAINER_CLASS).forEach((el) => el.remove());
    document.querySelectorAll('[data-sr-done]').forEach((el) => delete el.dataset[MARK]);
  }

  function observe() {
    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(annotateAll, 60);
    };
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }

  async function main() {
    settings = await SRSettings.load();
    if (!settings.enabled) return;

    const [ccf, core, journals, aliases, tags] = await Promise.all([
      loadJson('src/data/ccf.json'),
      loadJson('src/data/core.json'),
      loadJson('src/data/journals.json'),
      loadJson('src/data/aliases.json'),
      loadJson('src/data/tags.json'),
    ]);
    ranking = new SRRanking({ ccf, core, journals, aliases, tags }, settings);

    annotateAll();
    observe();

    chrome.storage.onChanged.addListener(async (_changes, area) => {
      if (area !== 'sync') return;
      settings = await SRSettings.load();
      ranking.options = Object.assign({}, ranking.options, settings);
      ranking.cache.clear();
      clearAll();
      if (settings.enabled) annotateAll();
    });
  }

  main().catch((err) => console.error('[学术分级标注] 初始化失败:', err));
})();
