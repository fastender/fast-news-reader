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
    _p("reuters_world", "Reuters World",
       "https://feeds.reuters.com/Reuters/worldNews", CATEGORY_NEWS, "en"),
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


def get_preset(slug: str) -> Preset | None:
    for preset in PRESETS:
        if preset["slug"] == slug:
            return preset
    return None


def preset_options_for_language(
    language: Language,
    excluded_urls: set[str] | None = None,
) -> list[dict[str, str]]:
    """SelectSelector options for a single language, excluding URLs already configured.

    Order: by category (CATEGORY_LABELS order), then by insertion order within category.
    """
    excluded = excluded_urls or set()
    by_cat: dict[str, list[Preset]] = {}
    for preset in PRESETS:
        if preset["language"] != language:
            continue
        if preset["url"] in excluded:
            continue
        by_cat.setdefault(preset["category"], []).append(preset)

    options: list[dict[str, str]] = []
    for category, label in CATEGORY_LABELS.items():
        for preset in by_cat.get(category, []):
            options.append(
                {
                    "value": preset["slug"],
                    "label": f"{label}: {preset['name']}",
                }
            )
    return options
