import {Constants} from "./constants";
import {Menus} from "./menus";
import {Model} from "./layout/Model";
import {onGetConfig} from "./boot/onGetConfig";
import {deferBlockPopover} from "./block/popover";
import {addScript, addScriptSync} from "./protyle/util/addScript";
import {genUUID} from "./util/genID";
import {fetchGet, fetchPost} from "./util/fetch";
import {addBaseURL, getIdFromSYProtocol, isSYProtocol, redirectToCheckAuth, setNoteBook} from "./util/pathName";
import {registerServiceWorker} from "./util/serviceWorker";
import {
    deferBootSync,
    downloadProgress,
    processSync,
    progressBackgroundTask,
    progressLoading,
    progressStatus,
    reloadSync,
    setDefRefCount,
    setRefDynamicText,
    setTitle,
    transactionError
} from "./dialog/processSystem";
import {initMessage, showMessage} from "./dialog/message";
import {getLocalStorage, isChromeBrowser, isInMobileApp} from "./protyle/util/compatibility";
import {getSearch, isBrowser} from "./util/functions";
import {checkPublishServiceClosed} from "./util/processMessage";
import {hideAllElements} from "./protyle/ui/hideElements";
import {reloadPlugin} from "./plugin/loader";
import {isStartupFuseEnabled, loadStartupSafeModeState, notifyStartupSafeMode, scheduleStartupGuardReady} from "./stability/startupGuard";
import "./assets/scss/base.scss";
/// #if BROWSER
import {setLocalShorthandCount} from "./util/noRelyPCFunction";
/// #endif
import {updateControlAlt} from "./protyle/util/hotKey";
import {updateAppearance} from "./config/util/updateAppearance";
import {renderSnippet} from "./config/util/snippets";
import {clearSearchRequestCache} from "./search/cache";
import {setBrandedAppState} from "./util/runtimeBrand";

const reloadEmojiConf = () => import("./emoji").then(({reloadEmoji}) => reloadEmoji());
const loadAllLayoutModule = () => import("./layout/getAll");
const loadTabUtilModule = () => import("./layout/tabUtil");
const loadEditorUtilModule = () => import("./editor/util");
const loadWorkbenchReminderModule = () => import("./workbench/reminders");

const withAllTabs = (callback: (tabs: ReturnType<typeof import("./layout/getAll")["getAllTabs"]>) => void) => {
    void loadAllLayoutModule().then(({getAllTabs}) => {
        callback(getAllTabs());
    });
};

const withAllModels = (callback: (models: ReturnType<typeof import("./layout/getAll")["getAllModels"]>) => void) => {
    void loadAllLayoutModule().then(({getAllModels}) => {
        callback(getAllModels());
    });
};

const reloadTagDock = () => {
    void loadTabUtilModule().then(({getDockByType}) => {
        const tag = getDockByType("tag")?.data?.tag as { update?: () => void } | undefined;
        if (typeof tag?.update === "function") {
            tag.update();
        }
    });
};

const openFileByID = (app: App, id: string, action: TProtyleAction[], zoomIn?: boolean) => {
    void loadEditorUtilModule().then(({openFileById}) => {
        openFileById({app, id, action, zoomIn});
    });
};

export class App {
    public plugins: import("./plugin").Plugin[] = [];
    public appId: string;

