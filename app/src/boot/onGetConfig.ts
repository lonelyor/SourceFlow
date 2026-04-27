import {adjustLayout, exportLayout, JSONToLayout, resetLayout, resizeTopBar} from "../layout/util";
import {resizeTabs} from "../layout/tabUtil";
import {setStorageVal} from "../protyle/util/compatibility";
/// #if !BROWSER
import {ipcRenderer, webFrame} from "electron";
import * as fs from "fs";
import * as path from "path";
import {afterExport} from "../protyle/export/util";
import {onWindowsMsg} from "../window/onWindowsMsg";
import {initNativeDialogOverride} from "../protyle/util/compatibility";
/// #endif
import {Constants} from "../constants";
import {appearance} from "../config/appearance";
import {fetchPost, fetchSyncPost} from "../util/fetch";
import {initAssets, setInlineStyle} from "../util/assets";
import {renderSnippet} from "../config/util/snippets";
import {openFile} from "../editor/util";
import {exitSourceFlow} from "../dialog/processSystem";
import {isWindow} from "../util/functions";
import {initStatus} from "../layout/status";
import {showMessage} from "../dialog/message";
import {replaceLocalPath} from "../editor/rename";
import {setTabPosition} from "../window/setHeader";
import {initBar} from "../layout/topBar";
import {initActivityBar} from "../layout/activityBar";
import {deferOpenChangelog} from "./openChangelog";
import {App} from "../index";
import {initWindowEvent} from "./globalEvent/event";
import {sendGlobalShortcut} from "./globalEvent/keydown";
import {closeWindow} from "../window/closeWin";
import {correctHotkey} from "./globalEvent/commonHotkey";
import {recordBeforeResizeTop} from "../protyle/util/resize";
import {processSYLink} from "../editor/openLink";
import {getAllEditor} from "../layout/getAll";
import {deferInitialPluginLoad} from "../plugin/loader";
import {deferEmojiConfLoad, setInitialEmojiConf} from "../emoji/load";
import {ensureBuiltinAssistantPlugin} from "../assistant/register";
import {initBootSyncBanner} from "../sync/bootSyncBanner";
import {openStartupHomepage} from "../homepage";

const writeStartupLog = (msg: string) => {
    /// #if !BROWSER
    ipcRenderer.send(Constants.SOURCEFLOW_CMD, {
        cmd: "writeLog",
        msg,
    });
    /// #endif
};

const reportStartupError = (label: string, error: unknown) => {
    const detail = error instanceof Error ? `${error.message}${error.stack ? `\n${error.stack}` : ""}` : `${error}`;
    console.error(`[startup] ${label}`, error);
    writeStartupLog(`[startup] ${label} failed: ${detail}`);
    const loadingElement = document.getElementById("loading");
    const statusElement = document.getElementById("loadingStatus");
    if (statusElement) {
        statusElement.textContent = "启动过程中遇到异常，正在自动恢复…";
    }
    if (!loadingElement || loadingElement.querySelector(`[data-startup-error="${label}"]`)) {
        return;
    }
    window.setTimeout(() => {
        if (!loadingElement.isConnected || loadingElement.querySelector(`[data-startup-error="${label}"]`)) {
            return;
        }
        const escapedDetail = detail.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const existingError = document.getElementById("loadingError");
        if (existingError) {
            existingError.setAttribute("data-startup-error", label);
            existingError.innerHTML = `${label} failed\n${escapedDetail}`;
            return;
        }
        const cardElement = loadingElement.querySelector(".loading-shell__card");
        cardElement?.insertAdjacentHTML("beforeend", `<div id="loadingError" data-startup-error="${label}">${label} failed\n${escapedDetail}</div>`);
    }, 1800);
};

const runStartupStep = (label: string, fn: () => void) => {
    writeStartupLog(`[startup] ${label}`);
    try {
        fn();
    } catch (error) {
        reportStartupError(label, error);
    }
};

const getReadableErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
        return error.message || error.name;
    }
    if (typeof error === "string") {
        return error;
    }
    if (error && typeof error === "object") {
        const maybeError = error as {message?: unknown, msg?: unknown};
        const message = maybeError.message || maybeError.msg;
        if (typeof message === "string" && message.trim()) {
            return message;
        }
        try {
            return JSON.stringify(error);
        } catch (e) {
            return `${error}`;
        }
    }
    return `${error || ""}`;
};

const isPDFMemoryError = (message: string) => {
    return /(out of memory|insufficient memory|memory.*(allocation|limit|pressure|exhaust)|allocation failed|heap out of memory|ERR_MEMORY|内存不足|可用内存不足)/i.test(message);
};

