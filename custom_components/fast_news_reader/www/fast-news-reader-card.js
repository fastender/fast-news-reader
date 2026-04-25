/*!
 * Fast News Reader, Lovelace card
 *
 * Vanilla web component (no Lit, no build step). Reads `entries` from a
 * fast_news_reader sensor and renders a Feedly-style stack of articles
 * with image, title, summary, and relative time.
 *
 * Card config:
 *   type: custom:fast-news-reader-card
 *   entity: sensor.tagesschau
 *   max_items: 5            # default 5
 *   show_image: true        # default true
 *   show_summary: true      # default true
 *   show_date: true         # default true
 *   title: "My news"        # optional, defaults to channel.title
 */

const CARD_VERSION = "0.5.0";

console.info(
  `%c FAST-NEWS-READER-CARD %c v${CARD_VERSION} `,
  "color:white;background:#FF6B4A;font-weight:700;border-radius:3px 0 0 3px;padding:2px 6px",
  "color:#FF6B4A;background:#1A1A1A;font-weight:700;border-radius:0 3px 3px 0;padding:2px 6px"
);

const STYLES = `
  :host { display: block; }
  ha-card {
    overflow: hidden;
    padding: 0;
  }
  .header {
    padding: 16px 16px 8px;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--primary-text-color);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .header .count {
    font-weight: 400;
    color: var(--secondary-text-color);
    font-size: 0.85rem;
  }
  .empty {
    padding: 24px 16px;
    color: var(--secondary-text-color);
    font-size: 0.9rem;
    text-align: center;
  }
  .list {
    display: flex;
    flex-direction: column;
  }
  .article {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 12px;
    padding: 12px 16px;
    border-top: 1px solid var(--divider-color);
    cursor: pointer;
    transition: background-color 120ms ease;
    color: inherit;
    text-decoration: none;
  }
  .article:hover {
    background-color: var(--primary-background-color);
  }
  .article.no-image {
    grid-template-columns: 1fr;
  }
  .thumb {
    width: 96px;
    height: 72px;
    border-radius: 8px;
    object-fit: cover;
    background-color: var(--secondary-background-color);
  }
  .body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    min-width: 0;
  }
  .title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--primary-text-color);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .summary {
    font-size: 0.82rem;
    color: var(--secondary-text-color);
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .meta {
    font-size: 0.75rem;
    color: var(--secondary-text-color);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .meta .dot { opacity: 0.5; }
`;

function stripHtml(s) {
  if (!s) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = s;
  return (tmp.textContent || tmp.innerText || "").trim();
}

function relativeTime(iso, locale) {
  if (!iso) return "";
  const t = new Date(iso);
  if (isNaN(t)) return "";
  const diffMs = Date.now() - t.getTime();
  const sec = Math.round(diffMs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  const rtf = new Intl.RelativeTimeFormat(locale || "en", { numeric: "auto" });
  if (sec < 60) return rtf.format(-sec, "second");
  if (min < 60) return rtf.format(-min, "minute");
  if (hr < 24) return rtf.format(-hr, "hour");
  return rtf.format(-day, "day");
}

class FastNewsReaderCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._lastEntityState = null;
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("entity is required");
    }
    if (!config.entity.startsWith("sensor.")) {
      throw new Error("entity must be a sensor entity");
    }
    this._config = {
      max_items: 5,
      show_image: true,
      show_summary: true,
      show_date: true,
      ...config,
    };
    this._lastEntityState = null;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const stateObj = hass.states[this._config?.entity];
    // Only re-render when the state or last_updated actually changed.
    const stamp = stateObj
      ? `${stateObj.state}|${stateObj.last_updated}`
      : "missing";
    if (stamp !== this._lastEntityState) {
      this._lastEntityState = stamp;
      this._render();
    }
  }

  getCardSize() {
    return Math.min(1 + (this._config?.max_items || 5), 8);
  }

  static getConfigElement() {
    return null; // visual editor not provided yet
  }

  static getStubConfig(hass, entities) {
    const candidate = (entities || []).find(
      (e) => e.startsWith("sensor.") && hass.states[e]?.attributes?.entries
    );
    return {
      type: "custom:fast-news-reader-card",
      entity: candidate || "sensor.fast_news_reader",
      max_items: 5,
    };
  }

  _render() {
    if (!this._config) return;
    const hass = this._hass;
    const stateObj = hass?.states[this._config.entity];
    const locale = hass?.locale?.language || "en";

    if (!stateObj) {
      this._renderShell(`
        <div class="empty">Entity not found: ${this._config.entity}</div>
      `);
      return;
    }

    const channel = stateObj.attributes.channel || {};
    const entries = (stateObj.attributes.entries || []).slice(
      0,
      this._config.max_items
    );
    const total = stateObj.attributes.entries?.length || 0;
    const headerTitle =
      this._config.title || channel.title || stateObj.attributes.friendly_name || "";

    if (!entries.length) {
      this._renderShell(`
        <div class="header">
          <span>${headerTitle}</span>
        </div>
        <div class="empty">No entries yet.</div>
      `);
      return;
    }

    const itemsHtml = entries
      .map((e) => {
        const hasImg = this._config.show_image && e.image;
        const summary = this._config.show_summary && e.summary
          ? `<div class="summary">${stripHtml(e.summary)}</div>`
          : "";
        const meta = this._config.show_date && e.published
          ? `<div class="meta">
               <span>${relativeTime(e.published, locale)}</span>
               ${e.author ? `<span class="dot">·</span><span>${e.author}</span>` : ""}
             </div>`
          : "";
        return `
          <a class="article ${hasImg ? "" : "no-image"}"
             href="${e.link || "#"}" target="_blank" rel="noopener">
            ${hasImg ? `<img class="thumb" src="${e.image}" loading="lazy" alt="">` : ""}
            <div class="body">
              <div class="title">${e.title || ""}</div>
              ${summary}
              ${meta}
            </div>
          </a>
        `;
      })
      .join("");

    this._renderShell(`
      <div class="header">
        <span>${headerTitle}</span>
        <span class="count">${total} entr${total === 1 ? "y" : "ies"}</span>
      </div>
      <div class="list">${itemsHtml}</div>
    `);
  }

  _renderShell(inner) {
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>${inner}</ha-card>
    `;
  }
}

if (!customElements.get("fast-news-reader-card")) {
  customElements.define("fast-news-reader-card", FastNewsReaderCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.find((c) => c.type === "fast-news-reader-card")) {
  window.customCards.push({
    type: "fast-news-reader-card",
    name: "Fast News Reader",
    description:
      "Feedly-style news card with images, titles, and relative timestamps.",
    preview: false,
    documentationURL:
      "https://github.com/fastender/fast-news-reader#lovelace-card",
  });
}
