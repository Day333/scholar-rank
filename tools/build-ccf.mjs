// 从 https://ccf.atom.im/ 抓取「中国计算机学会推荐国际学术会议和期刊目录」并生成离线 JSON。
// 用法: node tools/build-ccf.mjs [输出路径]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SOURCE = 'https://ccf.atom.im/';
const OUT = resolve(process.argv[2] ?? 'src/data/ccf.json');

function decodeEntities(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const html = await (await fetch(SOURCE)).text();

const rows = html.match(/<tr class="item"[\s\S]*?<\/tr>/g) ?? [];
if (rows.length === 0) throw new Error('未匹配到任何 <tr class="item">，页面结构可能已变化');

const entries = [];
for (const row of rows) {
  const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => decodeEntities(m[1]));
  if (cells.length < 6) continue;
  const [, abbr, name, rank, type, field] = cells;
  const url = (row.match(/<a href="([^"]+)"/) ?? [])[1] ?? '';
  if (!abbr && !name) continue;
  if (!/^[ABC]$/.test(rank)) continue;
  entries.push({
    abbr,
    name,
    rank,
    type: type.includes('期刊') ? 'journal' : 'conference',
    field,
    url,
  });
}

const payload = {
  source: SOURCE,
  version: (html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? 'CCF',
  generatedAt: new Date().toISOString().slice(0, 10),
  count: entries.length,
  entries,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 0) + '\n', 'utf8');

const stats = entries.reduce((acc, e) => {
  const k = `${e.type}-${e.rank}`;
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});
console.log(`写入 ${OUT}`);
console.log(`共 ${entries.length} 条`, stats);
