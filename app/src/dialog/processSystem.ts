import {Constants} from "../constants";
import {fetchPost} from "../util/fetch";
/// #if !MOBILE
import {exportLayout} from "../layout/util";
/// #endif
import {getAllEditor, getAllModels} from "../layout/getAll";
import {getDockByType} from "../layout/tabUtil";
import {Files} from "../layout/dock/Files";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif
import {hideMessage, showMessage} from "./message";
import {Dialog} from "./index";
import {isMobile} from "../util/functions";
import {confirmDialog} from "./confirmDialog";
import {escapeHtml} from "../util/escape";
import {getWorkspaceName} from "../util/noRelyPCFunction";
import {setNoteBook} from "../util/pathName";
import {reloadProtyle} from "../protyle/util/reload";
import {Tab} from "../layout/Tab";
import {setEmpty} from "../mobile/util/setEmpty";
import {hideAllElements, hideElements} from "../protyle/ui/hideElements";
import {App} from "../index";
import {saveScroll} from "../protyle/scroll/saveScroll";
import {isInAndroid, isInHarmony, isInIOS, setStorageVal} from "../protyle/util/compatibility";
import {Plugin} from "../plugin";
import {openBootSyncSettingTarget, TBootSyncGuardInfo} from "../sync/bootSyncGuard";
import {openDocHistory} from "../history/doc";
import {openFileById} from "../editor/util";
import {dispatchBrandedWindowEvent} from "../util/runtimeBrand";
import {isTitleEmptyAttr} from "../util/attrCompat";

const updateTitle = (rootID: string, tab: Tab, protyle?: IProtyle) => {
    fetchPost("/api/block/getDocInfo", {
        id: rootID
    }, (response) => {
        tab.updateTitle(response.data.name);
        if (protyle && protyle.title) {
            protyle.title.setTitle(response.data.name, isTitleEmptyAttr(response.data.ial));
        }
    });
};

export const reloadSync = (
    app: App,
    data: {
        upsertRootIDs: string[],
        removeRootIDs: string[],
        conflicts?: Array<{
            boxID?: string;
            originalRootID?: string;
            originalTitle?: string;
            originalHPath?: string;
            conflictRootID?: string;
            conflictTitle?: string;
            conflictHPath?: string;
        }>
    },
    hideMsg = true,
    // 同步的时候需要更新只读状态 https://github.com/lonelyor/SourceFlow/issues/11517
    // 调整大纲的时候需要使用现有状态 https://github.com/lonelyor/SourceFlow/issues/11808
    updateReadonly = true,
    onlyUpdateDoc = false
) => {
    if (hideMsg) {
        hideMessage();
    }
    /// #if MOBILE
    if (window.sourceflow.mobile.popEditor) {
        if (data.removeRootIDs.includes(window.sourceflow.mobile.popEditor.protyle.block.rootID)) {
            hideElements(["dialog"]);
        } else {
            reloadProtyle(window.sourceflow.mobile.popEditor.protyle, false, updateReadonly);
        }
    }
    if (window.sourceflow.mobile.editor) {
        if (data.removeRootIDs.includes(window.sourceflow.mobile.editor.protyle.block.rootID)) {
            setEmpty(app);
        } else {
            reloadProtyle(window.sourceflow.mobile.editor.protyle, false, updateReadonly);
            fetchPost("/api/block/getDocInfo", {
                id: window.sourceflow.mobile.editor.protyle.block.rootID
            }, (response) => {
                setTitle(response.data.name);
                window.sourceflow.mobile.editor.protyle.title.setTitle(response.data.name, isTitleEmptyAttr(response.data.ial));
            });
        }
    }
    setNoteBook(() => {
        window.sourceflow.mobile.docks.file.init(false);
    });
    /// #else
    const allModels = getAllModels();
    allModels.editor.forEach(item => {
        if (data.upsertRootIDs.includes(item.editor.protyle.block.rootID)) {
            fetchPost("/api/block/getDocInfo", {
                id: item.editor.protyle.block.rootID,
            }, (response) => {
                item.editor.protyle.wysiwyg.renderCustom(response.data.ial);
                reloadProtyle(item.editor.protyle, false, updateReadonly);
                updateTitle(item.editor.protyle.block.rootID, item.parent, item.editor.protyle);
            });
        } else if (data.removeRootIDs.includes(item.editor.protyle.block.rootID)) {
            item.parent.parent.removeTab(item.parent.id, false, false);
            delete window.sourceflow.storage[Constants.LOCAL_FILEPOSITION][item.editor.protyle.block.rootID];
            setStorageVal(Constants.LOCAL_FILEPOSITION, window.sourceflow.storage[Constants.LOCAL_FILEPOSITION]);
        }
    });
    allModels.graph.forEach(item => {
        if (item.type === "local" && data.removeRootIDs.includes(item.rootId)) {
            item.parent.parent.removeTab(item.parent.id, false, false);
        } else if (item.type !== "local" || data.upsertRootIDs.includes(item.rootId)) {
            item.searchGraph(false);
            if (item.type === "local") {
                updateTitle(item.rootId, item.parent);
            }
        }
    });
    allModels.outline.forEach(item => {
        if (item.type === "local" && data.removeRootIDs.includes(item.blockId)) {
            item.parent.parent.removeTab(item.parent.id, false, false);
        } else if (item.type !== "local" || data.upsertRootIDs.includes(item.blockId)) {
            fetchPost("/api/outline/getDocOutline", {
                id: item.blockId,
                preview: item.isPreview
            }, response => {
                item.update(response);
            });
            if (item.type === "local") {
                updateTitle(item.blockId, item.parent);
            }
        }
    });
    allModels.backlink.forEach(item => {
        if (item.type === "local" && data.removeRootIDs.includes(item.rootId)) {
            item.parent.parent.removeTab(item.parent.id, false, false);
        } else {
            item.refresh();
            if (item.type === "local") {
                updateTitle(item.rootId, item.parent);
            }
        }
    });
    if (!onlyUpdateDoc) {
        allModels.files.forEach(item => {
            setNoteBook(() => {
                item.init(false);
            });
        });
    }
    allModels.bookmark.forEach(item => {
        item.update();
    });
    allModels.tag.forEach(item => {
        item.update();
    });
    // NOTE asset 无法获取推送地址，先不处理
    allModels.search.forEach(item => {
        item.parent.panelElement.querySelector("#searchInput").dispatchEvent(new CustomEvent("input"));
    });
    allModels.custom.forEach(item => {
        if (item.update) {
            item.update();
        }
    });
    /// #endif
    showSyncConflictResolver(app, data.conflicts);
};

