# Chrome Web Store submission

Version: 1.2.4

Publication status: Published on the Chrome Web Store.

Store listing: https://chromewebstore.google.com/detail/pjeccpgooejgnnbcjickjcgoamnghile

## Listing

Name: 学术分级标注 · Scholar Rank

Short description: 在 Google Scholar 页面显示期刊会议评级，提供作者识别、论文筛选与个人主页统计。

Language: Chinese (Simplified). The settings and many badge labels are Chinese; the profile statistics sidebar uses English.

Homepage: https://github.com/Day333/scholar-rank

Support: https://github.com/Day333/scholar-rank/issues

Privacy policy: https://github.com/Day333/scholar-rank/blob/main/docs/PRIVACY.md

### Description

在 Google Scholar 页面中查看期刊和会议评级，并按作者角色整理个人主页论文。

Scholar Rank 在论文出处旁添加评级徽章，鼠标悬停可查看匹配信息。个人主页的统计侧栏支持：
• 识别第一作者、共同第一作者和末位作者，并高亮作者姓名。
• 按发表年份、作者角色和评级筛选已加载的论文。
• 汇总论文篇数、引用数及引用指标。
• 连续加载论文，并将页面统计复制或下载为 PNG 图片。

可在设置中调整徽章样式、字号和显示内容。界面以中文为主，统计侧栏使用英文。目录数据随扩展提供，评级仅供参考，正式评估请核对相应来源。

匹配、统计和截图在本机完成，无需注册。扩展没有广告或分析追踪，不向开发者发送页面数据。偏好设置可通过浏览器账号同步。可选的出处补全功能会向当前 Scholar 站点请求单篇论文的引用格式，可在设置中关闭。工具栏弹窗仅在打开时检查当前网址，以判断页面是否受支持。

商店截图展示使用示例论文的本地演示页面。使用说明和隐私政策见项目主页。

English overview:
View venue rankings beside papers on Google Scholar, filter a profile's publications and export local statistics as an image. Settings are mainly in Chinese; the statistics sidebar is in English. See the English README on the project homepage for details.

## Privacy fields

Single purpose: Help users assess and organize papers on Google Scholar by displaying venue rankings and calculating local profile statistics from the same paper list.

Storage justification: Save badge visibility, appearance, enabled features, and optional author aliases using chrome.storage.sync so the user's preferences persist across sessions and may follow their browser sync settings.

ActiveTab justification: When the user opens the toolbar popup, read the active tab's URL to indicate whether the current page is supported. It does not record browsing history.

ClipboardWrite justification: Write a locally generated PNG to the clipboard only after the user clicks Copy screenshot. The extension does not read the clipboard.

Host access justification: Content scripts run only on the Scholar domains and mirrors listed in the manifest to read venue and author information, annotate papers, calculate statistics, and perform optional same-origin citation-format lookups for truncated venues.

Remote code: No. All executable JavaScript and the html2canvas library are included in the extension package. Ranking JSON is bundled. The optional citation-format response is parsed as data; it is not executed.

Data handling: Paper and profile information is processed locally. No user data is collected by or transmitted to the developer. Preferences can sync through the browser provider; optional requests to the visited Scholar site and screenshot page-image requests are documented in the privacy policy. No analytics, advertising, sale of data, unrelated data transfers, or creditworthiness use.

Dashboard data categories: Personally identifiable information (profile/author names and optional author aliases), web history (the current tab URL checked by the popup; no browsing-history database), and website content (paper metadata and locally rendered screenshots). These categories disclose local processing as required by the Chrome Web Store, not developer-side collection. Do not select health, financial/payment, authentication, personal communications, location, or user-activity tracking; the extension does not access or record those categories.

## Reviewer test instructions

Yellow Argon fix: removed directory keyword lists from the manifest summary and store description. No login or payment is required. Open https://scholar.google.com/citations?user=2SvHNeQAAAAJ&hl=en or Scholar search results. Badges appear beside venues. On a profile, try Paper statistics: First, Last, Highlight author name, year filters and screenshot Copy/Download. Code and ranking data are bundled; page data stays local. Google may show its own CAPTCHA; this extension does not bypass it.

Screenshot source: tools/store-assets.mjs renders the extension's local preview with example papers, at 1280 × 800 pixels. These are demonstrations of the shipped UI, not a claim about a live Scholar profile.

## Resubmission notes

November 25, 2026: version 1.2.4 addresses rejection reference Yellow Argon. Removed the enumerated ranking-directory names from both the manifest short description and the store's Chinese description. The listing describes the user-facing features without keyword lists. Runtime code, permissions, and ranking datasets are unchanged.
