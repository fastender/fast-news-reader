# Changelog

All notable changes to Fast News Reader from v0.8.5 onwards.

Earlier releases (0.1.x through 0.8.4) are documented under
[GitHub Releases](https://github.com/fastender/fast-news-reader/releases).

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [0.15.0] - 2026-04-26

### Changed

- **Two-line header.** Where the card previously read "Feeds · 7
  entries", the header is now a count on top ("200 articles") with a
  smaller subtitle below ("from 5 feeds" for multi-feed cards, the
  publisher name for single-feed). Quicker to scan, more useful at a
  glance.
- **Buttons moved to the header.** The state filters (unread,
  read-later, favorites), the search button, the new time filter, and
  refresh now sit on the right side of the header. Order:
  unread, read-later, favorites, search, time filter, refresh. The
  topics bar below now only carries the source/topic mode toggle plus
  the topic pills, with bottom spacing so articles do not crowd into
  it.
- **State filters are mutually exclusive.** Picking unread, read-later,
  or favorites clears the other two. Combinations like "unread and
  starred" no longer work; pick the one that matters most. Tap the
  same filter twice to clear it.

### Added

- **Time filter.** A funnel-shaped button next to refresh opens a
  popover with time-range presets:
  - Last hour
  - Last 12 hours
  - Last 24 hours
  - Last 3 days
  - Last week
  - All time (clears the filter)

  Filters articles by `published_dt`, applied on top of search, topic,
  and state filters. Active selection is highlighted in the popover.
  Click outside the popover or pick "All time" to clear.

## [0.14.0] - 2026-04-26

### Changed

- **Toolbar redesign.** The search field, the favorites/read-later/unread
  state filters, the source/topic mode toggle, and the topic pills all
  live in one row now, in this order:
  search, favorites, read-later, unread, mode toggle, topic pills.
  Previously the search input had its own row above the topic bar.
- **Search collapses behind an icon.** The search field is no longer
  permanently visible. A magnifying-glass button at the start of the
  toolbar opens it on click; the rest of the toolbar hides while
  search is active. A close button (and the Escape key) clear the
  query and bring the toolbar back. Saves vertical space when search
  isn't in use; previously the empty search field sat above every
  card with `show_search` enabled.

## [0.13.1] - 2026-04-26

### Added

- **Theme pill in the article modal.** A small uppercase badge in the
  top-left corner of the modal's hero image shows the curated theme
  for the source ("News", "Tech", "Sport", and so on). Mirror image of
  the action buttons in the top-right corner. Hidden when the source
  has no theme (custom feeds not in the preset list).

## [0.13.0] - 2026-04-26

### Added

- **Themes mode in the topics bar.** A third grouping option alongside
  Topics (article-level RSS categories) and Sources (per-feed). Themes
  groups by the curated category we assign each preset at setup
  (`news`, `tech`, `science`, `sport`, `business`). Heise lands in
  Tech, Tagesschau in News, Kicker in Sport, and so on. The
  in-card mode toggle now cycles Topics → Sources → Themes → Topics,
  and the same option is available in the editor's "Topics group by"
  dropdown.
- **`channel.theme` and `channel.theme_label` on the sensor.** Public
  schema fields, documented in [docs/SCHEMA.md](SCHEMA.md), so
  downstream cards like Fast Search Card can group by the curated
  theme without re-deriving it. `theme` is the slug, `theme_label` is
  the display string.
- **Custom feeds without a theme cluster under "Other".** When at least
  one configured feed has a theme but a custom-URL entry does not, the
  Themes mode shows an extra "Other" tab so those articles are still
  reachable.

### Changed

- Preset setup now stores the theme in `entry.data` (`CONF_THEME`).
  Existing entries that pre-date this field reverse-derive their theme
  by looking up their stored URL against the preset list, so no manual
  re-add is needed; if the URL is custom and not in the preset list,
  the theme is `None`.

## [0.12.0] - 2026-04-26

### Added

- **State filter pills in the topics bar.** Three round icon buttons sit
  next to the source/category mode toggle: a star (favorites only), a
  bookmark (read-later only), and a dot (unread only). Each toggles
  independently, so combinations like "starred and still unread" work.
  Active filters fill the pill in the primary color, matching the
  active topic style.
- **Per-article `viewed` state.** The reader modal marks an article as
  viewed the moment it appears, so the unread filter actually means
  something. Stored in localStorage alongside saved/favorite/hidden.
  Cross-tab sync via the existing `storage` event invalidation.

## [0.11.2] - 2026-04-26

### Fixed

- **Search input no longer loses focus after the first character.** The
  0.10.2 fix stopped HA from grabbing single-letter shortcuts, but
  every keystroke still triggered a full shadow-DOM rebuild that
  destroyed and recreated the input. The first letter went in (because
  the user's click had focused it), then focus was effectively lost
  on the freshly created element and the second keystroke went
  nowhere. The input handler now uses a surgical update that only
  rewrites the article list and the count, leaving the search input
  alive across keystrokes.

### Changed

- **Topics bar uses iOS-style fade indicators instead of a scrollbar.**
  The thin horizontal scrollbar is hidden on every platform (Firefox
  via `scrollbar-width: none`, WebKit via `::-webkit-scrollbar`,
  legacy IE via `-ms-overflow-style`). Edge gradients fade in and out
  based on the scroll position: when there is more content to the
  right, a soft fade hints at it; when scrolled to the end, the
  right-side fade disappears. Same for the left edge.

## [0.11.1] - 2026-04-26

### Changed

- **Modal action buttons use Material icons.** Read-later, favorite,
  hide, and close were emoji glyphs (`🔖 ★ ⊘ ×`) which rendered
  inconsistently across platforms (the bookmark in particular looked
  faded under some macOS themes). They are now inline Material SVG
  icons that match the refresh button shipped in 0.11.0, scale
  cleanly, inherit the primary-color highlight on the active state,
  and look the same on every browser.

## [0.11.0] - 2026-04-26

### Added

- **Topics-mode toggle in the front-end.** A small dashed pill labelled
  "Topics" or "Sources" sits to the left of the "All" pill in the
  topics bar. Tapping it switches the grouping mode live without
  opening the card editor. The default mode still comes from the
  `topics_mode` config option, but the user can override per session;
  reloading the dashboard resets to the configured default. The active
  topic clears automatically when modes switch, since a topic from the
  old mode rarely exists in the new one.
- **"X articles from N feeds" header count.** Replaces the previous
  "7 entries" label so multi-feed cards show how many sources the
  merge is pulling from. Single-feed cards still read just
  "X articles".
- **Refresh button in the header.** Material refresh icon next to the
  count. One click triggers `homeassistant.update_entity` for every
  configured feed sensor, so the user can force a fetch without
  waiting for the next scan interval. The icon spins for 1.5 seconds
  as feedback and the button is disabled during that window so a
  double-click cannot fan out into duplicate refreshes.
- The topics bar now also appears in multi-feed cards even when no
  article carries an RSS category, since switching the mode toggle to
  "Sources" still produces useful filters.

## [0.10.2] - 2026-04-26

### Fixed

- **Card search input no longer triggers HA's keyboard shortcuts.** Home
  Assistant listens at the document level for single-letter shortcuts
  (`a` opens Assist, `e` opens the entity search, `c` opens the command
  palette, and so on). Because the card's search field lives inside a
  shadow DOM, those shortcuts hijacked typing after the first character:
  pressing "Be" would land "B" in the input and open Assist on "e". The
  search input now stops `keydown` from propagating to the document, so
  every keystroke stays where the user is typing.

## [0.10.1] - 2026-04-26

### Added

- **`max_list_height` card option.** A new optional setting in the card
  editor. Empty (the default) keeps the existing behaviour: the card
  grows to fit every visible article. Set a pixel value and only the
  article list scrolls when its content exceeds that height; the
  header, the unavailable-feed warning, the search box, and the topic
  tabs stay pinned at the top so they remain reachable. Useful when a
  feed (or a multi-feed merge) produces enough entries to make the
  card dominate the dashboard.

## [0.10.0] - 2026-04-26

### Added

- **Search field in the card.** Optional, off by default. When enabled,
  a small search box appears above the article list and live-filters
  the merged feed against article titles and (HTML-stripped) summaries.
  Filters apply before `max_items`, so "Top 5 Sport" actually returns
  five sport articles, not five mixed articles that happen to include
  three sport ones. Toggle in the card editor under "Show in card".
- **Horizontally scrollable topic tabs.** Optional, off by default.
  When enabled, a row of pill buttons sits between the search field
  and the list. The "All" pill clears the filter; tapping any other
  pill restricts the list to that topic. Two grouping modes:
  - `categories` (default): collected from each article's RSS
    `<category>` tags.
  - `sources`: one tab per configured feed, useful in multi-feed
    cards.
- The empty state now reads "No matches." when search or topic filters
  are active and exclude every article.
- Search input keeps focus and caret position across HA-driven
  re-renders, so typing is not interrupted when a feed sensor
  refreshes mid-search.

## [0.9.0] - 2026-04-26

### Added

- **Source favicons in the Lovelace card.** The header of a single-feed
  card and the small source-tag in a multi-feed card now render the
  source's favicon next to the name (the same idea Feedly uses). The
  card looks for `channel.icon` on the sensor's state attributes and
  drops the image silently if it 404s.
- **Public `channel.icon` field on the sensor schema.** The coordinator
  now derives a favicon URL for every feed: it prefers the RSS feed's
  own `channel.image` if present, otherwise resolves
  `${origin}/favicon.ico` from `channel.link` (or the feed URL).
  Documented in [docs/SCHEMA.md](SCHEMA.md) so downstream cards like
  [Fast Search Card](https://github.com/fastender/Fast-Search-Card)
  can rely on it without re-deriving the host themselves. Pure
  derivation, no extra network call during refresh.

### Internal

- Tests cover `_derive_favicon` for the channel-link path, the
  feed-URL fallback, garbage input, and non-http schemes.

## [0.8.9] - 2026-04-26

### Internal

No user-facing changes; this release ships a real test suite so the
next round of refactors can move with confidence.

- New tests cover the URL allowlist, the feed-body sniff added in
  0.8.8, every branch of `_validate_feed`, the coordinator's date
  helpers, the per-entry parse-error swallow, the full update cycle
  against the bundled Tagesschau fixture, and all three `UpdateFailed`
  paths (HTTP error, timeout, unparseable body).
- Sensor tests guard the 0.8.7 `_unrecorded_attributes` declaration as
  a regression check, plus the main count sensor and all four
  `latest_*` convenience sensors with and without coordinator data.
- Test infrastructure: a small `fake_session` helper in
  `tests/conftest.py` bypasses aiohttp's connector entirely. The
  alternative, HA's stock `aioclient_mock`, spawns a safe-shutdown
  daemon thread on first use that the framework's teardown verifier
  flags as lingering, making test order matter and arbitrary tests
  fail. The helper avoids that.
- 56 tests passing in CI in roughly 1.3 seconds.

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

[0.15.0]: https://github.com/fastender/fast-news-reader/releases/tag/v0.15.0
[0.14.0]: https://github.com/fastender/fast-news-reader/releases/tag/v0.14.0
[0.13.1]: https://github.com/fastender/fast-news-reader/releases/tag/v0.13.1
[0.13.0]: https://github.com/fastender/fast-news-reader/releases/tag/v0.13.0
[0.12.0]: https://github.com/fastender/fast-news-reader/releases/tag/v0.12.0
[0.11.2]: https://github.com/fastender/fast-news-reader/releases/tag/v0.11.2
[0.11.1]: https://github.com/fastender/fast-news-reader/releases/tag/v0.11.1
[0.11.0]: https://github.com/fastender/fast-news-reader/releases/tag/v0.11.0
[0.10.2]: https://github.com/fastender/fast-news-reader/releases/tag/v0.10.2
[0.10.1]: https://github.com/fastender/fast-news-reader/releases/tag/v0.10.1
[0.10.0]: https://github.com/fastender/fast-news-reader/releases/tag/v0.10.0
[0.9.0]: https://github.com/fastender/fast-news-reader/releases/tag/v0.9.0
[0.8.9]: https://github.com/fastender/fast-news-reader/releases/tag/v0.8.9
[0.8.8]: https://github.com/fastender/fast-news-reader/releases/tag/v0.8.8
[0.8.7]: https://github.com/fastender/fast-news-reader/releases/tag/v0.8.7
[0.8.6]: https://github.com/fastender/fast-news-reader/releases/tag/v0.8.6
[0.8.5]: https://github.com/fastender/fast-news-reader/releases/tag/v0.8.5
[0.8.4]: https://github.com/fastender/fast-news-reader/releases/tag/v0.8.4