let syncConflictDialog: Dialog | null = null;
let lastSyncConflictSignature = "";

const showSyncConflictResolver = (app: App, conflicts?: Array<{
    boxID?: string;
    originalRootID?: string;
    originalTitle?: string;
    originalHPath?: string;
    conflictRootID?: string;
    conflictTitle?: string;
    conflictHPath?: string;
}>) => {
    const items = Array.isArray(conflicts) ? conflicts.filter((item) => `${item?.originalRootID || item?.conflictRootID || ""}`.trim()) : [];
    if (!items.length) {
        return;
    }
    const signature = JSON.stringify(items.map((item) => ({
        originalRootID: item.originalRootID || "",
        conflictRootID: item.conflictRootID || "",
        originalHPath: item.originalHPath || "",
        conflictHPath: item.conflictHPath || "",
    })));
    if (signature === lastSyncConflictSignature) {
        return;
    }
    lastSyncConflictSignature = signature;
    syncConflictDialog?.destroy();
    const summary = syncGuardText(
        "同步时发现这些笔记同时被本地和云端改动。系统已经尽量保留当前版本和本地冲突副本，你可以现在处理，也可以稍后到数据历史继续处理。",
        "These notes were changed both locally and in the cloud during sync. The current version and the local conflict copy have been preserved when possible. You can resolve them now or continue later in Data History."
    );
    const guide = syncGuardText(
        "如果云端内容更可靠，继续使用“当前版本”；如果本地改动更重要，打开“本地冲突副本”把需要的内容移回去；拿不准时，先打开“历史并回滚”查看。",
        "If the cloud content is more reliable, keep using the current version. If your local edits matter more, open the local conflict copy and move the needed content back. If you are unsure, inspect history and rollback first."
    );
    syncConflictDialog = new Dialog({
        title: `⚠️ ${syncGuardText("同步冲突处理", "Sync Conflict Resolution")}`,
        width: isMobile() ? "92vw" : "720px",
        height: isMobile() ? "76vh" : "auto",
        content: `<div class="b3-dialog__content">
    <div class="b3-label">
        <div>${escapeHtml(summary)}</div>
        <div class="b3-label__text" style="margin-top: 8px;">${escapeHtml(guide)}</div>
    </div>
    <div class="fn__hr"></div>
    <div class="assistant-sync-conflict">${items.map((item, index) => `
        <div class="assistant-sync-conflict__item">
            <div class="assistant-sync-conflict__main">
                <div class="assistant-sync-conflict__title">${escapeHtml(item.originalTitle || item.conflictTitle || syncGuardText("未命名笔记", "Untitled note"))}</div>
                <div class="assistant-sync-conflict__meta">${escapeHtml(item.originalHPath || item.conflictHPath || "")}</div>
                ${item.conflictTitle ? `<div class="assistant-sync-conflict__meta">${escapeHtml(syncGuardText("本地冲突副本", "Local conflict copy"))}：${escapeHtml(item.conflictTitle)}</div>` : ""}
            </div>
            <div class="assistant-sync-conflict__actions">
                ${item.originalRootID ? `<button class="b3-button b3-button--outline" type="button" data-action="open-current" data-index="${index}">${syncGuardText("当前版本", "Current version")}</button>` : ""}
                ${item.conflictRootID ? `<button class="b3-button b3-button--outline" type="button" data-action="open-conflict-copy" data-index="${index}">${syncGuardText("本地冲突副本", "Local conflict copy")}</button>` : ""}
                ${item.originalRootID && item.boxID ? `<button class="b3-button b3-button--text" type="button" data-action="open-history" data-index="${index}">${syncGuardText("历史并回滚", "History & rollback")}</button>` : ""}
            </div>
        </div>`).join("")}
    </div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--outline" type="button" data-action="open-repo-history">${window.sourceflow.languages.dataHistory}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--cancel" type="button" data-action="close">${syncGuardText("稍后处理", "Later")}</button>
</div>`,
        destroyCallback() {
            syncConflictDialog = null;
        }
    });
    syncConflictDialog.element.setAttribute("data-key", "syncConflictResolver");
    syncConflictDialog.element.addEventListener("click", (event) => {
        let target = event.target as HTMLElement;
        while (target && !target.isEqualNode(syncConflictDialog.element)) {
            const action = target.getAttribute("data-action");
            if (!action) {
                target = target.parentElement;
                continue;
            }
            const index = parseInt(target.getAttribute("data-index") || "-1");
            const item = index > -1 ? items[index] : null;
            if (action === "open-current" && item?.originalRootID) {
                openFileById({
                    app,
                    id: item.originalRootID,
                    action: [Constants.CB_GET_FOCUS],
                });
                event.preventDefault();
                return;
            }
            if (action === "open-conflict-copy" && item?.conflictRootID) {
                openFileById({
                    app,
                    id: item.conflictRootID,
                    action: [Constants.CB_GET_FOCUS],
                });
                event.preventDefault();
                return;
            }
            if (action === "open-history" && item?.originalRootID && item?.boxID) {
                openDocHistory({
                    app,
                    id: item.originalRootID,
                    notebookId: item.boxID,
                    pathString: item.originalHPath || item.originalTitle || item.originalRootID,
                });
                event.preventDefault();
                return;
            }
            if (action === "open-repo-history") {
                void import("../history/history").then(({openHistory}) => {
                    openHistory(app, "repo");
                });
                event.preventDefault();
                return;
            }
            if (action === "close") {
                syncConflictDialog?.destroy();
                event.preventDefault();
                return;
            }
            target = target.parentElement;
        }
    });
};

