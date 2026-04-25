/*!
 * Fast News Reader - Lovelace card.
 *
 * Vanilla web components, no Lit, no build step.
 *
 * Card config:
 *   type: custom:fast-news-reader-card
 *   entities: [sensor.tagesschau, sensor.heise]   # multi-source supported
 *   # entity: sensor.tagesschau                    # legacy single source still works
 *   max_items: 5
 *   show_image: true
 *   show_summary: true
 *   show_date: true
 *   title: "My news"
 */

const CARD_VERSION = "0.8.0";

console.info(
  `%c FAST-NEWS-READER-CARD %c v${CARD_VERSION} `,
  "color:white;background:#FF6B4A;font-weight:700;border-radius:3px 0 0 3px;padding:2px 6px",
  "color:#FF6B4A;background:#1A1A1A;font-weight:700;border-radius:0 3px 3px 0;padding:2px 6px"
);

// ===========================================================================
// Helpers
// ===========================================================================

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

function articleId(entry) {
  return entry.id || entry.link || entry.title || "";
}

// ===========================================================================
// Per-article actions, stored in localStorage. Card and modal both read
// this; they listen for "fnr:state-changed" so any action propagates.
// ===========================================================================

const ACTIONS = ["saved", "favorite", "hidden"];

const ArticleStore = {
  _key(category) {
    return `fnr-${category}`;
  },
  load(category) {
    try {
      const raw = localStorage.getItem(this._key(category));
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  },
  save(category, set) {
    try {
      localStorage.setItem(this._key(category), JSON.stringify([...set]));
    } catch {
      /* ignore storage errors */
    }
  },
  has(category, id) {
    return this.load(category).has(id);
  },
  toggle(category, id) {
    const set = this.load(category);
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
  .feed-row select { flex: 1; }
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
  .toggles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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
    // Normalize legacy `entity` to `entities` array for the editor.
    const cfg = { ...config };
    if (!cfg.entities && cfg.entity) cfg.entities = [cfg.entity];
    if (!cfg.entities) cfg.entities = [];
    delete cfg.entity;
    this._config = cfg;
    if (this._rendered) this._fill();
    else this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._rendered) this._refreshAllSelects();
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
        <label class="lbl">Show in card</label>
        <div class="toggles">
          <label class="toggle"><input id="fnr-img" type="checkbox"> Image</label>
          <label class="toggle"><input id="fnr-sum" type="checkbox"> Summary</label>
          <label class="toggle"><input id="fnr-date" type="checkbox"> Date</label>
        </div>
      </div>
    `;

    this._renderFeedRows();
    this._fillSimpleFields();

    this.querySelector("#fnr-add").addEventListener("click", () => {
      const ids = this._availableEntities();
      const taken = new Set(this._config.entities || []);
      const next = ids.find((i) => !taken.has(i)) || ids[0] || "";
      this._config = {
        ...this._config,
        entities: [...(this._config.entities || []), next],
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

    entities.forEach((current, idx) => {
      const row = document.createElement("div");
      row.className = "feed-row";

      const select = document.createElement("select");
      const all = [...ids];
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
        next[idx] = e.target.value;
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
      row.appendChild(remove);
      container.appendChild(row);
    });
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
  }

  _fill() {
    this._fillSimpleFields();
    this._renderFeedRows();
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
    transition: background-color 120ms ease, color 120ms ease;
  }
  .action-btn:hover { background: var(--divider-color, rgba(255,255,255,0.18)); }
  .action-btn[data-active="true"] { color: var(--primary-color, #FF6B4A); }
  .action-btn.close { font-size: 20px; }

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
        <button class="nav prev" aria-label="Previous">‹</button>
        <article class="panel" tabindex="-1">
          <div class="actions">
            <button class="action-btn save" title="Read later" aria-label="Read later">🔖</button>
            <button class="action-btn fav" title="Favorite" aria-label="Favorite">★</button>
            <button class="action-btn hide" title="Hide" aria-label="Hide">⊘</button>
            <button class="action-btn close" title="Close" aria-label="Close">×</button>
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

    if (e.image) {
      r.hero.src = e.image;
      r.hero.classList.remove("hero-fallback");
      r.hero.style.display = "";
    } else {
      r.hero.removeAttribute("src");
      r.hero.classList.add("hero-fallback");
      r.hero.style.display = "none";
    }

    r.content.innerHTML = html || `<p>${stripHtml(e.summary || "")}</p>`;

    if (e.link) {
      r.visit.href = e.link;
      r.visit.style.display = "";
    } else {
      r.visit.style.display = "none";
    }

    r.prev.disabled = this._index <= 0;
    r.next.disabled = this._index >= this._entries.length - 1;

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
    // Normalize legacy `entity` to `entities` array.
    const entities = config.entities
      ? [...config.entities]
      : config.entity
      ? [config.entity]
      : [];
    if (!entities.length) {
      throw new Error("at least one entity is required");
    }
    for (const id of entities) {
      if (!id.startsWith("sensor.")) {
        throw new Error(`entity must be a sensor: ${id}`);
      }
    }
    this._config = {
      max_items: 5,
      show_image: true,
      show_summary: true,
      show_date: true,
      ...config,
      entities,
    };
    delete this._config.entity;
    this._lastStateStamp = null;
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
      .map((id) => {
        const s = this._hass.states[id];
        return s ? `${id}:${s.state}:${s.last_updated}` : `${id}:missing`;
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
    for (const id of this._config.entities) {
      const stateObj = this._hass.states[id];
      if (!stateObj) continue;
      const channel = stateObj.attributes.channel || {};
      const sourceTitle = channel.title || stateObj.attributes.friendly_name || id;
      byEntity[id] = sourceTitle;
      const entries = stateObj.attributes.entries || [];
      for (const e of entries) {
        if (hidden.has(articleId(e))) continue;
        all.push({ ...e, _entityId: id, _sourceTitle: sourceTitle });
      }
    }
    // Sort by published_dt (or published string) desc.
    all.sort((a, b) => {
      const ta = new Date(a.published_dt || a.published || 0).getTime() || 0;
      const tb = new Date(b.published_dt || b.published || 0).getTime() || 0;
      return tb - ta;
    });
    return { entries: all, byEntity };
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

    if (!hass || !this._config.entities?.length) {
      this._renderShell(`<div class="empty">No feed selected.</div>`);
      return;
    }

    const { entries: agg, byEntity } = this._aggregateEntries();
    const totalAvailable = agg.length;
    const visible = agg.slice(0, this._config.max_items);

    const headerTitle =
      this._config.title ||
      (this._config.entities.length === 1
        ? byEntity[this._config.entities[0]] || ""
        : "Feeds");
    const isMulti = this._config.entities.length > 1;
    const favorites = ArticleStore.load("favorite");
    const saved = ArticleStore.load("saved");

    if (!visible.length) {
      this._renderShell(`
        <div class="header"><span>${headerTitle}</span></div>
        <div class="empty">No entries.</div>
      `);
      return;
    }

    const itemsHtml = visible
      .map((e, idx) => {
        const id = articleId(e);
        const hasImg = this._config.show_image && e.image;
        const summary = this._config.show_summary && e.summary
          ? `<div class="summary">${stripHtml(e.summary)}</div>`
          : "";
        const metaParts = [];
        if (this._config.show_date && e.published) {
          metaParts.push(`<span>${relativeTime(e.published, locale)}</span>`);
        }
        if (isMulti) {
          metaParts.push(`<span class="source-tag">${e._sourceTitle || ""}</span>`);
        } else if (e.author) {
          metaParts.push(`<span>${e.author}</span>`);
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
            ${hasImg ? `<img class="thumb" src="${e.image}" loading="lazy" alt="">` : ""}
            <div class="body">
              <div class="title-row">
                <div class="title">${e.title || ""}</div>
                ${badge}
              </div>
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
        <span class="count">${totalAvailable} entr${totalAvailable === 1 ? "y" : "ies"}</span>
      </div>
      <div class="list">${itemsHtml}</div>
    `);

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
