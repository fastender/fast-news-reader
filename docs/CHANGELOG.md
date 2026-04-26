# Changelog

All notable changes to Fast News Reader from v0.8.5 onwards.

Earlier releases (0.1.x through 0.8.4) are documented under
[GitHub Releases](https://github.com/fastender/fast-news-reader/releases).

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [0.8.8] - 2026-04-26

### Added

- **Custom-feed setup now sniffs the response body.** Pasting a homepage URL
  instead of an actual feed URL used to pass setup validation (HTTP 200) and
  fail later in the coordinator. The validator now reads the first kilobyte
  of the response and looks for an XML, RSS, Atom, or RDF root marker. If it
  cannot find one, setup fails with the new `not_a_feed` error explaining
  the likely fix. Adds the matching string in English and German.
- **Card warns when a feed sensor is unavailable.** A small banner appears
  in the card header listing which configured feed (or how many of them) is
  currently `unavailable` or `unknown`, so a multi-feed card still showing
  three of four sources doesn't quietly hide the dead one. The unavailable
  sensor is also skipped during aggregation so its (potentially stale)
  cached attributes never leak in.
- **Reader modal announces position to screen readers.** A hidden
  `aria-live="polite"` region inside the modal now reads out
  "Article 3 of 12: <title>" whenever the user navigates with prev/next or
  swipes. Sighted users see no change.

## [0.8.7] - 2026-04-26

### Fixed

- **Stop spamming the recorder with full article HTML.** The main feed
  sensor exposed the full `entries` list (with `<content:encoded>` HTML
  for every article) and `channel` block as state attributes. With feeds
  like Heise or Tagesschau publishing 20+ entries of multi-kilobyte HTML,
  these routinely exceeded Home Assistant's 16 KB-per-attribute soft limit
  and produced repeated 'state attributes exceed maximum size' warnings,
  plus unnecessary database growth. Both attributes are now declared
  `_unrecorded_attributes`, so they remain visible at runtime (the
  Lovelace card still reads them) but are no longer persisted into the
  recorder database.

## [0.8.6] - 2026-04-26

### Fixed

- **HACS minimum Home Assistant version corrected.** `hacs.json` advertised
  2024.12.0, but the options flow uses the
  `OptionsFlow.config_entry` auto-property added in HA 2025.12. Users on
  older HA would get an `AttributeError` opening the integration's options.
  The minimum is now 2025.12.0, matching the actual code requirement.
- **Manifest version read failures now warn.** If `manifest.json` cannot be
  parsed at startup, the integration falls back to version `0` for the
  Lovelace card URL. That fallback used to be silent. It now logs a warning
  pointing at the offending file and explaining that cache busting is
  broken until the manifest is fixed.

### Changed

- **Per-entry parse errors logged at debug, not exception.** Coordinator
  used to write a full stack trace for every malformed RSS entry. A feed
  publishing many bad items in a row could fill the log. Now logged at
  debug with just the error message; the entry is still dropped silently
  for end users.
- **Preset lookup is a dict, not a linear scan.** Trivial cleanup in
  `presets.get_preset()`.

## [0.8.5] - 2026-04-26

### Security

- **Escape RSS-supplied text in the card list.** The article title, source
  name, author, header title, and summary preview are now escaped before
  being inserted into the card's inner HTML. A malicious or sloppy feed
  could previously embed `<img src=x onerror=...>` into a title and
  execute JavaScript on every dashboard render. The reader modal already
  used `textContent` for these fields, so it was not affected.
- **Validate image and link URLs.** Article images (hero in the modal,
  thumbnails in the list, embedded images in the article body) and the
  modal's "Open source" link now only accept `http(s)://`, protocol-
  relative, or root-relative URLs. Anything else (`javascript:`, `data:`,
  `vbscript:`, etc.) is dropped, so a feed with `<img src="javascript:...">`
  in its summary cannot reach the DOM.
- **Replace `stripHtml` with a `DOMParser`-based implementation.** The old
  helper assigned untrusted markup to a detached `<div>`'s `innerHTML`,
  which still triggers `<img onerror>` handlers on some browsers even when
  the element is never inserted into the document. `DOMParser` produces
  an inert document, so the same input cannot side-effect.

### Performance

- **Cache decoded localStorage state in `ArticleStore`.** The card used to
  re-parse the saved, favorite, and hidden sets from `localStorage` once
  for the global lookup plus once per article per render. With 50 visible
  articles that meant ~150 JSON parses per render. The store now keeps
  the decoded `Set`s in memory, updates them in place on save, and
  invalidates on cross-tab `storage` events.

## [0.8.4] - 2026-04-26

### Added

- **Per-feed `max_items`.** Each feed in the card editor now has a small
  number input. Leave empty to take everything the sensor returns, or set
  a cap (for example 3) to keep one chatty source from dominating the
  merged list. The global `max_items` still applies to the final list.

### Fixed

- **Duplicate feed selection.** The card editor used to let you pick the
  same sensor twice. Each dropdown now hides feeds already chosen in
  other rows, the `+ Add feed` button is disabled when no free sensor
  remains, and both the editor and the card de-dupe on load.
- **Modal action button hover.** Save, favorite, hide, and close buttons
  in the article modal now scale up on hover (matching prev/next nav)
  instead of swapping their background color. Active-state color
  (orange when toggled on) is unchanged.

[0.8.8]: https://github.com/fastender/fast-news-reader/releases/tag/v0.8.8
[0.8.7]: https://github.com/fastender/fast-news-reader/releases/tag/v0.8.7
[0.8.6]: https://github.com/fastender/fast-news-reader/releases/tag/v0.8.6
[0.8.5]: https://github.com/fastender/fast-news-reader/releases/tag/v0.8.5
[0.8.4]: https://github.com/fastender/fast-news-reader/releases/tag/v0.8.4
