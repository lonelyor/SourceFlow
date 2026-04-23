import type {App} from "../index";
import {showMessage} from "../dialog/message";
import {fetchPost} from "../util/fetch";
import {escapeAttr, escapeHtml} from "../util/escape";
import {openBootSyncSettingTarget, TBootSyncGuardInfo} from "./bootSyncGuard";

const loadProcessSystemModule = () => import("../dialog/processSystem");
const loadHistoryModule = () => import("../history/history");

let bootSyncBannerElement: HTMLElement | null = null;
let bootSyncBannerApp: App | null = null;
let bootSyncBannerRefreshTimer = 0;
let bootSyncBannerBusy = false;
let bootSyncBannerListenerBound = false;

const bannerText = (zh: string, en: string) => {
    return window.sourceflow.config.lang === "zh_CN" ? zh : en;
};

const getBootSyncBannerAnchor = () => {
    return document.getElementById("toolbar") || document.querySelector("body > .toolbar");
};

const setBootSyncBannerBusy = (busy: boolean) => {
    bootSyncBannerBusy = busy;
    if (!bootSyncBannerElement) {
        return;
    }
    bootSyncBannerElement.classList.toggle("boot-sync-banner--busy", busy);
    bootSyncBannerElement.querySelectorAll("button").forEach((item) => {
        const button = item as HTMLButtonElement;
        if (busy) {
            button.setAttribute("disabled", "disabled");
        } else {
            button.removeAttribute("disabled");
        }
    });
};

const ensureBootSyncBannerElement = () => {
    if (bootSyncBannerElement?.isConnected) {
        return bootSyncBannerElement;
    }
    const anchor = getBootSyncBannerAnchor() as HTMLElement;
    if (!anchor || !anchor.parentElement) {
        return null;
    }
    let element = document.getElementById("bootSyncBanner") as HTMLElement;
    if (!element) {
        element = document.createElement("div");
        element.id = "bootSyncBanner";
        element.className = "boot-sync-banner fn__none";
        element.setAttribute("role", "status");
        element.setAttribute("aria-live", "polite");
        anchor.insertAdjacentElement("afterend", element);
    }
    if (!element.getAttribute("data-bound")) {
        element.setAttribute("data-bound", "true");
        element.addEventListener("click", (event: MouseEvent) => {
            const target = (event.target as HTMLElement).closest("button[data-action]") as HTMLButtonElement;
            if (!target || bootSyncBannerBusy) {
                return;
            }
            const action = target.getAttribute("data-action");
            if (action === "primary") {
                const primaryAction = target.getAttribute("data-primary-action");
                const primaryTarget = (target.getAttribute("data-primary-target") || "repos") as "repos" | "about";
                const reason = target.getAttribute("data-reason") || undefined;
                if (primaryAction === "settings") {
                    openBootSyncSettingTarget(primaryTarget, reason);
                    return;
                }
                setBootSyncBannerBusy(true);
                fetchPost("/api/sync/performBootSync", {}, (response) => {
                    void loadProcessSystemModule().then(({bootSync, processSync}) => {
                        setBootSyncBannerBusy(false);
                        if (response.code === 0) {
                            processSync();
                            bootSync();
                            showMessage(bannerText("启动同步恢复成功", "Startup sync recovered successfully"), 4000);
                        } else {
                            showMessage(response.msg || bannerText("启动同步恢复失败", "Startup sync recovery failed"), 6000, "error");
                            bootSync();
                        }
                        queueBootSyncBannerRefresh(0);
                    });
                });
                return;
            }
            if (action === "offline") {
                setBootSyncBannerBusy(true);
                fetchPost("/api/sync/setSyncEnable", {enabled: false}, (response) => {
                    void loadProcessSystemModule().then(({processSync}) => {
                        setBootSyncBannerBusy(false);
                        if (response.code !== 0) {
                            showMessage(response.msg || bannerText("暂停同步失败，请稍后重试", "Failed to pause sync, please try again later"), 6000, "error");
                            return;
                        }
                        window.sourceflow.config.sync.enabled = false;
                        processSync();
                        showMessage(bannerText("已暂停同步，现在可以离线继续编辑", "Sync paused, you can continue editing offline now"), 5000);
                        queueBootSyncBannerRefresh(0);
                    });
                });
                return;
            }
            if (action === "history" && bootSyncBannerApp) {
                void loadHistoryModule().then(({openHistory}) => {
                    openHistory(bootSyncBannerApp, "repo");
                });
            }
        });
    }
    bootSyncBannerElement = element;
    return element;
};

const hideBootSyncBanner = () => {
    const element = ensureBootSyncBannerElement();
    if (!element) {
        return;
    }
    element.classList.add("fn__none");
    element.innerHTML = "";
};

const renderBootSyncBanner = (guard: TBootSyncGuardInfo) => {
    const element = ensureBootSyncBannerElement();
    if (!element || !guard.summary) {
        hideBootSyncBanner();
        return;
    }
    const primaryAction = guard.primaryAction || "retry";
    const primaryTarget = guard.primaryTarget || "repos";
    const primaryLabel = guard.primaryLabel || bannerText("立即同步", "Sync now");
    element.innerHTML = `<div class="boot-sync-banner__main">
    <div class="boot-sync-banner__pill">
        <svg><use xlink:href="#iconCloudOff"></use></svg>${bannerText("同步保护中", "Sync protection")}
    </div>
    <div class="boot-sync-banner__summary">${escapeHtml(guard.summary)}</div>
    ${guard.detail ? `<div class="boot-sync-banner__detail">${escapeHtml(guard.detail)}</div>` : ""}
</div>
<div class="boot-sync-banner__actions">
    <button class="b3-button b3-button--text" data-action="primary" data-primary-action="${escapeAttr(primaryAction)}" data-primary-target="${escapeAttr(primaryTarget)}" data-reason="${escapeAttr(guard.reason || "")}">
        <svg><use xlink:href="${primaryAction === "settings" ? "#iconSettings" : "#iconRefresh"}"></use></svg>${escapeHtml(primaryLabel)}
    </button>
    <button class="b3-button b3-button--outline" data-action="offline">
        <svg><use xlink:href="#iconCloudOff"></use></svg>${bannerText("离线继续编辑", "Continue offline")}
    </button>
    <button class="b3-button b3-button--outline" data-action="history">
        <svg><use xlink:href="#iconHistory"></use></svg>${escapeHtml(window.sourceflow.languages.dataHistory)}
    </button>
</div>`;
    element.classList.remove("fn__none");
};

const refreshBootSyncBanner = () => {
    const element = ensureBootSyncBannerElement();
    if (!element) {
        return;
    }
    fetchPost("/api/sync/getSyncDiagnostics", {}, (response) => {
        if (response.code !== 0 || !response.data?.bootSyncFailed || !response.data?.bootSyncGuard?.summary) {
            hideBootSyncBanner();
            return;
        }
        renderBootSyncBanner(response.data.bootSyncGuard);
    });
};

export const queueBootSyncBannerRefresh = (delay = 120) => {
    window.clearTimeout(bootSyncBannerRefreshTimer);
    bootSyncBannerRefreshTimer = window.setTimeout(() => {
        refreshBootSyncBanner();
    }, delay);
};

export const initBootSyncBanner = (app: App) => {
    bootSyncBannerApp = app;
    ensureBootSyncBannerElement();
    if (!bootSyncBannerListenerBound) {
        window.addEventListener("sourceflow-sync-updated", () => {
            queueBootSyncBannerRefresh(160);
        });
        bootSyncBannerListenerBound = true;
    }
    queueBootSyncBannerRefresh(0);
};
