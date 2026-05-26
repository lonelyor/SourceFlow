import {fetchPost} from "../util/fetch";
import {showMessage} from "../dialog/message";
import {ensureSelfHostedSyncReady} from "../sync/syncGuide";
import {processSync} from "../dialog/processSystem";
import {openByMobile, setStorageVal} from "../protyle/util/compatibility";
import {confirmDialog} from "../dialog/confirmDialog";
import {Dialog} from "../dialog";
import {Constants} from "../constants";
import {isBrowser, isMobile} from "../util/functions";
import {originalPath, useShell} from "../util/pathName";
import {escapeAttr, escapeHtml} from "../util/escape";
import {openHistory} from "../history/history";
import {writeText} from "../protyle/util/compatibility";
import {openBootSyncSettingTarget} from "../sync/bootSyncGuard";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif

const canRestoreToNewWorkspace = () => {
    return !isBrowser() && !isMobile();
};

const isLocalSyncProvider = () => {
    return window.sourceflow.config.sync.provider === 4;
};

const isChineseUI = () => {
    return window.sourceflow.config.lang === "zh_CN";
};

let reposActionStatusTimer = 0;
let syncDiagnosticsRefreshTimer = 0;
let syncDiagnosticsWindowListener: EventListener;

const setReposInteractable = (element: HTMLElement | HTMLInputElement | HTMLButtonElement, disabled: boolean) => {
    if ("disabled" in element) {
        element.disabled = disabled;
    } else if (disabled) {
        element.setAttribute("disabled", "disabled");
    } else {
        element.removeAttribute("disabled");
    }
    if (disabled) {
        element.setAttribute("data-busy", "true");
    } else {
        element.removeAttribute("data-busy");
    }
};

const setReposActionStatus = (message: string, tone: "info" | "success" | "error" = "info", timeout = 0) => {
    const statusElement = repos.element?.querySelector("#reposActionStatus") as HTMLElement;
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.setAttribute("data-tone", tone);
        statusElement.style.color = tone === "error"
            ? "var(--b3-theme-error)"
            : tone === "success"
                ? "var(--b3-theme-success)"
                : "";
    }
    window.clearTimeout(reposActionStatusTimer);
    if (timeout > 0) {
        reposActionStatusTimer = window.setTimeout(() => {
            const currentStatusElement = repos.element?.querySelector("#reposActionStatus") as HTMLElement;
            if (currentStatusElement) {
                currentStatusElement.textContent = "";
                currentStatusElement.style.color = "";
                currentStatusElement.removeAttribute("data-tone");
            }
        }, timeout);
    }
};

const syncText = (zh: string, en: string) => {
    return isChineseUI() ? zh : en;
};

const formatSyncTime = (timestamp?: number) => {
    if (!timestamp) {
        return syncText("暂无", "N/A");
    }
    return new Date(timestamp).toLocaleString(isChineseUI() ? "zh-CN" : "en-US", {
        hour12: false,
    });
};

const formatSyncDuration = (durationMs?: number) => {
    const value = durationMs || 0;
    if (value < 1000) {
        return `${value} ms`;
    }
    if (value < 10000) {
        return `${(value / 1000).toFixed(1)} s`;
    }
    return `${Math.round(value / 1000)} s`;
};

const renderSyncTrigger = (trigger: string) => {
    const labels: Record<string, string> = {
        auto: syncText("自动", "Auto"),
        boot: syncText("启动", "Boot"),
        "boot-background": syncText("启动后台", "Boot background"),
        download: syncText("下载", "Download"),
        exit: syncText("退出", "Exit"),
        manual: syncText("手动", "Manual"),
        perception: syncText("感知", "Perception"),
        upload: syncText("上传", "Upload"),
    };
    return labels[trigger] || trigger;
};

const renderSyncDirection = (direction: string) => {
    const labels: Record<string, string> = {
        bidirectional: syncText("双向", "Bidirectional"),
        download: syncText("下载", "Download"),
        observe: syncText("观测", "Observe"),
        upload: syncText("上传", "Upload"),
    };
    return labels[direction] || direction;
};

const renderSyncStatus = (status: string) => {
    const labels: Record<string, string> = {
        error: syncText("失败", "Failed"),
        noticed: syncText("发现变更", "Change noticed"),
        skipped: syncText("已跳过", "Skipped"),
        success: syncText("成功", "Succeeded"),
    };
    return labels[status] || status;
};

const getSyncStatusTone = (status: string) => {
    if ("success" === status) {
        return "var(--b3-theme-success)";
    }
    if ("noticed" === status) {
        return "var(--b3-theme-primary)";
    }
    if ("error" === status) {
        return "var(--b3-theme-error)";
    }
    return "var(--b3-theme-on-surface-light)";
};

const renderSyncTraffic = (record: {
    uploadBytesText?: string;
    uploadFileCount?: number;
    downloadBytesText?: string;
    downloadFileCount?: number;
    conflicts?: number;
    upserts?: number;
    removes?: number;
}) => {
    const parts: string[] = [];
    if ((record.uploadFileCount || 0) > 0 || record.uploadBytesText) {
        parts.push(syncText(`上传 ${record.uploadFileCount || 0} 个文件 / ${record.uploadBytesText || "0 B"}`, `Upload ${record.uploadFileCount || 0} files / ${record.uploadBytesText || "0 B"}`));
    }
    if ((record.downloadFileCount || 0) > 0 || record.downloadBytesText) {
        parts.push(syncText(`下载 ${record.downloadFileCount || 0} 个文件 / ${record.downloadBytesText || "0 B"}`, `Download ${record.downloadFileCount || 0} files / ${record.downloadBytesText || "0 B"}`));
    }
    if ((record.conflicts || 0) > 0 || (record.upserts || 0) > 0 || (record.removes || 0) > 0) {
        parts.push(syncText(`冲突 ${record.conflicts || 0}，更新 ${record.upserts || 0}，删除 ${record.removes || 0}`, `Conflicts ${record.conflicts || 0}, upserts ${record.upserts || 0}, removes ${record.removes || 0}`));
    }
    return parts.join(" · ");
};

const openBootSyncGuardSetting = (target: "repos" | "about" = "repos") => {
    if (target === "repos") {
        setReposActionStatus(syncText("请检查上方同步配置后再重试", "Review the sync settings above, then try again"), "info", 5000);
    } else {
        setReposActionStatus(syncText("已打开相关设置，请按高亮位置处理", "Opened the related settings. Follow the highlighted area."), "info", 5000);
    }
    openBootSyncSettingTarget(target);
};

const continueOfflineFromDiagnostics = () => {
    setReposActionStatus(syncText("正在暂停同步并切换到离线编辑...", "Pausing sync and switching to offline editing..."));
    fetchPost("/api/sync/setSyncEnable", {enabled: false}, (response) => {
        if (response.code !== 0) {
            setReposActionStatus(response.msg || syncText("暂停同步失败", "Failed to pause sync"), "error", 7000);
            showMessage(response.msg || syncText("暂停同步失败，请稍后重试", "Failed to pause sync, please try again later"), 6000, "error");
            return;
        }
        window.sourceflow.config.sync.enabled = false;
        const switchElement = repos.element?.querySelector("#reposCloudSyncSwitch") as HTMLInputElement;
        if (switchElement) {
            switchElement.checked = false;
        }
        processSync();
        queueSyncDiagnosticsRefresh();
        setReposActionStatus(syncText("已暂停同步，现在可以离线继续编辑", "Sync paused, you can continue editing offline now"), "success", 5000);
        showMessage(syncText("已暂停同步，现在可以离线继续编辑", "Sync paused, you can continue editing offline now"), 5000);
    });
};

