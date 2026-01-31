
const COOKIE_MSG_TYPE = "COOKIE_ACTION";

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

// Toggle a content setting globally (<all_urls>)
async function toggleGlobalContentSetting(settingObj, url, label) {
  const current = await settingObj.get({ primaryUrl: url });
  const currentSetting = current?.setting || "allow";
  const nextSetting = currentSetting === "block" ? "allow" : "block";

  await settingObj.set({
    primaryPattern: "<all_urls>",
    setting: nextSetting,
  });

  return {
    ok: true,
    setting: nextSetting,
    message: `Global ${label}: ${nextSetting.toUpperCase()}`,
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== COOKIE_MSG_TYPE) return;

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
    // ✅ GLOBAL TOGGLE: JAVASCRIPT
    // ---------------------------
    if (action === "toggleJavaScriptGlobal") {
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
    console.error("Background action error:", err);
    safeSend(sendResponse, { ok: false, error: String(err?.message || err) });
  });

  return true; 
});
