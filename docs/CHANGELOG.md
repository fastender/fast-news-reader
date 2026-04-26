# Changelog

All notable changes to Fast News Reader from v0.8.5 onwards.

Earlier releases (0.1.x through 0.8.4) are documented under
[GitHub Releases](https://github.com/fastender/fast-news-reader/releases).

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

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

[0.8.5]: https://github.com/fastender/fast-news-reader/releases/tag/v0.8.5
[0.8.4]: https://github.com/fastender/fast-news-reader/releases/tag/v0.8.4