    constructor() {
        if (checkPublishServiceClosed()) {
            return;
        }
        registerServiceWorker(`${Constants.SERVICE_WORKER_PATH}?v=${Constants.SOURCEFLOW_VERSION}`);
        addBaseURL();

        this.appId = Constants.SOURCEFLOW_APPID;
        setBrandedAppState({
            zIndex: 10,
            transactions: [],
            reqIds: {},
            backStack: [],
            layout: {},
            dialogs: [],
            blockPanels: [],
            closedTabs: [],
            ctrlIsPressed: false,
            altIsPressed: false,
            ws: new Model({
                app: this,
                id: genUUID(),
                type: "main",
                msgCallback: (data) => {
                    this.plugins.forEach((plugin) => {
                        plugin.eventBus.emit("ws-main", data);
                    });
                    if (data) {
                        switch (data.cmd) {
                            case "logoutAuth":
                                redirectToCheckAuth();
                                break;
                            case "setAppearance":
                                updateAppearance(data.data);
                                break;
                            case "setSnippet":
                                window.sourceflow.config.snippet = data.data;
                                renderSnippet();
                                break;
                            case "setDefRefCount":
                                setDefRefCount(data.data);
                                break;
                            case "reloadTag":
                                reloadTagDock();
                                break;
                            /// #if BROWSER
                            case "setLocalShorthandCount":
                                setLocalShorthandCount();
                                break;
                            /// #endif
                            case "setRefDynamicText":
                                setRefDynamicText(data.data);
                                break;
                            case "reloadPlugin":
                                reloadPlugin(this, data.data);
                                break;
                            case "reloadEmojiConf":
                                void reloadEmojiConf();
                                break;
                            case "syncMergeResult":
                                clearSearchRequestCache();
                                reloadSync(this, data.data);
                                break;
                            case "reloaddoc":
                                clearSearchRequestCache();
                                reloadSync(this, {upsertRootIDs: [data.data], removeRootIDs: []}, false, false, true);
                                break;
                            case "readonly":
                                window.sourceflow.config.editor.readOnly = data.data;
                                hideAllElements(["util"]);
                                break;
                            case "setConf":
                                window.sourceflow.config = data.data;
                                updateControlAlt();
                                break;
                            case "setPublish":
                                window.sourceflow.config.publish = data.data;
                                if (!window.sourceflow.config.publish.enable) {
                                    withAllModels((models) => {
                                        models.files.forEach(item => {
                                            item.element.classList.remove("file-tree__publish-access--active");
                                            item.element.querySelectorAll(".b3-list-item__icon").forEach(iconItem => {
                                                iconItem.classList.remove("fn__none");
                                                iconItem.nextElementSibling.classList.add("fn__none");
                                            });
                                        });
                                    });
                                }
                                break;
                            case "progress":
                                progressLoading(data);
                                break;
                            case "setLocalStorageVal":
                                window.sourceflow.storage[data.data.key] = data.data.val;
                                break;
                            case "rename":
                                clearSearchRequestCache();
                                withAllTabs((tabs) => {
                                    tabs.forEach((tab) => {
                                        if (tab.headElement) {
                                            const initTab = tab.headElement.getAttribute("data-initdata");
                                            if (initTab) {
                                                const initTabData = JSON.parse(initTab);
                                                if (initTabData.instance === "Editor" && initTabData.rootId === data.data.id) {
                                                    tab.updateTitle(data.data.title);
                                                }
                                            }
                                        }
                                    });
                                });
                                break;
                            case "closeBox":
                            case "removeBox":
                                clearSearchRequestCache();
                                withAllTabs((tabs) => {
                                    tabs.forEach((tab) => {
                                        if (tab.headElement) {
                                            const initTab = tab.headElement.getAttribute("data-initdata");
                                            if (initTab) {
                                                const initTabData = JSON.parse(initTab);
                                                if (initTabData.instance === "Editor" && data.data.box === initTabData.notebookId) {
                                                    tab.parent.removeTab(tab.id);
                                                }
                                            }
                                        }
                                    });
                                });
                                break;
                            case "removeDoc":
                                clearSearchRequestCache();
                                withAllTabs((tabs) => {
                                    tabs.forEach((tab) => {
                                        if (tab.headElement) {
                                            const initTab = tab.headElement.getAttribute("data-initdata");
                                            if (initTab) {
                                                const initTabData = JSON.parse(initTab);
                                                if (initTabData.instance === "Editor" && data.data.ids.includes(initTabData.rootId)) {
                                                    tab.parent.removeTab(tab.id);
                                                }
                                            }
                                        }
                                    });
                                });
                                break;
                            case "statusbar":
                                progressStatus(data);
                                break;
                            case "downloadProgress":
                                downloadProgress(data.data);
                                break;
                            case "txerr":
                                transactionError();
                                break;
                            case "syncing":
                                processSync(data, this.plugins);
                                break;
                            case "backgroundtask":
                                progressBackgroundTask(data.data.tasks);
                                break;
                            case "refreshtheme":
                                if ((window.sourceflow.config.appearance.mode === 1 && window.sourceflow.config.appearance.themeDark !== "midnight") || (window.sourceflow.config.appearance.mode === 0 && window.sourceflow.config.appearance.themeLight !== "daylight")) {
                                    (document.getElementById("themeStyle") as HTMLLinkElement).href = data.data.theme;
                                } else {
                                    (document.getElementById("themeDefaultStyle") as HTMLLinkElement).href = data.data.theme;
                                }
                                break;
                            case "openFileById":
                                openFileByID(this, data.data.id, [Constants.CB_GET_FOCUS]);
                                break;
                            case "exit":
                                if (isBrowser() && !isInMobileApp()) {
                                    window.location.href = "about:blank";
                                }
                        }
                    }
                }
            }),
        });

        fetchPost("/api/system/getConf", {}, async (response) => {
            addScriptSync(`${Constants.PROTYLE_CDN}/js/lute/lute.min.js?v=${Constants.SOURCEFLOW_VERSION}`, "protyleLuteScript");
            addScript(`${Constants.PROTYLE_CDN}/js/protyle-html.js?v=${Constants.SOURCEFLOW_VERSION}`, "protyleWcHtmlScript");
            window.sourceflow.config = response.data.conf;
            updateControlAlt();
            window.sourceflow.isPublish = response.data.isPublish;
            getLocalStorage(async () => {
                await loadStartupSafeModeState();
                fetchGet(`/appearance/langs/${window.sourceflow.config.appearance.lang}.json?v=${Constants.SOURCEFLOW_VERSION}`, (lauguages: IObject) => {
                    window.sourceflow.languages = lauguages;
                    window.sourceflow.menus = new Menus(this);
                    window.sourceflow.user = null;
                    const afterInit = () => {
                        onGetConfig(response.data.start, this);
                        if (!isStartupFuseEnabled("reminders")) {
                            void loadWorkbenchReminderModule().then(({initWorkbenchReminderSync}) => {
                                initWorkbenchReminderSync(this);
                            });
                        }
                        setTitle("", true);
                        initMessage();
                        notifyStartupSafeMode();
                        scheduleStartupGuardReady();
                        deferBootSync();
                        /// #if BROWSER && !MOBILE
                        if (!isInMobileApp() && !window.sourceflow.config.readonly && !window.sourceflow.isPublish && !isChromeBrowser()) {
                            showMessage(window.sourceflow.languages.useChrome, 0, "error");
                        }
                        /// #endif
                    };
                    afterInit();
                });
            });
        });
        setNoteBook();
        deferBlockPopover(this);
    }
}

const sourceflowApp = new App();

window.openFileByURL = (openURL) => {
    if (openURL && isSYProtocol(openURL)) {
        const isZoomIn = getSearch("focus", openURL) === "1";
        openFileByID(
            sourceflowApp,
            getIdFromSYProtocol(openURL),
            isZoomIn ? [Constants.CB_GET_ALL, Constants.CB_GET_FOCUS] : [Constants.CB_GET_FOCUS, Constants.CB_GET_CONTEXT, Constants.CB_GET_ROOTSCROLL],
            isZoomIn
        );
        return true;
    }
    return false;
};

/// #if BROWSER
window.showKeyboardToolbar = () => {
    // 防止 Pad 端报错
};
/// #endif
