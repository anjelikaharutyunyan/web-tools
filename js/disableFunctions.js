
window.disableFunctions = {
    _originals: {
        open: null,
        Notification: null,
        createElement: null,
        createElementNS: null,
    },

    disableJavaScript: {
        apply: () => {
            if (window.disableFunctions._originals.createElement) {
                return { ok: false, message: "JavaScript already partially disabled" };
            }

            // Hook createElement
            window.disableFunctions._originals.createElement = Document.prototype.createElement;
            Document.prototype.createElement = function (...args) {
                const el = window.disableFunctions._originals.createElement.apply(this, args);
                if (String(args[0]).toLowerCase() === "script") {
                    el.type = "javascript/blocked";
                }
                return el;
            };

            // Hook createElementNS
            window.disableFunctions._originals.createElementNS = Document.prototype.createElementNS;
            Document.prototype.createElementNS = function (...args) {
                const el = window.disableFunctions._originals.createElementNS.apply(this, args);
                if (String(args[1]).toLowerCase() === "script") {
                    el.type = "javascript/blocked";
                }
                return el;
            };

            // Remove inline on* handlers properly
            document.querySelectorAll("*").forEach((el) => {
                [...el.attributes].forEach((attr) => {
                    if (attr.name.startsWith("on")) {
                        el.removeAttribute(attr.name);
                    }
                });
            });

            return { ok: true, message: "JS partially disabled (blocks dynamic <script>)" };
        },

        revert: () => {
            const o = window.disableFunctions._originals;

            if (o.createElement) {
                Document.prototype.createElement = o.createElement;
                o.createElement = null;
            }

            if (o.createElementNS) {
                Document.prototype.createElementNS = o.createElementNS;
                o.createElementNS = null;
            }

            return { ok: true, message: "JS hooks reverted" };
        },
    },

    disableNotifications: {
        apply: () => {
            if (window.disableFunctions._originals.Notification) {
                return { ok: false, message: "Notifications already disabled" };
            }

            const Original = window.Notification;
            window.disableFunctions._originals.Notification = Original;

            function FakeNotification() {
                return null;
            }

            FakeNotification.permission = "denied";
            FakeNotification.requestPermission = () => Promise.resolve("denied");

            window.Notification = FakeNotification;

            return { ok: true, message: "Notifications disabled (permission denied)" };
        },

        revert: () => {
            const o = window.disableFunctions._originals;
            if (!o.Notification) return { ok: false, message: "Notifications were not disabled" };

            window.Notification = o.Notification;
            o.Notification = null;

            return { ok: true, message: "Notifications restored" };
        },
    },

    disablePopups: {
        apply: () => {
            if (window.disableFunctions._originals.open) {
                return { ok: false, message: "Popups already disabled" };
            }

            window.disableFunctions._originals.open = window.open;
            window.open = function () {
                return null;
            };

            return { ok: true, message: "Popups disabled (window.open blocked)" };
        },

        revert: () => {
            const o = window.disableFunctions._originals;
            if (!o.open) return { ok: false, message: "Popups were not disabled" };

            window.open = o.open;
            o.open = null;

            return { ok: true, message: "Popups restored" };
        },
    },

    resetAll: {
        apply: () => {
            window.disableFunctions.disableJavaScript.revert();
            window.disableFunctions.disableNotifications.revert();
            window.disableFunctions.disablePopups.revert();
            return { ok: true, message: "All disable features reverted" };
        },
        revert: () => ({ ok: true, message: "No revert for resetAll" }),
    },
};