const performBootSyncFromDiagnostics = () => {
    setReposActionStatus(syncText("正在执行启动同步恢复...", "Running startup sync recovery..."));
    fetchPost("/api/sync/performBootSync", {}, (response) => {
        queueSyncDiagnosticsRefresh(0);
        if (response.code === 0) {
            setReposActionStatus(syncText("启动同步恢复成功", "Startup sync recovered successfully"), "success", 5000);
            showMessage(syncText("启动同步恢复成功", "Startup sync recovered successfully"), 4000);
            processSync();
            return;
        }
        setReposActionStatus(response.msg || syncText("启动同步恢复失败", "Startup sync recovery failed"), "error", 7000);
        showMessage(response.msg || syncText("启动同步恢复失败", "Startup sync recovery failed"), 6000, "error");
    });
};

const renderSyncDiagnostics = (data: {
    enabled: boolean;
    providerName: string;
    synced: number;
    stat: string;
    bootSyncFailed: boolean;
    bootSyncGuard?: {
        summary?: string;
        detail?: string;
        reason?: string;
        primaryLabel?: string;
        primaryAction?: "retry" | "settings";
        primaryTarget?: "repos" | "about";
    };
    perception: {
        enabled: boolean;
        running: boolean;
        pollIntervalSec: number;
        lastCheckedAt: number;
        lastRemoteChangeAt?: number;
        lastTriggeredAt: number;
        lastRemoteLatestID: string;
        lastError: string;
        lastTrigger: string;
    };
    recent: Array<{
        trigger: string;
        direction: string;
        status: string;
        startedAt: number;
        durationMs: number;
        message: string;
        uploadBytesText?: string;
        uploadFileCount?: number;
        downloadBytesText?: string;
        downloadFileCount?: number;
        conflicts?: number;
        upserts?: number;
        removes?: number;
    }>;
}) => {
    const recent = Array.isArray(data.recent) ? data.recent : [];
    const bootSyncGuard = data.bootSyncGuard || {};
    const perception = data.perception || {
        enabled: false,
        running: false,
        pollIntervalSec: 0,
        lastCheckedAt: 0,
        lastTriggeredAt: 0,
        lastRemoteLatestID: "",
        lastError: "",
        lastTrigger: "",
    };
    const summaryItems = [
        `${syncText("当前状态", "Current status")}：${escapeHtml(data.stat || syncText("未知", "Unknown"))}`,
        `${syncText("最近同步", "Last sync")}：${escapeHtml(formatSyncTime(data.synced))}`,
        `${syncText("提供商", "Provider")}：${escapeHtml(data.providerName || "-")}`,
        `${syncText("启动保护", "Boot guard")}：${data.bootSyncFailed ? syncText("已触发", "Triggered") : syncText("正常", "Normal")}`,
        `${syncText("同步感知", "Sync perception")}：${perception.enabled ? (perception.running ? syncText("运行中", "Running") : syncText("待命", "Idle")) : syncText("已关闭", "Disabled")}`,
        `${syncText("最近探测", "Last probe")}：${escapeHtml(formatSyncTime(perception.lastCheckedAt))}`,
    ];
    if (perception.lastTriggeredAt) {
        summaryItems.push(`${syncText("最近触发", "Last trigger")}：${escapeHtml(formatSyncTime(perception.lastTriggeredAt))}`);
    }
    if (perception.lastTrigger) {
        summaryItems.push(`${syncText("触发原因", "Trigger reason")}：${escapeHtml(renderSyncTrigger(perception.lastTrigger))}`);
    }
    if (perception.lastError) {
        summaryItems.push(`${syncText("感知异常", "Perception error")}：${escapeHtml(perception.lastError)}`);
    }
    if (data.bootSyncFailed && bootSyncGuard.summary) {
        summaryItems.push(`${syncText("保护说明", "Protection summary")}：${escapeHtml(bootSyncGuard.summary)}`);
    }
    if (data.bootSyncFailed && bootSyncGuard.detail) {
        summaryItems.push(`${syncText("处理建议", "Suggested handling")}：${escapeHtml(bootSyncGuard.detail)}`);
    }
    let html = `<div class="b3-label__text">${summaryItems.join("<br>")}</div>`;
    if (data.bootSyncFailed) {
        const shouldShowPrimary = !(bootSyncGuard.primaryAction === "settings" && bootSyncGuard.primaryTarget === "repos");
        html += `<div class="fn__flex" style="gap: 8px; flex-wrap: wrap; margin-top: 8px;">`;
        if (shouldShowPrimary) {
            html += `<button class="b3-button b3-button--text fn__size200" data-action="bootSyncPrimary" data-primary-action="${escapeAttr(bootSyncGuard.primaryAction || "retry")}" data-primary-target="${escapeAttr(bootSyncGuard.primaryTarget || "")}">
                <svg><use xlink:href="${bootSyncGuard.primaryAction === "settings" ? "#iconSettings" : "#iconRefresh"}"></use></svg>${escapeHtml(bootSyncGuard.primaryLabel || syncText("立即同步", "Sync now"))}
            </button>`;
        }
        html += `<button class="b3-button b3-button--outline fn__size200" data-action="bootSyncOffline">
                <svg><use xlink:href="#iconCloudOff"></use></svg>${syncText("离线继续编辑", "Continue offline")}
            </button>
            <button class="b3-button b3-button--outline fn__size200" data-action="bootSyncHistory">
                <svg><use xlink:href="#iconHistory"></use></svg>${window.sourceflow.languages.dataHistory}
            </button>
        </div>`;
    }
    if (recent.length === 0) {
        html += `<div class="b3-label__text" style="margin-top: 8px;">${syncText("暂无同步诊断记录", "No recent sync diagnostics")}</div>`;
        return html;
    }
    html += `<div class="fn__hr"></div>`;
    recent.forEach((record) => {
        const traffic = renderSyncTraffic(record);
        html += `<div class="b3-label b3-label--inner" style="margin-top: 8px;">
    <div class="fn__flex">
        <div class="fn__flex-1">
            ${escapeHtml(renderSyncTrigger(record.trigger))} · ${escapeHtml(renderSyncDirection(record.direction))}
            <div class="b3-label__text">${escapeHtml(formatSyncTime(record.startedAt))} · ${escapeHtml(formatSyncDuration(record.durationMs))}</div>
        </div>
        <span class="fn__space"></span>
        <span class="ft__smaller" style="color: ${getSyncStatusTone(record.status)}">${escapeHtml(renderSyncStatus(record.status))}</span>
    </div>`;
        if (traffic) {
            html += `<div class="b3-label__text">${escapeHtml(traffic)}</div>`;
        }
        if (record.message) {
            html += `<div class="b3-label__text">${escapeHtml(record.message)}</div>`;
        }
        html += "</div>";
    });
    return html;
};

const refreshSyncDiagnostics = () => {
    const diagnosticsElement = repos.element?.querySelector("#syncDiagnostics") as HTMLElement;
    if (!diagnosticsElement) {
        return;
    }
    diagnosticsElement.innerHTML = `<div class="b3-label__text">${syncText("正在加载同步诊断...", "Loading sync diagnostics...")}</div>`;
    fetchPost("/api/sync/getSyncDiagnostics", {}, (response) => {
        const currentDiagnosticsElement = repos.element?.querySelector("#syncDiagnostics") as HTMLElement;
        if (!currentDiagnosticsElement) {
            return;
        }
        if (response.code !== 0) {
            currentDiagnosticsElement.innerHTML = `<div class="b3-label__text" style="color: var(--b3-theme-error)">${escapeHtml(response.msg || syncText("同步诊断加载失败", "Failed to load sync diagnostics"))}</div>`;
            return;
        }
        currentDiagnosticsElement.innerHTML = renderSyncDiagnostics(response.data);
    });
};

