# Scholar Rank Privacy Policy

Effective date: November 24, 2026

Scholar Rank adds journal and conference rankings, author highlighting, and paper statistics to supported Google Scholar pages. This policy describes the extension's handling of data.

## Data used on your device

The extension reads paper titles, author lists, venue names, publication years, citation counts, and the profile name on supported pages to display rankings and calculate the statistics you request. Ranking datasets are included in the extension package. This page content is processed on your device and is not sent to the developer.

The toolbar popup checks the active tab's URL when opened to tell you whether the current site is supported. Scholar Rank does not maintain a browsing-history database.

## Stored preferences

Badge preferences, appearance settings, enabled features, and author aliases entered in Settings are stored using `chrome.storage.sync`. If your browser's sync feature is enabled, your browser provider may synchronize these preferences through your browser account. The developer does not receive or have access to those synchronized preferences.

Profile-specific filters, highlighting selections, and completed citation-format lookups are cached in the supported site's `sessionStorage` for the current tab. You can clear these using the browser's site-data controls. To clear extension preferences, remove the extension; management of any browser-synchronized copies is subject to your browser provider's controls.

## Requests to Scholar and page resources

When the optional truncated-venue completion feature is enabled, an unrecognized truncated venue in search results can trigger a same-origin request to the Scholar site's citation-format endpoint. The request includes the paper identifier already shown by that site and uses the current site's session. The response is used on your device to recover a complete venue name. You can disable this feature in Settings.

“Load all papers” operates the page's own “Show more” control, which loads additional papers from that site. These requests are handled by the Scholar site or mirror being visited, under that site's privacy practices. Scholar Rank does not proxy them through a developer server.

Generating a screenshot may load images already referenced by the current page, such as a profile image. It does not upload the generated screenshot to an external service.

## Screenshots and clipboard

Screenshots are rendered on your device using the bundled html2canvas library. A screenshot is downloaded to your device or written to your clipboard only when you click the corresponding button. The extension does not read your clipboard. The developer does not receive exported screenshots.

## Permissions

- `storage`: save and retrieve your preferences, including optional author aliases.
- `activeTab`: check the current tab's URL when you open the extension popup and display whether the site is supported.
- `clipboardWrite`: copy a generated PNG screenshot when you choose “Copy screenshot.”
- Access to the Scholar domains and mirrors listed in the manifest: read the paper information needed for annotations, highlighting, and statistics, and make the optional same-origin citation-format request described above.

Executable code, ranking data, and the screenshot library are bundled with the extension. Scholar Rank does not download or execute remote application code.

## Collection, sharing, and advertising

Scholar Rank has no developer-operated data-collection service, telemetry, analytics, or advertisements. It does not sell user data, share user data with advertisers or data brokers, or use page content for credit or lending decisions. Browser sync and requests to the sites described above remain subject to their respective providers' privacy practices.

## Contact

For questions about this policy or the extension, open an issue at [github.com/Day333/scholar-rank](https://github.com/Day333/scholar-rank/issues). If you choose to contact us, the information you submit is processed by GitHub under its privacy policy. Avoid including private profile information or credentials in public issues.
