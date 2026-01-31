(() => {
    const NS = "__ext_info";

    const state =
        window[NS] ||
        (window[NS] = {
            applied: new Set(),
            stylesInjected: false,

            // tag -> Array<{ badge: HTMLElement, el: Element }>
            badgesByTag: new Map(),
            raf: 0,
            listenersOn: false,

            // safety limits
            maxBadgesPerTag: 400,
        });

    const ensureStyles = () => {
        if (state.stylesInjected) return;
        state.stylesInjected = true;

        const style = document.createElement("style");
        style.id = `${NS}_style`;
        style.textContent = `
      .${NS}-badge{
        position:absolute;
        z-index:2147483647;
        font:12px/1.2 Arial,sans-serif;
        padding:2px 6px;
        border-radius:999px;
        background:rgba(0,0,0,.85);
        color:#fff;
        pointer-events:none;
        transform:translateY(-100%);
        white-space:nowrap;
        max-width:min(420px, 60vw);
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .${NS}-outline{
        outline:2px dashed rgba(255,0,0,.8) !important;
        outline-offset:2px !important;
      }
      .${NS}-panel{
        position:fixed;
        top:16px;
        right:16px;
        width:min(520px, calc(100vw - 32px));
        max-height:calc(100vh - 32px);
        overflow:auto;
        z-index:2147483647;
        background:#111;
        color:#fff;
        border:1px solid rgba(255,255,255,.15);
        border-radius:12px;
        padding:12px;
        box-shadow:0 10px 30px rgba(0,0,0,.35);
        font:13px/1.4 Arial,sans-serif;
      }
      .${NS}-panel h3{ margin:0 0 8px; font-size:14px; }
      .${NS}-panel pre{
        margin:0;
        white-space:pre-wrap;
        word-break:break-word;
        background:rgba(255,255,255,.06);
        padding:10px;
        border-radius:10px;
      }
      .${NS}-panel .${NS}-close{
        float:right;
        cursor:pointer;
        border:none;
        background:rgba(255,255,255,.12);
        color:#fff;
        padding:6px 10px;
        border-radius:10px;
      }
    `;
        document.documentElement.appendChild(style);
    };

    const escapeHtml = (s) =>
        String(s).replace(/[&<>"']/g, (c) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }[c]));

    const openPanel = (title, content) => {
        ensureStyles();
        const id = `${NS}_panel`;
        const old = document.getElementById(id);
        if (old) old.remove();

        const panel = document.createElement("div");
        panel.className = `${NS}-panel`;
        panel.id = id;

        panel.innerHTML = `
      <button class="${NS}-close" aria-label="Close">Close</button>
      <h3>${escapeHtml(title)}</h3>
      <pre>${escapeHtml(content)}</pre>
    `;

        panel.querySelector(`.${NS}-close`).addEventListener("click", () => panel.remove());
        document.documentElement.appendChild(panel);
    };

    // ---------- badge tracking + positioning ----------
    const scheduleUpdate = () => {
        if (state.raf) return;
        state.raf = requestAnimationFrame(() => {
            state.raf = 0;
            updateAllBadgePositions();
        });
    };

    const updateAllBadgePositions = () => {
        // update all tags
        for (const [, arr] of state.badgesByTag.entries()) {
            for (const item of arr) {
                if (!item?.badge || !item?.el || !item.el.isConnected) continue;
                const r = item.el.getBoundingClientRect();

                // hide if offscreen (cheap culling)
                if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) {
                    item.badge.style.display = "none";
                    continue;
                }
                item.badge.style.display = "";

                item.badge.style.top = `${Math.max(0, r.top + window.scrollY)}px`;
                item.badge.style.left = `${Math.max(0, r.left + window.scrollX)}px`;
            }
        }
    };

    const ensureListeners = () => {
        if (state.listenersOn) return;
        state.listenersOn = true;
        window.addEventListener("scroll", scheduleUpdate, { passive: true });
        window.addEventListener("resize", scheduleUpdate, { passive: true });
    };

    const maybeRemoveListeners = () => {
        const hasAnyBadges = Array.from(state.badgesByTag.values()).some((arr) => arr.length > 0);
        if (hasAnyBadges) return;
        if (!state.listenersOn) return;

        state.listenersOn = false;
        window.removeEventListener("scroll", scheduleUpdate);
        window.removeEventListener("resize", scheduleUpdate);
        if (state.raf) cancelAnimationFrame(state.raf);
        state.raf = 0;
    };

    const makeBadge = (el, text, tag) => {
        ensureStyles();
        ensureListeners();

        // enforce limits
        const arr = state.badgesByTag.get(tag) || [];
        if (arr.length >= state.maxBadgesPerTag) return;

        const r = el.getBoundingClientRect();
        const b = document.createElement("div");
        b.className = `${NS}-badge`;
        b.textContent = text;
        b.setAttribute(`data-${NS}-tag`, tag);

        b.style.top = `${Math.max(0, r.top + window.scrollY)}px`;
        b.style.left = `${Math.max(0, r.left + window.scrollX)}px`;

        document.documentElement.appendChild(b);

        arr.push({ badge: b, el });
        state.badgesByTag.set(tag, arr);
    };

    const removeBadgesByTag = (tag) => {
        const arr = state.badgesByTag.get(tag) || [];
        for (const item of arr) item?.badge?.remove();
        state.badgesByTag.set(tag, []);
        maybeRemoveListeners();
    };

    const outline = (el, tag) => {
        el.classList.add(`${NS}-outline`);
        el.setAttribute(`data-${NS}-ol`, tag);
    };

    const removeOutlinesByTag = (tag) => {
        document.querySelectorAll(`[data-${NS}-ol="${tag}"]`).forEach((el) => {
            el.classList.remove(`${NS}-outline`);
            el.removeAttribute(`data-${NS}-ol`);
        });
    };

    // helper: only for "not tiny" visible-ish nodes
    const isReasonableBox = (r, minW, minH) => r.width >= minW && r.height >= minH;

    // ---------- APPLY / REVERT ----------
    const funcs = {
        displayAbbreviations: {
            apply() {
                const tag = "displayAbbreviations";
                document.querySelectorAll("abbr[title]").forEach((abbr) => {
                    outline(abbr, tag);
                    makeBadge(abbr, `abbr: ${abbr.getAttribute("title")}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayAbbreviations");
                removeOutlinesByTag("displayAbbreviations");
            },
        },

        displayAccessKeys: {
            apply() {
                const tag = "displayAccessKeys";
                document.querySelectorAll("[accesskey]").forEach((el) => {
                    outline(el, tag);
                    makeBadge(el, `accesskey: ${el.getAttribute("accesskey")}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayAccessKeys");
                removeOutlinesByTag("displayAccessKeys");
            },
        },

        displayAnchors: {
            apply() {
                const tag = "displayAnchors";
                // IMPORTANT: [id] может быть очень много — ограничиваем badge creation лимитом
                document.querySelectorAll("[id]").forEach((el) => {
                    const r = el.getBoundingClientRect();
                    if (!isReasonableBox(r, 30, 10)) return;
                    outline(el, tag);
                    makeBadge(el, `#${el.id}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayAnchors");
                removeOutlinesByTag("displayAnchors");
            },
        },

        displayAriaRoles: {
            apply() {
                const tag = "displayAriaRoles";
                document.querySelectorAll("[role]").forEach((el) => {
                    outline(el, tag);
                    makeBadge(el, `role: ${el.getAttribute("role")}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayAriaRoles");
                removeOutlinesByTag("displayAriaRoles");
            },
        },

        displayDivDimensions: {
            apply() {
                const tag = "displayDivDimensions";
                document.querySelectorAll("div").forEach((div) => {
                    const r = div.getBoundingClientRect();
                    if (!isReasonableBox(r, 60, 20)) return;
                    outline(div, tag);
                    makeBadge(div, `${Math.round(r.width)}×${Math.round(r.height)}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayDivDimensions");
                removeOutlinesByTag("displayDivDimensions");
            },
        },

        displayDivOrder: {
            apply() {
                const tag = "displayDivOrder";
                const divs = Array.from(document.querySelectorAll("div"));
                divs.forEach((div, i) => {
                    const r = div.getBoundingClientRect();
                    if (!isReasonableBox(r, 60, 20)) return;
                    outline(div, tag);
                    makeBadge(div, `div #${i + 1}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayDivOrder");
                removeOutlinesByTag("displayDivOrder");
            },
        },

        displayElementInformation: {
            apply() {
                const tag = "displayElementInformation";
                // WARNING: body * может быть огромным — оставляем, но с лимитом бейджей
                document.querySelectorAll("body *").forEach((el) => {
                    const r = el.getBoundingClientRect();
                    if (!isReasonableBox(r, 80, 18)) return;
                    outline(el, tag);
                    makeBadge(el, el.tagName.toLowerCase(), tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayElementInformation");
                removeOutlinesByTag("displayElementInformation");
            },
        },

        displayIdClassDetails: {
            apply() {
                const tag = "displayIdClassDetails";
                document.querySelectorAll("[id], [class]").forEach((el) => {
                    const r = el.getBoundingClientRect();
                    if (!isReasonableBox(r, 60, 16)) return;

                    const id = el.id ? `#${el.id}` : "";
                    const cls = el.classList?.length ? `.${Array.from(el.classList).join(".")}` : "";
                    if (!id && !cls) return;

                    outline(el, tag);
                    makeBadge(el, `${id}${id && cls ? " " : ""}${cls}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayIdClassDetails");
                removeOutlinesByTag("displayIdClassDetails");
            },
        },

        displayLinkDetails: {
            apply() {
                const tag = "displayLinkDetails";
                document.querySelectorAll("a[href]").forEach((a) => {
                    outline(a, tag);
                    makeBadge(a, `href: ${a.getAttribute("href")}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayLinkDetails");
                removeOutlinesByTag("displayLinkDetails");
            },
        },

        displayObjectInformation: {
            apply() {
                const tag = "displayObjectInformation";
                const selector = "img, video, audio, object, embed, iframe";
                document.querySelectorAll(selector).forEach((el) => {
                    outline(el, tag);
                    const name = el.tagName.toLowerCase();
                    const src = el.getAttribute("src") || el.getAttribute("data") || "";
                    makeBadge(el, `${name}${src ? `: ${src}` : ""}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayObjectInformation");
                removeOutlinesByTag("displayObjectInformation");
            },
        },

        displayStackLevels: {
            apply() {
                const tag = "displayStackLevels";
                document.querySelectorAll("body *").forEach((el) => {
                    const z = getComputedStyle(el).zIndex;
                    if (z === "auto") return;
                    const r = el.getBoundingClientRect();
                    if (!isReasonableBox(r, 80, 18)) return;

                    outline(el, tag);
                    makeBadge(el, `z-index: ${z}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayStackLevels");
                removeOutlinesByTag("displayStackLevels");
            },
        },

        displayTabIndex: {
            apply() {
                const tag = "displayTabIndex";
                document.querySelectorAll("[tabindex]").forEach((el) => {
                    outline(el, tag);
                    makeBadge(el, `tabindex: ${el.getAttribute("tabindex")}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayTabIndex");
                removeOutlinesByTag("displayTabIndex");
            },
        },

        displayTableDepth: {
            apply() {
                const tag = "displayTableDepth";
                document.querySelectorAll("table").forEach((table) => {
                    let depth = 0;
                    let node = table;
                    while (node && node !== document.documentElement) {
                        depth++;
                        node = node.parentElement;
                    }
                    outline(table, tag);
                    makeBadge(table, `depth: ${depth}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayTableDepth");
                removeOutlinesByTag("displayTableDepth");
            },
        },

        displayTableInformation: {
            apply() {
                const tag = "displayTableInformation";
                document.querySelectorAll("table").forEach((table) => {
                    const rows = table.rows?.length ?? 0;
                    const cols = table.rows?.[0]?.cells?.length ?? 0;
                    outline(table, tag);
                    makeBadge(table, `table: ${rows}x${cols}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayTableInformation");
                removeOutlinesByTag("displayTableInformation");
            },
        },

        displayTitleAttributes: {
            apply() {
                const tag = "displayTitleAttributes";
                document.querySelectorAll("[title]").forEach((el) => {
                    outline(el, tag);
                    makeBadge(el, `title: ${el.getAttribute("title")}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayTitleAttributes");
                removeOutlinesByTag("displayTitleAttributes");
            },
        },

        displayTopographicInformation: {
            apply() {
                const tag = "displayTopographicInformation";
                document.querySelectorAll("body *").forEach((el) => {
                    const r = el.getBoundingClientRect();
                    if (!isReasonableBox(r, 80, 18)) return;

                    // document coords
                    const x = Math.round(r.left + window.scrollX);
                    const y = Math.round(r.top + window.scrollY);

                    outline(el, tag);
                    makeBadge(el, `x:${x} y:${y}`, tag);
                });
                scheduleUpdate();
            },
            revert() {
                removeBadgesByTag("displayTopographicInformation");
                removeOutlinesByTag("displayTopographicInformation");
            },
        },
    };

    // ---------- ONE-SHOT ----------
    const oneShots = {
        pageInfo() {
            const u = new URL(location.href);
            const title = document.title || "(no title)";
            const info = [
                `Title: ${title}`,
                `URL: ${location.href}`,
                `Origin: ${u.origin}`,
                `Protocol: ${u.protocol}`,
                `Host: ${u.host}`,
                `Path: ${u.pathname}`,
                `Search: ${u.search || "(none)"}`,
                `Hash: ${u.hash || "(none)"}`,
                `Referrer: ${document.referrer || "(none)"}`,
                `Language: ${document.documentElement.lang || "(not set)"}`,
                `Charset: ${document.characterSet}`,
                `ReadyState: ${document.readyState}`,
                `Viewport: ${window.innerWidth}x${window.innerHeight}`,
                `Cookies enabled: ${navigator.cookieEnabled}`,
            ].join("\n");
            openPanel("Page Info", info);
        },

        findDuplicateIds() {
            const ids = Array.from(document.querySelectorAll("[id]"))
                .map((el) => el.id)
                .filter(Boolean);

            const map = new Map();
            for (const id of ids) map.set(id, (map.get(id) || 0) + 1);

            const dups = Array.from(map.entries())
                .filter(([, c]) => c > 1)
                .sort((a, b) => b[1] - a[1]);

            if (!dups.length) {
                openPanel("Duplicate IDs", "No duplicate ids found ✅");
                return;
            }

            openPanel("Duplicate IDs", dups.map(([id, count]) => `${id}  →  ${count}`).join("\n"));
        },

        viewAnchorInformation() {
            const anchors = Array.from(document.querySelectorAll("a"))
                .map((a) => ({
                    text: (a.textContent || "").trim().slice(0, 80),
                    href: a.getAttribute("href") || "",
                }))
                .filter((x) => x.href);

            const lines = anchors.slice(0, 400).map((a, i) => {
                const txt = a.text ? ` "${a.text}"` : "";
                return `${i + 1}. ${a.href}${txt}`;
            });

            openPanel("Anchor Information", lines.join("\n") || "No anchors found.");
        },

        viewColorInformation() {
            const els = Array.from(document.querySelectorAll("body *")).slice(0, 2500);
            const colors = new Map();

            for (const el of els) {
                const cs = getComputedStyle(el);
                const c1 = cs.color;
                const c2 = cs.backgroundColor;

                if (c1) colors.set(c1, (colors.get(c1) || 0) + 1);

                if (c2 && c2 !== "rgba(0, 0, 0, 0)" && c2 !== "transparent") {
                    colors.set(c2, (colors.get(c2) || 0) + 1);
                }
            }

            const top = Array.from(colors.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 40)
                .map(([c, n]) => `${c}  →  ${n}`)
                .join("\n");

            openPanel("Color Information (Top)", top || "No colors detected.");
        },

        viewDocumentOutline() {
            const hs = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"));
            const lines = hs.map((h) => {
                const lvl = Number(h.tagName.substring(1));
                const text = (h.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120);
                return `${"  ".repeat(Math.max(0, lvl - 1))}- ${h.tagName.toLowerCase()}: ${text || "(empty)"}`;
            });
            openPanel("Document Outline", lines.join("\n") || "No headings found.");
        },

        viewJavaScript() {
            const scripts = Array.from(document.scripts);
            const external = scripts.filter((s) => s.src).map((s) => s.src);
            const inlineCount = scripts.filter((s) => !s.src && (s.textContent || "").trim()).length;

            const lines = [
                `External scripts: ${external.length}`,
                ...external.slice(0, 200).map((s, i) => `${i + 1}. ${s}`),
                "",
                `Inline scripts (non-empty): ${inlineCount}`,
            ].join("\n");

            openPanel("JavaScript", lines);
        },

        viewLinkInformation() {
            const links = Array.from(document.querySelectorAll("a[href]")).map((a) => a.href || a.getAttribute("href"));
            const uniq = Array.from(new Set(links)).slice(0, 400);
            openPanel("Link Information (unique)", uniq.join("\n") || "No links found.");
        },

        viewMetaTagInformation() {
            const metas = Array.from(document.querySelectorAll("meta")).map((m) => {
                const name =
                    m.getAttribute("name") ||
                    m.getAttribute("property") ||
                    m.getAttribute("http-equiv") ||
                    "(meta)";
                const content = m.getAttribute("content") || "";
                return `${name}: ${content}`;
            });

            openPanel("Meta Tags", metas.join("\n") || "No meta tags found.");
        },

        async viewResponseHeaders() {
            try {
                const res = await fetch(location.href, { method: "HEAD", cache: "no-store" });
                const headers = [];
                res.headers.forEach((v, k) => headers.push(`${k}: ${v}`));
                openPanel("Response Headers (HEAD)", headers.join("\n") || "No headers available.");
            } catch (e) {
                openPanel("Response Headers (HEAD)", `Failed to read headers.\nReason: ${String(e)}`);
            }
        },
    };

    // ---------- PUBLIC API ----------
    window.informationFunctions = {
        apply(name) {
            if (!funcs[name]) return null;
            funcs[name].apply();
            state.applied.add(name);
            return true;
        },
        revert(name) {
            if (!funcs[name]) return null;
            funcs[name].revert();
            state.applied.delete(name);
            return true;
        },
        run(name) {
            if (!oneShots[name]) return null;
            return oneShots[name]();
        },
        revertAll() {
            for (const n of Array.from(state.applied)) {
                try {
                    funcs[n]?.revert();
                } catch { }
            }
            state.applied.clear();

            // also close panel
            const panel = document.getElementById(`${NS}_panel`);
            if (panel) panel.remove();
        },
    };
})();