export const setRefDynamicText = (data: {
    "blockID": string,
    "defBlockID": string,
    "refText": string,
    "rootID": string
}) => {
    getAllEditor().forEach(editor => {
        // 不能对比 rootId，否则嵌入块中的锚文本无法更新
        editor.protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${data.blockID}"] span[data-type~="block-ref"][data-subtype="d"][data-id="${data.defBlockID}"]`).forEach(item => {
            item.innerHTML = data.refText;
        });
    });
};

export const setDefRefCount = (data: {
    "blockID": string,
    "refCount": number,
    "rootRefCount": number,
    "rootID": string
}) => {
    getAllEditor().forEach(editor => {
        if (editor.protyle.block.rootID === data.rootID && editor.protyle.title) {
            const attrElement = editor.protyle.title.element.querySelector(".protyle-attr");
            const countElement = attrElement.querySelector(".protyle-attr--refcount");
            if (countElement) {
                if (data.rootRefCount === 0) {
                    countElement.remove();
                } else {
                    countElement.textContent = data.rootRefCount.toString();
                }
            } else if (data.rootRefCount > 0) {
                attrElement.insertAdjacentHTML("beforeend", `<div class="protyle-attr--refcount popover__block">${data.rootRefCount}</div>`);
            }
        }
        if (data.rootID === data.blockID) {
            return;
        }
        // 不能对比 rootId，否则嵌入块中的锚文本无法更新
        editor.protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${data.blockID}"]`).forEach(item => {
            // 不能直接查询，否则列表中会获取到第一个列表项的 attr https://github.com/lonelyor/SourceFlow/issues/12738
            const countElement = item.lastElementChild.querySelector(".protyle-attr--refcount");
            if (countElement) {
                if (data.refCount === 0) {
                    countElement.remove();
                } else {
                    countElement.textContent = data.refCount.toString();
                }
            } else if (data.refCount > 0) {
                const attrElement = item.lastElementChild;
                if (attrElement.childElementCount > 0) {
                    attrElement.lastElementChild.insertAdjacentHTML("afterend", `<div class="protyle-attr--refcount popover__block">${data.refCount}</div>`);
                } else {
                    attrElement.innerHTML = `<div class="protyle-attr--refcount popover__block">${data.refCount}</div>${Constants.ZWSP}`;
                }
            }
            if (data.refCount === 0) {
                item.removeAttribute("refcount");
            } else {
                item.setAttribute("refcount", data.refCount.toString());
            }
        });
    });

    let liElement;
    /// #if MOBILE
    liElement = window.sourceflow.mobile.docks.file.element.querySelector(`li[data-node-id="${data.rootID}"]`);
    /// #else
    liElement = (getDockByType("file").data.file as Files).element.querySelector(`li[data-node-id="${data.rootID}"]`);
    /// #endif
    if (liElement) {
        const counterElement = liElement.querySelector(".counter");
        if (counterElement) {
            if (data.rootRefCount === 0) {
                counterElement.remove();
            } else {
                counterElement.textContent = data.rootRefCount.toString();
            }
        } else if (data.rootRefCount > 0) {
            liElement.insertAdjacentHTML("beforeend", `<span class="popover__block counter b3-tooltips b3-tooltips__nw" aria-label="${window.sourceflow.languages.ref}">${data.rootRefCount}</span>`);
        }
    }
};

