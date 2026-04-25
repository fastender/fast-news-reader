"""Constants for the Fast News Reader integration."""
from __future__ import annotations

from datetime import timedelta

DOMAIN = "fast_news_reader"

CONF_NAME = "name"
CONF_FEED_URL = "feed_url"
CONF_SCAN_INTERVAL = "scan_interval"
CONF_DATE_FORMAT = "date_format"
CONF_LOCAL_TIME = "local_time"

DEFAULT_SCAN_INTERVAL = timedelta(hours=1)
DEFAULT_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S%z"
DEFAULT_LOCAL_TIME = False

ATTRIBUTION = "Fast News Reader"
