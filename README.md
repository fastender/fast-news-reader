<p align="center">
  <img src="docs/brand/logo@2x.png" alt="Fast News Reader" height="120">
</p>

<p align="center">
  <em>RSS for Home Assistant, with the images you actually want.</em>
</p>

[![GitHub Release](https://img.shields.io/github/v/release/fastender/fast-news-reader?style=flat-square)](https://github.com/fastender/fast-news-reader/releases)
[![Tests](https://img.shields.io/github/actions/workflow/status/fastender/fast-news-reader/test.yml?branch=main&label=tests&style=flat-square)](https://github.com/fastender/fast-news-reader/actions/workflows/test.yml)
[![HACS](https://img.shields.io/badge/HACS-Custom-41BDF5?style=flat-square)](https://hacs.xyz)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.12+-03A9F4?style=flat-square&logo=home-assistant&logoColor=white)](https://www.home-assistant.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Works with Fast Search Card](https://img.shields.io/badge/Works%20with-Fast%20Search%20Card-FF6B4A?style=flat-square)](https://github.com/fastender/Fast-Search-Card)

> **Works 100% out of the box with [Fast Search Card](https://github.com/fastender/Fast-Search-Card).** Articles surfaced by Fast News Reader sensors appear in Fast Search Card's results without any extra config.

Add any RSS or Atom feed to Home Assistant in seconds, with proper image extraction including from `<content:encoded>`, the source most other integrations skip. Pick from 20+ hand-picked feeds (Tagesschau, Heise, BBC, The Verge, ...) or paste your own URL.

## Why this exists

- `core feedreader` strips images from event entities by design.
- `timmaurice/feedparser` checks `media:*` and enclosures, but not `<content:encoded>`. Tagesschau, Heise, Spiegel and many German feeds put their images only there, so news cards show gray placeholders.

This integration covers all five common image sources, so news cards actually have pictures in them.

## Features

- Curated dropdown of 20+ feeds, filtered by region (DE / EN), or paste a custom URL.
- Five-path image extractor including `<content:encoded>`.
- Lovelace card included (`custom:fast-news-reader-card`), no separate install.
- One Device per feed: main count sensor plus `latest_title`, `latest_image`, `latest_published` sub-sensors.
- Edit anytime: change the feed URL, rename, or adjust the refresh interval without removing the entry.
- Drop-in compatible with the `timmaurice/feedparser` schema; existing Lovelace cards keep working.
- 100% compatible with [Fast Search Card](https://github.com/fastender/Fast-Search-Card): articles show up in its results without extra config.
- DE + EN translations.

## Install

Via HACS as a custom repository:

1. HACS, Integrations, three-dot menu, **Custom repositories**.
2. Add `https://github.com/fastender/fast-news-reader` as **Integration**.
3. Install, restart Home Assistant.
4. Settings, Devices & Services, Add Integration, "Fast News Reader".
5. Pick a region, then one or more feeds.

## Lovelace card

The card ships with the integration and registers itself automatically. Add it through "Add card", search for "Fast News Reader", and the visual editor appears (multi-feed picker, plus toggles for every option). Or paste YAML:

```yaml
type: custom:fast-news-reader-card
entities:                # one or many feed sensors, mixed by date
  - sensor.tagesschau
  - sensor.heise
max_items: 5             # default 5
show_image: true         # default true
show_summary: true       # default true
show_date: true          # default true (relative timestamp)
title: "Mein News-Mix"   # optional override
# legacy single-feed format also works:
# entity: sensor.tagesschau
```

The card shows a stack of articles, mixed by date when several feeds are selected. Clicking an article opens a fullscreen reader with hero image, sanitized HTML, and "Quelle öffnen". Side arrows, keyboard arrows, or swipe on mobile flip between articles. Each article has Read-later, Favorite and Hide actions in the modal header, persisted in browser localStorage. Hidden articles are filtered out of the card. Theme-aware via HA CSS variables.

## Sensor schema

```yaml
sensor.<feed_name>:
  state: <int>          # number of entries
  attributes:
    channel: { title, link, image, description, language }
    entries:
      - id, title, link, summary, content, published
      - image            # absolute URL or null
      - author, category
    attribution: "Fast News Reader"
    friendly_name: <user-set name>
```

Full reference: [docs/SCHEMA.md](docs/SCHEMA.md).

## Custom feeds

Don't see your source in the list? Pick "Enter a custom feed URL" instead. Works with any RSS or Atom feed.

| Field | Default | Notes |
|---|---|---|
| `name` | - | Display name |
| `feed_url` | - | RSS or Atom URL |
| `scan_interval` | `3600` | Seconds between fetches (min 60) |
| `date_format` | `%Y-%m-%dT%H:%M:%S%z` | strftime for `entry.published` |
| `local_time` | `false` | Convert UTC to local before formatting |

## More docs

- [Schema reference](docs/SCHEMA.md): sensor attribute contract for card developers.
- [Image extraction deep-dive](docs/IMAGE_EXTRACTION.md): how the 5 paths work.
- [Development guide](docs/DEVELOPMENT.md): local setup, testing, releasing.

## Contributing

PRs welcome. Adding a curated feed is a one-liner in [`presets.py`](custom_components/fast_news_reader/presets.py). For new image extraction paths, add a fixture and a test first; the test file is the contract.

```bash
pip install -e ".[dev]"
pytest
```

## License

MIT, see [LICENSE](LICENSE).
