const COOKIE_MSG_TYPE = "COOKIE_ACTION";
const MISC_MSG_TYPE = "MISCELLANEOUS_ACTION";
const UNINSTALL_URL = "https://berdlteam.github.io/web-tools-uninstall/";

function safeSend(sendResponse, payload) {
  try {
    sendResponse(payload);
  } catch { }
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function normalizeHost(domainOrHost) {
  return String(domainOrHost || "").replace(/^\./, "").trim();
}

// Get cookies for URL then filter by domain match
async function getCookiesForDomain(url, domain) {
  const cookies = await chrome.cookies.getAll({ url });
  const host = normalizeHost(domain);
  if (!host) return cookies;

  return cookies.filter((c) => {
    const cDom = normalizeHost(c.domain);
    return cDom === host || host.endsWith("." + cDom) || cDom.endsWith("." + host);
  });
}

// Build removal URL that matches cookie's domain + path and current protocol
function buildRemovalUrl(pageUrl, cookieDomain, cookiePath) {
  const u = new URL(pageUrl);
  const host = normalizeHost(cookieDomain) || u.hostname;
  const path = (cookiePath || "/").startsWith("/")
    ? (cookiePath || "/")
    : "/" + (cookiePath || "/");
  return `${u.protocol}//${host}${path}`;
}

async function removeCookieByObject(pageUrl, cookie) {
  const removalUrl = buildRemovalUrl(pageUrl, cookie.domain, cookie.path);
  return chrome.cookies.remove({
    url: removalUrl,
    name: cookie.name,
    storeId: cookie.storeId,
  });
}

// Remove cookie by payload (WebDeveloper-style deleteCookie)
async function removeCookieByPayload(payload) {
  const pageUrl = payload.url;
  const name = payload.name;
  const domain = payload.domain || new URL(pageUrl).hostname;
  const path = payload.path || "/";
  const storeId = payload.storeId;

  const removalUrl = buildRemovalUrl(pageUrl, domain, path);

  return chrome.cookies.remove({
    url: removalUrl,
    name,
    storeId,
  });
}

// Set cookie by payload (WebDeveloper-style addCookie)
async function setCookieByPayload(payload) {
  const url = payload.url;
  if (!isValidUrl(url)) throw new Error("Invalid URL for setCookie");

  const details = {
    url,
    name: String(payload.name || ""),
    value: String(payload.value || ""),
    path: payload.path || "/",
    secure: !!payload.secure,
  };

  if (payload.domain) details.domain = payload.domain;

  if (payload.session === false) {
    const exp = Number(payload.expirationDate);
    if (Number.isFinite(exp) && exp > 0) details.expirationDate = exp;
  }

  const res = await chrome.cookies.set(details);
  if (!res) throw new Error("chrome.cookies.set failed");
  return res;
}

// Toggle a content setting for a specific URL
async function toggleContentSetting(settingObj, url, label) {
  try {
    // Get current setting for this URL
    const current = await settingObj.get({
      primaryUrl: url,
      incognito: false
    });

    const currentSetting = current?.setting || "allow";
    const nextSetting = currentSetting === "block" ? "allow" : "block";

    // Create a pattern for this specific domain
    const urlObj = new URL(url);
    const pattern = `${urlObj.protocol}//${urlObj.hostname}/*`;

    await settingObj.set({
      primaryPattern: pattern,
      setting: nextSetting,
      scope: 'regular'
    });

    return {
      ok: true,
      setting: nextSetting,
      message: `${label} ${nextSetting === 'block' ? 'disabled' : 'enabled'} for ${urlObj.hostname}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

// Toggle a content setting globally (<all_urls>)
async function toggleGlobalContentSetting(settingObj, url, label) {
  const current = await settingObj.get({ primaryUrl: url });
  const currentSetting = current?.setting || "allow";
  const nextSetting = currentSetting === "block" ? "allow" : "block";

  await settingObj.set({
    primaryPattern: "<all_urls>",
    setting: nextSetting,
    scope: 'regular'
  });

  return {
    ok: true,
    setting: nextSetting,
    message: `Global ${label}: ${nextSetting.toUpperCase()}`,
  };
}

// Clear cache function
async function clearCache() {
  return new Promise((resolve) => {
    chrome.browsingData.removeCache({}, () => {
      resolve({ ok: true, message: "Cache cleared successfully" });
    });
  });
}

// Clear history function
async function clearHistory() {
  return new Promise((resolve) => {
    chrome.browsingData.removeHistory({}, () => {
      resolve({ ok: true, message: "History cleared successfully" });
    });
  });
}

// Single message listener for all actions
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Handle COOKIE_ACTION messages
  if (msg && msg.type === COOKIE_MSG_TYPE) {
    (async () => {
      const { action, payload } = msg;
      const url = payload?.url;

      // actions that need valid URL
      const needsUrl = [
        "disableCookiesGlobalToggle",
        "toggleJavaScriptGlobal",
        "toggleImagesGlobal",
        "setCookie",
        "removeCookie",
        "deleteDomainCookies",
        "deletePathCookies",
        "deleteSessionCookies",
        "viewCookieInfo",
      ].includes(action);

      if (needsUrl && (typeof url !== "string" || !isValidUrl(url))) {
        return safeSend(sendResponse, { ok: false, error: "Invalid URL" });
      }

      const u = isValidUrl(url) ? new URL(url) : null;
      const domain = payload?.domain || u?.hostname || "";
      const pathRaw = payload?.path || u?.pathname || "/";
      const path = String(pathRaw || "/").startsWith("/")
        ? String(pathRaw || "/")
        : "/" + String(pathRaw || "/");

      // ---------------------------
      // ✅ GLOBAL TOGGLE: COOKIES
      // ---------------------------
      if (action === "disableCookiesGlobalToggle") {
        const out = await toggleGlobalContentSetting(
          chrome.contentSettings.cookies,
          url,
          "cookies"
        );
        return safeSend(sendResponse, out);
      }

      // ---------------------------
      // ✅ TOGGLE JAVASCRIPT (per domain)
      // ---------------------------
      if (action === "toggleJavaScriptGlobal") {
        // If forceAllow is true, always set to allow regardless of current state
        if (payload.forceAllow) {
          try {
            const urlObj = new URL(url);
            const pattern = `${urlObj.protocol}//${urlObj.hostname}/*`;

            await chrome.contentSettings.javascript.set({
              primaryPattern: pattern,
              setting: "allow",
              scope: 'regular'
            });

            return safeSend(sendResponse, {
              ok: true,
              setting: "allow",
              message: `JavaScript enabled for ${urlObj.hostname}`,
            });
          } catch (error) {
            return safeSend(sendResponse, { ok: false, error: error.message });
          }
        }

        // Normal toggle behavior
        const out = await toggleContentSetting(
          chrome.contentSettings.javascript,
          url,
          "JavaScript"
        );
        return safeSend(sendResponse, out);
      }
      // ---------------------------
      // ✅ GLOBAL TOGGLE: JAVASCRIPT (if you want global toggle)
      // ---------------------------
      if (action === "toggleJavaScriptGlobalAllUrls") {
        const out = await toggleGlobalContentSetting(
          chrome.contentSettings.javascript,
          url,
          "JavaScript"
        );
        return safeSend(sendResponse, out);
      }

      // ---------------------------
      // ✅ GLOBAL TOGGLE: IMAGES
      // ---------------------------
      if (action === "toggleImagesGlobal") {
        const out = await toggleGlobalContentSetting(
          chrome.contentSettings.images,
          url,
          "images"
        );
        return safeSend(sendResponse, out);
      }

      // ---------------------------
      // ✅ WebDeveloper support: setCookie
      // ---------------------------
      if (action === "setCookie") {
        const created = await setCookieByPayload(payload);
        return safeSend(sendResponse, {
          ok: true,
          message: "Cookie set",
          cookie: created,
        });
      }

      // ---------------------------
      // ✅ WebDeveloper support: removeCookie
      // ---------------------------
      if (action === "removeCookie") {
        const removed = await removeCookieByPayload(payload);
        return safeSend(sendResponse, {
          ok: true,
          message: removed ? "Cookie removed" : "Cookie not found",
          removed,
        });
      }

      // ---------------------------
      // Delete domain cookies
      // ---------------------------
      if (action === "deleteDomainCookies") {
        const cookies = await getCookiesForDomain(url, domain);
        let removed = 0;

        for (const c of cookies) {
          const r = await removeCookieByObject(url, c);
          if (r) removed++;
        }

        return safeSend(sendResponse, {
          ok: true,
          removed,
          message: `Deleted ${removed} cookies for domain: ${domain}`,
        });
      }

      // ---------------------------
      // Delete cookies for exact path
      // ---------------------------
      if (action === "deletePathCookies") {
        const cookies = await getCookiesForDomain(url, domain);
        let removed = 0;

        for (const c of cookies) {
          if ((c.path || "/") === path) {
            const r = await removeCookieByObject(url, c);
            if (r) removed++;
          }
        }

        return safeSend(sendResponse, {
          ok: true,
          removed,
          message: `Deleted ${removed} cookies for ${domain}${path}`,
        });
      }

      // ---------------------------
      // Delete session cookies only
      // ---------------------------
      if (action === "deleteSessionCookies") {
        const cookies = await getCookiesForDomain(url, domain);
        let removed = 0;

        for (const c of cookies) {
          if (c.session) {
            const r = await removeCookieByObject(url, c);
            if (r) removed++;
          }
        }

        return safeSend(sendResponse, {
          ok: true,
          removed,
          message: `Deleted ${removed} SESSION cookies for domain: ${domain}`,
        });
      }

      // ---------------------------
      // View cookies info
      // ---------------------------
      if (action === "viewCookieInfo") {
        const cookies = await getCookiesForDomain(url, domain);
        return safeSend(sendResponse, {
          ok: true,
          domain,
          count: cookies.length,
          cookies,
        });
      }

      return safeSend(sendResponse, { ok: false, error: `Unknown action: ${action}` });
    })().catch((err) => {
      safeSend(sendResponse, { ok: false, error: String(err?.message || err) });
    });

    return true; // Keep message channel open for async response
  }

  // Handle MISCELLANEOUS_ACTION messages
  if (msg && msg.type === MISC_MSG_TYPE) {
    (async () => {
      const { action } = msg;

      if (action === "clearCache") {
        const result = await clearCache();
        return safeSend(sendResponse, result);
      }

      if (action === "clearHistory") {
        const result = await clearHistory();
        return safeSend(sendResponse, result);
      }

      return safeSend(sendResponse, { ok: false, error: `Unknown miscellaneous action: ${action}` });
    })().catch((err) => {
      safeSend(sendResponse, { ok: false, error: String(err?.message || err) });
    });

    return true; // Keep message channel open for async response
  }

  // Handle keep-alive messages
  if (msg && msg.type === 'KEEP_POPUP_ALIVE') {
    safeSend(sendResponse, { ok: true });
    return false;
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.runtime.setUninstallURL(UNINSTALL_URL);

  if (details?.reason === "install") {
    try {
      await chrome.tabs.create({ url: WELCOME_URL });
    } catch (e) { }
  }

  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !isInjectableUrl(tab.url)) continue;
      await injectContentScript(tab.id);
    }
  } catch (e) { }
});