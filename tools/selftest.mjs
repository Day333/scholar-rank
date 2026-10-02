// 匹配回归测试：node tools/selftest.mjs
// 断言的是「徽章文本集合」，数据集更新导致 IF 变化时用 ~ 前缀做模糊断言。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
(0, eval)(readFileSync(join(__dirname, '..', 'src', 'lib', 'normalize.js'), 'utf8'));
(0, eval)(readFileSync(join(__dirname, '..', 'src', 'lib', 'ranking.js'), 'utf8'));
(0, eval)(readFileSync(join(__dirname, '..', 'src', 'lib', 'stats.js'), 'utf8'));

const read = (f) => JSON.parse(readFileSync(join(__dirname, '..', 'src', 'data', f), 'utf8'));
const rank = new globalThis.SRRanking({
  ccf: read('ccf.json'),
  core: read('core.json'),
  journals: read('journals.json'),
  aliases: read('aliases.json'),
  tags: read('tags.json'),
});

// [出处原文, 必须出现的徽章前缀...]
const CASES = [
  ['IEEE Transactions on Information Forensics and Security 19, 1-14', 'CCF A', '计算机科学TOP', 'EI检索', 'SCI升级版 计算机科学1区', 'IF '],
  ['Multimedia Systems 30 (6), 351', 'CCF C', 'EI检索', 'SCI升级版 计算机科学4区', 'IF '],
  ['IEEE transactions on pattern analysis and machine intelligence 44 (11), 7436-7456', 'CCF A', 'SCI升级版 计算机科学1区'],
  ['Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition, 1-10', 'CCF A', 'CORE A*'],
  ['Proceedings of the IEEE/CVF International Conference on Computer Vision, 1-9', 'CCF A', 'CORE A*'],
  ['2023 IEEE International Conference on Robotics and Automation (ICRA), 123-130', 'CCF B', 'CORE A*'],
  // 正式列入目录的 workshop 本身仍须正常标注，不能被二级轨道规则误伤
  ['IEEE/ACM International Workshop on Quality of Service, 2024', 'CCF B', 'CORE B'],
  ['USENIX Workshop on Hot Topics in Storage and File Systems, 2024', 'CCF C'],
  ['Advances in Neural Information Processing Systems 36, 1-12', 'ML三大顶会', 'CCF A', 'CORE A*'],
  ['Advances in Neural Information Processing System (NeurIPS 2026)', 'ML三大顶会', 'CCF A', 'CORE A*'],
  // tags.json 里的自定义标记
  ['International Conference on Machine Learning, 1000-1010', 'ML三大顶会', 'CCF A', 'CORE A*'],
  ['Proceedings of the International Conference on Learning Representations, 1-12', 'ML三大顶会', 'CCF A'],
  ['ICML 2024 - Proceedings of the 41st International Conference on Machine …', 'ML三大顶会', 'CCF A'],
  ['Proceedings of the ACM Web Conference 2023, 1000-1010', 'CCF A', 'CORE A*'],
  ['Proceedings of the 29th ACM SIGKDD Conference on Knowledge Discovery and Data Mining', 'CCF A', 'CORE A*'],
  ['Proceedings of the VLDB Endowment 16 (4), 700-712', '数据库四大', 'CCF A', 'CORE A*'],
  // 数据库四大：SIGMOD 的出处写法尤其杂（PACMMOD / 会议录 / 截断）
  ['Proceedings of the ACM on Management of Data 1 (2), 1-25', '数据库四大', 'CCF A', 'CORE A*'],
  ['Proceedings of the 2023 International Conference on Management of Data, 100-112', '数据库四大', 'CCF A'],
  ['Proceedings of the 2023 ACM SIGMOD International Conference on Management of …', '数据库四大', 'CCF A'],
  ['2023 IEEE 39th International Conference on Data Engineering (ICDE), 1-13', '数据库四大', 'CCF A', 'CORE A*'],
  ['Proceedings of the 42nd ACM SIGMOD-SIGACT-SIGAI Symposium on Principles of Database Systems, 1-12', '数据库四大', 'CCF B', 'CORE A*'],
  // 名字很像但不是四大之一，必须还认得出自己
  ['2022 IEEE International Conference on Mobile Data Management (MDM), 1-6', 'CCF C'],
  // 预印本：单独标出平台名，不参与分级
  ['arXiv preprint arXiv:2401.12345', 'arXiv'],
  ['bioRxiv, 2023.01.01.522000', 'bioRxiv'],
  ['medRxiv, 2023.05.01.23289000', 'medRxiv'],
  ['SSRN Electronic Journal', 'SSRN'],
  ['Research Square preprint', 'Research Square'],
  ['32nd USENIX Security Symposium (USENIX Security 23), 1-18', 'CCF A', 'CORE A*'],
  ['Proceedings of the AAAI Conference on Artificial Intelligence 38 (5), 4321-4329', 'CCF A', 'CORE A*'],
  ['Proceedings of the 61st Annual Meeting of the Association for Computational Linguistics', 'CCF A', 'CORE A*'],
  ['ACM Transactions on Graphics (TOG) 42 (4), 1-15', 'CCF A', 'SCI升级版 计算机科学1区'],
  ['IEEE Internet of Things Journal 11 (3), 4000-4012', 'CCF C', 'SCI升级版 计算机科学2区'],
  ['Expert Systems with Applications 240, 122456', 'CCF C', 'SCI升级版 计算机科学1区'],
  ['Computers & Security 138, 103654', 'CCF B', 'SCI升级版 计算机科学2区'],
  ['Nature 615 (7951), 234-240', 'SCI升级版 综合性期刊1区'],
  // CORE 特有：CCF 目录里没有，但 CORE 收了
  ['Proceedings of the IEEE/CVF Winter Conference on Applications of Computer Vision, 1-10', 'CORE A'],
  ['International Conference on Artificial Intelligence and Statistics, 100-110', 'CORE A'],
  // Scholar 会把过长的出处截断成 "… "，此时全称对不上，要靠前导简称 / 前缀匹配兜底
  ['ICASSP 2026-2026 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP), 1-5', 'CCF B'],
  ['ICASSP 2026-2026 IEEE International Conference on Acoustics, Speech and …', 'CCF B'],
  ['ICASSP 2026 - 2026 IEEE International Conference on …', 'CCF B'],
  ['CVPR 2024 - 2024 IEEE/CVF Conference on Computer Vision and Pattern …', 'CCF A', 'CORE A*'],
  ['IEEE Transactions on Information Forensics and Sec…', 'CCF A', 'SCI升级版 计算机科学1区'],
  ['Proceedings of the 61st Annual Meeting of the Association for Computational …', 'CCF A', 'CORE A*'],
  // 作者一多，Scholar 连出处的开头也会截掉，剩下的是名称中间一段：按片段匹配，不能当前缀
  ['… on Pattern Analysis and Machine Intelligence', 'CCF A', '计算机科学TOP', 'SCI升级版 计算机科学1区'],
  ['… on Pattern Analysis and …', 'CCF A', '计算机科学TOP', 'SCI升级版 计算机科学1区'],
  ['… Pattern Analysis and …', 'CCF A', '计算机科学TOP', 'SCI升级版 计算机科学1区'],
  ['… on Information Forensics and Sec…', 'CCF A', 'SCI升级版 计算机科学1区'],
  ['… Vision and Pattern Recognition', 'CCF A', 'CORE A*'],
  ['… ACM SIGKDD Conference on Knowledge Discovery and Data …', 'CCF A', 'CORE A*'],
  // IEEE Early Access 没有卷号，卷的位置写的是 PP
  ['IEEE Transactions on Pattern Analysis and Machine Intelligence PP (99), 1-18', 'CCF A', 'SCI升级版 计算机科学1区'],
  // PAA 自己不能被上面的规则误伤
  ['Pattern Analysis and Applications 27 (1), 12', 'CCF C', 'SCI升级版 计算机科学4区'],
  ['Pattern Analysis and Applic…', 'CCF C', 'SCI升级版 计算机科学4区'],
  // 截断后剩下的恰好是完整名称，且没有别的名称以它开头：照常认
  ['Information Sciences …', 'CCF B', 'SCI升级版 计算机科学2区'],
  ['Proceedings of the IEEE/CVF conference on computer vision and pattern recognition …', 'CCF A', 'CORE A*'],
  // 省略号跟在卷期页码后面，截掉的只是页码
  ['Proceedings of the AAAI Conference on Artificial Intelligence 38 (5), 4321 …', 'CCF A', 'CORE A*'],
  // CORE 简称与 CCF 不一致，靠 aliases.ccfToCore 桥接
  ['Proceedings of the 31st ACM International Conference on Multimedia, 1-10', 'CCF A', 'CORE A*'],
  ['2023 IEEE Symposium on Security and Privacy (SP), 1-19', 'CCF A', 'CORE A*'],
  ['Usenix Annual Technical Conference, 1-14', 'CCF A', 'CORE A'],
];

