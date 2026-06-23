import {newDailyNote} from "../../../util/mount";
import {Editor} from "../../../editor";
/// #if MOBILE
import {openMobileFileById} from "../../../mobile/editor";
/// #else
import {openBacklink, openGraph, openOutline, selectOpenTab, toggleDockBar} from "../../../layout/dock/util";
import {isWindow} from "../../../util/functions";
import {goBack, goForward} from "../../../util/backForward";
import {getAllTabs, getAllWnds} from "../../../layout/getAll";
import {getInstanceById} from "../../../layout/util";
import {
    closeTabByType,
    copyTab,
    getActiveTab,
    getDockByType,
    resizeTabs,
    switchTabByIndex
} from "../../../layout/tabUtil";
import {Tab} from "../../../layout/Tab";
/// #endif
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif
import {App} from "../../../index";
import {Constants} from "../../../constants";
import {setReadOnly} from "../../../config/util/setReadOnly";
import {lockScreen} from "../../../dialog/processSystem";
import {newFile} from "../../../util/newFile";
import {Wnd} from "../../../layout/Wnd";
import {openFile, openFileById} from "../../../editor/util";
import {fetchPost} from "../../../util/fetch";
import {setStorageVal} from "../../../protyle/util/compatibility";
import {workspaceMenu} from "../../../menus/workspace";
import {runAssistantFeature} from "../../../assistant/runtime";

const loadCaptureDialogModule = () => import("../../../capture/dialog");
const loadWorkbenchDialogModule = () => import("../../../workbench/dialog");
const loadAssistantAIDockModule = () => import("../../../assistant/ai/AIDock");
const loadAssistantSkillModule = () => import("../../../assistant/skills/execute");
const loadHistoryModule = () => import("../../../history/history");
const loadCardModule = () => import("../../../card/openCard");
const loadSyncGuideModule = () => import("../../../sync/syncGuide");
const loadSearchSpreadModule = () => import("../../../search/spread");
const loadSearchUtilModule = () => import("../../../search/util");
const loadConfigModule = () => import("../../../config");
const loadRecentDocsModule = () => import("../../../business/openRecentDocs");
const loadTabMenuModule = () => import("../../../menus/tab");
const loadWindowModule = () => import("../../../window/openNewWindow");
const loadMobileDockModule = () => import("../../../mobile/dock/util");
const loadMobileMenuModule = () => import("../../../mobile/menu");
const loadMobileSearchModule = () => import("../../../mobile/menu/search");
const loadMobileRecentDocsModule = () => import("../../../mobile/menu/getRecentDocs");

const runCaptureDialog = (app: App, initialTab?: "url", presetName?: string, draft?: Record<string, unknown>) => {
    void loadCaptureDialogModule().then(({openCaptureDialog}) => {
        openCaptureDialog(app, initialTab, presetName, draft as never);
    });
};

const runWorkbenchDialog = (app: App, initialTab?: "inbox" | "library" | "task" | "calendar" | "project" | "review", dashboardName?: string, initialQuery?: string, viewTemplateName?: string) => {
    void loadWorkbenchDialogModule().then(({openWorkbenchDialog}) => {
        openWorkbenchDialog(app, initialTab, dashboardName, initialQuery, viewTemplateName);
    });
};

const runWorkbenchDraft = (app: App, kind: "report" | "review" | "dashboard", initialTab?: "inbox" | "library" | "task" | "calendar" | "project" | "review", dashboardName?: string) => {
    void loadWorkbenchDialogModule().then(({openWorkbenchDraft}) => {
        openWorkbenchDraft(app, kind, initialTab, dashboardName);
    });
};

const runWorkbenchCurrentMeta = (defaultType?: "doc" | "note" | "url" | "task" | "event" | "project" | "attachment") => {
    void loadWorkbenchDialogModule().then(({openWorkbenchCurrentMeta}) => {
        openWorkbenchCurrentMeta(defaultType);
    });
};

const runWorkbenchCurrentBlockMeta = (defaultType?: "doc" | "note" | "url" | "task" | "event" | "project" | "attachment") => {
    void loadWorkbenchDialogModule().then(({openWorkbenchCurrentBlockMeta}) => {
        openWorkbenchCurrentBlockMeta(defaultType);
    });
};

const runWorkbenchSavedViews = (app: App) => {
    void loadWorkbenchDialogModule().then(({openWorkbenchSavedViews}) => {
        openWorkbenchSavedViews(app);
    });
};

const runOpenCurrentWorkbenchView = (app: App) => {
    void loadWorkbenchDialogModule().then(({openCurrentWorkbenchView}) => {
        openCurrentWorkbenchView(app);
    });
};

const runBindCurrentWorkbenchView = () => {
    void loadWorkbenchDialogModule().then(({bindCurrentWorkbenchView}) => {
        bindCurrentWorkbenchView();
    });
};

