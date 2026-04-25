# Sensor Schema

Each configured feed becomes one `sensor.<name>` entity. The schema is **drop-in compatible** with `timmaurice/feedparser` so existing Lovelace cards work without changes.

## State

| Field | Type | Meaning |
|---|---|---|
| `state` | `int` | Number of entries in the most recent fetch |

## Attributes

```python
{
    "channel": dict,        # feed-level metadata
    "entries": list[dict],  # one dict per article
    "attribution": str,     # always "Fast News Reader"
    "friendly_name": str,   # user-set name from config flow
}
```

### `channel`

| Key | Type | Notes |
|---|---|---|
| `title` | `str` | Falls back to user-set name if feed has no title |
| `link` | `str \| None` | Homepage URL of the feed source |
| `description` | `str \| None` | `<subtitle>` (Atom) or `<description>` (RSS) |
| `image` | `str \| None` | Channel-level logo URL |
| `language` | `str \| None` | e.g. `"de-DE"` |

### `entries[]`

| Key | Type | Notes |
|---|---|---|
| `id` | `str` | `entry.id` → `entry.guid` → `entry.link` (first non-empty) |
| `title` | `str` | |
| `link` | `str` | Article URL |
| `summary` | `str` | May contain HTML — strip client-side if you need plain text |
| `content` | `str \| None` | Full HTML from `<content:encoded>` if present |
| `published` | `str \| None` | Formatted per `date_format` config (default ISO 8601) |
| `image` | `str \| None` | **Absolute** URL extracted via [5 paths](IMAGE_EXTRACTION.md) |
| `author` | `str \| None` | |
| `category` | `list[str] \| None` | Tags / categories |

## Example

```yaml
sensor.tagesschau:
  state: 25
  attributes:
    channel:
      title: tagesschau.de
      link: https://www.tagesschau.de
      language: de
    entries:
      - id: https://www.tagesschau.de/inland/...
        title: "Beispiel-Schlagzeile"
        link: https://www.tagesschau.de/inland/beispiel.html
        summary: "Erste Sätze des Artikels..."
        content: "<p>Volles HTML...</p>"
        published: "2026-04-25T18:30:00+0000"
        image: https://images.tagesschau.de/image/abc/16x9/1280.jpg
        author: tagesschau.de
        category: ["Inland"]
    attribution: "Fast News Reader"
    friendly_name: Tagesschau
```

## Stability

The schema follows semver against the integration version. Breaking changes only on major bumps (1.0 → 2.0). Adding optional fields is non-breaking.
