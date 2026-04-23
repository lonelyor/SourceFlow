import {Constants} from "../constants";
import {Menus} from "../menus";
import {Model} from "../layout/Model";
import "../assets/scss/base.scss";
import {deferBlockPopover} from "../block/popover";
import {addScript, addScriptSync} from "../protyle/util/addScript";
import {genUUID} from "../util/genID";
import {fetchGet, fetchPost} from "../util/fetch";
import {addBaseURL, redirectToCheckAuth, setNoteBook} from "../util/pathName";
import {
    processSync,
    progressBackgroundTask,
    progressLoading,
    progressStatus,
    reloadSync,
    setDefRefCount,
    setRefDynamicText,
    setTitle,
    transactionError
} from "../dialog/processSystem";
import {initMessage} from "../dialog/message";
import {getLocalStorage} from "../protyle/util/compatibility";
import {init} from "./init";
import {reloadPlugin} from "../plugin/loader";
import {hideAllElements} from "../protyle/ui/hideElements";
import {updateControlAlt} from "../protyle/util/hotKey";
import {updateAppearance} from "../config/util/updateAppearance";
import {renderSnippet} from "../config/util/snippets";
import {isStartupFuseEnabled, loadStartupSafeModeState, notifyStartupSafeMode, scheduleStartupGuardReady} from "../stability/startupGuard";
import {setBrandedAppState} from "../util/runtimeBrand";

const reloadEmojiConf = () => import("../emoji").then(({reloadEmoji}) => reloadEmoji());
const loadAllLayoutModule = () => import("../layout/getAll");
const loadEditorUtilModule = () => import("../editor/util");
const loadWorkbenchReminderModule = () => import("../workbench/reminders");

const withAllTabs = (callback: (tabs: ReturnType<typeof import("../layout/getAll")["getAllTabs"]>) => void) => {
    void loadAllLayoutModule().then(({getAllTabs}) => {
        callback(getAllTabs());
    });
};

const openFileByID = (app: App, id: string, action: TProtyleAction[]) => {
    void loadEditorUtilModule().then(({openFileById}) => {
        openFileById({app, id, action});
    });
};

class App {
    public plugins: import("../plugin").Plugin[] = [];
    public appId: string;

    constructor() {
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
                            case "setRefDynamicText":
                                setRefDynamicText(data.data);
                                break;
                            case "reloadPlugin":
                                reloadPlugin(this, data.data);
                                break;
                            case "reloadEmojiConf":
                                void reloadEmojiConf();
                                break;
                            case "reloaddoc":
                                reloadSync(this, {upsertRootIDs: [data.data], removeRootIDs: []}, false, false, true);
                                break;
                            case "syncMergeResult":
                                reloadSync(this, data.data);
                                break;
                            case "readonly":
                                window.sourceflow.config.editor.readOnly = data.data;
                                hideAllElements(["util"]);
                                break;
                            case "setConf":
                                window.sourceflow.config = data.data;
                                updateControlAlt();
                                break;
                            case "progress":
                                progressLoading(data);
                                break;
                            case "setLocalStorageVal":
                                window.sourceflow.storage[data.data.key] = data.data.val;
                                break;
                            case "rename":
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
                    init(this);
                    if (!isStartupFuseEnabled("reminders")) {
                        void loadWorkbenchReminderModule().then(({initWorkbenchReminderSync}) => {
                            initWorkbenchReminderSync(this);
                        });
                    }
                    setTitle("", true);
                    initMessage();
                    notifyStartupSafeMode();
                    scheduleStartupGuardReady();
                });
            });
        });
        setNoteBook();
        deferBlockPopover(this);
    }
}

new App();