const runInsertCurrentWorkbenchViewEmbed = () => {
    void loadWorkbenchDialogModule().then(({insertCurrentWorkbenchViewEmbed}) => {
        insertCurrentWorkbenchViewEmbed();
    });
};

const runClearCurrentWorkbenchView = () => {
    void loadWorkbenchDialogModule().then(({clearCurrentWorkbenchView}) => {
        clearCurrentWorkbenchView();
    });
};

const runWorkbenchViewNote = (app: App, templateName?: string) => {
    void loadWorkbenchDialogModule().then(({openWorkbenchViewNote}) => {
        openWorkbenchViewNote(app, templateName);
    });
};

const runWorkbenchAssistant = (app: App, mode: "summary" | "plan") => {
    void loadWorkbenchDialogModule().then(({openWorkbenchAssistant}) => {
        openWorkbenchAssistant(app, mode);
    });
};

const runOpenAssistantAI = (message = "", includeCurrentNote = true, append = false, pinCurrentNote = false, clearTarget = false) => {
    runAssistantFeature("command:assistant-ai", loadAssistantAIDockModule, ({openAssistantAIDock}) => {
        openAssistantAIDock({
            message,
            includeCurrentNote,
            append,
            pinCurrentNote,
            clearTarget,
        });
    });
};

const runAssistantSkillById = (skillId: string) => {
    runAssistantFeature(`command:${skillId}`, loadAssistantSkillModule, ({runAssistantSkill}) => {
        runAssistantSkill({skillId: skillId as never});
    });
};

const runAssistantInbox = () => {
    runAssistantFeature("command:assistant-inbox", () => import("../../../assistant/inbox/store"), ({openAssistantInbox}) => {
        openAssistantInbox();
    });
};

const runAssistantCurrentBlock = () => {
    runOpenAssistantAI("请先调用 get-current-block，围绕当前块或当前选中文本工作。必要时再调用 get-current-note、get-note-outline 或 get-note-backlinks 补充上下文，然后给出精确结论。", true);
};

const runAssistantCurrentBlockContext = () => {
    runOpenAssistantAI("请先调用 get-current-block-context，分析当前块的父块、前后块、直接子块和结构上下文。必要时再调用 get-block-references，判断它与其他块的连接关系，然后给出精确建议。", true);
};

const runAssistantCurrentBlockReferences = () => {
    runOpenAssistantAI("请先调用 get-block-references，分析当前块的引用文本、被引用情况和相关块摘要。必要时再结合 get-current-block-context 解释这些引用关系在当前笔记中的作用。", true);
};

const runAssistantCurrentNoteBacklinks = () => {
    runOpenAssistantAI("请先调用 get-note-backlinks，分析当前笔记与已有笔记之间的引用关系、提及关系和知识连接。必要时再调用 read-note 读取关键笔记，然后给出结构化总结。", true);
};

const runAssistantCurrentNoteOutline = () => {
    runOpenAssistantAI("请先调用 get-note-outline，分析当前笔记的大纲结构、层级组织和可优化之处；必要时再结合 get-current-block 或 get-current-note 给出更细的建议。", true);
};

const runAssistantCurrentNoteHistory = () => {
    runOpenAssistantAI("请先调用 list-note-history，查看当前笔记的历史版本和变更时间点。必要时再结合 get-note-outline 或 get-note-backlinks，帮助我判断内容演进和恢复建议。", true);
};

const runAssistantRestorePoints = () => {
    runOpenAssistantAI("请先调用 list-restore-points，检查当前可用的本地和远端恢复点、保护标签和快照保留情况，并给出最稳妥的恢复建议。", true);
};

const runAssistantCurrentNoteAssets = () => {
    runOpenAssistantAI("请先调用 list-note-assets，检查当前笔记的附件、图片和资源文件。对文本型附件请继续调用 read-note-asset-file 直接读取内容；对图片或二进制附件，请根据文件元信息说明其用途、格式和后续处理建议。不要使用 OCR。", true);
};

const runAssistantCreateChildNoteCurrentNote = () => {
    runOpenAssistantAI("请先阅读当前笔记，判断是否需要拆分出一个新的子文档。如果适合，请先给出子文档标题和建议结构，再按需调用 create-child-note 创建当前笔记下的子文档。", true);
};

const runAssistantContinueAfterCurrentBlock = () => {
    runOpenAssistantAI("请先调用 get-current-block-context，围绕当前块理解上下文；如果适合补充、续写或插入后续内容，请直接生成完整正文，并调用 insert-after-block 把内容插入到当前块之后。不要只给计划；请把正文放在 markdown、content 或 text 字段中。", true);
};

const runWorkbenchViewTemplate = (app: App, templateName: string) => {
    void loadWorkbenchDialogModule().then(({openWorkbenchViewTemplate}) => {
        openWorkbenchViewTemplate(app, templateName);
    });
};

const runWorkbenchOpenBoundView = (app: App, id: string) => {
    void loadWorkbenchDialogModule().then(({openWorkbenchBoundViewByID}) => {
        openWorkbenchBoundViewByID(app, id);
    });
};

