// 在隔离的浏览器配置中验证真实 content scripts，不使用用户浏览器资料。
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('./.cache/browser/', import.meta.url));
const executablePath = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean).find(existsSync);
assert.ok(executablePath, '请安装 Chrome / Edge，或通过 CHROME_PATH 指定浏览器');
await mkdir(output, { recursive: true });
const port = Number(process.env.SR_TEST_PORT || 8129);
const server = spawn(process.execPath, ['tools/serve.mjs', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

async function checkScreenshotAnnotations(page, png, theme) {
  const result = await page.evaluate(async ({ base64, theme }) => {
    const target = document.querySelector('#gsc_bdy');
    const bounds = target.getBoundingClientRect();
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const scale = canvas.width / Math.ceil(Math.max(bounds.width, target.scrollWidth));
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext('2d');
    const checks = [
      ['first CCF badge', '#gsc_a_b tr:first-child .sr-ccf-a', ['outline', 'minimal'].includes(theme) ? 'color' : 'backgroundColor'],
      ['last CCF badge', '#gsc_a_b tr:last-child .sr-ccf-a', ['outline', 'minimal'].includes(theme) ? 'color' : 'backgroundColor'],
      ['author highlight', '#gsc_a_b tr:first-child .sr-author-name', 'backgroundColor'],
      ['statistics', '.sr-stat-a', 'backgroundColor'],
    ];
    const regions = checks.map(([label, selector, property]) => {
      const element = document.querySelector(selector);
      const rect = element.getBoundingClientRect();
      colorContext.fillStyle = '#ffffff';
      colorContext.fillRect(0, 0, 1, 1);
      colorContext.fillStyle = getComputedStyle(element)[property];
      colorContext.fillRect(0, 0, 1, 1);
      const expected = [...colorContext.getImageData(0, 0, 1, 1).data].slice(0, 3);
      const x = Math.round((rect.left - bounds.left) * scale);
      const y = Math.round((rect.top - bounds.top) * scale);
      const width = Math.max(1, Math.floor(rect.width * scale));
      const height = Math.max(1, Math.floor(rect.height * scale));
      const inside = x >= 0 && y >= 0 && x + width <= canvas.width && y + height <= canvas.height;
      let matches = 0;
      if (inside) {
        const pixels = context.getImageData(x, y, width, height).data;
        for (let i = 0; i < pixels.length; i += 4) {
          if (expected.every((channel, c) => Math.abs(pixels[i + c] - channel) <= 2)) matches++;
        }
      }
      return { label, expected, matches, inside };
    });
    return { height: canvas.height, viewport: innerHeight, regions };
  }, { base64: png.toString('base64'), theme });
  assert.ok(result.height > result.viewport, '长列表导出覆盖屏幕之外的论文');
  for (const region of result.regions) {
    assert.ok(region.inside && region.matches >= 4,
      `${theme}: exported ${region.label} retains its visible styling: ${JSON.stringify(region)}`);
  }
}

let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('预览服务器启动超时')), 10000);
    server.once('error', (error) => { clearTimeout(timeout); reject(error); });
    server.stderr.on('data', (data) => { clearTimeout(timeout); reject(new Error(data.toString())); });
    server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
  });
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 },
    permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://localhost:${port}/test/fixture.html`);
  await page.waitForSelector('.sr-highlight-metrics');
  const stat = (key) => page.locator(`[data-stat="${key}"]`);
  const checkStat = async (key, value) => {
    await page.waitForFunction(({ key, value }) => document.querySelector(`[data-stat="${key}"]`)?.textContent === value,
      { key, value: String(value) });
  };
  const checkbox = (key) => page.locator(`[data-highlight="${key}"]`);
  await checkStat('highlight-papers', 1);
  assert.ok(await page.locator('tr.sr-row-highlighted').count() === 1);

  // 包含完整末作、截断列表、单作者、共一、零引用及缺失年份。
  await page.evaluate(() => {
    const rows = [
      ['first', 'K He, S Ren', 100, 2023, 'Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition'],
      ['last', 'S Ren, K He', 12, 2024, 'Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition'],
      ['truncated', 'S Ren, K He, ...', 40, 2024, 'Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition'],
      ['solo', 'K He', 11, 2025, 'Information Sciences'],
      ['undated', 'K He, S Ren', 0, '', 'Unknown Venue'],
      ['cofirst', 'Y Hu*, K He*, Z Other', 7, 2022, 'Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition'],
      ['middle', 'R Girshick, K He, J Sun', 3, 2024, 'Multimedia Systems'],
      ['other', 'A Name, B Name', 2, 2024, 'Unknown Venue'],
    ];
    const body = document.querySelector('#gsc_a_b tbody');
    body.replaceChildren();
    for (const [id, authors, citations, year, venue] of rows) {
      const row = document.createElement('tr');
      row.className = 'gsc_a_tr';
      row.dataset.testId = id;
      row.innerHTML = `<td class="gsc_a_t"><a class="gsc_a_at" href="/citations?citation_for_view=test:${id}">Test paper: ${id}</a><div class="gs_gray"></div><div class="gs_gray"></div></td><td class="gsc_a_c"><a class="gsc_a_ac"></a></td><td class="gsc_a_y"></td>`;
      row.querySelector('.gs_gray').textContent = authors;
      row.querySelectorAll('.gs_gray')[1].textContent = venue;
      row.querySelector('.gsc_a_ac').textContent = citations;
      row.querySelector('.gsc_a_y').textContent = year;
      body.append(row);
    }
    document.querySelector('[data-test-id="first"] .gs_gray').innerHTML = '<a id="author-link" href="#author"><span>K</span> He</a>, S Ren';
    document.querySelector('h1').textContent = '作者高亮 · 离线演示';
    document.querySelectorAll('p.note, #gs_res_ccl_mid').forEach((node) => { node.hidden = true; });
    document.querySelector('#gsc_prf_in').hidden = false;
  });
  await checkStat('total', 8);
  await checkStat('highlight-papers', 4);
  await checkStat('highlight-citations', 118);
  await checkStat('highlight-hIndex', 3);
  await checkStat('highlight-i10Index', 2);
  assert.equal(await page.locator('#author-link').count(), 1, '姓名高亮保留原有作者链接');
  assert.equal(await page.locator('#author-link mark').count(), 2, '姓名跨越多个文本节点时仍完整高亮');
  assert.equal(await page.locator('[data-test-id="first"] td').first().evaluate((node) => getComputedStyle(node).backgroundColor), 'rgb(255, 253, 224)');
  await checkbox('names').uncheck();
  await page.waitForFunction(() => !document.querySelector('.sr-author-name'));
  assert.equal(await page.locator('#author-link').textContent(), 'K He');
  await checkbox('names').check();
  await page.waitForSelector('.sr-author-name');

  await checkbox('last').check();
  await checkStat('highlight-papers', 5);
  await checkStat('highlight-citations', 130);
  await checkStat('highlight-hIndex', 4);
  await checkStat('highlight-i10Index', 3);
  assert.equal(await page.locator('[data-test-id="truncated"]').evaluate((node) => node.classList.contains('sr-row-highlighted')), false);
  await checkbox('first').uncheck();
  await checkStat('highlight-papers', 2);
  await checkStat('highlight-citations', 23);
  await checkbox('first').check();

  await checkbox('startYear').selectOption('2023');
  await checkbox('endYear').selectOption('2025');
  await checkStat('highlight-papers', 3);
  await checkStat('highlight-citations', 123);
  await page.locator('[data-filter="ccf-a"]').click();
  await checkStat('highlight-papers', 2);
  await checkStat('highlight-citations', 112);
  await checkbox('only').check();
  assert.equal(await page.locator('tr.gsc_a_tr:visible').count(), 2);
  await checkbox('startYear').selectOption('2025');
  await checkStat('highlight-papers', 0);
  assert.equal(await page.locator('tr.gsc_a_tr:visible').count(), 0);
  await checkbox('endYear').selectOption('2024');
  assert.equal(await checkbox('startYear').inputValue(), '2024', '倒置区间自动同步另一端点');
  await checkStat('highlight-papers', 1);
  await page.locator('.sr-year-reset').click();
  await page.locator('[data-filter="ccf-a"]').click();
  await checkStat('highlight-papers', 5);

  // 模拟 Scholar 动态「显示更多」，控件及当前选择保持不变。
  await page.evaluate(() => {
    const row = document.querySelector('[data-test-id="last"]').cloneNode(true);
    row.dataset.testId = 'loaded';
    row.querySelector('.gsc_a_at').href = '/citations?citation_for_view=test:loaded';
    row.querySelector('.gsc_a_at').textContent = 'Test paper: dynamically loaded';
    row.querySelector('.gsc_a_ac').textContent = '10';
    row.querySelector('.gsc_a_y').textContent = '2026';
    document.querySelector('#gsc_a_b tbody').append(row);
  });
  await checkStat('highlight-papers', 6);
  await checkStat('highlight-citations', 140);
  assert.equal(await page.locator('tr.gsc_a_tr:visible').count(), 6);
  assert.equal(await page.locator('.sr-stats-panel').count(), 1);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-export="download"]').click();
  const download = await downloadPromise;
  await download.saveAs(output + '/profile.png');
  await page.waitForFunction(() => document.querySelector('.sr-export-status').textContent === 'Screenshot downloaded.');
  const png = await readFile(output + '/profile.png');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.ok(png.readUInt32BE(16) >= 1400 && png.readUInt32BE(20) >= 650, '截图包含完整论文列表及侧栏');
  await page.locator('[data-export="copy"]').click();
  await page.waitForFunction(() => document.querySelector('.sr-export-status').textContent.includes('Screenshot copied.'));
  const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((item) => item.types));
  assert.ok(types.includes('image/png'), '剪贴板中存在真实 PNG 图片');
  await page.screenshot({ path: output + '/preview.png', fullPage: true });
  await page.locator('.sr-stats-panel').screenshot({ path: output + '/sidebar.png' });

  // 复制被拒时给出可恢复提示，仍可下载；划线引用不污染指标。
  await page.evaluate(() => {
    navigator.clipboard.write = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  });
  await page.locator('[data-export="copy"]').click();
  await page.waitForFunction(() => document.querySelector('.sr-export-status').textContent.includes('Clipboard access was denied.'));
  assert.equal(await page.locator('[data-export="download"]').isEnabled(), true);
  await page.evaluate(() => {
    document.querySelector('[data-test-id="loaded"] .gsc_a_ac').innerHTML = '<s>10</s>';
  });
  await checkStat('highlight-citations', 130);
  await checkStat('highlight-i10Index', 3);
  await checkbox('first').uncheck();
  await checkbox('last').uncheck();
  await checkStat('highlight-papers', 0);
  await checkbox('first').check();
  await checkbox('last').check();

  // 刷新后当前主页的角色、姓名、仅高亮与年份设置仍然保留。
  await checkbox('startYear').selectOption('2023');
  await page.reload();
  await page.waitForSelector('.sr-highlight-metrics');
  assert.equal(await checkbox('last').isChecked(), true);
  assert.equal(await checkbox('only').isChecked(), true);
  assert.equal(await checkbox('startYear').inputValue(), '2023');
  await page.evaluate(() => chrome.storage.sync.set({ enabled: false }));
  await page.waitForFunction(() => !document.querySelector('.sr-stats-panel'));
  assert.equal(await page.locator('.sr-author-name, .sr-row-highlighted, .sr-row-filtered-out').count(), 0, '关闭扩展清除全部高亮和筛选');
  await page.evaluate(() => chrome.storage.sync.set({ enabled: true }));
  await page.waitForSelector('.sr-highlight-metrics');

  // Issue #3 的真实姓名和作者行，加上末作及同姓误匹配对照。
  await checkbox('only').uncheck();
  await checkbox('last').uncheck();
  await page.locator('.sr-year-reset').click();
  const nameProfiles = [
    {
      name: 'Brett Beaulieu-Jones', first: 3, last: 1,
      rows: [
        ['BK Beaulieu-Jones, JH Moore, THEPROA ALS, CT CONSORTIUM', 'BK Beaulieu-Jones'],
        ['BK Beaulieu‐Jones, SG Finlayson, W Yuan, RB Altman, IS Kohane, ...', 'BK Beaulieu‐Jones'],
        ['B Beaulieu-Jones, SG Finlayson, C Chivers, I Chen, M McDermott, ...', 'B Beaulieu-Jones'],
        ['WS Liang, B Beaulieu-Jones, S Smalley, M Snyder, LH Goetz, NJ Schork', 'B Beaulieu-Jones'],
        ['Other Author, BK Beaulieu-Jones', 'BK Beaulieu-Jones'],
        ['BK Jones, BK Other-Jones, CK Beaulieu-Jones', ''],
        ['Other Author, BK Beaulieu-Jones, ...', 'BK Beaulieu-Jones'],
      ],
    },
    {
      name: 'Madeleine Torcasso (Durkee)', first: 2, last: 1,
      rows: [
        ['MS Torcasso, J Ai, T Cao, MR Clark, ML Giger', 'MS Torcasso'],
        ['MS Durkee, Other Author', 'MS Durkee'],
        ['D Liu, MS Torcasso, D Alonso-Caneiro, GR Untracht, JJ Drinkwater, Q Li, ...', 'MS Torcasso'],
        ['NE Wright, DE Kennedy, J Ai, ML Veselits, M Attaway, Y Yoon, MS Durkee, ...', 'MS Durkee'],
        ['Other Author, MS Durkee', 'MS Durkee'],
        ['JS Durkee, Other Author', ''],
        ['Durkee, Other Author', ''],
      ],
    },
  ];
  for (const profile of nameProfiles) {
    await page.evaluate(({ name, rows }) => {
      document.querySelector('#gsc_prf_in').textContent = name;
      const body = document.querySelector('#gsc_a_b tbody');
      body.replaceChildren();
      rows.forEach(([authors], index) => {
        const row = document.createElement('tr');
        row.className = 'gsc_a_tr';
        row.dataset.testId = `name-${index}`;
        row.innerHTML = `<td class="gsc_a_t"><a class="gsc_a_at" href="/citations?citation_for_view=test:name-${index}">Name regression ${index}</a><div class="gs_gray"></div><div class="gs_gray">Unknown Venue</div></td><td class="gsc_a_c">10</td><td class="gsc_a_y">2024</td>`;
        row.querySelector('.gs_gray').textContent = authors;
        body.append(row);
      });
    }, profile);
    await checkStat('total', profile.rows.length);
    await checkStat('first', profile.first);
    await checkStat('last', profile.last);
    await checkStat('highlight-papers', profile.first);
    for (const [index, [authors, expectedName]] of profile.rows.entries()) {
      const author = page.locator(`[data-test-id="name-${index}"] .gs_gray`).first();
      assert.equal(await author.textContent(), authors, '高亮保留作者行原文');
      assert.deepEqual(await author.locator('mark.sr-author-name').allTextContents(), expectedName ? [expectedName] : [],
        `${profile.name} 正确高亮 ${authors}`);
    }
    await checkbox('last').check();
    await checkbox('first').uncheck();
    await checkStat('highlight-papers', profile.last);
    await checkbox('only').check();
    assert.equal(await page.locator('tr.gsc_a_tr:visible').count(), profile.last, '末作筛选仍排除截断作者列表');
    await checkbox('only').uncheck();
    await checkbox('first').check();
    await checkbox('last').uncheck();
  }

  // 扩展注入的 CSS 不在页面 DOM 中；普通 <link> 预览无法覆盖克隆时丢样式的问题。
  const exportPage = await context.newPage();
  exportPage.on('pageerror', (error) => errors.push(error.message));
  await exportPage.setViewportSize({ width: 1440, height: 700 });
  await exportPage.goto(`http://localhost:${port}/test/fixture.html`);
  await exportPage.waitForSelector('.sr-highlight-metrics');
  await exportPage.evaluate((css) => {
    document.querySelector('link[href$="badges.css"]').remove();
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [sheet];
    const target = document.createElement('main');
    target.id = 'gsc_bdy';
    target.style.cssText = 'position:relative;width:1120px;margin:auto;';
    for (const element of [...document.body.children]) {
      if (element.tagName !== 'SCRIPT') target.append(element);
    }
    document.body.append(target);
    document.body.style.maxWidth = 'none';
    document.querySelectorAll('h1, p.note, #gs_res_ccl_mid').forEach((node) => { node.hidden = true; });
    document.querySelector('#gsc_rsb').style.cssText = 'position:absolute;top:0;right:0;width:280px;';
    document.querySelector('#gsc_a_b').style.width = '800px';
    const tbody = document.querySelector('#gsc_a_b tbody');
    tbody.replaceChildren();
    for (let i = 0; i < 30; i++) {
      const row = document.createElement('tr');
      row.className = 'gsc_a_tr';
      row.innerHTML = `<td class="gsc_a_t"><a class="gsc_a_at" href="/citations?citation_for_view=export:${i}">Screenshot regression paper ${i}</a><div class="gs_gray">K He, S Ren</div><div class="gs_gray">Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition</div></td><td class="gsc_a_c">10</td><td class="gsc_a_y">2024</td>`;
      tbody.append(row);
    }
  }, await readFile(root + '/src/content/badges.css', 'utf8'));
  await exportPage.waitForFunction(() => document.querySelector('[data-stat="total"]')?.textContent === '30');
  for (const theme of ['solid', 'soft', 'outline', 'minimal', 'square', 'mono']) {
    await exportPage.evaluate((theme) => chrome.storage.sync.set({ theme }), theme);
    await exportPage.waitForSelector(`.sr-badges.sr-theme-${theme}`);
    const downloadPromise = exportPage.waitForEvent('download').catch(() => null);
    await exportPage.locator('[data-export="download"]').click();
    await exportPage.waitForFunction(() => {
      const text = document.querySelector('.sr-export-status').textContent;
      return text && text !== 'Generating screenshot…';
    });
    assert.equal(await exportPage.locator('.sr-export-status').textContent(), 'Screenshot downloaded.', `${theme} screenshot succeeds`);
    const download = await downloadPromise;
    assert.ok(download, `${theme} produces a PNG download`);
    const path = `${output}/extension-styles-${theme}.png`;
    await download.saveAs(path);
    await checkScreenshotAnnotations(exportPage, await readFile(path), theme);
  }
  await exportPage.locator('[data-export="copy"]').click();
  await exportPage.waitForFunction(() => document.querySelector('.sr-export-status').textContent.includes('Screenshot copied.'));
  const clipboardPng = await exportPage.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const blob = await items.find((item) => item.types.includes('image/png')).getType('image/png');
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await writeFile(output + '/extension-styles-clipboard.png', Buffer.from(clipboardPng));
  await checkScreenshotAnnotations(exportPage, Buffer.from(clipboardPng), 'mono');
  await exportPage.screenshot({ path: output + '/extension-styles-preview.png', fullPage: true });
  await exportPage.close();
  assert.deepEqual(errors, [], '页面没有运行时异常');
  console.log('浏览器验证通过：外国姓名、一作/末作、高亮、组合筛选、指标、动态加载、持久化，以及六种徽章风格的长列表 PNG 和剪贴板图片。');
  console.log(`预览与实际导出图片：${output}`);
} finally {
  await browser?.close();
  server.kill();
}