const queueSyncDiagnosticsRefresh = (delay = 120) => {
    window.clearTimeout(syncDiagnosticsRefreshTimer);
    syncDiagnosticsRefreshTimer = window.setTimeout(() => {
        refreshSyncDiagnostics();
    }, delay);
};

const bindSyncDiagnosticsWindowListener = () => {
    if (syncDiagnosticsWindowListener) {
        window.removeEventListener("sourceflow-sync-updated", syncDiagnosticsWindowListener);
    }
    syncDiagnosticsWindowListener = () => {
        if (!repos.element?.isConnected) {
            return;
        }
        queueSyncDiagnosticsRefresh(160);
    };
    window.addEventListener("sourceflow-sync-updated", syncDiagnosticsWindowListener);
};

const getPortableRootDir = () => {
    return window.sourceflow.config.system.isPortable ? originalPath().dirname(window.sourceflow.config.system.confDir) : "";
};

const resolveLocalSyncEndpoint = (endpoint: string) => {
    const trimmedEndpoint = endpoint.trim();
    if (!trimmedEndpoint) {
        return "";
    }
    if (window.sourceflow.config.system.isPortable && !originalPath().isAbsolute(trimmedEndpoint)) {
        return originalPath().resolve(getPortableRootDir(), trimmedEndpoint);
    }
    return trimmedEndpoint;
};

const renderLocalSyncPathInfo = (endpoint: string) => {
    const savedPath = endpoint.trim();
    const resolvedPath = resolveLocalSyncEndpoint(savedPath);
    const savedLabel = isChineseUI() ? "当前保存值" : "Saved value";
    const resolvedLabel = isChineseUI() ? "运行时解析路径" : "Resolved path";
    const portableRootLabel = isChineseUI() ? "便携根目录" : "Portable root";
    const emptyValue = isChineseUI() ? "未设置" : "Not set";
    const openLabel = isChineseUI() ? "打开目录" : "Open";
    const canOpen = !!resolvedPath && !isBrowser() && !isMobile();
    return `<div class="b3-label b3-label--inner">
    <div>${isChineseUI() ? "路径预览" : "Path preview"}</div>
    <div class="b3-label__text">${savedLabel}：<code class="fn__code">${escapeHtml(savedPath || emptyValue)}</code></div>
    ${resolvedPath ? `<div class="b3-label__text">${resolvedLabel}：<code class="fn__code">${escapeHtml(resolvedPath)}</code></div>` : ""}
    ${window.sourceflow.config.system.isPortable ? `<div class="b3-label__text">${portableRootLabel}：<code class="fn__code">${escapeHtml(getPortableRootDir())}</code></div>` : ""}
    ${canOpen ? `<div class="fn__hr"></div><button data-action="openLocalDirectory" data-path="${escapeAttr(resolvedPath)}" class="b3-button b3-button--outline fn__size200">${openLabel}</button>` : ""}
</div>`;
};

const updateLocalSyncPathInfo = (providerPanelElement: Element, endpoint: string) => {
    const previewElement = providerPanelElement.querySelector("#localPathInfo");
    if (previewElement) {
        previewElement.outerHTML = `<div id="localPathInfo">${renderLocalSyncPathInfo(endpoint)}</div>`;
    }
};

const saveLocalSyncProvider = (providerPanelElement: Element) => {
    let timeout = parseInt((providerPanelElement.querySelector("#timeout") as HTMLInputElement).value, 10);
    if (7 > timeout) {
        timeout = 7;
    }
    if (300 < timeout) {
        timeout = 300;
    }
    let concurrentReqs = parseInt((providerPanelElement.querySelector("#localConcurrentReqs") as HTMLInputElement).value, 10);
    if (1 > concurrentReqs) {
        concurrentReqs = 1;
    }
    if (1024 < concurrentReqs) {
        concurrentReqs = 1024;
    }
    (providerPanelElement.querySelector("#timeout") as HTMLInputElement).value = timeout.toString();
    const endpoint = (providerPanelElement.querySelector("#endpoint") as HTMLInputElement).value.trim();
    updateLocalSyncPathInfo(providerPanelElement, endpoint);
    const local = {
        endpoint,
        timeout: timeout,
        concurrentReqs: concurrentReqs,
    };
    fetchPost("/api/sync/setSyncProviderLocal", {local}, (response) => {
        if (response.code === 0) {
            window.sourceflow.config.sync.local = response.data.local;
            const endpointElement = providerPanelElement.querySelector<HTMLInputElement>("#endpoint");
            if (endpointElement) {
                endpointElement.value = response.data.local.endpoint;
            }
            updateLocalSyncPathInfo(providerPanelElement, response.data.local.endpoint);
            refreshSnapshotProtectionStat();
        } else {
            if (response.msg) {
                showMessage(response.msg);
            }
            window.sourceflow.config.sync.local = local;
        }
    });
};

const getRestoreWorkspacePath = () => {
    const baseDir = originalPath().dirname(window.sourceflow.config.system.workspaceDir);
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    return originalPath().join(baseDir, `workspace-restore-${stamp}`);
};

const chooseLocalBackupDirectory = (callback?: () => void) => {
    /// #if !BROWSER
    const defaultPath = resolveLocalSyncEndpoint(window.sourceflow.config.sync.local.endpoint) || (window.sourceflow.config.system.isPortable ? getPortableRootDir() : originalPath().dirname(window.sourceflow.config.system.workspaceDir));
    ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
        cmd: "showOpenDialog",
        defaultPath,
        properties: ["createDirectory", "openDirectory"],
    }).then((result) => {
        if (result.canceled || !result.filePaths?.length) {
            callback?.();
            return;
        }
        const selectedPath = result.filePaths[0];
        const local = {
            ...window.sourceflow.config.sync.local,
            endpoint: selectedPath,
        };
        fetchPost("/api/sync/setSyncProviderLocal", {local}, (response) => {
            if (response.code !== 0) {
                showMessage(response.msg);
                callback?.();
                return;
            }
            window.sourceflow.config.sync.local = response.data.local;
            showMessage(isChineseUI() ? "已更新本地备份目录，可继续恢复" : "Local backup directory updated");
            callback?.();
        });
    });
    /// #endif
};

const restoreIntoCurrentWorkspace = (switchElement: HTMLInputElement) => {
    setReposActionStatus(isChineseUI() ? "准备恢复：正在启用快照备份..." : "Preparing restore: enabling snapshot backup...");
    setReposInteractable(switchElement, true);
    fetchPost("/api/sync/setSyncEnable", {enabled: true}, () => {
        window.sourceflow.config.sync.enabled = true;
        switchElement.checked = true;
        processSync();
        setReposActionStatus(isChineseUI() ? "恢复进行中：正在从远端拉取最新数据..." : "Restore in progress: downloading latest remote data...");
        fetchPost("/api/sync/performSyncDownload", {});
        setReposInteractable(switchElement, false);
    });
};

const restoreIntoNewWorkspace = (workspace: string) => {
    const restoreState = {
        workspace,
        createdAt: Date.now(),
    };
    window.sourceflow.storage[Constants.LOCAL_SYNC_RESTORE] = restoreState;
    setStorageVal(Constants.LOCAL_SYNC_RESTORE, restoreState, () => {
        fetchPost("/api/system/setWorkspaceDir", {path: workspace}, () => {
            setReposActionStatus(isChineseUI() ? `已创建空工作空间，准备恢复：${workspace}` : `Empty workspace created, preparing restore: ${workspace}`, "success", 8000);
            /// #if !BROWSER
            ipcRenderer.send(Constants.SOURCEFLOW_OPEN_WORKSPACE, {
                workspace,
                lang: window.sourceflow.config.appearance.lang
            });
            /// #endif
            showMessage(`已新建空工作空间并开始恢复：${workspace}`, 7000, "info");
        });
    });
};

