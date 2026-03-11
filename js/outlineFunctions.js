(() => {
  const NS = "__outline_tool";

  const state =
    window[NS] ||
    (window[NS] = {
      applied: new Set(),
      stylesInjected: false,

      // showElementTagNames storage
      tagBadges: [], // Array<{ badge: HTMLElement, el: Element }>
      raf: 0,
      listenersOn: false,
      maxBadges: 600,
    });

  // ----------------- CSS -----------------
  function ensureStyles() {
    if (state.stylesInjected) return;
    state.stylesInjected = true;

    const style = document.createElement("style");
    style.id = `${NS}_style`;
    style.textContent = `
      .${NS}-outline {
        outline: 2px dashed rgba(0, 123, 255, .95) !important;
        outline-offset: 2px !important;
      }

      .${NS}-badge {
        position: absolute;
        z-index: 2147483647;
        font: 12px/1.2 Arial, sans-serif;
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(0,0,0,.85);
        color: #fff;
        pointer-events: none;
        transform: translateY(-100%);
        white-space: nowrap;
        max-width: min(380px, 60vw);
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `;
    document.documentElement.appendChild(style);
  }

  // ----------------- helpers -----------------
  const isReasonableBox = (r, minW, minH) => r.width >= minW && r.height >= minH;

  function markOutlined(el, tag) {
    el.classList.add(`${NS}-outline`);
    el.setAttribute(`data-${NS}`, tag);
  }

  function unmarkOutlined(tag) {
    const list = document.querySelectorAll(`[data-${NS}="${tag}"]`);
    list.forEach((el) => {
      el.classList.remove(`${NS}-outline`);
      el.removeAttribute(`data-${NS}`);
    });
    return list.length;
  }

  function scheduleUpdate() {
    if (state.raf) return;
    state.raf = requestAnimationFrame(() => {
      state.raf = 0;
      updateBadges();
    });
  }

  function ensureListeners() {
    if (state.listenersOn) return;
    state.listenersOn = true;
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
  }

  function maybeRemoveListeners() {
    if (state.tagBadges.length > 0) return;
    if (!state.listenersOn) return;

    state.listenersOn = false;
    window.removeEventListener("scroll", scheduleUpdate);
    window.removeEventListener("resize", scheduleUpdate);
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
  }

  function updateBadges() {
    for (const item of state.tagBadges) {
      if (!item?.badge || !item?.el || !item.el.isConnected) continue;

      const r = item.el.getBoundingClientRect();

      // cheap culling
      if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) {
        item.badge.style.display = "none";
        continue;
      }
      item.badge.style.display = "";

      item.badge.style.top = `${Math.max(0, r.top + window.scrollY)}px`;
      item.badge.style.left = `${Math.max(0, r.left + window.scrollX)}px`;
    }
  }

  function clearTagBadges() {
    const removed = state.tagBadges.length;
    for (const item of state.tagBadges) item?.badge?.remove();
    state.tagBadges = [];
    maybeRemoveListeners();
    return removed;
  }

  function createTagBadges() {
    ensureStyles();
    ensureListeners();

    clearTagBadges();

    const all = Array.from(document.querySelectorAll("body *"));
    let count = 0;

    for (const el of all) {
      if (count >= state.maxBadges) break;

      const r = el.getBoundingClientRect();
      if (!isReasonableBox(r, 80, 18)) continue;

      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;

      const badge = document.createElement("div");
      badge.className = `${NS}-badge`;
      badge.textContent = el.tagName.toLowerCase();
      badge.style.top = `${Math.max(0, r.top + window.scrollY)}px`;
      badge.style.left = `${Math.max(0, r.left + window.scrollX)}px`;

      document.documentElement.appendChild(badge);
      state.tagBadges.push({ badge, el });
      count++;
    }

    scheduleUpdate();
    return count; // ✅ return how many badges created
  }

  // ----------------- selectors by function -----------------
  const DEPRECATED_TAGS = new Set([
    "acronym",
    "applet",
    "basefont",
    "bgsound",
    "big",
    "blink",
    "center",
    "dir",
    "font",
    "frame",
    "frameset",
    "isindex",
    "keygen",
    "marquee",
    "menuitem",
    "nobr",
    "noembed",
    "noframes",
    "plaintext",
    "rb",
    "rtc",
    "spacer",
    "strike",
    "tt",
    "xmp",
  ]);

  function outlineByPredicate(tag, predicate, boxMin = [30, 10]) {
    ensureStyles();

    const all = Array.from(document.querySelectorAll("body *"));
    let count = 0;

    for (const el of all) {
      try {
        const r = el.getBoundingClientRect();
        if (!isReasonableBox(r, boxMin[0], boxMin[1])) continue;

        if (predicate(el)) {
          markOutlined(el, tag);
          count++;
        }
      } catch { }
    }
    return count; // ✅ count outlined elements
  }

  function outlineSimple(tag, selector) {
    ensureStyles();
    const list = document.querySelectorAll(selector);
    list.forEach((el) => markOutlined(el, tag));
    return list.length; // ✅ count outlined elements
  }

  // ----------------- functions list (ARRAY) -----------------
  const outlineFunctionList = [
    {
      name: "outlineAbsolutePositionedElements",
      apply() {
        return outlineByPredicate(this.name, (el) => getComputedStyle(el).position === "absolute");
      },
      revert() {
        return unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineBlockLevelElements",
      apply() {
        const blocky = new Set(["block", "flex", "grid", "list-item", "table", "flow-root"]);
        return outlineByPredicate(this.name, (el) => blocky.has(getComputedStyle(el).display), [50, 16]);
      },
      revert() {
        return unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineDeprecatedElements",
      apply() {
        return outlineByPredicate(this.name, (el) => DEPRECATED_TAGS.has(el.tagName.toLowerCase()), [10, 10]);
      },
      revert() {
        return unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineExternalLinks",
      apply() {
        ensureStyles();
        let count = 0;

        document.querySelectorAll("a[href]").forEach((a) => {
          const href = a.getAttribute("href");
          if (!href) return;

          let url;
          try {
            url = new URL(href, location.href);
          } catch {
            return;
          }

          if (url.origin !== location.origin) {
            markOutlined(a, this.name);
            count++;
          }
        });

        return count;
      },
      revert() {
        return unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineFixedPositionedElements",
      apply() {
        return outlineByPredicate(this.name, (el) => getComputedStyle(el).position === "fixed");
      },
      revert() {
        return unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineFloatedElements",
      apply() {
        return outlineByPredicate(this.name, (el) => {
          const f = getComputedStyle(el).float;
          return f && f !== "none";
        });
      },
      revert() {
        return unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineFrames",
      apply() {
        return outlineSimple(this.name, "iframe, frame, frameset");
      },
      revert() {
        return unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineHeadings",
      apply() {
        return outlineSimple(this.name, "h1,h2,h3,h4,h5,h6");
      },
      revert() {
        return unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineNonSecureElements",
      apply() {
        const isHttps = location.protocol === "https:";
        return outlineByPredicate(
          this.name,
          (el) => {
            if (!isHttps) return false;
            const src = el.getAttribute?.("src");
            const href = el.getAttribute?.("href");
            const v = src || href;
            return typeof v === "string" && v.trim().toLowerCase().startsWith("http://");
          },
          [20, 10],
        );
      },
      revert() {
        return unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineRelativePositionedElements",
      apply() {
        return outlineByPredicate(this.name, (el) => getComputedStyle(el).position === "relative");
      },
      revert() {
        return unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineTableCaptions",
      apply() {
        return outlineSimple(this.name, "caption");
      },
      revert() {
        return unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineTableCells",
      apply() {
        return outlineSimple(this.name, "td, th");
      },
      revert() {
        return unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineTables",
      apply() {
        return outlineSimple(this.name, "table");
      },
      revert() {
        return unmarkOutlined(this.name);
      },
    },
    {
      name: "showElementTagNames",
      apply() {
        return createTagBadges();
      },
      revert() {
        return clearTagBadges();
      },
    },
  ];

  const outlineFunctionsMap = new Map(outlineFunctionList.map((f) => [f.name, f]));

  // ----------------- PUBLIC API -----------------
  window.outlineFunctions = {
    apply(name) {
      const fn = outlineFunctionsMap.get(name);
      if (!fn) return { ok: false, message: `Unknown function: ${name}`, count: 0 };

      const count = Number(fn.apply?.() ?? 0) || 0;
      state.applied.add(name);

      if (count === 0) {
        // if nothing outlined, consider it "not applied"
        state.applied.delete(name);
        return { ok: false, message: "No matching elements found", count: 0 };
      }

      return { ok: true, message: "Applied", count };
    },

    revert(name) {
      const fn = outlineFunctionsMap.get(name);
      if (!fn) return { ok: false, message: `Unknown function: ${name}`, count: 0 };

      const count = Number(fn.revert?.() ?? 0) || 0;
      state.applied.delete(name);

      // Revert can be "ok" even when count=0 (it just means nothing was applied before)
      return { ok: true, message: count ? "Reverted" : "Nothing to revert", count };
    },

    revertAll() {
      let total = 0;
      for (const n of Array.from(state.applied)) {
        try {
          const fn = outlineFunctionsMap.get(n);
          total += Number(fn?.revert?.() ?? 0) || 0;
        } catch { }
      }
      state.applied.clear();
      total += clearTagBadges();
      return { ok: true, message: "Reverted all", count: total };
    },
  };
})();
