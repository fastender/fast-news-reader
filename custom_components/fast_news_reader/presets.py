"""Curated feed presets for the discovery flow.

Each preset has a stable `slug` (used as the dropdown value), a display
`name`, the canonical `url`, a `category` for grouping, and a `language`
used by the region filter at setup time.

Presets are intentionally hand-picked, not crowdsourced. Adding one is a
deliberate choice: the feed must be stable, well-formed, and produce
images via at least one of the five extractor paths.
"""
from __future__ import annotations

from typing import Literal, TypedDict

Language = Literal["de", "en"]


class Preset(TypedDict):
    slug: str
    name: str
    url: str
    category: str
    language: Language


CATEGORY_NEWS = "news"
CATEGORY_TECH = "tech"
CATEGORY_SCIENCE = "science"
CATEGORY_SPORT = "sport"
CATEGORY_BUSINESS = "business"

CATEGORY_LABELS: dict[str, str] = {
    CATEGORY_NEWS: "News",
    CATEGORY_TECH: "Tech",
    CATEGORY_SCIENCE: "Science",
    CATEGORY_SPORT: "Sport",
    CATEGORY_BUSINESS: "Business",
}

LANGUAGE_LABELS: dict[Language, str] = {
    "de": "Deutsch",
    "en": "English",
}


def _p(slug: str, name: str, url: str, category: str, language: Language) -> Preset:
    return {
        "slug": slug,
        "name": name,
        "url": url,
        "category": category,
        "language": language,
    }


PRESETS: list[Preset] = [
    # German news
    _p("tagesschau", "Tagesschau",
       "https://www.tagesschau.de/xml/rss2/", CATEGORY_NEWS, "de"),
    _p("spiegel", "Spiegel Online",
       "https://www.spiegel.de/schlagzeilen/index.rss", CATEGORY_NEWS, "de"),
    _p("zeit", "Zeit Online",
       "https://newsfeed.zeit.de/index", CATEGORY_NEWS, "de"),
    _p("sueddeutsche", "Süddeutsche Zeitung",
       "https://rss.sueddeutsche.de/rss/Topthemen", CATEGORY_NEWS, "de"),
    _p("faz", "Frankfurter Allgemeine",
       "https://www.faz.net/rss/aktuell/", CATEGORY_NEWS, "de"),
    _p("tagesspiegel", "Der Tagesspiegel",
       "https://www.tagesspiegel.de/contentexport/feed/home", CATEGORY_NEWS, "de"),
    _p("dw_de", "Deutsche Welle",
       "https://rss.dw.com/rdf/rss-de-all", CATEGORY_NEWS, "de"),
    # English news
    _p("bbc", "BBC News",
       "https://feeds.bbci.co.uk/news/rss.xml", CATEGORY_NEWS, "en"),
    _p("guardian", "The Guardian",
       "https://www.theguardian.com/world/rss", CATEGORY_NEWS, "en"),
    _p("npr_world", "NPR World",
       "https://feeds.npr.org/1004/rss.xml", CATEGORY_NEWS, "en"),
    _p("aljazeera", "Al Jazeera",
       "https://www.aljazeera.com/xml/rss/all.xml", CATEGORY_NEWS, "en"),
    _p("dw_en", "Deutsche Welle (EN)",
       "https://rss.dw.com/rdf/rss-en-all", CATEGORY_NEWS, "en"),
    # Tech
    _p("heise", "Heise Online",
       "https://www.heise.de/rss/heise-atom.xml", CATEGORY_TECH, "de"),
    _p("golem", "Golem.de",
       "https://rss.golem.de/rss.php?feed=RSS2.0", CATEGORY_TECH, "de"),
    _p("ars", "Ars Technica",
       "https://feeds.arstechnica.com/arstechnica/index", CATEGORY_TECH, "en"),
    _p("verge", "The Verge",
       "https://www.theverge.com/rss/index.xml", CATEGORY_TECH, "en"),
    _p("hn", "Hacker News (Front page)",
       "https://hnrss.org/frontpage", CATEGORY_TECH, "en"),
    # Science
    _p("nature", "Nature",
       "https://www.nature.com/nature.rss", CATEGORY_SCIENCE, "en"),
    _p("sciencedaily", "ScienceDaily Top",
       "https://www.sciencedaily.com/rss/top.xml", CATEGORY_SCIENCE, "en"),
    # Sport
    _p("kicker", "Kicker",
       "https://newsfeed.kicker.de/news/aktuell", CATEGORY_SPORT, "de"),
    _p("bbc_sport", "BBC Sport",
       "https://feeds.bbci.co.uk/sport/rss.xml", CATEGORY_SPORT, "en"),
    # Business
    _p("handelsblatt", "Handelsblatt",
       "https://www.handelsblatt.com/contentexport/feed/top-themen",
       CATEGORY_BUSINESS, "de"),
    _p("ft", "Financial Times Home",
       "https://www.ft.com/rss/home", CATEGORY_BUSINESS, "en"),
]


_PRESET_BY_SLUG: dict[str, Preset] = {p["slug"]: p for p in PRESETS}
_PRESET_BY_URL: dict[str, Preset] = {p["url"]: p for p in PRESETS}


def get_preset(slug: str) -> Preset | None:
    return _PRESET_BY_SLUG.get(slug)


def get_preset_by_url(url: str) -> Preset | None:
    """Reverse lookup so existing config entries that pre-date the
    `theme` field can still derive one from their stored feed URL."""
    return _PRESET_BY_URL.get(url)


def available_categories_for_language(
    language: Language,
    excluded_urls: set[str] | None = None,
) -> list[tuple[str, int]]:
    """Categories that still have at least one feed left for this language.

    Returns [(category_slug, count_remaining), ...] in CATEGORY_LABELS order.
    """
    excluded = excluded_urls or set()
    counts: dict[str, int] = {cat: 0 for cat in CATEGORY_LABELS}
    for preset in PRESETS:
        if preset["language"] != language:
            continue
        if preset["url"] in excluded:
            continue
        counts[preset["category"]] += 1
    return [(cat, n) for cat, n in counts.items() if n > 0]


def preset_options_for_language(
    language: Language,
    category: str | None = None,
    excluded_urls: set[str] | None = None,
) -> list[dict[str, str]]:
    """SelectSelector options, filtered by language and optionally by category.

    When `category` is given, the category prefix is dropped from labels (it's
    redundant since the user already picked the topic). When None, every label
    is prefixed with its category for context.

    Order: CATEGORY_LABELS order, then insertion order within each category.
    """
    excluded = excluded_urls or set()
    by_cat: dict[str, list[Preset]] = {}
    for preset in PRESETS:
        if preset["language"] != language:
            continue
        if category and preset["category"] != category:
            continue
        if preset["url"] in excluded:
            continue
        by_cat.setdefault(preset["category"], []).append(preset)

    options: list[dict[str, str]] = []
    for cat, label in CATEGORY_LABELS.items():
        for preset in by_cat.get(cat, []):
            display = preset["name"] if category else f"{label}: {preset['name']}"
            options.append({"value": preset["slug"], "label": display})
    return options
