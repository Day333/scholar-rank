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
  const PENDING = 'srPending';     // dataset 标记，正在等完整刊名
  const CONTAINER_CLASS = 'sr-badges';
  const STATS_PANEL_CLASS = 'sr-stats-panel';

  let ranking = null;
  let settings = null;
  let activeProfileFilter = null;
  let loadAllRunning = false;
  let loadAllCancelled = false;
  let loadAllState = '';

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

  function profileRowData(row) {
    const cell = row.querySelector('.gsc_a_t');
    if (!cell) return null;
    const grays = cell.querySelectorAll(':scope > .gs_gray');
    const venueEl = grays.length >= 2 ? grays[1] : grays[0];
    return {
      venueEl,
      venue: venueEl ? venueTextOf(venueEl) : '',
      authors: grays.length >= 2 ? venueTextOf(grays[0]) : '',
    };
  }

  // ---- 1. 个人主页论文列表 ----
  function annotateProfile() {
    if (!settings.showOnProfile) return;
    for (const row of document.querySelectorAll('#gsc_a_b tr.gsc_a_tr')) {
      if (row.dataset[MARK]) continue;
      const data = profileRowData(row);
      if (!data || !data.venueEl || !data.venue) continue;
      inject(row, data.venue, data.venueEl, true);
    }
  }

  function citationStatsHost() {
    const anchors = [
      document.querySelector('#gsc_rsb_st'),
      document.querySelector('#gsc_g'),
      document.querySelector('#gsc_rsb_cit'),
    ].filter(Boolean);

    for (const node of anchors) {
      const section = node.closest('.gsc_rsb_s');
      if (section) return section;
      if (node.parentElement && node.parentElement !== document.body) return node.parentElement;
    }

    const rail = document.querySelector('#gsc_rsb');
    if (rail) return rail.querySelector('.gsc_rsb_s') || rail;

    for (const heading of document.querySelectorAll('.gsc_rsb_h, .gsc_rsb_hdr')) {
      const label = heading.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
      if (label.includes('引用次数') || label === 'cited by' || label === 'citations') {
        return heading.closest('.gsc_rsb_s') || heading.parentElement;
      }
    }
    return null;
  }

  function ensureStatsPanel() {
    const host = citationStatsHost();
    let panel = document.querySelector('.' + STATS_PANEL_CLASS);
    if (!host) {
      if (panel) panel.remove();
      return null;
    }
    if (!panel) {
      panel = document.createElement('aside');
      panel.className = STATS_PANEL_CLASS;
      panel.setAttribute('aria-label', '论文统计');
      panel.innerHTML = `
        <div class="sr-stats-header">
          <span>论文统计</span>
          <span class="sr-stats-toggle" role="button" tabindex="0" aria-label="收起论文统计" aria-expanded="true">−</span>
        </div>
        <div class="sr-stats-body">
          <div class="sr-stats-total">
            当前已加载 <strong data-stat="total">0</strong> 篇
            <span data-stat-wrap="visible" hidden> · 显示 <strong data-stat="visible">0</strong> 篇</span>
          </div>
          <div class="sr-stats-title">CCF 分类</div>
          <div class="sr-stats-grid sr-stats-grid-ccf">
            <span class="sr-stat sr-stat-a" data-filter="ccf-a" role="button" tabindex="0" aria-pressed="false"><span>A 类</span><strong data-stat="ccf-a">0</strong></span>
            <span class="sr-stat sr-stat-b" data-filter="ccf-b" role="button" tabindex="0" aria-pressed="false"><span>B 类</span><strong data-stat="ccf-b">0</strong></span>
            <span class="sr-stat sr-stat-c" data-filter="ccf-c" role="button" tabindex="0" aria-pressed="false"><span>C 类</span><strong data-stat="ccf-c">0</strong></span>
          </div>
          <div class="sr-stats-title">中科院分区</div>
          <div class="sr-stats-grid sr-stats-grid-zone">
            <span class="sr-stat sr-stat-z1" data-filter="zone-1" role="button" tabindex="0" aria-pressed="false"><span>1 区</span><strong data-stat="zone-1">0</strong></span>
            <span class="sr-stat sr-stat-z2" data-filter="zone-2" role="button" tabindex="0" aria-pressed="false"><span>2 区</span><strong data-stat="zone-2">0</strong></span>
            <span class="sr-stat sr-stat-z3" data-filter="zone-3" role="button" tabindex="0" aria-pressed="false"><span>3 区</span><strong data-stat="zone-3">0</strong></span>
            <span class="sr-stat sr-stat-z4" data-filter="zone-4" role="button" tabindex="0" aria-pressed="false"><span>4 区</span><strong data-stat="zone-4">0</strong></span>
          </div>
          <span class="sr-stats-first" data-filter="first" role="button" tabindex="0" aria-pressed="false"><span>一作论文</span><strong data-stat="first">0</strong></span>
          <button type="button" class="sr-load-all">加载全部论文</button>
          <div class="sr-load-status" data-stat="load-status" role="status"></div>
          <div class="sr-stats-note" data-stat="note">点击分类可筛选 · 支持 * 标注的共同一作</div>
        </div>`;
      const toggleStats = (event) => {
        const collapsed = panel.classList.toggle('sr-stats-collapsed');
        event.currentTarget.textContent = collapsed ? '+' : '−';
        event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
        event.currentTarget.setAttribute('aria-label', collapsed ? '展开论文统计' : '收起论文统计');
      };
      const toggle = panel.querySelector('.sr-stats-toggle');
      toggle.addEventListener('click', toggleStats);
      toggle.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleStats(event);
      });
      panel.querySelectorAll('[data-filter]').forEach((button) => {
        const activateFilter = () => {
          if (button.getAttribute('aria-disabled') === 'true') return;
          const filter = button.dataset.filter;
          activeProfileFilter = activeProfileFilter === filter ? null : filter;
          renderProfileStats();
        };
        button.addEventListener('click', activateFilter);
        button.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          activateFilter();
        });
      });
      panel.querySelector('.sr-load-all').addEventListener('click', () => {
        if (loadAllRunning) {
          loadAllCancelled = true;
          loadAllState = '正在停止…';
          updateLoadAllControl(panel);
        } else {
          void loadAllPapers();
        }
      });
    }

    if (panel.parentNode !== host) host.appendChild(panel);
    panel.classList.add('sr-stats-integrated');
    return panel;
  }

  function setStat(panel, key, value) {
    const node = panel.querySelector(`[data-stat="${key}"]`);
    const text = String(value);
    if (node && node.textContent !== text) node.textContent = text;
  }

  function profileAuthorNames() {
    const profileName = (document.querySelector('#gsc_prf_in') || {}).textContent || '';
    return SRStats.profileNames([profileName, settings.authorAliases || '']);
  }

  function profileEntries() {
    const entries = [];
    for (const row of document.querySelectorAll('#gsc_a_b tr.gsc_a_tr')) {
      const data = profileRowData(row);
      entries.push({
        row,
        authors: data ? data.authors : '',
        result: data && data.venue ? ranking.lookup(data.venue) : null,
      });
    }
    return entries;
  }

  function moreButton() {
    return document.querySelector('#gsc_bpf_more');
  }

  function canLoadMore() {
    const button = moreButton();
    if (!button) return false;
    const style = getComputedStyle(button);
    return !button.disabled
      && button.getAttribute('aria-disabled') !== 'true'
      && !button.classList.contains('gs_dis')
      && style.display !== 'none'
      && style.visibility !== 'hidden';
  }

  function updateLoadAllControl(panel) {
    const button = panel && panel.querySelector('.sr-load-all');
    if (!button) return;

    let label = '加载全部论文';
    let disabled = false;
    if (loadAllRunning) label = loadAllCancelled ? '正在停止…' : `停止自动加载（${profileEntries().length} 篇）`;
    else if (!canLoadMore()) { label = '已加载全部'; disabled = true; }
    else if (loadAllState) label = '继续加载全部';

    if (button.textContent !== label) button.textContent = label;
    button.disabled = disabled;
    setStat(panel, 'load-status', loadAllState);
  }

  function waitForRowGrowth(before, timeout = 15000) {
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const count = document.querySelectorAll('#gsc_a_b tr.gsc_a_tr').length;
        if (loadAllCancelled || count > before || Date.now() - started >= timeout) {
          clearInterval(timer);
          resolve(count);
        }
      }, 250);
    });
  }

  function shortDelay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function loadAllPapers() {
    if (loadAllRunning || !canLoadMore()) return;
    loadAllRunning = true;
    loadAllCancelled = false;
    loadAllState = '正在自动加载，点击按钮可停止';
    renderProfileStats();

    let pages = 0;
    try {
      while (!loadAllCancelled && canLoadMore() && pages < 200) {
        const button = moreButton();
        const before = document.querySelectorAll('#gsc_a_b tr.gsc_a_tr').length;
        button.click();
        pages++;
        const after = await waitForRowGrowth(before);
        if (loadAllCancelled) break;
        if (after <= before) {
          loadAllState = '加载超时，请检查网络后重试';
          break;
        }
        annotateAll();
        await shortDelay(500);
      }

      if (loadAllCancelled) loadAllState = '已停止自动加载';
      else if (pages >= 200) loadAllState = '已达到单次加载上限（200 页）';
      else if (!canLoadMore()) loadAllState = '全部论文已加载';
    } catch (err) {
      loadAllState = '加载失败，请稍后重试';
      console.error('[学术分级标注] 自动加载失败:', err);
    } finally {
      loadAllRunning = false;
      loadAllCancelled = false;
      renderProfileStats();
    }
  }

  function renderProfileStats() {
    const entries = profileEntries();
    if (!settings.enabled || !settings.showOnProfile || !entries.length || !globalThis.SRStats) return;

    const names = profileAuthorNames();
    const summary = SRStats.summarize(entries, names);
    if (activeProfileFilter === 'first' && !summary.firstAuthorAvailable) activeProfileFilter = null;
    const panel = ensureStatsPanel();
    if (!panel) {
      activeProfileFilter = null;
      for (const item of entries) item.row.classList.remove('sr-row-filtered-out');
      return;
    }
    let visible = 0;
    for (const item of entries) {
      const matches = SRStats.matchesFilter(item, activeProfileFilter, names);
      item.row.classList.toggle('sr-row-filtered-out', !matches);
      if (matches) visible++;
    }
    setStat(panel, 'total', summary.total);
    setStat(panel, 'visible', visible);
    panel.querySelector('[data-stat-wrap="visible"]').hidden = !activeProfileFilter;
    setStat(panel, 'ccf-a', summary.ccf.A);
    setStat(panel, 'ccf-b', summary.ccf.B);
    setStat(panel, 'ccf-c', summary.ccf.C);
    for (const zone of [1, 2, 3, 4]) setStat(panel, `zone-${zone}`, summary.zones[zone]);
    setStat(panel, 'first', summary.firstAuthorAvailable ? summary.firstAuthor : '—');
    for (const button of panel.querySelectorAll('[data-filter]')) {
      const selected = button.dataset.filter === activeProfileFilter;
      const disabled = button.dataset.filter === 'first' && !summary.firstAuthorAvailable;
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-disabled', String(disabled));
      button.tabIndex = disabled ? -1 : 0;
    }
    setStat(panel, 'note', summary.firstAuthorAvailable
      ? '点击分类可筛选 · 支持 * 标注的共同一作'
      : '未识别主页姓名，可在设置中添加作者别名');
    updateLoadAllControl(panel);
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
      const cid = settings.resolveTruncated && truncatedUnmatched(venues) && citeIdOf(meta);
      if (!cid) { inject(meta, venues, meta, false); continue; }

      // 先占位，免得请求返回之前被重复处理；ticket 用来作废设置变更前发出的旧请求。
      meta.dataset[MARK] = '1';
      const ticket = meta.dataset[PENDING] = String(++pendingSeq);
      fullVenueOf(cid).then((full) => {
        if (!meta.isConnected || meta.dataset[PENDING] !== ticket) return;
        delete meta.dataset[PENDING];
        delete meta.dataset[MARK];
        const usable = full && venues.some((v) => ranking.lookup(v).truncated && SRNorm.completesTruncated(full, v));
        inject(meta, usable ? [full, ...venues] : venues, meta, false);
      });
    }
  }

  // ---- 2b. 截断出处补全 ----
  // 作者一多，.gs_a 里的出处会被截成 "Information …"，光凭剩下的词认不出是哪本刊。
  // 每条结果的「引用」浮层里有完整刊名，这里替用户取一次：走页面同源的接口，串行、带间隔，
  // 结果按标签页缓存；一旦取不到（验证码 / 限流），本页就不再尝试。
  const CITE_GAP_MS = 400;
  const CITE_STORE_PREFIX = 'sr-cite:';
  const citeJobs = new Map();      // cid -> Promise<string>，取不到时为空串
  let citeTail = Promise.resolve();
  let citeBlocked = false;
  let pendingSeq = 0;

  /** 出处被截断、且现有信息在三套数据里都对不上时，才值得去取完整刊名。 */
  function truncatedUnmatched(venues) {
    let truncated = false;
    for (const v of venues) {
      const r = ranking.lookup(v);
      if (r.kind !== 'normal' || r.ccf || r.core || r.journal) return false;
      if (r.truncated) truncated = true;
    }
    return truncated;
  }

  function citeIdOf(meta) {
    const result = meta.closest('[data-cid]');
    const cid = result ? result.dataset.cid : '';
    return /^[\w-]+$/.test(cid) ? cid : '';
  }

  async function fetchCiteVenue(cid) {
    if (citeBlocked) return '';
    try {
      const res = await fetch(`/scholar?q=info:${cid}:scholar.google.com/&output=cite&scirp=0&hl=en`, { credentials: 'same-origin' });
      const doc = res.ok ? new DOMParser().parseFromString(await res.text(), 'text/html') : null;
      const formats = doc ? [...doc.querySelectorAll('.gs_citr')] : [];
      // 一条引用格式都没有，说明被 Scholar 拦下了，继续请求只会更糟。
      if (!formats.length) { citeBlocked = true; return ''; }
      // MLA 排在最前，刊名 / 会议名是其中唯一的斜体；GB/T 7714 没有斜体，跳过。
      const italic = formats.map((f) => f.querySelector('i')).find(Boolean);
      return italic ? italic.textContent.replace(/\s+/g, ' ').trim() : '';
    } catch (err) {
      citeBlocked = true;
      return '';
    }
  }

  function fullVenueOf(cid) {
    if (citeJobs.has(cid)) return citeJobs.get(cid);
    let stored = null;
    try { stored = sessionStorage.getItem(CITE_STORE_PREFIX + cid); } catch (err) { /* 存储不可用就每次都取 */ }
    let job;
    if (stored !== null) {
      job = Promise.resolve(stored);
    } else {
      job = citeTail.then(() => fetchCiteVenue(cid)).then((venue) => {
        if (!citeBlocked) {
          try { sessionStorage.setItem(CITE_STORE_PREFIX + cid, venue); } catch (err) { /* 同上 */ }
        }
        return venue;
      });
      citeTail = job.then(() => (citeBlocked ? null : shortDelay(CITE_GAP_MS)));
    }
    citeJobs.set(cid, job);
    return job;
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
      renderProfileStats();
      annotateSearch();
      annotateDetail();
    } catch (err) {
      console.error('[学术分级标注] 注入失败:', err);
    }
  }

  /** 清掉已注入的徽章，用于设置变更后重绘。 */
  function clearAll() {
    loadAllCancelled = true;
    activeProfileFilter = null;
    loadAllState = '';
    document.querySelectorAll('.' + CONTAINER_CLASS).forEach((el) => el.remove());
    document.querySelectorAll('.' + STATS_PANEL_CLASS).forEach((el) => el.remove());
    document.querySelectorAll('.sr-row-filtered-out').forEach((el) => el.classList.remove('sr-row-filtered-out'));
    document.querySelectorAll('[data-sr-done]').forEach((el) => delete el.dataset[MARK]);
    document.querySelectorAll('[data-sr-pending]').forEach((el) => delete el.dataset[PENDING]);
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
