# Development

## Setup

```bash
git clone https://github.com/fastender/fast-news-reader
cd fast-news-reader
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Running tests

```bash
pytest -v
```

The image-extractor tests need real RSS fixtures — see [`tests/fixtures/README.md`](../tests/fixtures/README.md) for capture instructions. Until those are committed, the parametrized tests fail with "fixture not found".

## Linting

```bash
ruff check .
ruff format .
```

CI runs both on every push and PR.

## Project layout

```
custom_components/fast_news_reader/
├── __init__.py          # async_setup_entry, lifecycle
├── manifest.json        # HACS metadata
├── const.py             # DOMAIN, CONF_*, defaults
├── config_flow.py       # UI setup (Settings → Devices & Services → Add)
├── coordinator.py       # DataUpdateCoordinator: fetch + parse
├── sensor.py            # SensorEntity (1 per feed)
├── image_extractor.py   # 5-path image extraction (the core value)
├── strings.json         # i18n source
└── translations/
    ├── de.json
    └── en.json
```

## Lifecycle

```
HA start
  → __init__.async_setup_entry
  → FastNewsReaderCoordinator.async_config_entry_first_refresh()
       → fetch feed via aiohttp
       → feedparser.parse() in executor (CPU-bound)
       → extract_image() per entry
  → forward_entry_setups(["sensor"])
       → FastNewsReaderSensor created
  → coordinator polls on scan_interval
       → on update: sensor.async_write_ha_state()
```

## Local HA test instance

The fastest way to smoke-test changes against a real feed:

1. Run a dev HA in Docker: `docker run -p 8123:8123 -v ./config:/config homeassistant/home-assistant:stable`
2. Symlink the integration into the dev HA config:
   ```bash
   ln -s $(pwd)/custom_components/fast_news_reader ./config/custom_components/fast_news_reader
   ```
3. Restart the dev HA, add the integration via the UI, point it at `https://www.tagesschau.de/xml/rss2/`
4. Open Developer Tools → States → search `sensor.tagesschau`. Each entry should have a non-null `image` URL.

## Releasing

1. Bump version in `custom_components/fast_news_reader/manifest.json`
2. Commit: `git commit -am "Release vX.Y.Z"`
3. Tag and release: `gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."`
4. HACS picks up the new tag automatically (no manual step in the HACS store)

## Adding a new image source

See [IMAGE_EXTRACTION.md → Adding a sixth source](IMAGE_EXTRACTION.md#adding-a-sixth-source). Always add a fixture + test first.
