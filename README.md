# Fast News Reader

A Home Assistant custom integration that turns any RSS/Atom feed into a sensor — with **proper image extraction** from `<content:encoded>`, the source most other integrations ignore.

## Why?

- `core feedreader` strips images from event entities by design.
- `timmaurice/feedparser` checks `media:*` and enclosures, but **not** `<content:encoded>`. Tagesschau, Heise, and many German feeds put their images only there → no images in your card.

This integration covers all five common image sources, including `<content:encoded>`.

## Documentation

- [Schema reference](docs/SCHEMA.md) — sensor attributes contract for card developers
- [Image extraction deep-dive](docs/IMAGE_EXTRACTION.md) — why this integration exists, how the 5 paths work
- [Development guide](docs/DEVELOPMENT.md) — local setup, testing, releasing

## Schema

Drop-in compatible with `timmaurice/feedparser`:

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

## Installation (HACS Custom Repository)

1. HACS → Integrations → ⋮ → Custom repositories
2. Add `https://github.com/fastender/fast-news-reader` as **Integration**
3. Install, restart HA
4. Settings → Devices & Services → Add Integration → "Fast News Reader"
5. Enter a name + feed URL. Done.

## Configuration

| Field | Default | Notes |
|---|---|---|
| `name` | — | Friendly sensor name |
| `feed_url` | — | RSS or Atom URL |
| `scan_interval` | `3600` | Seconds between fetches |
| `date_format` | `%Y-%m-%dT%H:%M:%S%z` | strftime for `entry.published` |
| `local_time` | `false` | Convert UTC → local before formatting |

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). TL;DR:

```bash
pip install -e ".[dev]"
pytest
```

Test fixtures live in `tests/fixtures/` — see [its README](tests/fixtures/README.md) for capture instructions.

## License

MIT
