"""Tests for the sensor entities."""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock

from custom_components.fast_news_reader.const import (
    CONF_FEED_URL,
    CONF_NAME,
    CONF_SCAN_INTERVAL,
    DOMAIN,
)
from custom_components.fast_news_reader.sensor import (
    FastNewsReaderSensor,
    LatestImageSensor,
    LatestPublishedSensor,
    LatestTitleSensor,
)
from pytest_homeassistant_custom_component.common import MockConfigEntry


def _make_entry() -> MockConfigEntry:
    return MockConfigEntry(
        domain=DOMAIN,
        data={
            CONF_NAME: "Test Feed",
            CONF_FEED_URL: "https://example.com/feed.xml",
            CONF_SCAN_INTERVAL: 600,
        },
        entry_id="test-entry",
    )


def _coord_with_data(data) -> MagicMock:
    coord = MagicMock()
    coord.data = data
    coord.feed_name = "Test Feed"
    coord.feed_url = "https://example.com/feed.xml"
    coord.last_update_success = True
    coord.latest_entry = (data.get("entries") or [None])[0] if data else None
    return coord


# ---- Recorder hygiene ----------------------------------------------------


def test_main_sensor_excludes_entries_and_channel_from_recorder() -> None:
    """Both bulky attributes must be in _unrecorded_attributes; otherwise
    the recorder DB grows by every refresh and HA logs size warnings."""
    assert "entries" in FastNewsReaderSensor._unrecorded_attributes
    assert "channel" in FastNewsReaderSensor._unrecorded_attributes


# ---- Main count sensor ---------------------------------------------------


def test_main_sensor_state_is_entry_count() -> None:
    coord = _coord_with_data({"channel": {}, "entries": [{}, {}, {}]})
    sensor = FastNewsReaderSensor(coord, _make_entry())
    assert sensor.native_value == 3


def test_main_sensor_state_is_none_when_no_data() -> None:
    coord = _coord_with_data(None)
    sensor = FastNewsReaderSensor(coord, _make_entry())
    assert sensor.native_value is None


def test_main_sensor_attributes_contain_channel_and_entries() -> None:
    coord = _coord_with_data(
        {"channel": {"title": "Test"}, "entries": [{"title": "A"}]}
    )
    sensor = FastNewsReaderSensor(coord, _make_entry())
    attrs = sensor.extra_state_attributes
    assert attrs["channel"] == {"title": "Test"}
    assert attrs["entries"] == [{"title": "A"}]
    assert attrs["attribution"]


def test_main_sensor_attributes_empty_when_no_data() -> None:
    coord = _coord_with_data(None)
    sensor = FastNewsReaderSensor(coord, _make_entry())
    assert sensor.extra_state_attributes == {}


# ---- Latest convenience sensors ------------------------------------------


def test_latest_title_returns_first_entry_title() -> None:
    coord = _coord_with_data(
        {"channel": {}, "entries": [{"title": "Newest"}, {"title": "Older"}]}
    )
    coord.latest_entry = {"title": "Newest"}
    sensor = LatestTitleSensor(coord, _make_entry())
    assert sensor.native_value == "Newest"


def test_latest_title_is_none_when_no_entries() -> None:
    coord = _coord_with_data(None)
    coord.latest_entry = None
    sensor = LatestTitleSensor(coord, _make_entry())
    assert sensor.native_value is None


def test_latest_image_exposes_value_as_entity_picture() -> None:
    coord = _coord_with_data(None)
    coord.latest_entry = {"image": "https://example.com/img.jpg"}
    sensor = LatestImageSensor(coord, _make_entry())
    assert sensor.native_value == "https://example.com/img.jpg"
    assert sensor.entity_picture == "https://example.com/img.jpg"


def test_latest_published_returns_datetime() -> None:
    when = datetime(2026, 4, 26, 12, 0, tzinfo=UTC)
    coord = _coord_with_data(None)
    coord.latest_entry = {"published_dt": when}
    sensor = LatestPublishedSensor(coord, _make_entry())
    assert sensor.native_value == when
