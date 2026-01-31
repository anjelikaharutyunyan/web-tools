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
  const isReasonableBox = (r, minW, minH) =>
    r.width >= minW && r.height >= minH;

  function markOutlined(el, tag) {
    el.classList.add(`${NS}-outline`);
    el.setAttribute(`data-${NS}`, tag);
  }

  function unmarkOutlined(tag) {
    document.querySelectorAll(`[data-${NS}="${tag}"]`).forEach((el) => {
      el.classList.remove(`${NS}-outline`);
      el.removeAttribute(`data-${NS}`);
    });
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
      if (
        r.bottom < 0 ||
        r.right < 0 ||
        r.top > innerHeight ||
        r.left > innerWidth
      ) {
        item.badge.style.display = "none";
        continue;
      }
      item.badge.style.display = "";

      item.badge.style.top = `${Math.max(0, r.top + window.scrollY)}px`;
      item.badge.style.left = `${Math.max(0, r.left + window.scrollX)}px`;
    }
  }

  function clearTagBadges() {
    for (const item of state.tagBadges) item?.badge?.remove();
    state.tagBadges = [];
    maybeRemoveListeners();
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

      // avoid invisibles quickly
      const cs = getComputedStyle(el);
      if (
        cs.display === "none" ||
        cs.visibility === "hidden" ||
        Number(cs.opacity) === 0
      )
        continue;

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
    for (const el of all) {
      try {
        const r = el.getBoundingClientRect();
        if (!isReasonableBox(r, boxMin[0], boxMin[1])) continue;

        if (predicate(el)) {
          markOutlined(el, tag);
        }
      } catch {}
    }
  }

  function outlineSimple(tag, selector) {
    ensureStyles();
    document.querySelectorAll(selector).forEach((el) => markOutlined(el, tag));
  }

  // ----------------- functions list (ARRAY) -----------------
  const outlineFunctionList = [
    {
      name: "outlineAbsolutePositionedElements",
      apply() {
        outlineByPredicate(
          this.name,
          (el) => getComputedStyle(el).position === "absolute",
        );
      },
      revert() {
        unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineBlockLevelElements",
      apply() {
        // Common “block-like” displays
        const blocky = new Set([
          "block",
          "flex",
          "grid",
          "list-item",
          "table",
          "flow-root",
        ]);
        outlineByPredicate(
          this.name,
          (el) => blocky.has(getComputedStyle(el).display),
          [50, 16],
        );
      },
      revert() {
        unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineDeprecatedElements",
      apply() {
        outlineByPredicate(
          this.name,
          (el) => DEPRECATED_TAGS.has(el.tagName.toLowerCase()),
          [10, 10],
        );
      },
      revert() {
        unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineExternalLinks",
      apply() {
        ensureStyles();
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
          }
        });
      },
      revert() {
        unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineFixedPositionedElements",
      apply() {
        outlineByPredicate(
          this.name,
          (el) => getComputedStyle(el).position === "fixed",
        );
      },
      revert() {
        unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineFloatedElements",
      apply() {
        outlineByPredicate(this.name, (el) => {
          const f = getComputedStyle(el).float;
          return f && f !== "none";
        });
      },
      revert() {
        unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineFrames",
      apply() {
        outlineSimple(this.name, "iframe, frame, frameset");
      },
      revert() {
        unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineHeadings",
      apply() {
        outlineSimple(this.name, "h1,h2,h3,h4,h5,h6");
      },
      revert() {
        unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineNonSecureElements",
      apply() {
        // mixed content: http resources on https page
        const isHttps = location.protocol === "https:";
        outlineByPredicate(
          this.name,
          (el) => {
            if (!isHttps) return false;
            const src = el.getAttribute?.("src");
            const href = el.getAttribute?.("href");
            const v = src || href;
            return (
              typeof v === "string" &&
              v.trim().toLowerCase().startsWith("http://")
            );
          },
          [20, 10],
        );
      },
      revert() {
        unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineRelativePositionedElements",
      apply() {
        outlineByPredicate(
          this.name,
          (el) => getComputedStyle(el).position === "relative",
        );
      },
      revert() {
        unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineTableCaptions",
      apply() {
        outlineSimple(this.name, "caption");
      },
      revert() {
        unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineTableCells",
      apply() {
        outlineSimple(this.name, "td, th");
      },
      revert() {
        unmarkOutlined(this.name);
      },
    },
    {
      name: "outlineTables",
      apply() {
        outlineSimple(this.name, "table");
      },
      revert() {
        unmarkOutlined(this.name);
      },
    },
    {
      name: "showElementTagNames",
      apply() {
        // This one shows badges (not only outlines)
        createTagBadges();
      },
      revert() {
        clearTagBadges();
      },
    },
  ];

  const outlineFunctionsMap = new Map(
    outlineFunctionList.map((f) => [f.name, f]),
  );

  // ----------------- PUBLIC API (like informationFunctions) -----------------
  window.outlineFunctions = {
    apply(name) {
      const fn = outlineFunctionsMap.get(name);
      if (!fn) return null;
      fn.apply();
      state.applied.add(name);
      return true;
    },
    revert(name) {
      const fn = outlineFunctionsMap.get(name);
      if (!fn) return null;
      fn.revert();
      state.applied.delete(name);
      return true;
    },
    revertAll() {
      for (const n of Array.from(state.applied)) {
        try {
          outlineFunctionsMap.get(n)?.revert();
        } catch {}
      }
      state.applied.clear();
      // ensure badges gone
      clearTagBadges();
    },
  };
})();
