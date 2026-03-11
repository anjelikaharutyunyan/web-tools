class ExtensionPopup {
  constructor() {
    window.extensionPopupInstance = this;
    this.currentTab = null;
    this.activeStates = new Map();
    this.lastStatesBeforeReset = null;
    this.undoStack = [];
    this.notificationContainer = null;
    this.currentCategory = 'disable';
    this.keepOpen = true;
    this.processingActions = new Set();

    this.categories = {
      disable: {
        file: 'js/disableFunctions.js',
        moduleName: 'disableFunctions',
        world: 'MAIN',
        handlers: ['disableJavaScript'],
        isOneShot: () => false
      },
      css: {
        file: 'js/cssFunctions.js',
        moduleName: 'cssFunctions',
        world: 'MAIN',
        isOneShot: (a) => a.startsWith('view') || ['reloadLinked'].includes(a)
      },
      cookies: {
        file: 'js/cookiesFunctions.js',
        moduleName: 'cookiesFunctions',
        world: 'ISOLATED',
        isOneShot: (a) => ['viewCookieInfo', 'addCookie'].includes(a)
      },
      image: {
        file: 'js/imageFunctions.js',
        moduleName: 'imageFunctions',
        world: 'MAIN',
        isOneShot: (a) => false
      },
      info: {
        file: 'js/informationFunctions.js',
        moduleName: 'informationFunctions',
        world: 'MAIN',
        isOneShot: (a) => a.startsWith('view') || ['pageInfo', 'findDuplicateIds'].includes(a)
      },
      outline: {
        file: 'js/outlineFunctions.js',
        moduleName: 'outlineFunctions',
        world: 'MAIN',
        isOneShot: (a) => false
      },
      form: {
        file: 'js/formsFunctions.js',
        moduleName: 'formsFunctions',
        world: 'MAIN',
        isOneShot: (a) => false
      },
      resize: {
        file: null,
        moduleName: null,
        handlers: ['displayWindowSize', 'resizePreset', 'editResizeDimensions', 'viewResponsiveLayouts'],
        isOneShot: (a) => true
      },
      seo: {
        file: 'js/seoFunctions.js',
        moduleName: 'seoFunctions',
        world: 'MAIN',
        isOneShot: () => false
      },
      tools: {
        file: 'js/toolsFunctions.js',
        moduleName: 'toolsFunctions',
        world: 'MAIN',
        isOneShot: () => true
      },
      pageSize: {
        file: 'js/weightInformation.js',
        moduleName: 'weightInformationFunctions',
        world: 'MAIN',
        isOneShot: () => true
      },
      miscellaneous: {
        file: 'js/miscellaneousFunctions.js',
        moduleName: 'miscellaneousFunctions',
        world: 'MAIN',
        isOneShot: (action) => {
          const oneShotActions = [
            'clearCache',
            'clearHistory',
            'resetAll',
            'displayColorPicker'
          ];
          return oneShotActions.includes(action);
        }
      }
    };

    this.forms = {
      addCookie: {
        id: 'addCookieForm',
        buttonSelector: '[data-cookies="addCookie"]',
        inputs: ['cookieName', 'cookieValue', 'cookieDomain', 'cookiePath'],
        save: () => this.handleCookieSave(),
        cancel: () => this.hideForm('addCookie'),
        validate: (d) => d.name && d.value,
        getData: () => ({
          name: document.getElementById('cookieName')?.value.trim() || '',
          value: document.getElementById('cookieValue')?.value.trim() || '',
          domain: document.getElementById('cookieDomain')?.value.trim() || '',
          path: document.getElementById('cookiePath')?.value.trim() || '/'
        })
      },
      editResizeDimensions: {
        id: 'resizeForm',
        buttonSelector: '[data-resize="editResizeDimensions"]',
        inputs: ['resizeWidth', 'resizeHeight'],
        save: () => this.handleResizeApply(),
        cancel: () => this.hideForm('editResizeDimensions'),
        validate: (d) => d.width >= 200 && d.height >= 200,
        getData: () => ({
          width: Number(document.getElementById('resizeWidth')?.value || 1024),
          height: Number(document.getElementById('resizeHeight')?.value || 768)
        })
      }
    };

    this.init();
  }

  async init() {
    try {
      await this.loadCurrentTab();
      this.createNotificationContainer();
      this.setupEventListeners();
      this.setupTabNavigation();
      this.setupForms();
      this.setupMiscellaneousConfirmHandlers();
      await this.loadSavedStates();
      await this.checkJavaScriptStatus();
      this.preventPopupClosure();
    } catch (error) {
      this.showNotification("Failed to initialize", "danger");
    }
  }

  setupMiscellaneousConfirmHandlers() {
    const historyConfirmBtn = document.getElementById('clearHistoryConfirmBtn');
    const historyCancelBtn = document.getElementById('clearHistoryCancel');

    if (historyConfirmBtn) {
      historyConfirmBtn.addEventListener('click', async () => {
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'MISCELLANEOUS_ACTION',
            action: 'clearHistory'
          });

          if (response?.ok) {
            this.showNotification('History cleared ✓', 'success');
          } else {
            this.showNotification(`✗ Clear history failed: ${response?.error || 'Unknown error'}`, 'danger');
          }
          document.getElementById('clearHistoryConfirm')?.classList.add('d-none');
        } catch (error) {
          this.showNotification(`✗ Clear history failed: ${error.message}`, 'danger');
          document.getElementById('clearHistoryConfirm')?.classList.add('d-none');
        }
      });
    }

    if (historyCancelBtn) {
      historyCancelBtn.addEventListener('click', () => {
        document.getElementById('clearHistoryConfirm')?.classList.add('d-none');
      });
    }
  }

  preventPopupClosure() {
    document.addEventListener('click', (e) => e.stopPropagation(), false);
    document.querySelectorAll('input, button, .list-group-item, [role="button"]').forEach(el => {
      el.addEventListener('mousedown', (e) => e.stopPropagation(), false);
      el.addEventListener('mouseup', (e) => e.stopPropagation(), false);
    });
    document.addEventListener('scroll', (e) => e.stopPropagation(), false);

    if (chrome?.runtime) {
      this.keepAliveInterval = setInterval(() => {
        if (this.keepOpen) chrome.runtime.sendMessage({ type: 'KEEP_POPUP_ALIVE' }).catch(() => { });
      }, 1000);
    }
  }

  destroy() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
  }

  async loadCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tab;
  }

  createNotificationContainer() {
    const existing = document.querySelector('.reset-notification-wrapper #global-notification-container, #global-notification-container');
    if (existing) {
      this.notificationContainer = existing;
      return;
    }

    this.notificationContainer = document.createElement('div');
    this.notificationContainer.id = 'global-notification-container';
    this.notificationContainer.className = 'notification-container';

    const wrapper = document.querySelector('.reset-notification-wrapper');
    (wrapper || document.getElementById('tabContent') || document.body).appendChild(this.notificationContainer);
  }

  setupEventListeners() {
    document.querySelectorAll(".undo-btn, .undoResetBtn").forEach(btn => {
      btn.addEventListener("click", (e) => { e.preventDefault(); this.handleUndoReset(); });
    });

    document.addEventListener("click", (e) => {
      const btn = e.target.closest(
        '.list-group-item.text-link, [data-func], [data-disable], [data-cookies], [data-image], [data-info], [data-outline], [data-form], [data-resize], [data-seo], [data-tools], [data-miscellaneous], [data-pageSize]'
      );
      if (!btn || btn.classList.contains('undo-btn') || btn.classList.contains('undoResetBtn') || btn.classList.contains('processing')) return;

      e.preventDefault();
      e.stopPropagation();

      const category = this.getCategoryFromElement(btn);
      const action = this.getActionFromElement(btn);
      if (category && action) this.handleAction(category, action, btn);
    });
  }

  getCategoryFromElement(el) {
    for (const cat of Object.keys(this.categories)) if (el.dataset[cat] !== undefined) return cat;
    return el.closest('.tab-panel')?.dataset?.category;
  }

  getActionFromElement(el) {
    for (const cat of Object.keys(this.categories)) if (el.dataset[cat]) return el.dataset[cat];
    return el.dataset.info || el.textContent?.trim();
  }

  async handleAction(category, action, element) {
    const actionId = `${category}:${action}`;
    if (this.processingActions.has(actionId)) return;

    this.processingActions.add(actionId);
    element.classList.add('processing');

    try {
      if (category === 'disable') {
        await this.handleDisableFunction(element);
      } else if (category === 'miscellaneous') {
        const result = await this.executeMiscellaneousAction(action, element);

        if (result === "__NO_TOAST__") {
          // Don't show notification
        } else if (result) {
          if (typeof result === 'string') {
            this.showNotification(result, "success");
          } else if (result.ok === false) {
            this.showNotification(result.message || `${category}: ${action} failed`, "info");
          } else if (result.message) {
            this.showNotification(result.message, "success");
          }
        }
      } else if (this.forms[action]) {
        this.toggleForm(action, !element.classList.contains('active'));
      } else if (category === 'resize' && action === 'resizePreset') {
        await this.handleResizePreset(element);
      } else if (category === 'pageSize') {
        await this.handlePageSize(action, element);
      } else {
        await this.executeCategoryAction(category, action, element);
      }
    } catch (error) {
      this.showNotification(`✗ Failed: ${error.message}`, "danger");
    } finally {
      this.processingActions.delete(actionId);
      element.classList.remove('processing');
    }
  }

  // ==================== MISCELLANEOUS FUNCTIONS ====================
  async executeMiscellaneousAction(action, element) {
    if (!this.currentTab?.id) {
      await this.loadCurrentTab();
    }

    // Handle popup-specific functions
    if (action === 'displayColorPicker') {
      return this.handleDisplayColorPicker();
    }

    if (action === 'clearHistory') {
      const box = document.getElementById('clearHistoryConfirm');
      if (box) box.classList.remove('d-none');
      return "__NO_TOAST__";
    }

    if (action === 'clearCache') {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'MISCELLANEOUS_ACTION', action: 'clearCache' },
          (response) => {
            if (response?.ok) {
              resolve(response.message || 'Cache cleared');
            } else {
              resolve({ ok: false, message: response?.error || 'Failed to clear cache' });
            }
          }
        );
      });
    }

    // Handle resetAll - now tab-specific
    if (action === 'resetAll') {
      await this.handleResetAll();
      return "__NO_TOAST__";
    }

    // For other page-modifying functions, execute in the page
    const result = await this.executeInTab({
      files: ['js/miscellaneousFunctions.js'],
      world: 'MAIN',
      func: (actionName) => {
        const m = window.miscellaneousFunctions;
        if (!m) return { ok: false, message: 'miscellaneousFunctions not loaded' };

        if (typeof m[actionName] === 'function') {
          try {
            const result = m[actionName]();
            if (result && typeof result.then === 'function') {
              return result.then(r => r);
            }
            return result;
          } catch (error) {
            return { ok: false, message: error.message };
          }
        }
        return { ok: false, message: `Function ${actionName} not found` };
      },
      args: [action]
    });

    const pageResult = result?.[0]?.result;

    // Handle UI state for miscellaneous functions
    const config = this.categories.miscellaneous;
    const isOneShot = config?.isOneShot ? config.isOneShot(action) : true;

    if (!isOneShot) {
      const key = this.buildStateKey('miscellaneous', action, element);
      const isActive = !element.classList.contains('active');
      this.setActiveByKey(key, isActive, element);
    } else {
      // For one-shot functions, temporarily show active state then remove
      element.classList.add('active');
      setTimeout(() => {
        element.classList.remove('active');
      }, 300);
    }

    return pageResult;
  }

  handleDisplayColorPicker() {
    const container = document.getElementById('tabContent');
    if (!container) return 'Container not found';

    const old = document.getElementById('__popup_color_picker_wrap');
    if (old) {
      old.remove();
      return 'Color picker closed';
    }

    const wrap = document.createElement('div');
    wrap.id = '__popup_color_picker_wrap';
    wrap.style.cssText = `
      margin-top: 10px;
      background: #fff;
      border: 1px solid rgba(0,0,0,.15);
      border-radius: 12px;
      padding: 10px 12px;
      box-shadow: 0 6px 18px rgba(0,0,0,.12);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display:flex;
      align-items:center;
      justify-content:space-between;
      margin-bottom: 8px;
    `;

    const title = document.createElement('div');
    title.textContent = 'Color Picker';
    title.style.cssText = 'font-weight:600; font-size:14px;';

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.style.cssText = `
      border:none;
      background:transparent;
      cursor:pointer;
      font-size:14px;
      opacity:.75;
    `;
    close.onmouseenter = () => (close.style.opacity = '1');
    close.onmouseleave = () => (close.style.opacity = '.75');
    close.onclick = () => wrap.remove();

    header.appendChild(title);
    header.appendChild(close);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; gap:10px;';

    const input = document.createElement('input');
    input.type = 'color';
    input.value = '#0d6efd';
    input.style.cssText = 'width:42px; height:32px; border:none; background:transparent; padding:0;';

    const code = document.createElement('input');
    code.type = 'text';
    code.value = input.value;
    code.readOnly = true;
    code.style.cssText = `
      flex:1;
      padding:6px 8px;
      border:1px solid rgba(0,0,0,.15);
      border-radius:10px;
      font-size:13px;
    `;

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';
    copyBtn.style.cssText = `
      border: 1px solid rgba(0,0,0,.15);
      background: #f7f7f7;
      padding: 6px 10px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 12px;
    `;
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(code.value);
        copyBtn.textContent = 'Copied ✓';
        setTimeout(() => (copyBtn.textContent = 'Copy'), 900);
      } catch {
        copyBtn.textContent = 'Failed';
        setTimeout(() => (copyBtn.textContent = 'Copy'), 900);
      }
    };

    const swatch = document.createElement('div');
    swatch.style.cssText = `
      width: 100%;
      height: 28px;
      border-radius: 10px;
      margin-top: 10px;
      border: 1px solid rgba(0,0,0,.1);
      background: ${input.value};
    `;

    input.addEventListener('input', () => {
      code.value = input.value;
      swatch.style.background = input.value;
    });

    row.appendChild(input);
    row.appendChild(code);
    row.appendChild(copyBtn);

    wrap.appendChild(header);
    wrap.appendChild(row);
    wrap.appendChild(swatch);
    container.prepend(wrap);

    return 'Color picker opened in popup';
  }

  async handlePageSize(action, element) {
    const key = this.buildStateKey('pageSize', action, element);
    const isActive = !element.classList.contains('active');
    this.setActiveByKey(key, isActive, element);

    try {
      const result = await this.executeInTab({
        files: [this.categories.pageSize.file],
        world: "MAIN",
        func: (name) => window.weightInformationFunctions?.run?.(name) || { ok: false, message: "Page size function not found" },
        args: [action]
      });

      const data = result?.[0]?.result;
      if (!data || data.ok === false) {
        this.setActiveByKey(key, false, element);
        this.showNotification(`<b>Page Size</b><br>${data?.message || 'Unknown error'}`, "danger");
        return;
      }

      this.showNotification(`<b>${data.title || 'Page Size'}</b><br>${(data.message || '').replaceAll('\n', '<br>')}`, "success");
    } catch (err) {
      this.setActiveByKey(key, false, element);
      this.showNotification(`<b>Page Size</b><br>${err.message}`, "danger");
    }
  }

  async executeCategoryAction(category, action, element) {
    const config = this.categories[category];
    if (!config) return;

    const isOneShot = typeof config.isOneShot === 'function' ? config.isOneShot(action) : false;

    const key = this.buildStateKey(category, action, element);
    const wasActive = element.classList.contains('active');
    const shouldActivate = !wasActive && !isOneShot;

    if (!isOneShot) {
      this.setActiveByKey(key, shouldActivate, element);
    }

    const result = config.handlers
      ? await this[`handle${category}Action`]?.(action, element)
      : await this.executeModuleFunction(config, action, shouldActivate);

    if (result?.ok === false) {
      if (!isOneShot) {
        this.setActiveByKey(key, element.classList.contains('active'), element);
      }
      this.showNotification(`${category}: ${result.message || 'Failed'}`, "info");
      return result;
    }

    if (!isOneShot) {
      this.showNotification(result?.message || this.formatSuccessMessage(category, action, shouldActivate, isOneShot), "success");
    }

    return result;
  }

  async executeModuleFunction(config, action, shouldActivate = true) {
    if (!config.file) return { ok: true };

    const result = await this.executeInTab({
      files: [config.file],
      world: config.world,
      func: (moduleName, action, shouldActivate, url) => {
        const m = window[moduleName];
        if (!m) return { ok: false, message: `Module ${moduleName} not found` };

        const handlers = {
          weightInformationFunctions: () => m.run?.(action),

          informationFunctions: () => {
            if (action.startsWith('view') || ['pageInfo', 'findDuplicateIds'].includes(action)) {
              return m.run?.(action);
            }
            if (!shouldActivate && typeof m.revert === 'function') {
              return m.revert(action);
            }
            return m.apply?.(action) || m.revert?.(action) || m.runByText?.(action);
          },

          seoFunctions: () => {
            if (!shouldActivate && typeof m.revert === 'function') {
              return m.revert(action);
            }
            return m.apply?.(action) ?? m.revert?.(action) ?? m.runByText?.(action) ?? { ok: true };
          },

          toolsFunctions: () => m.runByText?.(action, url),

          disableFunctions: () => {
            if (action === 'resetAll' && m.resetAll?.apply) return m.resetAll.apply();
            if (m[action]) {
              if (!shouldActivate) {
                return m[action].revert?.() || { ok: true };
              }
              return m[action].apply?.() || { ok: true };
            }
            return { ok: false };
          },

          cssFunctions: () => {
            if (m[action]) {
              if (!shouldActivate) {
                return m[action].revert?.() || { ok: true };
              }
              return m[action].apply?.() || { ok: true };
            }
            return null;
          },

          cookiesFunctions: () => typeof m[action] === 'function' ? m[action]() : null,

          imageFunctions: () => {
            if (typeof m.apply === 'function' && typeof m.revert === 'function') {
              if (!shouldActivate) {
                return m.revert(action);
              }
              return m.apply(action);
            }
            if (m[action] && typeof m[action].apply === 'function') {
              if (!shouldActivate) {
                return m[action].revert?.() || { ok: true };
              }
              return m[action].apply?.() || { ok: true };
            }
            if (typeof m[action] === 'function') return m[action]();
            return null;
          },

          outlineFunctions: () => {
            if (typeof m.apply === 'function' && typeof m.revert === 'function') {
              if (!shouldActivate) {
                return m.revert(action);
              }
              return m.apply(action);
            }
            return null;
          },

          formsFunctions: () => {
            if (!shouldActivate && typeof m.revert === 'function') {
              return m.revert(action);
            }
            const result = m.apply?.(action) ?? m.revert?.(action);
            return result === null ? { ok: false, message: "No forms found" } : result;
          }
        };

        const handler = handlers[moduleName];
        if (handler) {
          const r = handler();
          if (r !== null && r !== undefined) return r;
        }

        if (typeof m.runByText === 'function') return m.runByText(action, url);
        if (typeof m.run === 'function') return m.run(action);
        if (typeof m[action] === 'function') {
          if (!shouldActivate && typeof m[action].revert === 'function') {
            return m[action].revert();
          }
          return m[action]();
        }

        return { ok: false, message: `No method for ${action}` };
      },
      args: [config.moduleName, action, shouldActivate, this.currentTab?.url]
    });

    const pageResponse = result?.[0]?.result;
    if (pageResponse?.type === 'url' && pageResponse.url) {
      await chrome.tabs.create({ url: pageResponse.url, active: true });
      return { ok: true, message: pageResponse.message || 'Opened tool' };
    }

    return pageResponse || { ok: true };
  }

  async handleDisableFunction(button) {
    const fn = button.dataset.disable;
    if (fn === "resetAll") return await this.handleResetAll();
    if (fn === "disableJavaScript") return await this.toggleJavaScript();

    const key = this.buildStateKey('disable', fn, button);
    const isActive = !button.classList.contains("active");

    try {
      this.setActiveByKey(key, isActive, button);

      const result = await this.executeInTab({
        files: ["js/disableFunctions.js"],
        world: "MAIN",
        func: (name, shouldActivate) => {
          if (!window.disableFunctions?.[name]) {
            return { ok: false, message: `disableFunctions.${name} not found` };
          }

          if (!shouldActivate) {
            const out = window.disableFunctions[name].revert?.();
            return out ?? { ok: true, message: "Enabled" };
          } else {
            const out = window.disableFunctions[name].apply?.();
            return out ?? { ok: true, message: "Disabled" };
          }
        },
        args: [fn, isActive]
      });

      const data = result?.[0]?.result;
      if (data?.ok === false) {
        this.setActiveByKey(key, !isActive, button);
        this.showNotification(`Disable: ${data.message}`, "info");
        return;
      }

      this.showNotification(`Disable: ${data?.message || `${this.formatFunctionName(fn)} ${isActive ? "✓ Disabled" : "✓ Enabled"}`}`, "success");
    } catch (error) {
      this.setActiveByKey(key, !isActive, button);
      this.showNotification(`✗ Failed: ${fn} — ${error.message}`, "danger");
    }
  }

  async toggleJavaScript() {
    try {
      if (!this.currentTab) await this.loadCurrentTab();
      const url = this.currentTab?.url;
      if (!url) throw new Error("No active tab URL");

      const setting = await chrome.contentSettings.javascript.get({ primaryUrl: url, incognito: false });
      const button = document.querySelector('[data-disable="disableJavaScript"]');
      const key = this.buildStateKey('disable', 'disableJavaScript', button);
      this.setActiveByKey(key, setting.setting === "block", button);

      const response = await chrome.runtime.sendMessage({
        type: "COOKIE_ACTION",
        action: "toggleJavaScriptGlobal",
        payload: { url }
      });

      if (!response?.ok) throw new Error(response?.error || "toggleJavaScriptGlobal failed");

      this.setActiveByKey(key, response.setting === "block", button);
      this.showNotification(`✓ ${response.message} (reloading...)`, "success");
      setTimeout(() => chrome.tabs.reload(this.currentTab.id), 500);
    } catch (e) {
      this.showNotification(`✗ Disable JavaScript failed: ${e.message}`, "danger");
    }
  }

  async checkJavaScriptStatus() {
    try {
      if (!this.currentTab) await this.loadCurrentTab();
      const url = this.currentTab?.url;
      if (!url) return;

      const setting = await chrome.contentSettings.javascript.get({ primaryUrl: url, incognito: false });
      const button = document.querySelector('[data-disable="disableJavaScript"]');
      if (button) {
        const key = this.buildStateKey('disable', 'disableJavaScript', button);
        this.setActiveByKey(key, setting.setting === 'block', button);
      }
    } catch (error) { }
  }

  // ==================== FIXED: TAB-SPECIFIC RESET (from your old code) ====================
  async handleResetAll() {
    try {
      this.saveStateToUndoStack();

      // Get current tab's visible panel
      const currentCategory = this.getCurrentCategory();
      const panel = document.querySelector(`.tab-panel[data-category="${currentCategory}"]`);

      if (!panel) {
        return this.showNotification("No active tab found", "warning");
      }

      // Get active elements ONLY from the current panel (current tab)
      const activeElements = panel.querySelectorAll(
        '.list-group-item.active, ' +
        '[data-func].active, ' +
        '[data-disable].active, ' +
        '[data-cookies].active, ' +
        '[data-image].active, ' +
        '[data-info].active, ' +
        '[data-outline].active, ' +
        '[data-form].active, ' +
        '[data-resize].active, ' +
        '[data-seo].active, ' +
        '[data-tools].active, ' +
        '[data-miscellaneous].active, ' +
        '[data-pageSize].active'
      );

      if (activeElements.length === 0) {
        return this.showNotification(`No active features in ${currentCategory} tab`, "info");
      }

      // Special handling for JavaScript toggle (if in disable tab)
      if (currentCategory === 'disable' && this.currentTab?.url) {
        const jsButton = document.querySelector('[data-disable="disableJavaScript"]');
        if (jsButton?.classList.contains('active')) {
          await chrome.runtime.sendMessage({
            type: "COOKIE_ACTION",
            action: "toggleJavaScriptGlobal",
            payload: { url: this.currentTab.url, forceAllow: true }
          }).catch(() => { });
        }
      }

      // Reset all modules in the page
      await this.resetAllModulesInPage();

      // Now revert each active feature and update UI
      for (const el of activeElements) {
        const cat = this.getCategoryFromElement(el) || currentCategory;
        const act = this.getActionFromElement(el);

        if (!act || act === 'resetAll') continue;

        try {
          const config = this.categories[cat];
          if (!config) continue;

          const isOneShot = typeof config.isOneShot === 'function' ? config.isOneShot(act) : false;

          if (isOneShot) {
            // One-shot functions just need UI update
            el.classList.remove('active');
            this.activeStates.delete(this.buildStateKey(cat, act, el));
          } else {
            // For toggle functions, call revert
            await this.executeModuleFunction(config, act, false);
            el.classList.remove('active');
            this.activeStates.delete(this.buildStateKey(cat, act, el));
          }
        } catch (err) {
          console.warn(`Failed to reset ${act}:`, err);
          // Still remove UI state even if function fails
          el.classList.remove('active');
          this.activeStates.delete(this.buildStateKey(cat, act, el));
        }
      }

      // Save state
      this.saveStates();
      this.updateTabActiveStates();

      // Remove active indicator from current tab button
      const tabButton = document.querySelector(`[data-category="${currentCategory}"]`);
      if (tabButton) tabButton.classList.remove('has-active-features');

      this.showNotification(`✓ Reset all ${currentCategory} features (${activeElements.length} functions)`, "success");

      // Reload tab if disable category was affected
      if (currentCategory === 'disable' && this.currentTab?.id) {
        await new Promise(r => setTimeout(r, 500));
        await chrome.tabs.reload(this.currentTab.id);
        this.showNotification("Page reloading to apply changes...", "info");
      }
    } catch (e) {
      this.showNotification(`✗ Reset failed: ${e.message}`, "danger");
    }
  }

  async resetAllModulesInPage() {
    if (!this.currentTab?.id) return;

    const files = Object.values(this.categories)
      .map(c => c.file)
      .filter(Boolean);

    try {
      await this.executeInTab({
        files,
        world: "MAIN",
        func: () => {
          const results = {};

          if (window.disableFunctions?.resetAll?.apply) {
            results.disable = window.disableFunctions.resetAll.apply();
          } else if (window.disableFunctions) {
            Object.keys(window.disableFunctions).forEach(key => {
              if (key !== 'resetAll' && window.disableFunctions[key]?.revert) {
                window.disableFunctions[key].revert();
              }
            });
          }

          if (window.cssFunctions?.resetAll?.apply) {
            results.css = window.cssFunctions.resetAll.apply();
          } else if (window.cssFunctions) {
            Object.keys(window.cssFunctions).forEach(key => {
              if (window.cssFunctions[key]?.revert) {
                window.cssFunctions[key].revert();
              }
            });
          }

          if (window.imageFunctions?.resetAll?.apply) {
            results.image = window.imageFunctions.resetAll.apply();
          } else if (window.imageFunctions?.revert) {
            window.imageFunctions.revert();
          }

          if (window.outlineFunctions?.resetAll?.apply) {
            results.outline = window.outlineFunctions.resetAll.apply();
          } else if (window.outlineFunctions?.revert) {
            window.outlineFunctions.revert();
          }

          if (window.formsFunctions?.resetAll?.apply) {
            results.forms = window.formsFunctions.resetAll.apply();
          } else if (window.formsFunctions?.revert) {
            window.formsFunctions.revert();
          }

          if (window.informationFunctions?.resetAll?.apply) {
            results.info = window.informationFunctions.resetAll.apply();
          }

          if (window.cookiesFunctions?.resetAll?.apply) {
            results.cookies = window.cookiesFunctions.resetAll.apply();
          }

          if (window.seoFunctions?.resetAll?.apply) {
            results.seo = window.seoFunctions.resetAll.apply();
          }

          return { ok: true, results };
        }
      });

      await new Promise(r => setTimeout(r, 300));
    } catch (error) {
      console.warn("Error resetting modules:", error);
    }
  }

  // ==================== FIXED: TAB-SPECIFIC UNDO (from your old code) ====================
  async handleUndoReset() {
    if (this.undoStack.length === 0 && !this.lastStatesBeforeReset?.size) {
      return this.showNotification("Nothing to undo", "info");
    }

    try {
      const state = this.getStateToRestore();
      if (!state || state.size === 0) {
        return this.showNotification("No functions to restore", "info");
      }

      this.showNotification("Restoring previous state...", "info");

      await this.ensureScriptsLoaded();
      await this.resetAllModulesInPage();
      await this.restoreFullState(state);

    } catch (error) {
      this.showNotification(`✗ Undo failed: ${error.message}`, "danger");
    }
  }

  getStateToRestore() {
    // Check from end of stack backwards
    for (let i = this.undoStack.length - 1; i >= 0; i--) {
      if (this.undoStack[i]?.size > 0) {
        const copy = new Map(this.undoStack[i]);
        // Remove this and all later states
        this.undoStack.splice(i, this.undoStack.length - i);
        return copy;
      }
    }

    if (this.lastStatesBeforeReset?.size > 0) {
      const copy = new Map(this.lastStatesBeforeReset);
      this.lastStatesBeforeReset = null;
      return copy;
    }

    return null;
  }

  async restoreFullState(state) {
    const categoriesWithActive = new Set();
    const restored = [];
    const failed = [];

    // Clear current UI first
    this.clearAllActiveUI();
    this.activeStates.clear();

    // Get all active keys
    const activeKeys = Array.from(state.entries())
      .filter(([_, shouldBeActive]) => shouldBeActive)
      .map(([key]) => key);

    if (activeKeys.length === 0) {
      this.showNotification("No active functions to restore", "info");
      return;
    }

    // Group by category
    const byCategory = {};
    activeKeys.forEach(key => {
      const [category] = key.split(':');
      if (!byCategory[category]) byCategory[category] = [];
      byCategory[category].push(key);
    });

    // Restore non-image functions first
    for (const [category, keys] of Object.entries(byCategory)) {
      if (category === 'image') continue;

      const config = this.categories[category];
      if (!config) continue;

      for (const key of keys) {
        const [, , ...actionParts] = key.split(':');
        const action = actionParts.join(':');
        if (action === 'resetAll') continue;

        const element = this.findElementByStateKey(key);

        try {
          const isOneShot = typeof config.isOneShot === 'function' ? config.isOneShot(action) : false;

          if (isOneShot) {
            if (element) element.classList.add('active');
            this.activeStates.set(key, true);
            restored.push(action);
            categoriesWithActive.add(category);
          } else {
            await new Promise(r => setTimeout(r, 50));
            const result = await this.executeModuleFunction(config, action, true);

            if (result?.ok !== false) {
              if (element) element.classList.add('active');
              this.activeStates.set(key, true);
              restored.push(action);
              categoriesWithActive.add(category);
            } else {
              failed.push(action);
            }
          }
        } catch (error) {
          console.warn(`Failed to restore ${action}:`, error);
          failed.push(action);
        }
      }
    }

    // Restore image functions
    if (byCategory['image']) {
      const config = this.categories['image'];
      for (const key of byCategory['image']) {
        const [, , ...actionParts] = key.split(':');
        const action = actionParts.join(':');
        const element = this.findElementByStateKey(key);

        try {
          await new Promise(r => setTimeout(r, 50));
          const result = await this.executeInTab({
            files: [config.file],
            world: config.world,
            func: (action, isActive) => {
              const m = window.imageFunctions;
              if (!m) return { ok: false, message: 'imageFunctions not found' };

              if (typeof m.apply === 'function' && typeof m.revert === 'function') {
                return isActive ? m.apply(action) : m.revert(action);
              }
              if (m[action] && typeof m[action].apply === 'function') {
                return isActive ? m[action].apply() : m[action].revert();
              }
              if (typeof m[action] === 'function') {
                return m[action](isActive) ?? { ok: true };
              }
              return { ok: false, message: `No method for ${action}` };
            },
            args: [action, true]
          });

          const pageResponse = result?.[0]?.result;
          if (pageResponse?.ok !== false) {
            if (element) element.classList.add('active');
            this.activeStates.set(key, true);
            restored.push(action);
            categoriesWithActive.add('image');
          } else {
            failed.push(action);
          }
        } catch (error) {
          console.warn(`Failed to restore image ${action}:`, error);
          failed.push(action);
        }
      }
    }

    // Save restored state
    this.saveStates();

    // Update tab indicators
    document.querySelectorAll('[data-category]').forEach(tab => {
      const cat = tab.dataset.category;
      tab.classList.toggle('has-active-features', categoriesWithActive.has(cat));
    });

    // Show result
    if (failed.length) {
      this.showNotification(
        `⚠ Undo partial: ${restored.length} restored, ${failed.length} failed`,
        "warning"
      );
    } else if (restored.length) {
      this.showNotification(
        `✓ Undo complete: ${restored.length} functions restored`,
        "success"
      );
    }
  }

  // ==================== STATE MANAGEMENT ====================
  buildStateKey(category, action, element) {
    if (element?.dataset) {
      for (const cat of Object.keys(this.categories)) {
        if (element.dataset[cat]) return `${category}:${cat}:${element.dataset[cat]}`;
      }
    }
    const text = (element?.textContent || action || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return `${category}:text:${text}`;
  }

  setActiveByKey(key, isActive, el = null) {
    if (el) el.classList.toggle("active", isActive);
    isActive ? this.activeStates.set(key, true) : this.activeStates.delete(key);
    this.saveStates();
    this.updateTabActiveStates();
  }

  clearAllActiveUI() {
    document.querySelectorAll('.tab-panel .list-group-item.active, [data-func].active, [data-disable].active, [data-cookies].active, [data-image].active, [data-info].active, [data-outline].active, [data-form].active, [data-resize].active, [data-seo].active, [data-tools].active, [data-miscellaneous].active, [data-pageSize].active')
      .forEach(el => el.classList.remove('active'));
    this.updateTabActiveStates();
  }

  updateTabActiveStates() {
    document.querySelectorAll('[data-category]').forEach(t => t.classList.remove('has-active-features'));
    document.querySelectorAll('.tab-panel').forEach(panel => {
      const cat = panel.dataset.category;
      if (!cat) return;

      const hasActive = panel.querySelectorAll('.list-group-item.active, [data-func].active, [data-disable].active, [data-cookies].active, [data-image].active, [data-info].active, [data-outline].active, [data-form].active, [data-resize].active, [data-seo].active, [data-tools].active, [data-miscellaneous].active, [data-pageSize].active').length > 0;
      const tabButton = document.querySelector(`[data-category="${cat}"]`);
      if (tabButton && hasActive) tabButton.classList.add('has-active-features');
    });
  }

  findElementByStateKey(key) {
    const [category, type, ...actionParts] = key.split(':');
    const action = actionParts.join(':');

    if (type === 'text') {
      return Array.from(document.querySelectorAll('.tab-panel .list-group-item'))
        .find(el => el.textContent?.trim().toLowerCase() === action);
    }
    return document.querySelector(`[data-${type}="${action}"]`);
  }

  loadSavedStates() {
    chrome.storage.local.get(["activeStates"], (result) => {
      if (result.activeStates) {
        this.activeStates = new Map(Object.entries(result.activeStates));
      } else {
        this.activeStates.clear();
      }
      this.applySavedStates();
    });
  }

  saveStates() {
    chrome.storage.local.set({ activeStates: Object.fromEntries(this.activeStates) });
  }

  applySavedStates() {
    const controls = document.querySelectorAll('.tab-panel .list-group-item, [data-miscellaneous], [data-func], [data-disable], [data-cookies], [data-image], [data-info], [data-outline], [data-form], [data-resize], [data-seo], [data-tools], [data-pageSize]');
    const map = new Map();

    controls.forEach(el => {
      const cat = this.getCategoryFromElement(el);
      const act = this.getActionFromElement(el);
      if (cat && act) map.set(this.buildStateKey(cat, act, el), el);
    });

    this.activeStates.forEach((isActive, key) => {
      if (isActive) map.get(key)?.classList.add('active');
    });

    this.updateTabActiveStates();
  }

  saveStateToUndoStack() {
    const copy = new Map(this.activeStates);
    this.undoStack.push(copy);
    if (this.undoStack.length > 10) this.undoStack.shift();
    this.lastStatesBeforeReset = new Map(this.activeStates);
  }

  // ==================== FORM HANDLING ====================
  setupForms() {
    Object.entries(this.forms).forEach(([action, form]) => {
      const saveBtn = document.getElementById(`${form.id.replace('Form', '')}Save`);
      const cancelBtn = document.getElementById(`${form.id.replace('Form', '')}Cancel`);

      if (saveBtn) saveBtn.addEventListener('click', (e) => { e.preventDefault(); form.save(); });
      if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); form.cancel(); });

      if (action === 'addCookie' && this.currentTab?.url) {
        try {
          const domainInput = document.getElementById('cookieDomain');
          if (domainInput && !domainInput.value) domainInput.value = new URL(this.currentTab.url).hostname;
        } catch { }
      }
    });
  }

  toggleForm(action, isActive) {
    const form = this.forms[action];
    if (!form) return;

    const el = document.querySelector(form.buttonSelector);
    if (el) el.classList.toggle('active', isActive);

    const formEl = document.getElementById(form.id);
    if (formEl) formEl.classList.toggle('d-none', !isActive);

    if (!isActive) this.clearForm(action);
  }

  hideForm(action) { this.toggleForm(action, false); }

  clearForm(action) {
    const form = this.forms[action];
    if (!form) return;
    form.inputs.forEach(id => {
      const input = document.getElementById(id);
      if (input) input.value = id.includes('Path') ? '/' : '';
    });
  }

  async handleCookieSave() {
    const form = this.forms.addCookie;
    const data = form.getData();
    if (!form.validate(data)) return this.showNotification("⚠ Name & Value required", "warning");

    await this.executeInTab({
      world: "ISOLATED",
      func: (d) => { document.cookie = `${encodeURIComponent(d.name)}=${encodeURIComponent(d.value)}; domain=${d.domain}; path=${d.path};`; },
      args: [data]
    });

    this.showNotification(`✓ Cookie "${data.name}" added`, "success");
    this.hideForm('addCookie');
  }

  async handleResizeApply() {
    const form = this.forms.editResizeDimensions;
    const data = form.getData();
    if (!form.validate(data)) return this.showNotification("⚠ Invalid dimensions (min 200px)", "warning");

    await this.resizeCurrentWindow(data.width, data.height);
    this.showNotification(`✓ Resized to ${data.width}×${data.height}`, "success");
    this.hideForm('editResizeDimensions');
  }

  async resizeCurrentWindow(width, height) {
    const win = await chrome.windows.getCurrent();
    if (win.state !== "normal") await chrome.windows.update(win.id, { state: "normal" });
    await chrome.windows.update(win.id, { width, height });
  }

  async handleResizePreset(element) {
    const w = Number(element.dataset.width || element.dataset.w);
    const h = Number(element.dataset.height || element.dataset.h);
    if (w < 200 || h < 200) throw new Error('Invalid dimensions (min 200px)');
    await this.resizeCurrentWindow(w, h);
    this.showNotification(`✓ Resized to ${w}×${h}`, "success");
  }

  async handleResizeAction(action) {
    if (action === 'displayWindowSize') {
      const win = await chrome.windows.getCurrent();
      this.showNotification(`Window: ${win.width}×${win.height} (${win.state})`, "info");
    } else if (action === 'viewResponsiveLayouts') {
      const target = this.currentTab?.url ? encodeURIComponent(this.currentTab.url) : '';
      await chrome.tabs.create({ url: chrome.runtime.getURL(`html/responsive-layouts.html?target=${target}`), active: true });
    }
    return { ok: true };
  }

  // ==================== NOTIFICATION SYSTEM ====================
  showNotification(message, type = "success") {
    if (!this.notificationContainer) this.createNotificationContainer();

    let notification = this.notificationContainer.querySelector('.notification');

    if (!notification) {
      notification = document.createElement('div');
      notification.className = `notification notification-${type}`;

      const contentSpan = document.createElement('span');
      contentSpan.className = 'notification-text';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'notification-close';
      closeBtn.innerHTML = '&times;';

      closeBtn.addEventListener('click', () => {
        notification.classList.remove('show');
      });

      notification.appendChild(contentSpan);
      notification.appendChild(closeBtn);
      this.notificationContainer.appendChild(notification);
    }

    notification.className = `notification notification-${type} show`;
    const text = notification.querySelector('.notification-text');
    if (text) text.innerHTML = message;

    if (this.notificationTimeout) clearTimeout(this.notificationTimeout);

    this.notificationTimeout = setTimeout(() => {
      notification.classList.remove('show');
    }, 5000);
  }

  clearNotification(newCategory = null) {
    if (!this.notificationContainer) return;

    if (!newCategory || newCategory === this.currentCategory) return;

    const notification = this.notificationContainer.querySelector('.notification');
    if (notification) {
      notification.classList.remove('show');

      setTimeout(() => {
        const span = notification.querySelector('.notification-text');
        if (span) span.innerHTML = '';
      }, 100);
    }
  }

  // ==================== UTILITY METHODS ====================
  switchTab(category) {
    this.currentCategory = category;
    document.querySelectorAll("[data-category]").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.category === category);
    });
    document.querySelectorAll(".tab-panel").forEach(panel => {
      panel.classList.toggle("d-none", panel.dataset.category !== category);
    });
    this.clearNotification(category);
  }

  async ensureScriptsLoaded() {
    if (!this.currentTab?.id) return;
    const files = Object.values(this.categories).map(c => c.file).filter(Boolean);
    await this.executeInTab({ files, world: "MAIN" });
    for (let i = 0; i < 10; i++) {
      const check = await this.executeInTab({ func: () => !!window.disableFunctions, world: "MAIN" });
      if (check?.[0]?.result) break;
      await new Promise(r => setTimeout(r, 100));
    }
  }

  async executeInTab({ files = [], func = null, args = [], world = "ISOLATED" }) {
    if (!this.currentTab) await this.loadCurrentTab();
    if (!this.currentTab?.id) throw new Error("No active tab");

    if (files.length) {
      await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        files,
        world
      });
    }

    if (func) {
      return await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        func,
        args,
        world
      });
    }
  }

  setupTabNavigation() {
    document.querySelectorAll("[data-category]").forEach(tab => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        this.switchTab(e.currentTarget.dataset.category);
      });
    });
  }

  getCurrentCategory() {
    const activeTab = document.querySelector('[data-category].active');
    return activeTab ? activeTab.dataset.category : 'disable';
  }

  formatSuccessMessage(category, action, isActive, isOneShot) {
    const name = this.formatFunctionName(action);
    if (isOneShot) {
      return `${category}: ${name} ✓`;
    }
    return `${category}: ${name} ${isActive ? "✓ Applied" : "✗ Reverted"}`;
  }

  formatFunctionName(name) {
    return String(name || "").replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()).trim();
  }
}

document.addEventListener("DOMContentLoaded", () => new ExtensionPopup());