// 这些出处不应产生任何徽章
const NEGATIVE = [
  'PhD thesis, Tsinghua University',
  '',
  // 截断得只剩共同前缀时，前缀不唯一，宁可不认也不能瞎猜
  'IEEE Transactions on …',
  'Proceedings of the …',
  'Journal of …',
  // PAA 与倒装写法的 TPAMI（Pattern Analysis and Machine Intelligence, IEEE Transactions on）共用这个开头
  'Pattern Analysis and …',
  // 开头被截掉后剩下的片段对得上不止一个出处：TIP / ICIP、ICCV / ECCV / ACCV、TPAMI / Nature MI
  '… on Image Processing',
  '… Conference on Computer Vision',
  '… Machine Intelligence',
  '… Analysis …',
  // 名称没写完，剩下的词恰好是另一本期刊的全名：Information Sciences / Fusion ≠ Information，
  // Nature Communications ≠ Nature，Pattern Recognition Letters ≠ Pattern Recognition
  'Information …',
  'Nature …',
  'Pattern Recognition …',
  // 主会附属轨道不能继承主会等级
  'Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition Workshops, 2024',
  'CVPR 2024 Workshops, 1-8',
  'Findings of the Association for Computational Linguistics: EMNLP 2024',
  'Companion Proceedings of the ACM Web Conference 2024',
  'Extended Abstracts of the 2024 CHI Conference on Human Factors in Computing Systems',
  'CVPR 2024 Demo Track',
];