export const lockScreen = async (app: App) => {
    if (window.sourceflow.config.readonly || window.sourceflow.isPublish) {
        return;
    }
    app.plugins.forEach(item => {
        item.eventBus.emit("lock-screen");
    });
    /// #if !MOBILE
    exportLayout({
        errorExit: false,
        cb() {
            fetchPost("/api/system/logoutAuth");
        }
    });
    /// #else
    if (window.sourceflow.mobile.editor) {
        await saveScroll(window.sourceflow.mobile.editor.protyle);
        fetchPost("/api/system/logoutAuth");
    }
    /// #endif

};

export const kernelError = () => {
    if (document.querySelector("#errorLog")) {
        return;
    }
    let title = `💔 ${window.sourceflow.languages.kernelFault0} <small>v${Constants.SOURCEFLOW_VERSION}</small>`;
    let body = `<div>${window.sourceflow.languages.kernelFault1}</div><div class="fn__hr"></div><div>${window.sourceflow.languages.kernelFault2}</div>`;
    if (isInIOS()) {
        title = `🍵 ${window.sourceflow.languages.pleaseWait} <small>v${Constants.SOURCEFLOW_VERSION}</small>`;
        body = `<div>${window.sourceflow.languages.reconnectPrompt}</div><div class="fn__hr"></div><div class="fn__flex"><div class="fn__flex-1"></div><button class="b3-button">${window.sourceflow.languages.retry}</button></div>`;
    }
    const dialog = new Dialog({
        disableClose: true,
        title: title,
        width: isMobile() ? "92vw" : "520px",
        content: `<div class="b3-dialog__content">
<div class="ft__breakword">
    ${body}
</div>
</div>`
    });
    dialog.element.id = "errorLog";
    dialog.element.setAttribute("data-key", Constants.DIALOG_KERNELFAULT);
    const restartElement = dialog.element.querySelector(".b3-button");
    if (restartElement) {
        restartElement.addEventListener("click", () => {
            dialog.destroy();
            window.webkit.messageHandlers.startKernelFast.postMessage("startKernelFast");
        });
    }
};

export const exitSourceFlow = async (setCurrentWorkspace = true) => {
    hideAllElements(["util"]);
    /// #if MOBILE
    if (window.sourceflow.mobile.editor) {
        await saveScroll(window.sourceflow.mobile.editor.protyle);
    }
    /// #endif
    fetchPost("/api/system/exit", {force: false, setCurrentWorkspace}, (response) => {
        if (response.code === 1) { // 同步执行失败
            confirmDialog(window.sourceflow.languages.safeQuit, response.msg, () => {
                fetchPost("/api/system/exit", {force: true, setCurrentWorkspace}, () => {
                    /// #if !BROWSER
                    ipcRenderer.send(Constants.SOURCEFLOW_QUIT, location.port);
                    /// #else
                    if (isInAndroid()) {
                        window.JSAndroid.exit();
                        return;
                    }
                    if (isInIOS()) {
                        window.webkit.messageHandlers.exit.postMessage("");
                        return;
                    }
                    if (isInHarmony()) {
                        window.JSHarmony.exit();
                        return;
                    }
                    /// #endif
                });
            });
        } else if (response.code === 2) { // 提示新安装包
            hideMessage();

            /// #if !BROWSER
            if ("std" === window.sourceflow.config.system.container) {
                ipcRenderer.send(Constants.SOURCEFLOW_SHOW_WINDOW);
            }
            /// #endif

            confirmDialog(window.sourceflow.languages.updateVersion, response.msg, () => {
                fetchPost("/api/system/exit", {
                    force: true,
                    setCurrentWorkspace,
                    execInstallPkg: 2 //  0：默认检查新版本，1：不执行新版本安装，2：执行新版本安装
                }, () => {
                    /// #if !BROWSER
                    // 桌面端退出拉起更新安装时有时需要重启两次 https://github.com/lonelyor/SourceFlow/issues/6544
                    // 这里先将主界面隐藏
                    setTimeout(() => {
                        ipcRenderer.send(Constants.SOURCEFLOW_CMD, "hide");
                    }, 2000);
                    // 然后等待一段时间后再退出，避免界面主进程退出以后内核子进程被杀死
                    setTimeout(() => {
                        ipcRenderer.send(Constants.SOURCEFLOW_QUIT, location.port);
                    }, 4000);
                    /// #endif
                });
            }, () => {
                fetchPost("/api/system/exit", {
                    force: true,
                    setCurrentWorkspace,
                    execInstallPkg: 1 //  0：默认检查新版本，1：不执行新版本安装，2：执行新版本安装
                }, () => {
                    /// #if !BROWSER
                    ipcRenderer.send(Constants.SOURCEFLOW_QUIT, location.port);
                    /// #endif
                });
            });
        } else { // 正常退出
            /// #if !BROWSER
            ipcRenderer.send(Constants.SOURCEFLOW_QUIT, location.port);
            /// #else
            if (isInAndroid()) {
                window.JSAndroid.exit();
                return;
            }
            if (isInIOS()) {
                window.webkit.messageHandlers.exit.postMessage("");
                return;
            }

            if (isInHarmony()) {
                window.JSHarmony.exit();
                return;
            }
            /// #endif
        }
    });
};