const showRestoreBackupDialog = (switchElement: HTMLInputElement) => {
    if (!canRestoreToNewWorkspace()) {
        const localTip = isLocalSyncProvider() ? `<br><br>如果本地备份目录已经移动，不需要手改 backup-profile.json，请先重新选择当前备份目录。` : "";
        confirmDialog("从远端恢复备份", `<div class="b3-typography">已恢复 repo key 和自托管同步配置。是否立即从远端恢复到当前工作空间？<br><br>恢复会下载远端最新数据并与当前工作空间合并。若要精确替换，请在空工作空间或新便携目录中执行。${localTip}</div>`, () => {
            restoreIntoCurrentWorkspace(switchElement);
        }, undefined, true);
        return;
    }

    const workspace = getRestoreWorkspacePath();
    const localRestoreAction = isLocalSyncProvider() ? `
    <div class="fn__space"></div>
    <button class="b3-button b3-button--outline">${isChineseUI() ? "重新选择本地备份目录" : "Relink local backup directory"}</button>` : "";
    const localRestoreTip = isLocalSyncProvider() ? `
    <div class="b3-label">
        当前本地备份目录
        <div class="b3-label__text"><code class="fn__code">${escapeHtml(resolveLocalSyncEndpoint(window.sourceflow.config.sync.local.endpoint) || window.sourceflow.config.sync.local.endpoint || (isChineseUI() ? "未设置" : "Not set"))}</code></div>
        <div class="b3-label__text">${isChineseUI() ? "如果备份仓库已经移动，不需要手改 backup-profile.json；请先重选当前目录，再执行恢复。" : "If the backup repository has been moved, relink it before restoring."}</div>
    </div>` : "";
    const dialog = new Dialog({
        title: "恢复自托管备份",
        content: `<div class="b3-dialog__content">
    <div class="b3-label">
        已恢复 repo key 和自托管同步配置。
        <div class="b3-label__text">你可以直接合并到当前工作空间，也可以新建空工作空间做精确恢复。</div>
    </div>
    ${localRestoreTip}
    <div class="b3-label">
        新工作空间路径
        <div class="b3-label__text"><code class="fn__code">${workspace}</code></div>
    </div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">取消</button><div class="fn__space"></div>
    <button class="b3-button">合并到当前工作空间</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">新建空工作空间精确恢复</button>${localRestoreAction}
</div>`,
        width: "760px",
    });
    const btnsElement = dialog.element.querySelectorAll(".b3-button");
    const lockDialogActions = () => {
        btnsElement.forEach((button: HTMLButtonElement) => {
            setReposInteractable(button, true);
        });
    };
    btnsElement[0].addEventListener("click", () => {
        dialog.destroy();
    });
    btnsElement[1].addEventListener("click", () => {
        lockDialogActions();
        dialog.destroy();
        restoreIntoCurrentWorkspace(switchElement);
    });
    btnsElement[2].addEventListener("click", () => {
        lockDialogActions();
        fetchPost("/api/system/createWorkspaceDir", {path: workspace}, () => {
            dialog.destroy();
            restoreIntoNewWorkspace(workspace);
        });
    });
    if (isLocalSyncProvider() && btnsElement[3]) {
        btnsElement[3].addEventListener("click", () => {
            lockDialogActions();
            dialog.destroy();
            chooseLocalBackupDirectory(() => {
                showRestoreBackupDialog(switchElement);
            });
        });
    }
};

type SnapshotProtectionStat = {
    localHistoryRetentionDays: number,
    localHistorySize: number,
    hLocalHistorySize: string,
    localRepoSize: number,
    hLocalRepoSize: string,
    remoteRepoSize: number,
    hRemoteRepoSize: string,
    localSnapshotCount: number,
    localTagCount: number,
    localRestorePointCount: number,
    remoteSnapshotCount: number,
    remoteTagCount: number,
    remoteRestorePointCount: number,
    remoteRetentionHours: number,
    remoteRetentionDays: number,
};

const renderSnapshotProtectionStat = (stat?: SnapshotProtectionStat) => {
    if (!stat) {
        return `<div class="b3-label__text">${isChineseUI() ? "正在读取恢复点统计..." : "Loading snapshot protection stats..."}</div>`;
    }
    const localHistoryLabel = isChineseUI() ? "本地历史" : "Local history";
    const localRepoLabel = isChineseUI() ? "本地快照仓库" : "Local snapshot repo";
    const remoteRepoLabel = isChineseUI() ? "远端快照仓库" : "Remote snapshot repo";
    const restorePointLabel = isChineseUI() ? "恢复点" : "Restore points";
    const protectTagLabel = isChineseUI() ? "保护标签" : "Protection tags";
    const snapshotLabel = isChineseUI() ? "快照" : "Snapshots";
    const policyLabel = isChineseUI() ? "自动保留策略" : "Automatic retention";
    const policyText = isChineseUI() ?
        `最近 ${stat.remoteRetentionHours} 小时每小时一个，最近 ${stat.remoteRetentionDays} 天每天一个` :
        `Keep one point per hour for ${stat.remoteRetentionHours} hours and one point per day for ${stat.remoteRetentionDays} days`;
    return `<div class="b3-label b3-label--inner">
    <div>${policyLabel}</div>
    <div class="b3-label__text">${policyText}</div>
</div>
<div class="fn__flex" style="gap: 8px; flex-wrap: wrap;">
    <div class="b3-label b3-label--inner fn__flex-1">
        <div>${localHistoryLabel}</div>
        <div class="b3-label__text">${isChineseUI() ? "保留天数" : "Retention days"}：<code class="fn__code">${stat.localHistoryRetentionDays}</code></div>
        <div class="b3-label__text">${isChineseUI() ? "占用空间" : "Size"}：<code class="fn__code">${escapeHtml(stat.hLocalHistorySize || "0 B")}</code></div>
    </div>
    <div class="b3-label b3-label--inner fn__flex-1">
        <div>${localRepoLabel}</div>
        <div class="b3-label__text">${restorePointLabel}：<code class="fn__code">${stat.localRestorePointCount}</code></div>
        <div class="b3-label__text">${snapshotLabel}：<code class="fn__code">${stat.localSnapshotCount}</code>，${protectTagLabel}：<code class="fn__code">${stat.localTagCount}</code></div>
        <div class="b3-label__text">${isChineseUI() ? "占用空间" : "Size"}：<code class="fn__code">${escapeHtml(stat.hLocalRepoSize || "0 B")}</code></div>
    </div>
    <div class="b3-label b3-label--inner fn__flex-1">
        <div>${remoteRepoLabel}</div>
        <div class="b3-label__text">${restorePointLabel}：<code class="fn__code">${stat.remoteRestorePointCount}</code></div>
        <div class="b3-label__text">${snapshotLabel}：<code class="fn__code">${stat.remoteSnapshotCount}</code>，${protectTagLabel}：<code class="fn__code">${stat.remoteTagCount}</code></div>
        <div class="b3-label__text">${isChineseUI() ? "占用空间" : "Size"}：<code class="fn__code">${escapeHtml(stat.hRemoteRepoSize || "0 B")}</code></div>
    </div>
</div>`;
};

const refreshSnapshotProtectionStat = () => {
    const container = repos.element?.querySelector("#snapshotProtectionStat");
    if (!container) {
        return;
    }
    container.innerHTML = renderSnapshotProtectionStat();
    fetchPost("/api/repo/getSnapshotProtectionStat", {}, (response) => {
        if (response.code !== 0) {
            container.innerHTML = `<div class="b3-label__text">${escapeHtml(response.msg || (isChineseUI() ? "读取恢复点统计失败" : "Failed to load snapshot protection stats"))}</div>`;
            return;
        }
        container.innerHTML = renderSnapshotProtectionStat(response.data as SnapshotProtectionStat);
    });
};

