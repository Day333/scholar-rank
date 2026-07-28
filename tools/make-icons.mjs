// 生成扩展图标（无第三方依赖，直接手写 PNG）。
// 用法: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const SS = 4;                       // 超采样倍数，用于抗锯齿
const BG = [26, 115, 232];          // #1a73e8
const BAR = [255, 255, 255];

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

/** 圆角矩形底 + 三根递增的柱子，象征分级。 */
function sample(x, y, n) {
  const r = n * 0.22;                       // 圆角半径
  const inCorner = (cx, cy) => (x - cx) ** 2 + (y - cy) ** 2 > r * r;
  if (x < r && y < r && inCorner(r, r)) return null;
  if (x > n - r && y < r && inCorner(n - r, r)) return null;
  if (x < r && y > n - r && inCorner(r, n - r)) return null;
  if (x > n - r && y > n - r && inCorner(n - r, n - r)) return null;

  const barW = n * 0.14;
  const gap = n * 0.09;
  const left = n * 0.235;
  const bottom = n * 0.78;
  const heights = [0.26, 0.40, 0.54];
  for (let i = 0; i < 3; i++) {
    const x0 = left + i * (barW + gap);
    const y0 = bottom - heights[i] * n;
    if (x >= x0 && x <= x0 + barW && y >= y0 && y <= bottom) return BAR;
  }
  return BG;
}

function render(size) {
  const n = size * SS;
  const acc = new Float64Array(size * size * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const c = sample(x + 0.5, y + 0.5, n);
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
for (const size of [16, 32, 48, 128]) {
  const file = join(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, encodePNG(size, render(size)));
  console.log('写入', file);
}
