/*!
 * Fast News Reader - Lovelace card.
 *
 * Vanilla web components, no Lit, no build step.
 *
 * Card config:
 *   type: custom:fast-news-reader-card
 *   entities:
 *     - sensor.tagesschau                          # bare string: take all entries
 *     - entity: sensor.heise                        # object form: cap per-feed
 *       max_items: 3
 *   # entity: sensor.tagesschau                    # legacy single source still works
 *   max_items: 5                                    # global cap on the merged list
 *   show_image: true
 *   show_summary: true
 *   show_date: true
 *   title: "My news"
 */

const CARD_VERSION = "0.13.0";

console.info(
  `%c FAST-NEWS-READER-CARD %c v${CARD_VERSION} `,
  "color:white;background:#FF6B4A;font-weight:700;border-radius:3px 0 0 3px;padding:2px 6px",
  "color:#FF6B4A;background:#1A1A1A;font-weight:700;border-radius:0 3px 3px 0;padding:2px 6px"
);

// ===========================================================================
// Helpers
// ===========================================================================

// Use DOMParser instead of `innerHTML` on a detached <div> — the latter
// still fires <img onerror> handlers on some browsers, even off-document.
const _STRIP_HTML_PARSER = new DOMParser();
function stripHtml(s) {
  if (!s) return "";
  try {
    const doc = _STRIP_HTML_PARSER.parseFromString(String(s), "text/html");
    return (doc.body?.textContent || "").trim();
  } catch {
    return "";
  }
}

const _ESCAPE_HTML_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => _ESCAPE_HTML_MAP[c]);
}

// Return the URL only when its scheme is http(s) or it is protocol- or
// root-relative; otherwise drop it. Blocks javascript:, data:, vbscript:,
// and friends. Used for any RSS-supplied src/href.
function safeHttpUrl(url) {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//") || trimmed.startsWith("/")) return trimmed;
  return "";
}

const ALLOWED_TAGS = new Set([
  "P", "BR", "B", "I", "STRONG", "EM", "U", "SPAN", "DIV",
  "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "LI", "BLOCKQUOTE", "FIGURE", "FIGCAPTION",
  "IMG", "A", "PICTURE", "SOURCE", "HR",
]);

// Strip the hero-image src so it doesn't appear twice (once as the modal
// hero and once embedded in the article body). Also drops scripts, inline
// event handlers, and javascript:/data: URLs.
function sanitizeHtml(html, heroSrc) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;

  // Remove duplicate hero images. RSS content often starts with the same
  // image we're already showing big at the top of the modal.
  if (heroSrc) {
    const heroFile = (heroSrc.split("?")[0].split("/").pop() || "").toLowerCase();
    tmp.querySelectorAll("img").forEach((img) => {
      const src = (img.getAttribute("src") || "").toLowerCase();
      if (!src) return;
      const file = src.split("?")[0].split("/").pop() || "";
      if (src === heroSrc.toLowerCase() || file === heroFile) {
        const enclosingFigure = img.closest("figure");
        (enclosingFigure || img).remove();
      }
    });
  }

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
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if (name === "href" || name === "src") {
        if (!safeHttpUrl(attr.value || "")) el.removeAttribute(attr.name);
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

function articleId(entry) {
  return entry.id || entry.link || entry.title || "";
}

function entryDate(e) {
  return new Date(e.published_dt || e.published || 0).getTime() || 0;
}

// Accepts a YAML feed entry — bare string or {entity, max_items} object —
// and returns the canonical {entity, max_items?} shape, or null if invalid.
function normalizeFeed(raw) {
  if (typeof raw === "string") return { entity: raw };
  if (raw && typeof raw === "object" && typeof raw.entity === "string") {
    const out = { entity: raw.entity };
    const n = parseInt(raw.max_items, 10);
    if (Number.isFinite(n) && n > 0) out.max_items = n;
    return out;
  }
  return null;
}

function normalizeFeeds(rawList) {
  const seen = new Set();
  const out = [];
  for (const item of rawList || []) {
    const f = normalizeFeed(item);
    if (!f || seen.has(f.entity)) continue;
    seen.add(f.entity);
    out.push(f);
  }
  return out;
}

// Compact YAML form: bare string when only `entity` is set, object otherwise.
function serializeFeeds(feeds) {
  return (feeds || []).map((f) =>
    f.max_items != null ? { entity: f.entity, max_items: f.max_items } : f.entity
  );
}

// ===========================================================================
// Per-article actions, stored in localStorage. Card and modal both read
// this; they listen for "fnr:state-changed" so any action propagates.
// ===========================================================================

const ACTIONS = ["saved", "favorite", "hidden", "viewed"];

// Decoded sets are cached here so the card list doesn't re-parse the JSON
// payload three times per render plus once per article. Cache is updated
// in-place on save() and invalidated on cross-tab `storage` events.
const ArticleStore = {
  _cache: new Map(),
  _key(category) {
    return `fnr-${category}`;
  },
  _read(category) {
    if (!this._cache.has(category)) {
      let set;
      try {
        const raw = localStorage.getItem(this._key(category));
        set = new Set(raw ? JSON.parse(raw) : []);
      } catch {
        set = new Set();
      }
      this._cache.set(category, set);
    }
    return this._cache.get(category);
  },
  load(category) {
    return new Set(this._read(category));
  },
  save(category, set) {
    const copy = new Set(set);
    this._cache.set(category, copy);
    try {
      localStorage.setItem(this._key(category), JSON.stringify([...copy]));
    } catch {
      /* ignore storage errors */
    }
  },
  has(category, id) {
    return this._read(category).has(id);
  },
  add(category, id) {
    const set = this._read(category);
    if (set.has(id)) return false;
    const next = new Set(set);
    next.add(id);
    this.save(category, next);
    window.dispatchEvent(
      new CustomEvent("fnr:state-changed", { detail: { category, id } })
    );
    return true;
  },
  toggle(category, id) {
    const set = new Set(this._read(category));
    const now = !set.has(id);
    if (now) set.add(id);
    else set.delete(id);
    this.save(category, set);
    window.dispatchEvent(
      new CustomEvent("fnr:state-changed", { detail: { category, id } })
    );
    return now;
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key && e.key.startsWith("fnr-")) {
      ArticleStore._cache.delete(e.key.slice(4));
    }
  });
}

// ===========================================================================
// 1) Visual editor (defined first)
// ===========================================================================

