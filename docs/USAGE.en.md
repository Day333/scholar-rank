# User guide

[Home](../README.en.md) · [简体中文](USAGE.md) · [Badges and data sources](DATA.en.md)

## Installation

Install Scholar Rank for free from the [Chrome Web Store](https://chromewebstore.google.com/detail/pjeccpgooejgnnbcjickjcgoamnghile), then open a Google Scholar page. Badges appear automatically.

### Manual installation

For Edge or a source checkout:

1. Download the repository using **Code → Download ZIP** and extract it, or clone it with Git.
2. Open `chrome://extensions/` or `edge://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the folder that directly contains `manifest.json`, usually `scholar-rank-main/` for a GitHub ZIP.
5. Visit a supported Google Scholar profile or search results page.

Select the extracted folder, not the ZIP. Ranking datasets and the screenshot library are bundled; no build, account, API key, or dependency installation is required.
Keep the installed folder in place. After manually updating its files, reload the extension in the extension manager and refresh Scholar.

### Supported pages

Profiles, search results, citing articles, related articles, and paper detail dialogs are annotated. Newly loaded papers receive badges automatically.
Supported sites include the common `scholar.google.*` domains and the mirrors `xueshu.lanfanshu.cn`, `scholar.lanfanshu.cn`, and `sc.panda985.com`. See [manifest.json](../manifest.json) for the full list.

## Badges and venue matching

Hover over a badge to see the full venue name, research area, journal categories, and indexing details. See [Badges and data sources](DATA.en.md) for the badge legend.
Preprints receive a platform label but no venue rankings; dissertations and patents are skipped.

Matching normalizes names, removes common publication prefixes and volume/page suffixes, and uses full names, acronyms, curated aliases, and conservative truncated-name matching. Ambiguous matches are left unlabelled.
For an unrecognized truncated search-result venue, optional venue completion requests that result's citation format from the current Scholar site to recover the full name. Disable it using `resolveTruncated` in Settings.

## Profile statistics

The **Paper statistics** sidebar summarizes the papers currently loaded on a profile. Click a venue category to filter the list; click again to clear that filter.
**Load all papers** repeatedly clicks Scholar's own “Show more” button, with progress and a stop control.
Use it before treating the statistics as a full profile summary.

### Author roles and name highlighting

- **First (incl. co-first):** identify first authors, including consecutive leading authors marked with `*`, `#`, `†`, or `‡`.
- **Last:** identify the final author in a complete author list. Truncated lists containing `…`, `...`, or `et al.` are excluded from last-author detection and counted separately in the sidebar.
- **Highlight author name:** toggle name highlighting independently. Papers matching the selected roles receive a pale yellow background.

Single-author papers can match both roles and are counted once. Profile names are matched automatically; add other spellings in Settings, one alias per line.

Name matching supports:

- Hyphenated surnames, such as `Brett Beaulieu-Jones` matching `BK Beaulieu-Jones`.
- Omitted middle initials, such as `Brett` matching `BK`.
- Chinese and English aliases in parentheses in profile names.
- A former surname in parentheses: `Madeleine Torcasso (Durkee)` also matches `Madeleine Durkee` for first-author, last-author, and name-highlighting features.

### Combined filters

Apply publication-year ranges, venue categories, and author roles together. **Show only highlighted papers** hides the rest of the list.
Selected roles are combined as a union; role, year, and category conditions are combined as an intersection. Papers with no year are excluded when a year range is active. **Reset** clears the year range.
Role, year, and display selections are retained for each profile in the current browser tab, including across a refresh.

### Citation metrics

Compare paper count, total citations, h-index, and i10-index for highlighted papers with the totals for loaded papers.
Year filters use publication years; citation counts are current cumulative counts, not citations received only during those years.
Metrics cover loaded papers only. Crossed-out duplicate citations are excluded from citation metrics.

## Copy or download a screenshot

**Copy screenshot** renders a PNG and writes it to the clipboard. **Download screenshot** saves the image to your device. The image contains the filtered paper list and statistics and is generated locally.
If clipboard access is unavailable, use Download. Narrow the filters first for very long lists.

Copying uses the `clipboardWrite` permission; the extension does not read the clipboard. See the [Privacy Policy](PRIVACY.md) for details.

## Settings and troubleshooting

Use the toolbar popup to enable or disable the extension and choose a theme. Open Settings to toggle badge types, adjust text size and weight, add author aliases, and inspect bundled dataset versions.
Most settings and some badges are in Chinese; the statistics sidebar uses English.

Six themes are available: soft fill, outline, solid, minimal text, square tags, and grayscale.

The matching test in Settings accepts a venue string copied from Scholar and shows the matched records and lookup path.
If a problem remains, [open an issue](https://github.com/Day333/scholar-rank/issues) with the affected page, exact venue or author text, expected and actual results, and screenshots if available.

Rankings, statistics, and screenshot code are bundled; page data is not sent to the developer. Preferences and author aliases may sync through your browser provider. Venue completion and loading papers make requests to the current Scholar site; screenshots may load images already referenced by the page. See the [Privacy Policy](PRIVACY.md).
