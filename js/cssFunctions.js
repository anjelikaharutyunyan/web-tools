// js/cssFunctions.js - Fixed version with better debugging
(function () {
    "use strict";
    function res(ok, message, count) {
        return { ok, message, ...(typeof count === "number" ? { count } : {}) };
    }

    // Track active functions
    const activeFunctions = new Set();

    // Map of function names to their implementations (case-insensitive)
    const functionMap = {
        'disableallstyles': 'disableAllStyles',
        'disableall': 'disableAllStyles',
        'disablebrowserdefault': 'disableBrowserDefault',
        'disableembedded': 'disableEmbedded',
        'disableinline': 'disableInline',
        'disablelinked': 'disableLinked',
        'disableprint': 'disablePrint',
        'displayhandheld': 'displayHandheld',
        'displayprint': 'displayPrint',
        'reloadlinked': 'reloadLinked',
        'reload': 'reloadLinked',
        'borderbox': 'borderBox',
        'boxsizing': 'borderBox',
        'viewcss': 'viewCSS',
        'viewfonts': 'viewFonts',
        'view font': 'viewFonts'
    };

    const cssFunctions = {
        // Module-level apply/revert
        apply: function (functionName) {
            const normalized = this.normalizeFunctionName(functionName);
            activeFunctions.add(normalized);

            switch (normalized) {
                case 'disableAllStyles':
                    return this.disableAllStyles();
                case 'disableBrowserDefault':
                    return this.disableBrowserDefault();
                case 'disableEmbedded':
                    return this.disableEmbedded();
                case 'disableInline':
                    return this.disableInline();
                case 'disableLinked':
                    return this.disableLinked();
                case 'disablePrint':
                    return this.disablePrint();
                case 'displayHandheld':
                    return this.displayHandheld();
                case 'displayPrint':
                    return this.displayPrint();
                case 'reloadLinked':
                    return this.reloadLinked();
                case 'borderBox':
                    return this.borderBox();
                case 'viewCSS':
                    return this.viewCSS();
                case 'viewFonts':
                    return this.viewFonts();
                default:
                    return res(false, `Unknown function: ${functionName}`);
            }
        },

        revert: function (functionName) {
            const normalized = this.normalizeFunctionName(functionName);
            activeFunctions.delete(normalized);

            switch (normalized) {
                case 'disableAllStyles':
                    return this.revertDisableAllStyles();
                case 'disableBrowserDefault':
                    return this.revertDisableBrowserDefault();
                case 'disableEmbedded':
                    return this.revertDisableEmbedded();
                case 'disableInline':
                    return this.revertDisableInline();
                case 'disableLinked':
                    return this.revertDisableLinked();
                case 'disablePrint':
                    return this.revertDisablePrint();
                case 'displayHandheld':
                    return this.revertDisplayHandheld();
                case 'displayPrint':
                    return this.revertDisplayPrint();
                case 'reloadLinked':
                    return res(true, "No revert for reloadLinked");
                case 'borderBox':
                    return this.revertBorderBox();
                case 'viewCSS':
                    return res(true, "No revert for viewCSS");
                case 'viewFonts':
                    return res(true, "No revert for viewFonts");
                default:
                    return res(false, `Unknown function: ${functionName}`);
            }
        },

        normalizeFunctionName: function (name) {
            if (!name) return '';

            // Remove spaces and convert to lowercase for matching
            const clean = name.toLowerCase().replace(/\s+/g, '');

            // Check the map
            if (functionMap[clean]) {
                return functionMap[clean];
            }

            // Try to find by partial match
            const possibleMatches = Object.keys(functionMap).filter(key =>
                clean.includes(key) || key.includes(clean)
            );

            if (possibleMatches.length > 0) {
                return functionMap[possibleMatches[0]];
            }

            // Return original if no match
            return name;
        },

        revertAll: function () {
            const functions = Array.from(activeFunctions);
            functions.forEach(fn => this.revert(fn));
            return res(true, `Reverted ${functions.length} functions`, functions.length);
        },

        // ===== Function implementations (keep all your existing implementations) =====
        disableAllStyles: function () {
            let disabledLinks = 0;
            let clearedStyles = 0;

            document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
                el.dataset.__wdDisabled = el.disabled ? "1" : "0";
                if (!el.disabled) disabledLinks++;
                el.disabled = true;
            });

            document.querySelectorAll("style").forEach((el) => {
                if (!el.dataset.__wdOldText) el.dataset.__wdOldText = el.textContent || "";
                if (el.textContent) clearedStyles++;
                el.textContent = "";
            });

            if (disabledLinks === 0 && clearedStyles === 0) {
                return res(false, "No stylesheets found to disable");
            }
            return res(true, `Disabled styles: links=${disabledLinks}, embedded=${clearedStyles}`, disabledLinks + clearedStyles);
        },

        revertDisableAllStyles: function () {
            let restoredLinks = 0;
            let restoredStyles = 0;

            document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
                if (el.dataset.__wdDisabled) {
                    const prev = el.dataset.__wdDisabled === "1";
                    if (el.disabled !== prev) restoredLinks++;
                    el.disabled = prev;
                    delete el.dataset.__wdDisabled;
                } else {
                    if (el.disabled) restoredLinks++;
                    el.disabled = false;
                }
            });

            document.querySelectorAll("style").forEach((el) => {
                if (el.dataset.__wdOldText != null) {
                    el.textContent = el.dataset.__wdOldText;
                    delete el.dataset.__wdOldText;
                    restoredStyles++;
                }
            });

            return res(true, `Restored styles: links=${restoredLinks}, embedded=${restoredStyles}`, restoredLinks + restoredStyles);
        },

        disableBrowserDefault: function () {
            const id = "__wd_disable_browser_default";
            if (document.getElementById(id))
                return res(false, "Browser default already disabled");

            const style = document.createElement("style");
            style.id = id;
            style.textContent = `
        html, body { all: unset !important; display: block !important; }
        body { font-family: Arial, sans-serif !important; }
      `;
            document.documentElement.appendChild(style);

            return res(true, "Browser default styles disabled");
        },

        revertDisableBrowserDefault: function () {
            const el = document.getElementById("__wd_disable_browser_default");
            if (!el) return res(false, "Browser default was not disabled");
            el.remove();
            return res(true, "Browser default styles restored");
        },

        disableEmbedded: function () {
            const styles = document.querySelectorAll("style");
            if (!styles.length) return res(false, "No <style> tags found");

            let cleared = 0;
            styles.forEach((el) => {
                if (!el.dataset.__wdOldText) el.dataset.__wdOldText = el.textContent || "";
                if (el.textContent) cleared++;
                el.textContent = "";
            });

            if (!cleared) return res(false, "No embedded CSS content to disable");
            return res(true, `Embedded styles disabled (${cleared})`, cleared);
        },

        revertDisableEmbedded: function () {
            let restored = 0;
            document.querySelectorAll("style").forEach((el) => {
                if (el.dataset.__wdOldText != null) {
                    el.textContent = el.dataset.__wdOldText;
                    delete el.dataset.__wdOldText;
                    restored++;
                }
            });

            if (!restored) return res(false, "No embedded styles to restore");
            return res(true, `Embedded styles restored (${restored})`, restored);
        },

        disableInline: function () {
            const all = document.querySelectorAll("*");
            if (!all.length) return res(false, "No elements found");

            let changed = 0;
            all.forEach((el) => {
                if (!el.hasAttribute("data-old-style")) {
                    el.setAttribute("data-old-style", el.getAttribute("style") || "");
                }
                if (el.hasAttribute("style")) changed++;
                el.removeAttribute("style");
            });

            if (!changed) return res(false, "No inline styles found");
            return res(true, `Inline styles removed (${changed})`, changed);
        },

        revertDisableInline: function () {
            const all = document.querySelectorAll("*");
            let restored = 0;

            all.forEach((el) => {
                const old = el.getAttribute("data-old-style");
                if (old != null) {
                    if (old) el.setAttribute("style", old);
                    else el.removeAttribute("style");
                    el.removeAttribute("data-old-style");
                    restored++;
                }
            });

            if (!restored) return res(false, "No inline styles to restore");
            return res(true, `Inline styles restored (${restored})`, restored);
        },

        disableLinked: function () {
            const links = document.querySelectorAll('link[rel="stylesheet"]');
            if (!links.length) return res(false, "No linked stylesheets found");

            let disabled = 0;
            links.forEach((el) => {
                el.dataset.__wdDisabled = el.disabled ? "1" : "0";
                if (!el.disabled) disabled++;
                el.disabled = true;
            });

            if (!disabled) return res(false, "Linked stylesheets already disabled");
            return res(true, `Linked stylesheets disabled (${disabled})`, disabled);
        },

        revertDisableLinked: function () {
            const links = document.querySelectorAll('link[rel="stylesheet"]');
            if (!links.length) return res(false, "No linked stylesheets found");

            let restored = 0;
            links.forEach((el) => {
                if (el.dataset.__wdDisabled) {
                    const prev = el.dataset.__wdDisabled === "1";
                    if (el.disabled !== prev) restored++;
                    el.disabled = prev;
                    delete el.dataset.__wdDisabled;
                } else {
                    if (el.disabled) restored++;
                    el.disabled = false;
                }
            });

            return res(true, `Linked stylesheets restored (${restored})`, restored);
        },

        disablePrint: function () {
            let affected = 0;

            [...document.styleSheets].forEach((s) => {
                try {
                    const mt = s.media?.mediaText || "";
                    if (mt.includes("print")) {
                        if (!s.ownerNode?.dataset) return;
                        s.ownerNode.dataset.__wdPrintDisabled = s.disabled ? "1" : "0";
                        if (!s.disabled) affected++;
                        s.disabled = true;
                    }
                } catch { }
            });

            if (!affected)
                return res(false, "No print stylesheets found (or already disabled)");
            return res(true, `Print stylesheets disabled (${affected})`, affected);
        },

        revertDisablePrint: function () {
            let restored = 0;

            [...document.styleSheets].forEach((s) => {
                try {
                    const mt = s.media?.mediaText || "";
                    if (mt.includes("print")) {
                        const node = s.ownerNode;
                        if (node?.dataset?.__wdPrintDisabled != null) {
                            const prev = node.dataset.__wdPrintDisabled === "1";
                            if (s.disabled !== prev) restored++;
                            s.disabled = prev;
                            delete node.dataset.__wdPrintDisabled;
                        } else {
                            if (s.disabled) restored++;
                            s.disabled = false;
                        }
                    }
                } catch { }
            });

            if (!restored) return res(false, "No print stylesheets to restore");
            return res(true, `Print stylesheets restored (${restored})`, restored);
        },

        displayHandheld: function () {
            const links = document.querySelectorAll('link[media*="handheld"]');
            if (!links.length)
                return res(false, 'No stylesheets with media="handheld" found');

            let enabled = 0;
            links.forEach((s) => {
                if (s.disabled) enabled++;
                s.disabled = false;
            });

            if (!enabled) return res(false, "Handheld stylesheets already enabled");
            return res(true, `Handheld stylesheets enabled (${enabled})`, enabled);
        },

        revertDisplayHandheld: function () {
            const links = document.querySelectorAll('link[media*="handheld"]');
            if (!links.length)
                return res(false, 'No stylesheets with media="handheld" found');

            let disabled = 0;
            links.forEach((s) => {
                if (!s.disabled) disabled++;
                s.disabled = true;
            });

            if (!disabled) return res(false, "Handheld stylesheets already disabled");
            return res(true, `Handheld stylesheets disabled (${disabled})`, disabled);
        },

        displayPrint: function () {
            const links = document.querySelectorAll('link[media*="print"]');
            if (!links.length)
                return res(false, 'No stylesheets with media="print" found');

            let enabled = 0;
            links.forEach((s) => {
                if (s.disabled) enabled++;
                s.disabled = false;
            });

            if (!enabled) return res(false, "Print stylesheets already enabled");
            return res(true, `Print stylesheets enabled (${enabled})`, enabled);
        },

        revertDisplayPrint: function () {
            const links = document.querySelectorAll('link[media*="print"]');
            if (!links.length)
                return res(false, 'No stylesheets with media="print" found');

            let disabled = 0;
            links.forEach((s) => {
                if (!s.disabled) disabled++;
                s.disabled = true;
            });

            if (!disabled) return res(false, "Print stylesheets already disabled");
            return res(true, `Print stylesheets disabled (${disabled})`, disabled);
        },

        reloadLinked: function () {
            const links = document.querySelectorAll('link[rel="stylesheet"]');
            if (!links.length) return res(false, "No linked stylesheets found");

            let reloaded = 0;
            links.forEach((link) => {
                try {
                    const url = new URL(link.href);
                    url.searchParams.set("__wd_reload", String(Date.now()));
                    link.href = url.toString();
                    reloaded++;
                } catch {
                    const sep = link.href.includes("?") ? "&" : "?";
                    link.href = link.href + sep + "__wd_reload=" + Date.now();
                    reloaded++;
                }
            });

            return res(true, `Linked stylesheets reloaded (${reloaded})`, reloaded);
        },

        borderBox: function () {
            const id = "__wd_border_box";
            if (document.getElementById(id))
                return res(false, "Border-box already enabled");

            const style = document.createElement("style");
            style.id = id;
            style.textContent = `*,*::before,*::after{box-sizing:border-box !important;}`;
            document.documentElement.appendChild(style);

            return res(true, "Border-box enabled");
        },

        revertBorderBox: function () {
            const el = document.getElementById("__wd_border_box");
            if (!el) return res(false, "Border-box was not enabled");
            el.remove();
            return res(true, "Border-box disabled");
        },

        viewCSS: function () {
            const parts = [];
            for (const s of [...document.styleSheets]) {
                try {
                    const rules = [...s.cssRules].map((r) => r.cssText).join("\n");
                    if (rules.trim()) parts.push(rules);
                } catch { }
            }

            const styles = parts.join("\n\n/* ---------------- */\n\n");
            if (!styles.trim())
                return res(false, "No CSS rules available (cross-origin styles may be hidden)");

            const w = window.open("", "_blank");
            if (!w) return res(false, "Popup blocked. Allow popups to view CSS.");

            const esc = (t) =>
                String(t)
                    .replaceAll("&", "&amp;")
                    .replaceAll("<", "&lt;")
                    .replaceAll(">", "&gt;");

            w.document.write(
                `<pre style="white-space:pre-wrap;word-break:break-word;">${esc(styles)}</pre>`,
            );
            w.document.close();

            return res(true, "CSS opened in a new tab");
        },

        viewFonts: function () {
            return res(true, "Fonts viewer opened");
        }
    };

    window.cssFunctions = cssFunctions;
})();