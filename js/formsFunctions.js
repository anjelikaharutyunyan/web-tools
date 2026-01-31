// formsFunctions.js
// Runs in PAGE context (MAIN world)
// Provides: window.formsFunctions.apply/revert/run
// - apply/revert: for toggle tools
// - run: for one-shot tools (safe, no state needed)

(() => {
  if (window.formsFunctions) return;

  const NS = "__forms_tools";

  const state =
    window[NS] ||
    (window[NS] = {
      applied: new Set(),
      stylesInjected: false,

      // --- toggles state snapshots ---
      // key -> Map<Element, prevValue>
      prev: {
        formMethod: new Map(), // form -> previous method
        selectToInput: new Map(), // placeholderId -> record
        inputToTextarea: new Map(), // placeholderId -> record
        passwordTypes: new Map(), // input -> previous type
        autocomplete: new Map(), // el -> previous autocomplete attr (string|null)
        disabled: new Map(), // el -> previous disabled boolean
        readonly: new Map(), // el -> previous readonly boolean
        selectExpand: new Map(), // select -> { size, multiple }
        validation: new Map(), // el -> attributes snapshot for validation-related
        maxLength: new Map(), // input/textarea -> previous maxlength attr (string|null)
        outlinedNoLabel: new Set(), // elements outlined
      },

      // panel id
      panelId: `${NS}_panel`,
    });

  // ---------------- styles + panel ----------------
  function ensureStyles() {
    if (state.stylesInjected) return;
    state.stylesInjected = true;

    const style = document.createElement("style");
    style.id = `${NS}_style`;
    style.textContent = `
      .${NS}-outline {
        outline: 2px dashed rgba(255,0,0,.85) !important;
        outline-offset: 2px !important;
      }
      .${NS}-badge {
        position:absolute;
        z-index:2147483647;
        font:12px/1.2 Arial,sans-serif;
        padding:2px 6px;
        border-radius:999px;
        background:rgba(0,0,0,.85);
        color:#fff;
        pointer-events:none;
        transform:translateY(-100%);
        white-space:nowrap;
        max-width:min(420px, 60vw);
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .${NS}-panel{
        position:fixed;
        top:16px;
        right:16px;
        width:min(560px, calc(100vw - 32px));
        max-height:calc(100vh - 32px);
        overflow:auto;
        z-index:2147483647;
        background:#111;
        color:#fff;
        border:1px solid rgba(255,255,255,.15);
        border-radius:12px;
        padding:12px;
        box-shadow:0 10px 30px rgba(0,0,0,.35);
        font:13px/1.4 Arial,sans-serif;
      }
      .${NS}-panel h3{ margin:0 0 8px; font-size:14px; }
      .${NS}-panel pre{
        margin:0;
        white-space:pre-wrap;
        word-break:break-word;
        background:rgba(255,255,255,.06);
        padding:10px;
        border-radius:10px;
      }
      .${NS}-panel .${NS}-close{
        float:right;
        cursor:pointer;
        border:none;
        background:rgba(255,255,255,.12);
        color:#fff;
        padding:6px 10px;
        border-radius:10px;
      }
    `;
    document.documentElement.appendChild(style);
  }

  const escapeHtml = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  function openPanel(title, content) {
    ensureStyles();
    const old = document.getElementById(state.panelId);
    if (old) old.remove();

    const panel = document.createElement("div");
    panel.className = `${NS}-panel`;
    panel.id = state.panelId;

    panel.innerHTML = `
      <button class="${NS}-close" aria-label="Close">Close</button>
      <h3>${escapeHtml(title)}</h3>
      <pre>${escapeHtml(content)}</pre>
    `;

    panel
      .querySelector(`.${NS}-close`)
      .addEventListener("click", () => panel.remove());
    document.documentElement.appendChild(panel);
  }

  // ---------------- helpers ----------------
  const isDisabled = (el) =>
    !!el.disabled || el.getAttribute("aria-disabled") === "true";

  function triggerChange(el) {
    try {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {}
  }

  function getLabelForControl(el) {
    // 1) <label for="id">
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return l;
    }
    // 2) wrapped <label>...</label>
    const parentLabel = el.closest("label");
    return parentLabel || null;
  }

  function getAllFormControls() {
    return Array.from(
      document.querySelectorAll("input, textarea, select, button"),
    ).filter((el) => el.isConnected);
  }

  function getAllInputsTextLike() {
    const types = new Set([
      "text",
      "email",
      "search",
      "tel",
      "url",
      "number",
      "password",
    ]);
    return Array.from(document.querySelectorAll("input")).filter((i) =>
      types.has((i.getAttribute("type") || "text").toLowerCase()),
    );
  }

  function uid() {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  // ---------------- badge system for Display Form Details ----------------
  let raf = 0;
  let listenersOn = false;
  let badges = []; // Array<{badge, el}>

  function scheduleBadgeUpdate() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      updateBadges();
    });
  }

  function ensureBadgeListeners() {
    if (listenersOn) return;
    listenersOn = true;
    window.addEventListener("scroll", scheduleBadgeUpdate, { passive: true });
    window.addEventListener("resize", scheduleBadgeUpdate, { passive: true });
  }

  function maybeRemoveBadgeListeners() {
    if (badges.length > 0) return;
    if (!listenersOn) return;
    listenersOn = false;
    window.removeEventListener("scroll", scheduleBadgeUpdate);
    window.removeEventListener("resize", scheduleBadgeUpdate);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function updateBadges() {
    for (const item of badges) {
      if (!item?.badge || !item?.el || !item.el.isConnected) continue;
      const r = item.el.getBoundingClientRect();

      if (
        r.bottom < 0 ||
        r.right < 0 ||
        r.top > innerHeight ||
        r.left > innerWidth
      ) {
        item.badge.style.display = "none";
        continue;
      }
      item.badge.style.display = "";

      item.badge.style.top = `${Math.max(0, r.top + window.scrollY)}px`;
      item.badge.style.left = `${Math.max(0, r.left + window.scrollX)}px`;
    }
  }

  function clearBadges() {
    for (const b of badges) b?.badge?.remove();
    badges = [];
    maybeRemoveBadgeListeners();
  }

  function addBadge(el, text) {
    ensureStyles();
    ensureBadgeListeners();

    const r = el.getBoundingClientRect();
    const b = document.createElement("div");
    b.className = `${NS}-badge`;
    b.textContent = text;

    b.style.top = `${Math.max(0, r.top + window.scrollY)}px`;
    b.style.left = `${Math.max(0, r.left + window.scrollX)}px`;

    document.documentElement.appendChild(b);
    badges.push({ badge: b, el });
  }

  // ---------------- actions: one-shot ----------------
  const oneShots = {
    checkAllCheckboxes() {
      const boxes = Array.from(
        document.querySelectorAll('input[type="checkbox"]'),
      ).filter((cb) => !isDisabled(cb));

      let changed = 0;
      for (const cb of boxes) {
        if (!cb.checked) {
          cb.checked = true;
          triggerChange(cb);
          changed++;
        }
      }
      return { changed, total: boxes.length };
    },

    uncheckAllCheckboxes() {
      const boxes = Array.from(
        document.querySelectorAll('input[type="checkbox"]'),
      );

      let changed = 0;
      let skippedDisabled = 0;

      for (const cb of boxes) {
        // skip disabled
        if (cb.disabled || cb.getAttribute("aria-disabled") === "true") {
          skippedDisabled++;
          continue;
        }

        // clear indeterminate state too
        if (cb.indeterminate) {
          cb.indeterminate = false;
        }

        // if it's checked, prefer a real click (works for many frameworks)
        if (cb.checked) {
          try {
            cb.click(); // triggers site listeners
            changed++;
            continue;
          } catch {}

          // fallback: set checked directly + dispatch events
          cb.checked = false;
          cb.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          cb.dispatchEvent(new Event("input", { bubbles: true }));
          cb.dispatchEvent(new Event("change", { bubbles: true }));
          changed++;
        }
      }

      return { changed, total: boxes.length, skippedDisabled };
    },

    clearFormFields() {
      const els = Array.from(
        document.querySelectorAll("input, textarea, select"),
      ).filter((el) => !isDisabled(el));
      let cleared = 0;

      for (const el of els) {
        const tag = el.tagName.toLowerCase();

        if (tag === "textarea") {
          if (!el.readOnly && el.value !== "") {
            el.value = "";
            triggerChange(el);
            cleared++;
          }
          continue;
        }

        if (tag === "select") {
          if (el.selectedIndex !== 0) {
            el.selectedIndex = 0;
            triggerChange(el);
            cleared++;
          }
          continue;
        }

        const type = (el.getAttribute("type") || "text").toLowerCase();
        const skip = new Set([
          "button",
          "submit",
          "reset",
          "image",
          "hidden",
          "file",
        ]);
        if (skip.has(type)) continue;

        if (type === "checkbox" || type === "radio") continue;
        if (el.readOnly) continue;

        if (el.value !== "") {
          el.value = "";
          triggerChange(el);
          cleared++;
        }
      }

      return { cleared };
    },

    clearRadioButtons() {
      const radios = Array.from(
        document.querySelectorAll('input[type="radio"]'),
      ).filter((r) => !isDisabled(r));

      let changed = 0;
      for (const r of radios) {
        if (r.checked) {
          r.checked = false;
          triggerChange(r);
          changed++;
        }
      }
      return { changed, total: radios.length };
    },

    populateFormFields() {
      const controls = Array.from(
        document.querySelectorAll("input, textarea, select"),
      ).filter((el) => !isDisabled(el));

      const sample = {
        text: "John Doe",
        email: "john@example.com",
        tel: "+1 555 123 4567",
        url: "https://example.com",
        search: "sample search",
        number: "123",
        password: "password123",
      };

      let filled = 0;

      for (const el of controls) {
        const tag = el.tagName.toLowerCase();

        if (tag === "select") {
          if (el.options && el.options.length > 1) {
            el.selectedIndex = Math.min(1, el.options.length - 1);
            triggerChange(el);
            filled++;
          }
          continue;
        }

        if (tag === "textarea") {
          if (!el.readOnly && !el.value) {
            el.value = "Sample text...";
            triggerChange(el);
            filled++;
          }
          continue;
        }

        const type = (el.getAttribute("type") || "text").toLowerCase();
        if (type === "checkbox") {
          if (!el.checked) {
            el.checked = true;
            triggerChange(el);
            filled++;
          }
          continue;
        }
        if (type === "radio") {
          // set first radio in each name group (best effort)
          if (!el.checked) {
            el.checked = true;
            triggerChange(el);
            filled++;
          }
          continue;
        }

        if (el.readOnly) continue;
        if (type === "file" || type === "hidden") continue;

        if (!el.value) {
          el.value = sample[type] ?? sample.text;
          triggerChange(el);
          filled++;
        }
      }

      return { filled };
    },

    viewFormInformation() {
      const forms = Array.from(document.querySelectorAll("form"));
      const lines = [];

      if (!forms.length) {
        openPanel("Form Information", "No <form> elements found on this page.");
        return;
      }

      forms.forEach((f, idx) => {
        const method = (f.getAttribute("method") || "get").toUpperCase();
        const action = f.getAttribute("action") || "(no action)";
        const id = f.id ? `#${f.id}` : "";
        const name = f.getAttribute("name")
          ? `[name="${f.getAttribute("name")}"]`
          : "";
        const controls = f.querySelectorAll(
          "input, textarea, select, button",
        ).length;

        lines.push(
          `FORM ${idx + 1} ${id}${name}`,
          `  method: ${method}`,
          `  action: ${action}`,
          `  controls: ${controls}`,
          "",
        );
      });

      openPanel("Form Information", lines.join("\n"));
    },
  };

  // ---------------- actions: toggle (apply/revert) ----------------
  const toggles = {
    convertFormGetsToPosts: {
      apply() {
        const forms = Array.from(document.querySelectorAll("form"));
        let changed = 0;

        for (const f of forms) {
          const prevMethod = f.getAttribute("method"); // could be null
          state.prev.formMethod.set(f, prevMethod);

          const m = (prevMethod || "get").toLowerCase();
          if (m === "get") {
            f.setAttribute("method", "post");
            changed++;
          }
        }
        return { changed, total: forms.length };
      },
      revert() {
        for (const [f, prevMethod] of state.prev.formMethod.entries()) {
          if (!f.isConnected) continue;
          if (prevMethod == null) f.removeAttribute("method");
          else f.setAttribute("method", prevMethod);
        }
        state.prev.formMethod.clear();
        return true;
      },
    },

    convertFormPostsToGets: {
      apply() {
        const forms = Array.from(document.querySelectorAll("form"));
        let changed = 0;

        for (const f of forms) {
          const prevMethod = f.getAttribute("method");
          state.prev.formMethod.set(f, prevMethod);

          const m = (prevMethod || "get").toLowerCase();
          if (m === "post") {
            f.setAttribute("method", "get");
            changed++;
          }
        }
        return { changed, total: forms.length };
      },
      revert() {
        for (const [f, prevMethod] of state.prev.formMethod.entries()) {
          if (!f.isConnected) continue;
          if (prevMethod == null) f.removeAttribute("method");
          else f.setAttribute("method", prevMethod);
        }
        state.prev.formMethod.clear();
        return true;
      },
    },

    convertSelectElementsToTextInputs: {
      apply() {
        const selects = Array.from(document.querySelectorAll("select")).filter(
          (s) => !isDisabled(s),
        );
        let converted = 0;

        for (const sel of selects) {
          // skip if already replaced (not connected)
          if (!sel.isConnected) continue;

          const parent = sel.parentNode;
          if (!parent) continue;

          const placeholderId = uid();
          const nextSibling = sel.nextSibling;

          // value = selected option value/text
          const opt = sel.selectedOptions?.[0];
          const value = opt ? opt.value || opt.textContent || "" : "";

          const input = document.createElement("input");
          input.type = "text";
          input.value = value;

          if (sel.name) input.name = sel.name;
          if (sel.id) input.id = sel.id;
          if (sel.className) input.className = sel.className;

          input.setAttribute(`data-${NS}-placeholder`, placeholderId);
          input.setAttribute(`data-${NS}-from`, "select");

          // put input before select then remove select
          parent.insertBefore(input, sel);
          parent.removeChild(sel);

          state.prev.selectToInput.set(placeholderId, {
            parent,
            nextSibling,
            select: sel,
            input,
          });
          triggerChange(input);
          converted++;
        }

        return { converted, total: selects.length };
      },

      revert() {
        for (const [placeholderId, rec] of state.prev.selectToInput.entries()) {
          const { parent, nextSibling, select, input } = rec;
          if (!parent?.isConnected) continue;

          // input is currently in DOM
          if (input?.isConnected) parent.removeChild(input);

          // restore select near original position
          if (nextSibling && nextSibling.parentNode === parent)
            parent.insertBefore(select, nextSibling);
          else parent.appendChild(select);

          triggerChange(select);
        }

        state.prev.selectToInput.clear();
        return true;
      },
    },

    convertTextInputsToTextareas: {
      apply() {
        const inputs = getAllInputsTextLike().filter((i) => !isDisabled(i));
        let converted = 0;

        for (const inp of inputs) {
          // don't convert password here (use Display Passwords)
          const type = (inp.getAttribute("type") || "text").toLowerCase();
          if (type === "password") continue;
          if (!inp.isConnected) continue;

          const parent = inp.parentNode;
          if (!parent) continue;

          const placeholderId = uid();
          const nextSibling = inp.nextSibling;

          const ta = document.createElement("textarea");
          ta.value = inp.value || "";
          if (inp.name) ta.name = inp.name;
          if (inp.id) ta.id = inp.id;
          if (inp.className) ta.className = inp.className;
          if (inp.placeholder) ta.placeholder = inp.placeholder;

          ta.setAttribute(`data-${NS}-placeholder`, placeholderId);
          ta.setAttribute(`data-${NS}-from`, "input");

          parent.insertBefore(ta, inp);
          parent.removeChild(inp);

          state.prev.inputToTextarea.set(placeholderId, {
            parent,
            nextSibling,
            input: inp,
            textarea: ta,
          });
          triggerChange(ta);
          converted++;
        }

        return { converted, total: inputs.length };
      },

      revert() {
        for (const [, rec] of state.prev.inputToTextarea.entries()) {
          const { parent, nextSibling, input, textarea } = rec;
          if (!parent?.isConnected) continue;

          if (textarea?.isConnected) parent.removeChild(textarea);

          // update input value with textarea value for consistency
          try {
            input.value = textarea.value || "";
          } catch {}

          if (nextSibling && nextSibling.parentNode === parent)
            parent.insertBefore(input, nextSibling);
          else parent.appendChild(input);

          triggerChange(input);
        }

        state.prev.inputToTextarea.clear();
        return true;
      },
    },

    displayPasswords: {
      apply() {
        const pw = Array.from(
          document.querySelectorAll('input[type="password"]'),
        ).filter((i) => !isDisabled(i));
        let changed = 0;

        for (const i of pw) {
          state.prev.passwordTypes.set(i, i.getAttribute("type"));
          i.setAttribute("type", "text");
          changed++;
        }
        return { changed, total: pw.length };
      },
      revert() {
        for (const [i, prevType] of state.prev.passwordTypes.entries()) {
          if (!i.isConnected) continue;
          if (prevType == null) i.setAttribute("type", "password");
          else i.setAttribute("type", prevType);
        }
        state.prev.passwordTypes.clear();
        return true;
      },
    },

    enableAutoCompletion: {
      apply() {
        const targets = Array.from(
          document.querySelectorAll("form, input, textarea"),
        ).filter((el) => el.isConnected);

        let changed = 0;
        for (const el of targets) {
          const prev = el.getAttribute("autocomplete"); // null or string
          state.prev.autocomplete.set(el, prev);

          if (prev !== "on") {
            el.setAttribute("autocomplete", "on");
            changed++;
          }
        }
        return { changed, total: targets.length };
      },
      revert() {
        for (const [el, prev] of state.prev.autocomplete.entries()) {
          if (!el.isConnected) continue;
          if (prev == null) el.removeAttribute("autocomplete");
          else el.setAttribute("autocomplete", prev);
        }
        state.prev.autocomplete.clear();
        return true;
      },
    },

    enableFormFields: {
      apply() {
        const controls = getAllFormControls();
        let changed = 0;

        for (const el of controls) {
          state.prev.disabled.set(el, !!el.disabled);
          if (el.disabled) {
            el.disabled = false;
            changed++;
          }
          if (el.hasAttribute("disabled")) el.removeAttribute("disabled");
        }
        return { changed, total: controls.length };
      },
      revert() {
        for (const [el, wasDisabled] of state.prev.disabled.entries()) {
          if (!el.isConnected) continue;
          el.disabled = !!wasDisabled;
          if (wasDisabled) el.setAttribute("disabled", "");
          else el.removeAttribute("disabled");
        }
        state.prev.disabled.clear();
        return true;
      },
    },

    expandSelectElements: {
      apply() {
        const selects = Array.from(document.querySelectorAll("select")).filter(
          (s) => !isDisabled(s),
        );
        let changed = 0;

        for (const s of selects) {
          state.prev.selectExpand.set(s, {
            size: s.getAttribute("size"),
            multiple: s.hasAttribute("multiple"),
          });

          const count = Math.max(2, Math.min(12, s.options?.length || 2));
          s.setAttribute("size", String(count));
          // allow multi to make it more "expanded" like list (optional)
          s.setAttribute("multiple", "");
          changed++;
          triggerChange(s);
        }

        return { changed, total: selects.length };
      },
      revert() {
        for (const [s, prev] of state.prev.selectExpand.entries()) {
          if (!s.isConnected) continue;

          if (prev.size == null) s.removeAttribute("size");
          else s.setAttribute("size", prev.size);

          if (prev.multiple) s.setAttribute("multiple", "");
          else s.removeAttribute("multiple");

          triggerChange(s);
        }
        state.prev.selectExpand.clear();
        return true;
      },
    },

    makeFormFieldsWritable: {
      apply() {
        const controls = Array.from(
          document.querySelectorAll("input, textarea"),
        ).filter((el) => el.isConnected);
        let changed = 0;

        for (const el of controls) {
          state.prev.readonly.set(el, !!el.readOnly);
          if (el.readOnly) {
            el.readOnly = false;
            el.removeAttribute("readonly");
            changed++;
          }
        }
        return { changed, total: controls.length };
      },
      revert() {
        for (const [el, wasReadonly] of state.prev.readonly.entries()) {
          if (!el.isConnected) continue;
          el.readOnly = !!wasReadonly;
          if (wasReadonly) el.setAttribute("readonly", "");
          else el.removeAttribute("readonly");
        }
        state.prev.readonly.clear();
        return true;
      },
    },

    removeMaximumLengths: {
      apply() {
        const els = Array.from(
          document.querySelectorAll("input[maxlength], textarea[maxlength]"),
        );
        let changed = 0;

        for (const el of els) {
          const prev = el.getAttribute("maxlength");
          state.prev.maxLength.set(el, prev);
          el.removeAttribute("maxlength");
          changed++;
        }
        return { changed, total: els.length };
      },
      revert() {
        for (const [el, prev] of state.prev.maxLength.entries()) {
          if (!el.isConnected) continue;
          if (prev == null) el.removeAttribute("maxlength");
          else el.setAttribute("maxlength", prev);
        }
        state.prev.maxLength.clear();
        return true;
      },
    },

    removeFormValidation: {
      apply() {
        const forms = Array.from(document.querySelectorAll("form"));
        const controls = Array.from(
          document.querySelectorAll("input, textarea, select"),
        );

        let changed = 0;

        // forms: novalidate
        for (const f of forms) {
          const key = `form:${uid()}`;
          state.prev.validation.set(key, {
            el: f,
            attrs: { novalidate: f.hasAttribute("novalidate") },
          });

          if (!f.hasAttribute("novalidate")) {
            f.setAttribute("novalidate", "");
            changed++;
          }
        }

        // controls: remove required/pattern/min/max/step
        const ATTRS = ["required", "pattern", "min", "max", "step"];
        for (const el of controls) {
          const snap = {};
          for (const a of ATTRS) {
            snap[a] = el.hasAttribute(a) ? el.getAttribute(a) : null;
          }

          const key = `ctrl:${uid()}`;
          state.prev.validation.set(key, { el, attrs: snap });

          let removedAny = false;
          for (const a of ATTRS) {
            if (el.hasAttribute(a)) {
              el.removeAttribute(a);
              removedAny = true;
            }
          }
          if (removedAny) changed++;
        }

        return { changed };
      },
      revert() {
        for (const [, rec] of state.prev.validation.entries()) {
          const el = rec.el;
          if (!el?.isConnected) continue;

          const attrs = rec.attrs || {};
          // form novalidate
          if ("novalidate" in attrs) {
            if (attrs.novalidate) el.setAttribute("novalidate", "");
            else el.removeAttribute("novalidate");
            continue;
          }

          // controls
          for (const [a, v] of Object.entries(attrs)) {
            if (v == null) el.removeAttribute(a);
            else el.setAttribute(a, v);
          }
        }

        state.prev.validation.clear();
        return true;
      },
    },

    outlineFormFieldsWithoutLabels: {
      apply() {
        ensureStyles();
        const controls = Array.from(
          document.querySelectorAll("input, textarea, select"),
        ).filter((el) => !isDisabled(el));

        let outlined = 0;
        for (const el of controls) {
          // ignore hidden
          if (el.tagName.toLowerCase() === "input") {
            const t = (el.getAttribute("type") || "text").toLowerCase();
            if (t === "hidden") continue;
          }

          const label = getLabelForControl(el);
          if (!label) {
            el.classList.add(`${NS}-outline`);
            el.setAttribute(`data-${NS}-nolabel`, "1");
            state.prev.outlinedNoLabel.add(el);
            outlined++;
          }
        }
        return { outlined };
      },
      revert() {
        for (const el of state.prev.outlinedNoLabel) {
          if (!el.isConnected) continue;
          el.classList.remove(`${NS}-outline`);
          el.removeAttribute(`data-${NS}-nolabel`);
        }
        state.prev.outlinedNoLabel.clear();
        return true;
      },
    },

    displayFormDetails: {
      apply() {
        // show badges for forms + basic info
        ensureStyles();
        clearBadges();

        const forms = Array.from(document.querySelectorAll("form"));
        if (!forms.length) return { forms: 0 };

        forms.forEach((f, idx) => {
          const method = (f.getAttribute("method") || "get").toUpperCase();
          const action = f.getAttribute("action") || "(no action)";
          const controls = f.querySelectorAll(
            "input, textarea, select, button",
          ).length;
          addBadge(f, `form #${idx + 1} • ${method} • ${controls} fields`);
          // optional: outline the form element itself
          f.classList.add(`${NS}-outline`);
          f.setAttribute(`data-${NS}-formdetail`, "1");
        });

        scheduleBadgeUpdate();
        return { forms: forms.length };
      },
      revert() {
        clearBadges();
        document
          .querySelectorAll(`[data-${NS}-formdetail="1"]`)
          .forEach((f) => {
            f.classList.remove(`${NS}-outline`);
            f.removeAttribute(`data-${NS}-formdetail`);
          });
        return true;
      },
    },
  };

  // ---------------- PUBLIC API ----------------
  window.formsFunctions = {
    apply(name) {
      const t = toggles[name];
      if (!t?.apply) return null;
      const out = t.apply();
      state.applied.add(name);
      return out ?? true;
    },

    revert(name) {
      const t = toggles[name];
      if (!t?.revert) return null;
      const out = t.revert();
      state.applied.delete(name);
      return out ?? true;
    },

    run(name) {
      const fn = oneShots[name];
      if (!fn) return null;
      return fn();
    },

    revertAll() {
      for (const n of Array.from(state.applied)) {
        try {
          toggles[n]?.revert?.();
        } catch {}
      }
      state.applied.clear();
      // cleanup panel + badges
      const panel = document.getElementById(state.panelId);
      if (panel) panel.remove();
      clearBadges();
    },
  };
})();
