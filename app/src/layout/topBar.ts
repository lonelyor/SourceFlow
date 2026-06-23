import {getWorkspaceName} from "../util/noRelyPCFunction";
import {
    isInMobileApp,
    setStorageVal,
    updateHotkeyTip
} from "../protyle/util/compatibility";
import {goBack, goForward} from "../util/backForward";
import {hasClosestByAttribute} from "../protyle/util/hasClosest";
import {workspaceMenu} from "../menus/workspace";
import {MenuItem} from "../menus/Menu";
import {setMode} from "../util/assets";
import {App} from "../index";
/// #if !BROWSER
import {ipcRenderer, webFrame} from "electron";
/// #endif
import {Constants} from "../constants";
import {isWindow} from "../util/functions";
import {fetchPost} from "../util/fetch";
import {exportLayout} from "./util";
import {toggleFullscreenWithZenModeAlias} from "../editor/zenMode";

const loadProcessSystemModule = () => import("../dialog/processSystem");
const loadSyncGuideModule = () => import("../sync/syncGuide");
const loadSearchSpreadModule = () => import("../search/spread");
const loadTopBarMenuModule = () => import("../plugin/openTopBarMenu");
const loadDayjsModule = () => import("dayjs");
const loadHistoryModule = () => import("../history/history");
const loadBootSyncGuardModule = () => import("../sync/bootSyncGuard");
const loadMessageModule = () => import("../dialog/message");

const continueBootSyncOfflineFromTopBar = () => {
    fetchPost("/api/sync/setSyncEnable", {enabled: false}, (response) => {
        void loadMessageModule().then(({showMessage}) => {
            if (response.code !== 0) {
                showMessage(response.msg || "Failed to pause sync", 6000, "error");
                return;
            }
            window.sourceflow.config.sync.enabled = false;
            deferProcessSyncStatus();
            showMessage(window.sourceflow.config.lang === "zh_CN" ? "已暂停同步，现在可以离线继续编辑" : "Sync paused, you can continue editing offline now", 5000);
        });
    });
};

const performBootSyncRecoveryFromTopBar = () => {
    fetchPost("/api/sync/performBootSync", {}, (response) => {
        void Promise.all([
            loadProcessSystemModule(),
            loadMessageModule(),
        ]).then(([{bootSync, processSync}, {showMessage}]) => {
            if (response.code === 0) {
                processSync();
                bootSync();
                showMessage(window.sourceflow.config.lang === "zh_CN" ? "启动同步恢复成功" : "Startup sync recovered successfully", 4000);
                return;
            }
            bootSync();
        });
    });
};

const showBootSyncRecoveryMenu = (app: App, anchor: HTMLElement, guard: {
    summary?: string;
    detail?: string;
    primaryAction?: "retry" | "settings";
    primaryLabel?: string;
    primaryTarget?: "repos" | "about";
    reason?: string;
}) => {
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.element.setAttribute("data-name", "bootSyncGuard");
    window.sourceflow.menus.menu.append(new MenuItem({
        type: "empty",
        label: `<div class="b3-label" style="padding: 4px 0;max-width: 360px;">
    <div>${guard.summary || ""}</div>
    ${guard.detail ? `<div class="b3-label__text">${guard.detail}</div>` : ""}
</div>`
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({type: "separator"}).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        label: guard.primaryLabel || window.sourceflow.languages.syncNow,
        icon: guard.primaryAction === "settings" ? "iconSettings" : "iconRefresh",
        click: () => {
            if (guard.primaryAction === "settings") {
                void loadBootSyncGuardModule().then(({openBootSyncSettingTarget}) => {
                    openBootSyncSettingTarget(guard.primaryTarget || "repos", guard.reason);
                });
                return;
            }
            performBootSyncRecoveryFromTopBar();
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        label: window.sourceflow.config.lang === "zh_CN" ? "离线继续编辑" : "Continue offline",
        icon: "iconCloudOff",
        click: () => {
            continueBootSyncOfflineFromTopBar();
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        label: window.sourceflow.languages.dataHistory,
        icon: "iconHistory",
        click: () => {
            void loadHistoryModule().then(({openHistory}) => {
                openHistory(app, "repo");
            });
        }
    }).element);
    if (guard.primaryAction !== "settings") {
        window.sourceflow.menus.menu.append(new MenuItem({
            label: window.sourceflow.config.lang === "zh_CN" ? "同步设置" : "Sync settings",
            icon: "iconSettings",
            click: () => {
                void loadBootSyncGuardModule().then(({openBootSyncSettingTarget}) => {
                    openBootSyncSettingTarget("repos", guard.reason);
                });
            }
        }).element);
    }
    const rect = anchor.getBoundingClientRect();
    window.sourceflow.menus.menu.popup({x: rect.right, y: rect.bottom, isLeft: true});
};

const deferProcessSyncStatus = () => {
    const runner = () => {
        void loadProcessSystemModule().then(({processSync}) => {
            processSync();
        });
    };
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => runner(), {timeout: 1200});
        return;
    }
    window.setTimeout(runner, 0);
};

