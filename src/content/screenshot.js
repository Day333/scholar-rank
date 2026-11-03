/** 截图完全在本机生成；html2canvas 随扩展打包，不访问截图服务。 */
(function (root) {
  'use strict';

  let busy = false;

  async function screenshotBlob() {
    const target = document.querySelector('#gsc_bdy') || document.body;
    const bounds = target.getBoundingClientRect();
    const width = Math.ceil(target === document.body
      ? Math.max(document.documentElement.clientWidth, target.scrollWidth) : Math.max(bounds.width, target.scrollWidth));
    const rail = document.querySelector('#gsc_rsb');
    const height = Math.ceil(Math.max(target.scrollHeight, bounds.height,
      rail ? rail.getBoundingClientRect().bottom - bounds.top : 0));
    // 控制浏览器画布的尺寸和内存；长列表仍导出全部内容，不静默裁切。
    const scale = Math.min(window.devicePixelRatio || 1, 2, 16000 / width, 16000 / height,
      Math.sqrt(32000000 / (width * height)));
    if (scale < 0.5) throw new Error('论文列表较长，请缩小年份范围或仅显示高亮论文后再截图');
    const canvas = await root.html2canvas(target, {
      backgroundColor: '#ffffff', scale, width, height,
      useCORS: true, allowTaint: false, logging: false, imageTimeout: 5000,
      scrollX: 0, scrollY: 0,
      ignoreElements: (element) => element.matches('.sr-export-actions, .sr-export-status'),
    });
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        // 释放大画布，但保留已编码的 PNG。
        canvas.width = canvas.height = 0;
        if (blob) resolve(blob);
        else reject(new Error('截图生成失败，请缩小筛选范围后重试'));
      }, 'image/png');
    });
  }

  async function capture(mode, panel) {
    if (busy) return;
    const status = panel.querySelector('.sr-export-status');
    const buttons = [...panel.querySelectorAll('[data-export]')];
    busy = true;
    buttons.forEach((button) => { button.disabled = true; });
    status.textContent = '正在生成截图…';
    try {
      if (mode === 'copy') {
        if (!navigator.clipboard?.write || !root.ClipboardItem) {
          throw new Error('当前浏览器不支持复制图片，请使用下载截图');
        }
        // 在用户点击时立即请求写入，PNG 异步生成，避免丢失用户手势。
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': screenshotBlob() })]);
        status.textContent = '截图已复制，可直接粘贴';
      } else {
        const blob = await screenshotBlob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const name = (document.querySelector('#gsc_prf_in')?.textContent || 'profile')
          .trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80);
        const now = new Date();
        const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
        link.href = url;
        link.download = `Scholar-Rank-${name}-${date}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        status.textContent = '截图已下载';
      }
    } catch (error) {
      status.textContent = error.name === 'NotAllowedError'
        ? '复制未获浏览器授权，请点击重试或使用下载截图' : (error.message || '截图失败，请重试');
    } finally {
      busy = false;
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  root.SRExport = { capture };
})(typeof globalThis !== 'undefined' ? globalThis : this);