const runOpenHistory = (app: App, type?: "doc" | "repo") => {
    void loadHistoryModule().then(({openHistory}) => {
        openHistory(app, type);
    });
};

const runOpenCard = (app: App) => {
    void loadCardModule().then(({openCard}) => {
        openCard(app);
    });
};

const runSyncGuide = (app: App) => {
    void loadSyncGuideModule().then(({syncGuide}) => {
        syncGuide(app);
    });
};

const runOpenSearch = (app: App, key: string) => {
    void loadSearchSpreadModule().then(({openSearch}) => {
        openSearch({
            app,
            hotkey: Constants.DIALOG_GLOBALSEARCH,
            key,
        });
    });
};

const runOpenGlobalSearch = (app: App, key: string, replace: boolean) => {
    void loadSearchUtilModule().then(({openGlobalSearch}) => {
        openGlobalSearch(app, key, replace);
    });
};

const runOpenSetting = (app: App) => {
    void loadConfigModule().then(({openSetting}) => {
        openSetting(app);
    });
};

const runOpenRecentDocs = () => {
    void loadRecentDocsModule().then(({openRecentDocs}) => {
        openRecentDocs();
    });
};

const runUnsplitWnd = (layout: any, rootLayout: any, closeOther = false) => {
    void loadTabMenuModule().then(({unsplitWnd}) => {
        unsplitWnd(layout, rootLayout, closeOther);
    });
};

const runOpenNewWindow = (tab: import("../../../layout/Tab").Tab) => {
    void loadWindowModule().then(({openNewWindow}) => {
        openNewWindow(tab);
    });
};

const runMobileOpenDock = (type: string) => {
    void loadMobileDockModule().then(({openDock}) => {
        openDock(type);
    });
};

const runMobilePopMenu = () => {
    void loadMobileMenuModule().then(({popMenu}) => {
        popMenu();
    });
};

const runMobilePopSearch = (app: App, searchData?: Config.IUILayoutTabSearchConfig) => {
    void loadMobileSearchModule().then(({popSearch}) => {
        popSearch(app, searchData);
    });
};

const runMobileRecentDocs = (app: App) => {
    void loadMobileRecentDocsModule().then(({getRecentDocs}) => {
        getRecentDocs(app);
    });
};

