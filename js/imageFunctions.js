// js/imageFunctions.js - Fixed version that properly tracks state
(function () {
    "use strict";

    const res = (ok, message, count = 0) => ({ ok, message, count });

    // Singleton check
    if (window.imageFunctions && typeof window.imageFunctions.apply === "function") {
        return;
    }

    class ImageFunctions {
        constructor() {
            this.imgStates = new Map();
            this.elStates = new Map();
            this.applied = new Set(); // Track which functions are active
        }

        // ---------- helpers ----------
        trackImg(img) {
            if (!this.imgStates.has(img)) {
                this.imgStates.set(img, {
                    styleAttr: img.getAttribute("style"),
                    wrap: null,
                    overlays: { alt: null, dims: null, path: null },
                    disableWrap: null,
                    disableOverlay: null,
                    disableListeners: null,
                    original: {
                        src: img.getAttribute("src"),
                        srcset: img.getAttribute("srcset"),
                        sizes: img.getAttribute("sizes"),
                    },
                });
            }
            return this.imgStates.get(img);
        }

        trackElement(el) {
            if (!this.elStates.has(el)) {
                this.elStates.set(el, { styleAttr: el.getAttribute("style") });
            }
            return this.elStates.get(el);
        }

        restoreStyleAttr(node, originalStyleAttr) {
            if (!node || !node.isConnected) return;
            if (originalStyleAttr === null) node.removeAttribute("style");
            else node.setAttribute("style", originalStyleAttr);
        }

        ensureWrap(img) {
            const state = this.trackImg(img);
            if (state.wrap && state.wrap.isConnected) return state.wrap;

            const parent = img.parentNode;
            if (!parent) return null;

            const wrap = document.createElement("span");
            wrap.className = "__wd_img_wrap";
            wrap.style.cssText = "position:relative; display:inline-block; line-height:0;";

            parent.insertBefore(wrap, img);
            wrap.appendChild(img);

            state.wrap = wrap;
            return wrap;
        }

        removeWrapIfEmpty(img) {
            const state = this.imgStates.get(img);
            if (!state?.wrap) return;

            const wrap = state.wrap;
            const hasAnyOverlay = !!state.overlays.alt || !!state.overlays.dims || !!state.overlays.path;

            if (!hasAnyOverlay && wrap.isConnected) {
                wrap.replaceWith(img);
                state.wrap = null;
            }
        }

        // ==================== PUBLIC API FOR MAIN.JS ====================

        /**
         * Apply a function (called when button is toggled ON)
         */
        apply(functionName) {
            this.applied.add(functionName);
            return this._applyInternal(functionName);
        }

        /**
         * Revert a function (called when button is toggled OFF)
         */
        revert(functionName) {
            this.applied.delete(functionName);

            // For revert, we need to clean up everything and reapply remaining functions
            return this._recomputeAfterRevert(functionName);
        }

        /**
         * Revert all functions (for reset)
         */
        revertAll() {
            this.applied.clear();
            return this._fullCleanup();
        }

        // ==================== INTERNAL IMPLEMENTATION ====================

        /**
         * Clean up everything and reapply remaining functions after revert
         */
        _recomputeAfterRevert(revertedFunction) {
            // 1. Full cleanup of all effects
            this._fullCleanup();

            // 2. Reapply all remaining active functions in correct order
            return this._reapplyAll(`Reverted: ${revertedFunction}`);
        }

        /**
         * Full cleanup - removes ALL effects
         */
        _fullCleanup() {
            // Remove disableImages style
            document.getElementById("__wd_disable_images_style")?.remove();

            // Remove info modal if open
            document.getElementById("__wd_image_info_modal")?.remove();

            // Restore all images
            document.querySelectorAll("img").forEach((img) => {
                const st = this.imgStates.get(img);
                if (!st) return;

                // Restore inline styles
                this.restoreStyleAttr(img, st.styleAttr);

                // Remove disableImages wrappers/listeners
                if (st.disableListeners) {
                    st.disableListeners.forEach(({ t, h }) => img.removeEventListener(t, h, true));
                    st.disableListeners = null;
                }

                if (st.disableWrap && st.disableWrap.isConnected) {
                    st.disableWrap.replaceWith(img);
                }
                st.disableWrap = null;
                st.disableOverlay = null;

                // Remove overlays
                ["alt", "dims", "path"].forEach((k) => {
                    if (st.overlays[k]?.isConnected) {
                        st.overlays[k].remove();
                        st.overlays[k] = null;
                    }
                });

                // Remove wrap if empty
                if (st.wrap && st.wrap.isConnected) {
                    const hasOverlay = st.overlays.alt || st.overlays.dims || st.overlays.path;
                    if (!hasOverlay) {
                        st.wrap.replaceWith(img);
                        st.wrap = null;
                    }
                }

                // Restore original src/srcset/sizes
                if (st.original) {
                    const { src, srcset, sizes } = st.original;
                    if (src === null) img.removeAttribute("src");
                    else img.setAttribute("src", src);
                    if (srcset === null) img.removeAttribute("srcset");
                    else img.setAttribute("srcset", srcset);
                    if (sizes === null) img.removeAttribute("sizes");
                    else img.setAttribute("sizes", sizes);
                }
            });

            // Restore all elements
            this.elStates.forEach((st, el) => {
                if (el?.isConnected) {
                    this.restoreStyleAttr(el, st.styleAttr);
                }
            });
        }

        /**
         * Reapply all active functions in correct order
         */
        _reapplyAll(message = "Reapplied") {
            // Define execution order
            const order = [
                "disableImages",
                "hideImages",
                "hideBackgroundImages",
                "makeImagesFullSize",
                "makeImagesInvisible",
                "outlineAllImages",
                "outlineBackgroundImages",
                "outlineImagesWithAdjustedDimensions",
                "outlineImagesWithEmptyAltAttributes",
                "outlineImagesWithOversizedDimensions",
                "outlineImagesWithoutAltAttributes",
                "outlineImagesWithoutDimensions",
                "displayAltAttributes",
                "displayImageDimensions",
                "displayImagePaths",
                "replaceImagesWithAltAttributes",
            ];

            let appliedCount = 0;
            for (const fn of order) {
                if (!this.applied.has(fn)) continue;
                try {
                    const result = this._applyInternal(fn);
                    if (result?.ok === false) {
                        this.applied.delete(fn);
                    } else {
                        appliedCount++;
                    }
                } catch (e) {
                    this.applied.delete(fn);
                }
            }

            return res(true, `${message}. Active: ${this.applied.size}`, appliedCount);
        }

        /**
         * Internal apply - executes a single function
         */
        _applyInternal(functionName) {

            switch (functionName) {
                case "disableImages":
                    return this._disableImages();
                case "hideImages":
                    return this._hideImages();
                case "hideBackgroundImages":
                    return this._hideBackgroundImages();
                case "makeImagesFullSize":
                    return this._makeImagesFullSize();
                case "makeImagesInvisible":
                    return this._makeImagesInvisible();
                case "outlineAllImages":
                    return this._outlineAllImages();
                case "outlineBackgroundImages":
                    return this._outlineBackgroundImages();
                case "outlineImagesWithAdjustedDimensions":
                    return this._outlineImagesWithAdjustedDimensions();
                case "outlineImagesWithEmptyAltAttributes":
                    return this._outlineImagesWithEmptyAltAttributes();
                case "outlineImagesWithOversizedDimensions":
                    return this._outlineImagesWithOversizedDimensions();
                case "outlineImagesWithoutAltAttributes":
                    return this._outlineImagesWithoutAltAttributes();
                case "outlineImagesWithoutDimensions":
                    return this._outlineImagesWithoutDimensions();
                case "displayAltAttributes":
                    return this._displayAltAttributes();
                case "displayImageDimensions":
                    return this._displayImageDimensions();
                case "displayImagePaths":
                    return this._displayImagePaths();
                case "replaceImagesWithAltAttributes":
                    return this._replaceImagesWithAltAttributes();
                case "viewImageInformation":
                    // One-shot function
                    this._viewImageInformation();
                    return res(true, "Image info opened");
                default:
                    return res(false, `Unknown function: ${functionName}`);
            }
        }

        // ==================== ACTUAL FUNCTION IMPLEMENTATIONS ====================

        _disableImages() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            const styleId = "__wd_disable_images_style";
            if (!document.getElementById(styleId)) {
                const style = document.createElement("style");
                style.id = styleId;
                style.textContent = `
.__wd_disable_wrap { position:relative; display:inline-block; line-height:0; }
.__wd_disable_wrap img { pointer-events:none !important; opacity:.7 !important; cursor:not-allowed !important; user-select:none !important; }
.__wd_disable_overlay {
  position:absolute; inset:0; background:rgba(255,0,0,.12);
  pointer-events:none; z-index:999999;
}
`;
                document.head.appendChild(style);
            }

            let wrapped = 0;
            imgs.forEach((img) => {
                if (img.closest("span.__wd_disable_wrap")) return;

                const st = this.trackImg(img);
                const wrap = document.createElement("span");
                wrap.className = "__wd_disable_wrap";

                img.parentNode?.insertBefore(wrap, img);
                wrap.appendChild(img);

                const overlay = document.createElement("span");
                overlay.className = "__wd_disable_overlay";
                wrap.appendChild(overlay);

                const prevent = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                };

                const events = ["click", "contextmenu", "dragstart", "mousedown", "mouseup"];
                const listeners = events.map((t) => {
                    const h = (e) => prevent(e);
                    img.addEventListener(t, h, true);
                    return { t, h };
                });

                st.disableWrap = wrap;
                st.disableOverlay = overlay;
                st.disableListeners = listeners;
                wrapped++;
            });

            return res(true, `Images disabled (${wrapped})`, wrapped);
        }

        _hideImages() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            let changed = 0;
            imgs.forEach((img) => {
                this.trackImg(img);
                if (getComputedStyle(img).display !== "none") changed++;
                img.style.display = "none";
            });

            return res(true, `Images hidden (${changed})`, changed);
        }

        _hideBackgroundImages() {
            const els = [...document.querySelectorAll("*")];
            if (!els.length) return res(false, "No elements found", 0);

            let changed = 0;
            els.forEach((el) => {
                const bg = getComputedStyle(el).backgroundImage;
                if (bg && bg !== "none") {
                    this.trackElement(el);
                    el.style.backgroundImage = "none";
                    changed++;
                }
            });

            return res(true, `Background images hidden (${changed})`, changed);
        }

        _makeImagesFullSize() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            imgs.forEach((img) => {
                this.trackImg(img);
                img.style.maxWidth = "none";
                img.style.maxHeight = "none";
                img.style.width = "auto";
                img.style.height = "auto";
            });

            return res(true, `Images set to full size (${imgs.length})`, imgs.length);
        }

        _makeImagesInvisible() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            let changed = 0;
            imgs.forEach((img) => {
                this.trackImg(img);
                if (getComputedStyle(img).opacity !== "0") changed++;
                img.style.opacity = "0";
            });

            return res(true, `Images made invisible (${changed})`, changed);
        }

        _outlineAllImages() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            imgs.forEach((img) => {
                this.trackImg(img);
                img.style.outline = "2px solid red";
            });

            return res(true, `Outlined images (${imgs.length})`, imgs.length);
        }

        _outlineBackgroundImages() {
            const els = [...document.querySelectorAll("*")];
            let changed = 0;

            els.forEach((el) => {
                const bg = getComputedStyle(el).backgroundImage;
                if (bg && bg !== "none") {
                    this.trackElement(el);
                    el.style.outline = "2px solid blue";
                    changed++;
                }
            });

            return res(true, `Outlined background images (${changed})`, changed);
        }

        _outlineImagesWithAdjustedDimensions() {
            const imgs = [...document.querySelectorAll("img")];
            let changed = 0;

            imgs.forEach((img) => {
                if (img.naturalWidth && img.naturalHeight &&
                    (Math.abs(img.width - img.naturalWidth) > 1 ||
                        Math.abs(img.height - img.naturalHeight) > 1)) {
                    this.trackImg(img);
                    img.style.outline = "2px dashed orange";
                    changed++;
                }
            });

            return res(true, `Outlined adjusted images (${changed})`, changed);
        }

        _outlineImagesWithEmptyAltAttributes() {
            const imgs = [...document.querySelectorAll('img[alt=""]')];
            if (!imgs.length) return res(false, 'No images with alt="" found', 0);

            imgs.forEach((img) => {
                this.trackImg(img);
                img.style.outline = "2px dotted purple";
            });

            return res(true, `Outlined empty-alt images (${imgs.length})`, imgs.length);
        }

        _outlineImagesWithOversizedDimensions() {
            const imgs = [...document.querySelectorAll("img")];
            let changed = 0;

            imgs.forEach((img) => {
                if ((img.naturalWidth || 0) > 2000 || (img.naturalHeight || 0) > 2000) {
                    this.trackImg(img);
                    img.style.outline = "3px solid black";
                    changed++;
                }
            });

            return res(true, `Outlined oversized images (${changed})`, changed);
        }

        _outlineImagesWithoutAltAttributes() {
            const imgs = [...document.querySelectorAll("img")].filter((img) => !img.hasAttribute("alt"));
            if (!imgs.length) return res(false, "No images without alt found", 0);

            imgs.forEach((img) => {
                this.trackImg(img);
                img.style.outline = "2px dotted red";
            });

            return res(true, `Outlined images without alt (${imgs.length})`, imgs.length);
        }

        _outlineImagesWithoutDimensions() {
            const imgs = [...document.querySelectorAll("img")].filter(
                (img) => !img.hasAttribute("width") && !img.hasAttribute("height")
            );
            if (!imgs.length) return res(false, "No images without width/height found", 0);

            imgs.forEach((img) => {
                this.trackImg(img);
                img.style.outline = "2px dotted green";
            });

            return res(true, `Outlined images without dimensions (${imgs.length})`, imgs.length);
        }

        _displayAltAttributes() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            let shown = 0;
            imgs.forEach((img) => {
                const st = this.trackImg(img);
                if (st.overlays.alt?.isConnected) st.overlays.alt.remove();

                const wrap = this.ensureWrap(img);
                if (!wrap) return;

                const box = document.createElement("span");
                box.className = "__wd_alt_overlay";
                box.style.cssText = `
position:absolute; left:0; right:0; bottom:0;
background:rgba(0,0,0,.72); color:#fff;
padding:6px 6px; font-size:12px; z-index:999999;
pointer-events:none; line-height:1.2;
`;
                box.textContent = `Alt: ${img.alt || "(no alt)"}`;

                wrap.appendChild(box);
                st.overlays.alt = box;
                shown++;
            });

            return res(true, `Alt labels shown (${shown})`, shown);
        }

        _displayImageDimensions() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            let shown = 0;
            imgs.forEach((img) => {
                const st = this.trackImg(img);
                if (st.overlays.dims?.isConnected) st.overlays.dims.remove();

                const wrap = this.ensureWrap(img);
                if (!wrap) return;

                const w = img.naturalWidth || img.width || "?";
                const h = img.naturalHeight || img.height || "?";

                const box = document.createElement("span");
                box.style.cssText = `
position:absolute; top:0; right:0;
background:rgba(0,100,0,.72); color:#fff;
padding:6px 6px; font-size:12px; z-index:999999;
pointer-events:none; border-radius:0 0 0 4px;
`;
                box.textContent = `${w}×${h}`;

                wrap.appendChild(box);
                st.overlays.dims = box;
                shown++;
            });

            return res(true, `Dimensions shown (${shown})`, shown);
        }

        _displayImagePaths() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            let shown = 0;
            imgs.forEach((img) => {
                const st = this.trackImg(img);
                if (st.overlays.path?.isConnected) st.overlays.path.remove();

                const wrap = this.ensureWrap(img);
                if (!wrap) return;

                const full = img.currentSrc || img.src || "";
                const short = full.length > 60 ? full.slice(0, 57) + "..." : full;

                const box = document.createElement("span");
                box.style.cssText = `
position:absolute; top:0; left:0;
background:rgba(0,0,100,.72); color:#fff;
padding:6px 6px; font-size:11px; z-index:999999;
pointer-events:none; max-width:220px; overflow:hidden;
text-overflow:ellipsis; white-space:nowrap; border-radius:0 0 4px 0;
`;
                box.textContent = short;
                box.title = full;

                wrap.appendChild(box);
                st.overlays.path = box;
                shown++;
            });

            return res(true, `Paths shown (${shown})`, shown);
        }

        _replaceImagesWithAltAttributes() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            let replaced = 0;
            imgs.forEach((img) => {
                const alt = (img.getAttribute("alt") || "").trim();
                if (!alt) return;

                this.trackImg(img);

                const cw = Math.max(80, img.width || img.clientWidth || img.naturalWidth || 150);
                const ch = Math.max(60, img.height || img.clientHeight || img.naturalHeight || 150);

                const canvas = document.createElement("canvas");
                canvas.width = cw;
                canvas.height = ch;

                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                ctx.fillStyle = "#f0f0f0";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = "#ccc";
                ctx.strokeRect(0, 0, canvas.width, canvas.height);

                ctx.fillStyle = "#666";
                ctx.font = "12px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                // Word wrap logic
                const words = alt.split(/\s+/);
                let line = "";
                const lines = [];
                const maxWidth = canvas.width - 20;

                for (const word of words) {
                    const test = line + word + " ";
                    if (ctx.measureText(test).width > maxWidth && line) {
                        lines.push(line.trim());
                        line = word + " ";
                    } else {
                        line = test;
                    }
                }
                if (line) lines.push(line.trim());

                const lh = 14;
                const startY = (canvas.height - lines.length * lh) / 2 + lh / 2;
                lines.forEach((t, i) => ctx.fillText(t, canvas.width / 2, startY + i * lh));

                img.removeAttribute("srcset");
                img.removeAttribute("sizes");
                img.src = canvas.toDataURL();
                replaced++;
            });

            return replaced
                ? res(true, `Images replaced with alt placeholders (${replaced})`, replaced)
                : res(false, "No images with non-empty alt found", 0);
        }

        _viewImageInformation() {
            const imgs = [...document.querySelectorAll("img")];
            const total = imgs.length;

            const lines = [];
            lines.push(`Total images: ${total}`);
            lines.push("");

            imgs.forEach((img, i) => {
                const w = img.naturalWidth || img.width || "unknown";
                const h = img.naturalHeight || img.height || "unknown";
                const alt = img.alt || "(no alt)";
                const src = img.currentSrc || img.src || "";
                const short = src.length > 90 ? src.slice(0, 87) + "..." : src;
                const hasDim = img.hasAttribute("width") || img.hasAttribute("height");
                const oversized = (img.naturalWidth || 0) > 2000 || (img.naturalHeight || 0) > 2000 ? "YES" : "no";

                lines.push(`${i + 1}. ${short}`);
                lines.push(`   Alt: ${alt}`);
                lines.push(`   Size: ${w}×${h}`);
                lines.push(`   Has dimensions: ${hasDim ? "Yes" : "No"}`);
                lines.push(`   Oversized: ${oversized}`);
                lines.push(`   Loading: ${img.complete ? "Complete" : "Loading..."}`);
                lines.push("");
            });

            this._showInfoModal(lines.join("\n"));
        }

        _showInfoModal(content) {
            const existing = document.getElementById("__wd_image_info_modal");
            if (existing) existing.remove();

            const modal = document.createElement("div");
            modal.id = "__wd_image_info_modal";
            modal.style.cssText = `
position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
background:#fff; padding:16px; border-radius:10px;
box-shadow:0 10px 40px rgba(0,0,0,.35);
z-index:2147483647; max-width:80%; max-height:80%;
overflow:auto; font-family:monospace; font-size:12px; white-space:pre;
border:2px solid #333;
`;

            const close = () => {
                document.removeEventListener("keydown", onKeyDown);
                modal.remove();
            };

            const btn = document.createElement("button");
            btn.textContent = "Close";
            btn.style.cssText = `
position:sticky; top:0; float:right;
background:#ff4444; color:#fff; border:none;
padding:6px 10px; border-radius:6px; cursor:pointer;
font-family:system-ui;
`;
            btn.onclick = close;

            const pre = document.createElement("pre");
            pre.style.margin = "8px 0 0";
            pre.textContent = content;

            const onKeyDown = (e) => {
                if (e.key === "Escape") close();
            };

            document.addEventListener("keydown", onKeyDown);

            modal.appendChild(btn);
            modal.appendChild(pre);
            document.body.appendChild(modal);
        }
    }

    // Create and expose the singleton
    window.imageFunctions = new ImageFunctions();
})();