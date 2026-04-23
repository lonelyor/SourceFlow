<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <!-- https://electronjs.org/docs/tutorial/security#csp-meta-tag
    <meta http-equiv="Content-Security-Policy" content="script-src 'self'"/>-->
    <script src="../../protyle/js/pdf/pdf.min.mjs?v=4.7.85" type="module"></script>
    <style>
        #loading {
            position: fixed;
            inset: 0;
            display: none;
            pointer-events: none;
        }
    </style>
</head>
<body class="fn__flex-column">
<div id="loading" data-startup-sentinel="true" aria-hidden="true">
    <div id="loadingStatus" hidden>正在载入工作空间与笔记界面…</div>
</div>
<div id="toolbar" class="toolbar fn__flex"></div>
<div class="fn__flex-1 fn__flex">
    <div id="activityBar" class="activity-bar"></div>
    <div id="dockLeft" class="dock dock--vertical"></div>
    <div id="layouts" class="layout fn__flex-1"></div>
    <div id="dockRight" class="dock dock--vertical"></div>
</div>
<div id="dockBottom" class="dock fn__none"></div>
<div id="status" class="fn__flex status"></div>
<div id="commonMenu" class="b3-menu fn__none">
    <div class="b3-menu__title fn__none">
        <svg class="b3-menu__icon"><use xlink:href="#iconLeft"></use></svg>
        <span class="b3-menu__label"></span>
    </div>
    <div class="b3-menu__items"></div>
</div>
<div id="message" class="b3-snackbars"></div>
<div id="tooltip" class="tooltip fn__none"></div>
<script>
    const startupReport = (type, detail) => {
        const message = `[startup:${type}] ${detail || "unknown error"}`
        console.error(message)
        try {
            const {ipcRenderer} = require("electron")
            ipcRenderer.send("sourceflow-cmd", {
                cmd: "startupGuardFailure",
                type,
                detail,
            })
            ipcRenderer.send("sourceflow-cmd", {
                cmd: "writeLog",
                msg: message,
            })
        } catch (e) {
        }
    }
    window.addEventListener("error", (event) => {
        startupReport("error", `${event.message || "script error"}\n${event.filename || ""}:${event.lineno || 0}:${event.colno || 0}`)
    })
    window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason
        startupReport("promise", reason && reason.stack ? reason.stack : `${reason}`)
    })
</script>
</body>
</html>
