// js/weightInformation.js
(() => {
    const bytesFromString = (str) => {
        try {
            return new TextEncoder().encode(String(str)).length;
        } catch {
            return String(str).length;
        }
    };

    const formatBytes = (bytes) => {
        const b = Number(bytes) || 0;
        const kb = b / 1024;
        const mb = kb / 1024;
        if (mb >= 1) return `${mb.toFixed(2)} MB`;
        return `${kb.toFixed(2)} KB`;
    };

    const safeEntrySize = (e) =>
        e?.transferSize || e?.encodedBodySize || e?.decodedBodySize || 0;

    const getNavigationEntrySize = () => {
        const nav = performance.getEntriesByType("navigation")?.[0];
        if (!nav) return 0;
        return nav.transferSize || nav.encodedBodySize || nav.decodedBodySize || 0;
    };

    const computePageSizes = () => {
        const res = performance.getEntriesByType("resource") || [];

        const navHtmlBytes = getNavigationEntrySize();
        const domHtmlBytes = bytesFromString(document.documentElement?.outerHTML || "");
        const htmlBytes = navHtmlBytes || domHtmlBytes;

        let images = 0;
        let css = 0;
        let js = 0;
        let fonts = 0;
        let other = 0;

        for (const e of res) {
            const size = safeEntrySize(e);
            const it = String(e.initiatorType || "").toLowerCase();
            const name = String(e.name || "").toLowerCase();

            const isImg =
                it === "img" || /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(\?|#|$)/.test(name);

            const isCss = it === "link" || it === "css" || /\.css(\?|#|$)/.test(name);

            const isJs = it === "script" || /\.m?js(\?|#|$)/.test(name);

            const isFont = it === "font" || /\.(woff2?|ttf|otf|eot)(\?|#|$)/.test(name);

            if (isImg) images += size;
            else if (isFont) fonts += size;
            else if (isCss) css += size;
            else if (isJs) js += size;
            else other += size;
        }

        const totalResources = images + css + js + fonts + other;
        const totalPageWeightBytes = htmlBytes + totalResources;
        const requests = 1 + res.length;

        return {
            htmlBytes,
            imagesBytes: images,
            cssBytes: css,
            jsBytes: js,
            fontsBytes: fonts,
            otherBytes: other,
            totalPageWeightBytes,
            requests,
            note:
                "Note: Some resources may show 0 size due to Timing-Allow-Origin policy or cache.",
        };
    };

    const ok = (title, message) => ({
        ok: true,
        title,
        message: String(message ?? ""),
    });

    const fail = (message) => ({
        ok: false,
        title: "Page Size",
        message: String(message ?? "Unknown error"),
    });

    const oneShots = {
        pageWeight() {
            const s = computePageSizes();
            return ok(
                "Page weight (all)",
                [
                    `HTML document size: ${formatBytes(s.htmlBytes)}`,
                    `Total images size: ${formatBytes(s.imagesBytes)}`,
                    `Total CSS size: ${formatBytes(s.cssBytes)}`,
                    `Total JS size: ${formatBytes(s.jsBytes)}`,
                    `Fonts size: ${formatBytes(s.fontsBytes)}`,
                    `Other assets size: ${formatBytes(s.otherBytes)}`,
                    `Total page weight: ${formatBytes(s.totalPageWeightBytes)}`,
                    `Number of requests: ${s.requests}`,
                    ``,
                    s.note,
                ].join("\n"),
            );
        },


        "html document size (KB)": function () {
            const s = computePageSizes();
            return ok("HTML document size", formatBytes(s.htmlBytes));
        },
        "total images size (KB / MB)": function () {
            const s = computePageSizes();
            return ok("Total images size", formatBytes(s.imagesBytes));
        },
        "total css size": function () {
            const s = computePageSizes();
            return ok("Total CSS size", formatBytes(s.cssBytes));
        },
        "total js size": function () {
            const s = computePageSizes();
            return ok("Total JS size", formatBytes(s.jsBytes));
        },
        "fonts size": function () {
            const s = computePageSizes();
            return ok("Fonts size", formatBytes(s.fontsBytes));
        },
        "other assets size": function () {
            const s = computePageSizes();
            return ok("Other assets size", formatBytes(s.otherBytes));
        },
        "total page weight": function () {
            const s = computePageSizes();
            return ok("Total page weight", formatBytes(s.totalPageWeightBytes));
        },
        "number of requests": function () {
            const s = computePageSizes();
            return ok("Number of requests", String(s.requests));
        },

        // Keep the camelCase versions for backward compatibility
        htmlDocumentSize() {
            const s = computePageSizes();
            return ok("HTML document size", formatBytes(s.htmlBytes));
        },
        totalImagesSize() {
            const s = computePageSizes();
            return ok("Total images size", formatBytes(s.imagesBytes));
        },
        totalCssSize() {
            const s = computePageSizes();
            return ok("Total CSS size", formatBytes(s.cssBytes));
        },
        totalJsSize() {
            const s = computePageSizes();
            return ok("Total JS size", formatBytes(s.jsBytes));
        },
        fontsSize() {
            const s = computePageSizes();
            return ok("Fonts size", formatBytes(s.fontsBytes));
        },
        otherAssetsSize() {
            const s = computePageSizes();
            return ok("Other assets size", formatBytes(s.otherBytes));
        },
        totalPageWeight() {
            const s = computePageSizes();
            return ok("Total page weight", formatBytes(s.totalPageWeightBytes));
        },
        numberOfRequests() {
            const s = computePageSizes();
            return ok("Number of requests", String(s.requests));
        },
    };

    window.weightInformationFunctions = {
        run(name) {
            try {
                const fn = oneShots[name];
                if (!fn) return fail(`Function "${name}" not found`);
                return fn();
            } catch (e) {
                return fail(String(e?.message || e));
            }
        },
    };
})();
