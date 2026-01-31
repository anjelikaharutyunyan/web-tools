// js/imageFunctions.js (FULL fixed + status results)
// Returns { ok, message, count } for every action

(function () {
    "use strict";

    const res = (ok, message, count = 0) => ({ ok, message, count });

    class ImageFunctions {
        constructor() {
            // Separate storage:
            // - imgStates: Map<img, state>
            // - elStates: Map<Element, state> for background/outline changes
            this.imgStates = new Map();
            this.elStates = new Map();

            // track which functions are currently applied
            this.applied = new Set();
        }

        // ---------- helpers ----------
        trackImg(img) {
            if (!this.imgStates.has(img)) {
                this.imgStates.set(img, {
                    styleAttr: img.getAttribute("style") || "",

                    // wrappers/overlays created by extension
                    wrap: null,
                    overlays: {
                        alt: null,
                        dims: null,
                        path: null,
                    },

                    // disableImages wrapper
                    disableWrap: null,
                    disableOverlay: null,
                    disableListeners: null,

                    // replaceImages
                    originalSrc: img.currentSrc || img.src,
                });
            }
            return this.imgStates.get(img);
        }

        trackElement(el) {
            if (!this.elStates.has(el)) {
                this.elStates.set(el, {
                    styleAttr: el.getAttribute("style") || "",
                });
            }
            return this.elStates.get(el);
        }

        // Creates a wrapper around img to safely position overlays.
        ensureWrap(img) {
            const state = this.trackImg(img);
            if (state.wrap && state.wrap.isConnected) return state.wrap;

            const wrap = document.createElement("span");
            wrap.className = "__wd_img_wrap";
            wrap.style.cssText = "position:relative; display:inline-block; line-height:0;";

            // insert wrapper
            const parent = img.parentNode;
            if (!parent) return null;

            parent.insertBefore(wrap, img);
            wrap.appendChild(img);

            state.wrap = wrap;
            return wrap;
        }

        removeWrapIfEmpty(img) {
            const state = this.imgStates.get(img);
            if (!state?.wrap) return;
            const wrap = state.wrap;
            const hasAnyOverlay =
                !!state.overlays.alt || !!state.overlays.dims || !!state.overlays.path;

            // If wrap exists only for overlays and no overlays remain -> unwrap.
            if (!hasAnyOverlay && wrap.isConnected) {
                wrap.replaceWith(img);
                state.wrap = null;
            }
        }

        // ---------- public API ----------
        apply(functionName) {
            this.applied.add(functionName);

            switch (functionName) {
                case "disableImages":
                    return this.disableImages();
                case "hideImages":
                    return this.hideImages();
                case "hideBackgroundImages":
                    return this.hideBackgroundImages();
                case "makeImagesFullSize":
                    return this.makeImagesFullSize();
                case "makeImagesInvisible":
                    return this.makeImagesInvisible();
                case "outlineAllImages":
                    return this.outlineAllImages();
                case "outlineBackgroundImages":
                    return this.outlineBackgroundImages();
                case "outlineImagesWithAdjustedDimensions":
                    return this.outlineImagesWithAdjustedDimensions();
                case "outlineImagesWithEmptyAltAttributes":
                    return this.outlineImagesWithEmptyAltAttributes();
                case "outlineImagesWithOversizedDimensions":
                    return this.outlineImagesWithOversizedDimensions();
                case "outlineImagesWithoutAltAttributes":
                    return this.outlineImagesWithoutAltAttributes();
                case "outlineImagesWithoutDimensions":
                    return this.outlineImagesWithoutDimensions();
                case "displayAltAttributes":
                    return this.displayAltAttributes();
                case "displayImageDimensions":
                    return this.displayImageDimensions();
                case "displayImagePaths":
                    return this.displayImagePaths();
                case "replaceImagesWithAltAttributes":
                    return this.replaceImagesWithAltAttributes();
                case "viewImageInformation":
                    return this.viewImageInformation();
                default:
                    return res(false, `Unknown image function: ${functionName}`, 0);
            }
        }

        revert(functionName) {
            this.applied.delete(functionName);

            switch (functionName) {
                case "disableImages":
                    return this.revertDisableImages();
                case "hideImages":
                case "makeImagesFullSize":
                case "makeImagesInvisible":
                case "outlineAllImages":
                case "outlineImagesWithAdjustedDimensions":
                case "outlineImagesWithEmptyAltAttributes":
                case "outlineImagesWithOversizedDimensions":
                case "outlineImagesWithoutAltAttributes":
                case "outlineImagesWithoutDimensions":
                    return this.restoreImgStyles();
                case "hideBackgroundImages":
                case "outlineBackgroundImages":
                    return this.restoreElementStyles();
                case "displayAltAttributes":
                    return this.removeOverlay("alt");
                case "displayImageDimensions":
                    return this.removeOverlay("dims");
                case "displayImagePaths":
                    return this.removeOverlay("path");
                case "replaceImagesWithAltAttributes":
                    return this.restoreOriginalImages();
                case "viewImageInformation":
                    document.getElementById("__wd_image_info_modal")?.remove();
                    return res(true, "Image info closed", 1);
                default:
                    return res(false, `Unknown image function to revert: ${functionName}`, 0);
            }
        }

        // ---------- revert helpers ----------
        restoreImgStyles() {
            let count = 0;
            document.querySelectorAll("img").forEach((img) => {
                const st = this.imgStates.get(img);
                if (!st) return;
                img.setAttribute("style", st.styleAttr);
                count++;
            });
            return count ? res(true, `Restored image styles (${count})`, count) : res(false, "No images to restore", 0);
        }

        restoreElementStyles() {
            let count = 0;
            this.elStates.forEach((st, el) => {
                if (!el?.isConnected) return;
                el.setAttribute("style", st.styleAttr);
                count++;
            });
            return count ? res(true, `Restored element styles (${count})`, count) : res(false, "No elements to restore", 0);
        }

        removeOverlay(kind) {
            let removed = 0;
            document.querySelectorAll("img").forEach((img) => {
                const st = this.imgStates.get(img);
                if (!st) return;
                const node = st.overlays[kind];
                if (node && node.isConnected) {
                    node.remove();
                    st.overlays[kind] = null;
                    removed++;
                }
                this.removeWrapIfEmpty(img);
            });
            return removed ? res(true, `Overlay "${kind}" removed (${removed})`, removed) : res(false, `Overlay "${kind}" not found`, 0);
        }

        // ---------- functions ----------
        disableImages() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            // global style (only once)
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
                // if already wrapped
                if (img.closest("span.__wd_disable_wrap")) return;

                const st = this.trackImg(img);

                // create wrapper
                const wrap = document.createElement("span");
                wrap.className = "__wd_disable_wrap";

                img.parentNode?.insertBefore(wrap, img);
                wrap.appendChild(img);

                const overlay = document.createElement("span");
                overlay.className = "__wd_disable_overlay";
                wrap.appendChild(overlay);

                // prevent interactions (capture)
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

            return wrapped
                ? res(true, `Images disabled (${wrapped})`, wrapped)
                : res(false, "Images already disabled", 0);
        }

        revertDisableImages() {
            // remove global style
            document.getElementById("__wd_disable_images_style")?.remove();

            let unwrapped = 0;
            document.querySelectorAll("img").forEach((img) => {
                const st = this.imgStates.get(img);
                if (!st) return;

                // remove listeners
                if (st.disableListeners) {
                    st.disableListeners.forEach(({ t, h }) => img.removeEventListener(t, h, true));
                    st.disableListeners = null;
                }

                // unwrap
                if (st.disableWrap && st.disableWrap.isConnected) {
                    const wrap = st.disableWrap;
                    wrap.replaceWith(img); // safely put img back
                    unwrapped++;
                }

                st.disableWrap = null;
                st.disableOverlay = null;
            });

            return unwrapped ? res(true, `Images enabled (${unwrapped})`, unwrapped) : res(false, "No disabled images found", 0);
        }

        hideImages() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            let changed = 0;
            imgs.forEach((img) => {
                const st = this.trackImg(img);
                // store original only once (already in styleAttr)
                if (getComputedStyle(img).display !== "none") changed++;
                img.style.display = "none";
            });

            return changed ? res(true, `Images hidden (${changed})`, changed) : res(false, "Images already hidden", 0);
        }

        hideBackgroundImages() {
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

            return changed ? res(true, `Background images hidden (${changed})`, changed) : res(false, "No background images found", 0);
        }

        makeImagesFullSize() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            let changed = 0;
            imgs.forEach((img) => {
                this.trackImg(img);
                img.style.maxWidth = "none";
                img.style.maxHeight = "none";
                img.style.width = "auto";
                img.style.height = "auto";
                changed++;
            });

            return res(true, `Images set to full size (${changed})`, changed);
        }

        makeImagesInvisible() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            let changed = 0;
            imgs.forEach((img) => {
                this.trackImg(img);
                if (getComputedStyle(img).opacity !== "0") changed++;
                img.style.opacity = "0";
            });

            return changed ? res(true, `Images made invisible (${changed})`, changed) : res(false, "Images already invisible", 0);
        }

        outlineAllImages() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            imgs.forEach((img) => {
                this.trackImg(img);
                img.style.outline = "2px solid red";
            });

            return res(true, `Outlined images (${imgs.length})`, imgs.length);
        }

        outlineBackgroundImages() {
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

            return changed ? res(true, `Outlined background images (${changed})`, changed) : res(false, "No background images found", 0);
        }

        outlineImagesWithAdjustedDimensions() {
            const imgs = [...document.querySelectorAll("img")];
            let changed = 0;

            imgs.forEach((img) => {
                if (
                    img.naturalWidth &&
                    img.naturalHeight &&
                    (Math.abs(img.width - img.naturalWidth) > 1 ||
                        Math.abs(img.height - img.naturalHeight) > 1)
                ) {
                    this.trackImg(img);
                    img.style.outline = "2px dashed orange";
                    changed++;
                }
            });

            return changed ? res(true, `Outlined adjusted images (${changed})`, changed) : res(false, "No adjusted images found", 0);
        }

        outlineImagesWithEmptyAltAttributes() {
            const imgs = [...document.querySelectorAll('img[alt=""]')];
            if (!imgs.length) return res(false, 'No images with alt="" found', 0);

            imgs.forEach((img) => {
                this.trackImg(img);
                img.style.outline = "2px dotted purple";
            });

            return res(true, `Outlined empty-alt images (${imgs.length})`, imgs.length);
        }

        outlineImagesWithOversizedDimensions() {
            const imgs = [...document.querySelectorAll("img")];
            let changed = 0;

            imgs.forEach((img) => {
                if (img.naturalWidth > 2000 || img.naturalHeight > 2000) {
                    this.trackImg(img);
                    img.style.outline = "3px solid black";
                    changed++;
                }
            });

            return changed ? res(true, `Outlined oversized images (${changed})`, changed) : res(false, "No oversized images found", 0);
        }

        outlineImagesWithoutAltAttributes() {
            const imgs = [...document.querySelectorAll("img")].filter((img) => !img.hasAttribute("alt"));
            if (!imgs.length) return res(false, "No images without alt found", 0);

            imgs.forEach((img) => {
                this.trackImg(img);
                img.style.outline = "2px dotted red";
            });

            return res(true, `Outlined images without alt (${imgs.length})`, imgs.length);
        }

        outlineImagesWithoutDimensions() {
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

        displayAltAttributes() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            let shown = 0;
            imgs.forEach((img) => {
                const st = this.trackImg(img);

                // remove old
                if (st.overlays.alt?.isConnected) st.overlays.alt.remove();

                const wrap = this.ensureWrap(img);
                if (!wrap) return;

                const box = document.createElement("span");
                box.className = "__wd_alt_overlay";
                box.style.cssText = `
          position:absolute; left:0; right:0; bottom:0;
          background:rgba(0,0,0,.72); color:#fff;
          padding:3px 6px; font-size:12px; z-index:999999;
          pointer-events:none; line-height:1.2;
        `;
                box.textContent = `Alt: ${img.alt || "(no alt)"}`;

                wrap.appendChild(box);
                st.overlays.alt = box;
                shown++;
            });

            return shown ? res(true, `Alt labels shown (${shown})`, shown) : res(false, "No alt labels shown", 0);
        }

        displayImageDimensions() {
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
          padding:3px 6px; font-size:12px; z-index:999999;
          pointer-events:none; border-radius:0 0 0 4px;
        `;
                box.textContent = `${w}×${h}`;

                wrap.appendChild(box);
                st.overlays.dims = box;
                shown++;
            });

            return shown ? res(true, `Dimensions shown (${shown})`, shown) : res(false, "No dimensions shown", 0);
        }

        displayImagePaths() {
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
          padding:3px 6px; font-size:11px; z-index:999999;
          pointer-events:none; max-width:220px; overflow:hidden;
          text-overflow:ellipsis; white-space:nowrap; border-radius:0 0 4px 0;
        `;
                box.textContent = short;
                box.title = full;

                wrap.appendChild(box);
                st.overlays.path = box;
                shown++;
            });

            return shown ? res(true, `Paths shown (${shown})`, shown) : res(false, "No paths shown", 0);
        }

        replaceImagesWithAltAttributes() {
            const imgs = [...document.querySelectorAll("img")];
            if (!imgs.length) return res(false, "No images found", 0);

            let replaced = 0;
            imgs.forEach((img) => {
                const alt = (img.getAttribute("alt") || "").trim();
                if (!alt) return;

                const st = this.trackImg(img);
                // store original src once
                if (!st.originalSrc) st.originalSrc = img.currentSrc || img.src;

                const canvas = document.createElement("canvas");
                canvas.width = img.width || 150;
                canvas.height = img.height || 150;
                const ctx = canvas.getContext("2d");

                ctx.fillStyle = "#f0f0f0";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = "#ccc";
                ctx.strokeRect(0, 0, canvas.width, canvas.height);

                ctx.fillStyle = "#666";
                ctx.font = "12px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

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

                img.src = canvas.toDataURL();
                replaced++;
            });

            return replaced ? res(true, `Images replaced with alt placeholders (${replaced})`, replaced) : res(false, "No images with non-empty alt found", 0);
        }

        restoreOriginalImages() {
            let restored = 0;
            document.querySelectorAll("img").forEach((img) => {
                const st = this.imgStates.get(img);
                if (!st?.originalSrc) return;
                if (img.src !== st.originalSrc) {
                    img.src = st.originalSrc;
                    restored++;
                }
            });
            return restored ? res(true, `Original images restored (${restored})`, restored) : res(false, "No images to restore", 0);
        }

        viewImageInformation() {
            const imgs = [...document.querySelectorAll("img")];
            const total = imgs.length;

            const lines = [];
            lines.push(`Total images: ${total}`);
            lines.push("");

            imgs.forEach((img, i) => {
                const w = img.naturalWidth || img.width || "unknown";
                const h = img.naturalHeight || img.height || "unknown";
                const alt = img.alt || "(no alt)";
                const src = (img.currentSrc || img.src || "");
                const short = src.length > 90 ? src.slice(0, 87) + "..." : src;
                const hasDim = img.hasAttribute("width") || img.hasAttribute("height");
                const oversized = (img.naturalWidth > 2000 || img.naturalHeight > 2000) ? "YES" : "no";

                lines.push(`${i + 1}. ${short}`);
                lines.push(`   Alt: ${alt}`);
                lines.push(`   Size: ${w}×${h}`);
                lines.push(`   Has dimensions: ${hasDim ? "Yes" : "No"}`);
                lines.push(`   Oversized: ${oversized}`);
                lines.push(`   Loading: ${img.complete ? "Complete" : "Loading..."}`);
                lines.push("");
            });

            this.showInfoModal(lines.join("\n"));
            return res(true, `Image info opened (total ${total})`, total);
        }

        showInfoModal(content) {
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

    // Export instance
    window.imageFunctions = new ImageFunctions();
})();
