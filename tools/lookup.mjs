// 命令行自测：node tools/lookup.mjs "Multimedia Systems 30 (6), 351"
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
(0, eval)(readFileSync(join(__dirname, '..', 'src', 'lib', 'normalize.js'), 'utf8'));
(0, eval)(readFileSync(join(__dirname, '..', 'src', 'lib', 'ranking.js'), 'utf8'));

const read = (f) => JSON.parse(readFileSync(join(__dirname, '..', 'src', 'data', f), 'utf8'));
const rank = new globalThis.SRRanking({
  ccf: read('ccf.json'),
  core: read('core.json'),
  journals: read('journals.json'),
  aliases: read('aliases.json'),
  tags: read('tags.json'),
});

if (rank.missingAliases.length) {
  console.warn('警告：以下别名指向了 CCF 目录里不存在的简称，已忽略：');
  for (const m of rank.missingAliases) console.warn('  ' + m);
}

const inputs = process.argv.slice(2);
const samples = inputs.length ? inputs : [
  'IEEE Transactions on Information Forensics and Security',
  'Multimedia Systems 30 (6), 351',
  'IEEE transactions on pattern analysis and machine intelligence 44 (11), 7436-7456',
  'Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition, 1-10',
  '2023 IEEE International Conference on Robotics and Automation (ICRA), 123-130',
  'Advances in Neural Information Processing Systems 36, 1-12',
  'arXiv preprint arXiv:2401.12345',
  'Nature 615 (7951), 234-240',
  'ACM Transactions on Graphics (TOG) 42 (4), 1-15',
  'Multimedia Tools and Applications 83 (2), 1-20',
  'Proceedings of the ACM Web Conference 2023, 1000-1010',
  'Proceedings of the 29th ACM SIGKDD Conference on Knowledge Discovery and Data …',
  'Proceedings of the VLDB Endowment 16 (4), 700-712',
  '32nd USENIX Security Symposium (USENIX Security 23), 1-18',
  'Proceedings of the AAAI Conference on Artificial Intelligence 38 (5), 4321-4329',
  'Proceedings of the 61st Annual Meeting of the Association for Computational …',
  'IEEE Internet of Things Journal 11 (3), 4000-4012',
  'Expert Systems with Applications 240, 122456',
  'Computers & Security 138, 103654',
];

for (const s of samples) {
  const r = rank.lookup(s);
  const badges = rank.badges(r).map((b) => `[${b.text}]`).join(' ');
  console.log(`\n${s}\n  matched: ${r.matchedName ?? '-'}  (via ${r.via ?? '-'})\n  ${badges || '(无)'}`);
}
