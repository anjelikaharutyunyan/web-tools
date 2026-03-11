// js/informationFunctions.js
(() => {
    "use strict";

    // ✅ SINGLETON GUARD: do not re-install if already installed
    if (window.informationFunctions && window.informationFunctions.__installed) return;

    // ✅ PERSISTENT STATE across reinjections (because you inject this file on every click)
    const state = (window.__informationFunctionsState ||= {
        overlays: new Map(),      // name -> overlay element
        styles: new Map(),        // name -> <style>
        markers: new Map(),       // name -> Set(elements) that were modified
        listeners: new Map(),     // name -> {type, handler, options}
        originals: new WeakMap(), // element -> Map(attr->originalValue)
    });

    const OVERLAY_Z = 2147483647;

    // -------------------- HELPERS --------------------
    const noElements = (what) => ({ ok: false, message: `No ${what} found on this page` });
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const cssEscape = (s) => {
        if (window.CSS && CSS.escape) return CSS.escape(String(s));
        return String(s).replace(/[^a-zA-Z0-9_-]/g, (m) => `\\${m}`);
    };

    const ensureMarkerSet = (name) => {
        if (!state.markers.has(name)) state.markers.set(name, new Set());
        return state.markers.get(name);
    };

    const rememberOriginal = (el, attr, value) => {
        let map = state.originals.get(el);
        if (!map) {
            map = new Map();
            state.originals.set(el, map);
        }
        if (!map.has(attr)) map.set(attr, value);
    };

    const restoreOriginal = (el, attr) => {
        const map = state.originals.get(el);
        if (!map) return;
        if (!map.has(attr)) return;
        const value = map.get(attr);
        if (value === null) el.removeAttribute(attr);
        else el.setAttribute(attr, value);
        map.delete(attr);
    };

    const injectStyle = (name, cssText) => {
        removeStyle(name);
        const style = document.createElement("style");
        style.dataset.ifnStyle = name;
        style.textContent = cssText;
        document.documentElement.appendChild(style);
        state.styles.set(name, style);
        return style;
    };

    const removeStyle = (name) => {
        const style = state.styles.get(name);
        if (style && style.parentNode) style.parentNode.removeChild(style);
        state.styles.delete(name);
    };

    const createOverlay = (name, title) => {
        removeOverlay(name);

        const wrap = document.createElement("div");
        wrap.dataset.ifnOverlay = name;
        wrap.style.position = "fixed";
        wrap.style.top = "12px";
        wrap.style.right = "12px";
        wrap.style.maxWidth = "420px";
        wrap.style.maxHeight = "70vh";
        wrap.style.overflow = "auto";
        wrap.style.zIndex = String(OVERLAY_Z);
        wrap.style.background = "rgba(20,20,20,.92)";
        wrap.style.color = "#fff";
        wrap.style.border = "1px solid rgba(255,255,255,.15)";
        wrap.style.borderRadius = "10px";
        wrap.style.boxShadow = "0 10px 30px rgba(0,0,0,.35)";
        wrap.style.font = "12px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Arial";
        wrap.style.padding = "10px";

        const head = document.createElement("div");
        head.style.display = "flex";
        head.style.alignItems = "center";
        head.style.justifyContent = "space-between";
        head.style.gap = "8px";

        const h = document.createElement("div");
        h.textContent = title || name;
        h.style.fontWeight = "700";
        h.style.fontSize = "12.5px";

        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "×";
        close.title = "Close";
        close.style.cursor = "pointer";
        close.style.border = "0";
        close.style.width = "28px";
        close.style.height = "28px";
        close.style.borderRadius = "8px";
        close.style.background = "rgba(255,255,255,.12)";
        close.style.color = "#fff";
        close.style.fontSize = "18px";
        close.addEventListener("click", () => removeOverlay(name));

        head.appendChild(h);
        head.appendChild(close);

        const body = document.createElement("div");
        body.dataset.ifnOverlayBody = "1";
        body.style.marginTop = "10px";
        body.style.whiteSpace = "pre-wrap";
        body.style.wordBreak = "break-word";

        wrap.appendChild(head);
        wrap.appendChild(body);
        document.documentElement.appendChild(wrap);

        state.overlays.set(name, wrap);
        return wrap;
    };

    const removeOverlay = (name) => {
        const el = state.overlays.get(name);
        if (el && el.parentNode) el.parentNode.removeChild(el);
        state.overlays.delete(name);
    };

    const overlayBody = (name) => {
        const el = state.overlays.get(name);
        if (!el) return null;
        return el.querySelector("[data-ifn-overlay-body]");
    };

    const formatBytes = (n) => {
        const num = Number(n) || 0;
        if (num < 1024) return `${num} B`;
        if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
        return `${(num / (1024 * 1024)).toFixed(1)} MB`;
    };

    const safeText = (s) =>
        String(s ?? "").replace(/[&<>"']/g, (m) => {
            switch (m) {
                case "&": return "&amp;";
                case "<": return "&lt;";
                case ">": return "&gt;";
                case '"': return "&quot;";
                case "'": return "&#39;";
                default: return m;
            }
        });

    const docReportShell = (title, bodyHtml) => `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeText(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; margin:18px; color:#111}
  h1{font-size:18px;margin:0 0 12px}
  h2{font-size:14px;margin:18px 0 8px}
  code, pre{background:#f6f7f9; padding:2px 5px; border-radius:6px}
  pre{padding:10px; overflow:auto}
  table{border-collapse:collapse; width:100%; margin:8px 0 16px}
  th,td{border:1px solid #ddd; padding:8px; font-size:12px; text-align:left; vertical-align:top}
  th{background:#fafafa}
  .muted{color:#666}
</style>
</head>
<body>
<h1>${safeText(title)}</h1>
${bodyHtml}
</body>
</html>`;

    const openReportTab = (title, html) => {
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        return { ok: true, message: "Opened", url, title };
    };

    const getCssPath = (el) => {
        if (!(el instanceof Element)) return "";
        const parts = [];
        let node = el;
        while (node && node.nodeType === 1 && parts.length < 6) {
            let part = node.tagName.toLowerCase();
            if (node.id) {
                part += `#${cssEscape(node.id)}`;
                parts.unshift(part);
                break;
            }
            const cls = (node.className && typeof node.className === "string")
                ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2)
                : [];
            if (cls.length) part += "." + cls.map(cssEscape).join(".");
            const parent = node.parentElement;
            if (parent) {
                const sameTag = Array.from(parent.children).filter(c => c.tagName === node.tagName);
                if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
            }
            parts.unshift(part);
            node = node.parentElement;
        }
        return parts.join(" > ");
    };

    const baseBadgeCss = `
    [data-ifn-pos="relative"]{ position:relative !important; }
    .ifn-dim-badge, .ifn-generic-badge{
      position:absolute; left:0; top:0; transform:translate(-2px, -100%);
      background:rgba(0,0,0,.75); color:#fff;
      font:11px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial;
      padding:3px 6px; border-radius:8px; white-space:nowrap;
      z-index:${OVERLAY_Z}; pointer-events:none;
    }
    [data-ifn-elinfo="1"]{ outline:2px dashed rgba(255,255,255,.55) !important; outline-offset:2px !important; }
    [data-ifn-stack="1"]{ outline:2px solid rgba(255,0,160,.65) !important; outline-offset:2px !important; }
  `;

    const ensureRelative = (el, name) => {
        const cs = getComputedStyle(el);
        if (cs.position === "static") {
            rememberOriginal(el, "data-ifn-pos", el.getAttribute("data-ifn-pos"));
            el.setAttribute("data-ifn-pos", "relative");
            ensureMarkerSet(name).add(el);
        }
    };

    // small helper to cleanup badges+pos for a toggle feature
    const cleanupBadgesAndPos = (name, extraCleanupFn) => {
        qsa(`[data-ifn="${name}"]`).forEach((b) => b.remove());
        if (typeof extraCleanupFn === "function") extraCleanupFn();
        const set = state.markers.get(name);
        if (set) {
            set.forEach((el) => restoreOriginal(el, "data-ifn-pos"));
            set.clear();
        }
    };

    // -------------------- DISPLAY (TOGGLE) FUNCTIONS --------------------

    function displayAbbreviations_apply() {
        const name = "displayAbbreviations";
        const abbrs = qsa("abbr");
        if (abbrs.length === 0) return noElements("<abbr> tags");

        injectStyle(name, baseBadgeCss + `abbr{ outline:2px solid rgba(0,160,255,.9) !important; outline-offset:2px !important; }`);

        abbrs.forEach((el) => {
            ensureRelative(el, name);
            const title = el.getAttribute("title");
            if (!title) return;
            const badge = document.createElement("span");
            badge.className = "ifn-generic-badge";
            badge.dataset.ifn = name;
            badge.textContent = `abbr: ${title}`;
            el.appendChild(badge);
            ensureMarkerSet(name).add(el);
        });

        const annotated = qsa(`[data-ifn="${name}"]`).length;
        if (annotated === 0) {
            displayAbbreviations_revert();
            return noElements("<abbr title> with expansions");
        }
        return { ok: true, message: `Annotated ${annotated} abbreviations` };
    }
    function displayAbbreviations_revert() { removeStyle("displayAbbreviations"); cleanupBadgesAndPos("displayAbbreviations"); return { ok: true, message: "Reverted" }; }

    function displayAccessKeys_apply() {
        const name = "displayAccessKeys";
        const els = qsa("[accesskey]");
        if (els.length === 0) return noElements("accesskey attributes");

        injectStyle(name, baseBadgeCss + `[accesskey]{ outline:2px solid rgba(0,200,140,.95) !important; outline-offset:2px !important; }`);
        els.forEach((el) => {
            ensureRelative(el, name);
            const badge = document.createElement("span");
            badge.className = "ifn-generic-badge";
            badge.dataset.ifn = name;
            badge.textContent = `accesskey: ${el.getAttribute("accesskey")}`;
            el.appendChild(badge);
            ensureMarkerSet(name).add(el);
        });
        return { ok: true, message: `Annotated ${els.length} elements` };
    }
    function displayAccessKeys_revert() { removeStyle("displayAccessKeys"); cleanupBadgesAndPos("displayAccessKeys"); return { ok: true, message: "Reverted" }; }

    function displayAnchors_apply() {
        const name = "displayAnchors";
        const links = qsa("a[href]");
        if (links.length === 0) return noElements("links");

        injectStyle(name, baseBadgeCss + `a[href]{ outline:2px solid rgba(255,200,0,.95) !important; outline-offset:2px !important; }`);
        links.forEach((a) => {
            ensureRelative(a, name);
            const href = a.getAttribute("href") || "";
            const badge = document.createElement("span");
            badge.className = "ifn-generic-badge";
            badge.dataset.ifn = name;
            badge.textContent = href.length > 50 ? href.slice(0, 47) + "…" : href;
            a.appendChild(badge);
            ensureMarkerSet(name).add(a);
        });
        return { ok: true, message: `Annotated ${links.length} links` };
    }
    function displayAnchors_revert() { removeStyle("displayAnchors"); cleanupBadgesAndPos("displayAnchors"); return { ok: true, message: "Reverted" }; }

    function displayAriaRoles_apply() {
        const name = "displayAriaRoles";
        const els = qsa("[role], [aria-label], [aria-labelledby]");
        if (els.length === 0) return noElements("ARIA roles/labels");

        injectStyle(name, baseBadgeCss + `[role], [aria-label], [aria-labelledby]{ outline:2px solid rgba(170,80,255,.9) !important; outline-offset:2px !important; }`);
        els.forEach((el) => {
            ensureRelative(el, name);
            const bits = [];
            const role = el.getAttribute("role");
            const ariaLabel = el.getAttribute("aria-label");
            const ariaLabelledby = el.getAttribute("aria-labelledby");
            if (role) bits.push(`role=${role}`);
            if (ariaLabel) bits.push(`aria-label="${ariaLabel}"`);
            if (ariaLabelledby) bits.push(`aria-labelledby=${ariaLabelledby}`);
            const badge = document.createElement("span");
            badge.className = "ifn-generic-badge";
            badge.dataset.ifn = name;
            badge.textContent = bits.join(" | ");
            el.appendChild(badge);
            ensureMarkerSet(name).add(el);
        });
        return { ok: true, message: `Annotated ${els.length} ARIA elements` };
    }
    function displayAriaRoles_revert() { removeStyle("displayAriaRoles"); cleanupBadgesAndPos("displayAriaRoles"); return { ok: true, message: "Reverted" }; }

    function displayDivDimensions_apply() {
        const name = "displayDivDimensions";
        const divs = qsa("div");
        if (divs.length === 0) return noElements("<div> elements");

        injectStyle(name, baseBadgeCss + `div{ outline:1px dashed rgba(255,120,120,.55) !important; outline-offset:1px !important; }`);
        let annotated = 0;
        divs.forEach((div) => {
            const rect = div.getBoundingClientRect();
            if (rect.width < 20 && rect.height < 20) return;
            ensureRelative(div, name);
            const badge = document.createElement("span");
            badge.className = "ifn-dim-badge";
            badge.dataset.ifn = name;
            badge.textContent = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
            div.appendChild(badge);
            ensureMarkerSet(name).add(div);
            annotated++;
        });
        if (annotated === 0) { displayDivDimensions_revert(); return noElements("suitable divs to annotate"); }
        return { ok: true, message: `Annotated ${annotated} divs` };
    }
    function displayDivDimensions_revert() { removeStyle("displayDivDimensions"); cleanupBadgesAndPos("displayDivDimensions"); return { ok: true, message: "Reverted" }; }

    function displayDivOrder_apply() {
        const name = "displayDivOrder";
        const divs = qsa("div");
        if (divs.length === 0) return noElements("<div> elements");

        injectStyle(name, baseBadgeCss + `div{ outline:1px solid rgba(0,180,255,.35) !important; outline-offset:1px !important; }`);
        let i = 1, annotated = 0;
        divs.forEach((div) => {
            const rect = div.getBoundingClientRect();
            if (rect.width < 30 && rect.height < 18) return;
            ensureRelative(div, name);
            const badge = document.createElement("span");
            badge.className = "ifn-generic-badge";
            badge.dataset.ifn = name;
            badge.textContent = `#${i++}`;
            div.appendChild(badge);
            ensureMarkerSet(name).add(div);
            annotated++;
        });
        if (annotated === 0) { displayDivOrder_revert(); return noElements("suitable divs to number"); }
        return { ok: true, message: `Numbered ${annotated} divs` };
    }
    function displayDivOrder_revert() { removeStyle("displayDivOrder"); cleanupBadgesAndPos("displayDivOrder"); return { ok: true, message: "Reverted" }; }

    // ✅ MOST IMPORTANT FIX: listener must be removable even after reinjection -> persistent state
    function displayElementInformation_apply() {
        const name = "displayElementInformation";

        // prevent duplicate activation
        if (state.listeners.has(name)) return { ok: true, message: "Already active" };

        injectStyle(name, baseBadgeCss);

        const handler = (e) => {
            const el = e.target instanceof Element ? e.target : null;
            if (!el) return;
            if (el.closest(`[data-ifn-overlay="${name}"]`)) return;

            const rect = el.getBoundingClientRect();
            const cs = getComputedStyle(el);

            const info = [
                `Tag: ${el.tagName.toLowerCase()}`,
                el.id ? `#${el.id}` : null,
                el.className ? `.${String(el.className).trim().split(/\s+/).filter(Boolean).slice(0, 6).join(".")}` : null,
                `Size: ${Math.round(rect.width)}×${Math.round(rect.height)}`,
                `Position: ${cs.position}`,
                `Display: ${cs.display}`,
                `Z-index: ${cs.zIndex}`,
                `Path: ${getCssPath(el)}`,
            ].filter(Boolean).join("\n");

            qsa(`[data-ifn-elinfo="1"]`).forEach((x) => x.removeAttribute("data-ifn-elinfo"));
            el.setAttribute("data-ifn-elinfo", "1");

            if (!state.overlays.get(name)) createOverlay(name, "Element information (hover)");
            const body = overlayBody(name);
            if (body) body.textContent = info;
        };

        document.addEventListener("mousemove", handler, true);
        state.listeners.set(name, { type: "mousemove", handler, options: true });
        createOverlay(name, "Element information (hover)");

        return { ok: true, message: "Hover page to inspect elements" };
    }

    function displayElementInformation_revert() {
        const name = "displayElementInformation";

        const l = state.listeners.get(name);
        if (l) {
            document.removeEventListener(l.type, l.handler, l.options);
            state.listeners.delete(name);
        }

        removeOverlay(name);
        removeStyle(name);
        qsa(`[data-ifn-elinfo="1"]`).forEach((x) => x.removeAttribute("data-ifn-elinfo"));

        // restore any pos attrs we may have used (rare here)
        const set = state.markers.get(name);
        if (set) {
            set.forEach((el) => restoreOriginal(el, "data-ifn-pos"));
            set.clear();
        }

        return { ok: true, message: "Reverted" };
    }

    function displayIdClassDetails_apply() {
        const name = "displayIdClassDetails";
        const els = qsa("[id], [class]");
        if (els.length === 0) return noElements("elements with id/class");

        injectStyle(name, baseBadgeCss + `[id], [class]{ outline:2px solid rgba(255,140,0,.75) !important; outline-offset:2px !important; }`);
        let annotated = 0;
        els.forEach((el) => {
            const id = el.id ? `#${el.id}` : "";
            const cls = (el.className && typeof el.className === "string")
                ? "." + el.className.trim().split(/\s+/).filter(Boolean).slice(0, 6).join(".")
                : "";
            if (!id && !cls) return;
            ensureRelative(el, name);
            const badge = document.createElement("span");
            badge.className = "ifn-generic-badge";
            badge.dataset.ifn = name;
            badge.textContent = `${id}${id && cls ? " " : ""}${cls}`;
            el.appendChild(badge);
            ensureMarkerSet(name).add(el);
            annotated++;
        });
        if (annotated === 0) { displayIdClassDetails_revert(); return noElements("elements with visible id/class info"); }
        return { ok: true, message: `Annotated ${annotated} elements` };
    }
    function displayIdClassDetails_revert() { removeStyle("displayIdClassDetails"); cleanupBadgesAndPos("displayIdClassDetails"); return { ok: true, message: "Reverted" }; }

    function displayLinkDetails_apply() {
        const name = "displayLinkDetails";
        const links = qsa("a[href]");
        if (links.length === 0) return noElements("links");

        injectStyle(name, baseBadgeCss + `a[href]{ outline:2px solid rgba(0,220,120,.8) !important; outline-offset:2px !important; }`);
        links.forEach((a) => {
            ensureRelative(a, name);
            const href = a.getAttribute("href") || "";
            let kind = "link";
            if (href.startsWith("#")) kind = "anchor";
            else if (href.startsWith("mailto:")) kind = "mailto";
            else if (href.startsWith("tel:")) kind = "tel";
            const target = a.getAttribute("target");
            const rel = a.getAttribute("rel");
            const badge = document.createElement("span");
            badge.className = "ifn-generic-badge";
            badge.dataset.ifn = name;
            badge.textContent = `${kind}${target ? ` | target=${target}` : ""}${rel ? ` | rel=${rel}` : ""}`;
            a.appendChild(badge);
            ensureMarkerSet(name).add(a);
        });
        return { ok: true, message: `Annotated ${links.length} links` };
    }
    function displayLinkDetails_revert() { removeStyle("displayLinkDetails"); cleanupBadgesAndPos("displayLinkDetails"); return { ok: true, message: "Reverted" }; }

    function displayObjectInformation_apply() {
        const name = "displayObjectInformation";
        const els = qsa("iframe, object, embed, video, audio, canvas");
        if (els.length === 0) return noElements("iframes/objects/media");

        injectStyle(name, baseBadgeCss + `iframe, object, embed, video, audio, canvas{ outline:2px solid rgba(80,200,255,.85) !important; outline-offset:2px !important; }`);
        els.forEach((el) => {
            ensureRelative(el, name);
            const tag = el.tagName.toLowerCase();
            let txt = tag;
            if (tag === "iframe") txt += ` src=${(el.getAttribute("src") || "").slice(0, 40)}`;
            if (tag === "video" || tag === "audio") txt += ` src=${(el.getAttribute("src") || "").slice(0, 40)}`;
            if (tag === "object") txt += ` data=${(el.getAttribute("data") || "").slice(0, 40)}`;
            if (tag === "embed") txt += ` src=${(el.getAttribute("src") || "").slice(0, 40)}`;
            const badge = document.createElement("span");
            badge.className = "ifn-generic-badge";
            badge.dataset.ifn = name;
            badge.textContent = txt;
            el.appendChild(badge);
            ensureMarkerSet(name).add(el);
        });
        return { ok: true, message: `Annotated ${els.length} objects/media` };
    }
    function displayObjectInformation_revert() { removeStyle("displayObjectInformation"); cleanupBadgesAndPos("displayObjectInformation"); return { ok: true, message: "Reverted" }; }

    function displayStackLevels_apply() {
        const name = "displayStackLevels";
        const candidates = qsa("*").filter((el) => {
            const cs = getComputedStyle(el);
            return cs.position !== "static" && cs.zIndex !== "auto";
        });
        if (candidates.length === 0) return noElements("stacked elements with z-index");

        injectStyle(name, baseBadgeCss);
        const limited = candidates.slice(0, 800);
        limited.forEach((el) => {
            const cs = getComputedStyle(el);
            ensureRelative(el, name);
            el.setAttribute("data-ifn-stack", "1");
            ensureMarkerSet(name).add(el);
            const badge = document.createElement("span");
            badge.className = "ifn-generic-badge";
            badge.dataset.ifn = name;
            badge.textContent = `z=${cs.zIndex} | ${cs.position}`;
            el.appendChild(badge);
        });
        return { ok: true, message: `Annotated ${limited.length} stacked elements` };
    }
    function displayStackLevels_revert() {
        const name = "displayStackLevels";
        removeStyle(name);
        cleanupBadgesAndPos(name, () => qsa(`[data-ifn-stack="1"]`).forEach((el) => el.removeAttribute("data-ifn-stack")));
        return { ok: true, message: "Reverted" };
    }

    function displayTabIndex_apply() {
        const name = "displayTabIndex";
        const els = qsa("[tabindex]");
        if (els.length === 0) return noElements("tabindex attributes");

        injectStyle(name, baseBadgeCss + `[tabindex]{ outline:2px solid rgba(120,200,0,.85) !important; outline-offset:2px !important; }`);
        els.forEach((el) => {
            ensureRelative(el, name);
            const badge = document.createElement("span");
            badge.className = "ifn-generic-badge";
            badge.dataset.ifn = name;
            badge.textContent = `tabindex=${el.getAttribute("tabindex")}`;
            el.appendChild(badge);
            ensureMarkerSet(name).add(el);
        });
        return { ok: true, message: `Annotated ${els.length} elements` };
    }
    function displayTabIndex_revert() { removeStyle("displayTabIndex"); cleanupBadgesAndPos("displayTabIndex"); return { ok: true, message: "Reverted" }; }

    function displayTableDepth_apply() {
        const name = "displayTableDepth";
        const tables = qsa("table");
        if (tables.length === 0) return noElements("tables");

        injectStyle(name, baseBadgeCss + `table{ outline:2px solid rgba(0,140,255,.55) !important; outline-offset:2px !important; }`);
        tables.forEach((t) => {
            let depth = 0;
            let p = t.parentElement;
            while (p) { if (p.tagName && p.tagName.toLowerCase() === "table") depth++; p = p.parentElement; }
            ensureRelative(t, name);
            const badge = document.createElement("span");
            badge.className = "ifn-generic-badge";
            badge.dataset.ifn = name;
            badge.textContent = `table depth: ${depth}`;
            t.appendChild(badge);
            ensureMarkerSet(name).add(t);
        });
        return { ok: true, message: `Annotated ${tables.length} tables` };
    }
    function displayTableDepth_revert() { removeStyle("displayTableDepth"); cleanupBadgesAndPos("displayTableDepth"); return { ok: true, message: "Reverted" }; }

    function displayTableInformation_apply() {
        const name = "displayTableInformation";
        const tables = qsa("table");
        if (tables.length === 0) return noElements("tables");

        injectStyle(name, baseBadgeCss + `table{ outline:2px dashed rgba(255,120,0,.65) !important; outline-offset:2px !important; }`);
        tables.forEach((t) => {
            const rows = t.rows ? t.rows.length : qsa("tr", t).length;
            const cols = t.rows && t.rows[0] ? t.rows[0].cells.length : 0;
            ensureRelative(t, name);
            const badge = document.createElement("span");
            badge.className = "ifn-generic-badge";
            badge.dataset.ifn = name;
            badge.textContent = `rows: ${rows}, cols: ${cols}`;
            t.appendChild(badge);
            ensureMarkerSet(name).add(t);
        });
        return { ok: true, message: `Annotated ${tables.length} tables` };
    }
    function displayTableInformation_revert() { removeStyle("displayTableInformation"); cleanupBadgesAndPos("displayTableInformation"); return { ok: true, message: "Reverted" }; }

    function displayTitleAttributes_apply() {
        const name = "displayTitleAttributes";
        const els = qsa("[title]");
        if (els.length === 0) return noElements("title attributes");

        injectStyle(name, baseBadgeCss + `[title]{ outline:2px solid rgba(255,0,0,.6) !important; outline-offset:2px !important; }`);
        els.forEach((el) => {
            ensureRelative(el, name);
            const title = el.getAttribute("title") || "";
            const badge = document.createElement("span");
            badge.className = "ifn-generic-badge";
            badge.dataset.ifn = name;
            badge.textContent = `title: ${title.length > 40 ? title.slice(0, 37) + "…" : title}`;
            el.appendChild(badge);
            ensureMarkerSet(name).add(el);
        });
        return { ok: true, message: `Annotated ${els.length} elements` };
    }
    function displayTitleAttributes_revert() { removeStyle("displayTitleAttributes"); cleanupBadgesAndPos("displayTitleAttributes"); return { ok: true, message: "Reverted" }; }

    function displayTopographicInformation_apply() {
        const name = "displayTopographicInformation";
        const els = qsa("header, nav, main, footer, aside, section, article, h1,h2,h3,h4,h5,h6");
        if (els.length === 0) return noElements("landmarks/headings");

        injectStyle(name, baseBadgeCss + `
      header, nav, main, footer, aside, section, article{ outline:2px solid rgba(0,180,255,.35) !important; outline-offset:2px !important; }
      h1,h2,h3,h4,h5,h6{ outline:2px solid rgba(255,200,0,.55) !important; outline-offset:2px !important; }
    `);

        els.forEach((el) => {
            ensureRelative(el, name);
            const tag = el.tagName.toLowerCase();
            const label = tag.startsWith("h") ? tag.toUpperCase() : tag;
            const badge = document.createElement("span");
            badge.className = "ifn-generic-badge";
            badge.dataset.ifn = name;

            let extra = "";
            if (tag.startsWith("h")) {
                const t = (el.textContent || "").trim();
                extra = t ? `: ${t.slice(0, 30)}${t.length > 30 ? "…" : ""}` : "";
            } else {
                const aria = el.getAttribute("aria-label");
                if (aria) extra = `: ${aria}`;
            }

            badge.textContent = `${label}${extra}`;
            el.appendChild(badge);
            ensureMarkerSet(name).add(el);
        });

        return { ok: true, message: `Annotated ${els.length} landmarks/headings` };
    }
    function displayTopographicInformation_revert() { removeStyle("displayTopographicInformation"); cleanupBadgesAndPos("displayTopographicInformation"); return { ok: true, message: "Reverted" }; }

    // -------------------- ONE-SHOT (RUN) FUNCTIONS --------------------

    function pageInfo_run() {
        const title = document.title || "(no title)";
        const url = location.href;
        const charset = document.characterSet || "";
        const lang = document.documentElement.getAttribute("lang") || "";
        const referrer = document.referrer || "";
        const ready = document.readyState;
        const links = qsa("a[href]").length;
        const imgs = qsa("img").length;
        const scripts = qsa("script").length;
        const styles = qsa('link[rel="stylesheet"], style').length;

        const body = `
<p class="muted">Basic document info</p>
<table>
  <tr><th>Title</th><td>${safeText(title)}</td></tr>
  <tr><th>URL</th><td><code>${safeText(url)}</code></td></tr>
  <tr><th>Charset</th><td>${safeText(charset)}</td></tr>
  <tr><th>Lang</th><td>${safeText(lang || "(not set)")}</td></tr>
  <tr><th>ReadyState</th><td>${safeText(ready)}</td></tr>
  <tr><th>Referrer</th><td>${safeText(referrer || "(none)")}</td></tr>
</table>

<h2>Counts</h2>
<table>
  <tr><th>Links</th><td>${links}</td></tr>
  <tr><th>Images</th><td>${imgs}</td></tr>
  <tr><th>Scripts</th><td>${scripts}</td></tr>
  <tr><th>Stylesheets/Style tags</th><td>${styles}</td></tr>
</table>
`;
        return openReportTab("Page info", docReportShell("Page info", body));
    }

    function findDuplicateIds_run() {
        const all = qsa("[id]");
        if (all.length === 0) return noElements("id attributes");

        const map = new Map();
        all.forEach((el) => {
            const id = el.id;
            if (!id) return;
            if (!map.has(id)) map.set(id, []);
            map.get(id).push(el);
        });

        const dups = Array.from(map.entries()).filter(([, arr]) => arr.length > 1);
        if (dups.length === 0) return { ok: false, message: "No duplicate ids found" };

        const rows = dups.map(([id, arr]) => {
            const items = arr.slice(0, 20).map((el) => `<li><code>${safeText(getCssPath(el))}</code></li>`).join("");
            return `<h2>#${safeText(id)} <span class="muted">(${arr.length})</span></h2><ul>${items}</ul>`;
        }).join("");

        return openReportTab("Duplicate IDs", docReportShell("Duplicate IDs", `<p class="muted">Duplicate IDs found: ${dups.length}</p>${rows}`));
    }

    function viewAnchorInformation_run() {
        const anchors = qsa("a[href]");
        if (anchors.length === 0) return noElements("anchors");

        const rows = anchors.slice(0, 2000).map((a, i) => {
            const href = a.getAttribute("href") || "";
            const text = (a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
            const path = getCssPath(a);
            return `<tr><td>${i + 1}</td><td><code>${safeText(href)}</code></td><td>${safeText(text)}</td><td><code>${safeText(path)}</code></td></tr>`;
        }).join("");

        return openReportTab("Anchor information", docReportShell("Anchor information", `
<p class="muted">Showing up to 2000 anchors.</p>
<table><tr><th>#</th><th>href</th><th>text</th><th>selector</th></tr>${rows}</table>`));
    }

    function viewColorInformation_run() {
        const els = qsa("*").slice(0, 4000);
        if (els.length === 0) return noElements("elements");

        const colors = new Map();
        const add = (c) => { if (!c || c === "transparent") return; colors.set(c, (colors.get(c) || 0) + 1); };
        els.forEach((el) => {
            const cs = getComputedStyle(el);
            add(cs.color); add(cs.backgroundColor); add(cs.borderTopColor);
        });

        const sorted = Array.from(colors.entries()).sort((a, b) => b[1] - a[1]).slice(0, 200);
        if (sorted.length === 0) return { ok: false, message: "No colors collected" };

        const rows = sorted.map(([c, n]) =>
            `<tr><td><div style="width:22px;height:22px;border:1px solid #ddd;background:${safeText(c)}"></div></td><td><code>${safeText(c)}</code></td><td>${n}</td></tr>`
        ).join("");

        return openReportTab("Color information", docReportShell("Color information", `
<p class="muted">Approximate color usage (computed styles). Showing top 200.</p>
<table><tr><th></th><th>Color</th><th>Count</th></tr>${rows}</table>`));
    }

    function viewDocumentOutline_run() {
        const heads = qsa("h1,h2,h3,h4,h5,h6");
        if (heads.length === 0) return noElements("headings (h1-h6)");

        const items = heads.map((h) => {
            const lvl = Number(h.tagName.slice(1));
            const text = (h.textContent || "").trim().replace(/\s+/g, " ");
            const path = getCssPath(h);
            return `<tr><td>H${lvl}</td><td>${safeText(text)}</td><td><code>${safeText(path)}</code></td></tr>`;
        }).join("");

        return openReportTab("Document outline", docReportShell("Document outline", `
<p class="muted">Heading-based outline.</p>
<table><tr><th>Level</th><th>Text</th><th>Selector</th></tr>${items}</table>`));
    }

    function viewJavaScript_run() {
        const scripts = qsa("script");
        if (scripts.length === 0) return noElements("script tags");

        const external = [];
        const inlineLens = [];
        scripts.forEach((s) => {
            const src = s.getAttribute("src");
            if (src) external.push(src);
            else inlineLens.push((s.textContent || "").length);
        });

        if (external.length === 0 && inlineLens.length === 0) return noElements("scripts");

        const extRows = external.map((u, i) => `<tr><td>${i + 1}</td><td><code>${safeText(u)}</code></td></tr>`).join("");
        const inlineTotal = inlineLens.reduce((a, b) => a + b, 0);

        return openReportTab("JavaScript", docReportShell("JavaScript", `
<h2>External scripts (${external.length})</h2>
<table><tr><th>#</th><th>src</th></tr>${extRows || `<tr><td colspan="2">No external scripts</td></tr>`}</table>
<h2>Inline scripts</h2>
<table><tr><th>Count</th><th>Total size</th></tr><tr><td>${inlineLens.length}</td><td>${safeText(formatBytes(inlineTotal))}</td></tr></table>`));
    }

    function viewLinkInformation_run() {
        const links = qsa("a[href], link[href]");
        if (links.length === 0) return noElements("link elements");

        const rows = links.slice(0, 2500).map((el, i) => {
            const tag = el.tagName.toLowerCase();
            const href = el.getAttribute("href") || "";
            const rel = el.getAttribute("rel") || "";
            const path = getCssPath(el);
            return `<tr><td>${i + 1}</td><td>${safeText(tag)}</td><td><code>${safeText(href)}</code></td><td>${safeText(rel)}</td><td><code>${safeText(path)}</code></td></tr>`;
        }).join("");

        return openReportTab("Link information", docReportShell("Link information", `
<p class="muted">Showing up to 2500 link-like elements.</p>
<table><tr><th>#</th><th>tag</th><th>href</th><th>rel</th><th>selector</th></tr>${rows}</table>`));
    }

    function viewMetaTagInformation_run() {
        const metas = qsa("meta");
        if (metas.length === 0) return noElements("meta tags");

        const rows = metas.map((m, i) => {
            const name = m.getAttribute("name") || "";
            const prop = m.getAttribute("property") || "";
            const httpEquiv = m.getAttribute("http-equiv") || "";
            const content = m.getAttribute("content") || "";
            return `<tr><td>${i + 1}</td><td>${safeText(name)}</td><td>${safeText(prop)}</td><td>${safeText(httpEquiv)}</td><td>${safeText(content)}</td></tr>`;
        }).join("");

        return openReportTab("Meta tags", docReportShell("Meta tags", `
<table><tr><th>#</th><th>name</th><th>property</th><th>http-equiv</th><th>content</th></tr>${rows}</table>`));
    }

    async function viewResponseHeaders_run() {
        try {
            const res = await fetch(location.href, { method: "GET", cache: "no-store" });
            const entries = [];
            res.headers.forEach((v, k) => entries.push([k, v]));
            entries.sort((a, b) => a[0].localeCompare(b[0]));
            if (entries.length === 0) return { ok: false, message: "No headers returned" };

            const rows = entries.map(([k, v]) => `<tr><td>${safeText(k)}</td><td>${safeText(v)}</td></tr>`).join("");
            return openReportTab("Response headers", docReportShell("Response headers", `
<p class="muted">Fetched headers from <code>${safeText(location.href)}</code></p>
<table><tr><th>Header</th><th>Value</th></tr>${rows}</table>`));
        } catch (e) {
            return { ok: false, message: `Cannot read response headers (CORS/blocked): ${String(e?.message || e)}` };
        }
    }

    function viewTopographicInformation_run() {
        const landmarks = qsa("header, nav, main, footer, aside, section, article");
        if (landmarks.length === 0) return noElements("landmarks/sections");

        const rows = landmarks.map((el, i) => {
            const tag = el.tagName.toLowerCase();
            const aria = el.getAttribute("aria-label") || "";
            const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
            const path = getCssPath(el);
            return `<tr><td>${i + 1}</td><td>${safeText(tag)}</td><td>${safeText(aria)}</td><td>${safeText(text)}${text.length >= 80 ? "…" : ""}</td><td><code>${safeText(path)}</code></td></tr>`;
        }).join("");

        return openReportTab("Topographic information", docReportShell("Topographic information", `
<p class="muted">Landmarks/sections snapshot.</p>
<table><tr><th>#</th><th>tag</th><th>aria-label</th><th>text preview</th><th>selector</th></tr>${rows}</table>`));
    }

    // -------------------- ROUTER --------------------
    const displayHandlers = {
        displayAbbreviations: { apply: displayAbbreviations_apply, revert: displayAbbreviations_revert },
        displayAccessKeys: { apply: displayAccessKeys_apply, revert: displayAccessKeys_revert },
        displayAnchors: { apply: displayAnchors_apply, revert: displayAnchors_revert },
        displayAriaRoles: { apply: displayAriaRoles_apply, revert: displayAriaRoles_revert },
        displayDivDimensions: { apply: displayDivDimensions_apply, revert: displayDivDimensions_revert },
        displayDivOrder: { apply: displayDivOrder_apply, revert: displayDivOrder_revert },
        displayElementInformation: { apply: displayElementInformation_apply, revert: displayElementInformation_revert },
        displayIdClassDetails: { apply: displayIdClassDetails_apply, revert: displayIdClassDetails_revert },
        displayLinkDetails: { apply: displayLinkDetails_apply, revert: displayLinkDetails_revert },
        displayObjectInformation: { apply: displayObjectInformation_apply, revert: displayObjectInformation_revert },
        displayStackLevels: { apply: displayStackLevels_apply, revert: displayStackLevels_revert },
        displayTabIndex: { apply: displayTabIndex_apply, revert: displayTabIndex_revert },
        displayTableDepth: { apply: displayTableDepth_apply, revert: displayTableDepth_revert },
        displayTableInformation: { apply: displayTableInformation_apply, revert: displayTableInformation_revert },
        displayTitleAttributes: { apply: displayTitleAttributes_apply, revert: displayTitleAttributes_revert },
        displayTopographicInformation: { apply: displayTopographicInformation_apply, revert: displayTopographicInformation_apply ? displayTopographicInformation_revert : displayTopographicInformation_revert },
    };

    const runHandlers = {
        pageInfo: pageInfo_run,
        findDuplicateIds: findDuplicateIds_run,
        viewAnchorInformation: viewAnchorInformation_run,
        viewColorInformation: viewColorInformation_run,
        viewDocumentOutline: viewDocumentOutline_run,
        viewJavaScript: viewJavaScript_run,
        viewLinkInformation: viewLinkInformation_run,
        viewMetaTagInformation: viewMetaTagInformation_run,
        viewResponseHeaders: viewResponseHeaders_run,
        viewTopographicInformation: viewTopographicInformation_run,
    };

    // -------------------- PUBLIC API --------------------
    async function apply(name) {
        const h = displayHandlers[name];
        if (!h) return { ok: false, message: `Unknown display function: ${name}` };
        try {
            const out = h.apply();
            return out ?? { ok: true, message: "Applied" };
        } catch (e) {
            return { ok: false, message: String(e?.message || e) };
        }
    }

    async function revert(name) {
        const h = displayHandlers[name];
        if (!h) return { ok: false, message: `Unknown display function: ${name}` };
        try {
            const out = h.revert();
            return out ?? { ok: true, message: "Reverted" };
        } catch (e) {
            return { ok: false, message: String(e?.message || e) };
        }
    }

    async function run(name) {
        const h = runHandlers[name];
        if (!h) return { ok: false, message: `Unknown view function: ${name}` };
        try {
            const out = await h();
            return out ?? { ok: true, message: "Opened" };
        } catch (e) {
            return { ok: false, message: String(e?.message || e) };
        }
    }

    window.informationFunctions = { apply, revert, run, __installed: true };
})();
