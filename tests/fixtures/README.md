# Test Fixtures

Real RSS samples used as regression tests for the image extractor.

**TODO before tests can run:**

- `tagesschau.xml` — `curl https://www.tagesschau.de/xml/rss2/ -o tagesschau.xml`
  Critical: this is the feed that motivated the whole component (image only in `<content:encoded>`).
- `bbc.xml` — `curl https://feeds.bbci.co.uk/news/rss.xml -o bbc.xml`
  Tests `media:thumbnail` extraction.
- `heise.xml` — `curl https://www.heise.de/rss/heise-atom.xml -o heise.xml`
  Tests `media:content` extraction.

Once captured, fixtures are committed and the tests are deterministic
(no network calls in CI).