const loadCommandPanel = () => import("../boot/globalEvent/command/panel");
const loadCaptureDialog = () => import("../capture/dialog");

const getToolbarItemElement = (toolbarElement: HTMLElement, target: HTMLElement, id: string) => {
    const currentItem = hasClosestByAttribute(target, "id", id, true) as HTMLElement;
    if (currentItem) {
        return currentItem;
    }
    return toolbarElement.querySelector(`#${id}`) as HTMLElement;
};

export const initBar = (app: App) => {
    const toolbarElement = document.getElementById("toolbar");
    toolbarElement.innerHTML = `
<div id="barWorkspace" class="ariaLabel toolbar__item toolbar__item--active" aria-label="${window.sourceflow.languages.mainMenu} ${updateHotkeyTip(window.sourceflow.config.keymap.general.mainMenu.custom)}">
    <span class="toolbar__text">${getWorkspaceName()}</span>
    <svg class="toolbar__svg"><use xlink:href="#iconDown"></use></svg>
</div>
<div id="barSync" class="ariaLabel toolbar__item${window.sourceflow.config.readonly ? " fn__none" : ""}">
    <svg><use xlink:href="#iconCloudSucc"></use></svg>
</div>
<button id="barBack" class="ariaLabel toolbar__item toolbar__item--disabled" aria-label="${window.sourceflow.languages.goBack} ${updateHotkeyTip(window.sourceflow.config.keymap.general.goBack.custom)}">
    <svg><use xlink:href="#iconBack"></use></svg>
</button>
<button id="barForward" class="ariaLabel toolbar__item toolbar__item--disabled" aria-label="${window.sourceflow.languages.goForward} ${updateHotkeyTip(window.sourceflow.config.keymap.general.goForward.custom)}">
    <svg><use xlink:href="#iconForward"></use></svg>
</button>
<div class="fn__flex-1 fn__ellipsis" id="drag"><span class="fn__none">开发版，使用前请进行备份 Development version, please backup before use</span></div>
<div id="barPlugins" data-static-hide="true" class="toolbar__item ariaLabel fn__none" aria-label="${window.sourceflow.languages.plugin}">
    <svg><use xlink:href="#iconPlugin"></use></svg>
</div>
<div id="barCapture" data-static-hide="true" class="toolbar__item ariaLabel fn__none" aria-label="${window.sourceflow.languages.urlImport}">
    <svg><use xlink:href="#iconUpload"></use></svg>
</div>
<div id="barCommand" data-static-hide="true" class="toolbar__item ariaLabel fn__none" aria-label="${window.sourceflow.languages.commandPanel} ${updateHotkeyTip(window.sourceflow.config.keymap.general.commandPanel.custom)}">
    <svg><use xlink:href="#iconKeymap"></use></svg>
</div>
<div id="barSearch" data-static-hide="true" class="toolbar__item ariaLabel fn__none" aria-label="${window.sourceflow.languages.globalSearch} ${updateHotkeyTip(window.sourceflow.config.keymap.general.globalSearch.custom)}">
    <svg><use xlink:href="#iconSearch"></use></svg>
</div>
<div id="barZenMode" class="toolbar__item ariaLabel fn__none" aria-label="${window.sourceflow.languages.zMode}">
    <svg><use xlink:href="#iconFocus"></use></svg>
</div>
<div id="barZoom" data-static-hide="true" class="toolbar__item ariaLabel fn__none" aria-label="${window.sourceflow.languages.zoom}">
    <svg><use xlink:href="#iconZoom${window.sourceflow.storage[Constants.LOCAL_ZOOM] > 1 ? "In" : "Out"}"></use></svg>
</div>
<div id="barMode" data-static-hide="true" class="toolbar__item ariaLabel fn__none" aria-label="${window.sourceflow.languages.appearanceMode}">
    <svg><use xlink:href="#icon${window.sourceflow.config.appearance.modeOS ? "Mode" : (window.sourceflow.config.appearance.mode === 0 ? "Light" : "Dark")}"></use></svg>
</div>
<div id="barExit" class="ft__error toolbar__item ariaLabel${isInMobileApp() ? "" : " fn__none"}" aria-label="${window.sourceflow.languages.safeQuit}">
    <svg><use xlink:href="#iconQuit"></use></svg>
</div>
<div id="barMore" data-static-hide="true" class="toolbar__item ariaLabel fn__none" aria-label="${window.sourceflow.languages.more}">
    <svg><use xlink:href="#iconMore"></use></svg>
</div>
<div class="fn__flex" id="windowControls"></div>`;
    deferProcessSyncStatus();
    toolbarElement.addEventListener("click", (event: MouseEvent) => {
        let target = event.target as HTMLElement;
        if (typeof event.detail === "string") {
            target = toolbarElement.querySelector("#" + event.detail);
        }
        while (!target.classList.contains("toolbar")) {
            const targetId = typeof event.detail === "string" ? event.detail : target.id;
            if (targetId === "barBack") {
                goBack(app);
                event.stopPropagation();
                break;
            } else if (targetId === "barMore") {
                if (!window.sourceflow.menus.menu.element.classList.contains("fn__none") &&
                    window.sourceflow.menus.menu.element.getAttribute("data-name") === Constants.MENU_BAR_MORE) {
                    window.sourceflow.menus.menu.remove();
                    return;
                }
                window.sourceflow.menus.menu.remove();
                window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_BAR_MORE);
                (target.getAttribute("data-hideids") || "").split(",").forEach((itemId) => {
                    const hideElement = toolbarElement.querySelector("#" + itemId);
                    if (!hideElement) {
                        return;
                    }
                    const useElement = hideElement.querySelector("use");
                    const menuOptions: IMenu = {
                        label: hideElement.getAttribute("aria-label"),
                        icon: useElement ? useElement.getAttribute("xlink:href").substring(1) : undefined,
                        click: () => {
                            if (itemId.startsWith("plugin")) {
                                hideElement.dispatchEvent(new CustomEvent("click"));
                            } else {
                                toolbarElement.dispatchEvent(new CustomEvent("click", {detail: itemId}));
                            }
                        }
                    };
                    if (!useElement && hideElement.querySelector("svg")) {
                        const svgElement = hideElement.querySelector("svg").cloneNode(true) as HTMLElement;
                        svgElement.classList.add("b3-menu__icon");
                        menuOptions.iconHTML = svgElement.outerHTML;
                    }
                    window.sourceflow.menus.menu.append(new MenuItem(menuOptions).element);
                });
                const rect = target.getBoundingClientRect();
                window.sourceflow.menus.menu.popup({x: rect.right, y: rect.bottom, isLeft: true});
                event.stopPropagation();
                break;
            } else if (targetId === "barForward") {
                goForward(app);
                event.stopPropagation();
                break;
            } else if (targetId === "barSync") {
                fetchPost("/api/sync/getSyncDiagnostics", {}, (response) => {
                    const guard = response.data?.bootSyncGuard;
                    if (response.code === 0 && response.data?.bootSyncFailed && guard) {
                        showBootSyncRecoveryMenu(app, target as HTMLElement, guard);
                        return;
                    }
                    void loadSyncGuideModule().then(({syncGuide}) => {
                        syncGuide(app);
                    });
                });
                event.stopPropagation();
                break;
            } else if (targetId === "barWorkspace") {
                const rect = getToolbarItemElement(toolbarElement, target, "barWorkspace").getBoundingClientRect();
                workspaceMenu(app, rect);
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (targetId === "barExit") {
                event.stopPropagation();
                exportLayout({
                    errorExit: true,
                    cb: () => {
                        void loadProcessSystemModule().then(({exitSourceFlow}) => {
                            exitSourceFlow();
                        });
                    },
                });
                break;
            } else if (targetId === "barMode") {
                if (!window.sourceflow.menus.menu.element.classList.contains("fn__none") &&
                    window.sourceflow.menus.menu.element.getAttribute("data-name") === Constants.MENU_BAR_MODE) {
                    window.sourceflow.menus.menu.remove();
                    return;
                }
                window.sourceflow.menus.menu.remove();
                window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_BAR_MODE);
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "themeLight",
                    label: window.sourceflow.languages.themeLight,
                    icon: "iconLight",
                    current: window.sourceflow.config.appearance.mode === 0 && !window.sourceflow.config.appearance.modeOS,
                    click: () => {
                        setMode(0);
                    }
                }).element);
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "themeDark",
                    label: window.sourceflow.languages.themeDark,
                    current: window.sourceflow.config.appearance.mode === 1 && !window.sourceflow.config.appearance.modeOS,
                    icon: "iconDark",
                    click: () => {
                        setMode(1);
                    }
                }).element);
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "themeOS",
                    label: window.sourceflow.languages.themeOS,
                    current: window.sourceflow.config.appearance.modeOS,
                    icon: "iconMode",
                    click: () => {
                        setMode(2);
                    }
                }).element);
                let rect = target.getBoundingClientRect();
                if (rect.width === 0) {
                    rect = toolbarElement.querySelector("#barMore").getBoundingClientRect();
                }
                window.sourceflow.menus.menu.popup({x: rect.right, y: rect.bottom, isLeft: true});
                event.stopPropagation();
                break;
            } else if (targetId === "barSearch") {
                void loadSearchSpreadModule().then(({openSearch}) => {
                    openSearch({
                        app,
                        hotkey: Constants.DIALOG_GLOBALSEARCH
                    });
                });
                event.stopPropagation();
                break;
            } else if (targetId === "barZenMode") {
                toggleFullscreenWithZenModeAlias();
                event.stopPropagation();
                break;
            } else if (targetId === "barPlugins") {
                void loadTopBarMenuModule().then(({openTopBarMenu}) => {
                    openTopBarMenu(app, target);
                });
                event.stopPropagation();
                break;
            } else if (targetId === "barCapture") {
                void loadCaptureDialog().then(({openCaptureDialog}) => {
                    openCaptureDialog(app, "url");
                });
                event.stopPropagation();
                break;
            } else if (targetId === "barCommand") {
                void loadCommandPanel().then(({commandPanel}) => {
                    commandPanel(app);
                });
                event.stopPropagation();
                break;
            } else if (targetId === "barZoom") {
                if (!window.sourceflow.menus.menu.element.classList.contains("fn__none") &&
                    window.sourceflow.menus.menu.element.getAttribute("data-name") === Constants.MENU_BAR_ZOOM) {
                    window.sourceflow.menus.menu.remove();
                    return;
                }
                window.sourceflow.menus.menu.remove();
                window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_BAR_ZOOM);
                window.sourceflow.menus.menu.append(new MenuItem({
                    label: window.sourceflow.languages.zoomIn,
                    icon: "iconZoomIn",
                    accelerator: "⌘=",
                    click: () => {
                        setZoom("zoomIn");
                    }
                }).element);
                window.sourceflow.menus.menu.append(new MenuItem({
                    label: window.sourceflow.languages.zoomOut,
                    accelerator: "⌘-",
                    icon: "iconZoomOut",
                    click: () => {
                        setZoom("zoomOut");
                    }
                }).element);
                window.sourceflow.menus.menu.append(new MenuItem({
                    label: window.sourceflow.languages.reset,
                    accelerator: "⌘0",
                    click: () => {
                        setZoom("restore");
                    }
                }).element);
                let rect = target.getBoundingClientRect();
                if (rect.width === 0) {
                    rect = toolbarElement.querySelector("#barMore").getBoundingClientRect();
                }
                window.sourceflow.menus.menu.popup({x: rect.right, y: rect.bottom, isLeft: true});
                event.stopPropagation();
                break;
            }
            target = target.parentElement;
        }
    });
    const barSyncElement = toolbarElement.querySelector("#barSync");
    barSyncElement.addEventListener("mouseenter", (event) => {
        event.stopPropagation();
        event.preventDefault();
        fetchPost("/api/sync/getSyncDiagnostics", {}, (response) => {
            void loadDayjsModule().then((dayjs) => {
                let html = "";
                if (!window.sourceflow.config.sync.enabled) {
                    html = response.data.stat;
                } else {
                    html = window.sourceflow.languages._kernel[82].replace("%s", dayjs(response.data.synced).format("YYYY-MM-DD HH:mm")) + "<br>";
                    html += "&emsp;" + response.data.stat;
                    if (response.data.bootSyncFailed && response.data.bootSyncGuard?.summary) {
                        html += `<br>${response.data.bootSyncGuard.summary}`;
                        if (response.data.bootSyncGuard?.detail) {
                            html += `<br>&emsp;${response.data.bootSyncGuard.detail}`;
                        }
                    }
                    if (response.data.kernels.length > 0) {
                        html += "<br>";
                        html += window.sourceflow.languages.currentKernel + "<br>";
                        html += "&emsp;" + response.data.kernel + "/" + window.sourceflow.config.system.kernelVersion + " (" + window.sourceflow.config.system.os + "/" + window.sourceflow.config.system.name + ")<br>";
                        html += window.sourceflow.languages.otherOnlineKernels + "<br>";
                        response.data.kernels.forEach((item: {
                            os: string;
                            ver: string;
                            hostname: string;
                            id: string;
                        }) => {
                            html += `&emsp;${item.id}/${item.ver} (${item.os}/${item.hostname}) <br>`;
                        });
                    }
                }
                barSyncElement.setAttribute("aria-label", html);
            });
        });
    });
    barSyncElement.setAttribute("aria-label", window.sourceflow.config.sync.stat || (window.sourceflow.languages.syncNow + " " + updateHotkeyTip(window.sourceflow.config.keymap.general.syncNow.custom)));
};

