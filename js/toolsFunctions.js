// js/toolsFunctions.js
(function () {
  "use strict";
  function norm(s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  // These functions now just return the URL to open
  // They don't try to use chrome.tabs API directly
  function getValidateCssUrl(currentUrl) {
    return `https://jigsaw.w3.org/css-validator/validator?uri=${encodeURIComponent(currentUrl)}`;
  }

  function getValidateHtmlUrl(currentUrl) {
    return `https://validator.w3.org/nu/?doc=${encodeURIComponent(currentUrl)}`;
  }

  function getValidateAccessibilityUrl(currentUrl) {
    return `https://wave.webaim.org/report#/${encodeURIComponent(currentUrl)}`;
  }

  function getValidateLinksUrl(currentUrl) {
    return `https://validator.w3.org/checklink?uri=${encodeURIComponent(currentUrl)}`;
  }

  function getValidateStructuredDataUrl(currentUrl) {
    return `https://search.google.com/test/rich-results?url=${encodeURIComponent(currentUrl)}`;
  }

  function getViewSourceUrl(currentUrl) {
    return `view-source:${currentUrl}`;
  }

  const RAW_MAP = {
    "Validate CSS": (url) => ({
      type: "url",
      url: getValidateCssUrl(url),
      message: "Opening CSS validator"
    }),

    "Validate Local CSS": () => ({
      type: "url",
      url: "https://jigsaw.w3.org/css-validator/",
      message: "Opening CSS validator"
    }),

    "Validate Feed": () => ({
      type: "url",
      url: "https://validator.w3.org/feed/",
      message: "Opening feed validator"
    }),

    "Validate HTML": (url) => ({
      type: "url",
      url: getValidateHtmlUrl(url),
      message: "Opening HTML validator"
    }),

    "Validate Accessibility": (url) => ({
      type: "url",
      url: getValidateAccessibilityUrl(url),
      message: "Opening accessibility checker"
    }),

    "Validate Links": (url) => ({
      type: "url",
      url: getValidateLinksUrl(url),
      message: "Opening link checker"
    }),

    "Validate Structured Data": (url) => ({
      type: "url",
      url: getValidateStructuredDataUrl(url),
      message: "Opening structured data validator"
    }),

    "View DNS Records": () => ({
      type: "url",
      url: "https://www.nslookup.io/",
      message: "Opening DNS lookup tool"
    }),

    "Validate Local HTML": () => ({
      type: "url",
      url: "https://validator.w3.org/",
      message: "Opening HTML validator"
    }),

    "View Source": (url) => ({
      type: "url",
      url: getViewSourceUrl(url),
      message: "Opening view source"
    }),
  };

  // normalize keys once
  const MAP = Object.fromEntries(
    Object.entries(RAW_MAP).map(([k, v]) => [norm(k), v]),
  );


  const toolsFunctions = {
    // Main method called by the executor
    async run(action) {
      return this.runByText(action);
    },

    async runByText(text, currentUrl) {

      const key = norm(text);

      const fn = MAP[key];
      if (!fn) {
        return {
          ok: false,
          message: `No tool mapped for: ${text}`
        };
      }

      if (!currentUrl) {
        // We're in content script, can't access tabs API
        // The URL will be passed from the popup
        return {
          ok: false,
          message: "URL required for this tool",
          needsUrl: true
        };
      }

      try {
        const needsUrl = fn.length >= 1;
        let result;

        if (!needsUrl) {
          result = fn();
        } else {
          // Validate URL
          if (!currentUrl.startsWith("http://") && !currentUrl.startsWith("https://")) {
            return {
              ok: false,
              message: "This tool works only for http/https pages"
            };
          }
          result = fn(currentUrl);
        }

        // Return the result to be handled by the popup
        return {
          ok: true,
          ...result
        };

      } catch (error) {
        return {
          ok: false,
          message: error.message
        };
      }
    },

    // Test method
    test() {
      return { ok: true, message: "toolsFunctions is loaded and working" };
    }
  };

  window.toolsFunctions = toolsFunctions;
})();