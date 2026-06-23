"use strict";

(() => {
    if (window.__sourceflowExportPreloadInstalled) {
        return;
    }
    window.__sourceflowExportPreloadInstalled = true;
    window.__sourceflowExportSafeMode = true;
    window.__sourceflowExportErrors = window.__sourceflowExportErrors || [];

    const recordExportError = (error) => {
        const message = error && (error.message || error.reason || error) ? (error.message || error.reason || error) : "";
        window.__sourceflowExportErrors.push(String(message));
    };

    window.addEventListener("error", (event) => {
        recordExportError(event.error || event.message);
    });

    window.addEventListener("unhandledrejection", (event) => {
        recordExportError(event.reason);
    });
})();