const renderProvider = (provider: number) => {
    if (provider === 2) {
        return `<div class="b3-label b3-label--inner">
    ${window.sourceflow.languages.syncThirdPartyProviderS3Intro}
    <div class="fn__hr"></div>
    ${window.sourceflow.languages.syncThirdPartyProviderTip}
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Endpoint</div>
    <div class="fn__space"></div>
    <input id="endpoint" class="b3-text-field fn__block" value="${window.sourceflow.config.sync.s3.endpoint}">
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Access Key</div>
    <div class="fn__space"></div>
    <input id="accessKey" class="b3-text-field fn__block" value="${window.sourceflow.config.sync.s3.accessKey}">
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Secret Key</div>
    <div class="fn__space"></div>
    <div class="b3-form__icona fn__block">
        <input id="secretKey" type="password" class="b3-text-field b3-form__icona-input" value="${window.sourceflow.config.sync.s3.secretKey}">
        <svg class="b3-form__icona-icon" data-action="togglePassword"><use xlink:href="#iconEye"></use></svg>
    </div>
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Bucket</div>
    <div class="fn__space"></div>
    <input id="bucket" class="b3-text-field fn__block" value="${window.sourceflow.config.sync.s3.bucket}">
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Region ID</div>
    <div class="fn__space"></div>
    <input id="region" class="b3-text-field fn__block" value="${window.sourceflow.config.sync.s3.region}">
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Timeout (s)</div>
    <div class="fn__space"></div>
    <input id="timeout" class="b3-text-field fn__block" type="number" min="7" max="300" value="${window.sourceflow.config.sync.s3.timeout}">
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Addressing</div>
    <div class="fn__space"></div>
    <select class="b3-select fn__block" id="pathStyle">
        <option ${window.sourceflow.config.sync.s3.pathStyle ? "selected" : ""} value="true">Path-style</option>
        <option ${window.sourceflow.config.sync.s3.pathStyle ? "" : "selected"} value="false">Virtual-hosted-style</option>
    </select>
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">TLS Verify</div>
    <div class="fn__space"></div>
    <select class="b3-select fn__block" id="s3SkipTlsVerify">
        <option ${window.sourceflow.config.sync.s3.skipTlsVerify ? "" : "selected"} value="false">Verify</option>
        <option ${window.sourceflow.config.sync.s3.skipTlsVerify ? "selected" : ""} value="true">Skip</option>
    </select>
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Concurrent Reqs</div>
    <div class="fn__space"></div>
    <input id="s3ConcurrentReqs" class="b3-text-field fn__block" type="number" min="1" max="16" value="${window.sourceflow.config.sync.s3.concurrentReqs}">
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-1"></div>
    <button class="b3-button b3-button--outline fn__size200" data-action="purgeData">
        <svg><use xlink:href="#iconTrashcan"></use></svg>${window.sourceflow.languages.purge}
    </button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--outline fn__size200" style="position: relative">
        <input id="importData" class="b3-form__upload" type="file" data-type="s3">
        <svg><use xlink:href="#iconDownload"></use></svg>${window.sourceflow.languages.import}
    </button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--outline fn__size200" data-action="exportData" data-type="s3">
        <svg><use xlink:href="#iconUpload"></use></svg>${window.sourceflow.languages.export}
    </button>
</div>`;
    } else if (provider === 3) {
        return `<div class="b3-label b3-label--inner">
    ${window.sourceflow.languages.syncThirdPartyProviderWebDAVIntro}
    <div class="fn__hr"></div>
    ${window.sourceflow.languages.syncThirdPartyProviderTip}
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Endpoint</div>
    <div class="fn__space"></div>
    <input id="endpoint" class="b3-text-field fn__block" value="${window.sourceflow.config.sync.webdav.endpoint}">
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Username</div>
    <div class="fn__space"></div>
    <input id="username" class="b3-text-field fn__block" value="${window.sourceflow.config.sync.webdav.username}">
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Password</div>
    <div class="fn__space"></div>
    <div class="b3-form__icona fn__block">
        <input id="password" type="password" class="b3-text-field b3-form__icona-input" value="${window.sourceflow.config.sync.webdav.password}">
        <svg class="b3-form__icona-icon" data-action="togglePassword"><use xlink:href="#iconEye"></use></svg>
    </div>
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Timeout (s)</div>
    <div class="fn__space"></div>
    <input id="timeout" class="b3-text-field fn__block" type="number" min="7" max="300" value="${window.sourceflow.config.sync.webdav.timeout}">
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">TLS Verify</div>
    <div class="fn__space"></div>
    <select class="b3-select fn__block" id="webdavSkipTlsVerify">
        <option ${window.sourceflow.config.sync.webdav.skipTlsVerify ? "" : "selected"} value="false">Verify</option>
        <option ${window.sourceflow.config.sync.webdav.skipTlsVerify ? "selected" : ""} value="true">Skip</option>
    </select>
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Concurrent Reqs</div>
    <div class="fn__space"></div>
    <input id="webdavConcurrentReqs" class="b3-text-field fn__block" type="number" min="1" max="16" value="${window.sourceflow.config.sync.webdav.concurrentReqs}">
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-1"></div>
    <button class="b3-button b3-button--outline fn__size200" data-action="purgeData">
        <svg><use xlink:href="#iconTrashcan"></use></svg>${window.sourceflow.languages.purge}
    </button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--outline fn__size200" style="position: relative">
        <input id="importData" class="b3-form__upload" type="file" data-type="webdav">
        <svg><use xlink:href="#iconDownload"></use></svg>${window.sourceflow.languages.import}
    </button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--outline fn__size200" data-action="exportData" data-type="webdav">
        <svg><use xlink:href="#iconUpload"></use></svg>${window.sourceflow.languages.export}
    </button>
</div>`;
    } else if (provider === 4) {
        return `<div class="b3-label b3-label--inner">
    ${window.sourceflow.languages.syncThirdPartyProviderLocalIntro}
    <div class="b3-label__text">${isChineseUI() ? "便携模式下，位于便携根目录内的路径会相对保存；位于外部的本地目录会按绝对路径保存。" : "In portable mode, paths inside the portable root are stored relatively, while external local directories are kept as absolute paths."}</div>
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Endpoint</div>
    <div class="fn__space"></div>
    <input id="endpoint" class="b3-text-field fn__block" value="${escapeAttr(window.sourceflow.config.sync.local.endpoint)}">
    ${!isBrowser() && !isMobile() ? `<div class="fn__space"></div>
    <button data-action="chooseLocalDirectory" class="b3-button b3-button--outline fn__size200">${isChineseUI() ? "选择目录" : "Choose directory"}</button>` : ""}
</div>
<div id="localPathInfo">${renderLocalSyncPathInfo(window.sourceflow.config.sync.local.endpoint)}</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Timeout (s)</div>
    <div class="fn__space"></div>
    <input id="timeout" class="b3-text-field fn__block" type="number" min="7" max="300" value="${window.sourceflow.config.sync.local.timeout}">
</div>
<div class="b3-label b3-label--inner fn__flex">
    <div class="fn__flex-center fn__size200">Concurrent Reqs</div>
    <div class="fn__space"></div>
    <input id="localConcurrentReqs" class="b3-text-field fn__block" type="number" min="1" max="1024" value="${window.sourceflow.config.sync.local.concurrentReqs}">
</div>`;
    }
    return "";
};

