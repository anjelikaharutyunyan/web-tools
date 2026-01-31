// js/responsiveOverlay.js
// Injected into the webpage. Shows a fixed panel with presets.
// Clicking a preset -> sends message to background -> background resizes window.

(() => {
  const ID = "__responsive_overlay_panel__";
  if (document.getElementById(ID)) return;

  const PRESETS = [
    { label: "Mobile portrait", width: 320, height: 480 },
    { label: "Mobile landscape", width: 480, height: 320 },
    { label: "Small tablet portrait", width: 600, height: 800 },
    { label: "Small tablet landscape", width: 800, height: 600 },
    { label: "Tablet portrait", width: 768, height: 1024 },
    { label: "Tablet landscape", width: 1024, height: 768 },
  ];

  const panel = document.createElement("div");
  panel.id = ID;
  panel.style.cssText = `
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 2147483647;
    width: 280px;
    background: #fff;
    border: 1px solid #dee2e6;
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0,0,0,.20);
    font: 13px/1.3 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    overflow: hidden;
  `;

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 10px;border-bottom:1px solid #eee;">
      <div style="font-weight:700;">Responsive Layouts</div>
      <button id="${ID}_close" style="border:none;background:#f1f3f5;border-radius:10px;width:30px;height:30px;cursor:pointer;">✕</button>
    </div>

    <div id="${ID}_info" style="padding:8px 10px;color:#6c757d;border-bottom:1px solid #eee;">
      Loading window info...
    </div>

    <div style="padding:8px 10px; display:flex; gap:8px;">
      <input id="${ID}_w" type="number" min="200" placeholder="Width" style="flex:1;padding:7px 8px;border:1px solid #dee2e6;border-radius:10px;" />
      <input id="${ID}_h" type="number" min="200" placeholder="Height" style="flex:1;padding:7px 8px;border:1px solid #dee2e6;border-radius:10px;" />
    </div>

    <div style="padding:0 10px 10px; display:flex; gap:8px;">
      <button id="${ID}_apply" style="flex:1;border:none;background:#0d6efd;color:#fff;padding:8px;border-radius:10px;cursor:pointer;font-weight:600;">
        Apply
      </button>
      <button id="${ID}_refresh" title="Refresh" style="border:none;background:#f1f3f5;color:#111;padding:8px 10px;border-radius:10px;cursor:pointer;font-weight:600;">
        ⟳
      </button>
    </div>

    <div id="${ID}_list" style="padding:0 10px 10px; display:flex; flex-direction:column; gap:6px;"></div>
  `;

  document.documentElement.appendChild(panel);

  const closeBtn = panel.querySelector(`#${ID}_close`);
  const infoEl = panel.querySelector(`#${ID}_info`);
  const listEl = panel.querySelector(`#${ID}_list`);
  const wInput = panel.querySelector(`#${ID}_w`);
  const hInput = panel.querySelector(`#${ID}_h`);
  const applyBtn = panel.querySelector(`#${ID}_apply`);
  const refreshBtn = panel.querySelector(`#${ID}_refresh`);

  function setInfo(text) {
    infoEl.textContent = text;
  }

  function refreshInfo() {
    chrome.runtime.sendMessage({ type: "GET_WINDOW_INFO" }, (res) => {
      if (!res?.success) {
        setInfo(`Info failed: ${res?.error || "unknown error"}`);
        return;
      }
      setInfo(`Current window: ${res.width}×${res.height} (state: ${res.state})`);
      wInput.value = res.width;
      hInput.value = res.height;
    });
  }

  function sendResize(width, height) {
    chrome.runtime.sendMessage(
      { type: "RESIZE_WINDOW", width, height },
      (res) => {
        if (!res?.success) {
          setInfo(`Resize failed: ${res?.error || "unknown error"}`);
          return;
        }
        setInfo(`Current window: ${res.width}×${res.height} (state: ${res.state})`);
        wInput.value = res.width;
        hInput.value = res.height;
      },
    );
  }

  PRESETS.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${p.label} (${p.width}×${p.height})`;
    btn.style.cssText = `
      width: 100%;
      text-align: left;
      border: 1px solid #e9ecef;
      background: #fff;
      padding: 8px 10px;
      border-radius: 12px;
      cursor: pointer;
    `;
    btn.addEventListener("click", () => sendResize(p.width, p.height));
    listEl.appendChild(btn);
  });

  applyBtn.addEventListener("click", () => {
    const w = Number(wInput.value);
    const h = Number(hInput.value);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 200 || h < 200) {
      setInfo("Invalid width/height (min 200px)");
      return;
    }
    sendResize(w, h);
  });

  // Enter key -> apply
  [wInput, hInput].forEach((inp) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") applyBtn.click();
    });
  });

  refreshBtn.addEventListener("click", refreshInfo);
  closeBtn.addEventListener("click", () => panel.remove());

  refreshInfo();
})();