const EDITOR_STYLES = `
  :host, :scope { display: block; }
  .row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
  .row label.lbl {
    font-size: 0.85rem;
    color: var(--secondary-text-color, #666);
    font-weight: 500;
  }
  .row input[type="text"],
  .row input[type="number"],
  .row select {
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #1a1a1a);
    border: 1px solid var(--divider-color, rgba(0,0,0,0.12));
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 0.95rem;
    font-family: inherit;
  }
  .row input:focus, .row select:focus {
    outline: none;
    border-color: var(--primary-color, #FF6B4A);
  }
  .feed-row {
    display: flex; gap: 6px; align-items: center;
    margin-bottom: 6px;
  }
  .feed-row select { flex: 1; min-width: 0; }
  .feed-row input.max-input {
    flex: 0 0 64px;
    text-align: center;
    padding: 8px 6px;
  }
  .feed-row input.max-input::-webkit-outer-spin-button,
  .feed-row input.max-input::-webkit-inner-spin-button { margin: 0; }
  .icon-btn {
    flex: 0 0 36px;
    width: 36px; height: 36px;
    border-radius: 6px;
    border: 1px solid var(--divider-color, rgba(0,0,0,0.12));
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #1a1a1a);
    cursor: pointer;
    font-size: 1.1rem;
  }
  .icon-btn:hover { background: var(--secondary-background-color, rgba(0,0,0,0.04)); }
  .add-feed {
    margin-top: 4px;
    align-self: flex-start;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px dashed var(--divider-color, rgba(0,0,0,0.18));
    background: transparent;
    color: var(--primary-color, #FF6B4A);
    cursor: pointer;
    font-size: 0.9rem;
  }
  .add-feed:hover { background: var(--secondary-background-color, rgba(0,0,0,0.04)); }
  .add-feed:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: transparent;
  }
  .toggles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
    margin-top: 4px;
  }
  .toggle {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--divider-color, rgba(0,0,0,0.12));
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    user-select: none;
  }
  .toggle input { margin: 0; cursor: pointer; }
  .hint { font-size: 0.78rem; color: var(--secondary-text-color, #888); }
`;

class FastNewsReaderCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._rendered = false;
  }

  setConfig(config) {
    // Editor works with the canonical {entity, max_items?} shape; YAML may
    // contain bare strings, objects, or the legacy single `entity`.
    const cfg = { ...config };
    const raw = cfg.entities ? [...cfg.entities] : cfg.entity ? [cfg.entity] : [];
    cfg.entities = normalizeFeeds(raw);
    delete cfg.entity;
    const prevKey = JSON.stringify(this._config?.entities || []);
    const nextKey = JSON.stringify(cfg.entities);
    this._config = cfg;
    if (this._rendered) {
      this._fillSimpleFields();
      // Skip re-rendering rows when HA echoes our own emit back — keeps
      // focus on the per-feed max input while the user is typing.
      if (prevKey !== nextKey) this._renderFeedRows();
    } else {
      this._render();
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (this._rendered) this._refreshAllSelects();
    else this._render();
  }

  _emit() {
    const out = {
      ...this._config,
      entities: serializeFeeds(this._config.entities),
    };
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: out },
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
      <div class="row">
        <label class="lbl">Feeds</label>
        <div id="fnr-feeds"></div>
        <button type="button" class="add-feed" id="fnr-add">+ Add feed</button>
        <span class="hint">Add as many feeds as you like. The card mixes them by date.</span>
      </div>
      <div class="row">
        <label class="lbl" for="fnr-title">Title (optional)</label>
        <input id="fnr-title" type="text" placeholder="Defaults to channel title">
      </div>
      <div class="row">
        <label class="lbl" for="fnr-max">Max items shown</label>
        <input id="fnr-max" type="number" min="1" max="50" step="1">
      </div>
      <div class="row">
        <label class="lbl" for="fnr-list-h">Max list height (px)</label>
        <input id="fnr-list-h" type="number" min="100" step="20" placeholder="auto">
        <span class="hint">Empty = grow with content. Otherwise the article list scrolls when it exceeds this height; the search bar and topics stay pinned.</span>
      </div>
      <div class="row">
        <label class="lbl">Show in card</label>
        <div class="toggles">
          <label class="toggle"><input id="fnr-img" type="checkbox"> Image</label>
          <label class="toggle"><input id="fnr-sum" type="checkbox"> Summary</label>
          <label class="toggle"><input id="fnr-date" type="checkbox"> Date</label>
          <label class="toggle"><input id="fnr-search" type="checkbox"> Search</label>
          <label class="toggle"><input id="fnr-topics" type="checkbox"> Topics</label>
        </div>
      </div>
      <div class="row">
        <label class="lbl" for="fnr-topics-mode">Topics group by</label>
        <select id="fnr-topics-mode">
          <option value="categories">Article categories</option>
          <option value="sources">Source feeds</option>
          <option value="themes">Themes (curated per feed)</option>
        </select>
        <span class="hint">Only applies when "Topics" is enabled. The mode toggle in the card cycles through all three at runtime.</span>
      </div>
    `;

    this._renderFeedRows();
    this._fillSimpleFields();

    this.querySelector("#fnr-add").addEventListener("click", () => {
      const ids = this._availableEntities();
      const taken = new Set((this._config.entities || []).map((f) => f.entity));
      const next = ids.find((i) => !taken.has(i));
      if (!next) return;
      this._config = {
        ...this._config,
        entities: [...(this._config.entities || []), { entity: next }],
      };
      this._renderFeedRows();
      this._emit();
    });

    this.querySelector("#fnr-title").addEventListener("input", (e) => {
      const v = e.target.value;
      this._config = { ...this._config, title: v || undefined };
      this._emit();
    });
    this.querySelector("#fnr-max").addEventListener("input", (e) => {
      const n = parseInt(e.target.value, 10);
      this._config = { ...this._config, max_items: isNaN(n) ? 5 : n };
      this._emit();
    });
    this.querySelector("#fnr-list-h").addEventListener("input", (e) => {
      const v = e.target.value.trim();
      const n = parseInt(v, 10);
      const next = { ...this._config };
      if (v === "" || !Number.isFinite(n) || n <= 0) {
        delete next.max_list_height;
      } else {
        next.max_list_height = n;
      }
      this._config = next;
      this._emit();
    });
    this.querySelector("#fnr-img").addEventListener("change", (e) => {
      this._config = { ...this._config, show_image: e.target.checked };
      this._emit();
    });
    this.querySelector("#fnr-sum").addEventListener("change", (e) => {
      this._config = { ...this._config, show_summary: e.target.checked };
      this._emit();
    });
    this.querySelector("#fnr-date").addEventListener("change", (e) => {
      this._config = { ...this._config, show_date: e.target.checked };
      this._emit();
    });
    this.querySelector("#fnr-search").addEventListener("change", (e) => {
      this._config = { ...this._config, show_search: e.target.checked };
      this._emit();
    });
    this.querySelector("#fnr-topics").addEventListener("change", (e) => {
      this._config = { ...this._config, show_topics: e.target.checked };
      this._emit();
    });
    this.querySelector("#fnr-topics-mode").addEventListener("change", (e) => {
      this._config = { ...this._config, topics_mode: e.target.value };
      this._emit();
    });

    this._rendered = true;
  }

  _renderFeedRows() {
    const container = this.querySelector("#fnr-feeds");
    container.innerHTML = "";
    const ids = this._availableEntities();
    const entities = this._config.entities || [];

    if (!entities.length) {
      const note = document.createElement("div");
      note.className = "hint";
      note.textContent =
        ids.length === 0
          ? "No Fast News Reader sensors found yet. Add a feed via Settings → Devices & Services first."
          : "Click + to add your first feed.";
      container.appendChild(note);
      return;
    }

    const takenByOthers = (idx) =>
      new Set(entities.filter((_, i) => i !== idx).map((f) => f.entity));

    entities.forEach((feed, idx) => {
      const current = feed.entity;
      const row = document.createElement("div");
      row.className = "feed-row";

      const select = document.createElement("select");
      const blocked = takenByOthers(idx);
      const all = ids.filter((id) => !blocked.has(id));
      if (current && !all.includes(current)) all.unshift(current);
      for (const id of all) {
        const opt = document.createElement("option");
        opt.value = id;
        const friendly = this._hass?.states?.[id]?.attributes?.friendly_name;
        opt.textContent = friendly ? `${friendly} (${id})` : id;
        select.appendChild(opt);
      }
      select.value = current || "";
      select.addEventListener("change", (e) => {
        const next = [...(this._config.entities || [])];
        next[idx] = { ...next[idx], entity: e.target.value };
        this._config = { ...this._config, entities: next };
        this._renderFeedRows();
        this._emit();
      });

      const maxInput = document.createElement("input");
      maxInput.type = "number";
      maxInput.className = "max-input";
      maxInput.min = "1";
      maxInput.max = "200";
      maxInput.step = "1";
      maxInput.placeholder = "all";
      maxInput.title = "Max items from this feed (empty = all)";
      maxInput.value = feed.max_items != null ? String(feed.max_items) : "";
      maxInput.addEventListener("input", (e) => {
        const v = e.target.value.trim();
        const n = parseInt(v, 10);
        const next = [...(this._config.entities || [])];
        const updated = { ...next[idx] };
        if (v === "" || !Number.isFinite(n) || n <= 0) {
          delete updated.max_items;
        } else {
          updated.max_items = n;
        }
        next[idx] = updated;
        this._config = { ...this._config, entities: next };
        this._emit();
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-btn";
      remove.textContent = "×";
      remove.title = "Remove feed";
      remove.addEventListener("click", () => {
        const next = (this._config.entities || []).filter((_, i) => i !== idx);
        this._config = { ...this._config, entities: next };
        this._renderFeedRows();
        this._emit();
      });

      row.appendChild(select);
      row.appendChild(maxInput);
      row.appendChild(remove);
      container.appendChild(row);
    });

    const addBtn = this.querySelector("#fnr-add");
    if (addBtn) {
      const used = new Set(entities.map((f) => f.entity));
      const remaining = ids.filter((id) => !used.has(id));
      addBtn.disabled = remaining.length === 0;
      addBtn.title = addBtn.disabled
        ? "All available feeds are already added"
        : "";
    }
  }

  _refreshAllSelects() {
    this._renderFeedRows();
  }

  _fillSimpleFields() {
    const q = (sel) => this.querySelector(sel);
    if (!q("#fnr-title")) return;
    q("#fnr-title").value = this._config.title || "";
    q("#fnr-max").value =
      this._config.max_items !== undefined ? this._config.max_items : 5;
    q("#fnr-img").checked = this._config.show_image !== false;
    q("#fnr-sum").checked = this._config.show_summary !== false;
    q("#fnr-date").checked = this._config.show_date !== false;
    q("#fnr-search").checked = !!this._config.show_search;
    q("#fnr-topics").checked = !!this._config.show_topics;
    q("#fnr-topics-mode").value = this._config.topics_mode || "categories";
    q("#fnr-list-h").value =
      this._config.max_list_height != null ? this._config.max_list_height : "";
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
// 2) Reader modal
//
// The shell (overlay + nav + panel) is built once. Navigating with prev/next
// only updates fields inside the panel, so the overlay never disappears and
// the dashboard never flashes through.
// ===========================================================================

const MODAL_STYLES = `
  :host { all: initial; }
  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.78);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
    animation: fade-in 160ms ease-out;
    font-family: var(--primary-font-family, system-ui, -apple-system, sans-serif);
    color: var(--primary-text-color, #fff);
  }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  .panel {
    position: relative;
    background: var(--card-background-color, #1a1a1a);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    width: min(740px, 92vw);
    max-height: 90vh;
    overflow-y: auto;
    animation: slide-up 220ms cubic-bezier(.2,.8,.2,1);
    z-index: 1;
  }
  .panel.fade-out .body, .panel.fade-out .hero { opacity: 0.4; transition: opacity 80ms ease; }
  .panel.fade-in .body, .panel.fade-in .hero { opacity: 1; transition: opacity 200ms ease; }
  @keyframes slide-up {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .actions {
    position: absolute; top: 12px; right: 12px;
    display: flex; gap: 6px;
    z-index: 3;
  }
  .action-btn {
    width: 36px; height: 36px;
    border: none; border-radius: 50%;
    background: var(--secondary-background-color, rgba(255,255,255,0.08));
    color: var(--primary-text-color, #f0f0f0);
    cursor: pointer; font-size: 16px; line-height: 1;
    display: flex; align-items: center; justify-content: center;
    transition: transform 120ms ease, color 120ms ease;
  }
  .action-btn:hover { transform: scale(1.12); }
  .action-btn:active { transform: scale(1.0); }
  .action-btn[data-active="true"] { color: var(--primary-color, #FF6B4A); }
  .action-btn svg { display: block; }

  .nav {
    position: fixed; top: 50%; transform: translateY(-50%);
    width: 56px; height: 56px;
    border: none; border-radius: 50%;
    background: rgba(40, 40, 40, 0.9);
    color: #fff;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    cursor: pointer; font-size: 22px;
    display: flex; align-items: center; justify-content: center;
    transition: transform 120ms ease, opacity 120ms ease;
    z-index: 10;
  }
  .nav:hover { transform: translateY(-50%) scale(1.06); }
  .nav:disabled { opacity: 0.35; cursor: default; transform: translateY(-50%); }
  .nav.prev { left: 12px; }
  .nav.next { right: 12px; }
  @media (min-width: 900px) {
    .nav.prev { left: max(12px, calc((100vw - 740px) / 2 - 80px)); }
    .nav.next { right: max(12px, calc((100vw - 740px) / 2 - 80px)); }
  }

  .hero {
    width: 100%; height: 360px;
    object-fit: cover;
    display: block;
    background: var(--secondary-background-color, #2a2a2a);
  }
  .hero-fallback { height: 0; }

  .body { padding: 24px 28px 32px; }
  .source {
    font-size: 0.78rem;
    color: var(--secondary-text-color, #aaa);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 8px;
  }
  h1 {
    margin: 0 0 12px;
    font-size: 1.6rem;
    line-height: 1.2;
    font-weight: 700;
    color: var(--primary-text-color, #f5f5f5);
  }
  .meta {
    font-size: 0.85rem;
    color: var(--secondary-text-color, #aaa);
    margin-bottom: 20px;
  }
  .meta .dot { opacity: 0.5; padding: 0 4px; }
  .content {
    font-size: 0.95rem;
    line-height: 1.6;
    color: var(--primary-text-color, #e8e8e8);
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
    .nav { width: 44px; height: 44px; font-size: 18px; }
  }
`;

class FastNewsReaderModal extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._index = 0;
    this._entries = [];
    this._sourceTitleFor = () => "";
    this._locale = "en";
    this._keyHandler = this._onKey.bind(this);
    this._touchStartX = null;
    this._built = false;
    this._refs = {};
  }

  open({ entries, index, sourceTitleFor, locale }) {
    this._entries = entries;
    this._index = index;
    this._sourceTitleFor = sourceTitleFor || (() => "");
    this._locale = locale || "en";
    this._buildShellOnce();
    this._fill();
    document.addEventListener("keydown", this._keyHandler);
    this._refs.panel?.focus({ preventScroll: true });
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

    // Soft fade-out / fade-in only on body+hero. Overlay stays.
    const panel = this._refs.panel;
    if (panel) {
      panel.classList.remove("fade-in");
      panel.classList.add("fade-out");
      setTimeout(() => {
        this._fill();
        panel.scrollTop = 0;
        panel.classList.remove("fade-out");
        panel.classList.add("fade-in");
      }, 80);
    } else {
      this._fill();
    }
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

  _buildShellOnce() {
    if (this._built) return;
    this.shadowRoot.innerHTML = `
      <style>${MODAL_STYLES}</style>
      <div class="overlay" part="overlay">
        <div class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
        <button class="nav prev" aria-label="Previous">‹</button>
        <article class="panel" tabindex="-1">
          <div class="actions">
            <button class="action-btn save" title="Read later" aria-label="Read later">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path fill="currentColor" d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
              </svg>
            </button>
            <button class="action-btn fav" title="Favorite" aria-label="Favorite">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
            </button>
            <button class="action-btn hide" title="Hide" aria-label="Hide">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
              </svg>
            </button>
            <button class="action-btn close" title="Close" aria-label="Close">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
          <img class="hero" alt="">
          <div class="body">
            <div class="source"></div>
            <h1></h1>
            <div class="meta"></div>
            <div class="content"></div>
            <a class="visit" target="_blank" rel="noopener noreferrer">Quelle öffnen ↗</a>
          </div>
        </article>
        <button class="nav next" aria-label="Next">›</button>
      </div>
    `;

    const r = this.shadowRoot;
    this._refs = {
      overlay: r.querySelector(".overlay"),
      panel: r.querySelector(".panel"),
      hero: r.querySelector(".hero"),
      source: r.querySelector(".source"),
      h1: r.querySelector("h1"),
      meta: r.querySelector(".meta"),
      content: r.querySelector(".content"),
      visit: r.querySelector(".visit"),
      prev: r.querySelector(".nav.prev"),
      next: r.querySelector(".nav.next"),
      close: r.querySelector(".action-btn.close"),
      save: r.querySelector(".action-btn.save"),
      fav: r.querySelector(".action-btn.fav"),
      hide: r.querySelector(".action-btn.hide"),
      live: r.querySelector(".sr-only"),
    };

    this._refs.close.addEventListener("click", () => this.close());
    this._refs.prev.addEventListener("click", () => this._go(-1));
    this._refs.next.addEventListener("click", () => this._go(1));
    this._refs.overlay.addEventListener("click", (ev) => {
      if (ev.target === this._refs.overlay) this.close();
    });
    this._refs.overlay.addEventListener("touchstart", (ev) => this._onTouchStart(ev), { passive: true });
    this._refs.overlay.addEventListener("touchend", (ev) => this._onTouchEnd(ev), { passive: true });

    const toggleFor = (cat, btn) => {
      btn.addEventListener("click", () => {
        const e = this._entries[this._index];
        if (!e) return;
        const id = articleId(e);
        ArticleStore.toggle(cat, id);
        this._refreshActionStates();
        if (cat === "hidden") {
          // Skip past hidden article. If at end, close.
          const remaining = this._entries.filter(
            (x) => !ArticleStore.has("hidden", articleId(x))
          );
          if (!remaining.length) this.close();
          else this._go(1);
        }
      });
    };
    toggleFor("saved", this._refs.save);
    toggleFor("favorite", this._refs.fav);
    toggleFor("hidden", this._refs.hide);

    this._built = true;
  }

  _fill() {
    const e = this._entries[this._index];
    if (!e) return;
    // Mark as viewed so the "Unread" filter knows what's been opened.
    ArticleStore.add("viewed", articleId(e));
    const r = this._refs;
    const sourceTitle = this._sourceTitleFor(e);
    const html = sanitizeHtml(e.content || e.summary || "", e.image || "");
    const dateStr = absoluteDate(e.published, this._locale);

    r.source.textContent = sourceTitle;
    r.h1.textContent = e.title || "";

    r.meta.innerHTML = "";
    if (dateStr) r.meta.append(document.createTextNode(dateStr));
    if (e.author) {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.textContent = "·";
      r.meta.append(dot, document.createTextNode(e.author));
    }

    const heroSrc = safeHttpUrl(e.image || "");
    if (heroSrc) {
      r.hero.src = heroSrc;
      r.hero.classList.remove("hero-fallback");
      r.hero.style.display = "";
    } else {
      r.hero.removeAttribute("src");
      r.hero.classList.add("hero-fallback");
      r.hero.style.display = "none";
    }

    r.content.innerHTML = html || `<p>${escapeHtml(stripHtml(e.summary || ""))}</p>`;

    const visitHref = safeHttpUrl(e.link || "");
    if (visitHref) {
      r.visit.href = visitHref;
      r.visit.style.display = "";
    } else {
      r.visit.removeAttribute("href");
      r.visit.style.display = "none";
    }

    r.prev.disabled = this._index <= 0;
    r.next.disabled = this._index >= this._entries.length - 1;

    if (r.live) {
      r.live.textContent = `Article ${this._index + 1} of ${this._entries.length}: ${e.title || ""}`;
    }

    this._refreshActionStates();
  }

  _refreshActionStates() {
    const e = this._entries[this._index];
    if (!e) return;
    const id = articleId(e);
    this._refs.save.dataset.active = String(ArticleStore.has("saved", id));
    this._refs.fav.dataset.active = String(ArticleStore.has("favorite", id));
    this._refs.hide.dataset.active = String(ArticleStore.has("hidden", id));
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
  ha-card { overflow: hidden; padding: 0; }
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
    margin-left: auto;
  }
  .header .src-icon {
    width: 20px; height: 20px;
    border-radius: 4px;
    object-fit: contain;
    background: var(--secondary-background-color, transparent);
    flex: 0 0 auto;
  }
  .source-tag .src-icon-sm {
    width: 14px; height: 14px;
    border-radius: 3px;
    object-fit: contain;
    vertical-align: middle;
    margin-right: 4px;
  }
  .empty {
    padding: 24px 16px;
    color: var(--secondary-text-color);
    font-size: 0.9rem;
    text-align: center;
  }
  .feed-warning {
    margin: 0 16px 8px;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--warning-color, #f4a261);
    color: var(--text-primary-color, #1a1a1a);
    font-size: 0.8rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .feed-warning .warn-icon { font-size: 1rem; line-height: 1; }
  .searchbar {
    padding: 12px 16px 0;
  }
  .search-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--divider-color);
    border-radius: 8px;
    background: var(--card-background-color);
    color: var(--primary-text-color);
    font-size: 0.9rem;
    font-family: inherit;
    box-sizing: border-box;
  }
  .search-input:focus {
    outline: none;
    border-color: var(--primary-color, #FF6B4A);
  }
  .topics-wrap {
    position: relative;
    margin-top: 12px;
  }
  .topics-wrap::before,
  .topics-wrap::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 28px;
    pointer-events: none;
    z-index: 1;
    transition: opacity 200ms ease;
  }
  .topics-wrap::before {
    left: 0;
    background: linear-gradient(
      to right,
      var(--ha-card-background, var(--card-background-color, #fff)) 0%,
      transparent 100%
    );
  }
  .topics-wrap::after {
    right: 0;
    background: linear-gradient(
      to left,
      var(--ha-card-background, var(--card-background-color, #fff)) 0%,
      transparent 100%
    );
  }
  .topics-wrap.at-start::before { opacity: 0; }
  .topics-wrap.at-end::after { opacity: 0; }
  .topics {
    display: flex;
    gap: 6px;
    padding: 0 16px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;        /* Firefox */
    -ms-overflow-style: none;     /* IE/Edge legacy */
    -webkit-overflow-scrolling: touch;
  }
  .topics::-webkit-scrollbar { display: none; }
  .topic {
    flex: 0 0 auto;
    padding: 6px 12px;
    border: 1px solid var(--divider-color);
    border-radius: 999px;
    background: transparent;
    color: var(--primary-text-color);
    font-size: 0.82rem;
    cursor: pointer;
    white-space: nowrap;
    font-family: inherit;
    transition: background 120ms ease, border-color 120ms ease,
      color 120ms ease;
  }
  .topic:hover { background: var(--secondary-background-color); }
  .topic.active {
    background: var(--primary-color, #FF6B4A);
    border-color: var(--primary-color, #FF6B4A);
    color: var(--text-primary-color, #fff);
  }
  .topic-mode-btn {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border: 1px dashed var(--divider-color);
    border-radius: 999px;
    background: transparent;
    color: var(--secondary-text-color);
    font-family: inherit;
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: background 120ms ease, color 120ms ease;
  }
  .topic-mode-btn:hover {
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
  }
  .filter-btn {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--divider-color);
    border-radius: 999px;
    background: transparent;
    color: var(--secondary-text-color);
    cursor: pointer;
    transition: background 120ms ease, color 120ms ease,
      border-color 120ms ease;
  }
  .filter-btn svg { display: block; }
  .filter-btn:hover {
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
  }
  .filter-btn[data-active="true"] {
    background: var(--primary-color, #FF6B4A);
    border-color: var(--primary-color, #FF6B4A);
    color: var(--text-primary-color, #fff);
  }
  .refresh-btn {
    flex: 0 0 auto;
    width: 30px; height: 30px;
    border: none; border-radius: 50%;
    background: transparent;
    color: var(--secondary-text-color);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 120ms ease, color 120ms ease;
  }
  .refresh-btn:hover {
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
  }
  .refresh-btn:disabled { cursor: default; }
  .refresh-btn.spinning svg {
    animation: fnr-refresh-spin 1.5s linear infinite;
    transform-origin: center;
  }
  @keyframes fnr-refresh-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
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
  .title-row { display: flex; align-items: flex-start; gap: 6px; }
  .title {
    flex: 1;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--primary-text-color);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .badge {
    font-size: 0.78rem;
    color: var(--primary-color, #FF6B4A);
    flex: 0 0 auto;
    line-height: 1.3;
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
  .source-tag { color: var(--primary-color, #FF6B4A); font-weight: 600; }
`;

class FastNewsReaderCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._lastStateStamp = null;
    this._searchQuery = "";
    this._activeTopic = null;
    this._topicsMode = null; // resolved from config in setConfig
    this._showFavoritesOnly = false;
    this._showSavedOnly = false;
    this._showUnreadOnly = false;
    this._stateChangedHandler = () => this._render();
  }

  connectedCallback() {
    window.addEventListener("fnr:state-changed", this._stateChangedHandler);
  }
  disconnectedCallback() {
    window.removeEventListener("fnr:state-changed", this._stateChangedHandler);
  }

  static async getConfigElement() {
    console.info("[fast-news-reader] getConfigElement called");
    await customElements.whenDefined("fast-news-reader-card-editor");
    return document.createElement("fast-news-reader-card-editor");
  }

  static getStubConfig(hass, entities) {
    const candidates = (entities || []).filter(
      (e) => e.startsWith("sensor.") && hass.states[e]?.attributes?.entries
    );
    return {
      type: "custom:fast-news-reader-card",
      entities: candidates.length ? [candidates[0]] : ["sensor.fast_news_reader"],
      max_items: 5,
      show_image: true,
      show_summary: true,
      show_date: true,
    };
  }

  setConfig(config) {
    if (!config) throw new Error("config required");
    // Accept bare strings, {entity, max_items} objects, the legacy single
    // `entity`, or any mix; normalize to canonical objects and de-dupe.
    const rawEntities = config.entities
      ? [...config.entities]
      : config.entity
      ? [config.entity]
      : [];
    const feeds = normalizeFeeds(rawEntities);
    if (!feeds.length) {
      throw new Error("at least one entity is required");
    }
    for (const f of feeds) {
      if (!f.entity.startsWith("sensor.")) {
        throw new Error(`entity must be a sensor: ${f.entity}`);
      }
    }
    this._config = {
      max_items: 5,
      show_image: true,
      show_summary: true,
      show_date: true,
      show_search: false,
      show_topics: false,
      topics_mode: "categories",
      ...config,
      entities: feeds,
    };
    delete this._config.entity;
    this._lastStateStamp = null;
    // Reset interactive state when config changes (eg. after editor save).
    this._searchQuery = "";
    this._activeTopic = null;
    this._topicsMode = this._config.topics_mode || "categories";
    this._showFavoritesOnly = false;
    this._showSavedOnly = false;
    this._showUnreadOnly = false;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const stamp = this._stampForEntities();
    if (stamp !== this._lastStateStamp) {
      this._lastStateStamp = stamp;
      this._render();
    }
  }

  _stampForEntities() {
    if (!this._hass || !this._config) return "missing";
    return (this._config.entities || [])
      .map((f) => {
        const s = this._hass.states[f.entity];
        const cap = f.max_items != null ? f.max_items : "_";
        return s
          ? `${f.entity}:${cap}:${s.state}:${s.last_updated}`
          : `${f.entity}:missing`;
      })
      .join("|");
  }

  getCardSize() {
    return Math.min(1 + (this._config?.max_items || 5), 8);
  }

  _aggregateEntries() {
    if (!this._hass || !this._config) return { entries: [], byEntity: {} };
    const hidden = ArticleStore.load("hidden");
    const all = [];
    const byEntity = {};
    const sortDesc = (a, b) => entryDate(b) - entryDate(a);
    const iconByEntity = {};
    for (const feed of this._config.entities) {
      const id = feed.entity;
      const stateObj = this._hass.states[id];
      if (!stateObj) continue;
      if (stateObj.state === "unavailable" || stateObj.state === "unknown") continue;
      const channel = stateObj.attributes.channel || {};
      const sourceTitle = channel.title || stateObj.attributes.friendly_name || id;
      const sourceIcon = safeHttpUrl(channel.icon || channel.image || "");
      const sourceThemeLabel = channel.theme_label || channel.theme || null;
      byEntity[id] = sourceTitle;
      iconByEntity[id] = sourceIcon;
      const entries = (stateObj.attributes.entries || [])
        .filter((e) => !hidden.has(articleId(e)));
      // Apply per-feed cap to the newest N (sort first so the cap is stable
      // regardless of source ordering).
      const limited =
        feed.max_items != null
          ? [...entries].sort(sortDesc).slice(0, feed.max_items)
          : entries;
      for (const e of limited) {
        all.push({
          ...e,
          _entityId: id,
          _sourceTitle: sourceTitle,
          _sourceIcon: sourceIcon,
          _sourceThemeLabel: sourceThemeLabel,
        });
      }
    }
    all.sort(sortDesc);
    return { entries: all, byEntity, iconByEntity };
  }

  _collectTopics(entries) {
    const set = new Set();
    let hasUntheme = false;
    if (this._topicsMode === "sources") {
      for (const e of entries) {
        if (e._sourceTitle) set.add(e._sourceTitle);
      }
    } else if (this._topicsMode === "themes") {
      for (const e of entries) {
        if (e._sourceThemeLabel) set.add(e._sourceThemeLabel);
        else hasUntheme = true;
      }
    } else {
      for (const e of entries) {
        for (const c of e.category || []) {
          if (c) set.add(c);
        }
      }
    }
    const sorted = [...set].sort((a, b) => a.localeCompare(b));
    // Custom feeds without a preset have no theme; surface them under
    // "Other" so they don't silently disappear when grouping by themes.
    if (this._topicsMode === "themes" && hasUntheme && sorted.length) {
      sorted.push("Other");
    }
    return sorted;
  }

  _buildItemsHtml(visible, isMulti, favorites, saved, locale) {
    return visible
      .map((e, idx) => {
        const id = articleId(e);
        const imgSrc = this._config.show_image ? safeHttpUrl(e.image || "") : "";
        const hasImg = !!imgSrc;
        const summary = this._config.show_summary && e.summary
          ? `<div class="summary">${escapeHtml(stripHtml(e.summary))}</div>`
          : "";
        const metaParts = [];
        if (this._config.show_date && e.published) {
          metaParts.push(`<span>${escapeHtml(relativeTime(e.published, locale))}</span>`);
        }
        if (isMulti) {
          const tagIcon = e._sourceIcon
            ? `<img class="src-icon-sm" src="${escapeHtml(e._sourceIcon)}" alt="" loading="lazy" onerror="this.remove()">`
            : "";
          metaParts.push(
            `<span class="source-tag">${tagIcon}${escapeHtml(e._sourceTitle || "")}</span>`
          );
        } else if (e.author) {
          metaParts.push(`<span>${escapeHtml(e.author)}</span>`);
        }
        const meta = metaParts.length
          ? `<div class="meta">${metaParts.join('<span class="dot">·</span>')}</div>`
          : "";

        const badges = [];
        if (favorites.has(id)) badges.push("★");
        if (saved.has(id)) badges.push("🔖");
        const badge = badges.length
          ? `<span class="badge">${badges.join("")}</span>`
          : "";

        return `
          <div class="article ${hasImg ? "" : "no-image"}" data-idx="${idx}" role="button" tabindex="0">
            ${hasImg ? `<img class="thumb" src="${escapeHtml(imgSrc)}" loading="lazy" alt="">` : ""}
            <div class="body">
              <div class="title-row">
                <div class="title">${escapeHtml(e.title || "")}</div>
                ${badge}
              </div>
              ${summary}
              ${meta}
            </div>
          </div>
        `;
      })
      .join("");
  }

  _attachArticleHandlers(visible, byEntity) {
    this.shadowRoot.querySelectorAll(".article").forEach((el) => {
      const idx = Number(el.dataset.idx);
      el.addEventListener("click", () => this._openModal(idx, visible, byEntity));
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          this._openModal(idx, visible, byEntity);
        }
      });
    });
  }

  // Surgical update used by the search input handler. Only touches the
  // article list and the count; leaves the search input alive so focus
  // and caret position stay where the user is typing.
  _refreshFilteredView() {
    if (!this._hass || !this._config) return;
    const { entries: agg, byEntity } = this._aggregateEntries();
    const filtered = this._applyFilters(agg);
    const totalAvailable = filtered.length;
    const visible = filtered.slice(0, this._config.max_items);
    const isMulti = this._config.entities.length > 1;
    const favorites = ArticleStore.load("favorite");
    const saved = ArticleStore.load("saved");
    const locale = this._hass?.locale?.language || "en";

    const feedCount = this._config.entities.length;
    const articleNoun = totalAvailable === 1 ? "article" : "articles";
    const fromText =
      feedCount > 1 ? ` from ${feedCount} feed${feedCount === 1 ? "" : "s"}` : "";
    const countEl = this.shadowRoot.querySelector(".count");
    if (countEl) countEl.textContent = `${totalAvailable} ${articleNoun}${fromText}`;

    const filterActive =
      (this._config.show_search && this._searchQuery.trim()) ||
      (this._config.show_topics && this._activeTopic) ||
      this._showFavoritesOnly ||
      this._showSavedOnly ||
      this._showUnreadOnly;

    const listEl = this.shadowRoot.querySelector(".list");
    const emptyEl = this.shadowRoot.querySelector(".empty");

    if (visible.length === 0) {
      const msg = filterActive ? "No matches." : "No entries.";
      if (emptyEl) {
        emptyEl.textContent = msg;
      } else if (listEl) {
        listEl.outerHTML = `<div class="empty">${msg}</div>`;
      }
      return;
    }

    const itemsHtml = this._buildItemsHtml(
      visible,
      isMulti,
      favorites,
      saved,
      locale
    );

    if (listEl) {
      listEl.innerHTML = itemsHtml;
    } else if (emptyEl) {
      const listStyle =
        this._config.max_list_height && Number(this._config.max_list_height) > 0
          ? ` style="max-height: ${Number(this._config.max_list_height)}px; overflow-y: auto;"`
          : "";
      emptyEl.outerHTML = `<div class="list"${listStyle}>${itemsHtml}</div>`;
    }
    this._attachArticleHandlers(visible, byEntity);
  }

  _applyFilters(entries) {
    const q = (this._searchQuery || "").trim().toLowerCase();
    let out = entries;
    if (this._config.show_search && q) {
      out = out.filter((e) => {
        const title = (e.title || "").toLowerCase();
        const summary = stripHtml(e.summary || "").toLowerCase();
        return title.includes(q) || summary.includes(q);
      });
    }
    if (this._config.show_topics && this._activeTopic) {
      if (this._topicsMode === "sources") {
        out = out.filter((e) => e._sourceTitle === this._activeTopic);
      } else if (this._topicsMode === "themes") {
        if (this._activeTopic === "Other") {
          out = out.filter((e) => !e._sourceThemeLabel);
        } else {
          out = out.filter((e) => e._sourceThemeLabel === this._activeTopic);
        }
      } else {
        out = out.filter((e) =>
          (e.category || []).includes(this._activeTopic)
        );
      }
    }
    if (this._showFavoritesOnly) {
      const favs = ArticleStore.load("favorite");
      out = out.filter((e) => favs.has(articleId(e)));
    }
    if (this._showSavedOnly) {
      const saved = ArticleStore.load("saved");
      out = out.filter((e) => saved.has(articleId(e)));
    }
    if (this._showUnreadOnly) {
      const viewed = ArticleStore.load("viewed");
      out = out.filter((e) => !viewed.has(articleId(e)));
    }
    return out;
  }

  _openModal(index, entries, byEntity) {
    console.info("[fast-news-reader] opening modal for index", index);
    const locale = this._hass?.locale?.language || "en";
    const modal = document.createElement("fast-news-reader-modal");
    document.body.appendChild(modal);
    modal.open({
      entries,
      index,
      sourceTitleFor: (e) =>
        this._config.title || e._sourceTitle || byEntity[e._entityId] || "",
      locale,
    });
  }

  _render() {
    if (!this._config) return;
    const hass = this._hass;
    const locale = hass?.locale?.language || "en";

    // Capture search-input focus state before we clobber the shadow DOM,
    // so a state push from HA mid-typing doesn't yank the caret away.
    const focusedSearch =
      this.shadowRoot?.activeElement &&
      this.shadowRoot.activeElement.classList?.contains("search-input")
        ? this.shadowRoot.activeElement
        : null;
    const caretPos = focusedSearch?.selectionStart ?? null;

    if (!hass || !this._config.entities?.length) {
      this._renderShell(`<div class="empty">No feed selected.</div>`);
      return;
    }

    const { entries: agg, byEntity, iconByEntity } = this._aggregateEntries();
    const topicList = this._config.show_topics ? this._collectTopics(agg) : [];
    // Drop a stale active topic that no longer exists after a refresh.
    if (this._activeTopic && !topicList.includes(this._activeTopic)) {
      this._activeTopic = null;
    }
    const filtered = this._applyFilters(agg);
    const totalAvailable = filtered.length;
    const visible = filtered.slice(0, this._config.max_items);
    const filterActive =
      (this._config.show_search && this._searchQuery.trim()) ||
      (this._config.show_topics && this._activeTopic) ||
      this._showFavoritesOnly ||
      this._showSavedOnly ||
      this._showUnreadOnly;

    const isMulti = this._config.entities.length > 1;
    const headerTitle =
      this._config.title ||
      (!isMulti
        ? byEntity[this._config.entities[0].entity] || ""
        : "Feeds");
    const headerIcon =
      !isMulti && !this._config.title
        ? iconByEntity[this._config.entities[0].entity]
        : "";
    const favorites = ArticleStore.load("favorite");
    const saved = ArticleStore.load("saved");

    const unavailableNames = this._config.entities
      .map((f) => {
        const s = hass.states[f.entity];
        if (s && s.state !== "unavailable" && s.state !== "unknown") return null;
        return s?.attributes?.friendly_name || f.entity;
      })
      .filter(Boolean);
    const warningHtml = unavailableNames.length
      ? `<div class="feed-warning" role="status">
          <span class="warn-icon" aria-hidden="true">⚠</span>
          <span>${
            unavailableNames.length === 1
              ? `${escapeHtml(unavailableNames[0])} is unavailable`
              : `${unavailableNames.length} feeds unavailable`
          }</span>
        </div>`
      : "";

    const safeHeader = escapeHtml(headerTitle);
    const headerIconHtml = headerIcon
      ? `<img class="src-icon" src="${escapeHtml(headerIcon)}" alt="" loading="lazy" onerror="this.remove()">`
      : "";

    const feedCount = this._config.entities.length;
    const articleNoun = totalAvailable === 1 ? "article" : "articles";
    const fromText =
      feedCount > 1 ? ` from ${feedCount} feed${feedCount === 1 ? "" : "s"}` : "";
    const countLabel = `${totalAvailable} ${articleNoun}${fromText}`;

    const refreshBtnHtml = `<button class="refresh-btn" title="Refresh feeds" aria-label="Refresh feeds" type="button">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-8 3.58-8 8s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
      </svg>
    </button>`;

    const searchHtml = this._config.show_search
      ? `<div class="searchbar">
          <input type="search" class="search-input"
                 placeholder="Search articles..."
                 value="${escapeHtml(this._searchQuery)}"
                 aria-label="Search articles">
        </div>`
      : "";

    // Show the topics bar whenever the option is on AND switching modes
    // could yield something useful (multi-feed, or current mode has topics).
    const showTopicsBar =
      this._config.show_topics && (topicList.length > 0 || feedCount > 1);
    const MODE_LABELS = {
      categories: "Topics",
      sources: "Sources",
      themes: "Themes",
    };
    const MODE_TITLES = {
      categories: "article categories from each feed's <category> tags",
      sources: "the source feed each article comes from",
      themes: "the curated theme assigned to each feed (news, tech, sport, ...)",
    };
    const modeToggleHtml = showTopicsBar
      ? `<button class="topic-mode-btn" type="button"
                title="Currently grouped by ${MODE_TITLES[this._topicsMode] || ""}. Click to switch."
                aria-label="Switch grouping mode">
          <span class="mode-label">${MODE_LABELS[this._topicsMode] || "Topics"}</span>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path fill="currentColor" d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/>
          </svg>
        </button>`
      : "";

    const stateFiltersHtml = showTopicsBar
      ? `<button class="filter-btn fav-filter" type="button"
                data-active="${this._showFavoritesOnly}"
                title="Show only favorites" aria-label="Filter favorites"
                aria-pressed="${this._showFavoritesOnly}">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
          </svg>
        </button>
        <button class="filter-btn save-filter" type="button"
                data-active="${this._showSavedOnly}"
                title="Show only read-later" aria-label="Filter read-later"
                aria-pressed="${this._showSavedOnly}">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
          </svg>
        </button>
        <button class="filter-btn unread-filter" type="button"
                data-active="${this._showUnreadOnly}"
                title="Show only unread" aria-label="Filter unread"
                aria-pressed="${this._showUnreadOnly}">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="12" cy="12" r="6" fill="currentColor"/>
          </svg>
        </button>`
      : "";
    const topicsHtml = showTopicsBar
      ? `<div class="topics-wrap at-start">
          <div class="topics" role="tablist">
            ${modeToggleHtml}
            ${stateFiltersHtml}
            <button class="topic ${this._activeTopic == null ? "active" : ""}"
                    data-topic="" role="tab"
                    aria-selected="${this._activeTopic == null}">All</button>
            ${topicList
              .map(
                (t) =>
                  `<button class="topic ${this._activeTopic === t ? "active" : ""}"
                           data-topic="${escapeHtml(t)}" role="tab"
                           aria-selected="${this._activeTopic === t}">${escapeHtml(t)}</button>`
              )
              .join("")}
          </div>
        </div>`
      : "";

    if (!visible.length) {
      const emptyMsg = filterActive ? "No matches." : "No entries.";
      this._renderShell(`
        <div class="header">
          ${headerIconHtml}
          <span>${safeHeader}</span>
          <span class="count">${countLabel}</span>
          ${refreshBtnHtml}
        </div>
        ${warningHtml}
        ${searchHtml}
        ${topicsHtml}
        <div class="empty">${emptyMsg}</div>
      `);
      this._attachInteractiveHandlers(focusedSearch, caretPos);
      return;
    }

    const itemsHtml = this._buildItemsHtml(
      visible,
      isMulti,
      favorites,
      saved,
      locale
    );

    const listStyle =
      this._config.max_list_height && Number(this._config.max_list_height) > 0
        ? ` style="max-height: ${Number(this._config.max_list_height)}px; overflow-y: auto;"`
        : "";

    this._renderShell(`
      <div class="header">
        ${headerIconHtml}
        <span>${safeHeader}</span>
        <span class="count">${countLabel}</span>
        ${refreshBtnHtml}
      </div>
      ${warningHtml}
      ${searchHtml}
      ${topicsHtml}
      <div class="list"${listStyle}>${itemsHtml}</div>
    `);

    this._attachArticleHandlers(visible, byEntity);
    this._attachInteractiveHandlers(focusedSearch, caretPos);
  }

  _attachInteractiveHandlers(prevFocusedSearch, prevCaretPos) {
    const searchEl = this.shadowRoot.querySelector(".search-input");
    if (searchEl) {
      // Use the surgical refresh: only touch the article list and the
      // count, never rebuild the shell. Otherwise the search input gets
      // destroyed mid-keystroke and focus is lost after the first letter.
      searchEl.addEventListener("input", (ev) => {
        this._searchQuery = ev.target.value;
        this._refreshFilteredView();
      });
      // HA listens for single-letter keyboard shortcuts (`a` opens Assist,
      // `e` opens entity search, etc.) at the document level. Without this
      // those shortcuts hijack typing in our search box after the first
      // keystroke. Keep the event inside the input. Capture phase so we
      // run before any document-level handler attached at capture too.
      searchEl.addEventListener(
        "keydown",
        (ev) => ev.stopPropagation(),
        true
      );
      // Restore focus if user was typing when a refresh forced a re-render.
      if (prevFocusedSearch) {
        searchEl.focus();
        if (prevCaretPos != null) {
          const len = searchEl.value.length;
          const pos = Math.min(prevCaretPos, len);
          searchEl.setSelectionRange(pos, pos);
        }
      }
    }
    this.shadowRoot.querySelectorAll(".topic").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = btn.dataset.topic || null;
        this._activeTopic = this._activeTopic === t ? null : t;
        this._render();
      });
    });

    const modeBtn = this.shadowRoot.querySelector(".topic-mode-btn");
    if (modeBtn) {
      modeBtn.addEventListener("click", () => {
        const order = ["categories", "sources", "themes"];
        const idx = order.indexOf(this._topicsMode);
        this._topicsMode = order[(idx + 1) % order.length];
        // Active topic from previous mode almost certainly does not exist
        // in the new mode; reset so the user starts fresh.
        this._activeTopic = null;
        this._render();
      });
    }

    const favFilterBtn = this.shadowRoot.querySelector(".fav-filter");
    if (favFilterBtn) {
      favFilterBtn.addEventListener("click", () => {
        this._showFavoritesOnly = !this._showFavoritesOnly;
        this._render();
      });
    }
    const saveFilterBtn = this.shadowRoot.querySelector(".save-filter");
    if (saveFilterBtn) {
      saveFilterBtn.addEventListener("click", () => {
        this._showSavedOnly = !this._showSavedOnly;
        this._render();
      });
    }
    const unreadFilterBtn = this.shadowRoot.querySelector(".unread-filter");
    if (unreadFilterBtn) {
      unreadFilterBtn.addEventListener("click", () => {
        this._showUnreadOnly = !this._showUnreadOnly;
        this._render();
      });
    }

    const topicsWrap = this.shadowRoot.querySelector(".topics-wrap");
    const topicsEl = topicsWrap?.querySelector(".topics");
    if (topicsWrap && topicsEl) {
      const updateFades = () => {
        const atStart = topicsEl.scrollLeft <= 1;
        const atEnd =
          topicsEl.scrollLeft + topicsEl.clientWidth >= topicsEl.scrollWidth - 1;
        topicsWrap.classList.toggle("at-start", atStart);
        topicsWrap.classList.toggle("at-end", atEnd);
      };
      topicsEl.addEventListener("scroll", updateFades, { passive: true });
      // Run once after layout so the at-end class lands correctly when the
      // pills fit without scrolling.
      requestAnimationFrame(updateFades);
    }

    const refreshBtn = this.shadowRoot.querySelector(".refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        if (refreshBtn.disabled) return;
        const ids = this._config.entities.map((f) => f.entity);
        if (this._hass && ids.length) {
          this._hass.callService("homeassistant", "update_entity", {
            entity_id: ids,
          });
        }
        refreshBtn.disabled = true;
        refreshBtn.classList.add("spinning");
        setTimeout(() => {
          refreshBtn.classList.remove("spinning");
          refreshBtn.disabled = false;
        }, 1500);
      });
    }
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
    "Multi-source news card with images, fullscreen reader, prev/next, save/favorite/hide.",
  preview: false,
  documentationURL:
    "https://github.com/fastender/fast-news-reader#lovelace-card",
};
if (idx === -1) window.customCards.push(cardMeta);
else window.customCards[idx] = cardMeta;