export const transactionError = () => {
    if (document.getElementById("transactionError")) {
        return;
    }
    const dialog = new Dialog({
        disableClose: true,
        title: `${window.sourceflow.languages.stateExcepted} v${Constants.SOURCEFLOW_VERSION}`,
        content: `<div class="b3-dialog__content" id="transactionError">${window.sourceflow.languages.rebuildIndexTip}</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--text">${window.sourceflow.languages._kernel[97]}</button>
    <div class="fn__space"></div>
    <button class="b3-button">${window.sourceflow.languages.rebuildIndex}</button>
</div>`,
        width: isMobile() ? "92vw" : "520px",
    });
    dialog.element.setAttribute("data-key", Constants.DIALOG_STATEEXCEPTED);
    const btnsElement = dialog.element.querySelectorAll(".b3-button");
    btnsElement[0].addEventListener("click", () => {
        /// #if MOBILE
        exitSourceFlow();
        /// #else
        exportLayout({
            errorExit: true,
            cb: exitSourceFlow
        });
        /// #endif
    });
    btnsElement[1].addEventListener("click", () => {
        refreshFileTree();
        dialog.destroy();
    });
};

export const refreshFileTree = (cb?: () => void) => {
    window.sourceflow.storage[Constants.LOCAL_FILEPOSITION] = {};
    setStorageVal(Constants.LOCAL_FILEPOSITION, window.sourceflow.storage[Constants.LOCAL_FILEPOSITION]);
    fetchPost("/api/system/rebuildDataIndex", {}, () => {
        if (cb) {
            cb();
        }
    });
};

let statusTimeout: number;
let lastSyncStatus: {code: number; msg: string; at: number} | null = null;

const syncStatusText = (zh: string, en: string) => window.sourceflow.config.lang === "zh_CN" ? zh : en;

const renderStatusSync = () => {
    const syncElement = document.querySelector("#status .status__sync") as HTMLElement;
    if (!syncElement) {
        return;
    }
    if (!window.sourceflow.config.sync.enabled) {
        syncElement.textContent = "";
        syncElement.removeAttribute("title");
        return;
    }
    if (!lastSyncStatus) {
        syncElement.textContent = syncStatusText("同步已启用", "Sync enabled");
        syncElement.title = syncElement.textContent;
        return;
    }
    const timeText = new Date(lastSyncStatus.at).toLocaleTimeString(window.sourceflow.config.lang === "zh_CN" ? "zh-CN" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
    });
    if (lastSyncStatus.code === 0) {
        syncElement.textContent = syncStatusText("同步中…", "Syncing...");
    } else if (lastSyncStatus.code === 1) {
        syncElement.textContent = syncStatusText(`最近同步成功 ${timeText}`, `Last sync succeeded ${timeText}`);
    } else {
        const detail = `${lastSyncStatus.msg || ""}`.trim();
        syncElement.textContent = detail
            ? syncStatusText(`最近同步失败 ${timeText}`, `Last sync failed ${timeText}`)
            : syncStatusText("最近同步失败", "Last sync failed");
    }
    syncElement.title = lastSyncStatus.msg
        ? `${syncElement.textContent}\n${lastSyncStatus.msg}`
        : syncElement.textContent;
};

export const progressStatus = (data: IWebSocketData) => {
    const msgElement = document.querySelector("#status .status__msg");
    if (msgElement) {
        clearTimeout(statusTimeout);
        msgElement.innerHTML = data.msg;
        statusTimeout = window.setTimeout(() => {
            msgElement.innerHTML = "";
        }, 12000);
    }
};

export const progressLoading = (data: IWebSocketData) => {
    let progressElement = document.getElementById("progress");
    if (!progressElement) {
        document.body.insertAdjacentHTML("beforeend", `<div id="progress" style="z-index: ${++window.sourceflow.zIndex}"></div>`);
        progressElement = document.getElementById("progress");
    }
    // code 0: 有进度；1: 无进度；2: 关闭
    if (data.code === 2) {
        progressElement.remove();
        return;
    }
    if (data.code === 0) {
        progressElement.innerHTML = `<div class="b3-dialog__scrim" style="opacity: 1"></div>
<div class="b3-dialog__loading">
    <div style="text-align: right">${data.data.current}/${data.data.total}</div>
    <div style="margin: 8px 0;height: 8px;border-radius: var(--b3-border-radius);overflow: hidden;background-color:#fff;"><div style="width: ${data.data.current / data.data.total * 100}%;transition: var(--b3-transition);background-color: var(--b3-theme-primary);height: 8px;"></div></div>
    <div class="ft__breakword">${escapeHtml(data.msg)}</div>
</div>`;
    } else if (data.code === 1) {
        if (progressElement.lastElementChild) {
            progressElement.lastElementChild.lastElementChild.innerHTML = escapeHtml(data.msg);
        } else {
            progressElement.innerHTML = `<div class="b3-dialog__scrim" style="opacity: 1"></div>
<div class="b3-dialog__loading">
    <div style="margin: 8px 0;height: 8px;border-radius: var(--b3-border-radius);overflow: hidden;background-color:#fff;"><div style="background-color: var(--b3-theme-primary);height: 8px;background-image: linear-gradient(-45deg, rgba(255, 255, 255, 0.2) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.2) 50%, rgba(255, 255, 255, 0.2) 75%, transparent 75%, transparent);animation: stripMove 450ms linear infinite;background-size: 50px 50px;"></div></div>
    <div class="ft__breakword">${escapeHtml(data.msg)}</div>
</div>`;
        }
    }
};

