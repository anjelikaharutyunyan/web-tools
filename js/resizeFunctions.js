
(function () {
    const NS = "__webdev_resize__";

    // -------------------- helpers --------------------
    function ensureState() {
        if (!window[NS]) {
            window[NS] = {
                overlayEl: null,
                lastTitle: document.title,
            };
        }
        return window[NS];
    }

    function toast(msg) {
        // small in-page toast so you see feedback in the page (not in popup)
        const id = `${NS}_toast`;
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement("div");
            el.id = id;
            el.style.cssText = `
        position:fixed; left:12px; bottom:12px; z-index:2147483647;
        background:rgba(0,0,0,.85); color:#fff;
        padding:8px 10px; border-radius:10px;
        font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
        max-width: 70vw;
      `;
            document.documentElement.appendChild(el);
        }
        el.textContent = msg;
        clearTimeout(el.__t);
        el.__t = setTimeout(() => el.remove(), 1800);
    }

    function removeOverlay() {
        const st = ensureState();
        if (st.overlayEl) {
            st.overlayEl.remove();
            st.overlayEl = null;
            toast("Resize overlay closed");
        }
    }

    function createOverlay({ width, height, title } = {}) {
        const st = ensureState();
        removeOverlay();

        const wrap = document.createElement("div");
        wrap.id = `${NS}_overlay`;
        wrap.style.cssText = `
      position:fixed; inset:0; z-index:2147483647;
      background:rgba(0,0,0,.35);
      display:flex; align-items:center; justify-content:center;
      padding:16px;
    `;

        const card = document.createElement("div");
        card.style.cssText = `
      width:min(420px, 92vw);
      background:#fff; border-radius:16px;
      box-shadow:0 10px 30px rgba(0,0,0,.25);
      padding:14px;
      font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    `;

        const header = document.createElement("div");
        header.style.cssText = `
      display:flex; align-items:center; justify-content:space-between; gap:10px;
      margin-bottom:10px;
    `;

        const h = document.createElement("div");
        h.style.cssText = `font-weight:700; font-size:14px;`;
        h.textContent = title || "Resize Window (simulated)";

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.textContent = "✕";
        closeBtn.style.cssText = `
      border:none; background:#f1f3f5; cursor:pointer;
      width:34px; height:34px; border-radius:10px;
      font-size:16px;
    `;
        closeBtn.addEventListener("click", removeOverlay);

        header.appendChild(h);
        header.appendChild(closeBtn);

        const note = document.createElement("div");
        note.style.cssText = `color:#495057; margin-bottom:10px;`;
        note.innerHTML =
            `Chrome extensions <b>can’t реально изменить размер окна</b> обычной страницы ` +
            `без спец. разрешений/ограничений. Поэтому это “симуляция” — ` +
            `мы задаём <b>viewport рамку</b>, чтобы проверить responsive.`;

        const row = document.createElement("div");
        row.style.cssText = `display:flex; gap:8px; margin:10px 0;`;

        const wInput = document.createElement("input");
        wInput.type = "number";
        wInput.placeholder = "Width";
        wInput.value = width ?? 1024;
        wInput.min = 1;
        wInput.style.cssText = `
      flex:1; padding:8px 10px; border:1px solid #dee2e6; border-radius:10px;
    `;

        const hInput = document.createElement("input");
        hInput.type = "number";
        hInput.placeholder = "Height";
        hInput.value = height ?? 768;
        hInput.min = 1;
        hInput.style.cssText = `
      flex:1; padding:8px 10px; border:1px solid #dee2e6; border-radius:10px;
    `;

        row.appendChild(wInput);
        row.appendChild(hInput);

        const actions = document.createElement("div");
        actions.style.cssText = `display:flex; gap:8px; justify-content:flex-end;`;

        const applyBtn = document.createElement("button");
        applyBtn.type = "button";
        applyBtn.textContent = "Apply";
        applyBtn.style.cssText = `
      border:none; cursor:pointer; border-radius:10px;
      padding:8px 12px; background:#0d6efd; color:#fff;
      font-weight:600;
    `;

        const resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.textContent = "Reset";
        resetBtn.style.cssText = `
      border:none; cursor:pointer; border-radius:10px;
      padding:8px 12px; background:#f1f3f5; color:#111;
      font-weight:600;
    `;

        actions.appendChild(resetBtn);
        actions.appendChild(applyBtn);

        // viewport frame (simulated responsive)
        const frameWrap = document.createElement("div");
        frameWrap.style.cssText = `
      margin-top:12px;
      background:#f8f9fa;
      border:1px solid #dee2e6;
      border-radius:14px;
      padding:10px;
    `;

        const info = document.createElement("div");
        info.style.cssText = `color:#495057; margin-bottom:8px;`;
        info.textContent = "Preview frame:";

        const frame = document.createElement("div");
        frame.id = `${NS}_frame`;
        frame.style.cssText = `
      width:${Number(wInput.value)}px;
      height:${Number(hInput.value)}px;
      border:2px dashed #adb5bd;
      border-radius:12px;
      overflow:auto;
      background:#fff;
    `;

        // We clone the page by using an iframe to the same URL
        const iframe = document.createElement("iframe");
        iframe.src = location.href;
        iframe.style.cssText = `
      width:100%; height:100%; border:none; display:block;
    `;
        frame.appendChild(iframe);

        frameWrap.appendChild(info);
        frameWrap.appendChild(frame);

        function applyFrame() {
            const w = Math.max(1, Number(wInput.value || 0));
            const hh = Math.max(1, Number(hInput.value || 0));
            frame.style.width = `${w}px`;
            frame.style.height = `${hh}px`;
            toast(`Preview: ${w}×${hh}`);
        }

        applyBtn.addEventListener("click", applyFrame);
        resetBtn.addEventListener("click", () => {
            wInput.value = 1024;
            hInput.value = 768;
            applyFrame();
        });

        wrap.addEventListener("click", (e) => {
            if (e.target === wrap) removeOverlay();
        });

        card.appendChild(header);
        card.appendChild(note);
        card.appendChild(row);
        card.appendChild(actions);
        card.appendChild(frameWrap);
        wrap.appendChild(card);

        document.documentElement.appendChild(wrap);
        st.overlayEl = wrap;

        applyFrame();
    }

    function displayWindowSize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        toast(`Window: ${w}×${h} (inner) | Screen: ${screen.width}×${screen.height}`);
        return { innerWidth: w, innerHeight: h, screenWidth: screen.width, screenHeight: screen.height };
    }

    function viewResponsiveLayouts() {
        // just opens common presets overlay
        createOverlay({ title: "Responsive Layouts" });
        toast("Choose sizes in overlay (simulated)");
    }

    function resizeWindow() {
        createOverlay({ title: "Resize Window..." });
    }

    function resizePreset({ width, height }) {
        createOverlay({ width, height, title: `Preset: ${width}×${height}` });
    }

    function editResizeDimensions() {
        // same as resizeWindow, but different title
        createOverlay({ title: "Edit Resize Dimensions..." });
    }

    // -------------------- public API --------------------
    window.resizeFunctions = {
        apply(name, options = {}) {
            switch (name) {
                case "displayWindowSize":
                    return displayWindowSize(); // one-shot
                case "resizeWindow":
                    return resizeWindow();
                case "resizePreset":
                    return resizePreset({
                        width: Number(options.width || 1024),
                        height: Number(options.height || 768),
                    });
                case "editResizeDimensions":
                    return editResizeDimensions();
                case "viewResponsiveLayouts":
                    return viewResponsiveLayouts();
                default:
                    throw new Error(`Unknown resize function: ${name}`);
            }
        },

        revert(name) {
            // For now, all resize UI is overlay-based, so revert just closes it
            removeOverlay();
            return true;
        },

        revertAll() {
            removeOverlay();
            return true;
        },
    };
})();
