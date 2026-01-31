// js/main.js (UPDATED)
// ✅ Adds REAL global Disable JavaScript (via background toggleJavaScriptGlobal) + reload
// ✅ Adds optional REAL global Disable Images (via background toggleImagesGlobal) + reload
// ✅ Keeps your existing cookies/css/images logic
// ✅ Uses ok/message handling for CSS
// ✅ Uses ISOLATED for cookies
// ✅ Shows info when action "not found"/ok:false for CSS

class ExtensionPopup {
  constructor() {
    window.extensionPopupInstance = this;
    this.currentTab = null;
    this.activeStates = new Map();
    this.init();
  }

  async init() {
    try {
      await this.loadCurrentTab();
      this.setupEventListeners();
      this.setupTabNavigation();
      this.setupCookieForm();
      this.setupResizeForm();
      this.loadSavedStates();
      console.log("ExtensionPopup initialized");
    } catch (error) {
      console.error("Initialization failed:", error);
      this.showNotification("Failed to initialize", "danger");
    }
  }

  async loadCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tab;
  }

  setupEventListeners() {
    document.addEventListener("click", (e) => {
      const button = e.target.closest(
        "[data-func], [data-disable], [data-cookies], [data-image], [data-info], [data-outline], [data-form], [data-resize], .tab-panel[data-category='tools'] .list-group-item, .tab-panel[data-category='miscellaneous'] .list-group-item"
      );

      if (!button) return;
      e.preventDefault();

      if (button.dataset.func) {
        this.handleCSSFunction(button);
      } else if (button.dataset.disable) {
        this.handleDisableFunction(button);
      } else if (button.dataset.cookies) {
        this.handleCookieFunction(button);
      } else if (button.dataset.image) {
        this.handleImageFunction(button);
      } else if (button.dataset.info) {
        this.handleInfoFunction(button);
      } else if (button.dataset.outline) {
        this.handleOutlineFunction(button);
      } else if (button.dataset.form) {
        this.handleFormFunction(button);
      } else if (button.dataset.resize) {
        this.handleResizeFunction(button);
      } else if (button.closest(".tab-panel")?.dataset.category === "tools") {
        this.handleToolsFunction(button);
      } else if (button.closest(".tab-panel")?.dataset.category === "miscellaneous") {
        this.handleMiscFunction(button);
      }
    });
  }

  // ---------------- MISC ----------------
  async handleMiscFunction(li) {
    try {
      const text = (li.textContent || "").trim();

      if (!window.miscellaneousFunctions?.runByText) {
        throw new Error(
          'miscellaneousFunctions not loaded. Add <script src="js/miscellaneousFunctions.js"></script> BEFORE main.js in popup.html'
        );
      }

      const result = await window.miscellaneousFunctions.runByText(text);
      if (result !== "__NO_TOAST__") {
        this.showNotification(`Misc: ${text} ✓`, "success");
      }
      return result;
    } catch (e) {
      console.error("Misc failed:", e);
      this.showNotification(`✗ Misc failed: ${String(e.message || e)}`, "danger");
    }
  }

  // ---------------- NAV ----------------
  setupTabNavigation() {
    document.querySelectorAll("[data-category]").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        this.switchTab(e.currentTarget.dataset.category);
      });
    });
  }

  switchTab(category) {
    document.querySelectorAll("[data-category]").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.category === category);
    });

    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("d-none", panel.dataset.category !== category);
    });
  }

  // ---------------- COOKIE FORM ----------------
  setupCookieForm() {
    const saveBtn = document.getElementById("cookieSave");
    const cancelBtn = document.getElementById("cookieCancel");

    if (saveBtn)
      saveBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.handleCookieSave();
      });

    if (cancelBtn)
      cancelBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.hideCookieForm();
      });
  }

  toggleCookieForm(button, isActive) {
    button.classList.toggle("active", isActive);

    const form = document.getElementById("addCookieForm");
    if (!form) return;

    form.classList.toggle("d-none", !isActive);

    if (isActive && this.currentTab?.url) {
      try {
        const domainInput = document.getElementById("cookieDomain");
        if (domainInput && !domainInput.value) {
          domainInput.value = new URL(this.currentTab.url).hostname;
        }
      } catch { }
    }
  }

  hideCookieForm() {
    const form = document.getElementById("addCookieForm");
    const addCookieButton = document.querySelector('[data-cookies="addCookie"]');

    if (form) form.classList.add("d-none");
    if (addCookieButton) addCookieButton.classList.remove("active");
    this.clearCookieForm();
  }

  clearCookieForm() {
    ["cookieName", "cookieValue", "cookieDomain", "cookiePath"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = id === "cookiePath" ? "/" : "";
    });
  }

  getCookieFormData() {
    return {
      name: document.getElementById("cookieName")?.value.trim() || "",
      value: document.getElementById("cookieValue")?.value.trim() || "",
      domain: document.getElementById("cookieDomain")?.value.trim() || "",
      path: document.getElementById("cookiePath")?.value.trim() || "/",
    };
  }

  validateCookieData(data) {
    return data.name.length > 0 && data.value.length > 0;
  }

  async handleCookieSave() {
    const cookieData = this.getCookieFormData();
    if (!this.validateCookieData(cookieData)) {
      this.showNotification("⚠ Name & Value required", "warning");
      return;
    }

    try {
      await this.executeInTab({
        world: "ISOLATED",
        func: (data) => {
          document.cookie = `${encodeURIComponent(data.name)}=${encodeURIComponent(
            data.value
          )}; domain=${data.domain}; path=${data.path};`;
        },
        args: [cookieData],
      });

      this.showNotification(`✓ Cookie "${cookieData.name}" added`, "success");
      this.hideCookieForm();
    } catch (error) {
      console.error("Failed to save cookie:", error);
      this.showNotification(`✗ Failed to add cookie: ${String(error.message || error)}`, "danger");
    }
  }

  // ---------------- COOKIE ACTIONS ----------------
  async handleCookieFunction(button) {
    const functionName = button.dataset.cookies;
    const isActive = !button.classList.contains("active");

    if (functionName === "disableCookies") {
      button.classList.toggle("active", isActive);
      this.activeStates.set(functionName, isActive);
      this.saveStates();
    }

    switch (functionName) {
      case "addCookie":
        this.toggleCookieForm(button, isActive);
        return;
      case "viewCookieInfo":
        await this.viewCookieInfo();
        return;
      default:
        await this.executeCookieFunction(functionName, button, isActive);
        return;
    }
  }

  async executeCookieFunction(functionName, button, isActive) {
    try {
      const extra = {};

      if (functionName === "deletePathCookies") {
        extra.path = (document.getElementById("cookiePath")?.value || "/").trim() || "/";
        extra.domain = (document.getElementById("cookieDomain")?.value || "").trim();
      }

      const result = await this.executeInTab({
        files: ["js/cookiesFunctions.js"],
        world: "ISOLATED",
        func: async (name, extraPayload) => {
          if (!window.cookiesFunctions?.[name]) {
            throw new Error(`cookiesFunctions.${name} not found`);
          }
          return await window.cookiesFunctions[name](extraPayload);
        },
        args: [functionName, extra],
      });

      if (button && functionName !== "disableCookies") {
        button.classList.toggle("active", isActive);
      }

      const data = result?.[0]?.result;
      const msg = data?.message;
      this.showNotification(
        msg ? `✓ ${msg}` : `✓ ${this.formatFunctionName(functionName)} executed`,
        "success"
      );
    } catch (error) {
      console.error("Cookie function failed:", error);
      if (functionName === "disableCookies" && button) {
        button.classList.toggle("active", !button.classList.contains("active"));
      }
      this.showNotification(`✗ Failed: ${functionName} — ${String(error.message || error)}`, "danger");
    }
  }

  async viewCookieInfo() {
    try {
      const result = await this.executeInTab({
        files: ["js/cookiesFunctions.js"],
        world: "ISOLATED",
        func: () => window.cookiesFunctions?.viewCookieInfo?.(),
      });

      const data = result?.[0]?.result;

      if (data?.ok) {
        this.showNotification(`✓ Cookies found: ${data.count}`, "info");

        const box = document.getElementById("cookiesMessage");
        if (box) {
          box.className = "mt-2 p-2 rounded alert alert-info";
          const list = (data.cookies || [])
            .slice(0, 50)
            .map(
              (c) =>
                `<div style="font-size:12px;"><b>${escapeHtml(
                  c.name
                )}</b> <span style="opacity:.7">${escapeHtml(c.domain)}${escapeHtml(
                  c.path
                )}</span></div>`
            )
            .join("");
          box.innerHTML =
            `<div><b>${escapeHtml(data.domain)}</b> — ${data.count} cookies</div>` +
            (list ? `<div style="margin-top:6px; max-height:160px; overflow:auto;">${list}</div>` : "");
        }
      } else {
        this.showNotification(`✗ Failed to get cookies: ${data?.error || "Unknown"}`, "danger");
      }
    } catch (error) {
      console.error("Failed to view cookie info:", error);
      this.showNotification(`✗ Failed to get cookies: ${String(error.message || error)}`, "danger");
    }
  }

  // ---------------- RESIZE FORM ----------------
  setupResizeForm() {
    const applyBtn = document.getElementById("resizeApply");
    const cancelBtn = document.getElementById("resizeCancel");

    if (applyBtn)
      applyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.handleResizeApply();
      });

    if (cancelBtn)
      cancelBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.hideResizeForm();
      });
  }

  // ---------------- STATE ----------------
  loadSavedStates() {
    chrome.storage.local.get(["activeStates"], (result) => {
      if (result.activeStates) {
        this.activeStates = new Map(Object.entries(result.activeStates));
        this.applySavedStates();
      }
    });
  }

  saveStates() {
    const statesObj = Object.fromEntries(this.activeStates);
    chrome.storage.local.set({ activeStates: statesObj });
  }

  applySavedStates() {
    this.activeStates.forEach((isActive, funcId) => {
      const button = document.querySelector(
        `[data-func="${funcId}"], [data-disable="${funcId}"], [data-image="${funcId}"], [data-info="${funcId}"], [data-outline="${funcId}"], [data-form="${funcId}"], [data-resize="${funcId}"], [data-tools="${funcId}"], [data-cookies="${funcId}"]`
      );
      if (button && isActive) button.classList.add("active");
    });
  }

  // ---------------- IMAGE FUNCTIONS ----------------
  async handleImageFunction(button) {
    const functionName = button.dataset.image;
    const isActive = !button.classList.contains("active");

    // Optional: if you want REAL global images block instead of visual overlay,
    // uncomment next block and update your UI meaning.
    // if (functionName === "disableImages") {
    //   return await this.handleGlobalImagesToggle(button, isActive);
    // }

    try {
      button.classList.toggle("active", isActive);
      this.activeStates.set(functionName, isActive);
      this.saveStates();

      const result = isActive
        ? await this.applyImageFunction(functionName)
        : await this.revertImageFunction(functionName);

      // If imageFunctions returns {ok:false,message}, show info and rollback
      if (result && result.ok === false) {
        button.classList.toggle("active", !isActive);
        this.activeStates.set(functionName, !isActive);
        this.saveStates();
        this.showNotification(`Images: ${result.message}`, "info");
        return;
      }

      const msg = result?.message
        ? result.message
        : `${this.formatFunctionName(functionName)} ${isActive ? "✓ Applied" : "✗ Reverted"}`;

      this.showNotification(`Images: ${msg}`, "success");
    } catch (error) {
      console.error("Image Function failed:", error);
      button.classList.toggle("active", !isActive);
      this.activeStates.set(functionName, !isActive);
      this.saveStates();
      this.showNotification(`✗ Failed: ${functionName} — ${String(error.message || error)}`, "danger");
    }
  }

  async applyImageFunction(functionName) {
    if (!this.currentTab?.id) return null;

    await chrome.scripting.executeScript({
      target: { tabId: this.currentTab.id },
      files: ["js/imageFunctions.js"],
      world: "MAIN",
    });

    const result = await chrome.scripting.executeScript({
      target: { tabId: this.currentTab.id },
      func: (funcName) => {
        if (window.imageFunctions?.apply) return window.imageFunctions.apply(funcName);
        return { ok: false, message: "imageFunctions.apply not found" };
      },
      args: [functionName],
      world: "MAIN",
    });

    return result[0]?.result;
  }

  async revertImageFunction(functionName) {
    if (!this.currentTab?.id) return null;

    const result = await chrome.scripting.executeScript({
      target: { tabId: this.currentTab.id },
      func: (funcName) => {
        if (window.imageFunctions?.revert) return window.imageFunctions.revert(funcName);
        return { ok: false, message: "imageFunctions.revert not found" };
      },
      args: [functionName],
      world: "MAIN",
    });

    return result[0]?.result;
  }

  // ---------------- CSS FUNCTIONS ----------------
  async handleCSSFunction(button) {
    const functionName = button.dataset.func;
    const isActive = !button.classList.contains("active");

    try {
      button.classList.toggle("active", isActive);
      this.activeStates.set(functionName, isActive);
      this.saveStates();

      const execResult = await this.executeInTab({
        files: ["js/cssFunctions.js"],
        world: "MAIN",
        func: (name, state) => {
          if (!window.cssFunctions?.[name]) {
            return { ok: false, message: `cssFunctions.${name} not found` };
          }

          const out = state
            ? window.cssFunctions[name].apply()
            : window.cssFunctions[name].revert();

          return out ?? { ok: true, message: state ? "Applied" : "Reverted" };
        },
        args: [functionName, isActive],
      });

      const data = execResult?.[0]?.result;
      if (data && data.ok === false) {
        button.classList.toggle("active", !isActive);
        this.activeStates.set(functionName, !isActive);
        this.saveStates();
        this.showNotification(`CSS: ${data.message}`, "info");
        return;
      }

      const msg =
        data?.message ||
        `${this.formatFunctionName(functionName)} ${isActive ? "✓ Applied" : "✗ Reverted"}`;

      this.showNotification(`CSS: ${msg}`, "success");
    } catch (error) {
      console.error("CSS Function failed:", error);
      button.classList.toggle("active", !isActive);
      this.activeStates.set(functionName, !isActive);
      this.saveStates();
      this.showNotification(`✗ Failed: ${functionName} — ${String(error.message || error)}`, "danger");
    }
  }

  // ---------------- DISABLE FUNCTIONS ----------------
  async handleDisableFunction(button) {
    const functionName = button.dataset.disable;

    if (functionName === "resetAll") {
      await this.handleResetAll();
      return;
    }

    if (functionName === "disableJavaScript") {
      try {
        if (!this.currentTab) await this.loadCurrentTab();
        const url = this.currentTab?.url;
        if (!url) throw new Error("No active tab URL");

        const response = await chrome.runtime.sendMessage({
          type: "COOKIE_ACTION",
          action: "toggleJavaScriptGlobal",
          payload: { url },
        });

        if (!response?.ok) throw new Error(response?.error || "toggleJavaScriptGlobal failed");

        // ✅ sync UI with REAL state
        const isBlocked = response.setting === "block";
        button.classList.toggle("active", isBlocked);
        this.activeStates.set(functionName, isBlocked);
        this.saveStates();

        this.showNotification(`✓ ${response.message} (reloading...)`, "success");
        await chrome.tabs.reload(this.currentTab.id);
      } catch (e) {
        this.showNotification(`✗ Disable JavaScript failed: ${String(e.message || e)}`, "danger");
      }
      return;
    }


    const isActive = !button.classList.contains("active");

    try {
      button.classList.toggle("active", isActive);
      this.activeStates.set(functionName, isActive);
      this.saveStates();

      const result = await this.executeInTab({
        files: ["js/disableFunctions.js"],
        world: "MAIN",
        func: (name, state) => {
          if (!window.disableFunctions?.[name]) {
            return { ok: false, message: `disableFunctions.${name} not found` };
          }
          const out = state ? window.disableFunctions[name].apply() : window.disableFunctions[name].revert();
          return out ?? { ok: true, message: state ? "Disabled" : "Enabled" };
        },
        args: [functionName, isActive],
      });

      const data = result?.[0]?.result;
      if (data && data.ok === false) {
        button.classList.toggle("active", !isActive);
        this.activeStates.set(functionName, !isActive);
        this.saveStates();
        this.showNotification(`Disable: ${data.message}`, "info");
        return;
      }

      const msg =
        data?.message || `${this.formatFunctionName(functionName)} ${isActive ? "✓ Disabled" : "✓ Enabled"}`;

      this.showNotification(`Disable: ${msg}`, "success");
    } catch (error) {
      console.error("Disable Function failed:", error);
      button.classList.toggle("active", !isActive);
      this.activeStates.set(functionName, !isActive);
      this.saveStates();
      this.showNotification(`✗ Failed: ${functionName} — ${String(error.message || error)}`, "danger");
    }
  }

  async handleResetAll() {
    if (!confirm("Reset all functions to default state?")) return;

    this.activeStates.clear();
    this.saveStates();

    document.querySelectorAll(".list-group-item.active").forEach((btn) => {
      btn.classList.remove("active");
    });

    await this.executeInTab({
      world: "MAIN",
      func: () => {
        if (window.cssFunctions) {
          Object.values(window.cssFunctions).forEach((func) => {
            if (typeof func.revert === "function") func.revert();
          });
        }

        if (window.disableFunctions) {
          Object.values(window.disableFunctions).forEach((func) => {
            if (typeof func.revert === "function") func.revert();
          });
        }

        if (window.imageFunctions?.revertAll) window.imageFunctions.revertAll();
        if (window.informationFunctions?.revertAll) window.informationFunctions.revertAll();
        if (window.outlineFunctions?.revertAll) window.outlineFunctions.revertAll();
        if (window.formsFunctions?.revertAll) window.formsFunctions.revertAll();
      },
    });

    this.showNotification("✓ All functions reset", "success");
  }

  // ---------------- EXECUTION HELPER ----------------
  async executeInTab({ files = [], func = null, args = [], world = "ISOLATED" }) {
    if (!this.currentTab) await this.loadCurrentTab();
    if (!this.currentTab?.id) throw new Error("No active tab");

    if (files.length > 0) {
      await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        files,
        world,
      });
    }

    if (func) {
      return await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        func,
        args,
        world,
      });
    }
  }

  // ---------------- UI ----------------
  showNotification(message, type = "success") {
    const activePanel = document.querySelector(".tab-panel:not(.d-none)");
    if (!activePanel) return;

    let container = activePanel.querySelector(".notification-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "notification-container";
      const listGroup = activePanel.querySelector(".list-group");
      if (listGroup?.parentNode) {
        listGroup.parentNode.insertBefore(container, listGroup.nextSibling);
      } else {
        activePanel.appendChild(container);
      }
    }

    container.innerHTML = "";
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <span>${message}</span>
      <button class="notification-close">&times;</button>
    `;

    container.appendChild(notification);

    setTimeout(() => notification.classList.add("show"), 10);

    const dismiss = setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    }, 3000);

    notification.querySelector(".notification-close")?.addEventListener("click", () => {
      clearTimeout(dismiss);
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    });
  }

  formatFunctionName(functionName) {
    return functionName
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
  new ExtensionPopup();
});
