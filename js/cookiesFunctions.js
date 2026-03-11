// js/cookiesFunctions.js (FULL)

(function () {
  const MSG_TYPE = "COOKIE_ACTION";

  // ---------------------------
  // Minimal WebDeveloper namespace
  // ---------------------------
  var WebDeveloper = window.WebDeveloper || {}; 
  WebDeveloper.Cookies = WebDeveloper.Cookies || {};


  function getPageInfo() {
    try {
      const u = new URL(location.href);
      return {
        url: u.href,
        host: u.hostname,
        origin: u.origin,
        path: u.pathname || "/",
        secure: u.protocol === "https:",
      };
    } catch {
      return { url: location.href, host: "", origin: "", path: "/", secure: false };
    }
  }

  function sendToBackground(action, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: MSG_TYPE, action, payload }, (res) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        resolve(res);
      });
    });
  }

  // Convert Chrome cookie object -> "WebDeveloper cookie" shape used by old functions
  function toWDCookie(c) {
    return {
      name: c.name,
      value: c.value,
      host: (c.domain || "").replace(/^\./, ""),
      path: c.path || "/",
      secure: !!c.secure,
      session: !!c.session,
      // expires is only used when adding cookie
    };
  }

  // ---------------------------
  // WebDeveloper.Cookies methods (adapted to MV3)
  // ---------------------------

  // Sanitizes a cookie host
  WebDeveloper.Cookies.sanitizeHost = function (host) {
    if (host && host.charAt(0) === ".") return host.substring(1);
    return host;
  };

  // Returns tomorrow's date as a string
  WebDeveloper.Cookies.getDateTomorrow = function () {
    var date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toUTCString();
  };

  // Returns true if you can edit a local cookie
  WebDeveloper.Cookies.canEditLocalCookie = function () {
    return false;
  };

  // Adds a cookie (via background)
  WebDeveloper.Cookies.addCookie = async function (cookie) {
    var host = WebDeveloper.Cookies.sanitizeHost(String(cookie.host || "").trim());
    var name = String(cookie.name || "").trim();
    var value = String(cookie.value || "").trim();
    var secure = !!cookie.secure;
    var path = String(cookie.path || "/").trim() || "/";

    if (!host) throw new Error("Cookie host is required");
    if (!name) throw new Error("Cookie name is required");

    // Protocol based on secure
    var protocol = secure ? "https://" : "http://";
    var url = protocol + host + path;

    // If session cookie: no expirationDate
    if (cookie.session) {
      return await sendToBackground("setCookie", {
        url,
        domain: host,
        name,
        value,
        secure,
        path,
        session: true,
      });
    }

    // Persistent cookie: parse expires
    var exp = cookie.expires ? new Date(String(cookie.expires).trim()) : null;
    var expSeconds = exp ? Math.floor(exp.getTime() / 1000) : null;

    if (!expSeconds || Number.isNaN(expSeconds)) {
      // fallback: tomorrow
      expSeconds = Math.floor(new Date(WebDeveloper.Cookies.getDateTomorrow()).getTime() / 1000);
    }

    return await sendToBackground("setCookie", {
      url,
      domain: host,
      name,
      value,
      secure,
      path,
      session: false,
      expirationDate: expSeconds,
    });
  };

  // Deletes a cookie (via background)
  WebDeveloper.Cookies.deleteCookie = async function (cookie) {
    var protocol = cookie.secure ? "https://" : "http://";
    var url = protocol + cookie.host + cookie.path;

    return await sendToBackground("removeCookie", {
      url,
      name: cookie.name,
      storeId: cookie.storeId, // optional
      domain: cookie.host,
      path: cookie.path,
      secure: !!cookie.secure,
    });
  };

  // Deletes all cookies for current domain (expects cookies list in WebDev shape)
  WebDeveloper.Cookies.deleteDomainCookies = async function (cookies) {
    var cookiesLength = cookies.length;

    if (cookiesLength === 0) {
      return { ok: true, removed: 0, message: "No domain cookies found" };
    }

    let removed = 0;
    for (var i = 0; i < cookiesLength; i++) {
      const res = await WebDeveloper.Cookies.deleteCookie(cookies[i]);
      if (res?.ok) removed++;
    }

    return { ok: true, removed, message: `Deleted ${removed} domain cookies` };
  };

  // Deletes all cookies for current path (expects cookies list in WebDev shape)
  WebDeveloper.Cookies.deletePathCookies = async function (cookies) {
    var cookiesLength = cookies.length;

    if (cookiesLength === 0) {
      return { ok: true, removed: 0, message: "No path cookies found" };
    }

    let removed = 0;
    for (var i = 0; i < cookiesLength; i++) {
      const res = await WebDeveloper.Cookies.deleteCookie(cookies[i]);
      if (res?.ok) removed++;
    }

    return { ok: true, removed, message: `Deleted ${removed} path cookies` };
  };

  // Deletes all session cookies (expects ALL cookies list in WebDev shape)
  WebDeveloper.Cookies.deleteSessionCookies = async function (allCookies) {
    var cookies = [];
    for (var i = 0, l = allCookies.length; i < l; i++) {
      if (allCookies[i].session) cookies.push(allCookies[i]);
    }

    var cookiesLength = cookies.length;
    if (cookiesLength === 0) {
      return { ok: true, removed: 0, message: "No session cookies found" };
    }

    let removed = 0;
    for (i = 0; i < cookiesLength; i++) {
      const res = await WebDeveloper.Cookies.deleteCookie(cookies[i]);
      if (res?.ok) removed++;
    }

    return { ok: true, removed, message: `Deleted ${removed} session cookies` };
  };

  // ---------------------------
  // Adapter used by your popup actions
  // ---------------------------

  async function disableCookies() {
    const info = getPageInfo();
    return await sendToBackground("disableCookiesGlobalToggle", { url: info.url });
  }

  async function viewCookieInfo() {
    const info = getPageInfo();
    return await sendToBackground("viewCookieInfo", { url: info.url, domain: info.host });
  }

  async function deleteDomainCookies() {
    const info = getPageInfo();
    const list = await sendToBackground("viewCookieInfo", { url: info.url, domain: info.host });
    const cookies = (list?.cookies || []).map(toWDCookie);

    return await WebDeveloper.Cookies.deleteDomainCookies(cookies);
  }

  async function deletePathCookies(extra = {}) {
    const info = getPageInfo();
    const targetPath = (extra.path || info.path || "/").trim() || "/";
    const list = await sendToBackground("viewCookieInfo", { url: info.url, domain: info.host });
    const cookies = (list?.cookies || [])
      .filter((c) => (c.path || "/") === targetPath)
      .map(toWDCookie);

    return await WebDeveloper.Cookies.deletePathCookies(cookies);
  }

  async function deleteSessionCookies() {
    const info = getPageInfo();
    const list = await sendToBackground("viewCookieInfo", { url: info.url, domain: info.host });
    const cookies = (list?.cookies || []).map(toWDCookie);

    return await WebDeveloper.Cookies.deleteSessionCookies(cookies);
  }

  // Optional: allow popup to add cookie using your form
  async function addCookie(extra = {}) {
    // expected extra: { host, name, value, path, secure, session, expires }
    return await WebDeveloper.Cookies.addCookie(extra);
  }

  // Expose API (this is what main.js calls)
  window.cookiesFunctions = {
    disableCookies,
    addCookie,
    deleteDomainCookies,
    deletePathCookies,
    deleteSessionCookies,
    viewCookieInfo,
  };
})();