// [出处原文, 不允许出现的徽章前缀...]
const FORBIDDEN = [
  ['Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition, 1-10', 'ML三大顶会', '数据库四大'],
  ['Nature 615 (7951), 234-240', 'ML三大顶会', '数据库四大', 'CCF', 'CORE'],
  ['International Conference on Neural Information Processing, 1-10', 'ML三大顶会'],
  ['Advances in Neural Information Processing Systems 36, 1-12', '数据库四大', 'arXiv'],
  // 预印本只出平台徽章，绝不能带上任何分级
  ['arXiv preprint arXiv:2401.12345', 'CCF', 'CORE', 'SCI', 'EI', 'IF '],
  // MDM 的全称和 SIGMOD 会议录只差几个词，早先会被模糊匹配吃掉
  ['2022 IEEE International Conference on Mobile Data Management (MDM), 1-6', '数据库四大'],
  ['Proceedings of the 2023 International Conference on Management of Data, 100-112', 'CCF C'],
  // TPAMI 被截得只剩中间一段时，早先会按前缀唯一命中 PAA（CCF C / 4 区）
  ['… on Pattern Analysis and …', 'CCF C', 'SCI升级版 计算机科学4区'],
  // CVPR 的尾巴恰好等于期刊 Pattern Recognition（CCF B）的全名
  ['… and Pattern Recognition', 'CCF B', 'SCI', 'IF '],
  // 可能是 Artificial Intelligence Review / in Medicine，不能按期刊 Artificial Intelligence（CCF A）标
  ['Artificial Intelligence …', 'CCF', 'SCI', 'IF '],
];

