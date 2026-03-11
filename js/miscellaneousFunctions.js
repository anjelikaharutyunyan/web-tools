(function () {
    // ----------------------------
    // Page-modifying functions only
    // ----------------------------

    async function displayHiddenElements() {
        const STYLE_ID = "__ext_show_hidden_style";
        const existing = document.getElementById(STYLE_ID);

        if (existing) {
            existing.remove();
            document
                .querySelectorAll(".__ext_was_display_none")
                .forEach((el) => el.classList.remove("__ext_was_display_none"));
            return "Hidden elements display OFF";
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            [hidden] { display: initial !important; visibility: visible !important; opacity: 1 !important; }
            * { visibility: visible !important; }
            .__ext_was_display_none {
                display: initial !important;
                outline: 2px dashed red !important;
                outline-offset: 2px !important;
            }
        `;
        document.head.appendChild(style);

        const all = Array.from(document.querySelectorAll("*"));
        let count = 0;
        for (const el of all) {
            const cs = window.getComputedStyle(el);
            if (cs.display === "none") {
                el.classList.add("__ext_was_display_none");
                count++;
            }
        }
        return `Hidden elements display ON (${count} forced)`;
    }

    async function displayLineGuides() {
        const ID = "__ext_line_guides_overlay";
        const existing = document.getElementById(ID);
        if (existing) {
            existing.remove();
            return "Line guides OFF";
        }

        const overlay = document.createElement("div");
        overlay.id = ID;
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 2147483646;
            pointer-events: none;
            background-image:
                linear-gradient(to right, rgba(0,0,0,0.12) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(0,0,0,0.12) 1px, transparent 1px);
            background-size: 20px 20px;
        `;
        document.documentElement.appendChild(overlay);
        return "Line guides ON";
    }

    async function displayRuler() {
        const WRAP_ID = "__ext_ruler_wrap";
        const existing = document.getElementById(WRAP_ID);
        if (existing) {
            existing.remove();
            return "Ruler OFF";
        }

        const wrap = document.createElement("div");
        wrap.id = WRAP_ID;
        wrap.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            pointer-events: none;
            font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        `;

        const top = document.createElement("div");
        top.style.cssText = `
            position: fixed;
            top: 0;
            left: 18px;
            right: 0;
            height: 18px;
            background: rgba(255,255,255,0.9);
            border-bottom: 1px solid rgba(0,0,0,.15);
        `;

        const left = document.createElement("div");
        left.style.cssText = `
            position: fixed;
            top: 18px;
            left: 0;
            bottom: 0;
            width: 18px;
            background: rgba(255,255,255,0.9);
            border-right: 1px solid rgba(0,0,0,.15);
        `;

        function buildTicks(el, horizontal) {
            const length = horizontal ? window.innerWidth : window.innerHeight;
            const step = 50;
            for (let i = 0; i < length; i += step) {
                const tick = document.createElement("div");
                tick.style.cssText = `
                    position: absolute;
                    ${horizontal
                        ? `left:${i}px; top:0; height:100%; width:1px;`
                        : `top:${i}px; left:0; width:100%; height:1px;`
                    }
                    background: rgba(0,0,0,.25);
                `;
                const label = document.createElement("div");
                label.textContent = i;
                label.style.cssText = `
                    position: absolute;
                    font-size: 10px;
                    color: rgba(0,0,0,.6);
                    ${horizontal
                        ? `left:${i + 2}px; top:2px;`
                        : `top:${i + 2}px; left:2px;`
                    }
                `;
                el.appendChild(tick);
                el.appendChild(label);
            }
        }

        buildTicks(top, true);
        buildTicks(left, false);

        wrap.appendChild(top);
        wrap.appendChild(left);
        document.documentElement.appendChild(wrap);

        return "Ruler ON";
    }

    async function linearizePage() {
        const STYLE_ID = "__ext_linearize_style";
        const existing = document.getElementById(STYLE_ID);

        if (existing) {
            existing.remove();
            return "Linearize OFF";
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            * { 
                float: none !important; 
                position: static !important;
                max-width: 100% !important;
            }
            body {
                margin: 0 auto !important;
                padding: 16px !important;
                width: min(900px, 100%) !important;
                line-height: 1.6 !important;
            }
            nav, aside, footer, header { 
                display: none !important; 
            }
            img, video, iframe {
                height: auto !important;
            }
        `;
        document.head.appendChild(style);
        return "Linearize ON";
    }

    async function makeFramesResizable() {
        const STYLE_ID = "__ext_frames_resizable_style";
        const existing = document.getElementById(STYLE_ID);

        if (existing) {
            existing.remove();
            document.querySelectorAll(".__ext_iframe_handle").forEach((h) => h.remove());
            return "Frames resizable OFF";
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            iframe {
                resize: both !important;
                overflow: auto !important;
                outline: 2px dashed rgba(13,110,253,.8) !important;
                outline-offset: 2px !important;
            }
        `;
        document.head.appendChild(style);

        document.querySelectorAll("iframe").forEach((iframe) => {
            const rect = iframe.getBoundingClientRect();
            const handle = document.createElement("div");
            handle.className = "__ext_iframe_handle";
            handle.style.cssText = `
                position: fixed;
                left: ${Math.max(0, rect.left + rect.width - 14)}px;
                top: ${Math.max(0, rect.top + rect.height - 14)}px;
                width: 12px;
                height: 12px;
                border-radius: 3px;
                background: rgba(13,110,253,.9);
                z-index: 2147483647;
                pointer-events: none;
            `;
            document.documentElement.appendChild(handle);
        });

        return "Frames resizable ON";
    }

    async function markAllLinksUnvisited() {
        const links = Array.from(document.querySelectorAll("a[href]"));
        let changed = 0;
        for (const a of links) {
            try {
                const url = new URL(a.href, location.href);
                url.hash = "";
                url.searchParams.delete("__extv");
                url.searchParams.set("__extu", String(Date.now()));
                a.href = url.toString();
                changed++;
            } catch { }
        }
        return `Tried to "unvisit" links by changing URLs (${changed} links updated).`;
    }

    async function markAllLinksVisited() {
        const links = Array.from(document.querySelectorAll("a[href]"));
        const hrefs = links.map((a) => a.href).filter(Boolean).slice(0, 25);
        let done = 0;

        for (const href of hrefs) {
            try {
                const iframe = document.createElement("iframe");
                iframe.style.cssText =
                    "width:1px;height:1px;opacity:0;position:fixed;left:-9999px;top:-9999px;";
                iframe.src = href;
                document.body.appendChild(iframe);
                done++;
                await new Promise((r) => setTimeout(r, 150));
                iframe.remove();
            } catch { }
        }

        return `Attempted to mark visited by loading up to 25 links in hidden iframes (${done} loaded).`;
    }

    // ----------------------------
    // Public API - only page-modifying functions
    // ----------------------------
    window.miscellaneousFunctions = {
        displayHiddenElements,
        displayLineGuides,
        displayRuler,
        linearizePage,
        makeFramesResizable,
        markAllLinksUnvisited,
        markAllLinksVisited,
    };
})();