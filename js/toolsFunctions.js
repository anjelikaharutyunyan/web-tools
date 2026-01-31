// js/toolsFunctions.js
(function () {
    function getSafeUrl(url) {
        try {
            return new URL(url).toString();
        } catch {
            return null;
        }
    }

    function openTab(url) {
        return chrome.tabs.create({ url, active: true });
    }

    function openWithCurrentUrl(baseUrl, currentUrl) {
        const safe = getSafeUrl(currentUrl);
        if (!safe) throw new Error("Invalid current page URL");
        return openTab(baseUrl + encodeURIComponent(safe));
    }

    function openHome(url) {
        return openTab(url);
    }

    function viewSource(currentUrl) {
        const safe = getSafeUrl(currentUrl);
        if (!safe) throw new Error("Invalid current page URL");
        if (!safe.startsWith("http://") && !safe.startsWith("https://")) {
            throw new Error("View Source works only for http/https pages");
        }
        return openTab(`view-source:${safe}`);
    }

    const MAP = {
        "Validate CSS": (url) =>
            openWithCurrentUrl(
                "https://jigsaw.w3.org/css-validator/validator?uri=",
                url
            ),
            
        "Validate Local CSS": () =>
            openHome("https://jigsaw.w3.org/css-validator/"),

        "Validate Feed": (url) =>
            openHome("https://validator.w3.org/feed/"),

        "Validate HTML": (url) =>
            openWithCurrentUrl("https://validator.w3.org/nu/?doc=", url),

        "Validate Accessibility": (url) =>
            openWithCurrentUrl("https://wave.webaim.org/report#/", url),

        "Validate Links": (url) =>
            openWithCurrentUrl(
                "https://validator.w3.org/checklink?uri=",
                url
            ),

        "Validate Structured Data": (url) =>
            openWithCurrentUrl(
                "https://search.google.com/test/rich-results?url=",
                url
            ),

        "View DNS Records": (url) =>
            openHome("https://www.nslookup.io/"),

        "Validate Local HTML": () =>
            openHome("https://validator.w3.org/"),

        "View Source": (url) => viewSource(url),
    };

    window.toolsFunctions = {
        async runByText(text, currentUrl) {
            const fn = MAP[text];
            if (!fn) throw new Error(`No tool mapped for: ${text}`);
            return fn(currentUrl);
        },
    };
})();
