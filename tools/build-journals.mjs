// 构建离线期刊数据集：中科院分区表升级版 + JCR 影响因子 + 国际期刊预警名单 + EI 收录目录。
//
// 数据来源（均为公开仓库/公开目录，见 README「数据来源与免责声明」）：
//   中科院分区表升级版 2025 / JCR 2025 / 预警名单 2025 -> github.com/hitfyd/ShowJCR
//   EI Compendex Source List           -> github.com/HiddenStrawberry/EI-COMPENDEX-SOURCE-LIST
//
// 用法: node tools/build-journals.mjs [输出路径]
//   环境变量 CACHE_DIR 可指定原始文件缓存目录，避免重复下载。

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.argv[2] ?? join(__dirname, '..', 'src', 'data', 'journals.json'));
const CACHE_DIR = process.env.CACHE_DIR ?? join(__dirname, '.cache');

// 复用扩展里的归一化实现，保证建库 key 与查库 key 完全一致。
(0, eval)(readFileSync(join(__dirname, '..', 'src', 'lib', 'normalize.js'), 'utf8'));
const { normalizeName } = globalThis.SRNorm;

const SHOWJCR = 'https://raw.githubusercontent.com/hitfyd/ShowJCR/master/'
  + encodeURIComponent('中科院分区表及JCR原始数据文件') + '/';

const SOURCES = {
  cas: SHOWJCR + 'FQBJCR2025-UTF8.csv',
  jcr: SHOWJCR + 'JCR2025-UTF8.csv',
  warn: SHOWJCR + 'GJQKYJMD2025.csv',
  ei: 'https://raw.githubusercontent.com/HiddenStrawberry/EI-COMPENDEX-SOURCE-LIST/master/readme.md',
};

async function fetchCached(name, url) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, name);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  process.stderr.write(`下载 ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(file, text, 'utf8');
  return text;
}

/** 最小 CSV 解析器：支持引号包裹、引号内逗号与换行、"" 转义。 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function toObjects(rows) {
  const [header, ...body] = rows;
  return body
    .filter((r) => r.length > 1 && r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** "3 [168/495]" -> 3 */
function zoneOf(s) {
  const m = /^\s*([1-4])\b/.exec(s ?? '');
  return m ? Number(m[1]) : 0;
}

/** " MATERIALS SCIENCE, MULTIDISCIPLINARY 材料科学：综合" -> "材料科学：综合" */
function chineseTail(s) {
  const m = /([一-龥][一-龥A-Za-z0-9：:·\-（）()]*)\s*$/.exec((s ?? '').trim());
  return m ? m[1].trim() : '';
}

function cleanIssn(s) {
  const v = (s ?? '').trim().toUpperCase();
  return /^\d{4}-\d{3}[\dX]$/.test(v) ? v : '';
}

const [casText, jcrText, warnText, eiText] = await Promise.all(
  Object.entries(SOURCES).map(([k, u]) => fetchCached(`${k}.txt`, u)),
);

/** key -> 记录。同 key 冲突时保留信息更完整的一条。 */
const db = new Map();
function slot(name) {
  const key = normalizeName(name);
  if (!key) return null;
  let rec = db.get(key);
  if (!rec) { rec = { n: name }; db.set(key, rec); }
  return rec;
}

// ---- 中科院分区表升级版 ----
let casCount = 0;
for (const r of toObjects(parseCSV(casText))) {
  const name = r['Journal'];
  if (!name) continue;
  const rec = slot(name);
  if (!rec) continue;
  const [issn, eissn] = (r['ISSN/EISSN'] ?? '').split('/');
  rec.n = name;
  if (cleanIssn(issn)) rec.issn = cleanIssn(issn);
  if (cleanIssn(eissn)) rec.eissn = cleanIssn(eissn);
  if (r['Web of Science']) rec.wos = r['Web of Science'];        // SCIE / SSCI / AHCI / ESCI
  if (r['大类']) rec.cat = r['大类'];                             // 大类中文名，如「计算机科学」
  const z = zoneOf(r['大类分区']);
  if (z) rec.zone = z;                                           // 1/2/3/4 区
  if (r['Top'] === '是') rec.top = 1;
  const sub = chineseTail(r['小类1']);
  const subZone = zoneOf(r['小类1分区']);
  if (sub && subZone) rec.sub = [sub, subZone];
  casCount++;
}

// ---- JCR 影响因子 ----
let jcrCount = 0;
for (const r of toObjects(parseCSV(jcrText))) {
  const name = r['Journal'];
  if (!name) continue;
  const rec = slot(name);
  if (!rec) continue;
  if (!rec.n || rec.n === rec.n.toUpperCase()) rec.n = rec.n || name;
  const ifv = parseFloat(r['IF(2025)']);
  if (Number.isFinite(ifv)) rec.if = ifv;
  const q = r['IF Quartile(2025)_1'];
  if (/^Q[1-4]$/.test(q)) rec.q = q;
  if (!rec.wos && r['Web of Science']) rec.wos = r['Web of Science'];
  if (!rec.issn && cleanIssn(r['ISSN'])) rec.issn = cleanIssn(r['ISSN']);
  if (!rec.eissn && cleanIssn(r['EISSN'])) rec.eissn = cleanIssn(r['EISSN']);
  jcrCount++;
}

// ---- 国际期刊预警名单 ----
let warnCount = 0;
for (const r of toObjects(parseCSV(warnText))) {
  const name = r['Journal'];
  if (!name) continue;
  const rec = slot(name);
  if (!rec) continue;
  rec.warn = Object.values(r)[1] || '预警';
  warnCount++;
}

// ---- EI Compendex 收录目录 ----
// readme.md 里是一段用 ``` 包住的纯列表，每行一个出版物名（右侧有制表符填充）。
let eiCount = 0;
{
  const block = /```([\s\S]*?)```/.exec(eiText);
  const lines = (block ? block[1] : eiText).split('\n');
  for (const line of lines) {
    const name = line.replace(/\t+/g, ' ').trim();
    if (!name || name.length < 3 || name.startsWith('#') || name.startsWith('http')) continue;
    const key = normalizeName(name);
    if (!key) continue;
    let rec = db.get(key);
    if (!rec) { rec = { n: name }; db.set(key, rec); }
    rec.ei = 1;
    eiCount++;
  }
}

const journals = {};
for (const [k, v] of db) journals[k] = v;

const payload = {
  generatedAt: new Date().toISOString().slice(0, 10),
  sources: {
    cas: '中科院分区表升级版 2025（github.com/hitfyd/ShowJCR）',
    jcr: 'JCR 2025 影响因子（github.com/hitfyd/ShowJCR）',
    warn: '国际期刊预警名单 2025（github.com/hitfyd/ShowJCR）',
    ei: 'EI Compendex Source List 2019（github.com/HiddenStrawberry/EI-COMPENDEX-SOURCE-LIST）',
  },
  count: db.size,
  journals,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload), 'utf8');

const withZone = [...db.values()].filter((v) => v.zone).length;
const withIf = [...db.values()].filter((v) => v.if != null).length;
const withEi = [...db.values()].filter((v) => v.ei).length;
console.log(`写入 ${OUT}`);
console.log(`  记录总数 ${db.size}  (中科院 ${casCount} / JCR ${jcrCount} / 预警 ${warnCount} / EI ${eiCount})`);
console.log(`  含大类分区 ${withZone}  含影响因子 ${withIf}  含 EI 标记 ${withEi}`);
console.log(`  文件大小 ${(readFileSync(OUT).length / 1024 / 1024).toFixed(2)} MB`);
