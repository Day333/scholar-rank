/**
 * 最小 chrome.* 垫片，让扩展页面（options / popup）和 content script 能在普通网页里跑起来预览。
 * 仅供 tools/serve.mjs 的预览模式注入，不参与打包。
 */
(function () {
  'use strict';
  if (window.chrome && chrome.runtime && chrome.runtime.getURL) return;

  const store = JSON.parse(localStorage.getItem('sr-shim-store') || '{}');
  const listeners = [];

  // 预览时可以用 ?theme=outline&bold=1 直接指定外观，方便逐个风格对比截图。
  const params = new URLSearchParams(location.search);
  if (params.has('theme')) store.theme = params.get('theme');
  if (params.has('bold')) store.boldBadges = params.get('bold') === '1';
  if (params.has('scale')) store.badgeScale = Number(params.get('scale'));

  window.chrome = {
    runtime: {
      getURL: (p) => '/' + String(p).replace(/^\/+/, ''),
      openOptionsPage: () => window.open('/src/options/options.html?shim=1'),
    },
    storage: {
      sync: {
        async get(defaults) {
          return Object.assign({}, defaults, store);
        },
        async set(patch) {
          Object.assign(store, patch);
          localStorage.setItem('sr-shim-store', JSON.stringify(store));
          const changes = {};
          for (const k of Object.keys(patch)) changes[k] = { newValue: patch[k] };
          listeners.forEach((fn) => fn(changes, 'sync'));
        },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    tabs: {
      async query() { return [{ url: 'https://scholar.google.com/citations?user=demo' }]; },
    },
  };
})();