export const setZoom = (type: "zoomIn" | "zoomOut" | "restore") => {
    /// #if !BROWSER
    let zoom = 1;
    if (type === "zoomIn") {
        Constants.SIZE_ZOOM.find((item, index) => {
            if (item.zoom === window.sourceflow.storage[Constants.LOCAL_ZOOM]) {
                zoom = Constants.SIZE_ZOOM[index + 1]?.zoom || 3;
                return true;
            }
        });
    } else if (type === "zoomOut") {
        Constants.SIZE_ZOOM.find((item, index) => {
            if (item.zoom === window.sourceflow.storage[Constants.LOCAL_ZOOM]) {
                zoom = Constants.SIZE_ZOOM[index - 1]?.zoom || 0.67;
                return true;
            }
        });
    }

    webFrame.setZoomFactor(zoom);
    ipcRenderer.send(Constants.SOURCEFLOW_CMD, {
        cmd: "setTrafficLightPosition",
        zoom,
        position: Constants.SIZE_ZOOM.find((item) => item.zoom === zoom).position
    });
    window.sourceflow.storage[Constants.LOCAL_ZOOM] = zoom;
    setStorageVal(Constants.LOCAL_ZOOM, zoom);
    if (!isWindow()) {
        const barZoomElement = document.getElementById("barZoom");
        if (zoom === 1) {
            barZoomElement.classList.add("fn__none");
        } else {
            if (zoom > 1) {
                barZoomElement.querySelector("use").setAttribute("xlink:href", "#iconZoomIn");
            } else {
                barZoomElement.querySelector("use").setAttribute("xlink:href", "#iconZoomOut");
            }
            barZoomElement.classList.remove("fn__none");
        }
    }
    /// #endif
};