// 搜索结果页的 .gs_a 整行文本 -> 必须出现的徽章前缀。
//   是 Scholar 用来包住分隔短横线的不换行空格。
const NB = ' ';
const BYLINES = [
  // 标准三段：作者 - 出处, 年份 - 站点
  [`J Hu, L Shen, G Sun${NB}-${NB}IEEE transactions on pattern analysis and machine intelligence, 2019${NB}-${NB}ieeexplore.ieee.org`,
    'CCF A', '计算机科学TOP', 'SCI升级版 计算机科学1区'],
  // 没有站点段
  [`N Shinn, F Cassano, A Gopinath…${NB}-${NB}Advances in neural information processing systems, 2023`,
    'ML三大顶会', 'CCF A', 'CORE A*'],
  // 预印本
  [`C Packer, S Wooders, K Lin, V Fang…${NB}-${NB}arXiv preprint arXiv:2310.08560, 2023${NB}-${NB}arxiv.org`, 'arXiv'],
  // 作者名里自带短横线，出处被挤到第三段
  [`J Smith-Jones, A Lee${NB}-${NB}Nature, 2015${NB}-${NB}nature.com`, '综合性期刊TOP', 'SCI升级版 综合性期刊1区'],
  // 会议全称很长且带年份
  [`JS Park, J O'Brien, CJ Cai…${NB}-${NB}Proceedings of the 36th annual ACM symposium on user interface software and technology, 2023${NB}-${NB}dl.acm.org`,
    'CCF A', 'CORE A*'],
  // 出处两头都被截断
  [`Y Yan, S Zheng, Z Zhu, D Chen, W Zhang…${NB}-${NB}… on Pattern Analysis and …, 2026${NB}-${NB}ieeexplore.ieee.org`,
    'CCF A', '计算机科学TOP', 'SCI升级版 计算机科学1区'],
];

// 这些 .gs_a 不该产生徽章（图书条目只有作者和年份）
const BYLINES_EMPTY = [
  `I Goodfellow, Y Bengio, A Courville${NB}-${NB}2016${NB}-${NB}books.google.com`,
  'Some Author Without Any Separator',
  // Information Sciences 被截得只剩第一个词，不能标成期刊 Information
  `H Zhang, X Li, Y Wang, J Chen…${NB}-${NB}Information …, 2026${NB}-${NB}Elsevier`,
];

let failed = 0;

for (const [venue, ...expected] of CASES) {
  const texts = rank.badges(rank.lookup(venue)).map((b) => b.text);
  const missing = expected.filter((e) => !texts.some((t) => t.startsWith(e)));
  if (missing.length) {
    failed++;
    console.error(`FAIL  ${venue}\n      期望包含 ${JSON.stringify(missing)}\n      实际 ${JSON.stringify(texts)}`);
  } else {
    console.log(`ok    ${venue.slice(0, 62)}  ->  ${texts.join(' ')}`);
  }
}

// 搜索结果页：先按 .gs_a 拆出候选，再取第一个查得到的
function badgesForByline(line) {
  const venues = globalThis.SRNorm.venuesFromByline(line);
  for (const v of venues) {
    const texts = rank.badges(rank.lookup(v)).map((b) => b.text);
    if (texts.length) return texts;
  }
  return [];
}

for (const [line, ...expected] of BYLINES) {
  const texts = badgesForByline(line);
  const missing = expected.filter((e) => !texts.some((t) => t.startsWith(e)));
  if (missing.length) {
    failed++;
    console.error(`FAIL  [.gs_a] ${line}\n      期望包含 ${JSON.stringify(missing)}\n      实际 ${JSON.stringify(texts)}`);
  } else {
    console.log(`ok    [.gs_a] ${line.slice(0, 48)}  ->  ${texts.join(' ')}`);
  }
}

for (const line of BYLINES_EMPTY) {
  const texts = badgesForByline(line);
  if (texts.length) {
    failed++;
    console.error(`FAIL  [.gs_a] ${line}\n      期望无徽章，实际 ${JSON.stringify(texts)}`);
  } else {
    console.log(`ok    [.gs_a] ${line.slice(0, 48)}  ->  (无徽章)`);
  }
}

for (const [venue, ...banned] of FORBIDDEN) {
  const texts = rank.badges(rank.lookup(venue)).map((b) => b.text);
  const leaked = banned.filter((b) => texts.some((t) => t.startsWith(b)));
  if (leaked.length) {
    failed++;
    console.error(`FAIL  ${venue}\n      不应出现 ${JSON.stringify(leaked)}\n      实际 ${JSON.stringify(texts)}`);
  } else {
    console.log(`ok    ${venue.slice(0, 50)}  ->  未误报 ${JSON.stringify(banned)}`);
  }
}

for (const venue of NEGATIVE) {
  const texts = rank.badges(rank.lookup(venue)).map((b) => b.text);
  if (texts.length) {
    failed++;
    console.error(`FAIL  ${venue || '(空)'}\n      期望无徽章，实际 ${JSON.stringify(texts)}`);
  } else {
    console.log(`ok    ${venue || '(空)'}  ->  (无徽章)`);
  }
}