export const globalCommand = (command: string, app: App) => {
    if (command.startsWith("workbenchDashboard:")) {
        runWorkbenchDialog(app, undefined, decodeURIComponent(command.replace("workbenchDashboard:", "")));
        return true;
    }
    if (command.startsWith("workbenchDraftDashboardPreset:")) {
        runWorkbenchDraft(app, "dashboard", undefined, decodeURIComponent(command.replace("workbenchDraftDashboardPreset:", "")));
        return true;
    }
    if (command.startsWith("workbenchViewTemplate:")) {
        runWorkbenchViewTemplate(app, decodeURIComponent(command.replace("workbenchViewTemplate:", "")));
        return true;
    }
    if (command.startsWith("workbenchCreateViewNote:")) {
        runWorkbenchViewNote(app, decodeURIComponent(command.replace("workbenchCreateViewNote:", "")));
        return true;
    }
    if (command.startsWith("workbenchQuery:")) {
        runWorkbenchDialog(app, undefined, undefined, decodeURIComponent(command.replace("workbenchQuery:", "")));
        return true;
    }
    if (command.startsWith("globalSearchText:")) {
        const key = decodeURIComponent(command.replace("globalSearchText:", ""));
        /// #if MOBILE
        runMobilePopSearch(app, {k: key, page: 1} as Config.IUILayoutTabSearchConfig);
        /// #else
        runOpenSearch(app, key);
        /// #endif
        return true;
    }
    if (command.startsWith("captureDraft:")) {
        const payload = decodeURIComponent(command.replace("captureDraft:", ""));
        const text = payload.replace(/^url:/i, "").trim();
        const url = /^https?:\/\//i.test(text) ? text : "";
        runCaptureDialog(app, "url", undefined, {
            url,
        });
        return true;
    }
    if (command.startsWith("workbenchItem:")) {
        const id = decodeURIComponent(command.replace("workbenchItem:", ""));
        /// #if MOBILE
        openMobileFileById(app, id, [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]);
        /// #else
        openFileById({app, id, action: [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]});
        /// #endif
        return true;
    }
    if (command.startsWith("workbenchOpenBoundView:")) {
        runWorkbenchOpenBoundView(app, decodeURIComponent(command.replace("workbenchOpenBoundView:", "")));
        return true;
    }
    /// #if MOBILE
    switch (command) {
        case "workbench":
            runWorkbenchDialog(app);
            return true;
        case "workbenchInbox":
            runWorkbenchDialog(app, "inbox");
            return true;
        case "workbenchLibrary":
            runWorkbenchDialog(app, "library");
            return true;
        case "workbenchSavedViews":
            runWorkbenchSavedViews(app);
            return true;
        case "workbenchTasks":
            runWorkbenchDialog(app, "task");
            return true;
        case "workbenchCalendar":
            runWorkbenchDialog(app, "calendar");
            return true;
        case "workbenchProjects":
            runWorkbenchDialog(app, "project");
            return true;
        case "workbenchReview":
            runWorkbenchDialog(app, "review");
            return true;
        case "workbenchDraftReport":
            runWorkbenchDraft(app, "report");
            return true;
        case "workbenchDraftReview":
            runWorkbenchDraft(app, "review", "review");
            return true;
        case "workbenchDraftDashboard":
            runWorkbenchDraft(app, "dashboard");
            return true;
        case "workbenchCurrentMeta":
            runWorkbenchCurrentMeta();
            return true;
        case "workbenchCurrentBlockMeta":
            runWorkbenchCurrentBlockMeta();
            return true;
        case "workbenchCurrentTask":
            runWorkbenchCurrentMeta("task");
            return true;
        case "workbenchCurrentBlockTask":
            runWorkbenchCurrentBlockMeta("task");
            return true;
        case "workbenchCurrentEvent":
            runWorkbenchCurrentMeta("event");
            return true;
        case "workbenchCurrentBlockEvent":
            runWorkbenchCurrentBlockMeta("event");
            return true;
        case "workbenchCurrentProject":
            runWorkbenchCurrentMeta("project");
            return true;
        case "workbenchCurrentBlockProject":
            runWorkbenchCurrentBlockMeta("project");
            return true;
        case "workbenchOpenCurrentBoundView":
            runOpenCurrentWorkbenchView(app);
            return true;
        case "workbenchBindCurrentView":
            runBindCurrentWorkbenchView();
            return true;
        case "workbenchInsertCurrentBoundView":
            runInsertCurrentWorkbenchViewEmbed();
            return true;
        case "workbenchClearCurrentBoundView":
            runClearCurrentWorkbenchView();
            return true;
        case "workbenchCreateViewNote":
            runWorkbenchViewNote(app);
            return true;
        case "assistantAI":
            runOpenAssistantAI();
            return true;
        case "assistantInbox":
            runAssistantInbox();
            return true;
        case "assistantCurrentNote":
            runOpenAssistantAI("", true);
            return true;
        case "assistantPinCurrentNote":
            runOpenAssistantAI("", true, false, true);
            return true;
        case "assistantClearTargetNote":
            runOpenAssistantAI("", false, false, false, true);
            return true;
        case "assistantSummarizeCurrentNote":
            runAssistantSkillById("note-summarize");
            return true;
        case "assistantSuggestLinksCurrentNote":
            runAssistantSkillById("note-links");
            return true;
        case "assistantHealthCurrentNote":
            runAssistantSkillById("note-health");
            return true;
        case "assistantRewriteSelection":
            runAssistantSkillById("selection-rewrite");
            return true;
        case "assistantTranslateSelection":
            runAssistantSkillById("selection-translate");
            return true;
        case "assistantTaskSelection":
            runAssistantSkillById("selection-task");
            return true;
        case "assistantReminderSelection":
            runAssistantSkillById("selection-reminder");
            return true;
        case "assistantMermaidSelection":
            runAssistantSkillById("selection-mermaid");
            return true;
        case "assistantTableSelection":
            runAssistantSkillById("selection-table");
            return true;
        case "assistantMindElixirSelection":
            runAssistantSkillById("selection-mind-elixir");
            return true;
        case "assistantTaskCurrentNote":
            runAssistantSkillById("note-task");
            return true;
        case "assistantReminderCurrentNote":
            runAssistantSkillById("note-reminder");
            return true;
        case "assistantPolishCurrentNote":
            runAssistantSkillById("note-polish");
            return true;
        case "assistantExtractTasksCurrentNote":
            runAssistantSkillById("note-extract-tasks");
            return true;
        case "assistantCreateProjectCurrentNote":
            runAssistantSkillById("note-create-project");
            return true;
        case "assistantCurrentBlock":
            runAssistantCurrentBlock();
            return true;
        case "assistantCurrentBlockContext":
            runAssistantCurrentBlockContext();
            return true;
        case "assistantCurrentBlockReferences":
            runAssistantCurrentBlockReferences();
            return true;
        case "assistantAssetsCurrentNote":
            runAssistantCurrentNoteAssets();
            return true;
        case "assistantBacklinksCurrentNote":
            runAssistantCurrentNoteBacklinks();
            return true;
        case "assistantOutlineCurrentNote":
            runAssistantCurrentNoteOutline();
            return true;
        case "assistantHistoryCurrentNote":
            runAssistantCurrentNoteHistory();
            return true;
        case "assistantRestorePoints":
            runAssistantRestorePoints();
            return true;
        case "assistantCreateChildNoteCurrentNote":
            runAssistantCreateChildNoteCurrentNote();
            return true;
        case "assistantContinueAfterCurrentBlock":
            runAssistantContinueAfterCurrentBlock();
            return true;
        case "assistantSummarizeWorkbench":
            runWorkbenchAssistant(app, "summary");
            return true;
        case "assistantPlanWorkbench":
            runWorkbenchAssistant(app, "plan");
            return true;
        case "fileTree":
            runMobileOpenDock("file");
            return true;
        case "outline":
        case "bookmark":
        case "tag":
            runMobileOpenDock(command);
            return true;
        case "backlinks":
            runMobileOpenDock("backlink");
            return true;
        case "mainMenu":
            runMobilePopMenu();
            return true;
        case "globalSearch":
            runMobilePopSearch(app);
            return true;
        case "recentDocs":
            runMobileRecentDocs(app);
            return true;
    }
    /// #else
    switch (command) {
        case "workbench":
            runWorkbenchDialog(app);
            return true;
        case "workbenchInbox":
            runWorkbenchDialog(app, "inbox");
            return true;
        case "workbenchLibrary":
            runWorkbenchDialog(app, "library");
            return true;
        case "workbenchSavedViews":
            runWorkbenchSavedViews(app);
            return true;
        case "workbenchTasks":
            runWorkbenchDialog(app, "task");
            return true;
        case "workbenchCalendar":
            runWorkbenchDialog(app, "calendar");
            return true;
        case "workbenchProjects":
            runWorkbenchDialog(app, "project");
            return true;
        case "workbenchReview":
            runWorkbenchDialog(app, "review");
            return true;
        case "workbenchDraftReport":
            runWorkbenchDraft(app, "report");
            return true;
        case "workbenchDraftReview":
            runWorkbenchDraft(app, "review", "review");
            return true;
        case "workbenchDraftDashboard":
            runWorkbenchDraft(app, "dashboard");
            return true;
        case "workbenchCurrentMeta":
            runWorkbenchCurrentMeta();
            return true;
        case "workbenchCurrentBlockMeta":
            runWorkbenchCurrentBlockMeta();
            return true;
        case "workbenchCurrentTask":
            runWorkbenchCurrentMeta("task");
            return true;
        case "workbenchCurrentBlockTask":
            runWorkbenchCurrentBlockMeta("task");
            return true;
        case "workbenchCurrentEvent":
            runWorkbenchCurrentMeta("event");
            return true;
        case "workbenchCurrentBlockEvent":
            runWorkbenchCurrentBlockMeta("event");
            return true;
        case "workbenchCurrentProject":
            runWorkbenchCurrentMeta("project");
            return true;
        case "workbenchCurrentBlockProject":
            runWorkbenchCurrentBlockMeta("project");
            return true;
        case "workbenchOpenCurrentBoundView":
            runOpenCurrentWorkbenchView(app);
            return true;
        case "workbenchBindCurrentView":
            runBindCurrentWorkbenchView();
            return true;
        case "workbenchInsertCurrentBoundView":
            runInsertCurrentWorkbenchViewEmbed();
            return true;
        case "workbenchClearCurrentBoundView":
            runClearCurrentWorkbenchView();
            return true;
        case "workbenchCreateViewNote":
            runWorkbenchViewNote(app);
            return true;
        case "assistantAI":
            runOpenAssistantAI();
            return true;
        case "assistantInbox":
            runAssistantInbox();
            return true;
        case "assistantCurrentNote":
            runOpenAssistantAI("", true);
            return true;
        case "assistantPinCurrentNote":
            runOpenAssistantAI("", true, false, true);
            return true;
        case "assistantClearTargetNote":
            runOpenAssistantAI("", false, false, false, true);
            return true;
        case "assistantSummarizeCurrentNote":
            runAssistantSkillById("note-summarize");
            return true;
        case "assistantSuggestLinksCurrentNote":
            runAssistantSkillById("note-links");
            return true;
        case "assistantHealthCurrentNote":
            runAssistantSkillById("note-health");
            return true;
        case "assistantRewriteSelection":
            runAssistantSkillById("selection-rewrite");
            return true;
        case "assistantTranslateSelection":
            runAssistantSkillById("selection-translate");
            return true;
        case "assistantTaskSelection":
            runAssistantSkillById("selection-task");
            return true;
        case "assistantReminderSelection":
            runAssistantSkillById("selection-reminder");
            return true;
        case "assistantMermaidSelection":
            runAssistantSkillById("selection-mermaid");
            return true;
        case "assistantTableSelection":
            runAssistantSkillById("selection-table");
            return true;
        case "assistantMindElixirSelection":
            runAssistantSkillById("selection-mind-elixir");
            return true;
        case "assistantTaskCurrentNote":
            runAssistantSkillById("note-task");
            return true;
        case "assistantReminderCurrentNote":
            runAssistantSkillById("note-reminder");
            return true;
        case "assistantPolishCurrentNote":
            runAssistantSkillById("note-polish");
            return true;
        case "assistantExtractTasksCurrentNote":
            runAssistantSkillById("note-extract-tasks");
            return true;
        case "assistantCreateProjectCurrentNote":
            runAssistantSkillById("note-create-project");
            return true;
        case "assistantCurrentBlock":
            runAssistantCurrentBlock();
            return true;
        case "assistantCurrentBlockContext":
            runAssistantCurrentBlockContext();
            return true;
        case "assistantCurrentBlockReferences":
            runAssistantCurrentBlockReferences();
            return true;
        case "assistantAssetsCurrentNote":
            runAssistantCurrentNoteAssets();
            return true;
        case "assistantBacklinksCurrentNote":
            runAssistantCurrentNoteBacklinks();
            return true;
        case "assistantOutlineCurrentNote":
            runAssistantCurrentNoteOutline();
            return true;
        case "assistantHistoryCurrentNote":
            runAssistantCurrentNoteHistory();
            return true;
        case "assistantRestorePoints":
            runAssistantRestorePoints();
            return true;
        case "assistantCreateChildNoteCurrentNote":
            runAssistantCreateChildNoteCurrentNote();
            return true;
        case "assistantContinueAfterCurrentBlock":
            runAssistantContinueAfterCurrentBlock();
            return true;
        case "assistantSummarizeWorkbench":
            runWorkbenchAssistant(app, "summary");
            return true;
        case "assistantPlanWorkbench":
            runWorkbenchAssistant(app, "plan");
            return true;
        case "fileTree":
            getDockByType("file").toggleModel("file");
            return true;
        case "outline":
            getDockByType("outline").toggleModel("outline");
            return true;
        case "bookmark":
        case "tag":
            getDockByType(command).toggleModel(command);
            return true;
        case "backlinks":
            getDockByType("backlink").toggleModel("backlink");
            return true;
        case "graphView":
            getDockByType("graph").toggleModel("graph");
            return true;
        case "globalGraph":
            getDockByType("globalGraph").toggleModel("globalGraph");
            return true;
        case "config":
            runOpenSetting(app);
            return true;
        case "globalSearch":
            runOpenSearch(app, (getSelection().rangeCount > 0 ? getSelection().getRangeAt(0) : document.createRange()).toString());
            return true;
        case "stickSearch":
            runOpenGlobalSearch(app, (getSelection().rangeCount > 0 ? getSelection().getRangeAt(0) : document.createRange()).toString(), true);
            return true;
        case "goBack":
            goBack(app);
            return true;
        case "goForward":
            goForward(app);
            return true;
        case "goToTab1":
            switchTabByIndex(0);
            return true;
        case "goToTab2":
            switchTabByIndex(1);
            return true;
        case "goToTab3":
            switchTabByIndex(2);
            return true;
        case "goToTab4":
            switchTabByIndex(3);
            return true;
        case "goToTab5":
            switchTabByIndex(4);
            return true;
        case "goToTab6":
            switchTabByIndex(5);
            return true;
        case "goToTab7":
            switchTabByIndex(6);
            return true;
        case "goToTab8":
            switchTabByIndex(7);
            return true;
        case "goToTab9":
            switchTabByIndex(-1);
            return true;
        case "goToTabNext":
            switchTabByIndex(-3);
            return true;
        case "goToTabPrev":
            switchTabByIndex(-2);
            return true;
        case "mainMenu":
            if (!isWindow()) {
                workspaceMenu(app, document.querySelector("#barWorkspace").getBoundingClientRect());
            }
            return true;
        case "recentDocs":
            runOpenRecentDocs();
            return true;
        case "recentClosed":
            if (window.sourceflow.storage[Constants.LOCAL_CLOSED_TABS].length > 0) {
                const closeData = window.sourceflow.storage[Constants.LOCAL_CLOSED_TABS].pop();
                setStorageVal(Constants.LOCAL_CLOSED_TABS, window.sourceflow.storage[Constants.LOCAL_CLOSED_TABS]);
                const childData = closeData.children as ILayoutJSON;
                if (childData.instance === "Search") {
                    openFile({
                        app,
                        searchData: childData.config,
                    });
                    return true;
                }
                if (childData.instance === "Asset") {
                    fetchPost("/api/asset/statAsset", {path: childData.path}, (response) => {
                        if (response.code !== 1) {
                            openFile({
                                app,
                                assetPath: childData.path,
                                page: childData.page,
                            });
                        }
                    });
                    return true;
                }
                if (childData.instance === "Custom") {
                    let exit = childData.customModelType === "sourceflow-card";
                    if (!exit) {
                        app.plugins.find(p => {
                            if (p.models[childData.customModelType]) {
                                exit = true;
                                return true;
                            }
                        });
                    }
                    if (exit) {
                        openFile({
                            app,
                            custom: {
                                icon: closeData.icon,
                                title: closeData.title,
                                data: childData.customModelData,
                                id: childData.customModelType
                            },
                        });
                    }
                    return true;
                }
                fetchPost("/api/block/getBlockInfo", {id: childData.rootId || childData.blockId}, (infoResponse) => {
                    if (infoResponse.data.rootID === (childData.rootId || childData.blockId)) {
                        if (childData.instance === "Editor") {
                            openFile({
                                app,
                                fileName: closeData.title,
                                id: childData.blockId,
                                rootID: childData.rootId,
                                mode: childData.mode,
                                rootIcon: closeData.docIcon,
                                action: [childData.action]
                            });
                        } else if (childData.instance === "Backlink") {
                            openBacklink({
                                app,
                                blockId: childData.blockId,
                                rootId: childData.rootId,
                                title: closeData.title,
                            });
                        } else if (childData.instance === "Graph") {
                            openGraph({
                                app,
                                blockId: childData.blockId,
                                rootId: childData.rootId,
                                title: closeData.title
                            });
                        } else if (childData.instance === "Outline") {
                            openOutline({
                                app,
                                rootId: childData.blockId,
                                title: closeData.title,
                                isPreview: childData.isPreview
                            });
                        }
                    }
                });
            }
            return true;
        case "toggleDock":
            toggleDockBar(document.querySelector("#barDock use"));
            return true;
        case "toggleWin":
            /// #if !BROWSER
            ipcRenderer.send(Constants.SOURCEFLOW_CMD, "hide");
            ipcRenderer.send(Constants.SOURCEFLOW_CMD, "minimize");
            /// #endif
            return true;
    }
    if (command === "goToEditTabNext" || command === "goToEditTabPrev") {
        let currentTabElement = document.querySelector(".layout__wnd--active ul.layout-tab-bar > .item--focus");
        if (!currentTabElement) {
            currentTabElement = document.querySelector("ul.layout-tab-bar > .item--focus");
        }
        if (!currentTabElement) {
            return true;
        }
        const tabs = getAllTabs().sort((itemA, itemB) => {
            return itemA.headElement.getAttribute("data-activetime") > itemB.headElement.getAttribute("data-activetime") ? -1 : 1;
        });
        const currentId = currentTabElement.getAttribute("data-id");
        tabs.find((item, index) => {
            if (currentId === item.id) {
                let newItem: Tab;
                if (command === "goToEditTabPrev") {
                    if (index === 0) {
                        newItem = tabs[tabs.length - 1];
                    } else {
                        newItem = tabs[index - 1];
                    }
                } else {
                    if (index === tabs.length - 1) {
                        newItem = tabs[0];
                    } else {
                        newItem = tabs[index + 1];
                    }
                }
                const tab = getInstanceById(newItem.id) as Tab;
                tab.parent.switchTab(newItem.headElement);
                tab.parent.showHeading();
            }
        });
        return true;
    }
    if (command === "closeUnmodified") {
        const tab = getActiveTab(false);
        if (tab) {
            const unmodifiedTabs: Tab[] = [];
            tab.parent.children.forEach((item: Tab) => {
                const editor = item.model as Editor;
                if (!editor || (editor.editor?.protyle && !editor.editor?.protyle.updated)) {
                    unmodifiedTabs.push(item);
                }
            });
            if (unmodifiedTabs.length > 0) {
                closeTabByType(tab, "other", unmodifiedTabs);
            }
        }
        return true;
    }
    if (command === "unsplitAll") {
        runUnsplitWnd(window.sourceflow.layout.centerLayout, window.sourceflow.layout.centerLayout, false);
        return true;
    }
    if (command === "unsplit") {
        const tab = getActiveTab(false);
        if (tab) {
            let wndsTemp: Wnd[] = [];
            let layout = tab.parent.parent;
            while (layout.id !== window.sourceflow.layout.centerLayout.id) {
                wndsTemp = [];
                getAllWnds(layout, wndsTemp);
                if (wndsTemp.length > 1) {
                    break;
                } else {
                    layout = layout.parent;
                }
            }
            runUnsplitWnd(tab.parent.parent.children[0], layout, true);
            resizeTabs();
        }
        return true;
    }
    if (command === "closeTab") {
        const activeTabElement = document.querySelector(".layout__tab--active");
        if (activeTabElement && activeTabElement.getBoundingClientRect().width > 0) {
            let type: TDock;
            Array.from(activeTabElement.classList).find(item => {
                if (item.startsWith("sf__")) {
                    type = item.replace("sf__", "") as TDock;
                    return true;
                }
            });
            if (type) {
                getDockByType(type)?.toggleModel(type, false, true);
            }
            return true;
        }

        const tab = getActiveTab();
        if (tab) {
            tab.parent.removeTab(tab.id);
            return true;
        }
        // https://github.com/lonelyor/SourceFlow/issues/14729
        if (window.sourceflow.blockPanels.length > 0) {
            window.sourceflow.blockPanels[window.sourceflow.blockPanels.length - 1]?.destroy();
            return true;
        }
        const noFocusTab = getActiveTab(false);
        if (noFocusTab) {
            noFocusTab.parent.removeTab(noFocusTab.id);
            return true;
        }
    }
    if (command === "closeOthers" || command === "closeAll") {
        const tab = getActiveTab(false);
        if (tab) {
            closeTabByType(tab, command);
        }
        return true;
    }
    if (command === "closeLeft" || command === "closeRight") {
        const tab = getActiveTab(false);
        if (tab) {
            const leftTabs: Tab[] = [];
            const rightTabs: Tab[] = [];
            let midIndex = -1;
            tab.parent.children.forEach((item: Tab, index: number) => {
                if (item.id === tab.id) {
                    midIndex = index;
                }
                if (midIndex === -1) {
                    leftTabs.push(item);
                } else if (index > midIndex) {
                    rightTabs.push(item);
                }
            });
            if (command === "closeLeft") {
                if (leftTabs.length > 0) {
                    closeTabByType(tab, "other", leftTabs);
                }
            } else {
                if (rightTabs.length > 0) {
                    closeTabByType(tab, "other", rightTabs);
                }
            }
        }
        return true;
    }
    if (command === "splitLR") {
        const tab = getActiveTab(false);
        if (tab) {
            tab.parent.split("lr").addTab(copyTab(app, tab));
        }
        return true;
    }
    if (command === "splitTB") {
        const tab = getActiveTab(false);
        if (tab) {
            tab.parent.split("tb").addTab(copyTab(app, tab));
        }
        return true;
    }
    if (command === "splitMoveB" || command === "splitMoveR") {
        const tab = getActiveTab(false);
        if (tab && tab.parent.children.length > 1) {
            const newWnd = tab.parent.split(command === "splitMoveB" ? "tb" : "lr");
            newWnd.headersElement.append(tab.headElement);
            newWnd.headersElement.parentElement.classList.remove("fn__none");
            newWnd.moveTab(tab);
            resizeTabs();
        }
        return true;
    }
    if (command === "tabToWindow") {
        const tab = getActiveTab(false);
        if (tab) {
            runOpenNewWindow(tab);
        }
        return true;
    }
    /// #endif

    switch (command) {
        case "dailyNote":
            newDailyNote(app);
            return true;
        case "dataHistory":
            runOpenHistory(app);
            return true;
        case "editReadonly":
            setReadOnly(!window.sourceflow.config.editor.readOnly);
            return true;
        case "lockScreen":
            lockScreen(app);
            return true;
        case "newFile":
            newFile({
                app,
                useSavePath: true
            });
            return true;
        case "riffCard":
            runOpenCard(app);
            return true;
        case "selectOpen1":
            /// #if !MOBILE
            selectOpenTab();
            /// #endif
            return true;
        case "syncNow":
            runSyncGuide(app);
            return true;
        case "captureCenter":
            runCaptureDialog(app, "url");
            return true;
        case "quickCapture":
            runCaptureDialog(app, "url");
            return true;
        case "urlImport":
            runCaptureDialog(app, "url");
            return true;
        case "taskCapture":
            runCaptureDialog(app, "url");
            return true;
        case "eventCapture":
            runCaptureDialog(app, "url");
            return true;
        case "projectCapture":
            runCaptureDialog(app, "url");
            return true;
        case "attachmentCapture":
            runCaptureDialog(app, "url");
            return true;
        case "workbench":
            runWorkbenchDialog(app);
            return true;
        case "workbenchInbox":
            runWorkbenchDialog(app, "inbox");
            return true;
        case "workbenchLibrary":
            runWorkbenchDialog(app, "library");
            return true;
        case "workbenchSavedViews":
            runWorkbenchSavedViews(app);
            return true;
        case "workbenchTasks":
            runWorkbenchDialog(app, "task");
            return true;
        case "workbenchCalendar":
            runWorkbenchDialog(app, "calendar");
            return true;
        case "workbenchProjects":
            runWorkbenchDialog(app, "project");
            return true;
        case "workbenchReview":
            runWorkbenchDialog(app, "review");
            return true;
        case "workbenchDraftReport":
            runWorkbenchDraft(app, "report");
            return true;
        case "workbenchDraftReview":
            runWorkbenchDraft(app, "review", "review");
            return true;
        case "workbenchDraftDashboard":
            runWorkbenchDraft(app, "dashboard");
            return true;
        case "workbenchOpenCurrentBoundView":
            runOpenCurrentWorkbenchView(app);
            return true;
        case "workbenchBindCurrentView":
            runBindCurrentWorkbenchView();
            return true;
        case "workbenchInsertCurrentBoundView":
            runInsertCurrentWorkbenchViewEmbed();
            return true;
        case "workbenchClearCurrentBoundView":
            runClearCurrentWorkbenchView();
            return true;
    }

    return false;
};
