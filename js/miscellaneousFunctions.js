// js/miscellaneousFunctions.js (FULL corrected)
(function () {
    // ----------------------------
    // Helpers
    // ----------------------------
    async function getActiveTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error("No active tab");
        return tab;
    }

    async function execInTab(fn, args = []) {
        const tab = await getActiveTab();
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: fn,
            args,
        });
        return result;
    }

    function normalizeText(text) {
        return String(text || "").trim().toLowerCase();
    }

    // ----------------------------
    // Feature implementations
    // ----------------------------
    async function clearCache() {
        const since = 0;
        await chrome.browsingData.removeCache({ since });
        return "Cache cleared";
    }

    // Shows confirm UI only (real delete happens on confirm button click)
    async function clearHistory() {
        const box = document.getElementById("clearHistoryConfirm");
        if (!box) throw new Error("Clear history confirm UI not found");
        box.classList.remove("d-none");
        return "__NO_TOAST__";
    }

    // ✅ Real delete history (requires "history" permission in manifest)
    async function confirmClearHistory() {
        await chrome.history.deleteAll();
        document.getElementById("clearHistoryConfirm")?.classList.add("d-none");
        return "History cleared";
    }

    async function displayColorPicker() {
        const container = document.getElementById("tabContent");
        if (!container) throw new Error('Popup container "#tabContent" not found');

        // toggle
        const old = document.getElementById("__popup_color_picker_wrap");
        if (old) {
            old.remove();
            return "Color picker closed";
        }

        const wrap = document.createElement("div");
        wrap.id = "__popup_color_picker_wrap";
        wrap.style.cssText = `
      margin-top: 10px;
      background: #fff;
      border: 1px solid rgba(0,0,0,.15);
      border-radius: 12px;
      padding: 10px 12px;
      box-shadow: 0 6px 18px rgba(0,0,0,.12);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    `;

        const header = document.createElement("div");
        header.style.cssText = `
      display:flex;
      align-items:center;
      justify-content:space-between;
      margin-bottom: 8px;
    `;

        const title = document.createElement("div");
        title.textContent = "Color Picker";
        title.style.cssText = "font-weight:600; font-size:14px;";

        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "✕";
        close.style.cssText = `
      border:none;
      background:transparent;
      cursor:pointer;
      font-size:14px;
      opacity:.75;
    `;
        close.onmouseenter = () => (close.style.opacity = "1");
        close.onmouseleave = () => (close.style.opacity = ".75");
        close.onclick = () => wrap.remove();

        header.appendChild(title);
        header.appendChild(close);

        const row = document.createElement("div");
        row.style.cssText = "display:flex; align-items:center; gap:10px;";

        const input = document.createElement("input");
        input.type = "color";
        input.value = "#0d6efd";
        input.style.cssText =
            "width:42px; height:32px; border:none; background:transparent; padding:0;";

        const code = document.createElement("input");
        code.type = "text";
        code.value = input.value;
        code.readOnly = true;
        code.style.cssText = `
      flex:1;
      padding:6px 8px;
      border:1px solid rgba(0,0,0,.15);
      border-radius:10px;
      font-size:13px;
    `;

        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.textContent = "Copy";
        copyBtn.style.cssText = `
      border: 1px solid rgba(0,0,0,.15);
      background: #f7f7f7;
      padding: 6px 10px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 12px;
    `;
        copyBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(code.value);
                copyBtn.textContent = "Copied ✓";
                setTimeout(() => (copyBtn.textContent = "Copy"), 900);
            } catch {
                copyBtn.textContent = "Failed";
                setTimeout(() => (copyBtn.textContent = "Copy"), 900);
            }
        };

        const swatch = document.createElement("div");
        swatch.style.cssText = `
      width: 100%;
      height: 28px;
      border-radius: 10px;
      margin-top: 10px;
      border: 1px solid rgba(0,0,0,.1);
      background: ${input.value};
    `;

        input.addEventListener("input", () => {
            code.value = input.value;
            swatch.style.background = input.value;
        });

        row.appendChild(input);
        row.appendChild(code);
        row.appendChild(copyBtn);

        wrap.appendChild(header);
        wrap.appendChild(row);
        wrap.appendChild(swatch);
        container.prepend(wrap);

        return "Color picker opened in popup";
    }

    async function displayHiddenElements() {
        return await execInTab(() => {
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
        });
    }

    async function displayLineGuides() {
        return await execInTab(() => {
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
        });
    }

    async function displayRuler() {
        return await execInTab(() => {
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
        });
    }

    async function linearizePage() {
        return await execInTab(() => {
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
        });
    }

    async function makeFramesResizable() {
        return await execInTab(() => {
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
        });
    }

    async function markAllLinksUnvisited() {
        return await execInTab(() => {
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
        });
    }

    async function markAllLinksVisited() {
        return await execInTab(async () => {
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
        });
    }

    // ----------------------------
    // Public API
    // ----------------------------
    async function runByText(text) {
        const t = normalizeText(text);

        if (t === "clear cache") return await clearCache();
        if (t === "clear history") return await clearHistory();
        if (t === "display color picker") return await displayColorPicker();
        if (t === "display hidden elements") return await displayHiddenElements();
        if (t === "display line guides") return await displayLineGuides();
        if (t === "display ruler") return await displayRuler();
        if (t === "linearize page") return await linearizePage();
        if (t === "make frames resizable") return await makeFramesResizable();
        if (t === "mark all links unvisited") return await markAllLinksUnvisited();
        if (t === "mark all links visited") return await markAllLinksVisited();

        throw new Error(`Unknown Miscellaneous action: "${text}"`);
    }

    window.miscellaneousFunctions = {
        runByText,
        clearCache,
        clearHistory,
        confirmClearHistory,
        displayColorPicker,
        displayHiddenElements,
        displayLineGuides,
        displayRuler,
        linearizePage,
        makeFramesResizable,
        markAllLinksUnvisited,
        markAllLinksVisited,
    };

    // ----------------------------
    // Popup confirm handlers
    // ----------------------------
    document.addEventListener("click", async (e) => {
        const id = e.target?.id;

        if (id === "clearHistoryCancel") {
            document.getElementById("clearHistoryConfirm")?.classList.add("d-none");
            return;
        }

        if (id === "clearHistoryConfirmBtn") {
            try {
                await confirmClearHistory();
                window.extensionPopupInstance?.showNotification?.("History cleared ✓", "success");
            } catch (err) {
                console.error("Clear history failed:", err);
                window.extensionPopupInstance?.showNotification?.(
                    `✗ Clear history failed: ${String(err?.message || err)}`,
                    "danger"
                );
            }
        }
    });
})();