export const progressBackgroundTask = (tasks: { action: string }[] | null | undefined) => {
    tasks = Array.isArray(tasks) ? tasks : [];
    const backgroundTaskElement = document.querySelector(".status__backgroundtask");
    if (!backgroundTaskElement) {
        return;
    }
    if (tasks.length === 0) {
        backgroundTaskElement.classList.add("fn__none");
        if (!window.sourceflow.menus.menu.element.classList.contains("fn__none") &&
            window.sourceflow.menus.menu.element.getAttribute("data-name") === Constants.MENU_STATUS_BACKGROUND_TASK) {
            window.sourceflow.menus.menu.remove();
        }
    } else {
        backgroundTaskElement.classList.remove("fn__none");
        backgroundTaskElement.setAttribute("data-tasks", JSON.stringify(tasks));
        backgroundTaskElement.innerHTML = tasks[0].action + '<div class="fn__progress"><div></div></div>';
    }
};

const syncGuardText = (zh: string, en: string) => {
    return window.sourceflow.config.lang === "zh_CN" ? zh : en;
};

const dispatchSyncStatusChanged = (data?: IWebSocketData) => {
    dispatchBrandedWindowEvent("sourceflow-sync-updated", data || null);
};

const bootSyncGuardState = {
    active: false,
    readonly: false,
    editorReadOnly: false,
};

const bootSyncRetryState = {
    autoRetried: false,
    inFlight: false,
};

const reloadReadonlyEditors = () => {
    /// #if MOBILE
    if (window.sourceflow.mobile.popEditor) {
        reloadProtyle(window.sourceflow.mobile.popEditor.protyle, false, true);
    }
    if (window.sourceflow.mobile.editor) {
        reloadProtyle(window.sourceflow.mobile.editor.protyle, false, true);
        setEmpty(window.sourceflow.ws.app);
    }
    /// #else
    getAllModels().editor.forEach((item) => {
        reloadProtyle(item.editor.protyle, false, true);
    });
    /// #endif
};

const enableBootSyncGuard = (message: string, showNotice = true) => {
    const normalizedMessage = escapeHtml(message || window.sourceflow.languages.bootSyncFailed);
    if (!bootSyncGuardState.active) {
        bootSyncGuardState.readonly = window.sourceflow.config.readonly;
        bootSyncGuardState.editorReadOnly = window.sourceflow.config.editor.readOnly;
    }
    bootSyncGuardState.active = true;
    window.sourceflow.config.readonly = true;
    window.sourceflow.config.editor.readOnly = true;
    hideAllElements(["util"]);
    reloadReadonlyEditors();
    if (showNotice) {
        showMessage(normalizedMessage, 0, "error", Constants.DIALOG_BOOTSYNCFAILED);
    }
    dispatchSyncStatusChanged();
};

const disableBootSyncGuard = () => {
    if (!bootSyncGuardState.active) {
        return;
    }
    window.sourceflow.config.readonly = bootSyncGuardState.readonly;
    window.sourceflow.config.editor.readOnly = bootSyncGuardState.editorReadOnly;
    bootSyncGuardState.active = false;
    bootSyncRetryState.autoRetried = false;
    bootSyncRetryState.inFlight = false;
    hideMessage(Constants.DIALOG_BOOTSYNCFAILED);
    hideMessage("bootSyncAutoRetry");
    reloadReadonlyEditors();
    showMessage(syncGuardText("启动同步保护已解除", "Startup sync protection cleared"), 3000);
    dispatchSyncStatusChanged();
};

const continueOfflineAfterBootSyncFailure = (onFinished?: (success: boolean) => void) => {
    fetchPost("/api/sync/setSyncEnable", {enabled: false}, (response) => {
        if (response.code !== 0) {
            showMessage(response.msg || syncGuardText("暂停同步失败，请稍后重试", "Failed to pause sync, please try again later"), 6000, "error");
            onFinished?.(false);
            return;
        }
        window.sourceflow.config.sync.enabled = false;
        processSync();
        disableBootSyncGuard();
        showMessage(syncGuardText("已暂停同步，现在可以离线继续编辑", "Sync paused, you can continue editing offline now"), 5000);
        onFinished?.(true);
    });
};

