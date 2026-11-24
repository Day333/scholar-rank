# Chrome Web Store submission

Version: 1.2.3

## Listing

Name: 学术分级标注 · Scholar Rank

Language: Chinese (Simplified). The settings and many badge labels are Chinese; the profile statistics sidebar uses English.

Homepage: https://github.com/Day333/scholar-rank

Support: https://github.com/Day333/scholar-rank/issues

Privacy policy: https://github.com/Day333/scholar-rank/blob/main/docs/PRIVACY.md

### Description

在 Google Scholar 上直接查看期刊与会议评级，按作者角色筛选论文，并生成个人主页论文统计。

Scholar Rank 会在个人主页、搜索结果、引用列表、相关文章和单篇详情中添加评级徽章，支持 CCF、CORE、中科院分区、JCR 影响因子、ABDC、ABS/AJG、UTD24、FT50、Nature Index 等目录。鼠标悬停可查看完整出处和评级信息。

主要功能：
• 期刊与会议评级徽章，支持动态加载的新条目。
• 个人主页一作、共同一作和末作识别，以及作者姓名高亮。
• 按发表年份、作者角色和评级组合筛选论文。
• 统计当前加载论文与高亮论文的篇数、引用数、h-index 和 i10-index。
• 连续加载全部论文，可随时停止。
• 在本机生成 PNG 截图，复制到剪贴板或下载。
• 六种徽章风格，可分别开关各类评级并调整字号。

评级数据和截图库随扩展打包，匹配与统计在本机完成，无需注册或 API Key。扩展不包含广告或分析追踪，不向开发者发送浏览数据。偏好设置使用浏览器同步存储，可能随浏览器账号同步。为补全无法识别的截断出处，扩展可向当前 Scholar 站点请求该条目的引用格式，可在设置中关闭。

默认设置和部分徽章使用中文，统计侧栏使用英文。分区和评级是辅助信息，用于正式评估时请核对相应官方目录。商店截图展示的是使用示例论文的本地演示页面。

English overview:
Scholar Rank displays journal and conference rankings directly on Google Scholar and adds author highlighting, publication filters, citation metrics, and local PNG export. Ranking data is bundled; no account or API key is required. Settings and some badges are in Chinese, while the profile statistics sidebar uses English. Preferences may sync through your browser account. Optional requests to the current Scholar site recover truncated venue names. See the English README and privacy policy on the project homepage.

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

No extension account, payment, API key, or sign-in is required. Open a public Google Scholar profile such as https://scholar.google.com/citations?hl=en&user=2SvHNeQAAAAJ&view_op=list_works or a Scholar search results page. Venue badges appear automatically. On profiles, the Paper statistics sidebar includes author-role checkboxes, year filters, citation metrics, and screenshot controls. Toggle First (incl. co-first), Last, and Highlight author name to inspect the behavior. A truncated author list is deliberately not counted as last-author evidence. Screenshot copying is user initiated; Download screenshot is available if clipboard permission is denied. Google Scholar may independently rate-limit or present a CAPTCHA; the extension does not bypass these controls.

Screenshot source: tools/store-assets.mjs renders the extension's local preview with example papers, at 1280 × 800 pixels. These are demonstrations of the shipped UI, not a claim about a live Scholar profile.
