(async function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const inputs = [...document.querySelectorAll('[data-key]')];

  const settings = await SRSettings.load();
  let theme = settings.theme;

  for (const el of inputs) {
    const key = el.dataset.key;
    if (el.type === 'checkbox') el.checked = !!settings[key];
    else el.value = settings[key];
    el.addEventListener('change', onChange);
    el.addEventListener('input', onChange);
  }

  function currentValues() {
    const out = { theme };
    for (const el of inputs) {
      out[el.dataset.key] = el.type === 'checkbox' ? el.checked : Number(el.value);
    }
    return out;
  }

  function onChange() {
    const values = currentValues();
    $('#scaleOut').textContent = values.badgeScale + '%';
    SRSettings.save(values);
    syncThemeCards();
    if (ranking) {
      ranking.options = Object.assign({}, ranking.options, values);
      renderProbe();
    }
  }
  $('#scaleOut').textContent = settings.badgeScale + '%';

  // ---- 外观风格选择卡 ----
  // 每张卡片直接用它所代表的风格渲染同一组样例徽章，所见即所得。
  const SAMPLE = [
    ['ML三大顶会', 'sr-tag-rose'],
    ['CCF A', 'sr-ccf-a'],
    ['CORE A*', 'sr-core-astar'],
    ['EI检索', 'sr-ei'],
    ['SCI升级版 计算机科学1区', 'sr-zone-1'],
    ['IF 8.7', 'sr-if'],
  ];

  function sampleBadges(themeId, bold) {
    const box = document.createElement('div');
    box.className = 'sr-badges ' + SRSettings.themeClass(themeId) + (bold ? ' sr-bold' : '');
    for (const [text, cls] of SAMPLE) {
      const span = document.createElement('span');
      span.className = 'sr-badge ' + cls;
      span.textContent = text;
      box.appendChild(span);
    }
    return box;
  }

  const grid = $('#themeGrid');
  for (const t of SRSettings.THEMES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'theme-card';
    card.dataset.theme = t.id;
    card.setAttribute('aria-pressed', String(t.id === theme));

    const name = document.createElement('div');
    name.className = 'theme-name';
    name.textContent = t.name;
    const desc = document.createElement('div');
    desc.className = 'theme-desc';
    desc.textContent = t.desc;

    card.append(name, desc, sampleBadges(t.id, settings.boldBadges));
    card.addEventListener('click', () => { theme = t.id; onChange(); });
    grid.appendChild(card);
  }

  function syncThemeCards() {
    const bold = currentValues().boldBadges;
    for (const card of grid.querySelectorAll('.theme-card')) {
      const id = card.dataset.theme;
      card.setAttribute('aria-pressed', String(id === theme));
      card.querySelector('.sr-badges').replaceWith(sampleBadges(id, bold));
    }
  }

  // ---- 数据集 + 自测 ----
  const load = (p) => fetch(chrome.runtime.getURL(p)).then((r) => r.json());
  let ranking = null;

  const [ccf, core, journals, aliases, tags] = await Promise.all([
    load('src/data/ccf.json'),
    load('src/data/core.json'),
    load('src/data/journals.json'),
    load('src/data/aliases.json'),
    load('src/data/tags.json'),
  ]);
  ranking = new SRRanking({ ccf, core, journals, aliases, tags }, currentValues());

  // 「显示哪些徽章」里为每个自定义标记补一行说明
  const tagList = $('#tagList');
  for (const g of (tags.groups || [])) {
    const li = document.createElement('div');
    li.className = 'tag-item';
    const chip = document.createElement('span');
    chip.className = `sr-badge ${g.cls || 'sr-tag-rose'}`;
    chip.textContent = g.label;
    const desc = document.createElement('span');
    desc.className = 'tag-desc';
    desc.textContent = g.desc || '';
    li.append(chip, desc);
    tagList.appendChild(li);
  }

  const info = $('#datasetInfo');
  info.innerHTML = '';
  const lines = [
    [ccf.version || 'CCF 推荐目录', `${ccf.count} 条，抓取自 ${ccf.source}（${ccf.generatedAt}）`],
    [`CORE 会议分级（${core.version}）`, `${core.count} 条，抓取自 portal.core.edu.au（${core.generatedAt}）`],
    ['期刊数据集', `${journals.count} 条，构建于 ${journals.generatedAt}`],
    ...Object.values(journals.sources || {}).map((s) => ['　└', s]),
  ];
  for (const [k, v] of lines) {
    const div = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = k + '：';
    div.appendChild(b);
    div.appendChild(document.createTextNode(v));
    info.appendChild(div);
  }

  const probe = $('#probe');
  const probeResult = $('#probeResult');

  function renderProbe() {
    const raw = probe.value.trim();
    probeResult.textContent = '';
    if (!raw) return;
    const result = ranking.lookup(raw);
    const badges = ranking.badges(result);

    const meta = document.createElement('div');
    if (result.kind !== 'normal') meta.textContent = `识别为「${result.kind === 'preprint' ? '预印本' : result.kind}」，不参与分级`;
    else if (result.matchedName) meta.textContent = `命中：${result.matchedName}${result.via ? `（${result.via}）` : ''}`;
    else meta.textContent = '未匹配到任何条目';
    probeResult.appendChild(meta);

    if (!badges.length) return;
    const values = currentValues();
    const box = document.createElement('div');
    box.className = 'sr-badges ' + SRSettings.themeClass(values.theme) + (values.boldBadges ? ' sr-bold' : '');
    for (const b of badges) {
      const span = document.createElement('span');
      span.className = `sr-badge ${b.cls}`;
      span.textContent = b.text;
      span.title = b.title;
      box.appendChild(span);
    }
    probeResult.appendChild(box);
  }

  probe.addEventListener('input', renderProbe);
})();