let statsChecks = 0;
function checkStats(condition, message) {
  statsChecks++;
  if (condition) {
    console.log(`ok    [统计] ${message}`);
  } else {
    failed++;
    console.error(`FAIL  [统计] ${message}`);
  }
}

checkStats(globalThis.SRStats.isFirstAuthor('K Ding, Y Hu, H Wang', 'Kuiye Ding'), '缩写作者名可识别一作');
checkStats(globalThis.SRStats.isFirstAuthor('K Ding, Y Hu, H Wang', 'Ding Kuiye'), '兼容主页姓名的姓氏前置写法');
checkStats(!globalThis.SRStats.isFirstAuthor('Y Hu, K Ding, H Wang', 'Kuiye Ding'), '非首位作者不计为一作');
checkStats(
  globalThis.SRStats.isFirstAuthor('Yuqi Li*, Kuiye Ding*, Chuanguang Yang, Szu-Yu Chen, Yingli Tian', 'Kuiye Ding')
    && !globalThis.SRStats.isFirstAuthor('Yuqi Li*, Kuiye Ding*, Chuanguang Yang, Szu-Yu Chen, Yingli Tian', 'Chuanguang Yang'),
  '星号标注的连续作者可识别为共同一作',
);
checkStats(globalThis.SRStats.isFirstAuthor('Q Ding, Y Hu', ['Kuiye Ding', 'Q Ding']), '作者别名可补充一作识别');

const parsedNames = globalThis.SRStats.profileNames('Ding, Kuiye\nK Ding；K Ding');
checkStats(parsedNames.length === 2 && parsedNames[0] === 'Ding, Kuiye', '作者别名按行解析、去重并保留姓名中的逗号');

const filterItem = {
  authors: 'K Ding, Y Hu',
  result: { ccf: { rank: 'A' }, journal: { zone: 1 } },
};
checkStats(globalThis.SRStats.matchesFilter(filterItem, 'ccf-a', 'Kuiye Ding'), 'CCF 分类筛选正确');
checkStats(globalThis.SRStats.matchesFilter(filterItem, 'zone-1', 'Kuiye Ding'), '中科院分区筛选正确');
checkStats(
  globalThis.SRStats.matchesFilter(filterItem, 'first', ['Kuiye Ding'])
    && !globalThis.SRStats.matchesFilter(filterItem, 'ccf-b', ['Kuiye Ding']),
  '一作筛选正确且不会混入其他分类',
);

const statsSummary = globalThis.SRStats.summarize([
  { authors: 'K Ding, Y Hu', result: { ccf: { rank: 'A' }, journal: { zone: 1 } } },
  { authors: 'Y Hu, K Ding', result: { ccf: { rank: 'B' }, journal: { zone: 2 } } },
  { authors: 'Kuiye Ding, H Wang', result: { ccf: { rank: 'C' } } },
  { authors: 'S Ren, K He', result: { journal: { zone: 4 } } },
], 'Kuiye Ding');
checkStats(
  statsSummary.total === 4
    && statsSummary.ccf.A === 1 && statsSummary.ccf.B === 1 && statsSummary.ccf.C === 1
    && statsSummary.zones[1] === 1 && statsSummary.zones[2] === 1
    && statsSummary.zones[3] === 0 && statsSummary.zones[4] === 1
    && statsSummary.firstAuthor === 2,
  'CCF、分区与一作汇总正确',
);

// 截断出处补全：从「引用」浮层取回的完整出处必须和页面上被截断的那段对得上
const { completesTruncated } = globalThis.SRNorm;
checkStats(completesTruncated('Information Sciences', 'Information …'), '完整刊名接得上被截断的开头');
checkStats(
  completesTruncated('IEEE Transactions on Pattern Analysis and Machine Intelligence', '… on Pattern Analysis and …'),
  '完整刊名包含两头被截断的片段',
);
checkStats(!completesTruncated('Pattern recognition', 'Information …'), '对不上的斜体（如书名）不采用');

if (rank.missingAliases.length) {
  failed++;
  console.error('FAIL  aliases.json 里存在指向不存在 CCF 简称的别名：');
  for (const m of rank.missingAliases) console.error('      ' + m);
}

const total = CASES.length + BYLINES.length + BYLINES_EMPTY.length + FORBIDDEN.length + NEGATIVE.length + statsChecks;
console.log(`\n${total} 项，失败 ${failed} 项`);
process.exit(failed ? 1 : 0);
