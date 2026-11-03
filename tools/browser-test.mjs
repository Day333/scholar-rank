// 在隔离的浏览器配置中验证真实 content scripts，不使用用户浏览器资料。
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
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
  assert.deepEqual(errors, [], '页面没有运行时异常');
  console.log('浏览器验证通过：末作、高亮、组合筛选、指标、动态加载、持久化、PNG 下载和剪贴板复制。');
  console.log(`预览与实际导出图片：${output}`);
} finally {
  await browser?.close();
  server.kill();
}
