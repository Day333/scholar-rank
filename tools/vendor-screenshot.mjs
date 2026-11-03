// npm ci 后可复现截图库；安装扩展时不需要 npm 或联网加载脚本。
import { copyFile, mkdir } from 'node:fs/promises';
const destination = new URL('../src/vendor/', import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(new URL('../node_modules/html2canvas/dist/html2canvas.min.js', import.meta.url), new URL('html2canvas.min.js', destination));
await copyFile(new URL('../node_modules/html2canvas/LICENSE', import.meta.url), new URL('html2canvas.LICENSE', destination));
console.log('已更新 html2canvas 及其 MIT 许可。');