const bindProviderEvent = () => {
    const importElement = repos.element.querySelector("#importData") as HTMLInputElement;
    if (importElement) {
        importElement.addEventListener("change", () => {
            const formData = new FormData();
            formData.append("file", importElement.files[0]);
            const isS3 = importElement.getAttribute("data-type") === "s3";
            fetchPost(isS3 ? "/api/sync/importSyncProviderS3" : "/api/sync/importSyncProviderWebDAV", formData, (response) => {
                if (isS3) {
                    window.sourceflow.config.sync.s3 = response.data.s3;
                } else {
                    window.sourceflow.config.sync.webdav = response.data.webdav;
                }
                repos.element.querySelector("#syncProviderPanel").innerHTML = renderProvider(window.sourceflow.config.sync.provider);
                bindProviderEvent();
                showMessage(window.sourceflow.languages.imported);
                importElement.value = "";
            });
        });
    }

    const providerPanelElement = repos.element.querySelector("#syncProviderPanel");
    providerPanelElement.querySelectorAll(".b3-text-field, .b3-select").forEach(item => {
        item.addEventListener("blur", () => {
            if (window.sourceflow.config.sync.provider === 2) {
                let timeout = parseInt((providerPanelElement.querySelector("#timeout") as HTMLInputElement).value, 10);
                if (7 > timeout) {
                    if (1 > timeout) {
                        timeout = 30;
                    } else {
                        timeout = 7;
                    }
                }
                if (300 < timeout) {
                    timeout = 300;
                }
                let concurrentReqs = parseInt((providerPanelElement.querySelector("#s3ConcurrentReqs") as HTMLInputElement).value, 10);
                if (1 > concurrentReqs) {
                    concurrentReqs = 1;
                }
                if (16 < concurrentReqs) {
                    concurrentReqs = 16;
                }
                (providerPanelElement.querySelector("#timeout") as HTMLInputElement).value = timeout.toString();
                let endpoint = (providerPanelElement.querySelector("#endpoint") as HTMLInputElement).value;
                endpoint = endpoint.trim().replace("http://http(s)://", "https://");
                endpoint = endpoint.replace("http(s)://", "https://");
                if (!endpoint.startsWith("http")) {
                    endpoint = "http://" + endpoint;
                }
                const s3 = {
                    endpoint: endpoint,
                    accessKey: (providerPanelElement.querySelector("#accessKey") as HTMLInputElement).value.trim(),
                    secretKey: (providerPanelElement.querySelector("#secretKey") as HTMLInputElement).value.trim(),
                    bucket: (providerPanelElement.querySelector("#bucket") as HTMLInputElement).value.trim(),
                    pathStyle: (providerPanelElement.querySelector("#pathStyle") as HTMLInputElement).value === "true",
                    region: (providerPanelElement.querySelector("#region") as HTMLInputElement).value.trim(),
                    skipTlsVerify: (providerPanelElement.querySelector("#s3SkipTlsVerify") as HTMLInputElement).value === "true",
                    timeout: timeout,
                    concurrentReqs: concurrentReqs,
                };
                fetchPost("/api/sync/setSyncProviderS3", {s3}, () => {
                    window.sourceflow.config.sync.s3 = s3;
                });
            } else if (window.sourceflow.config.sync.provider === 3) {
                let timeout = parseInt((providerPanelElement.querySelector("#timeout") as HTMLInputElement).value, 10);
                if (7 > timeout) {
                    timeout = 7;
                }
                if (300 < timeout) {
                    timeout = 300;
                }
                let concurrentReqs = parseInt((providerPanelElement.querySelector("#webdavConcurrentReqs") as HTMLInputElement).value, 10);
                if (1 > concurrentReqs) {
                    concurrentReqs = 1;
                }
                if (16 < concurrentReqs) {
                    concurrentReqs = 16;
                }
                (providerPanelElement.querySelector("#timeout") as HTMLInputElement).value = timeout.toString();
                let endpoint = (providerPanelElement.querySelector("#endpoint") as HTMLInputElement).value;
                endpoint = endpoint.trim().replace("http://http(s)://", "https://");
                endpoint = endpoint.replace("http(s)://", "https://");
                if (!endpoint.startsWith("http")) {
                    endpoint = "http://" + endpoint;
                }
                const webdav = {
                    endpoint: endpoint,
                    username: (providerPanelElement.querySelector("#username") as HTMLInputElement).value.trim(),
                    password: (providerPanelElement.querySelector("#password") as HTMLInputElement).value.trim(),
                    skipTlsVerify: (providerPanelElement.querySelector("#webdavSkipTlsVerify") as HTMLInputElement).value === "true",
                    timeout: timeout,
                    concurrentReqs: concurrentReqs,
                };
                fetchPost("/api/sync/setSyncProviderWebDAV", {webdav}, () => {
                    window.sourceflow.config.sync.webdav = webdav;
                });
            } else if (window.sourceflow.config.sync.provider === 4) {
                saveLocalSyncProvider(providerPanelElement);
            }
        });
    });

    const localEndpointElement = providerPanelElement.querySelector<HTMLInputElement>("#endpoint");
    localEndpointElement?.addEventListener("input", () => {
        updateLocalSyncPathInfo(providerPanelElement, localEndpointElement.value);
    });
};