const getExportFailedMessage = (detail: string) => {
    const template = window.sourceflow.languages._kernel?.[14] || "导出失败：%s";
    const safeDetail = detail || "Unknown error";
    return template.includes("%s") ? template.replace("%s", safeDetail) : `${template}：${safeDetail}`;
};

const getPDFExportErrorMessage = (error: unknown) => {
    const detail = getReadableErrorMessage(error);
    return isPDFMemoryError(detail) ? window.sourceflow.languages.exportPDFLowMemory : getExportFailedMessage(detail);
};

const assertExportResponse = (response: IWebSocketData, action: string) => {
    if (response && typeof response.code === "number" && response.code !== 0) {
        throw new Error(response.msg || `${action} failed with code ${response.code}`);
    }
    return response;
};

const fetchPostForExport = (url: string, data?: any) => {
    return new Promise<IWebSocketData>((resolve, reject) => {
        fetchPost(url, data, (response) => {
            try {
                resolve(assertExportResponse(response, url));
            } catch (error) {
                reject(error);
            }
        }, undefined, (response) => {
            reject(new Error(response?.msg || `${url} failed`));
        });
    });
};

/// #if !BROWSER
const removeExportAssets = (dir: string) => {
    return new Promise<void>((resolve) => {
        fs.rm(dir, {recursive: true, force: true}, () => {
            resolve();
        });
    });
};
/// #endif

const consumePendingSyncRestore = () => {
    const restoreState = window.sourceflow.storage[Constants.LOCAL_SYNC_RESTORE];
    if (!restoreState || restoreState.workspace !== window.sourceflow.config.system.workspaceDir) {
        return;
    }
    window.sourceflow.storage[Constants.LOCAL_SYNC_RESTORE] = null;
    setStorageVal(Constants.LOCAL_SYNC_RESTORE, null);
    showMessage("检测到待恢复的自托管备份，正在从远端恢复到空工作空间", 7000, "info");
    fetchPost("/api/sync/setSyncEnable", {enabled: true}, () => {
        window.sourceflow.config.sync.enabled = true;
        fetchPost("/api/sync/performSyncDownload", {});
    });
};

export const onGetConfig = (isStart: boolean, app: App) => {
    runStartupStep("correctHotkey", () => {
        correctHotkey(app);
    });
    runStartupStep("setInitialEmojiConf", () => {
        setInitialEmojiConf();
    });
    /// #if !BROWSER
    runStartupStep("nativeBootstrap", () => {
        ipcRenderer.invoke(Constants.SOURCEFLOW_INIT, {
            languages: window.sourceflow.languages["_trayMenu"],
            workspaceDir: window.sourceflow.config.system.workspaceDir,
            port: location.port
        });
        ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
            cmd: "isDefaultProtocolClient",
        }).then((registered) => {
            window.sourceflow.config.system.protocolClientRegistered = !!registered;
        }).catch((error) => {
            reportStartupError("isDefaultProtocolClient", error);
        });
        webFrame.setZoomFactor(window.sourceflow.storage[Constants.LOCAL_ZOOM]);
        ipcRenderer.send(Constants.SOURCEFLOW_CMD, {
            cmd: "setTrafficLightPosition",
            zoom: window.sourceflow.storage[Constants.LOCAL_ZOOM],
            position: Constants.SIZE_ZOOM.find((item) => item.zoom === window.sourceflow.storage[Constants.LOCAL_ZOOM]).position
        });
    });
    /// #endif
    if (!window.sourceflow.config.uiLayout || (window.sourceflow.config.uiLayout && !window.sourceflow.config.uiLayout.left)) {
        window.sourceflow.config.uiLayout = Constants.SOURCEFLOW_EMPTY_LAYOUT;
    }
    runStartupStep("initWindowEvent", () => {
        initWindowEvent(app);
    });
    try {
        writeStartupLog("[startup] layoutBootstrap");
        JSONToLayout(app, isStart);
        setTimeout(() => {
            adjustLayout();
        }); // 等待 dock 中 !this.pin 的 setTimeout
        /// #if !BROWSER
        sendGlobalShortcut(app);
        /// #endif
        deferOpenChangelog();
        deferInitialPluginLoad(app);
        deferEmojiConfLoad();
        void ensureBuiltinAssistantPlugin(app).catch((error) => {
            reportStartupError("ensureBuiltinAssistantPlugin", error);
        });
    } catch (e) {
        reportStartupError("layoutBootstrap", e);
        resetLayout();
    }
    runStartupStep("initBar", () => {
        initBar(app);
    });
    runStartupStep("initBootSyncBanner", () => {
        initBootSyncBanner(app);
    });
    runStartupStep("initStatus", () => {
        initStatus();
    });
    runStartupStep("initActivityBar", () => {
        initActivityBar(app);
    });
    writeStartupLog("[startup] initWindow");
    void initWindow(app).catch((error) => {
        reportStartupError("initWindow", error);
    });
    /// #if !BROWSER
    runStartupStep("initNativeDialogOverride", () => {
        initNativeDialogOverride();
    });
    /// #endif
    runStartupStep("appearance.onSetAppearance", () => {
        appearance.onSetAppearance(window.sourceflow.config.appearance);
    });
    runStartupStep("initAssets", () => {
        initAssets();
    });
    runStartupStep("setInlineStyle", () => {
        void setInlineStyle();
    });
    runStartupStep("renderSnippet", () => {
        renderSnippet();
    });
    runStartupStep("openStartupHomepage", () => {
        openStartupHomepage(app);
    });
    setTimeout(() => {
        consumePendingSyncRestore();
    });
    let resizeTimeout = 0;
    let firstResize = true;
    window.addEventListener("resize", () => {
        if (firstResize) {
            recordBeforeResizeTop();
            firstResize = false;
        }
        window.clearTimeout(resizeTimeout);
        resizeTimeout = window.setTimeout(() => {
            adjustLayout();
            resizeTabs();
            resizeTopBar();
            window.sourceflow.menus.menu.resetPosition();
            firstResize = true;
            if (getSelection().rangeCount > 0) {
                const range = getSelection().getRangeAt(0);
                getAllEditor().forEach(item => {
                    if (item.protyle.wysiwyg.element.contains(range.startContainer)) {
                        item.protyle.toolbar.render(item.protyle, range);
                    }
                });
            }
        }, Constants.TIMEOUT_RESIZE);
    });
};

