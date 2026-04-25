/*!
 * Fast News Reader, Lovelace card
 *
 * Vanilla web component, no Lit, no build step. Reads `entries` from a
 * fast_news_reader sensor and renders a Feedly-style stack of articles
 * with image, title, summary, and relative time. Clicking an article
 * opens a fullscreen reader with prev/next navigation.
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

const CARD_VERSION = "0.7.3";

console.info(
  `%c FAST-NEWS-READER-CARD %c v${CARD_VERSION} `,
  "color:white;background:#FF6B4A;font-weight:700;border-radius:3px 0 0 3px;padding:2px 6px",
  "color:#FF6B4A;background:#1A1A1A;font-weight:700;border-radius:0 3px 3px 0;padding:2px 6px"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(s) {
  if (!s) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = s;
  return (tmp.textContent || tmp.innerText || "").trim();
}

const ALLOWED_TAGS = new Set([
  "P", "BR", "B", "I", "STRONG", "EM", "U", "SPAN", "DIV",
  "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "LI", "BLOCKQUOTE", "FIGURE", "FIGCAPTION",
  "IMG", "A", "PICTURE", "SOURCE", "HR",
]);
function sanitizeHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_ELEMENT, null);
  const toRemove = [];
  while (walker.nextNode()) {
    const el = walker.currentNode;
    if (!ALLOWED_TAGS.has(el.tagName)) {
      toRemove.push(el);
      continue;
    }
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = (attr.value || "").trim().toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if (name === "href" || name === "src") {
        if (value.startsWith("javascript:") || value.startsWith("data:")) {
          el.removeAttribute(attr.name);
        }
      } else if (name === "style") {
        el.removeAttribute(attr.name);
      }
    });
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  }
  toRemove.forEach((n) => n.replaceWith(...n.childNodes));
  return tmp.innerHTML;
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

function absoluteDate(iso, locale) {
  if (!iso) return "";
  const t = new Date(iso);
  if (isNaN(t)) return "";
  return new Intl.DateTimeFormat(locale || "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(t);
}

// ===========================================================================
// 1) Visual editor - defined FIRST so getConfigElement always finds it.
//    Plain HTML form, no <ha-form> dependency. ha-form is only loaded after
//    the user has visited certain HA routes; relying on it makes the editor
//    silently fail for fresh sessions. Plain inputs work everywhere.
// ===========================================================================

const EDITOR_STYLES = `
  :host, :scope { display: block; }
  .editor-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 14px;
  }
  .editor-row label {
    font-size: 0.85rem;
    color: var(--secondary-text-color, #666);
    font-weight: 500;
  }
  .editor-row input[type="text"],
  .editor-row input[type="number"],
  .editor-row select {
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #1a1a1a);
    border: 1px solid var(--divider-color, rgba(0,0,0,0.12));
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 0.95rem;
    font-family: inherit;
  }
  .editor-row input[type="text"]:focus,
  .editor-row input[type="number"]:focus,
  .editor-row select:focus {
    outline: none;
    border-color: var(--primary-color, #FF6B4A);
  }
  .toggles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 4px;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--divider-color, rgba(0,0,0,0.12));
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    user-select: none;
  }
  .toggle input { margin: 0; cursor: pointer; }
  .hint {
    font-size: 0.78rem;
    color: var(--secondary-text-color, #888);
  }
`;

class FastNewsReaderCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._rendered = false;
  }

  setConfig(config) {
    this._config = { ...config };
    if (this._rendered) this._fill();
    else this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._rendered) this._refreshEntityOptions();
    else this._render();
  }

  _emit() {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      })
    );
  }

  _availableEntities() {
    if (!this._hass) return [];
    return Object.keys(this._hass.states)
      .filter(
        (id) =>
          id.startsWith("sensor.") &&
          this._hass.states[id]?.attributes?.entries !== undefined
      )
      .sort();
  }

  _render() {
    if (!this._hass) return;

    this.innerHTML = `
      <style>${EDITOR_STYLES}</style>
      <div class="editor-row">
        <label for="fnr-entity">Feed</label>
        <select id="fnr-entity"></select>
        <span class="hint">Pick a Fast News Reader sensor.</span>
      </div>
      <div class="editor-row">
        <label for="fnr-title">Title (optional)</label>
        <input id="fnr-title" type="text" placeholder="Defaults to the feed's channel title">
      </div>
      <div class="editor-row">
        <label for="fnr-max">Max items shown</label>
        <input id="fnr-max" type="number" min="1" max="50" step="1">
      </div>
      <div class="editor-row">
        <label>Show in card</label>
        <div class="toggles">
          <label class="toggle"><input id="fnr-img" type="checkbox"> Image</label>
          <label class="toggle"><input id="fnr-sum" type="checkbox"> Summary</label>
          <label class="toggle"><input id="fnr-date" type="checkbox"> Date</label>
        </div>
      </div>
    `;

    this._refreshEntityOptions();
    this._fill();

    const set = (key, val) => {
      this._config = { ...this._config, [key]: val };
      this._emit();
    };

    this.querySelector("#fnr-entity").addEventListener("change", (e) =>
      set("entity", e.target.value)
    );
    this.querySelector("#fnr-title").addEventListener("input", (e) =>
      set("title", e.target.value || undefined)
    );
    this.querySelector("#fnr-max").addEventListener("input", (e) => {
      const n = parseInt(e.target.value, 10);
      set("max_items", isNaN(n) ? 5 : n);
    });
    this.querySelector("#fnr-img").addEventListener("change", (e) =>
      set("show_image", e.target.checked)
    );
    this.querySelector("#fnr-sum").addEventListener("change", (e) =>
      set("show_summary", e.target.checked)
    );
    this.querySelector("#fnr-date").addEventListener("change", (e) =>
      set("show_date", e.target.checked)
    );

    this._rendered = true;
  }

  _refreshEntityOptions() {
    const select = this.querySelector("#fnr-entity");
    if (!select) return;
    const ids = this._availableEntities();
    const current = this._config.entity || "";
    select.innerHTML = "";

    if (current && !ids.includes(current)) ids.unshift(current);
    if (!ids.length) ids.push("");

    for (const id of ids) {
      const opt = document.createElement("option");
      opt.value = id;
      const stateObj = this._hass?.states?.[id];
      const friendly = stateObj?.attributes?.friendly_name;
      opt.textContent = id ? `${friendly || id} (${id})` : "(no feeds yet)";
      select.appendChild(opt);
    }
    select.value = current;
  }

  _fill() {
    const q = (sel) => this.querySelector(sel);
    if (!q("#fnr-entity")) return;
    q("#fnr-entity").value = this._config.entity || "";
    q("#fnr-title").value = this._config.title || "";
    q("#fnr-max").value =
      this._config.max_items !== undefined ? this._config.max_items : 5;
    q("#fnr-img").checked = this._config.show_image !== false;
    q("#fnr-sum").checked = this._config.show_summary !== false;
    q("#fnr-date").checked = this._config.show_date !== false;
  }
}

if (!customElements.get("fast-news-reader-card-editor")) {
  customElements.define(
    "fast-news-reader-card-editor",
    FastNewsReaderCardEditor
  );
  console.info("fast-news-reader-card-editor registered");
}

// ===========================================================================
// 2) Reader modal (Feedly-style overlay, prev/next, keyboard, swipe)
// ===========================================================================

const MODAL_STYLES = `
  :host { all: initial; }
  .overlay {
    position: fixed; inset: 0;
    background: color-mix(in srgb, var(--primary-background-color, #fff) 92%, transparent);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
    animation: fade-in 160ms ease-out;
    font-family: var(--primary-font-family, system-ui, -apple-system, sans-serif);
    color: var(--primary-text-color, #1a1a1a);
  }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  .panel {
    position: relative;
    background: var(--card-background-color, #fff);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    width: min(740px, 92vw);
    max-height: 90vh;
    overflow-y: auto;
    animation: slide-up 220ms cubic-bezier(.2,.8,.2,1);
  }
  @keyframes slide-up {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .close {
    position: absolute; top: 12px; right: 12px;
    width: 36px; height: 36px;
    border: none; border-radius: 50%;
    background: var(--secondary-background-color, rgba(0,0,0,0.05));
    color: var(--primary-text-color, #1a1a1a);
    cursor: pointer; font-size: 20px; line-height: 1;
    display: flex; align-items: center; justify-content: center;
    transition: background-color 120ms ease;
    z-index: 2;
  }
  .close:hover { background: var(--divider-color, rgba(0,0,0,0.12)); }
  .nav {
    position: fixed; top: 50%; transform: translateY(-50%);
    width: 56px; height: 56px;
    border: none; border-radius: 50%;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #1a1a1a);
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    cursor: pointer; font-size: 22px;
    display: flex; align-items: center; justify-content: center;
    transition: transform 120ms ease, opacity 120ms ease;
  }
  .nav:hover { transform: translateY(-50%) scale(1.06); }
  .nav:disabled { opacity: 0.35; cursor: default; transform: translateY(-50%); }
  .nav.prev { left: max(16px, calc((100vw - 740px) / 2 - 80px)); }
  .nav.next { right: max(16px, calc((100vw - 740px) / 2 - 80px)); }
  .hero {
    width: 100%; height: 360px;
    object-fit: cover;
    display: block;
    background: var(--secondary-background-color, #f3f3f3);
  }
  .hero-fallback { height: 0; }
  .body { padding: 24px 28px 32px; }
  .source {
    font-size: 0.78rem;
    color: var(--secondary-text-color);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 8px;
  }
  h1 {
    margin: 0 0 12px;
    font-size: 1.6rem;
    line-height: 1.2;
    font-weight: 700;
    color: var(--primary-text-color);
  }
  .meta {
    font-size: 0.85rem;
    color: var(--secondary-text-color);
    margin-bottom: 20px;
  }
  .meta .dot { opacity: 0.5; padding: 0 4px; }
  .content {
    font-size: 0.95rem;
    line-height: 1.6;
    color: var(--primary-text-color);
  }
  .content p { margin: 0 0 12px; }
  .content img {
    max-width: 100%; height: auto;
    border-radius: 8px;
    margin: 12px 0;
  }
  .content a { color: var(--primary-color, #FF6B4A); text-decoration: none; }
  .content a:hover { text-decoration: underline; }
  .visit {
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 24px;
    padding: 10px 20px;
    background: var(--primary-color, #FF6B4A);
    color: white;
    border-radius: 999px;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9rem;
    transition: filter 120ms ease;
  }
  .visit:hover { filter: brightness(1.06); }
  @media (max-width: 600px) {
    .panel { width: 100vw; max-width: 100vw; max-height: 100vh; border-radius: 0; }
    .hero { height: 240px; }
    .body { padding: 20px; }
    h1 { font-size: 1.35rem; }
    .nav { display: none; }
  }
`;

class FastNewsReaderModal extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._index = 0;
    this._entries = [];
    this._sourceTitle = "";
    this._locale = "en";
    this._keyHandler = this._onKey.bind(this);
    this._touchStartX = null;
  }

  open({ entries, index, sourceTitle, locale }) {
    this._entries = entries;
    this._index = index;
    this._sourceTitle = sourceTitle;
    this._locale = locale || "en";
    this._render();
    document.addEventListener("keydown", this._keyHandler);
    this.shadowRoot.querySelector(".panel")?.focus({ preventScroll: true });
  }

  close() {
    document.removeEventListener("keydown", this._keyHandler);
    this.shadowRoot.innerHTML = "";
    this.remove();
  }

  _onKey(e) {
    if (e.key === "Escape") this.close();
    else if (e.key === "ArrowLeft") this._go(-1);
    else if (e.key === "ArrowRight") this._go(1);
  }

  _go(delta) {
    const next = this._index + delta;
    if (next < 0 || next >= this._entries.length) return;
    this._index = next;
    this._render();
    const panel = this.shadowRoot.querySelector(".panel");
    if (panel) panel.scrollTop = 0;
  }

  _onTouchStart(e) {
    this._touchStartX = e.touches[0]?.clientX ?? null;
  }
  _onTouchEnd(e) {
    if (this._touchStartX === null) return;
    const endX = e.changedTouches[0]?.clientX;
    if (endX == null) return;
    const dx = endX - this._touchStartX;
    if (Math.abs(dx) > 60) this._go(dx > 0 ? -1 : 1);
    this._touchStartX = null;
  }

  _render() {
    const e = this._entries[this._index];
    if (!e) return;
    const hasPrev = this._index > 0;
    const hasNext = this._index < this._entries.length - 1;
    const html = sanitizeHtml(e.content || e.summary || "");
    const dateStr = absoluteDate(e.published, this._locale);

    this.shadowRoot.innerHTML = `
      <style>${MODAL_STYLES}</style>
      <div class="overlay" part="overlay">
        <button class="nav prev" ${hasPrev ? "" : "disabled"} aria-label="Previous">‹</button>
        <article class="panel" tabindex="-1">
          <button class="close" aria-label="Close">×</button>
          ${e.image
            ? `<img class="hero" src="${e.image}" alt="">`
            : `<div class="hero-fallback"></div>`
          }
          <div class="body">
            <div class="source">${this._sourceTitle || ""}</div>
            <h1>${e.title || ""}</h1>
            <div class="meta">
              ${dateStr}
              ${e.author ? `<span class="dot">·</span>${e.author}` : ""}
            </div>
            <div class="content">${html || `<p>${stripHtml(e.summary || "")}</p>`}</div>
            ${e.link
              ? `<a class="visit" href="${e.link}" target="_blank" rel="noopener noreferrer">
                   Quelle öffnen ↗
                 </a>`
              : ""
            }
          </div>
        </article>
        <button class="nav next" ${hasNext ? "" : "disabled"} aria-label="Next">›</button>
      </div>
    `;

    this.shadowRoot.querySelector(".close").addEventListener("click", () => this.close());
    this.shadowRoot.querySelector(".nav.prev").addEventListener("click", () => this._go(-1));
    this.shadowRoot.querySelector(".nav.next").addEventListener("click", () => this._go(1));
    const overlay = this.shadowRoot.querySelector(".overlay");
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) this.close();
    });
    overlay.addEventListener("touchstart", (ev) => this._onTouchStart(ev), { passive: true });
    overlay.addEventListener("touchend", (ev) => this._onTouchEnd(ev), { passive: true });
  }
}

if (!customElements.get("fast-news-reader-modal")) {
  customElements.define("fast-news-reader-modal", FastNewsReaderModal);
}

// ===========================================================================
// 3) The card itself
// ===========================================================================

const CARD_STYLES = `
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
  .list { display: flex; flex-direction: column; }
  .article {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 12px;
    padding: 12px 16px;
    border-top: 1px solid var(--divider-color);
    cursor: pointer;
    transition: background-color 120ms ease;
    color: inherit;
  }
  .article:hover { background-color: var(--primary-background-color); }
  .article.no-image { grid-template-columns: 1fr; }
  .thumb {
    width: 96px; height: 72px;
    border-radius: 8px;
    object-fit: cover;
    background-color: var(--secondary-background-color);
  }
  .body {
    display: flex; flex-direction: column;
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

class FastNewsReaderCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._lastEntityState = null;
  }

  // HA calls this when opening the card editor.
  static async getConfigElement() {
    console.info("[fast-news-reader] getConfigElement called");
    await customElements.whenDefined("fast-news-reader-card-editor");
    return document.createElement("fast-news-reader-card-editor");
  }

  static getStubConfig(hass, entities) {
    const candidate = (entities || []).find(
      (e) => e.startsWith("sensor.") && hass.states[e]?.attributes?.entries
    );
    return {
      type: "custom:fast-news-reader-card",
      entity: candidate || "sensor.fast_news_reader",
      max_items: 5,
      show_image: true,
      show_summary: true,
      show_date: true,
    };
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

  _openModal(index) {
    console.info("[fast-news-reader] opening modal for index", index);
    const stateObj = this._hass?.states[this._config.entity];
    const entries = stateObj?.attributes?.entries || [];
    const sourceTitle =
      this._config.title ||
      stateObj?.attributes?.channel?.title ||
      stateObj?.attributes?.friendly_name ||
      "";
    const locale = this._hass?.locale?.language || "en";
    const modal = document.createElement("fast-news-reader-modal");
    document.body.appendChild(modal);
    modal.open({ entries, index, sourceTitle, locale });
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
      .map((e, idx) => {
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
          <div class="article ${hasImg ? "" : "no-image"}" data-idx="${idx}" role="button" tabindex="0">
            ${hasImg ? `<img class="thumb" src="${e.image}" loading="lazy" alt="">` : ""}
            <div class="body">
              <div class="title">${e.title || ""}</div>
              ${summary}
              ${meta}
            </div>
          </div>
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

    this.shadowRoot.querySelectorAll(".article").forEach((el) => {
      const idx = Number(el.dataset.idx);
      el.addEventListener("click", () => this._openModal(idx));
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          this._openModal(idx);
        }
      });
    });
  }

  _renderShell(inner) {
    this.shadowRoot.innerHTML = `
      <style>${CARD_STYLES}</style>
      <ha-card>${inner}</ha-card>
    `;
  }
}

if (!customElements.get("fast-news-reader-card")) {
  customElements.define("fast-news-reader-card", FastNewsReaderCard);
}

// ===========================================================================
// 4) Register with the Lovelace card picker
// ===========================================================================

window.customCards = window.customCards || [];
const idx = window.customCards.findIndex((c) => c.type === "fast-news-reader-card");
const cardMeta = {
  type: "fast-news-reader-card",
  name: "Fast News Reader",
  description:
    "Feedly-style news card with images, titles, and a fullscreen reader on click.",
  preview: false,
  documentationURL:
    "https://github.com/fastender/fast-news-reader#lovelace-card",
};
if (idx === -1) window.customCards.push(cardMeta);
else window.customCards[idx] = cardMeta;
