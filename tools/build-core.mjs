// 抓取 CORE Conference Rankings（澳大利亚 CORE 会议分级）并生成离线 JSON。
//
// 数据来自 https://portal.core.edu.au/conf-ranks/ 页面上的 Export 按钮，
// 它是一个 GET 接口，会一次性导出该版本的全部会议（忽略分页）。
//
// 用法: node tools/build-core.mjs [输出路径]
//   环境变量 CORE_SOURCE 可指定版本，默认 ICORE2026。

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.argv[2] ?? join(__dirname, '..', 'src', 'data', 'core.json'));
const SOURCE = process.env.CORE_SOURCE ?? 'ICORE2026';
const URL_ = `https://portal.core.edu.au/conf-ranks/?search=&by=all&source=${SOURCE}&sort=atitle&page=1&do=Export`;

// CORE 用 ANZSRC 2020 的 Field of Research 代码标注领域，导出的 CSV 里只有数字。
const FOR_NAMES = {
  4601: '应用计算',
  4602: '人工智能',
  4603: '计算机视觉与多媒体计算',
  4604: '网络空间安全',
  4605: '数据管理与数据科学',
  4606: '分布式计算与系统软件',
  4607: '图形学、增强现实与游戏',
  4608: '人机交互',
  4609: '信息系统',
  4610: '图书情报学',
  4611: '机器学习',
  4612: '软件工程',
  4613: '计算理论',
  CSE: '计算机科学与工程（旧分类）',
};

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

/**
 * CORE 门户里的 Rank 字段写法很乱（National:China / National: China / unranked / Unranked …），
 * 这里统一成扩展只需要认识的几档，原始值留在 rankRaw 里给 tooltip 用。
 */
function normalizeRank(raw) {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (/^a\*$/i.test(s)) return 'A*';
  if (/^a$/i.test(s)) return 'A';
  if (/^b$/i.test(s)) return 'B';
  if (/^c$/i.test(s)) return 'C';
  const aus = /^australasian\s*([abc])$/i.exec(s);
  if (aus) return 'Australasian ' + aus[1].toUpperCase();
  if (/^national/i.test(s)) return 'National';
  if (/^regional/i.test(s)) return 'Regional';
  if (/^(unranked|journal published|multiconference)/i.test(s)) return 'Unranked';
  return 'Other';
}

const res = await fetch(URL_);
if (!res.ok) throw new Error(`${URL_} -> HTTP ${res.status}`);
const csv = await res.text();

// 导出的 CSV 没有表头，列依次是：
// id, Title, Acronym, Source, Rank, DBLP(Yes/No), FoR1, FoR2, FoR3
const entries = [];
const rankCount = {};
for (const cols of parseCSV(csv)) {
  if (cols.length < 5) continue;
  const [, title, acronym, source, rawRank, , ...fors] = cols;
  const name = (title ?? '').trim();
  const abbr = (acronym ?? '').trim();
  const r = (rawRank ?? '').trim();
  if (!name || !r) continue;
  const rank = normalizeRank(r);
  rankCount[rank] = (rankCount[rank] ?? 0) + 1;
  const fields = fors
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => FOR_NAMES[f] ?? FOR_NAMES[Number(f)] ?? f);
  const entry = { abbr, name, rank, source: (source ?? '').trim(), field: fields.join('/') };
  if (rank !== r) entry.rankRaw = r;
  entries.push(entry);
}

if (!entries.length) throw new Error('导出内容为空，CORE 门户的接口可能变了');

const payload = {
  source: `https://portal.core.edu.au/conf-ranks/ (${SOURCE})`,
  version: SOURCE,
  generatedAt: new Date().toISOString().slice(0, 10),
  count: entries.length,
  entries,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload), 'utf8');

console.log(`写入 ${OUT}`);
console.log(`  共 ${entries.length} 条（${SOURCE}）`);
console.log('  等级分布:', Object.entries(rankCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  '));
