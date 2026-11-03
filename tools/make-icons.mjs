// Scholar Rank 图标：书页与书签。共用矢量几何生成 SVG 与抗锯齿 PNG，无第三方依赖。
// 用法: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const SS = 8;
const INK_TOP = [25, 56, 75];
const INK_BOTTOM = [14, 33, 50];
const PAPER = [246, 248, 244];
const PAPER_RIGHT = [224, 237, 234];
const GOLD = [235, 185, 104];
const LEFT_PAGE = [
  ['M', 28, 40], ['C', 40, 36, 51, 38, 61, 44], ['L', 61, 91],
  ['C', 50, 85, 39, 83, 28, 86], ['Z'],
];
const RIGHT_PAGE = [
  ['M', 67, 44], ['C', 77, 38, 88, 36, 100, 40], ['L', 100, 86],
  ['C', 88, 83, 78, 85, 67, 91], ['Z'],
];
const BOOKMARK = [['M', 82, 32], ['L', 94, 32], ['L', 94, 65], ['L', 88, 60], ['L', 82, 65], ['Z']];

function flatten(commands) {
  const points = [];
  let current = [0, 0];
  for (const [command, ...args] of commands) {
    if (command === 'M' || command === 'L') { current = args; points.push(current); }
    if (command === 'C') {
      const [x0, y0] = current;
      const [x1, y1, x2, y2, x3, y3] = args;
      for (let step = 1; step <= 32; step++) {
        const t = step / 32;
        const s = 1 - t;
        points.push([
          s ** 3 * x0 + 3 * s ** 2 * t * x1 + 3 * s * t ** 2 * x2 + t ** 3 * x3,
          s ** 3 * y0 + 3 * s ** 2 * t * y1 + 3 * s * t ** 2 * y2 + t ** 3 * y3,
        ]);
      }
      current = [x3, y3];
    }
  }
  return points;
}

const SHAPES = [[LEFT_PAGE, PAPER], [RIGHT_PAGE, PAPER_RIGHT], [BOOKMARK, GOLD]]
  .map(([commands, color]) => ({ points: flatten(commands), commands, color }));

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;     // bit depth
  ihdr[9] = 6;     // color type: RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;   // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sample(x, y) {
  const dx = Math.max(32 - x, 0, x - 96);
  const dy = Math.max(32 - y, 0, y - 96);
  if (dx * dx + dy * dy > 29 * 29) return null;
  for (let i = SHAPES.length - 1; i >= 0; i--) {
    if (insidePolygon(x, y, SHAPES[i].points)) return SHAPES[i].color;
  }
  const t = Math.max(0, Math.min(1, (y - 3) / 122));
  return INK_TOP.map((value, index) => value + (INK_BOTTOM[index] - value) * t);
}

function render(size) {
  const n = size * SS;
  const acc = new Float64Array(size * size * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const c = sample((x + 0.5) * 128 / n, (y + 0.5) * 128 / n);
      const idx = ((y / SS) | 0) * size * 4 + (((x / SS) | 0) * 4);
      if (c) {
        acc[idx] += c[0]; acc[idx + 1] += c[1]; acc[idx + 2] += c[2]; acc[idx + 3] += 255;
      }
    }
  }
  const per = SS * SS;
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const a = acc[i * 4 + 3] / per;
    // 预乘还原：颜色按覆盖到的子像素数平均
    const covered = acc[i * 4 + 3] / 255 || 1;
    out[i * 4] = Math.round(acc[i * 4] / covered);
    out[i * 4 + 1] = Math.round(acc[i * 4 + 1] / covered);
    out[i * 4 + 2] = Math.round(acc[i * 4 + 2] / covered);
    out[i * 4 + 3] = Math.round(a);
  }
  return out;
}

mkdirSync(OUT_DIR, { recursive: true });
const rgb = (color) => `rgb(${color.join(',')})`;
const paths = SHAPES.map(({ commands, color }) => `  <path d="${commands.map((command) => command.join(' ')).join(' ')}" fill="${rgb(color)}"/>`).join('\n');
writeFileSync(join(OUT_DIR, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="Scholar Rank: an open book with a gold bookmark">
  <defs>
    <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="${rgb(INK_TOP)}"/>
      <stop offset="1" stop-color="${rgb(INK_BOTTOM)}"/>
    </linearGradient>
  </defs>
  <rect x="3" y="3" width="122" height="122" rx="29" fill="url(#ink)"/>
${paths}
</svg>\n`);
for (const size of [16, 32, 48, 128]) {
  const file = join(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, encodePNG(size, render(size)));
  console.log('写入', file);
}
