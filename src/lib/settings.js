/** 扩展设置项的默认值、外观风格清单与读写封装（content script / options / popup 共用）。 */
(function (root) {
  'use strict';

  /** 可选外观风格。id 会拼成 CSS 类名 `sr-theme-<id>`，样式见 content/badges.css。 */
  const THEMES = [
    { id: 'soft', name: '柔和填充', desc: '浅色底 + 深色字，和 Scholar 页面最贴合' },
    { id: 'outline', name: '描边', desc: '透明底 + 彩色细边，最轻，不抢正文' },
    { id: 'solid', name: '实心', desc: '饱和底 + 白字，最醒目' },
    { id: 'minimal', name: '极简文字', desc: '去掉色块，只留彩色文字' },
    { id: 'square', name: '方角标签', desc: '直角 + 左侧色条，偏工程风' },
    { id: 'mono', name: '低调灰阶', desc: '统一灰色，只有预警保留红色' },
  ];

  const DEFAULTS = {
    enabled: true,

    // 生效位置
    showOnProfile: true,   // 个人主页论文列表
    showOnSearch: true,    // 搜索结果页
    showOnDetail: true,    // 点开单篇论文的详情浮层

    // 徽章开关
    showPreprint: true,
    showTags: true,
    showCcf: true,
    showCore: true,
    showTop: true,
    showEi: true,
    showCas: true,
    showJcr: false,
    showIf: true,
    showWarn: true,

    // 外观
    theme: 'soft',
    badgeScale: 100,       // 徽章字号百分比
    boldBadges: false,     // 加粗徽章文字

    // 其它
    showUnmatched: false,  // 未匹配到的出处也显示一个灰色标记（排查用）
  };

  /** 把设置里的 theme 转成 CSS 类名，非法值回落到默认风格。 */
  function themeClass(theme) {
    const id = THEMES.some((t) => t.id === theme) ? theme : DEFAULTS.theme;
    return 'sr-theme-' + id;
  }

  async function load() {
    if (!root.chrome || !chrome.storage) return Object.assign({}, DEFAULTS);
    return await chrome.storage.sync.get(DEFAULTS);
  }

  async function save(patch) {
    await chrome.storage.sync.set(patch);
  }

  root.SRSettings = { DEFAULTS, THEMES, themeClass, load, save };
})(typeof globalThis !== 'undefined' ? globalThis : this);