export const bootSync = () => {
    if (bootSyncRetryState.inFlight) {
        return;
    }
    fetchPost("/api/sync/getBootSync", {}, response => {
        if (response.code === 1) {
            const guardInfo = ((response.data || {}) as TBootSyncGuardInfo);
            const summary = guardInfo.summary || response.msg;
            const detail = guardInfo.detail || "";
            const primaryAction = guardInfo.primaryAction || "retry";
            const primaryTarget = guardInfo.primaryTarget || "repos";
            const reason = guardInfo.reason;
            const primaryLabel = guardInfo.primaryLabel || window.sourceflow.languages.syncNow;
            const shouldAutoRetry = !bootSyncRetryState.autoRetried && primaryAction === "retry";
            enableBootSyncGuard(summary, !shouldAutoRetry);
            if (shouldAutoRetry) {
                bootSyncRetryState.autoRetried = true;
                bootSyncRetryState.inFlight = true;
                showMessage(syncGuardText("启动同步失败，正在自动重试一次...", "Startup sync failed, retrying once automatically..."), -1, "info", "bootSyncAutoRetry");
                fetchPost("/api/sync/performBootSync", {}, (syncResponse) => {
                    bootSyncRetryState.inFlight = false;
                    hideMessage("bootSyncAutoRetry");
                    if (syncResponse.code === 0) {
                        disableBootSyncGuard();
                        showMessage(syncGuardText("启动同步已自动恢复", "Startup sync recovered automatically"), 3000);
                    } else {
                        bootSync();
                    }
                });
                return;
            }
            const syncSettingsButton = !isMobile() && primaryAction !== "settings"
                ? `<button data-action="syncSettings" class="b3-button b3-button--outline">${syncGuardText("同步设置", "Sync settings")}</button>`
                : "";
            const detailHTML = detail ? `<div class="b3-label__text" style="margin-top: 8px;">${escapeHtml(detail)}</div>` : "";
            const dialog = new Dialog({
                disableClose: true,
                width: isMobile() ? "92vw" : "50vw",
                title: "🌩️ " + window.sourceflow.languages.bootSyncFailed,
                content: `<div class="b3-dialog__content">${escapeHtml(summary)}${detailHTML}</div>
<div class="b3-dialog__action">
    <button data-action="readOnly" class="b3-button b3-button--cancel">${syncGuardText("只读查看", "Read only")}</button>
    ${syncSettingsButton}
    <button data-action="offline" class="b3-button b3-button--outline">${syncGuardText("离线继续编辑", "Continue offline")}</button>
    <button data-action="history" class="b3-button b3-button--outline">${window.sourceflow.languages.dataHistory}</button><div class="fn__space"></div>
    <button data-action="syncNow" class="b3-button b3-button--text">${escapeHtml(primaryLabel)}</button>
</div>`
            });
            dialog.element.setAttribute("data-key", Constants.DIALOG_BOOTSYNCFAILED);
            const readOnlyButton = dialog.element.querySelector('[data-action="readOnly"]') as HTMLButtonElement;
            const syncSettingsAction = dialog.element.querySelector('[data-action="syncSettings"]') as HTMLButtonElement;
            const offlineButton = dialog.element.querySelector('[data-action="offline"]') as HTMLButtonElement;
            const historyButton = dialog.element.querySelector('[data-action="history"]') as HTMLButtonElement;
            const syncNowButton = dialog.element.querySelector('[data-action="syncNow"]') as HTMLButtonElement;
            readOnlyButton.addEventListener("click", () => {
                dialog.destroy();
            });
            syncSettingsAction?.addEventListener("click", () => {
                dialog.destroy();
                openBootSyncSettingTarget("repos", reason);
            });
            offlineButton.addEventListener("click", () => {
                if (offlineButton.getAttribute("disabled")) {
                    return;
                }
                offlineButton.setAttribute("disabled", "disabled");
                continueOfflineAfterBootSyncFailure((success) => {
                    offlineButton.removeAttribute("disabled");
                    if (success) {
                        dialog.destroy();
                    }
                });
            });
            historyButton.addEventListener("click", () => {
                void import("../history/history").then(({openHistory}) => {
                    openHistory(window.sourceflow.ws.app, "repo");
                });
            });
            syncNowButton.addEventListener("click", () => {
                if (syncNowButton.getAttribute("disabled")) {
                    return;
                }
                if (primaryAction === "settings") {
                    dialog.destroy();
                    openBootSyncSettingTarget(primaryTarget, reason);
                    return;
                }
                syncNowButton.setAttribute("disabled", "disabled");
                fetchPost("/api/sync/performBootSync", {}, (syncResponse) => {
                    if (syncResponse.code === 0) {
                        disableBootSyncGuard();
                        dialog.destroy();
                    } else {
                        dialog.destroy();
                        bootSync();
                    }
                    syncNowButton.removeAttribute("disabled");
                });
            });
            return;
        }
        disableBootSyncGuard();
    });
};

export const deferBootSync = () => {
    const run = () => bootSync();
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => run(), {timeout: 600});
        return;
    }
    window.setTimeout(run, 120);
};

export const setTitle = (title: string, showVersionTitle = false) => {
    const dragElement = document.getElementById("drag");
    const workspaceName = getWorkspaceName();
    const appName = window.sourceflow.languages.sourceflowNote || "SourceFlow";
    if (showVersionTitle) {
        const versionTitle = `${workspaceName} - ${appName} v${Constants.SOURCEFLOW_VERSION}`;
        document.title = versionTitle;
        if (dragElement) {
            dragElement.textContent = versionTitle;
            dragElement.setAttribute("title", versionTitle);
        }
    } else {
        title = title.trim() || window.sourceflow.languages["_kernel"][16];
        document.title = `${title} - ${workspaceName} - ${appName} v${Constants.SOURCEFLOW_VERSION}`;
        if (!dragElement) {
            return;
        }
        dragElement.setAttribute("title", title);
        dragElement.innerHTML = escapeHtml(title);
    }
};

