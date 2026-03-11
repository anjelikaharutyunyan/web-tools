window.seoFunctions = (() => {
    "use strict";

    const MAX_SAMPLES = 20;

    const normalizeText = (s) =>
        String(s ?? "")
            .replace(/\s+/g, " ")
            .trim();

    const take = (arr, n = MAX_SAMPLES) => arr.slice(0, n);

    const ok = (message, data = {}) => ({ ok: true, message, data });
    const fail = (message, data = {}) => ({ ok: false, message, data });

    const absUrl = (u) => {
        try {
            return new URL(u, document.baseURI).href;
        } catch {
            return null;
        }
    };

    const getRelTokens = (el) => {
        const rel = normalizeText(el?.getAttribute?.("rel"));
        if (!rel) return new Set();
        return new Set(rel.toLowerCase().split(/\s+/g).filter(Boolean));
    };

    const normalizeCommand = (raw) => {
        const s = normalizeText(raw).toLowerCase();
        return s
            .replace(/[✓✗]+/g, "")
            .replace(/\(.*?\)/g, "")
            .replace(/\s+/g, " ")
            .trim();
    };

    // ============= NEW: Apply/Revert Methods for Toggle Functionality =============

    // Track active features
    const activeFeatures = new Set();

    // Apply function - called when button is clicked (activate)
    const apply = (action) => {
        const key = normalizeCommand(action);

        // Run the SEO check
        const result = runByText(action);

        // Mark as active
        activeFeatures.add(key);

        return result;
    };

    // Revert function - called when button is clicked again (deactivate)
    const revert = (action) => {
        const key = normalizeCommand(action);

        // Remove active state
        activeFeatures.delete(key);

        // Just return success message - no visual cleanup needed
        return ok(`${action} deactivated`);
    };

    // Reset all - called during undo
    const resetAll = () => {
        // Clear all active features
        activeFeatures.clear();
        return ok("All SEO features reset");
    };

    // ============= Original Functions (unchanged) =============

    async function checkMetaTags() {
        const metas = Array.from(document.querySelectorAll("meta[name], meta[property]"));
        const named = metas.filter((m) => m.hasAttribute("name"));
        const propd = metas.filter((m) => m.hasAttribute("property"));

        const samples = take(
            metas.map((m) => ({
                name: m.getAttribute("name") || null,
                property: m.getAttribute("property") || null,
                content: normalizeText(m.getAttribute("content")),
            })),
        );

        return ok(`Meta tags found: ${metas.length}`, {
            total: metas.length,
            nameCount: named.length,
            propertyCount: propd.length,
            samples,
        });
    }

    async function checkHeadings() {
        const hs = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"));
        const counts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

        hs.forEach((h) => {
            const k = h.tagName.toLowerCase();
            counts[k] = (counts[k] || 0) + 1;
        });

        const h1Texts = take(
            hs
                .filter((h) => h.tagName.toLowerCase() === "h1")
                .map((h) => normalizeText(h.textContent)),
        );

        const msg = `Headings total: ${hs.length} (H1:${counts.h1}, H2:${counts.h2}, H3:${counts.h3})`;
        return ok(msg, { total: hs.length, counts, h1Texts });
    }

    async function checkCanonical() {
        const link = document.querySelector("link[rel='canonical']");
        const href = link?.getAttribute("href");
        const canonical = href ? absUrl(href) : null;

        if (!canonical) return fail("No canonical tag found", { canonical: null });
        return ok(`Canonical found: ${canonical}`, { canonical });
    }

    async function checkRobots() {
        const meta = document.querySelector("meta[name='robots']");
        const content = normalizeText(meta?.getAttribute("content"));

        if (!meta) return fail("No robots meta tag", { robots: null });
        return ok(`Robots meta: ${content || "(empty)"}`, { robots: content });
    }

    async function checkStructuredData() {
        const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));

        const parsed = [];
        const errors = [];

        for (const s of take(scripts, MAX_SAMPLES)) {
            const raw = normalizeText(s.textContent);
            if (!raw) continue;
            try {
                const json = JSON.parse(raw);
                const types = extractSchemaTypes(json);
                parsed.push({ types: take(types, 10) });
            } catch (e) {
                errors.push(String(e?.message || e));
            }
        }

        const okFlag = scripts.length > 0 && errors.length === 0;
        const msg =
            `Structured data scripts: ${scripts.length}` + (errors.length ? ` (parse errors: ${errors.length})` : "");

        return (okFlag ? ok : fail)(msg, {
            count: scripts.length,
            parsedSamples: parsed,
            parseErrors: take(errors, 5),
        });
    }

    function extractSchemaTypes(node) {
        const out = [];
        const walk = (x) => {
            if (!x) return;
            if (Array.isArray(x)) return x.forEach(walk);
            if (typeof x === "object") {
                if (x["@type"]) {
                    if (Array.isArray(x["@type"])) out.push(...x["@type"].map(String));
                    else out.push(String(x["@type"]));
                }
                if (x["@graph"]) walk(x["@graph"]);
            }
        };
        walk(node);
        return Array.from(new Set(out.map((t) => normalizeText(t))));
    }

    async function checkAltAttributes() {
        const imgs = Array.from(document.querySelectorAll("img"));

        const info = imgs.map((img) => {
            const hasAttr = img.hasAttribute("alt");
            const raw = hasAttr ? (img.getAttribute("alt") ?? "") : null;
            const alt = raw == null ? null : normalizeText(raw);
            return { img, hasAttr, alt };
        });

        const missingAttr = info.filter((x) => !x.hasAttr);
        const emptyAlt = info.filter((x) => x.hasAttr && x.alt === "");
        const withAlt = info.filter((x) => x.hasAttr && x.alt && x.alt.length > 0);

        const samplesMissing = take(
            missingAttr.map((x) => ({
                src: absUrl(x.img.getAttribute("src")) || x.img.getAttribute("src") || null,
            })),
        );

        const samplesEmpty = take(
            emptyAlt.map((x) => ({
                src: absUrl(x.img.getAttribute("src")) || x.img.getAttribute("src") || null,
            })),
        );

        const msg = `Images: ${imgs.length} | with alt: ${withAlt.length} | empty alt: ${emptyAlt.length} | missing alt attr: ${missingAttr.length}`;
        const okFlag = missingAttr.length === 0;

        return (okFlag ? ok : fail)(msg, {
            totalImages: imgs.length,
            withAlt: withAlt.length,
            emptyAlt: emptyAlt.length,
            missingAltAttr: missingAttr.length,
            samples: { missingAltAttr: samplesMissing, emptyAlt: samplesEmpty },
        });
    }

    async function checkLinks() {
        const links = Array.from(document.querySelectorAll("a[href]"));

        const external = [];
        const internal = [];
        const nofollow = [];
        const broken = [];

        for (const a of links) {
            const href = a.getAttribute("href");
            const abs = href ? absUrl(href) : null;
            if (!abs) {
                broken.push({ href: href || null, text: normalizeText(a.textContent) });
                continue;
            }

            const url = new URL(abs);
            const sameHost = url.host === location.host;
            (sameHost ? internal : external).push(abs);

            const relTokens = getRelTokens(a);
            if (relTokens.has("nofollow")) nofollow.push(abs);
        }

        return ok(
            `Links found: ${links.length} (internal:${internal.length}, external:${external.length}, nofollow:${nofollow.length})`,
            {
                total: links.length,
                internal: internal.length,
                external: external.length,
                nofollow: nofollow.length,
                broken: broken.length,
                samples: {
                    external: take(external),
                    nofollow: take(nofollow),
                    broken: take(broken),
                },
            },
        );
    }

    async function checkTitleLength() {
        const title = normalizeText(document.title);
        if (!title) return fail("No <title> set", { length: 0, title: "" });
        return ok(`Title length: ${title.length}`, { length: title.length, title });
    }

    async function checkDescriptionLength() {
        const meta = document.querySelector("meta[name='description']");
        const desc = normalizeText(meta?.getAttribute("content"));
        if (!desc) return fail("No meta description", { length: 0, description: "" });
        return ok(`Description length: ${desc.length}`, { length: desc.length, description: desc });
    }

    async function checkHreflang() {
        const links = Array.from(document.querySelectorAll("link[rel='alternate'][hreflang]"));
        const items = take(
            links.map((l) => ({
                hreflang: normalizeText(l.getAttribute("hreflang")),
                href: absUrl(l.getAttribute("href")) || l.getAttribute("href") || null,
            })),
        );

        return (links.length ? ok : fail)(`hreflang tags: ${links.length}`, {
            count: links.length,
            samples: items,
        });
    }

    async function checkSitemap() {
        const origin = location.origin;

        const abs = (u) => {
            try {
                return new URL(u, origin).href;
            } catch {
                return null;
            }
        };

        const fetchStatus = async (url) => {
            try {
                const r = await fetch(url, { method: "HEAD", cache: "no-store" });
                if (r.ok) return { ok: true, status: r.status, via: "HEAD" };
                if (r.status === 405 || r.status === 403) throw new Error(`HEAD ${r.status}`);
                return { ok: false, status: r.status, via: "HEAD" };
            } catch {
                try {
                    const r = await fetch(url, { method: "GET", cache: "no-store" });
                    return { ok: r.ok, status: r.status, via: "GET" };
                } catch (e) {
                    return { ok: false, status: 0, via: "NETWORK_ERROR", error: String(e?.message || e) };
                }
            }
        };

        const parseRobotsForSitemaps = (robotsText) => {
            const lines = String(robotsText || "").split(/\r?\n/);
            const sitemaps = [];

            for (const line of lines) {
                const m = line.match(/^\s*sitemap\s*:\s*(.+)\s*$/i);
                if (!m) continue;
                const url = m[1].trim();
                const full = abs(url) || url;
                sitemaps.push(full);
            }

            return Array.from(new Set(sitemaps));
        };

        const robotsUrl = `${origin}/robots.txt`;
        let robotsFound = false;
        let robotsSitemaps = [];
        let robotsFetch = null;

        try {
            const r = await fetch(robotsUrl, { method: "GET", cache: "no-store" });
            robotsFetch = { status: r.status, ok: r.ok };
            if (r.ok) {
                robotsFound = true;
                const text = await r.text();
                robotsSitemaps = parseRobotsForSitemaps(text);
            }
        } catch (e) {
            robotsFetch = { status: 0, ok: false, error: String(e?.message || e) };
        }

        if (robotsSitemaps.length > 0) {
            const checks = [];
            for (const u of robotsSitemaps) {
                const url = abs(u) || u;
                const st = await fetchStatus(url);
                checks.push({ url, ...st });
            }

            const okAny = checks.some((c) => c.ok);
            return {
                ok: okAny,
                message: `robots.txt declares ${robotsSitemaps.length} sitemap(s)`,
                data: {
                    origin,
                    robots: { url: robotsUrl, ...robotsFetch, declared: robotsSitemaps.length },
                    sitemaps: checks,
                },
            };
        }

        const common = [
            `${origin}/sitemap.xml`,
            `${origin}/sitemap_index.xml`,
            `${origin}/sitemap-index.xml`,
            `${origin}/sitemap/`,
        ];

        const commonChecks = [];
        for (const url of common) {
            const st = await fetchStatus(url);
            commonChecks.push({ url, ...st });
        }

        const found = commonChecks.filter((c) => c.ok);
        const okAny = found.length > 0;

        if (okAny) {
            const urls = found.map((x) => x.url);
            return {
                ok: true,
                message: `Sitemap found: ${urls[0]}`,
                data: {
                    origin,
                    robots: { url: robotsUrl, ...robotsFetch, declared: 0, robotsFound },
                    found,
                    triedCommon: commonChecks,
                },
            };
        }

        return {
            ok: false,
            message: robotsFound
                ? "robots.txt found but no Sitemap listed, and no common sitemap URLs found"
                : "robots.txt not found (or blocked) and no common sitemap URLs found",
            data: {
                origin,
                robots: { url: robotsUrl, ...robotsFetch, declared: 0, robotsFound },
                triedCommon: commonChecks,
            },
        };
    }

    async function checkFavicon() {
        const icons = Array.from(document.querySelectorAll("link[rel~='icon']"));
        const items = take(
            icons.map((l) => ({
                rel: normalizeText(l.getAttribute("rel")),
                href: absUrl(l.getAttribute("href")) || l.getAttribute("href") || null,
                sizes: normalizeText(l.getAttribute("sizes")),
                type: normalizeText(l.getAttribute("type")),
            })),
        );

        return (icons.length ? ok : fail)(
            icons.length ? `Favicon links: ${icons.length}` : "No favicon link tags",
            { count: icons.length, samples: items },
        );
    }

    async function checkOpenGraph() {
        const metas = Array.from(document.querySelectorAll("meta[property^='og:']"));
        const items = take(
            metas.map((m) => ({
                property: normalizeText(m.getAttribute("property")),
                content: normalizeText(m.getAttribute("content")),
            })),
        );

        return (metas.length ? ok : fail)(`Open Graph tags: ${metas.length}`, {
            count: metas.length,
            samples: items,
        });
    }

    async function checkTwitterCards() {
        const metas = Array.from(document.querySelectorAll("meta[name^='twitter:']"));
        const items = take(
            metas.map((m) => ({
                name: normalizeText(m.getAttribute("name")),
                content: normalizeText(m.getAttribute("content")),
            })),
        );

        return (metas.length ? ok : fail)(`Twitter card tags: ${metas.length}`, {
            count: metas.length,
            samples: items,
        });
    }

    async function checkHtmlLang() {
        const lang = normalizeText(document.documentElement.getAttribute("lang"));
        return (lang ? ok : fail)(`HTML lang: ${lang || "not set"}`, { lang: lang || null });
    }

    const runByText = async (text) => {
        const key = normalizeCommand(text);

        const map = new Map([
            ["check meta tags", checkMetaTags],
            ["check headings", checkHeadings],
            ["check canonical", checkCanonical],
            ["check robots", checkRobots],
            ["check structured data", checkStructuredData],
            ["check alt attributes", checkAltAttributes],
            ["check links", checkLinks],
            ["check title length", checkTitleLength],
            ["check description length", checkDescriptionLength],
            ["check hreflang", checkHreflang],
            ["check sitemap", checkSitemap],
            ["check favicon", checkFavicon],
            ["check open graph", checkOpenGraph],
            ["check twitter cards", checkTwitterCards],
            ["check html lang", checkHtmlLang],
        ]);

        const fn = map.get(key);
        if (!fn) return fail(`Unknown SEO function: ${key}`, { key, original: String(text ?? "") });

        try {
            const out = await fn();
            if (out && typeof out === "object") {
                out.data = out.data || {};
                out.data.__command = key;
                out.data.__href = location.href;
            }
            return out;
        } catch (e) {
            return fail(`SEO error: ${String(e?.message || e)}`, { key, href: location.href });
        }
    };

    // Return updated interface with apply/revert methods
    return {
        runByText,
        normalizeCommand,
        apply,      // For toggle activation
        revert,     // For toggle deactivation
        resetAll    // For undo functionality
    };
})();