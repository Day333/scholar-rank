/** 截图完全在本机生成；html2canvas 随扩展打包，不访问截图服务。 */
(function (root) {
  'use strict';

  let busy = false;
  let stylesPromise = null;

  function screenshotStyles() {
    if (!stylesPromise) {
      stylesPromise = fetch(chrome.runtime.getURL('src/content/badges.css'))
        .then((response) => {
          if (!response.ok) throw new Error('Could not prepare the screenshot. Reload the Scholar page and try again.');
          return response.text();
        }).catch((error) => {
          stylesPromise = null;
          throw error;
        });
    }
    return stylesPromise;
  }

  function normalizeBadgeColors(target) {
    // html2canvas 1.x 不认识 color-mix() 的 color(srgb ...) 计算结果。
    // 只在截图副本中转为 rgba，保留原页面外观和描边的透明度。
    const document = target.ownerDocument;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const colors = new Map();
    const properties = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'];
    for (const badge of target.querySelectorAll('.sr-badge')) {
      const style = document.defaultView.getComputedStyle(badge);
      for (const property of properties) {
        const color = style.getPropertyValue(property);
        if (!/^(color|color-mix|lab|lch|oklab|oklch)\(/.test(color)) continue;
        if (!colors.has(color)) {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
          colors.set(color, `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`);
        }
        badge.style.setProperty(property, colors.get(color));
      }
    }
  }

  async function screenshotBlob() {
    const css = await screenshotStyles();
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
    if (scale < 0.5) throw new Error('Too many papers for one screenshot. Narrow the year range or show only highlighted papers.');
    const canvas = await root.html2canvas(target, {
      backgroundColor: '#ffffff', scale, width, height,
      useCORS: true, allowTaint: false, logging: false, imageTimeout: 5000,
      scrollX: 0, scrollY: 0,
      ignoreElements: (element) => element.matches('.sr-export-actions, .sr-export-status'),
      onclone: (clonedDocument, clonedTarget) => {
        // 浏览器注入的扩展 CSS 不在页面 DOM 中，html2canvas 克隆时不会带过去。
        const style = clonedDocument.createElement('style');
        style.textContent = css;
        clonedDocument.head.appendChild(style);
        normalizeBadgeColors(clonedTarget);
      },
    });
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        // 释放大画布，但保留已编码的 PNG。
        canvas.width = canvas.height = 0;
        if (blob) resolve(blob);
        else reject(new Error('Could not generate the screenshot. Narrow the filters and try again.'));
      }, 'image/png');
    });
  }

  async function capture(mode, panel) {
    if (busy) return;
    const status = panel.querySelector('.sr-export-status');
    const buttons = [...panel.querySelectorAll('[data-export]')];
    busy = true;
    buttons.forEach((button) => { button.disabled = true; });
    status.textContent = 'Generating screenshot…';
    try {
      if (mode === 'copy') {
        if (!navigator.clipboard?.write || !root.ClipboardItem) {
          throw new Error('Image copying is unavailable in this browser. Use Download screenshot.');
        }
        // 在用户点击时立即请求写入，PNG 异步生成，避免丢失用户手势。
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': screenshotBlob() })]);
        status.textContent = 'Screenshot copied. Ready to paste.';
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
        status.textContent = 'Screenshot downloaded.';
      }
    } catch (error) {
      status.textContent = error.name === 'NotAllowedError'
        ? 'Clipboard access was denied. Retry or download the screenshot.' : (error.message || 'Screenshot failed. Please try again.');
    } finally {
      busy = false;
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  root.SRExport = { capture };
})(typeof globalThis !== 'undefined' ? globalThis : this);
