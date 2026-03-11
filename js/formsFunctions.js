// js/formsFunctions.js
(() => {
  const STATE_KEY = "__formsFunctionsState__";

  function getStateRoot() {
    if (!window[STATE_KEY]) {
      window[STATE_KEY] = {
        // per action: { changes: [...] }
        actions: Object.create(null),
        // overlays by id
        overlays: new Map(),
      };
    }
    return window[STATE_KEY];
  }

  function ensureActionState(actionName) {
    const root = getStateRoot();
    if (!root.actions[actionName]) root.actions[actionName] = { changes: [] };
    return root.actions[actionName];
  }

  // -------------------- Utilities --------------------
  function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function getAllFormsAndFields() {
    const forms = qsa("form");
    // include fields not inside a form too (some pages do that)
    const fields = qsa(
      "input, select, textarea, button",
      document,
    ).filter((el) => el && el.nodeType === 1);
    return { forms, fields };
  }

  function hasAnyFormStuff() {
    const { forms, fields } = getAllFormsAndFields();
    return forms.length > 0 || fields.length > 0;
  }

  function isUsableField(el) {
    if (!el || el.disabled) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "button") return false;
    return tag === "input" || tag === "select" || tag === "textarea";
  }

  function isTextLikeInput(el) {
    if (!el || el.tagName.toLowerCase() !== "input") return false;
    const t = (el.getAttribute("type") || "text").toLowerCase();
    // treat these as "text-like"
    return (
      t === "text" ||
      t === "search" ||
      t === "email" ||
      t === "url" ||
      t === "tel" ||
      t === "number" ||
      t === "password"
    );
  }

  function recordAttrChange(actionName, el, attr) {
    const s = ensureActionState(actionName);
    const had = el.hasAttribute(attr);
    const old = el.getAttribute(attr);
    s.changes.push({
      kind: "attr",
      el,
      attr,
      had,
      old,
    });
  }

  function recordPropChange(actionName, el, prop) {
    const s = ensureActionState(actionName);
    const old = el[prop];
    s.changes.push({
      kind: "prop",
      el,
      prop,
      old,
    });
  }

  function recordStyleChange(actionName, el, styleProp) {
    const s = ensureActionState(actionName);
    const old = el.style[styleProp];
    s.changes.push({
      kind: "style",
      el,
      styleProp,
      old,
    });
  }

  function recordReplacement(actionName, oldEl, newEl, parent, nextSibling) {
    const s = ensureActionState(actionName);
    s.changes.push({
      kind: "replace",
      oldEl,
      newEl,
      parent,
      nextSibling,
    });
  }

  function applyRecordedChanges(changes, mode /* "revert" */) {
    // Revert in reverse order (important for replacements)
    for (let i = changes.length - 1; i >= 0; i--) {
      const c = changes[i];
      if (!c) continue;

      if (c.kind === "attr") {
        if (c.had) c.el.setAttribute(c.attr, c.old);
        else c.el.removeAttribute(c.attr);
      } else if (c.kind === "prop") {
        c.el[c.prop] = c.old;
        // try to dispatch input/change for pages that react
        try {
          c.el.dispatchEvent(new Event("input", { bubbles: true }));
          c.el.dispatchEvent(new Event("change", { bubbles: true }));
        } catch { }
      } else if (c.kind === "style") {
        c.el.style[c.styleProp] = c.old;
      } else if (c.kind === "replace") {
        // revert replacement: put oldEl back
        if (c.newEl && c.newEl.parentNode) {
          c.newEl.parentNode.removeChild(c.newEl);
        }
        if (c.parent) {
          if (c.nextSibling && c.nextSibling.parentNode === c.parent) {
            c.parent.insertBefore(c.oldEl, c.nextSibling);
          } else {
            c.parent.appendChild(c.oldEl);
          }
        }
      } else if (c.kind === "overlay") {
        const root = getStateRoot();
        const overlay = root.overlays.get(c.id);
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        root.overlays.delete(c.id);
      }
    }
  }

  function fireClickAndChange(el) {
    try {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch { }
  }

  function safeLabelFor(el) {
    // checks if element has a usable label
    const id = el.getAttribute("id");
    if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return true;
    // wrapped in label
    if (el.closest("label")) return true;
    // aria-label / aria-labelledby
    if (el.getAttribute("aria-label")) return true;
    if (el.getAttribute("aria-labelledby")) return true;
    return false;
  }

  // -------------------- Actions --------------------
  function checkAllCheckboxes(actionName) {
    const boxes = qsa('input[type="checkbox"]').filter((b) => !b.disabled);
    if (!boxes.length) return null;

    // record previous checked state
    boxes.forEach((b) => recordPropChange(actionName, b, "checked"));
    boxes.forEach((b) => {
      b.checked = true;
      fireClickAndChange(b);
    });

    return { ok: true, message: `Checked ${boxes.length} checkbox(es)` };
  }

  function uncheckAllCheckboxes(actionName) {
    const boxes = qsa('input[type="checkbox"]').filter((b) => !b.disabled);
    if (!boxes.length) return null;

    boxes.forEach((b) => recordPropChange(actionName, b, "checked"));
    boxes.forEach((b) => {
      b.checked = false;
      fireClickAndChange(b);
    });

    return { ok: true, message: `Unchecked ${boxes.length} checkbox(es)` };
  }

  function clearFormFields(actionName) {
    const { fields } = getAllFormsAndFields();
    const targets = fields.filter(isUsableField);
    if (!targets.length) return null;

    let count = 0;

    targets.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === "select") {
        recordPropChange(actionName, el, "selectedIndex");
        el.selectedIndex = -1;
        count++;
        fireClickAndChange(el);
        return;
      }

      if (tag === "textarea") {
        recordPropChange(actionName, el, "value");
        el.value = "";
        count++;
        fireClickAndChange(el);
        return;
      }

      // input types
      if (tag === "input") {
        const t = (el.getAttribute("type") || "text").toLowerCase();

        if (t === "checkbox" || t === "radio") {
          recordPropChange(actionName, el, "checked");
          el.checked = false;
          count++;
          fireClickAndChange(el);
          return;
        }

        // other inputs
        recordPropChange(actionName, el, "value");
        el.value = "";
        count++;
        fireClickAndChange(el);
      }
    });

    return { ok: true, message: `Cleared ${count} field(s)` };
  }

  function clearRadioButtons(actionName) {
    const radios = qsa('input[type="radio"]').filter((r) => !r.disabled);
    if (!radios.length) return null;

    radios.forEach((r) => recordPropChange(actionName, r, "checked"));
    radios.forEach((r) => {
      r.checked = false;
      fireClickAndChange(r);
    });

    return { ok: true, message: `Cleared ${radios.length} radio button(s)` };
  }

  function convertFormGetsToPosts(actionName) {
    const forms = qsa("form");
    if (!forms.length) return null;

    let count = 0;
    forms.forEach((f) => {
      const method = (f.getAttribute("method") || "get").toLowerCase();
      if (method === "get") {
        recordAttrChange(actionName, f, "method");
        f.setAttribute("method", "post");
        count++;
      }
    });

    if (!count) return null;
    return { ok: true, message: `Converted ${count} form(s) GET → POST` };
  }

  function convertFormPostsToGets(actionName) {
    const forms = qsa("form");
    if (!forms.length) return null;

    let count = 0;
    forms.forEach((f) => {
      const method = (f.getAttribute("method") || "get").toLowerCase();
      if (method === "post") {
        recordAttrChange(actionName, f, "method");
        f.setAttribute("method", "get");
        count++;
      }
    });

    if (!count) return null;
    return { ok: true, message: `Converted ${count} form(s) POST → GET` };
  }

  function convertSelectElementsToTextInputs(actionName) {
    const selects = qsa("select").filter((s) => !s.disabled);
    if (!selects.length) return null;

    let count = 0;
    selects.forEach((sel) => {
      const parent = sel.parentNode;
      if (!parent) return;

      const input = document.createElement("input");
      input.type = "text";
      input.className = sel.className || "";
      input.name = sel.name || "";
      input.id = sel.id || "";
      input.placeholder = sel.getAttribute("placeholder") || "";
      input.value = sel.options?.[sel.selectedIndex]?.text || "";

      // keep inline styles
      input.style.cssText = sel.style.cssText || "";

      const next = sel.nextSibling;
      recordReplacement(actionName, sel, input, parent, next);
      parent.replaceChild(input, sel);
      count++;
    });

    return { ok: true, message: `Converted ${count} select(s) → text input(s)` };
  }

  function convertTextInputsToTextareas(actionName) {
    const inputs = qsa("input")
      .filter((i) => !i.disabled)
      .filter((i) => {
        const t = (i.getAttribute("type") || "text").toLowerCase();
        return t === "text" || t === "search" || t === "email" || t === "url" || t === "tel";
      });

    if (!inputs.length) return null;

    let count = 0;
    inputs.forEach((inp) => {
      const parent = inp.parentNode;
      if (!parent) return;

      const ta = document.createElement("textarea");
      ta.className = inp.className || "";
      ta.name = inp.name || "";
      ta.id = inp.id || "";
      ta.placeholder = inp.getAttribute("placeholder") || "";
      ta.value = inp.value || "";
      ta.rows = Math.max(2, Math.min(8, Math.round((inp.offsetHeight || 32) / 18)));

      ta.style.cssText = inp.style.cssText || "";

      const next = inp.nextSibling;
      recordReplacement(actionName, inp, ta, parent, next);
      parent.replaceChild(ta, inp);
      count++;
    });

    return { ok: true, message: `Converted ${count} input(s) → textarea(s)` };
  }

  function displayFormDetails(actionName) {
    const forms = qsa("form");
    if (!forms.length) return null;

    const id = "forms-details-overlay";
    // if already open, just no-op (do not return null, because forms exist)
    const root = getStateRoot();
    if (root.overlays.has(id)) return { ok: true, message: "Form details already shown" };

    const overlay = document.createElement("div");
    overlay.setAttribute("data-forms-overlay", id);
    overlay.style.cssText = [
      "position:fixed",
      "top:12px",
      "right:12px",
      "z-index:2147483647",
      "max-width:420px",
      "max-height:60vh",
      "overflow:auto",
      "background:#111",
      "color:#fff",
      "padding:12px",
      "border-radius:10px",
      "box-shadow:0 8px 30px rgba(0,0,0,.35)",
      "font:12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial",
    ].join(";");

    const rows = forms.map((f, idx) => {
      const action = f.getAttribute("action") || "(no action)";
      const method = (f.getAttribute("method") || "get").toUpperCase();
      const enc = f.getAttribute("enctype") || "(default)";
      const inputs = qsa("input,select,textarea", f).length;

      return {
        index: idx + 1,
        method,
        action,
        enctype: enc,
        fields: inputs,
      };
    });

    overlay.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
        <div style="font-weight:700;font-size:13px;">Form details (${forms.length})</div>
        <button data-close style="cursor:pointer;border:none;background:#333;color:#fff;border-radius:8px;padding:6px 10px;">Close</button>
      </div>
      <pre style="white-space:pre-wrap;margin:0;">${escapeHtml(JSON.stringify(rows, null, 2))}</pre>
    `;

    overlay.querySelector("[data-close]")?.addEventListener("click", () => {
      try {
        overlay.remove();
      } catch { }
      root.overlays.delete(id);
    });

    document.documentElement.appendChild(overlay);
    root.overlays.set(id, overlay);

    // record overlay so revert can remove it
    const s = ensureActionState(actionName);
    s.changes.push({ kind: "overlay", id });

    return { ok: true, message: "Displayed form details" };
  }

  function displayPasswords(actionName) {
    const pw = qsa('input[type="password"]').filter((i) => !i.disabled);
    if (!pw.length) return null;

    pw.forEach((i) => recordAttrChange(actionName, i, "type"));
    pw.forEach((i) => i.setAttribute("type", "text"));

    return { ok: true, message: `Displayed ${pw.length} password field(s)` };
  }

  function enableAutoCompletion(actionName) {
    const { forms, fields } = getAllFormsAndFields();
    if (!forms.length && !fields.length) return null;

    let count = 0;
    forms.forEach((f) => {
      recordAttrChange(actionName, f, "autocomplete");
      f.setAttribute("autocomplete", "on");
      count++;
    });

    fields.forEach((el) => {
      if (!isUsableField(el)) return;
      recordAttrChange(actionName, el, "autocomplete");
      el.setAttribute("autocomplete", "on");
      count++;
    });

    return { ok: true, message: `Enabled autocomplete on ${count} element(s)` };
  }

  function enableFormFields(actionName) {
    const { fields } = getAllFormsAndFields();
    const targets = fields.filter((el) => el.disabled);
    if (!targets.length) return null;

    targets.forEach((el) => recordPropChange(actionName, el, "disabled"));
    targets.forEach((el) => (el.disabled = false));

    return { ok: true, message: `Enabled ${targets.length} disabled field(s)` };
  }

  function expandSelectElements(actionName) {
    const selects = qsa("select").filter((s) => !s.disabled);
    if (!selects.length) return null;

    let count = 0;
    selects.forEach((sel) => {
      const len = sel.options?.length || 0;
      if (len <= 1) return;

      recordAttrChange(actionName, sel, "size");
      // reasonable max so it doesn't destroy layout
      sel.setAttribute("size", String(Math.min(len, 12)));
      count++;
    });

    if (!count) return null;
    return { ok: true, message: `Expanded ${count} select(s)` };
  }

  function makeFormFieldsWritable(actionName) {
    const fields = qsa("input, textarea, select").filter((el) => el && el.nodeType === 1);
    if (!fields.length) return null;

    let count = 0;
    fields.forEach((el) => {
      // readonly for input/textarea
      if (el.hasAttribute("readonly")) {
        recordAttrChange(actionName, el, "readonly");
        el.removeAttribute("readonly");
        count++;
      }
      // aria-readonly
      if (el.getAttribute("aria-readonly") === "true") {
        recordAttrChange(actionName, el, "aria-readonly");
        el.setAttribute("aria-readonly", "false");
        count++;
      }
    });

    // also for contenteditable elements
    const editable = qsa("[contenteditable]").filter((el) => el.getAttribute("contenteditable") !== "true");
    editable.forEach((el) => {
      recordAttrChange(actionName, el, "contenteditable");
      el.setAttribute("contenteditable", "true");
      count++;
    });

    if (!count) return null;
    return { ok: true, message: `Made ${count} field(s) writable` };
  }

  function outlineFormFieldsWithoutLabels(actionName) {
    const fields = qsa("input, select, textarea").filter((el) => !el.disabled);
    if (!fields.length) return null;

    const targets = fields.filter((el) => !safeLabelFor(el));
    if (!targets.length) return null;

    targets.forEach((el) => {
      recordStyleChange(actionName, el, "outline");
      recordStyleChange(actionName, el, "outlineOffset");
      el.style.outline = "2px solid #ff4d4d";
      el.style.outlineOffset = "2px";
    });

    return { ok: true, message: `Outlined ${targets.length} field(s) without labels` };
  }

  function populateFormFields(actionName) {
    const fields = qsa("input, textarea, select").filter((el) => !el.disabled);
    if (!fields.length) return null;

    let count = 0;

    fields.forEach((el) => {
      const tag = el.tagName.toLowerCase();

      if (tag === "select") {
        const len = el.options?.length || 0;
        if (len <= 0) return;

        recordPropChange(actionName, el, "selectedIndex");
        // pick first non-disabled option if possible
        let idx = 0;
        for (let i = 0; i < len; i++) {
          if (!el.options[i].disabled) {
            idx = i;
            break;
          }
        }
        el.selectedIndex = idx;
        count++;
        fireClickAndChange(el);
        return;
      }

      if (tag === "textarea") {
        recordPropChange(actionName, el, "value");
        if (!el.value) {
          el.value = "Sample text";
          count++;
          fireClickAndChange(el);
        }
        return;
      }

      if (tag === "input") {
        const t = (el.getAttribute("type") || "text").toLowerCase();

        if (t === "checkbox") {
          recordPropChange(actionName, el, "checked");
          el.checked = true;
          count++;
          fireClickAndChange(el);
          return;
        }

        if (t === "radio") {
          // only check one per name group, if empty currently
          const name = el.name;
          if (!name) return;
          const group = qsa(`input[type="radio"][name="${CSS.escape(name)}"]`).filter((r) => !r.disabled);
          const anyChecked = group.some((r) => r.checked);
          if (anyChecked) return;

          group.forEach((r) => recordPropChange(actionName, r, "checked"));
          group[0].checked = true;
          count++;
          fireClickAndChange(group[0]);
          return;
        }

        recordPropChange(actionName, el, "value");
        if (!el.value) {
          if (t === "email") el.value = "test@example.com";
          else if (t === "url") el.value = "https://example.com";
          else if (t === "tel") el.value = "+37400000000";
          else if (t === "number") el.value = "1";
          else if (t === "password") el.value = "password123";
          else el.value = "Sample";
          count++;
          fireClickAndChange(el);
        }
      }
    });

    if (!count) return { ok: true, message: "Nothing empty to populate" };
    return { ok: true, message: `Populated ${count} field(s)` };
  }

  function removeFormValidation(actionName) {
    const { forms, fields } = getAllFormsAndFields();
    if (!forms.length && !fields.length) return null;

    let count = 0;

    // form-level novalidate
    forms.forEach((f) => {
      recordAttrChange(actionName, f, "novalidate");
      f.setAttribute("novalidate", "novalidate");
      count++;
    });

    // remove common validation-related attrs
    const attrsToRemove = [
      "required",
      "pattern",
      "min",
      "max",
      "step",
      "minlength",
      "maxlength",
      "aria-required",
    ];

    fields.forEach((el) => {
      if (!isUsableField(el)) return;
      attrsToRemove.forEach((a) => {
        if (el.hasAttribute(a)) {
          recordAttrChange(actionName, el, a);
          el.removeAttribute(a);
          count++;
        }
      });
    });

    return { ok: true, message: `Removed validation on ${count} attribute(s)/form(s)` };
  }

  function removeMaximumLengths(actionName) {
    const fields = qsa("input, textarea").filter((el) => !el.disabled);
    if (!fields.length) return null;

    let count = 0;
    fields.forEach((el) => {
      if (el.hasAttribute("maxlength")) {
        recordAttrChange(actionName, el, "maxlength");
        el.removeAttribute("maxlength");
        count++;
      }
    });

    if (!count) return null;
    return { ok: true, message: `Removed maxlength from ${count} field(s)` };
  }

  function viewFormInformation(actionName) {
    // show a quick overlay summary (same idea as displayFormDetails)
    return displayFormDetails(actionName);
  }

  // -------------------- Apply/Revert API --------------------
  const ACTIONS = {
    checkAllCheckboxes,
    uncheckAllCheckboxes,
    clearFormFields,
    clearRadioButtons,
    convertFormGetsToPosts,
    convertFormPostsToGets,
    convertSelectElementsToTextInputs,
    convertTextInputsToTextareas,
    displayFormDetails,
    displayPasswords,
    enableAutoCompletion,
    enableFormFields,
    expandSelectElements,
    makeFormFieldsWritable,
    outlineFormFieldsWithoutLabels,
    populateFormFields,
    removeFormValidation,
    removeMaximumLengths,
    viewFormInformation,
  };

  function apply(name) {
    try {
      if (!ACTIONS[name]) {
        return { ok: false, message: `Unknown forms action: ${name}` };
      }

      // reset previous changes for this action before re-applying
      const st = ensureActionState(name);
      st.changes = [];

      // if the page truly has no form-ish elements, return null (your main.js expects this)
      if (!hasAnyFormStuff()) return null;

      const res = ACTIONS[name](name);
      return res;
    } catch (e) {
      return { ok: false, message: String(e?.message || e) };
    }
  }

  function revert(name) {
    try {
      const root = getStateRoot();
      const st = root.actions[name];
      if (!st || !st.changes || st.changes.length === 0) {
        // Important: do NOT return null here, otherwise your main.js says "No forms..."
        return { ok: true, message: "Nothing to revert" };
      }

      applyRecordedChanges(st.changes, "revert");
      st.changes = [];

      return { ok: true, message: "Reverted" };
    } catch (e) {
      return { ok: false, message: String(e?.message || e) };
    }
  }

  function revertAll() {
    try {
      const root = getStateRoot();
      for (const name of Object.keys(root.actions)) {
        const st = root.actions[name];
        if (st?.changes?.length) {
          applyRecordedChanges(st.changes, "revert");
          st.changes = [];
        }
      }

      // remove any overlays left
      for (const [id, el] of root.overlays.entries()) {
        try {
          el.remove();
        } catch { }
        root.overlays.delete(id);
      }

      return { ok: true, message: "Reverted all forms actions" };
    } catch (e) {
      return { ok: false, message: String(e?.message || e) };
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

  window.formsFunctions = { apply, revert, revertAll };
})();