export const initWindow = async (app: App) => {
    /// #if !BROWSER
    ipcRenderer.send(Constants.SOURCEFLOW_CMD, {
        cmd: "setSpellCheckerLanguages",
        languages: window.sourceflow.config.editor.spellcheckLanguages
    });
    const winOnClose = (close = false) => {
        exportLayout({
            cb() {
                if (window.sourceflow.config.appearance.closeButtonBehavior === 1 && !close) {
                    // 最小化
                    if ("windows" === window.sourceflow.config.system.os) {
                        ipcRenderer.send(Constants.SOURCEFLOW_CONFIG_TRAY, {
                            languages: window.sourceflow.languages["_trayMenu"],
                        });
                    } else {
                        ipcRenderer.send(Constants.SOURCEFLOW_CMD, "closeButtonBehavior");
                    }
                } else {
                    exitSourceFlow();
                }
            },
            errorExit: true
        });
    };

    ipcRenderer.send(Constants.SOURCEFLOW_EVENT);
    ipcRenderer.on(Constants.SOURCEFLOW_EVENT, (event, cmd) => {
        if (cmd === "focus") {
            // 由于 https://github.com/lonelyor/SourceFlow/issues/10060 和新版 electron 应用切出再切进会保持光标，故移除 focus
            window.sourceflow.altIsPressed = false;
            window.sourceflow.ctrlIsPressed = false;
            window.sourceflow.shiftIsPressed = false;
            document.body.classList.remove("body--blur");
        } else if (cmd === "blur") {
            document.body.classList.add("body--blur");
        } else if (cmd === "enter-full-screen") {
            document.body.classList.add("body--fullscreen");
            if ("darwin" === window.sourceflow.config.system.os) {
                if (isWindow()) {
                    setTabPosition();
                }
            }
        } else if (cmd === "leave-full-screen") {
            document.body.classList.remove("body--fullscreen");
            if ("darwin" === window.sourceflow.config.system.os) {
                if (isWindow()) {
                    setTabPosition();
                }
            }
        } else if (cmd === "maximize") {
            document.body.classList.add("body--maximize");
        } else if (cmd === "unmaximize") {
            document.body.classList.remove("body--maximize");
        }
    });
    if (!isWindow()) {
        ipcRenderer.on(Constants.SOURCEFLOW_OPEN_URL, (event, url) => {
            processSYLink(app, url);
        });
    }
    ipcRenderer.on(Constants.SOURCEFLOW_OPEN_FILE, (event, data) => {
        if (!data.app) {
            data.app = app;
        }
        openFile(data);
    });
    ipcRenderer.on(Constants.SOURCEFLOW_SAVE_CLOSE, (event, close) => {
        if (isWindow()) {
            closeWindow(app);
        } else {
            winOnClose(close);
        }
    });
    ipcRenderer.on(Constants.SOURCEFLOW_SEND_WINDOWS, (e, ipcData: IWebSocketData) => {
        onWindowsMsg(ipcData, app);
    });
    ipcRenderer.on(Constants.SOURCEFLOW_HOTKEY, (e, data) => {
        let matchCommand = false;
        app.plugins.find(item => {
            item.commands.find(command => {
                if (command.globalCallback && data.hotkey === command.customHotkey) {
                    matchCommand = true;
                    command.globalCallback();
                    return true;
                }
            });
            if (matchCommand) {
                return true;
            }
        });
    });
    ipcRenderer.on(Constants.SOURCEFLOW_EXPORT_PDF, async (e, ipcData) => {
        const msgId = showMessage(window.sourceflow.languages.exporting, -1);
        window.sourceflow.storage[Constants.LOCAL_EXPORTPDF] = {
            removeAssets: ipcData.removeAssets,
            keepFold: ipcData.keepFold,
            mergeSubdocs: ipcData.mergeSubdocs,
            watermark: ipcData.watermark,
            landscape: ipcData.pdfOptions.landscape,
            marginType: ipcData.pdfOptions.marginType,
            pageSize: ipcData.pageSize,
            scale: ipcData.pdfOptions.scale,
            marginTop: ipcData.pdfOptions.margins.top,
            marginRight: ipcData.pdfOptions.margins.right,
            marginBottom: ipcData.pdfOptions.margins.bottom,
            marginLeft: ipcData.pdfOptions.margins.left,
            paged: ipcData.paged,
        };
        setStorageVal(Constants.LOCAL_EXPORTPDF, window.sourceflow.storage[Constants.LOCAL_EXPORTPDF]);
        try {
            if (window.sourceflow.config.export.pdfFooter.trim()) {
                const response = assertExportResponse(await fetchSyncPost("/api/template/renderSprig", {
                    template: window.sourceflow.config.export.pdfFooter
                }), "/api/template/renderSprig");
                ipcData.pdfOptions.displayHeaderFooter = true;
                ipcData.pdfOptions.headerTemplate = "<span></span>";
                ipcData.pdfOptions.footerTemplate = `<div style="text-align:center;width:100%;font-size:10px;line-height:12px;">
${response.data.replace("%pages", "<span class=totalPages></span>").replace("%page", "<span class=pageNumber></span>")}
</div>`;
            }
            const printToPDF = (pdfOptions: IObject) => ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
                cmd: "printToPDF",
                pdfOptions,
                webContentsId: ipcData.webContentsId
            });
            let pdfData;
            try {
                pdfData = await printToPDF(ipcData.pdfOptions);
            } catch (printError) {
                if (ipcData.paged || !isPDFMemoryError(getReadableErrorMessage(printError))) {
                    throw printError;
                }
                ipcData.paged = true;
                ipcData.pdfOptions.pageSize = ipcData.pageSize;
                window.sourceflow.storage[Constants.LOCAL_EXPORTPDF].paged = true;
                setStorageVal(Constants.LOCAL_EXPORTPDF, window.sourceflow.storage[Constants.LOCAL_EXPORTPDF]);
                pdfData = await printToPDF(ipcData.pdfOptions);
            }
            ipcRenderer.send(Constants.SOURCEFLOW_CMD, {cmd: "hide", webContentsId: ipcData.webContentsId});
            const savePath = ipcData.filePaths[0];
            let pdfFilePath = path.join(savePath, replaceLocalPath(ipcData.rootTitle) + ".pdf");
            const responseUnique = assertExportResponse(await fetchSyncPost("/api/file/getUniqueFilename", {path: pdfFilePath}), "/api/file/getUniqueFilename");
            if (!responseUnique.data?.path) {
                throw new Error("PDF output path is empty");
            }
            pdfFilePath = responseUnique.data.path;
            await fetchPostForExport("/api/export/exportHTML", {
                id: ipcData.rootId,
                pdf: true,
                removeAssets: ipcData.removeAssets,
                merge: ipcData.mergeSubdocs,
                savePath,
            });
            fs.writeFileSync(pdfFilePath, pdfData);
            ipcRenderer.send(Constants.SOURCEFLOW_CMD, {cmd: "destroy", webContentsId: ipcData.webContentsId});
            await fetchPostForExport("/api/export/processPDF", {
                id: ipcData.rootId,
                merge: ipcData.mergeSubdocs,
                path: pdfFilePath,
                removeAssets: ipcData.removeAssets,
                watermark: ipcData.watermark
            });
            afterExport(pdfFilePath, msgId);
            if (ipcData.removeAssets) {
                await removeExportAssets(path.join(savePath, "assets"));
            }
        } catch (error) {
            console.error("[PDF export]", error);
            showMessage(getPDFExportErrorMessage(error), 0, "error", msgId);
            ipcRenderer.send(Constants.SOURCEFLOW_CMD, {cmd: "destroy", webContentsId: ipcData.webContentsId});
        }
    });

    if (isWindow()) {
        const isAlwaysOnTop = await ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
            cmd: "isAlwaysOnTop",
        });
        document.body.insertAdjacentHTML("beforeend", `<div class="toolbar__window">
<div class="toolbar__item ariaLabel" aria-label="${window.sourceflow.languages[isAlwaysOnTop ? "unpin" : "pin"]}" id="pinWindow">
    <svg>
        <use xlink:href="#icon${isAlwaysOnTop ? "Unpin" : "Pin"}"></use>
    </svg>
</div></div>`);
        const pinElement = document.getElementById("pinWindow");
        pinElement.addEventListener("click", () => {
            if (pinElement.getAttribute("aria-label") === window.sourceflow.languages.pin) {
                pinElement.querySelector("use").setAttribute("xlink:href", "#iconUnpin");
                pinElement.setAttribute("aria-label", window.sourceflow.languages.unpin);
                ipcRenderer.send(Constants.SOURCEFLOW_CMD, "setAlwaysOnTopTrue");
            } else {
                pinElement.querySelector("use").setAttribute("xlink:href", "#iconPin");
                pinElement.setAttribute("aria-label", window.sourceflow.languages.pin);
                ipcRenderer.send(Constants.SOURCEFLOW_CMD, "setAlwaysOnTopFalse");
            }
        });
    }

    const isFullScreen = await ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
        cmd: "isFullScreen",
    });
    if (isFullScreen) {
        document.body.classList.add("body--fullscreen");
    }
    const isMaximized = await ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
        cmd: "isMaximized",
    });
    if (isMaximized) {
        document.body.classList.add("body--maximize");
    }

    if ("darwin" !== window.sourceflow.config.system.os) {
        document.body.classList.add("body--win32");

        // 添加窗口控件
        const controlsHTML = `<div class="toolbar__item ariaLabel toolbar__item--win" aria-label="${window.sourceflow.languages.min}" id="minWindow">
    <svg>
        <use xlink:href="#iconMin"></use>
    </svg>
</div>
<div aria-label="${window.sourceflow.languages.max}" class="ariaLabel toolbar__item toolbar__item--win" id="maxWindow">
    <svg>
        <use xlink:href="#iconMax"></use>
    </svg>
</div>
<div aria-label="${window.sourceflow.languages.restore}" class="ariaLabel toolbar__item toolbar__item--win" id="restoreWindow">
    <svg>
        <use xlink:href="#iconRestore"></use>
    </svg>
</div>
<div aria-label="${window.sourceflow.languages.close}" class="ariaLabel toolbar__item toolbar__item--close" id="closeWindow">
    <svg>
        <use xlink:href="#iconClose"></use>
    </svg>
</div>`;
        if (isWindow()) {
            document.querySelector(".toolbar__window").insertAdjacentHTML("beforeend", controlsHTML);
        } else {
            document.getElementById("windowControls").innerHTML = controlsHTML;
        }
        const maxBtnElement = document.getElementById("maxWindow");
        const restoreBtnElement = document.getElementById("restoreWindow");

        restoreBtnElement.addEventListener("click", () => {
            ipcRenderer.send(Constants.SOURCEFLOW_CMD, "restore");
        });
        maxBtnElement.addEventListener("click", () => {
            ipcRenderer.send(Constants.SOURCEFLOW_CMD, "maximize");
        });

        const minBtnElement = document.getElementById("minWindow");
        const closeBtnElement = document.getElementById("closeWindow");
        minBtnElement.addEventListener("click", () => {
            if (minBtnElement.classList.contains("window-controls__item--disabled")) {
                return;
            }
            ipcRenderer.send(Constants.SOURCEFLOW_CMD, "minimize");
        });
        closeBtnElement.addEventListener("click", () => {
            if (isWindow()) {
                closeWindow(app);
            } else {
                winOnClose();
            }
        });
    }
    /// #else
    if (!isWindow()) {
        document.querySelector(".toolbar").classList.add("toolbar--browser");
    }
    /// #endif
};
