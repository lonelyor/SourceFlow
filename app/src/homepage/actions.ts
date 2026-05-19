import {App} from "../index";
import {Constants} from "../constants";
import {showMessage} from "../dialog/message";
import {newFile} from "../util/newFile";
import {mountHelp, newNotebook} from "../util/mount";
import {openHistory} from "../history/history";
import {openByMobile} from "../protyle/util/compatibility";
import {homepageText} from "./constants";
import {hasHomepageTemplateSource} from "./loader";
import {getHomepageState, normalizeTemplatePath, resetHomepageToDefault, saveHomepageState} from "./state";
import {IHomepageState} from "./types";
/// #if MOBILE
import {popSearch} from "../mobile/menu/search";
import {getRecentDocs as openMobileRecentDocs} from "../mobile/menu/getRecentDocs";
import {openMobileFileById} from "../mobile/editor";
/// #else
import {openSearch} from "../search/spread";
import {openRecentDocs as openDesktopRecentDocs} from "../business/openRecentDocs";
import {openBy, openFileById} from "../editor/util";
/// #endif
/// #if !BROWSER
import {shell} from "electron";
/// #endif

const loadWorkbenchDialogModule = () => import("../workbench/dialog");
const loadCommandPanelModule = () => import("../boot/globalEvent/command/panel");
const loadConfigModule = () => import("../config");

const normalizeExternalURL = (url: string) => /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;

export const openHomepageExternal = (url: string) => {
    const text = `${url || ""}`.trim();
    if (!text) {
        return;
    }
    const link = normalizeExternalURL(text);
    /// #if !BROWSER
    shell.openExternal(link).catch((error) => {
        showMessage(error instanceof Error ? error.message : `${error}`, 5000, "error");
    });
    /// #else
    openByMobile(link);
    /// #endif
};

export const openTemplateFolder = (templatePath: string) => {
    /// #if !BROWSER
    const relativeDataPath = templatePath.replace(/^\/data\/?/, "");
    const absolute = `${window.sourceflow.config.system.dataDir.replace(/[\\\/]+$/, "").replace(/\\/g, "/")}/${relativeDataPath}`;
    openBy(`file://${absolute}`, "folder");
    /// #else
    showMessage(templatePath);
    /// #endif
};

export const openHomepageSource = (app: App, state: IHomepageState) => {
    if (state.sourceType === "note" && state.noteId) {
        /// #if MOBILE
        openMobileFileById(app, state.noteId, [Constants.CB_GET_SCROLL]);
        /// #else
        void openFileById({app, id: state.noteId, action: [Constants.CB_GET_SCROLL]});
        /// #endif
        return;
    }
    openTemplateFolder(state.templatePath);
};

const openHomepageSearch = (app: App) => {
    /// #if MOBILE
    popSearch(app);
    /// #else
    openSearch({
        app,
        hotkey: Constants.DIALOG_GLOBALSEARCH,
    });
    /// #endif
};

const openHomepageRecentDocs = (app: App) => {
    /// #if MOBILE
    openMobileRecentDocs(app);
    /// #else
    openDesktopRecentDocs();
    /// #endif
};

const openHomepageWorkbench = async (app: App) => {
    const {openWorkbenchDialog} = await loadWorkbenchDialogModule();
    openWorkbenchDialog(app);
};

const openHomepageCommandPanel = async (app: App) => {
    const {commandPanel} = await loadCommandPanelModule();
    commandPanel(app);
};

const openHomepageSettings = async (app: App) => {
    const {openSetting} = await loadConfigModule();
    openSetting(app);
};

const openHomepageBackupSetting = async (app: App) => {
    const {openSetting} = await loadConfigModule();
    /// #if MOBILE
    openSetting(app);
    /// #else
    const dialog = openSetting(app);
    dialog?.element.querySelector('.b3-tab-bar [data-name="repos"]')?.dispatchEvent(new CustomEvent("click"));
    /// #endif
};

export const runHomepageBuiltinAction = async (app: App, action: string, refresh: () => Promise<void>, state: IHomepageState) => {
    switch (`${action || ""}`.trim()) {
        case "open-homepage-source":
        case "edit-note-source":
            openHomepageSource(app, state);
            break;
        case "search":
            openHomepageSearch(app);
            break;
        case "workbench":
            await openHomepageWorkbench(app);
            break;
        case "command":
            await openHomepageCommandPanel(app);
            break;
        case "config":
            await openHomepageSettings(app);
            break;
        case "backup":
            await openHomepageBackupSetting(app);
            break;
        case "recent":
            openHomepageRecentDocs(app);
            break;
        case "history":
            openHistory(app);
            break;
        case "new-file":
            if (!window.sourceflow.config.readonly) {
                newFile({app, useSavePath: true});
            }
            break;
        case "new-notebook":
            if (!window.sourceflow.config.readonly) {
                newNotebook();
            }
            break;
        case "help":
            mountHelp();
            break;
        case "open-template-folder":
            openTemplateFolder(state.templatePath);
            break;
        case "switch-template": {
            const nextPath = window.prompt(homepageText("请输入主页模板目录，或单个 html/md 文件路径", "Enter the homepage template folder path, or a single html/md file path"), state.templatePath);
            if (!nextPath) {
                break;
            }
            const normalized = normalizeTemplatePath(nextPath);
            if (!await hasHomepageTemplateSource(normalized)) {
                showMessage(homepageText("主页入口不存在，请确认目录里有 index.html / index.md，或直接指定单个 html/md 文件", "Homepage source is missing. Make sure the folder contains index.html / index.md, or point to a single html/md file"), 5000, "error");
                break;
            }
            state.templatePath = normalized;
            saveHomepageState(state);
            await refresh();
            break;
        }
        case "refresh":
            await refresh();
            break;
        case "reset-default-homepage": {
            const nextState = resetHomepageToDefault();
            state.sourceType = nextState.sourceType;
            state.noteId = nextState.noteId;
            state.templatePath = nextState.templatePath;
            await refresh();
            break;
        }
        case "open-current-homepage-source": {
            const currentState = getHomepageState();
            openHomepageSource(app, currentState);
            break;
        }
    }
};
