document.addEventListener("DOMContentLoaded", () => {
    const PRESETS = [
        { label: "Mobile portrait", width: 320, height: 480 },
        { label: "Mobile landscape", width: 480, height: 320 },
        { label: "Small tablet portrait", width: 600, height: 800 },
        { label: "Small tablet landscape", width: 800, height: 600 },
        { label: "Tablet portrait", width: 768, height: 1024 },
        { label: "Tablet landscape", width: 1024, height: 768 },
    ];

    const presetList = document.getElementById("presetList");
    const winInfo = document.getElementById("winInfo");
    const refreshBtn = document.getElementById("refreshBtn");
    const targetUrlEl = document.getElementById("targetUrl");

    const params = new URLSearchParams(location.search);
    const target = params.get("target"); // encoded URL from popup

    if (!target) {
        targetUrlEl.textContent = "No target URL provided.";
        return;
    }

    const targetUrl = decodeURIComponent(target);
    targetUrlEl.textContent = targetUrl;

    function renderPresets() {
        presetList.innerHTML = "";

        PRESETS.forEach((p) => {
            const li = document.createElement("li");
            li.className =
                "list-group-item d-flex justify-content-between align-items-center preset";

            li.innerHTML = `
        <span>${p.label}</span>
        <span class="badge bg-primary rounded-pill">${p.width}×${p.height}</span>
      `;

            li.addEventListener("click", async () => {
                try {
                    // 1) open target URL in new tab (same window)
                    await chrome.tabs.create({ url: targetUrl, active: true });

                    // 2) resize current window to preset
                    await resizeCurrentWindow(p.width, p.height);

                    await showWinInfo();
                } catch (e) {
                    winInfo.textContent = "Failed (check permissions: tabs, windows)";
                }
            });

            presetList.appendChild(li);
        });
    }

    async function resizeCurrentWindow(width, height) {
        const win = await chrome.windows.getCurrent();

        // normalize first (if maximized/fullscreen/minimized)
        if (win.state && win.state !== "normal") {
            await chrome.windows.update(win.id, { state: "normal" });
        }

        await chrome.windows.update(win.id, { width, height });
    }

    async function showWinInfo() {
        const win = await chrome.windows.getCurrent();
        winInfo.textContent = `Current window: ${win.width}×${win.height} (state: ${win.state})`;
    }

    refreshBtn.addEventListener("click", showWinInfo);

    renderPresets();
    showWinInfo();
});
