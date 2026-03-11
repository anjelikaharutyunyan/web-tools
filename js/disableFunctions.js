// disableFunctions.js
(function () {
    if (window.disableFunctions?.__initialized) return;

    window.disableFunctions = {
        __initialized: true,

        _originals: {
            open: null,
            Notification: null,
            createElement: null,
            createElementNS: null,
        },

        disableJavaScript: {
            apply: () => {
            
                const DF = window.disableFunctions;

                if (DF._originals.createElement || DF._originals.createElementNS) {
                   return { ok: false, message: "JavaScript already partially disabled" };
                }

                // Hook createElement
                DF._originals.createElement = Document.prototype.createElement;
                Document.prototype.createElement = function (...args) {
                    const el = DF._originals.createElement.apply(this, args);
                    const tag = String(args?.[0] ?? "").toLowerCase();
                    if (tag === "script") {
                        el.type = "javascript/blocked";
                    }
                    return el;
                };

                // Hook createElementNS
                DF._originals.createElementNS = Document.prototype.createElementNS;
                Document.prototype.createElementNS = function (...args) {
                    const el = DF._originals.createElementNS.apply(this, args);
                    const tag = String(args?.[1] ?? "").toLowerCase(); // qualifiedName
                    if (tag === "script") {
                       el.type = "javascript/blocked";
                    }
                    return el;
                };

                // Remove inline on* handlers (case-insensitive)
                let removedCount = 0;
                document.querySelectorAll("*").forEach((el) => {
                    for (const attr of [...el.attributes]) {
                        if (String(attr.name).toLowerCase().startsWith("on")) {
                            el.removeAttribute(attr.name);
                            removedCount++;
                        }
                    }
                });

                
                return {
                    ok: true,
                    message: `JS partially disabled (blocks dynamic <script> + removed ${removedCount} inline on*)`,
                };
            },

            revert: () => {
       
                const DF = window.disableFunctions;
                const o = DF._originals;

                if (o.createElement) {
                    Document.prototype.createElement = o.createElement;
                    o.createElement = null;
                }

                if (o.createElementNS) {
                    Document.prototype.createElementNS = o.createElementNS;
                    o.createElementNS = null;
                }

                return { ok: true, message: "JS hooks reverted (inline handlers not restored)" };
            },
        },

        disableNotifications: {
            apply: () => {
                const DF = window.disableFunctions;

                if (typeof window.Notification === "undefined") {
                    return { ok: true, message: "Notifications API not available in this environment" };
                }

                if (DF._originals.Notification) {
                    return { ok: false, message: "Notifications already disabled" };
                }

                const Original = window.Notification;
                DF._originals.Notification = Original;

                function FakeNotification() {
                    return null;
                }

                FakeNotification.permission = "denied";
                FakeNotification.requestPermission = () => {
                    return Promise.resolve("denied");
                };

                // Keep instanceof checks from crashing in some libs (best-effort)
                try {
                    FakeNotification.prototype = Original.prototype;
                } catch (_) { }

                window.Notification = FakeNotification;
                return { ok: true, message: "Notifications disabled (permission denied)" };
            },

            revert: () => {
                const DF = window.disableFunctions;
                const o = DF._originals;

                if (!o.Notification) {
                    return { ok: false, message: "Notifications were not disabled" };
                }

                window.Notification = o.Notification;
                o.Notification = null;
                return { ok: true, message: "Notifications restored" };
            },
        },

        disablePopups: {
            apply: () => {
                const DF = window.disableFunctions;

                if (DF._originals.open) {
                    return { ok: false, message: "Popups already disabled" };
                }

                DF._originals.open = window.open;

                window.open = function () {
                    return null;
                };

                return { ok: true, message: "Popups disabled (window.open blocked)" };
            },

            revert: () => {
                const DF = window.disableFunctions;
                const o = DF._originals;

                if (!o.open) {
                    return { ok: false, message: "Popups were not disabled" };
                }

                window.open = o.open;
                o.open = null;

                return { ok: true, message: "Popups restored" };
            },
        },

        resetAll: {
            apply: () => {
                const DF = window.disableFunctions;

                const r1 = DF.disableJavaScript.revert();
                const r2 = DF.disableNotifications.revert();
                const r3 = DF.disablePopups.revert();

                const ok = [r1, r2, r3].every((r) => r && r.ok !== false);

                return {
                    ok,
                    message: ok ? "All disable features reverted" : "Some features failed to revert",
                    details: [r1, r2, r3]
                };
            },
            revert: () => ({ ok: true, message: "No revert for resetAll" }),
        },
    };
})();