export const downloadProgress = (data: { id: string, percent: number }) => {
    const bazaarSideElement = document.querySelector("#configBazaarReadme .item__side");
    if (!bazaarSideElement) {
        return;
    }
    if (data.id !== JSON.parse(bazaarSideElement.getAttribute("data-obj")).repoURL) {
        return;
    }
    const btnElement = bazaarSideElement.querySelector('[data-type="install"]') as HTMLElement;
    if (btnElement) {
        if (data.percent >= 1) {
            btnElement.parentElement.classList.add("fn__none");
            btnElement.parentElement.nextElementSibling.classList.add("fn__none");
        } else {
            btnElement.classList.add("b3-button--progress");
            btnElement.parentElement.nextElementSibling.firstElementChild.classList.add("b3-button--progress");
            btnElement.innerHTML = `<span style="width: ${data.percent * 100}%"></span>`;
            btnElement.parentElement.nextElementSibling.firstElementChild.innerHTML = `<span style="width: ${data.percent * 100}%"></span>`;
        }
    }
};

export const processSync = (data?: IWebSocketData, plugins?: Plugin[]) => {
    /// #if MOBILE
    const menuSyncUseElement = document.querySelector("#menuSyncNow use");
    const barSyncUseElement = document.querySelector("#toolbarSync use");
    if (!data) {
        if (!window.sourceflow.config.sync.enabled || window.sourceflow.config.sync.provider === 4 || window.sourceflow.config.sync.mode === 3) {
            disableBootSyncGuard();
        }
        if (!window.sourceflow.config.sync.enabled) {
            menuSyncUseElement?.setAttribute("xlink:href", "#iconCloudOff");
            barSyncUseElement.setAttribute("xlink:href", "#iconCloudOff");
        } else {
            menuSyncUseElement?.setAttribute("xlink:href", "#iconCloudSucc");
            barSyncUseElement.setAttribute("xlink:href", "#iconCloudSucc");
        }
        dispatchSyncStatusChanged();
        return;
    }
    menuSyncUseElement?.parentElement.classList.remove("fn__rotate");
    barSyncUseElement.parentElement.classList.remove("fn__rotate");
    if (data.code === 0) {  // syncing
        menuSyncUseElement?.parentElement.classList.add("fn__rotate");
        barSyncUseElement.parentElement.classList.add("fn__rotate");
        menuSyncUseElement?.setAttribute("xlink:href", "#iconRefresh");
        barSyncUseElement.setAttribute("xlink:href", "#iconRefresh");
    } else if (data.code === 2) {    // error
        menuSyncUseElement?.setAttribute("xlink:href", "#iconCloudError");
        barSyncUseElement.setAttribute("xlink:href", "#iconCloudError");
    } else if (data.code === 1) {   // success
        menuSyncUseElement?.setAttribute("xlink:href", "#iconCloudSucc");
        barSyncUseElement.setAttribute("xlink:href", "#iconCloudSucc");
        disableBootSyncGuard();
    }
    /// #else
    const iconElement = document.querySelector("#barSync");
    if (!iconElement) {
        dispatchSyncStatusChanged(data);
        return;
    }
    const useElement = iconElement.querySelector("use");
    if (!data) {
        if (!window.sourceflow.config.sync.enabled || window.sourceflow.config.sync.provider === 4 || window.sourceflow.config.sync.mode === 3) {
            disableBootSyncGuard();
        }
        iconElement.classList.remove("toolbar__item--active");
        if (!window.sourceflow.config.sync.enabled) {
            useElement.setAttribute("xlink:href", "#iconCloudOff");
        } else {
            useElement.setAttribute("xlink:href", "#iconCloudSucc");
        }
        if (!window.sourceflow.config.sync.enabled) {
            lastSyncStatus = null;
        }
        renderStatusSync();
        dispatchSyncStatusChanged();
        return;
    }
    iconElement.firstElementChild.classList.remove("fn__rotate");
    if (data.code === 0) {  // syncing
        iconElement.classList.add("toolbar__item--active");
        iconElement.firstElementChild.classList.add("fn__rotate");
        useElement.setAttribute("xlink:href", "#iconRefresh");
    } else if (data.code === 2) {    // error
        iconElement.classList.remove("toolbar__item--active");
        useElement.setAttribute("xlink:href", "#iconCloudError");
    } else if (data.code === 1) {   // success
        iconElement.classList.remove("toolbar__item--active");
        useElement.setAttribute("xlink:href", "#iconCloudSucc");
        disableBootSyncGuard();
    }
    lastSyncStatus = {
        code: data.code,
        msg: `${data.msg || ""}`.trim(),
        at: Date.now(),
    };
    renderStatusSync();
    /// #endif
    dispatchSyncStatusChanged(data);
    (plugins || []).forEach((item) => {
        if (data.code === 0) {
            item.eventBus.emit("sync-start", data);
        } else if (data.code === 1) {
            item.eventBus.emit("sync-end", data);
        } else if (data.code === 2) {
            item.eventBus.emit("sync-fail", data);
        }
    });
};
