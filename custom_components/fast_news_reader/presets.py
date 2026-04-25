"""Curated feed presets — the Feedly-style discovery experience.

Each preset has a stable `slug` (used as the dropdown value), a display
`name`, the canonical `url`, and a `category` used for grouping in the UI.

Presets are intentionally hand-picked, not crowdsourced. Adding one is a
deliberate choice: the feed must be stable, well-formed, and produce
images via at least one of the five extractor paths.
"""
from __future__ import annotations

from typing import TypedDict


class Preset(TypedDict):
    slug: str
    name: str
    url: str
    category: str  # one of the CATEGORY_* constants below


CATEGORY_NEWS_DE = "news_de"
CATEGORY_NEWS_WORLD = "news_world"
CATEGORY_TECH = "tech"
CATEGORY_SCIENCE = "science"
CATEGORY_SPORT = "sport"
CATEGORY_BUSINESS = "business"

CATEGORY_LABELS: dict[str, str] = {
    CATEGORY_NEWS_DE: "🇩🇪 Nachrichten",
    CATEGORY_NEWS_WORLD: "🌍 World news",
    CATEGORY_TECH: "💻 Tech",
    CATEGORY_SCIENCE: "🔬 Science",
    CATEGORY_SPORT: "⚽ Sport",
    CATEGORY_BUSINESS: "📈 Business",
}

PRESETS: list[Preset] = [
    # 🇩🇪 Nachrichten
    {
        "slug": "tagesschau",
        "name": "Tagesschau",
        "url": "https://www.tagesschau.de/xml/rss2/",
        "category": CATEGORY_NEWS_DE,
    },
    {
        "slug": "spiegel",
        "name": "Spiegel Online",
        "url": "https://www.spiegel.de/schlagzeilen/index.rss",
        "category": CATEGORY_NEWS_DE,
    },
    {
        "slug": "zeit",
        "name": "Zeit Online",
        "url": "https://newsfeed.zeit.de/index",
        "category": CATEGORY_NEWS_DE,
    },
    {
        "slug": "sueddeutsche",
        "name": "Süddeutsche Zeitung",
        "url": "https://rss.sueddeutsche.de/rss/Topthemen",
        "category": CATEGORY_NEWS_DE,
    },
    {
        "slug": "faz",
        "name": "Frankfurter Allgemeine",
        "url": "https://www.faz.net/rss/aktuell/",
        "category": CATEGORY_NEWS_DE,
    },
    {
        "slug": "tagesspiegel",
        "name": "Der Tagesspiegel",
        "url": "https://www.tagesspiegel.de/contentexport/feed/home",
        "category": CATEGORY_NEWS_DE,
    },
    # 🌍 World news
    {
        "slug": "bbc",
        "name": "BBC News",
        "url": "https://feeds.bbci.co.uk/news/rss.xml",
        "category": CATEGORY_NEWS_WORLD,
    },
    {
        "slug": "guardian",
        "name": "The Guardian",
        "url": "https://www.theguardian.com/world/rss",
        "category": CATEGORY_NEWS_WORLD,
    },
    {
        "slug": "reuters_world",
        "name": "Reuters World",
        "url": "https://feeds.reuters.com/Reuters/worldNews",
        "category": CATEGORY_NEWS_WORLD,
    },
    {
        "slug": "aljazeera",
        "name": "Al Jazeera",
        "url": "https://www.aljazeera.com/xml/rss/all.xml",
        "category": CATEGORY_NEWS_WORLD,
    },
    {
        "slug": "dw",
        "name": "Deutsche Welle (EN)",
        "url": "https://rss.dw.com/rdf/rss-en-all",
        "category": CATEGORY_NEWS_WORLD,
    },
    # 💻 Tech
    {
        "slug": "heise",
        "name": "Heise Online",
        "url": "https://www.heise.de/rss/heise-atom.xml",
        "category": CATEGORY_TECH,
    },
    {
        "slug": "golem",
        "name": "Golem.de",
        "url": "https://rss.golem.de/rss.php?feed=RSS2.0",
        "category": CATEGORY_TECH,
    },
    {
        "slug": "ars",
        "name": "Ars Technica",
        "url": "https://feeds.arstechnica.com/arstechnica/index",
        "category": CATEGORY_TECH,
    },
    {
        "slug": "verge",
        "name": "The Verge",
        "url": "https://www.theverge.com/rss/index.xml",
        "category": CATEGORY_TECH,
    },
    {
        "slug": "hn",
        "name": "Hacker News (Front page)",
        "url": "https://hnrss.org/frontpage",
        "category": CATEGORY_TECH,
    },
    # 🔬 Science
    {
        "slug": "nature",
        "name": "Nature",
        "url": "https://www.nature.com/nature.rss",
        "category": CATEGORY_SCIENCE,
    },
    {
        "slug": "sciencedaily",
        "name": "ScienceDaily — Top",
        "url": "https://www.sciencedaily.com/rss/top.xml",
        "category": CATEGORY_SCIENCE,
    },
    # ⚽ Sport
    {
        "slug": "kicker",
        "name": "Kicker",
        "url": "https://newsfeed.kicker.de/news/aktuell",
        "category": CATEGORY_SPORT,
    },
    {
        "slug": "bbc_sport",
        "name": "BBC Sport",
        "url": "https://feeds.bbci.co.uk/sport/rss.xml",
        "category": CATEGORY_SPORT,
    },
    # 📈 Business
    {
        "slug": "handelsblatt",
        "name": "Handelsblatt",
        "url": "https://www.handelsblatt.com/contentexport/feed/top-themen",
        "category": CATEGORY_BUSINESS,
    },
    {
        "slug": "ft",
        "name": "Financial Times — Home",
        "url": "https://www.ft.com/rss/home",
        "category": CATEGORY_BUSINESS,
    },
]


def get_preset(slug: str) -> Preset | None:
    for preset in PRESETS:
        if preset["slug"] == slug:
            return preset
    return None


def preset_options() -> list[dict[str, str]]:
    """Return SelectSelector-compatible options, grouped by category in label."""
    by_cat: dict[str, list[Preset]] = {}
    for preset in PRESETS:
        by_cat.setdefault(preset["category"], []).append(preset)

    options: list[dict[str, str]] = []
    # Preserve CATEGORY_LABELS order so similar feeds cluster in the dropdown.
    for category, label in CATEGORY_LABELS.items():
        for preset in by_cat.get(category, []):
            options.append(
                {"value": preset["slug"], "label": f"{label}  ·  {preset['name']}"}
            )
    return options
