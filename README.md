# 📰 Fast News Reader

> RSS for Home Assistant — with the images you actually want.

[![GitHub Release](https://img.shields.io/github/v/release/fastender/fast-news-reader?style=flat-square)](https://github.com/fastender/fast-news-reader/releases)
[![Tests](https://img.shields.io/github/actions/workflow/status/fastender/fast-news-reader/test.yml?branch=main&label=tests&style=flat-square)](https://github.com/fastender/fast-news-reader/actions/workflows/test.yml)
[![HACS](https://img.shields.io/badge/HACS-Custom-41BDF5?style=flat-square)](https://hacs.xyz)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.12+-03A9F4?style=flat-square&logo=home-assistant&logoColor=white)](https://www.home-assistant.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

Add any RSS or Atom feed to Home Assistant in seconds — with **proper image extraction**, including from `<content:encoded>`, the source most other integrations skip. Pick from 20+ hand-picked feeds (Tagesschau, Heise, BBC, The Verge…) or paste your own URL.

---

## Why this exists

- `core feedreader` strips images from event entities by design.
- `timmaurice/feedparser` checks `media:*` and enclosures, but **not** `<content:encoded>`. Tagesschau, Heise, Spiegel and many German feeds put their images only there → no images in your card.

This integration covers all five common image sources, so your news card actually has pictures in it.

## ✨ What you get

- 📰 **Feedly-style discovery** — pick a feed from a curated dropdown, no URL hunting required
- 🖼️ **Images that actually show up** — five-path extractor, including the `<content:encoded>` gap
- ⚙️ **Edit anytime** — change refresh interval, date format, locale without re-adding the feed
- 🌐 **Drop-in compatible** — same sensor schema as `timmaurice/feedparser`, existing Lovelace cards keep working
- 🇩🇪 **DE + EN translations** — friendly, conversational UI copy

## 🚀 Install (HACS Custom Repository)

1. HACS → Integrations → ⋮ → **Custom repositories**
2. Add `https://github.com/fastender/fast-news-reader` as **Integration**
3. Install, restart Home Assistant
4. **Settings → Devices & Services → Add Integration → "Fast News Reader"**
5. Pick a feed from the list — done.

## 📊 Sensor schema

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

## 🛠️ Custom feeds

Don't see your favourite source in the list? Pick **🔗 Enter a custom feed URL** in the same dialog — works with any RSS or Atom feed.

| Field | Default | Notes |
|---|---|---|
| `name` | — | Display name |
| `feed_url` | — | RSS or Atom URL |
| `scan_interval` | `3600` | Seconds between fetches (min 60) |
| `date_format` | `%Y-%m-%dT%H:%M:%S%z` | strftime for `entry.published` |
| `local_time` | `false` | Convert UTC → local before formatting |

## 📚 More docs

- [Schema reference](docs/SCHEMA.md) — sensor attribute contract for card developers
- [Image extraction deep-dive](docs/IMAGE_EXTRACTION.md) — why this integration exists, how the 5 paths work
- [Development guide](docs/DEVELOPMENT.md) — local setup, testing, releasing

## 🤝 Contributing

PRs welcome — especially new entries for [`presets.py`](custom_components/fast_news_reader/presets.py). Add a fixture and a test before adding a new image extraction path; the test file is the contract.

```bash
pip install -e ".[dev]"
pytest
```

## License

MIT — see [LICENSE](LICENSE).