export const repos = {
    element: undefined as Element,
    genHTML: () => {
        const hasRepoKey = !!window.sourceflow.config.repo.key;
        return `<div>
<div class="b3-label fn__flex config__item">
    <div class="fn__flex-1 fn__flex-center">
        ${window.sourceflow.languages.dataRepoKey}
        <div class="b3-label__text">${window.sourceflow.languages.dataRepoKeyTip1}</div>
        <div class="b3-label__text"><span class="ft__error">${window.sourceflow.languages.dataRepoKeyTip2}</span></div>
    </div>
    <div class="fn__space"></div>
    <div class="fn__size200 config__item-line fn__flex-center${hasRepoKey ? "" : " fn__none"}">
        <button class="b3-button b3-button--outline fn__block" id="reposCopyKey">
            <svg><use xlink:href="#iconCopy"></use></svg>${window.sourceflow.languages.copyKey}
        </button>
    </div>
</div>
<div class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.syncProvider}
        <div class="b3-label__text">${window.sourceflow.languages.syncProviderTip}</div>
    </div>
    <span class="fn__space"></span>
    <select id="syncProvider" class="b3-select fn__flex-center fn__size200">
        <option value="2" ${window.sourceflow.config.sync.provider === 2 ? "selected" : ""}>S3</option>
        <option value="3" ${window.sourceflow.config.sync.provider === 3 ? "selected" : ""}>WebDAV</option>
        <option class="${!["std", "docker"].includes(window.sourceflow.config.system.container) ? "fn__none" : ""}" value="4" ${window.sourceflow.config.sync.provider === 4 ? "selected" : ""}>${window.sourceflow.languages.localFileSystem}</option>
    </select>
</div>
<div id="syncProviderPanel" class="b3-label">
    ${renderProvider(window.sourceflow.config.sync.provider)}
</div>
<div id="reposActionStatus" class="b3-label__text" style="margin-top: 8px;"></div>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.openSyncTip1}
        <div class="b3-label__text">${window.sourceflow.languages.openSyncTip2}</div>
    </div>
    <span class="fn__space"></span>
    <input type="checkbox" id="reposCloudSyncSwitch"${window.sourceflow.config.sync.enabled ? " checked='checked'" : ""} class="b3-switch fn__flex-center">
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.generateConflictDoc}
        <div class="b3-label__text">${window.sourceflow.languages.generateConflictDocTip}</div>
    </div>
    <span class="fn__space"></span>
    <input type="checkbox" id="generateConflictDoc"${window.sourceflow.config.sync.generateConflictDoc ? " checked='checked'" : ""} class="b3-switch fn__flex-center">
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.syncPerception}
        <div class="b3-label__text">${window.sourceflow.languages.syncPerceptionTip}</div>
    </div>
    <span class="fn__space"></span>
    <input type="checkbox" id="syncPerception"${window.sourceflow.config.sync.perception ? " checked='checked'" : ""} class="b3-switch fn__flex-center">
</label>
<div class="b3-label">
    <div id="selfHostedSyncTriggers" class="b3-label">
        快照备份默认会在启动时、退出时、内容变更后延迟以及后台定时自动执行。
        <div class="b3-label__text">无需单独配置这些触发来源；这里只需要设置定时间隔。</div>
        <div class="b3-label__text">手动触发也会保留，可随时点击同步按钮主动执行一次快照备份。</div>
        <div class="b3-label__text">删除后可先从数据历史恢复；若误删已经进入备份流程，可再按时间点或保护标签恢复。</div>
        <div class="fn__hr"></div>
        <div class="fn__flex config__item">
            <div class="fn__flex-1">
                从恢复描述文件恢复
                <div class="b3-label__text">导入 userdata\\backup-profile.json 后，可恢复 repo key 和自托管同步配置。</div>
                <div class="b3-label__text">如果 Local File System 备份目录已经移动，不需要手改 backup-profile.json；导入后可直接重新选择当前备份目录。</div>
                <div class="b3-label__text">恢复会从远端拉取最新数据并与当前工作空间合并；若要精确替换，请在空工作空间或新便携目录中执行。</div>
            </div>
            <span class="fn__space"></span>
            <button class="b3-button b3-button--outline fn__size200" style="position: relative">
                <input id="importBackupProfile" class="b3-form__upload" type="file" accept=".json,.zip">
                <svg><use xlink:href="#iconDownload"></use></svg>导入恢复描述文件
            </button>
        </div>
    </div>
    <div class="b3-label">
        <div class="b3-label b3-label--inner">
            <div>快照备份与恢复</div>
            <div class="b3-label__text">可以直接查看本地恢复点和远端恢复点。</div>
            <div class="b3-label__text">支持按时间点恢复，也支持在高风险操作后通过保护标签恢复。</div>
            <div class="fn__flex" style="gap: 8px; flex-wrap: wrap; margin-top: 8px;">
                <button class="b3-button b3-button--outline fn__size200" id="openFileHistory">
                    <svg><use xlink:href="#iconHistory"></use></svg>打开数据历史
                </button>
                <button class="b3-button b3-button--outline fn__size200" id="openSnapshotRestore">
                    <svg><use xlink:href="#iconTime"></use></svg>按时间点恢复
                </button>
                <button class="b3-button b3-button--outline fn__size200" id="safeCleanupSnapshots">
                    <svg><use xlink:href="#iconTrashcan"></use></svg>安全清理旧恢复点
                </button>
            </div>
        </div>
        <div id="snapshotProtectionStat">${renderSnapshotProtectionStat()}</div>
    </div>
    <div id="syncIntervalItem" class="fn__flex b3-label">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.syncInterval}
            <div class="b3-label__text">${window.sourceflow.languages.syncIntervalTip}</div>
        </div>
        <span class="fn__space"></span>
        <input type="number" min="30" max="43200" id="syncInterval" class="b3-text-field fn__flex-center" value="${window.sourceflow.config.sync.interval}" >
        <span class="fn__space"></span>        
        <span class="fn__flex-center ft__on-surface">${window.sourceflow.languages.second}</span> 
    </div>
    <div class="b3-label b3-label--inner">
        <div class="fn__flex config__item">
            <div class="fn__flex-1">
                ${syncText("同步诊断", "Sync Diagnostics")}
                <div class="b3-label__text">${syncText("查看最近同步结果、启动保护状态和同步感知探测结果。", "Inspect recent sync runs, boot protection, and sync perception checks.")}</div>
            </div>
            <span class="fn__space"></span>
            <button class="b3-button b3-button--outline fn__size200" id="refreshSyncDiagnostics">
                <svg><use xlink:href="#iconRefresh"></use></svg>${syncText("刷新诊断", "Refresh diagnostics")}
            </button>
        </div>
        <div id="syncDiagnostics" class="b3-label__text" style="margin-top: 8px;"></div>
    </div>
</div>
</div>`;
    },
    bindEvent: () => {
        repos.element.querySelector("#reposCopyKey")?.addEventListener("click", () => {
            showMessage(window.sourceflow.languages.copied);
            writeText(window.sourceflow.config.repo.key);
        });
        bindProviderEvent();
        refreshSnapshotProtectionStat();
        bindSyncDiagnosticsWindowListener();
        queueSyncDiagnosticsRefresh(0);
        const switchElement = repos.element.querySelector("#reposCloudSyncSwitch") as HTMLInputElement;
        switchElement.addEventListener("change", () => {
            if (switchElement.checked) {
                switchElement.checked = false;
                setReposActionStatus(isChineseUI() ? "正在启用快照备份..." : "Enabling snapshot backup...");
                setReposInteractable(switchElement, true);
                ensureSelfHostedSyncReady(() => {
                    fetchPost("/api/sync/setSyncEnable", {enabled: true}, () => {
                        switchElement.checked = true;
                        window.sourceflow.config.sync.enabled = true;
                        processSync();
                        queueSyncDiagnosticsRefresh();
                        setReposActionStatus(isChineseUI() ? "快照备份已启用" : "Snapshot backup enabled", "success", 4000);
                        setReposInteractable(switchElement, false);
                    });
                });
                return;
            }
            setReposInteractable(switchElement, true);
            fetchPost("/api/sync/setSyncEnable", {enabled: switchElement.checked}, () => {
                window.sourceflow.config.sync.enabled = switchElement.checked;
                processSync();
                queueSyncDiagnosticsRefresh();
                setReposActionStatus(isChineseUI() ? "快照备份已关闭" : "Snapshot backup disabled", "info", 3000);
                setReposInteractable(switchElement, false);
            });
        });
        repos.element.querySelector("#openFileHistory")?.addEventListener("click", () => {
            openHistory(window.sourceflow.ws.app, "doc");
        });
        repos.element.querySelector("#openSnapshotRestore")?.addEventListener("click", () => {
            openHistory(window.sourceflow.ws.app, "repo");
        });
        repos.element.querySelector("#safeCleanupSnapshots")?.addEventListener("click", () => {
            const cleanupButton = repos.element.querySelector("#safeCleanupSnapshots") as HTMLButtonElement;
            const hours = window.sourceflow.config.repo.remoteRetentionRecentHours || 24;
            const days = window.sourceflow.config.repo.remoteRetentionRecentDays || 7;
            confirmDialog("♻️ 安全清理旧恢复点", `<div class="b3-typography">会按当前策略保留最近 ${hours} 小时的每小时恢复点、最近 ${days} 天的每日恢复点，并清理已过期的本地/远端恢复点。</div>`, () => {
                setReposActionStatus(isChineseUI() ? "正在整理本地和远端恢复点..." : "Maintaining local and remote restore points...");
                setReposInteractable(cleanupButton, true);
                fetchPost("/api/repo/maintainSnapshotProtection", {}, (response) => {
                    if (response.code !== 0) {
                        setReposActionStatus(response.msg || (isChineseUI() ? "恢复点整理失败" : "Restore point maintenance failed"), "error", 7000);
                        showMessage(response.msg);
                        setReposInteractable(cleanupButton, false);
                        return;
                    }
                    showMessage("已完成安全清理");
                    setReposActionStatus(isChineseUI() ? "恢复点整理完成" : "Restore point maintenance completed", "success", 5000);
                    refreshSnapshotProtectionStat();
                    setReposInteractable(cleanupButton, false);
                });
            }, undefined, true);
        });
        const syncIntervalElement = repos.element.querySelector("#syncInterval") as HTMLInputElement;
        syncIntervalElement.addEventListener("change", () => {
            let interval = parseInt(syncIntervalElement.value);
            if (30 > interval) {
                interval = 30;
            }
            if (43200 < interval) {
                interval = 43200;
            }
            syncIntervalElement.value = interval.toString();
            fetchPost("/api/sync/setSyncInterval", {interval: interval}, () => {
                window.sourceflow.config.sync.interval = interval;
                processSync();
                queueSyncDiagnosticsRefresh();
            });
        });
        const switchConflictElement = repos.element.querySelector("#generateConflictDoc") as HTMLInputElement;
        switchConflictElement.addEventListener("change", () => {
            fetchPost("/api/sync/setSyncGenerateConflictDoc", {enabled: switchConflictElement.checked}, () => {
                window.sourceflow.config.sync.generateConflictDoc = switchConflictElement.checked;
                queueSyncDiagnosticsRefresh();
            });
        });
        const switchPerceptionElement = repos.element.querySelector("#syncPerception") as HTMLInputElement;
        switchPerceptionElement.addEventListener("change", () => {
            fetchPost("/api/sync/setSyncPerception", {enabled: switchPerceptionElement.checked}, () => {
                window.sourceflow.config.sync.perception = switchPerceptionElement.checked;
                setReposActionStatus(switchPerceptionElement.checked ? syncText("同步感知已启用", "Sync perception enabled") : syncText("同步感知已关闭", "Sync perception disabled"), "success", 3000);
                queueSyncDiagnosticsRefresh();
            });
        });
        repos.element.querySelector("#refreshSyncDiagnostics")?.addEventListener("click", () => {
            queueSyncDiagnosticsRefresh(0);
        });
        const syncProviderElement = repos.element.querySelector("#syncProvider") as HTMLSelectElement;
        const importBackupProfileElement = repos.element.querySelector("#importBackupProfile") as HTMLInputElement;
        importBackupProfileElement?.addEventListener("change", () => {
            if (!importBackupProfileElement.files?.length) {
                return;
            }
            const formData = new FormData();
            formData.append("file", importBackupProfileElement.files[0]);
            setReposActionStatus(isChineseUI() ? "正在导入恢复描述文件..." : "Importing backup profile...");
            setReposInteractable(importBackupProfileElement, true);
            fetchPost("/api/sync/importSyncBackupProfile", formData, (response) => {
                setReposInteractable(importBackupProfileElement, false);
                importBackupProfileElement.value = "";
                window.sourceflow.config.repo.key = response.data.key;
                window.sourceflow.config.sync.provider = response.data.provider;
                window.sourceflow.config.sync.cloudName = response.data.cloudName;
                window.sourceflow.config.sync.enabled = response.data.enabled;
                window.sourceflow.config.sync.mode = 1;
                if (response.data.s3) {
                    window.sourceflow.config.sync.s3 = response.data.s3;
                }
                if (response.data.webdav) {
                    window.sourceflow.config.sync.webdav = response.data.webdav;
                }
                if (response.data.local) {
                    window.sourceflow.config.sync.local = response.data.local;
                }
                if (response.data.provider) {
                    refreshSnapshotProtectionStat();
                }
                switchElement.checked = false;
                syncProviderElement.value = response.data.provider.toString();
                repos.element.querySelector("#syncProviderPanel").innerHTML = renderProvider(window.sourceflow.config.sync.provider);
                bindProviderEvent();
                processSync();
                queueSyncDiagnosticsRefresh();
                showMessage("已导入恢复描述文件");
                setReposActionStatus(isChineseUI() ? "恢复描述文件已导入，请选择恢复方式" : "Backup profile imported, choose a restore mode", "success", 6000);
                showRestoreBackupDialog(switchElement);
            });
        });
        syncProviderElement.addEventListener("change", () => {
            const previousProvider = window.sourceflow.config.sync.provider;
            fetchPost("/api/sync/setSyncProvider", {provider: parseInt(syncProviderElement.value, 10)}, (response) => {
                if (response.code !== 0) {
                    showMessage(response.msg);
                    syncProviderElement.value = previousProvider.toString();
                    window.sourceflow.config.sync.provider = previousProvider;
                } else {
                    window.sourceflow.config.sync.provider = parseInt(syncProviderElement.value, 10);
                    window.sourceflow.config.sync.mode = 1;
                    refreshSnapshotProtectionStat();
                }
                repos.element.querySelector("#syncProviderPanel").innerHTML = renderProvider(window.sourceflow.config.sync.provider);
                bindProviderEvent();
                processSync();
                queueSyncDiagnosticsRefresh();
            });
        });
        repos.element.firstElementChild.addEventListener("click", (event) => {
            let target = event.target as HTMLElement;
            while (target && target !== repos.element) {
                const action = target.getAttribute("data-action");
                if (action === "togglePassword") {
                    const isEye = target.firstElementChild.getAttribute("xlink:href") === "#iconEye";
                    target.firstElementChild.setAttribute("xlink:href", isEye ? "#iconEyeoff" : "#iconEye");
                    target.previousElementSibling.setAttribute("type", isEye ? "text" : "password");
                    break;
                } else if (action === "exportData") {
                    fetchPost(target.getAttribute("data-type") === "s3" ? "/api/sync/exportSyncProviderS3" : "/api/sync/exportSyncProviderWebDAV", {}, response => {
                        openByMobile(response.data.zip);
                    });
                    break;
                } else if (action === "purgeData") {
                    confirmDialog("♻️ " + window.sourceflow.languages.cloudStoragePurge, `<div class="b3-typography">${window.sourceflow.languages.cloudStoragePurgeConfirm}</div>`, () => {
                        fetchPost("/api/repo/purgeCloudRepo");
                    });
                    break;
                } else if (action === "chooseLocalDirectory") {
                    /// #if !BROWSER
                    const endpointElement = repos.element.querySelector<HTMLInputElement>("#syncProviderPanel #endpoint");
                    const providerPanelElement = repos.element.querySelector("#syncProviderPanel");
                    if (!endpointElement || !providerPanelElement) {
                        break;
                    }
                    const defaultPath = resolveLocalSyncEndpoint(endpointElement.value) || (window.sourceflow.config.system.isPortable ? getPortableRootDir() : originalPath().dirname(window.sourceflow.config.system.workspaceDir));
                    ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
                        cmd: "showOpenDialog",
                        defaultPath,
                        properties: ["createDirectory", "openDirectory"],
                    }).then((result) => {
                        if (result.canceled || !result.filePaths?.length) {
                            return;
                        }
                        const selectedPath = result.filePaths[0];
                        endpointElement.value = selectedPath;
                        updateLocalSyncPathInfo(providerPanelElement, selectedPath);
                        saveLocalSyncProvider(providerPanelElement);
                    });
                    /// #endif
                    break;
                } else if (action === "openLocalDirectory") {
                    const directoryPath = target.getAttribute("data-path");
                    if (directoryPath) {
                        useShell("openPath", directoryPath);
                    }
                    break;
                } else if (action === "bootSyncPrimary") {
                    const primaryAction = (target.getAttribute("data-primary-action") || "retry") as "retry" | "settings";
                    const primaryTarget = (target.getAttribute("data-primary-target") || "repos") as "repos" | "about";
                    if (primaryAction === "settings") {
                        openBootSyncGuardSetting(primaryTarget);
                    } else {
                        performBootSyncFromDiagnostics();
                    }
                    break;
                } else if (action === "bootSyncOffline") {
                    continueOfflineFromDiagnostics();
                    break;
                } else if (action === "bootSyncHistory") {
                    openHistory(window.sourceflow.ws.app, "repo");
                    break;
                }
                target = target.parentElement;
            }
        });
    },
};
