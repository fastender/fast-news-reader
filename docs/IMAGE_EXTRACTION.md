# Image Extraction

The single feature that justifies a third RSS integration alongside `core feedreader` and `timmaurice/feedparser`: proper image extraction from `<content:encoded>`.

## The problem

RSS has no standard image field. Five conventions evolved, all loosely supported:

| Convention | Where in the XML | Used by |
|---|---|---|
| `media:thumbnail` | `<media:thumbnail url="...">` | BBC, Reuters |
| `media:content` | `<media:content url="..." medium="image">` | Heise, AP |
| `enclosure` | `<enclosure url="..." type="image/jpeg">` | Many podcasts, some news |
| `<content:encoded>` | First `<img>` inside the CDATA HTML block | Tagesschau, ZDF, Spiegel, many DE feeds |
| `<description>` HTML | First `<img>` inside the description text | Generic blogs, WordPress |

`core feedreader` only forwards 4 keys to its event entity (`title`, `link`, `description`, `content`); images are deliberately stripped. `timmaurice/feedparser` checks paths 1, 2, 3, and 5, but not 4. Tagesschau and most German news feeds put images only in `<content:encoded>`. Result: gray placeholders in the card.

## How this integration solves it

[`image_extractor.py`](../custom_components/fast_news_reader/image_extractor.py) tries all five paths in order, returns the first absolute URL it finds:

```
extract_image(entry, feed_url):
    1. media:thumbnail        return first .url
    2. media:content          return first with medium=image or type=image/*
    3. enclosures             return first with type=image/*
    4. <content:encoded>      regex first <img src=...> inside HTML
    5. <description>/summary  regex first <img src=...> inside HTML
    return None
```

Path 4 is the differentiator. It scans the HTML inside `entry.content[0].value` (where feedparser puts `<content:encoded>` payloads) for `<img>` tags using a quote-aware regex.

The regex handles all three quoting styles in the wild:

```python
<img src="https://...">      # double quotes
<img src='https://...'>      # single quotes
<img src=https://...>        # no quotes (rare but happens)
```

All returned URLs go through `urljoin()` against the feed URL so relative paths (`/img/foo.jpg`) become absolute.

## Adding a sixth source

If you find a feed that uses something exotic (e.g. `itunes:image`, custom namespace), add a new branch to `extract_image()` before the existing fallbacks. Keep the order:

1. Most-specific structured fields first (less likely to grab a tracking pixel)
2. HTML scans last (more error-prone, may pick up irrelevant images)

Always add a fixture and test before adding a path; the test file is the contract.

## Phase 2: og:image fallback (planned, not yet implemented)

For pure-text feeds without any image source, fetch the article URL and read `<meta property="og:image">`. See roadmap §4 in the parent project's `docs/CUSTOM_COMPONENT_ROADMAP.md`.
