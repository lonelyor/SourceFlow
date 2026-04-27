import {Dialog} from "../dialog";
import {Constants} from "../constants";
import {fetchSyncPost} from "../util/fetch";
import {showMessage} from "../dialog/message";
import {writeText, setStorageVal} from "../protyle/util/compatibility";
import {App} from "../index";
import {replaceFileName, validateName} from "../editor/rename";
import {getAllEditor} from "../layout/getAll";
import {hasClosestByClassName} from "../protyle/util/hasClosest";
import {runAssistantFeature} from "../assistant/runtime";
/// #if MOBILE
import {openMobileFileById} from "../mobile/editor";
/// #else
import {openFileById} from "../editor/util";
/// #endif
import {IWorkbenchItem, TWorkbenchTab, WorkbenchAttr} from "./constants";

type TWorkbenchView = "list" | "table" | "board" | "timeline" | "calendar";
type TWorkbenchGroupBy = "none" | "type" | "status" | "project" | "notebook" | "date";
type TWorkbenchResultLayer = "items" | "blocks";
type TWorkbenchBuiltinViewNoteKey = "list" | "table" | "board" | "timeline" | "skill";

interface IWorkbenchActionPreset {
    name: string;
    attrs: Record<string, string | null>;
}

interface IWorkbenchDashboardPreset {
    name: string;
    activeTab: TWorkbenchTab;
    resultLayer: TWorkbenchResultLayer;
    query: string;
    sortBy: string;
    sortOrder: string;
    view: TWorkbenchView;
    groupBy: TWorkbenchGroupBy;
}

interface IWorkbenchViewTemplate {
    name: string;
    activeTab: TWorkbenchTab;
    resultLayer: TWorkbenchResultLayer;
    query: string;
    sortBy: string;
    sortOrder: string;
    view: TWorkbenchView;
    groupBy: TWorkbenchGroupBy;
    pathPrefix: string;
    tags: string;
}

interface IWorkbenchBuiltinViewNoteOption {
    key: TWorkbenchBuiltinViewNoteKey;
    icon: string;
    label: string;
}

export interface IWorkbenchRule {
    name: string;
    enabled: boolean;
    matchKind: "*" | "doc" | "block";
    matchType: "*" | IWorkbenchItem["type"];
    titleIncludes: string;
    notebookIncludes: string;
    projectIncludes: string;
    tagIncludes: string;
    inbox: "" | "true" | "false";
    actions: Record<string, string | null>;
}

export interface IWorkbenchAutomationData {
    presets: string[];
    resultLayer: TWorkbenchResultLayer;
    sortBy: string;
    sortOrder: string;
    groupBy: TWorkbenchGroupBy;
    views: Partial<Record<TWorkbenchTab, TWorkbenchView>>;
    rules: IWorkbenchRule[];
    actionPresets: IWorkbenchActionPreset[];
    dashboards: IWorkbenchDashboardPreset[];
    viewTemplates: IWorkbenchViewTemplate[];
}

interface IWorkbenchState {
    activeTab: TWorkbenchTab;
    resultLayer: TWorkbenchResultLayer;
    query: string;
    monthOffset: number;
    presets: string[];
    sortBy: string;
    sortOrder: string;
    views: Partial<Record<TWorkbenchTab, TWorkbenchView>>;
    groupBy: TWorkbenchGroupBy;
    rules: IWorkbenchRule[];
    actionPresets: IWorkbenchActionPreset[];
    dashboards: IWorkbenchDashboardPreset[];
    currentDashboard: string;
    viewTemplates: IWorkbenchViewTemplate[];
    currentViewTemplate: string;
}

interface IWorkbenchSearchBlock {
    id: string;
    rootID?: string;
    box: string;
    hPath: string;
    content: string;
    updated: string;
    type: string;
}

interface IWorkbenchFacet {
    name: string;
    count: number;
    token: string;
}

interface IWorkbenchSummary {
    total: number;
    filtered: number;
    docCount: number;
    viewCount: number;
    inboxCount: number;
    taskCount: number;
    eventCount: number;
    projectCount: number;
    reviewCount: number;
    typeCounts: Record<string, number>;
    statusCounts: Record<string, number>;
    notebooks: IWorkbenchFacet[];
    projects: IWorkbenchFacet[];
    tags: IWorkbenchFacet[];
    quickFilters: IWorkbenchFacet[];
    refTotal: number;
    assetTotal: number;
    subFileTotal: number;
}

interface IWorkbenchQueryResponse {
    items: IWorkbenchItem[];
    allItems: IWorkbenchItem[];
    summary: IWorkbenchSummary;
}

interface IWorkbenchBoundViewState {
    activeTab: TWorkbenchTab;
    resultLayer: TWorkbenchResultLayer;
    query: string;
    sortBy: string;
    sortOrder: string;
    view: TWorkbenchView;
    groupBy: TWorkbenchGroupBy;
}

const WorkbenchViewAttr = {
    enabled: "custom-workbench-view-enabled",
    activeTab: "custom-workbench-view-tab",
    resultLayer: "custom-workbench-view-result-layer",
    query: "custom-workbench-view-query",
    sortBy: "custom-workbench-view-sort-by",
    sortOrder: "custom-workbench-view-sort-order",
    view: "custom-workbench-view-mode",
    groupBy: "custom-workbench-view-group-by",
};

const WORKBENCH_SAVED_VIEWS_QUERY = "type:doc has:view";
let workbenchQueryInputTimer = 0;
let workbenchRenderToken = 0;
const WORKBENCH_QUERY_CACHE_TTL = 8000;
const WORKBENCH_BLOCK_CACHE_TTL = 8000;
const workbenchQueryCache = new Map<string, { expiresAt: number, data: IWorkbenchQueryResponse }>();
const workbenchQueryInflight = new Map<string, Promise<IWorkbenchQueryResponse>>();
const workbenchBlockCache = new Map<string, { expiresAt: number, data: IWorkbenchSearchBlock[] }>();
const workbenchBlockInflight = new Map<string, Promise<IWorkbenchSearchBlock[]>>();
const loadCaptureDialogModule = () => import("../capture/dialog");
const loadWorkbenchItemDialogModule = () => import("./itemDialog");
const loadAssistantAIDockModule = () => import("../assistant/ai/AIDock");
const loadWorkbenchReminderModule = () => import("./reminders");

const resolveEditorProtyle = (editor?: import("../protyle").Protyle | IProtyle) => {
    if (!editor) {
        return undefined;
    }
    return "protyle" in editor ? editor.protyle : editor;
};

const openWorkbenchURLImportDialog = (app: App) => {
    void loadCaptureDialogModule().then(({openCaptureDialog}) => {
        openCaptureDialog(app, "url");
    });
};

const openWorkbenchItemDialog = (app: App, mode: "note" | "task" | "event", draft?: Record<string, unknown>) => {
    void loadWorkbenchItemDialogModule().then(({openWorkbenchItemDialog}) => {
        openWorkbenchItemDialog(app, mode, draft as never);
    });
};

const openWorkbenchAssistantDock = (options: {
    message?: string,
    includeCurrentNote?: boolean,
    append?: boolean,
    pinCurrentNote?: boolean,
    clearTarget?: boolean,
    sessionId?: string,
}) => {
    runAssistantFeature("workbench:assistant-ai", loadAssistantAIDockModule, ({openAssistantAIDock}) => {
        openAssistantAIDock(options);
    });
};

const getDefaultState = (): IWorkbenchState => ({
    activeTab: "inbox",
    resultLayer: "items",
    query: "",
    monthOffset: 0,
    presets: [],
    sortBy: "captured",
    sortOrder: "desc",
    views: {
        inbox: "list",
        library: "list",
        task: "board",
        calendar: "calendar",
        project: "board",
        review: "list",
    },
    groupBy: "none",
    rules: [],
    actionPresets: [],
    dashboards: [],
    currentDashboard: "",
    viewTemplates: [],
    currentViewTemplate: "",
});

const getState = (): IWorkbenchState => {
    const state: IWorkbenchState = Object.assign(getDefaultState(), window.sourceflow.storage[Constants.LOCAL_WORKBENCH] || {});
    state.presets = Array.from(new Set((state.presets || []).map((item) => `${item || ""}`.trim()).filter(Boolean))).slice(0, 20);
    state.views = Object.assign({}, getDefaultState().views, state.views || {});
    state.resultLayer = normalizeWorkbenchResultLayer(state.resultLayer);
    state.groupBy = normalizeWorkbenchGroupBy(state.groupBy);
    state.rules = normalizeWorkbenchRules(state.rules);
    state.actionPresets = normalizeWorkbenchActionPresets(state.actionPresets);
    state.dashboards = normalizeWorkbenchDashboards(state.dashboards);
    state.currentDashboard = `${state.currentDashboard || ""}`.trim();
    state.viewTemplates = normalizeWorkbenchViewTemplates(state.viewTemplates);
    state.currentViewTemplate = `${state.currentViewTemplate || ""}`.trim();
    state.sortBy = normalizeWorkbenchSortBy(state.resultLayer, state.sortBy);
    if (state.currentViewTemplate && !state.viewTemplates.find((item) => item.name === state.currentViewTemplate)) {
        state.currentViewTemplate = "";
    }
    (["inbox", "library", "task", "calendar", "project", "review"] as TWorkbenchTab[]).forEach((tab) => {
        state.views[tab] = normalizeWorkbenchView(tab, state.views[tab], state.resultLayer);
    });
    return state;
};

const saveState = (state: IWorkbenchState) => {
    window.sourceflow.storage[Constants.LOCAL_WORKBENCH] = state;
    setStorageVal(Constants.LOCAL_WORKBENCH, state);
};

const escapeHTML = (text: string) => (text || "").replace(/[&<>"']/g, (match) => {
    switch (match) {
        case "&":
            return "&amp;";
        case "<":
            return "&lt;";
        case ">":
            return "&gt;";
        case "\"":
            return "&quot;";
        default:
            return "&#39;";
    }
});

const escapeAttr = (text: string) => escapeHTML(text).replace(/"/g, "&quot;");

const splitWorkbenchTags = (text: string) => (text || "").replace(/，/g, ",").split(",").map((item) => item.trim()).filter(Boolean);

const typeLabel = (type: IWorkbenchItem["type"]) => {
    switch (type) {
        case "doc":
            return window.sourceflow.languages.doc;
        case "note":
            return window.sourceflow.languages.quickCapture;
        case "url":
            return window.sourceflow.languages.urlImport;
        case "task":
            return window.sourceflow.languages.taskCapture;
        case "event":
            return window.sourceflow.languages.eventCapture;
        case "project":
            return window.sourceflow.languages.projectCapture;
        default:
            return window.sourceflow.languages.attachmentCapture;
    }
};

const statusLabel = (status: string) => {
    switch (status) {
        case "todo":
            return window.sourceflow.languages.workbenchTodo;
        case "doing":
            return window.sourceflow.languages.workbenchDoing;
        case "done":
            return window.sourceflow.languages.workbenchDone;
        case "scheduled":
            return window.sourceflow.languages.workbenchScheduled;
        case "active":
            return window.sourceflow.languages.workbenchActive;
        case "on-hold":
            return window.sourceflow.languages.workbenchOnHold;
        case "completed":
            return window.sourceflow.languages.workbenchCompleted;
        default:
            return window.sourceflow.languages.open;
    }
};

const getStatusOptions = (type: IWorkbenchItem["type"]) => {
    switch (type) {
        case "task":
            return ["todo", "doing", "done"];
        case "event":
            return ["scheduled", "completed"];
        case "project":
            return ["active", "on-hold", "completed"];
        default:
            return ["open"];
    }
};

const getBatchStatusOptions = (items: IWorkbenchItem[]) => {
    const options = new Set<string>();
    items.forEach((item) => {
        getStatusOptions(item.type).forEach((status) => options.add(status));
    });
    return Array.from(options);
};

const normalizeWorkbenchResultLayer = (candidate?: string) => candidate === "blocks" ? "blocks" as TWorkbenchResultLayer : "items" as TWorkbenchResultLayer;

const getWorkbenchResultLayerLabel = (layer: TWorkbenchResultLayer) => layer === "blocks"
    ? window.sourceflow.languages.workbenchLayerBlocks
    : window.sourceflow.languages.workbenchLayerItems;

const getSortOptions = (resultLayer: TWorkbenchResultLayer = "items") => {
    if (resultLayer === "blocks") {
        return [
            {value: "updated", label: window.sourceflow.languages.workbenchSortUpdated},
            {value: "title", label: window.sourceflow.languages.workbenchSortTitle},
        ];
    }
    return [
        {value: "captured", label: window.sourceflow.languages.workbenchSortCaptured},
        {value: "updated", label: window.sourceflow.languages.workbenchSortUpdated},
        {value: "created", label: window.sourceflow.languages.workbenchSortCreated},
        {value: "due", label: window.sourceflow.languages.workbenchSortDue},
        {value: "event", label: window.sourceflow.languages.workbenchSortEvent},
        {value: "title", label: window.sourceflow.languages.workbenchSortTitle},
    ];
};

const getGroupByOptions = () => ([
    {value: "none" as TWorkbenchGroupBy, label: window.sourceflow.languages.workbenchGroupNone},
    {value: "type" as TWorkbenchGroupBy, label: window.sourceflow.languages.workbenchGroupType},
    {value: "status" as TWorkbenchGroupBy, label: window.sourceflow.languages.workbenchGroupStatus},
    {value: "project" as TWorkbenchGroupBy, label: window.sourceflow.languages.workbenchGroupProject},
    {value: "notebook" as TWorkbenchGroupBy, label: window.sourceflow.languages.workbenchGroupNotebook},
    {value: "date" as TWorkbenchGroupBy, label: window.sourceflow.languages.workbenchGroupDate},
]);

const getViewOptions = (tab: TWorkbenchTab, resultLayer: TWorkbenchResultLayer = "items") => {
    if (resultLayer === "blocks") {
        return [
            {value: "list" as TWorkbenchView, label: window.sourceflow.languages.workbenchViewList},
            {value: "table" as TWorkbenchView, label: window.sourceflow.languages.workbenchViewTable},
        ];
    }
    if (tab === "review") {
        return [{value: "list" as TWorkbenchView, label: window.sourceflow.languages.workbenchViewList}];
    }
    const options: Array<{ value: TWorkbenchView, label: string }> = [
        {value: "list", label: window.sourceflow.languages.workbenchViewList},
        {value: "table", label: window.sourceflow.languages.workbenchViewTable},
    ];
    if (tab === "task" || tab === "project") {
        options.push({value: "board", label: window.sourceflow.languages.workbenchViewBoard});
    }
    if (tab !== "project") {
        options.push({value: "timeline", label: window.sourceflow.languages.workbenchViewTimeline});
    }
    if (tab === "calendar") {
        options.unshift({value: "calendar", label: window.sourceflow.languages.workbenchViewCalendar});
    }
    return options;
};

const tabLabel = (tab: TWorkbenchTab) => {
    switch (tab) {
        case "inbox":
            return window.sourceflow.languages.inbox;
        case "library":
            return window.sourceflow.languages.workbenchLibrary;
        case "task":
            return window.sourceflow.languages.taskCapture;
        case "calendar":
            return window.sourceflow.languages.calendar;
        case "project":
            return window.sourceflow.languages.project;
        default:
            return window.sourceflow.languages.review;
    }
};

const viewLabel = (view: TWorkbenchView, tab: TWorkbenchTab) => {
    return getViewOptions(tab).find((item) => item.value === view)?.label || view;
};

const groupByLabel = (groupBy: TWorkbenchGroupBy) => {
    return getGroupByOptions().find((item) => item.value === groupBy)?.label || groupBy;
};

const sortLabel = (sortBy: string, resultLayer: TWorkbenchResultLayer) => {
    return getSortOptions(resultLayer).find((item) => item.value === sortBy)?.label || sortBy;
};

const getWorkbenchTabLabel = (tab: TWorkbenchTab) => {
    switch (tab) {
        case "library":
            return window.sourceflow.languages.workbenchLibrary;
        case "task":
            return window.sourceflow.languages.taskCapture;
        case "calendar":
            return window.sourceflow.languages.calendar;
        case "project":
            return window.sourceflow.languages.project;
        case "review":
            return window.sourceflow.languages.review;
        default:
            return window.sourceflow.languages.inbox;
    }
};

const normalizeWorkbenchView = (tab: TWorkbenchTab, candidate?: string, resultLayer: TWorkbenchResultLayer = "items") => {
    const options = getViewOptions(tab, resultLayer).map((item) => item.value);
    if (candidate && options.includes(candidate as TWorkbenchView)) {
        return candidate as TWorkbenchView;
    }
    return options[0];
};

const normalizeWorkbenchSortBy = (resultLayer: TWorkbenchResultLayer, candidate?: string) => {
    const options = getSortOptions(resultLayer).map((item) => item.value);
    if (candidate && options.includes(candidate)) {
        return candidate;
    }
    return options[0];
};

const normalizeWorkbenchGroupBy = (candidate?: string) => {
    const options = getGroupByOptions().map((item) => item.value);
    if (candidate && options.includes(candidate as TWorkbenchGroupBy)) {
        return candidate as TWorkbenchGroupBy;
    }
    return "none" as TWorkbenchGroupBy;
};

const getActiveView = (state: IWorkbenchState) => {
    const view = normalizeWorkbenchView(state.activeTab, state.views[state.activeTab], state.resultLayer);
    state.views[state.activeTab] = view;
    return view;
};

const getWorkbenchViewLabel = (tab: TWorkbenchTab, view: TWorkbenchView, resultLayer: TWorkbenchResultLayer = "items") => {
    return getViewOptions(tab, resultLayer).find((item) => item.value === view)?.label || view;
};

const normalizeWorkbenchActionPresets = (presets: IWorkbenchActionPreset[]): IWorkbenchActionPreset[] => {
    return (presets || []).map((item) => ({
        name: `${item?.name || ""}`.trim(),
        attrs: Object.entries(item?.attrs || {}).reduce((result, [key, value]) => {
            result[key] = value == null ? null : `${value}`.trim();
            return result;
        }, {} as Record<string, string | null>),
    })).filter((item) => item.name && Object.keys(item.attrs).length).slice(0, 20);
};

const normalizeWorkbenchDashboards = (dashboards: IWorkbenchDashboardPreset[]): IWorkbenchDashboardPreset[] => {
    return (dashboards || []).map((item) => {
        const activeTab = (item?.activeTab || "inbox") as TWorkbenchTab;
        const resultLayer = normalizeWorkbenchResultLayer(item?.resultLayer);
        return {
            name: `${item?.name || ""}`.trim(),
            activeTab,
            resultLayer,
            query: `${item?.query || ""}`.trim(),
            sortBy: normalizeWorkbenchSortBy(resultLayer, `${item?.sortBy || "captured"}`.trim() || "captured"),
            sortOrder: `${item?.sortOrder || "desc"}`.trim() || "desc",
            view: normalizeWorkbenchView(activeTab, item?.view, resultLayer),
            groupBy: normalizeWorkbenchGroupBy(item?.groupBy),
        };
    }).filter((item) => item.name).slice(0, 20);
};

const normalizeWorkbenchViewTemplates = (templates: IWorkbenchViewTemplate[]): IWorkbenchViewTemplate[] => {
    return (templates || []).map((item) => {
        const activeTab = (item?.activeTab || "inbox") as TWorkbenchTab;
        const resultLayer = normalizeWorkbenchResultLayer(item?.resultLayer);
        return {
            name: `${item?.name || ""}`.trim(),
            activeTab,
            resultLayer,
            query: `${item?.query || ""}`.trim(),
            sortBy: normalizeWorkbenchSortBy(resultLayer, `${item?.sortBy || "captured"}`.trim() || "captured"),
            sortOrder: `${item?.sortOrder || "desc"}`.trim() || "desc",
            view: normalizeWorkbenchView(activeTab, item?.view, resultLayer),
            groupBy: normalizeWorkbenchGroupBy(item?.groupBy),
            pathPrefix: `${item?.pathPrefix || "Workbench/Views"}`.trim() || "Workbench/Views",
            tags: `${item?.tags || "workbench,view"}`.trim() || "workbench,view",
        };
    }).filter((item) => item.name).slice(0, 30);
};

const getWorkbenchBuiltinViewNoteLabel = (key: TWorkbenchBuiltinViewNoteKey) => {
    switch (key) {
        case "table":
            return window.sourceflow.languages.workbenchViewTable;
        case "board":
            return window.sourceflow.languages.workbenchViewBoard;
        case "timeline":
            return window.sourceflow.languages.workbenchViewTimeline;
        case "skill":
            return window.sourceflow.config.lang === "zh_CN" ? "技能笔记" : "Skill Note";
        default:
            return window.sourceflow.languages.workbenchViewList;
    }
};

const getWorkbenchBuiltinViewNoteOptionsInternal = (): IWorkbenchBuiltinViewNoteOption[] => ([
    {
        key: "list",
        icon: "iconList",
        label: getWorkbenchBuiltinViewNoteLabel("list"),
    },
    {
        key: "table",
        icon: "iconTable",
        label: getWorkbenchBuiltinViewNoteLabel("table"),
    },
    {
        key: "board",
        icon: "iconBoard",
        label: getWorkbenchBuiltinViewNoteLabel("board"),
    },
    {
        key: "timeline",
        icon: "iconCalendar",
        label: getWorkbenchBuiltinViewNoteLabel("timeline"),
    },
    {
        key: "skill",
        icon: "iconSparkles",
        label: getWorkbenchBuiltinViewNoteLabel("skill"),
    },
]);

const getBuiltinWorkbenchViewNoteTemplate = (key: TWorkbenchBuiltinViewNoteKey, pathPrefix = "Workbench/Views") => {
    const name = `${getWorkbenchBuiltinViewNoteLabel(key)} · ${window.sourceflow.languages.workbenchViewNoteTitle}`;
    switch (key) {
        case "skill":
            return normalizeWorkbenchViewTemplates([{
                name,
                activeTab: "project",
                resultLayer: "items",
                query: "",
                sortBy: "updated",
                sortOrder: "desc",
                view: "board",
                groupBy: "project",
                pathPrefix,
                tags: "workbench,view,skill",
            }])[0];
        case "table":
            return normalizeWorkbenchViewTemplates([{
                name,
                activeTab: "library",
                resultLayer: "items",
                query: "",
                sortBy: "updated",
                sortOrder: "desc",
                view: "table",
                groupBy: "none",
                pathPrefix,
                tags: "workbench,view",
            }])[0];
        case "board":
            return normalizeWorkbenchViewTemplates([{
                name,
                activeTab: "task",
                resultLayer: "items",
                query: "",
                sortBy: "due",
                sortOrder: "asc",
                view: "board",
                groupBy: "none",
                pathPrefix,
                tags: "workbench,view",
            }])[0];
        case "timeline":
            return normalizeWorkbenchViewTemplates([{
                name,
                activeTab: "calendar",
                resultLayer: "items",
                query: "",
                sortBy: "event",
                sortOrder: "asc",
                view: "timeline",
                groupBy: "none",
                pathPrefix,
                tags: "workbench,view",
            }])[0];
        default:
            return normalizeWorkbenchViewTemplates([{
                name,
                activeTab: "library",
                resultLayer: "items",
                query: "",
                sortBy: "updated",
                sortOrder: "desc",
                view: "list",
                groupBy: "none",
                pathPrefix,
                tags: "workbench,view",
            }])[0];
    }
};

const normalizeWorkbenchRules = (rules: IWorkbenchRule[]): IWorkbenchRule[] => {
    return (rules || []).map((item) => ({
        name: `${item?.name || ""}`.trim(),
        enabled: item?.enabled !== false,
        matchKind: (item?.matchKind === "doc" || item?.matchKind === "block" ? item.matchKind : "*") as IWorkbenchRule["matchKind"],
        matchType: ((item?.matchType || "*") as "*" | IWorkbenchItem["type"]),
        titleIncludes: `${item?.titleIncludes || ""}`.trim(),
        notebookIncludes: `${item?.notebookIncludes || ""}`.trim(),
        projectIncludes: `${item?.projectIncludes || ""}`.trim(),
        tagIncludes: `${item?.tagIncludes || ""}`.trim(),
        inbox: (item?.inbox === "true" || item?.inbox === "false" ? item.inbox : "") as IWorkbenchRule["inbox"],
        actions: Object.entries(item?.actions || {}).reduce((result, [key, value]) => {
            const normalized = value == null ? null : `${value}`.trim();
            if (normalized != null && normalized !== "") {
                result[key] = normalized;
            }
            return result;
        }, {} as Record<string, string | null>),
    })).filter((item) => item.name).slice(0, 50);
};

const applyWorkbenchDashboard = (state: IWorkbenchState, dashboard: IWorkbenchDashboardPreset) => {
    state.activeTab = dashboard.activeTab;
    state.resultLayer = normalizeWorkbenchResultLayer(dashboard.resultLayer);
    state.query = dashboard.query;
    state.sortBy = normalizeWorkbenchSortBy(state.resultLayer, dashboard.sortBy);
    state.sortOrder = dashboard.sortOrder;
    state.views[state.activeTab] = normalizeWorkbenchView(state.activeTab, dashboard.view, state.resultLayer);
    state.groupBy = state.resultLayer === "blocks" ? "none" : normalizeWorkbenchGroupBy(dashboard.groupBy);
    state.currentDashboard = dashboard.name;
    state.currentViewTemplate = "";
};

const applyWorkbenchViewTemplate = (state: IWorkbenchState, template: IWorkbenchViewTemplate) => {
    state.activeTab = template.activeTab;
    state.resultLayer = normalizeWorkbenchResultLayer(template.resultLayer);
    state.query = template.query;
    state.sortBy = normalizeWorkbenchSortBy(state.resultLayer, template.sortBy);
    state.sortOrder = template.sortOrder;
    state.views[state.activeTab] = normalizeWorkbenchView(state.activeTab, template.view, state.resultLayer);
    state.groupBy = state.resultLayer === "blocks" ? "none" : normalizeWorkbenchGroupBy(template.groupBy);
    state.currentViewTemplate = template.name;
    state.currentDashboard = "";
};

const clearWorkbenchDashboardSelection = (state: IWorkbenchState) => {
    state.currentDashboard = "";
};

const clearWorkbenchViewTemplateSelection = (state: IWorkbenchState) => {
    state.currentViewTemplate = "";
};

const clearWorkbenchSavedSelections = (state: IWorkbenchState) => {
    clearWorkbenchDashboardSelection(state);
    clearWorkbenchViewTemplateSelection(state);
};

const getPrimaryTime = (item: IWorkbenchItem) => {
    return item.eventAt || item.dueAt || item.capturedTs || item.updatedAt;
};

const matchWorkbenchRule = (rule: IWorkbenchRule, item: Partial<IWorkbenchItem>) => {
    if (rule.enabled === false) {
        return false;
    }
    if (rule.matchKind !== "*" && (item.entityKind || "doc") !== rule.matchKind) {
        return false;
    }
    if (rule.matchType !== "*" && item.type !== rule.matchType) {
        return false;
    }
    if (rule.inbox && `${!!item.inbox}` !== rule.inbox) {
        return false;
    }
    if (rule.titleIncludes && !(item.title || "").toLowerCase().includes(rule.titleIncludes.toLowerCase())) {
        return false;
    }
    if (rule.notebookIncludes && !(item.notebook || "").toLowerCase().includes(rule.notebookIncludes.toLowerCase())) {
        return false;
    }
    if (rule.projectIncludes && !(item.project || "").toLowerCase().includes(rule.projectIncludes.toLowerCase())) {
        return false;
    }
    if (rule.tagIncludes) {
        const tags = (item.tags || []).map((tag) => `${tag}`.toLowerCase());
        if (!tags.some((tag) => tag.includes(rule.tagIncludes.toLowerCase()))) {
            return false;
        }
    }
    return true;
};

const applyWorkbenchRulesToAttrs = (item: Partial<IWorkbenchItem>, attrs: Record<string, string | null>) => {
    const state = getState();
    if (!state.rules.length) {
        return attrs;
    }
    const nextAttrs = {...attrs};
    const currentType = `${nextAttrs[WorkbenchAttr.type] || item.type || "note"}`.trim() as IWorkbenchItem["type"];
    const currentProject = `${nextAttrs[WorkbenchAttr.project] || item.project || ""}`.trim();
    const currentTags = splitWorkbenchTags(`${nextAttrs.tags || (item.tags || []).join(",")}`);
    const currentInbox = `${nextAttrs[WorkbenchAttr.inbox] == null ? `${!!item.inbox}` : nextAttrs[WorkbenchAttr.inbox]}`;
    const candidate: Partial<IWorkbenchItem> = {
        ...item,
        type: currentType,
        project: currentProject,
        tags: currentTags,
        inbox: currentInbox === "true",
    };
    state.rules.forEach((rule) => {
        if (!matchWorkbenchRule(rule, candidate)) {
            return;
        }
        Object.entries(rule.actions || {}).forEach(([key, value]) => {
            if (value == null || `${value}`.trim() === "") {
                return;
            }
            if (nextAttrs[key] != null && `${nextAttrs[key]}`.trim() !== "") {
                return;
            }
            nextAttrs[key] = `${value}`.trim();
        });
    });
    return nextAttrs;
};

const getGroupValue = (item: IWorkbenchItem, groupBy: TWorkbenchGroupBy) => {
    switch (groupBy) {
        case "type":
            return typeLabel(item.type);
        case "status":
            return statusLabel(item.status);
        case "project":
            return item.project || window.sourceflow.languages.workbenchGroupEmptyProject;
        case "notebook":
            return item.notebook || window.sourceflow.languages.workbenchGroupEmptyNotebook;
        case "date": {
            const time = getPrimaryTime(item);
            return time ? formatDateTime(time) : window.sourceflow.languages.workbenchTimelineNoTime;
        }
        default:
            return "";
    }
};

const shouldRenderGroupedResults = (state: IWorkbenchState) => {
    if (state.groupBy === "none" || state.activeTab === "review") {
        return false;
    }
    const activeView = getActiveView(state);
    return !["board", "timeline", "calendar"].includes(activeView);
};

const getWorkbenchConversionAttrs = (targetType: IWorkbenchItem["type"]) => {
    const attrs: Record<string, string | null> = {
        [WorkbenchAttr.type]: targetType,
        [WorkbenchAttr.inbox]: "false",
    };
    switch (targetType) {
        case "task":
            attrs[WorkbenchAttr.status] = "todo";
            attrs[WorkbenchAttr.eventTime] = "";
            attrs[WorkbenchAttr.location] = "";
            break;
        case "event":
            attrs[WorkbenchAttr.status] = "scheduled";
            attrs[WorkbenchAttr.dueDate] = "";
            break;
        case "project":
            attrs[WorkbenchAttr.status] = "active";
            attrs[WorkbenchAttr.dueDate] = "";
            attrs[WorkbenchAttr.eventTime] = "";
            attrs[WorkbenchAttr.location] = "";
            break;
        default:
            attrs[WorkbenchAttr.status] = "open";
    }
    return attrs;
};

const parseQuery = (query: string) => {
    const parsed = {
        text: [] as string[],
        filters: {} as Record<string, string[]>,
    };
    const tokens: string[] = query.match(/"[^"]+"|\S+/g) ?? [];
    tokens.forEach((raw) => {
        const token = raw.replace(/^"(.*)"$/, "$1").trim();
        if (!token) {
            return;
        }
        const index = token.indexOf(":");
        if (index > 0) {
            const key = token.slice(0, index).toLowerCase();
            const value = token.slice(index + 1).trim();
            if (value && ["kind", "type", "status", "project", "tag", "notebook", "inbox", "before", "after", "has", "flag"].includes(key)) {
                if (!parsed.filters[key]) {
                    parsed.filters[key] = [];
                }
                parsed.filters[key].push(value.toLowerCase());
                return;
            }
        }
        parsed.text.push(token.toLowerCase());
    });
    return parsed;
};

const formatDateTime = (time: number, withTime = false) => {
    if (!time) {
        return "";
    }
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    const dateText = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
    if (!withTime) {
        return dateText;
    }
    return `${dateText} ${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`;
};

const formatDateOffset = (offsetDays: number) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offsetDays);
    return formatDateTime(date.getTime());
};

const getWeekdayLabels = () => {
    if (window.sourceflow.config.lang === "zh_CN") {
        return ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    }
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
};

const renderListItem = (item: IWorkbenchItem, selectable = true) => {
    const time = item.type === "event" ? formatDateTime(item.eventAt, true) : formatDateTime(item.dueAt || item.capturedTs || item.updatedAt, !!item.eventAt);
    return `<div class="b3-card fn__flex workbench-item" style="padding: 12px;gap: 12px;align-items: flex-start;margin-bottom: 8px;" data-item-id="${item.id}">
    ${selectable ? `<input type="checkbox" class="b3-switch" data-role="select-item" data-id="${item.id}">` : ""}
    <div class="fn__flex-1">
        <div class="fn__flex" style="gap: 8px;flex-wrap: wrap;align-items: center;">
            <span class="b3-chip">${escapeHTML(typeLabel(item.type))}</span>
            ${item.entityKind === "block" ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.workbenchBlockItem)}</span>` : ""}
            <span class="b3-chip">${escapeHTML(statusLabel(item.status))}</span>
            ${item.inbox ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.inbox)}</span>` : ""}
            ${item.hasBoundView ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.workbenchHasView)}</span>` : ""}
            ${time ? `<span class="ft__secondary">${escapeHTML(time)}</span>` : ""}
        </div>
        <div style="font-weight: 600;margin-top: 8px;">${escapeHTML(item.title)}</div>
        ${item.preview ? `<div class="ft__secondary" style="margin-top: 4px;">${escapeHTML(item.preview)}</div>` : ""}
        <div class="ft__secondary" style="margin-top: 8px;font-size: 12px;">
            ${escapeHTML(item.notebook)} / ${escapeHTML(item.hPath || item.path)}
            ${item.project ? ` · ${escapeHTML(window.sourceflow.languages.project)}: <button class="b3-button b3-button--outline" style="height:22px;padding:0 6px;min-height:auto;" data-action="append-query-token" data-token="${escapeAttr(`project:"${item.project}"`)}">${escapeHTML(item.project)}</button>` : ""}
        </div>
        ${item.tags.length ? `<div class="ft__secondary" style="margin-top: 4px;font-size: 12px;">#${escapeHTML(item.tags.join(" #"))}</div>` : ""}
        <div class="fn__flex" style="gap: 8px;flex-wrap: wrap;margin-top: 8px;">
            ${item.refCount ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.ref)} ${item.refCount}</span>` : ""}
            ${item.assetCount ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.workbenchHasAsset)} ${item.assetCount}</span>` : ""}
            ${item.subFileCount ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.workbenchHasSubdoc)} ${item.subFileCount}</span>` : ""}
        </div>
    </div>
    <div class="fn__flex-column" style="gap: 6px;">
        <button class="b3-button b3-button--outline" data-action="open-item" data-id="${item.id}">${window.sourceflow.languages.open}</button>
        <button class="b3-button b3-button--outline" data-action="edit-item" data-id="${item.id}">${window.sourceflow.languages.workbenchEditMeta}</button>
        ${item.inbox ? `<button class="b3-button b3-button--outline" data-action="clear-inbox" data-id="${item.id}">${window.sourceflow.languages.workbenchClearInbox}</button>` : ""}
        ${item.inbox && item.type !== "task" ? `<button class="b3-button b3-button--outline" data-action="convert-item" data-id="${item.id}" data-type="task">${window.sourceflow.languages.workbenchConvertTask}</button>` : ""}
        ${item.inbox && item.type !== "event" ? `<button class="b3-button b3-button--outline" data-action="convert-item" data-id="${item.id}" data-type="event">${window.sourceflow.languages.workbenchConvertEvent}</button>` : ""}
        ${item.inbox && item.type !== "project" ? `<button class="b3-button b3-button--outline" data-action="convert-item" data-id="${item.id}" data-type="project">${window.sourceflow.languages.workbenchConvertProject}</button>` : ""}
        ${item.type === "project" ? `<button class="b3-button b3-button--outline" data-action="project-capture" data-mode="task" data-project="${escapeAttr(item.title)}">${window.sourceflow.languages.workbenchProjectNewTask}</button>` : ""}
        ${item.type === "project" ? `<button class="b3-button b3-button--outline" data-action="project-capture" data-mode="event" data-project="${escapeAttr(item.title)}">${window.sourceflow.languages.workbenchProjectNewEvent}</button>` : ""}
        ${item.type === "project" ? `<button class="b3-button b3-button--outline" data-action="project-capture" data-mode="note" data-project="${escapeAttr(item.title)}">${window.sourceflow.languages.workbenchProjectNewNote}</button>` : ""}
        ${item.type === "task" && item.status !== "done" ? `<button class="b3-button b3-button--outline" data-action="set-due" data-id="${item.id}" data-offset="0">${window.sourceflow.languages.workbenchScheduleToday}</button>` : ""}
        ${item.type === "task" && item.status !== "done" ? `<button class="b3-button b3-button--outline" data-action="set-due" data-id="${item.id}" data-offset="1">${window.sourceflow.languages.workbenchScheduleTomorrow}</button>` : ""}
        ${item.type === "task" && item.status !== "done" ? `<button class="b3-button b3-button--outline" data-action="set-due" data-id="${item.id}" data-offset="7">${window.sourceflow.languages.workbenchScheduleNextWeek}</button>` : ""}
        ${item.type === "task" ? `<button class="b3-button b3-button--outline" data-action="set-status" data-id="${item.id}" data-status="${item.status === "done" ? "todo" : "done"}">${item.status === "done" ? window.sourceflow.languages.workbenchTodo : window.sourceflow.languages.workbenchDone}</button>` : ""}
        ${item.hasBoundView ? `<button class="b3-button b3-button--outline" data-action="open-bound-view" data-id="${item.id}">${window.sourceflow.languages.workbenchOpenBoundView}</button>` : ""}
    </div>
</div>`;
};

const renderTaskBoard = (items: IWorkbenchItem[]) => {
    const columns = [
        {key: "todo", title: window.sourceflow.languages.workbenchTodo},
        {key: "doing", title: window.sourceflow.languages.workbenchDoing},
        {key: "done", title: window.sourceflow.languages.workbenchDone},
    ];
    return `<div class="fn__flex" style="gap: 12px;align-items: stretch;overflow-x: auto;">
${columns.map((column) => {
        const cards = items.filter((item) => item.status === column.key);
        return `<div class="b3-card fn__flex-1" style="min-width: 240px;padding: 12px;">
    <div class="fn__flex" style="justify-content: space-between;align-items: center;margin-bottom: 12px;">
        <strong>${escapeHTML(column.title)}</strong>
        <span class="ft__secondary">${cards.length}</span>
    </div>
    ${cards.length ? cards.map((item) => renderListItem(item, true)).join("") : `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`}
</div>`;
    }).join("")}
</div>`;
};

const renderStatusBoard = (items: IWorkbenchItem[]) => {
    const orderedStatuses = ["todo", "doing", "done", "scheduled", "active", "on-hold", "completed", "open"];
    const availableStatuses = Array.from(new Set(items.map((item) => item.status))).sort((left, right) => {
        const leftIndex = orderedStatuses.indexOf(left);
        const rightIndex = orderedStatuses.indexOf(right);
        if (leftIndex === -1 && rightIndex === -1) {
            return left.localeCompare(right);
        }
        if (leftIndex === -1) {
            return 1;
        }
        if (rightIndex === -1) {
            return -1;
        }
        return leftIndex - rightIndex;
    });
    if (!availableStatuses.length) {
        return `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`;
    }
    return `<div class="fn__flex" style="gap: 12px;align-items: stretch;overflow-x: auto;">
${availableStatuses.map((status) => {
        const cards = items.filter((item) => item.status === status);
        return `<div class="b3-card fn__flex-1" style="min-width: 260px;padding: 12px;">
    <div class="fn__flex" style="justify-content: space-between;align-items: center;margin-bottom: 12px;">
        <strong>${escapeHTML(statusLabel(status))}</strong>
        <span class="ft__secondary">${cards.length}</span>
    </div>
    ${cards.length ? cards.map((item) => renderListItem(item, true)).join("") : `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`}
</div>`;
    }).join("")}
</div>`;
};

const renderCalendar = (items: IWorkbenchItem[], monthOffset: number) => {
    const base = new Date();
    const month = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const startWeek = start.getDay() === 0 ? 7 : start.getDay();
    const totalDays = end.getDate();
    const cells: string[] = [];
    for (let i = 1; i < startWeek; i++) {
        cells.push(`<div class="b3-card" style="min-height: 140px;padding: 8px;background: var(--b3-theme-surface-lighter);"></div>`);
    }
    for (let day = 1; day <= totalDays; day++) {
        const current = new Date(month.getFullYear(), month.getMonth(), day);
        const dayKey = formatDateTime(current.getTime());
        const dayItems = items.filter((item) => formatDateTime(item.eventAt || item.dueAt) === dayKey);
        cells.push(`<div class="b3-card" style="min-height: 140px;padding: 8px;">
    <div class="fn__flex" style="justify-content: space-between;align-items: center;margin-bottom: 8px;">
        <strong>${day}</strong>
        <span class="ft__secondary">${dayItems.length ? dayItems.length : ""}</span>
    </div>
    <div style="display: flex;flex-direction: column;gap: 6px;">
        ${dayItems.slice(0, 4).map((item) => `<button class="b3-button b3-button--outline fn__block" style="text-align: left;justify-content: flex-start;" data-action="open-item" data-id="${item.id}">
            <span class="b3-chip">${escapeHTML(typeLabel(item.type))}</span>
            <span style="margin-left: 6px;">${escapeHTML(item.title)}</span>
        </button>`).join("")}
        ${dayItems.length > 4 ? `<div class="ft__secondary">+${dayItems.length - 4}</div>` : ""}
    </div>
</div>`);
    }
    return `<div class="fn__flex" style="justify-content: space-between;align-items: center;margin-bottom: 12px;">
    <button class="b3-button b3-button--outline" data-action="calendar-prev">${window.sourceflow.languages.previous}</button>
    <strong>${month.getFullYear()}-${`${month.getMonth() + 1}`.padStart(2, "0")}</strong>
    <button class="b3-button b3-button--outline" data-action="calendar-next">${window.sourceflow.languages.next}</button>
</div>
<div style="display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));gap: 8px;">
    ${getWeekdayLabels().map((item) => `<div class="ft__secondary" style="text-align:center;">${escapeHTML(item)}</div>`).join("")}
    ${cells.join("")}
</div>`;
};

const renderProjects = (items: IWorkbenchItem[], allItems: IWorkbenchItem[]) => {
    return `<div class="fn__flex-column" style="gap: 12px;">
${items.map((item) => {
        const relatedItems = allItems.filter((entry) => entry.project && entry.project === item.title);
        const relatedTasks = relatedItems.filter((task) => task.type === "task");
        const relatedEvents = relatedItems.filter((entry) => entry.type === "event");
        const relatedNotes = relatedItems.filter((entry) => ["doc", "note", "url", "attachment"].includes(entry.type));
        const activeCount = relatedTasks.filter((task) => task.status !== "done").length;
        const nextDue = relatedTasks.filter((task) => task.dueAt).sort((a, b) => a.dueAt - b.dueAt)[0];
        return `<div class="b3-card" style="padding: 16px;">
    <div class="fn__flex" style="justify-content: space-between;align-items: center;gap: 8px;">
        <div>
            <div style="font-weight: 600;">${escapeHTML(item.title)}</div>
            <div class="ft__secondary">${escapeHTML(statusLabel(item.status))}</div>
        </div>
        <div class="fn__flex" style="gap: 8px;">
            <button class="b3-button b3-button--outline" data-action="open-item" data-id="${item.id}">${window.sourceflow.languages.open}</button>
            <button class="b3-button b3-button--outline" data-action="edit-item" data-id="${item.id}">${window.sourceflow.languages.workbenchEditMeta}</button>
            <button class="b3-button b3-button--outline" data-action="set-status" data-id="${item.id}" data-status="${item.status === "completed" ? "active" : "completed"}">${item.status === "completed" ? window.sourceflow.languages.workbenchActive : window.sourceflow.languages.workbenchCompleted}</button>
            <button class="b3-button b3-button--outline" data-action="project-capture" data-mode="task" data-project="${escapeAttr(item.title)}">${window.sourceflow.languages.workbenchProjectNewTask}</button>
            <button class="b3-button b3-button--outline" data-action="project-capture" data-mode="event" data-project="${escapeAttr(item.title)}">${window.sourceflow.languages.workbenchProjectNewEvent}</button>
            <button class="b3-button b3-button--outline" data-action="project-capture" data-mode="note" data-project="${escapeAttr(item.title)}">${window.sourceflow.languages.workbenchProjectNewNote}</button>
            <button class="b3-button b3-button--outline" data-action="open-project-tab" data-tab="task" data-project="${escapeAttr(item.title)}">${window.sourceflow.languages.workbenchProjectTasks}</button>
            <button class="b3-button b3-button--outline" data-action="open-project-tab" data-tab="calendar" data-view="timeline" data-project="${escapeAttr(item.title)}">${window.sourceflow.languages.workbenchProjectTimeline}</button>
        </div>
    </div>
    ${item.goal ? `<div style="margin-top: 12px;"><strong>${escapeHTML(window.sourceflow.languages.captureProjectGoal)}</strong><div class="ft__secondary" style="margin-top: 4px;">${escapeHTML(item.goal)}</div></div>` : ""}
    ${item.nextStep ? `<div style="margin-top: 12px;"><strong>${escapeHTML(window.sourceflow.languages.captureProjectNextStep)}</strong><div class="ft__secondary" style="margin-top: 4px;">${escapeHTML(item.nextStep)}</div></div>` : ""}
    <div class="fn__flex" style="gap: 12px;flex-wrap: wrap;margin-top: 12px;">
        <span class="b3-chip">${window.sourceflow.languages.workbenchProjectOpenTasks} ${activeCount}</span>
        <span class="b3-chip">${window.sourceflow.languages.workbenchProjectAllTasks} ${relatedTasks.length}</span>
        <span class="b3-chip">${window.sourceflow.languages.eventCapture} ${relatedEvents.length}</span>
        <span class="b3-chip">${window.sourceflow.languages.quickCapture} ${relatedNotes.length}</span>
        ${nextDue ? `<span class="b3-chip">${window.sourceflow.languages.taskDueDate} ${escapeHTML(formatDateTime(nextDue.dueAt))}</span>` : ""}
    </div>
</div>`;
    }).join("") || `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`}
</div>`;
};

const renderWorkbenchTableStatusEditor = (item: IWorkbenchItem) => {
    return `<select class="b3-select fn__block" data-inline-action="set-status" data-id="${item.id}">
        ${getStatusOptions(item.type).map((status) => `<option value="${status}" ${status === item.status ? "selected" : ""}>${escapeHTML(statusLabel(status))}</option>`).join("")}
    </select>`;
};

const renderWorkbenchTableTimeEditor = (item: IWorkbenchItem) => {
    if (item.type === "task") {
        return `<input class="b3-text-field fn__block" type="date" value="${escapeAttr(item.dueDate)}" data-inline-action="set-due-date" data-id="${item.id}" data-original="${escapeAttr(item.dueDate)}">`;
    }
    if (item.type === "event") {
        return `<input class="b3-text-field fn__block" type="datetime-local" value="${escapeAttr(item.eventTime)}" data-inline-action="set-event-time" data-id="${item.id}" data-original="${escapeAttr(item.eventTime)}">`;
    }
    return `<span class="ft__secondary">-</span>`;
};

const renderWorkbenchTableTextEditor = (value: string, action: string, id: string, placeholder = "", extraAttrs = "") => {
    return `<input class="b3-text-field fn__block" spellcheck="false" value="${escapeAttr(value)}" placeholder="${escapeAttr(placeholder)}" data-inline-action="${action}" data-id="${id}" data-original="${escapeAttr(value)}" ${extraAttrs}>`;
};

const renderTableView = (items: IWorkbenchItem[], allItems: IWorkbenchItem[] = items) => {
    if (!items.length) {
        return `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`;
    }
    const projectOptions = Array.from(new Set(allItems.filter((item) => item.type === "project" && item.title).map((item) => item.title))).sort((left, right) => left.localeCompare(right));
    return `<div class="b3-card" style="padding: 0;overflow: auto;">
    <datalist id="workbenchTableProjectOptions">${projectOptions.map((title) => `<option value="${escapeAttr(title)}"></option>`).join("")}</datalist>
    <table style="width: 100%;border-collapse: collapse;min-width: 920px;">
        <thead>
            <tr>
                <th style="width: 44px;padding: 10px;border-bottom: 1px solid var(--b3-border-color);"></th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.name)}</th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.type)}</th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.inbox)}</th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.status)}</th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.project)}</th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.eventTime)}</th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">Tags</th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.ref)}</th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.workbenchHasAsset)}</th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.workbenchHasSubdoc)}</th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.workbenchHasView)}</th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.fileTree)}</th>
                <th style="width: 168px;padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.open)}</th>
            </tr>
        </thead>
        <tbody>
            ${items.map((item) => {
                return `<tr>
                    <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">
                        <input type="checkbox" class="b3-switch" data-role="select-item" data-id="${item.id}">
                    </td>
                    <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">
                        <div style="font-weight: 600;">${escapeHTML(item.title)}</div>
                        ${item.preview ? `<div class="ft__secondary" style="margin-top: 4px;">${escapeHTML(item.preview)}</div>` : ""}
                    </td>
                    <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">${escapeHTML(typeLabel(item.type))}</td>
                    <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">
                        <input type="checkbox" class="b3-switch" data-inline-action="toggle-inbox" data-id="${item.id}" ${item.inbox ? "checked" : ""}>
                    </td>
                    <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">${renderWorkbenchTableStatusEditor(item)}</td>
                    <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">${renderWorkbenchTableTextEditor(item.project, "set-project", item.id, window.sourceflow.languages.optional, 'list="workbenchTableProjectOptions"')}</td>
                    <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">${renderWorkbenchTableTimeEditor(item)}</td>
                    <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">${renderWorkbenchTableTextEditor(item.tags.join(","), "set-tags", item.id, "tag1,tag2")}</td>
                    <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">${item.refCount || ""}</td>
                    <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">${item.assetCount || ""}</td>
                    <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">${item.subFileCount || ""}</td>
                    <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">${item.hasBoundView ? escapeHTML(window.sourceflow.languages.workbenchHasView) : ""}</td>
                    <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">${escapeHTML(item.notebook)} / ${escapeHTML(item.hPath || item.path)}</td>
                    <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">
                        <div class="fn__flex" style="gap: 8px;flex-wrap: wrap;">
                            <button class="b3-button b3-button--outline" data-action="open-item" data-id="${item.id}">${window.sourceflow.languages.open}</button>
                            ${item.hasBoundView ? `<button class="b3-button b3-button--outline" data-action="open-bound-view" data-id="${item.id}">${window.sourceflow.languages.workbenchOpenBoundView}</button>` : ""}
                            <button class="b3-button b3-button--outline" data-action="edit-item" data-id="${item.id}">${window.sourceflow.languages.workbenchEditMeta}</button>
                        </div>
                    </td>
                </tr>`;
            }).join("")}
        </tbody>
    </table>
</div>`;
};

const renderTimelineView = (items: IWorkbenchItem[]) => {
    if (!items.length) {
        return `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`;
    }
    const timelineItems = items.slice().sort((left, right) => {
        const leftTime = getPrimaryTime(left) || left.updatedAt;
        const rightTime = getPrimaryTime(right) || right.updatedAt;
        if (leftTime === rightTime) {
            return left.title.localeCompare(right.title);
        }
        return rightTime - leftTime;
    });
    const groups = new Map<string, IWorkbenchItem[]>();
    timelineItems.forEach((item) => {
        const time = getPrimaryTime(item);
        const key = time ? formatDateTime(time) : window.sourceflow.languages.workbenchTimelineNoTime;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(item);
    });
    return `<div class="fn__flex-column" style="gap: 12px;">
${Array.from(groups.entries()).map(([label, groupedItems]) => `<div class="b3-card" style="padding: 16px;">
    <div class="fn__flex" style="justify-content: space-between;align-items: center;margin-bottom: 12px;">
        <strong>${escapeHTML(label)}</strong>
        <span class="ft__secondary">${groupedItems.length}</span>
    </div>
    ${groupedItems.map((item) => renderListItem(item, true)).join("")}
</div>`).join("")}
</div>`;
};

const renderGroupedPanel = (state: IWorkbenchState, items: IWorkbenchItem[], allItems: IWorkbenchItem[]) => {
    if (!items.length) {
        return `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`;
    }
    const groups = new Map<string, IWorkbenchItem[]>();
    items.forEach((item) => {
        const key = getGroupValue(item, state.groupBy);
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(item);
    });
    const entries = Array.from(groups.entries()).sort((left, right) => {
        if (state.groupBy === "date") {
            if (left[0] === window.sourceflow.languages.workbenchTimelineNoTime) {
                return 1;
            }
            if (right[0] === window.sourceflow.languages.workbenchTimelineNoTime) {
                return -1;
            }
            return state.sortOrder === "asc" ? left[0].localeCompare(right[0]) : right[0].localeCompare(left[0]);
        }
        return left[0].localeCompare(right[0]);
    });
    return `<div class="fn__flex-column" style="gap: 12px;">
${entries.map(([label, groupedItems]) => {
        const content = state.activeTab === "project" && getActiveView(state) === "list"
            ? renderProjects(groupedItems, allItems)
            : getActiveView(state) === "table"
                ? renderTableView(groupedItems, allItems)
                : groupedItems.map((item) => renderListItem(item, true)).join("") || `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`;
        return `<div class="b3-card" style="padding: 16px;">
    <div class="fn__flex" style="justify-content: space-between;align-items: center;margin-bottom: 12px;">
        <strong>${escapeHTML(label)}</strong>
        <span class="ft__secondary">${groupedItems.length}</span>
    </div>
    ${content}
</div>`;
    }).join("")}
</div>`;
};

const renderMainPanel = (state: IWorkbenchState, visibleItems: IWorkbenchItem[], allItems: IWorkbenchItem[]) => {
    if (state.activeTab === "review") {
        return renderReview(visibleItems);
    }
    const activeView = getActiveView(state);
    if (state.activeTab === "task" && activeView === "board") {
        return renderTaskBoard(visibleItems);
    }
    if (state.activeTab === "calendar" && activeView === "calendar") {
        return renderCalendar(visibleItems, state.monthOffset);
    }
    if (state.activeTab === "project" && activeView === "board") {
        return renderStatusBoard(visibleItems);
    }
    if (state.activeTab === "project" && activeView === "list") {
        return renderProjects(visibleItems, allItems);
    }
    if (activeView === "table") {
        return renderTableView(visibleItems, allItems);
    }
    if (activeView === "timeline") {
        return renderTimelineView(visibleItems);
    }
    if (shouldRenderGroupedResults(state)) {
        return renderGroupedPanel(state, visibleItems, allItems);
    }
    return visibleItems.length ? visibleItems.map((item) => renderListItem(item, true)).join("") : `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`;
};

const shouldDeferWorkbenchPanelRender = (state: IWorkbenchState, visibleItems: IWorkbenchItem[], blocks: IWorkbenchSearchBlock[]) => {
    if (state.resultLayer === "blocks") {
        return blocks.length > 40;
    }
    if (state.activeTab === "review") {
        return visibleItems.length > 24;
    }
    if (shouldRenderGroupedResults(state)) {
        return visibleItems.length > 60;
    }
    const activeView = getActiveView(state);
    if (activeView === "table") {
        return visibleItems.length > 40;
    }
    if (activeView === "list") {
        return visibleItems.length > 60;
    }
    return false;
};

const renderWorkbenchPanelContent = (state: IWorkbenchState, visibleItems: IWorkbenchItem[], allItems: IWorkbenchItem[], blocks: IWorkbenchSearchBlock[]) => {
    return state.resultLayer === "blocks"
        ? renderBlockMainPanel(state, blocks)
        : renderMainPanel(state, visibleItems, allItems);
};

const getQuickFacetLabel = (facet: IWorkbenchFacet) => {
    switch (facet.token) {
        case "flag:overdue":
            return window.sourceflow.languages.workbenchFlagOverdue;
        case "flag:upcoming":
            return window.sourceflow.languages.workbenchFlagUpcoming;
        case "flag:today":
            return window.sourceflow.languages.workbenchFlagToday;
        case "flag:stale":
            return window.sourceflow.languages.workbenchFlagStale;
        case "flag:unprojected":
            return window.sourceflow.languages.workbenchFlagUnprojected;
        case "flag:untagged":
            return window.sourceflow.languages.workbenchFlagUntagged;
        case "has:ref":
            return window.sourceflow.languages.workbenchHasRef;
        case "has:asset":
            return window.sourceflow.languages.workbenchHasAsset;
        case "has:subdoc":
            return window.sourceflow.languages.workbenchHasSubdoc;
        case "has:view":
            return window.sourceflow.languages.workbenchHasView;
        default:
            return facet.name || facet.token;
    }
};

const renderFacetSection = (title: string, facets: IWorkbenchFacet[], formatter?: (facet: IWorkbenchFacet) => string) => {
    if (!facets?.length) {
        return "";
    }
    return `<div class="b3-card" style="padding: 12px;">
    <div class="ft__secondary" style="margin-bottom: 8px;">${escapeHTML(title)}</div>
    <div class="fn__flex" style="gap: 8px;flex-wrap: wrap;">
        ${facets.map((facet) => `<button class="b3-button b3-button--outline" data-action="append-query-token" data-token="${escapeAttr(facet.token)}">${escapeHTML((formatter ? formatter(facet) : facet.name) || facet.token)} <span class="ft__secondary">${facet.count}</span></button>`).join("")}
    </div>
</div>`;
};

const renderWorkbenchDashboardOptions = (state: IWorkbenchState) => {
    return state.dashboards.map((item) => `<option value="${escapeAttr(item.name)}" ${item.name === state.currentDashboard ? "selected" : ""}>${escapeHTML(item.name)}</option>`).join("");
};

const renderWorkbenchViewTemplateOptions = (state: IWorkbenchState) => {
    return state.viewTemplates.map((item) => `<option value="${escapeAttr(item.name)}" ${item.name === state.currentViewTemplate ? "selected" : ""}>${escapeHTML(item.name)}</option>`).join("");
};

const renderReviewSection = (title: string, items: IWorkbenchItem[]) => {
    return `<div class="b3-card" style="padding: 16px;">
    <div class="fn__flex" style="justify-content: space-between;align-items: center;margin-bottom: 12px;">
        <strong>${escapeHTML(title)}</strong>
        <span class="ft__secondary">${items.length}</span>
    </div>
    ${items.length ? items.slice(0, 8).map((item) => renderListItem(item, false)).join("") : `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`}
</div>`;
};

const collectReviewBuckets = (items: IWorkbenchItem[]) => {
    const now = Date.now();
    const nextWeek = now + 7 * 24 * 60 * 60 * 1000;
    const lastWeek = now - 7 * 24 * 60 * 60 * 1000;
    const overdueTasks = items
        .filter((item) => item.type === "task" && item.status !== "done" && item.dueAt && item.dueAt < now)
        .sort((a, b) => a.dueAt - b.dueAt);
    const upcomingItems = items
        .filter((item) => ((item.type === "task" && item.status !== "done" && item.dueAt) || (item.type === "event" && item.eventAt)) && getPrimaryTime(item) >= now && getPrimaryTime(item) <= nextWeek)
        .sort((a, b) => getPrimaryTime(a) - getPrimaryTime(b));
    const recentInbox = items
        .filter((item) => item.inbox && (item.capturedTs || item.updatedAt) >= lastWeek)
        .sort((a, b) => (b.capturedTs || b.updatedAt) - (a.capturedTs || a.updatedAt));
    const completedRecently = items
        .filter((item) => item.type === "task" && item.status === "done" && item.updatedAt >= lastWeek)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    const staleInbox = items
        .filter((item) => item.inbox && (item.capturedTs || item.updatedAt) < lastWeek)
        .sort((a, b) => (a.capturedTs || a.updatedAt) - (b.capturedTs || b.updatedAt));
    return {
        overdueTasks,
        upcomingItems,
        recentInbox,
        completedRecently,
        staleInbox,
    };
};

const renderReview = (items: IWorkbenchItem[]) => {
    const {overdueTasks, upcomingItems, recentInbox, completedRecently, staleInbox} = collectReviewBuckets(items);
    return `<div class="fn__flex-column" style="gap: 12px;">
${renderReviewSection(window.sourceflow.languages.workbenchReviewOverdue, overdueTasks)}
${renderReviewSection(window.sourceflow.languages.workbenchReviewUpcoming, upcomingItems)}
${renderReviewSection(window.sourceflow.languages.workbenchReviewRecent, recentInbox)}
${renderReviewSection(window.sourceflow.languages.workbenchReviewCompleted, completedRecently)}
${renderReviewSection(window.sourceflow.languages.workbenchReviewStale, staleInbox)}
</div>`;
};

const buildResultsMarkdown = (items: IWorkbenchItem[]) => {
    return items.map((item) => {
        const parts = [
            `- [${item.title || window.sourceflow.languages.untitled}](sf://blocks/${item.id})`,
            `类型：${typeLabel(item.type)}`,
            `状态：${statusLabel(item.status)}`,
        ];
        if (item.project) {
            parts.push(`项目：${item.project}`);
        }
        if (item.dueDate) {
            parts.push(`截止：${item.dueDate}`);
        }
        if (item.eventTime) {
            parts.push(`时间：${item.eventTime}`);
        }
        if (item.sourceURL) {
            parts.push(`来源：${item.sourceURL}`);
        }
        return parts.join(" | ");
    }).join("\n");
};

const buildBlockResultsMarkdown = (blocks: IWorkbenchSearchBlock[]) => {
    return blocks.map((block) => {
        const parts = [
            `- [${block.hPath || block.id}](sf://blocks/${block.id})`,
            `文档：${getBlockNotebookName(block)}`,
        ];
        if (block.content) {
            parts.push(`内容：${block.content.replace(/\r?\n/g, " ").trim()}`);
        }
        if (block.updated) {
            parts.push(`更新：${formatWorkbenchBlockUpdated(block)}`);
        }
        return parts.join(" | ");
    }).join("\n");
};

const toCSVCell = (value: string) => {
    const normalized = `${value || ""}`.replace(/\r?\n/g, " ").trim();
    return `"${normalized.replace(/"/g, "\"\"")}"`;
};

const buildResultsCSV = (items: IWorkbenchItem[]) => {
    const header = [
        "title",
        "type",
        "status",
        "inbox",
        "project",
        "dueDate",
        "eventTime",
        "location",
        "sourceURL",
        "tags",
        "refCount",
        "assetCount",
        "subFileCount",
        "hasBoundView",
        "notebook",
        "path",
        "created",
        "updated",
        "id",
    ];
    const rows = items.map((item) => [
        item.title,
        typeLabel(item.type),
        statusLabel(item.status),
        item.inbox ? "true" : "false",
        item.project,
        item.dueDate,
        item.eventTime,
        item.location,
        item.sourceURL,
        item.tags.join(", "),
        `${item.refCount || 0}`,
        `${item.assetCount || 0}`,
        `${item.subFileCount || 0}`,
        item.hasBoundView ? "true" : "false",
        item.notebook,
        item.hPath || item.path,
        item.created,
        item.updated,
        item.id,
    ].map((value) => toCSVCell(value)).join(","));
    return [header.join(","), ...rows].join("\n");
};

const buildBlockResultsCSV = (blocks: IWorkbenchSearchBlock[]) => {
    const header = ["doc", "content", "notebook", "updated", "rootID", "blockID"];
    const rows = blocks.map((block) => [
        block.hPath || block.id,
        block.content || "",
        getBlockNotebookName(block),
        formatWorkbenchBlockUpdated(block),
        getWorkbenchBlockRootID(block),
        block.id,
    ].map((value) => toCSVCell(value)).join(","));
    return [header.join(","), ...rows].join("\n");
};

const downloadTextFile = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob([content], {type: mimeType});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const buildExportFileBaseName = (state: IWorkbenchState) => {
    const stamp = formatDateTime(Date.now(), true).replace(/[: ]/g, "-");
    return `workbench-${state.activeTab}-${state.resultLayer}-${stamp}`;
};

const buildFacetMarkdown = (title: string, facets: IWorkbenchFacet[], formatter?: (facet: IWorkbenchFacet) => string) => {
    if (!facets?.length) {
        return "";
    }
    const values = facets.map((facet) => `${formatter ? formatter(facet) : facet.name} (${facet.count})`).join(" / ");
    return `## ${title}\n\n${values}\n`;
};

const buildSummaryMarkdown = (summary: IWorkbenchSummary) => {
    const lines = [
        `- ${window.sourceflow.languages.workbenchSummary.replace("${x}", String(summary.filtered))}`,
        `- ${window.sourceflow.languages.inbox}: ${summary.inboxCount}`,
        `- ${window.sourceflow.languages.workbenchLibrary}: ${summary.docCount}`,
        `- ${window.sourceflow.languages.workbenchHasView}: ${summary.viewCount}`,
        `- ${window.sourceflow.languages.taskCapture}: ${summary.taskCount}`,
        `- ${window.sourceflow.languages.eventCapture}: ${summary.eventCount}`,
        `- ${window.sourceflow.languages.project}: ${summary.projectCount}`,
    ];
    if (summary.refTotal) {
        lines.push(`- ${window.sourceflow.languages.workbenchHasRef}: ${summary.refTotal}`);
    }
    if (summary.assetTotal) {
        lines.push(`- ${window.sourceflow.languages.workbenchHasAsset}: ${summary.assetTotal}`);
    }
    if (summary.subFileTotal) {
        lines.push(`- ${window.sourceflow.languages.workbenchHasSubdoc}: ${summary.subFileTotal}`);
    }
    return `## ${window.sourceflow.languages.summary}\n\n${lines.join("\n")}\n`;
};

const buildWorkbenchResultLayerMarkdown = (state: IWorkbenchState, blockCount = 0, blockScopeCount = 0) => {
    const lines = [
        `- ${window.sourceflow.languages.workbenchResultLayer}: ${getWorkbenchResultLayerLabel(state.resultLayer)}`,
    ];
    if (state.resultLayer === "blocks") {
        lines.push(`- ${window.sourceflow.languages.workbenchBlockSummary.replace("${x}", String(blockCount)).replace("${y}", String(blockScopeCount))}`);
    }
    return lines.join("\n");
};

const buildWorkbenchLiveBlockQuerySQL = (state: IWorkbenchState) => {
    const parsed = parseQuery(state.query);
    if (!parsed.text.length) {
        return "SELECT * FROM blocks WHERE 1 = 0";
    }
    const scopeState = Object.assign({}, state, {resultLayer: "items" as TWorkbenchResultLayer, query: buildFilterOnlyQuery(parsed)});
    const rootConditions = buildWorkbenchLiveRootConditions(scopeState, parseQuery(scopeState.query), false);
    const blockConditions = ["type != 'd'"];
    parsed.text.forEach((value) => {
        const like = sqlQuote(`%${sqlLikeValue(value)}%`);
        blockConditions.push(`(content LIKE ${like} ESCAPE '\\' OR markdown LIKE ${like} ESCAPE '\\' OR hpath LIKE ${like} ESCAPE '\\' OR tag LIKE ${like} ESCAPE '\\' OR ial LIKE ${like} ESCAPE '\\')`);
    });
    let orderBy = "updated DESC";
    if (state.sortBy === "title") {
        orderBy = `hpath ${state.sortOrder === "asc" ? "ASC" : "DESC"}, content ${state.sortOrder === "asc" ? "ASC" : "DESC"}`;
    } else {
        orderBy = `updated ${state.sortOrder === "asc" ? "ASC" : "DESC"}`;
    }
    return `SELECT * FROM blocks WHERE ${blockConditions.join(" AND ")} AND root_id IN (SELECT id FROM blocks WHERE type = 'd' AND ${rootConditions.join(" AND ")}) ORDER BY ${orderBy} LIMIT 256`;
};

const buildWorkbenchLiveEmbedMarkdown = (state: IWorkbenchState) => `{{ ${state.resultLayer === "blocks" ? buildWorkbenchLiveBlockQuerySQL(state) : buildWorkbenchLiveQuerySQL(state)} }}`;

const buildWorkbenchReportMarkdown = (state: IWorkbenchState, summary: IWorkbenchSummary, items: IWorkbenchItem[], blocks: IWorkbenchSearchBlock[] = [], blockScopeCount = 0) => {
    const title = `${window.sourceflow.languages.workbenchReportTitle} ${formatDateTime(Date.now(), true)}`;
    const activeView = getActiveView(state);
    const isBlockLayer = state.resultLayer === "blocks";
    const sections = [
        `# ${title}`,
        "",
        `- ${window.sourceflow.languages.workbench}: ${getWorkbenchTabLabel(state.activeTab)}`,
        `- ${window.sourceflow.languages.workbenchQuery}: ${state.query || window.sourceflow.languages.workbenchGroupNone}`,
        `- ${window.sourceflow.languages.workbenchView}: ${getWorkbenchViewLabel(state.activeTab, activeView, state.resultLayer)}`,
        `- ${window.sourceflow.languages.workbenchGroupBy}: ${state.resultLayer === "blocks" ? window.sourceflow.languages.workbenchGroupNone : (getGroupByOptions().find((item) => item.value === state.groupBy)?.label || window.sourceflow.languages.workbenchGroupNone)}`,
        state.currentDashboard ? `- ${window.sourceflow.languages.workbenchDashboard}: ${state.currentDashboard}` : "",
        buildWorkbenchResultLayerMarkdown(state, blocks.length, blockScopeCount),
        "",
        buildSummaryMarkdown(summary),
        buildFacetMarkdown(window.sourceflow.languages.workbenchFacetQuick, summary.quickFilters || [], getQuickFacetLabel),
        buildFacetMarkdown(window.sourceflow.languages.workbenchFacetProject, summary.projects || []),
        buildFacetMarkdown(window.sourceflow.languages.workbenchFacetTag, summary.tags || [], (facet) => `#${facet.name}`),
        "## " + window.sourceflow.languages.workbenchLiveEmbedIntoNote,
        "",
        buildWorkbenchLiveEmbedMarkdown(state),
        "",
        "## " + (isBlockLayer ? window.sourceflow.languages.workbenchLayerBlocks : window.sourceflow.languages.workbench),
        "",
        isBlockLayer ? buildBlockResultsMarkdown(blocks.slice(0, 120)) : buildResultsMarkdown(items.slice(0, 80)),
    ].filter(Boolean);
    return sections.join("\n");
};

const buildWorkbenchReviewMarkdown = (items: IWorkbenchItem[]) => {
    const title = `${window.sourceflow.languages.workbenchReviewTitle} ${formatDateTime(Date.now())}`;
    const {overdueTasks, upcomingItems, recentInbox, completedRecently, staleInbox} = collectReviewBuckets(items);
    const sections = [
        `# ${title}`,
        "",
        `## ${window.sourceflow.languages.workbenchReviewOverdue}`,
        "",
        overdueTasks.length ? buildResultsMarkdown(overdueTasks.slice(0, 40)) : `- ${window.sourceflow.languages.workbenchEmpty}`,
        "",
        `## ${window.sourceflow.languages.workbenchReviewUpcoming}`,
        "",
        upcomingItems.length ? buildResultsMarkdown(upcomingItems.slice(0, 40)) : `- ${window.sourceflow.languages.workbenchEmpty}`,
        "",
        `## ${window.sourceflow.languages.workbenchReviewRecent}`,
        "",
        recentInbox.length ? buildResultsMarkdown(recentInbox.slice(0, 40)) : `- ${window.sourceflow.languages.workbenchEmpty}`,
        "",
        `## ${window.sourceflow.languages.workbenchReviewCompleted}`,
        "",
        completedRecently.length ? buildResultsMarkdown(completedRecently.slice(0, 40)) : `- ${window.sourceflow.languages.workbenchEmpty}`,
        "",
        `## ${window.sourceflow.languages.workbenchReviewStale}`,
        "",
        staleInbox.length ? buildResultsMarkdown(staleInbox.slice(0, 40)) : `- ${window.sourceflow.languages.workbenchEmpty}`,
    ];
    return sections.join("\n");
};

const buildWorkbenchDashboardMarkdown = (state: IWorkbenchState, summary: IWorkbenchSummary, items: IWorkbenchItem[], blocks: IWorkbenchSearchBlock[] = [], blockScopeCount = 0) => {
    const title = `${window.sourceflow.languages.workbenchDashboardTitle} ${formatDateTime(Date.now(), true)}`;
    const {overdueTasks, upcomingItems, staleInbox} = collectReviewBuckets(items);
    const isBlockLayer = state.resultLayer === "blocks";
    const sections = [
        `# ${title}`,
        "",
        `- ${window.sourceflow.languages.workbench}: ${getWorkbenchTabLabel(state.activeTab)}`,
        `- ${window.sourceflow.languages.workbenchDashboard}: ${state.currentDashboard || window.sourceflow.languages.workbenchGroupNone}`,
        `- ${window.sourceflow.languages.workbenchQuery}: ${state.query || window.sourceflow.languages.workbenchGroupNone}`,
        `- ${window.sourceflow.languages.workbenchView}: ${getWorkbenchViewLabel(state.activeTab, getActiveView(state), state.resultLayer)}`,
        `- ${window.sourceflow.languages.workbenchGroupBy}: ${state.resultLayer === "blocks" ? window.sourceflow.languages.workbenchGroupNone : (getGroupByOptions().find((item) => item.value === state.groupBy)?.label || window.sourceflow.languages.workbenchGroupNone)}`,
        buildWorkbenchResultLayerMarkdown(state, blocks.length, blockScopeCount),
        "",
        buildSummaryMarkdown(summary),
        buildFacetMarkdown(window.sourceflow.languages.workbenchFacetQuick, summary.quickFilters || [], getQuickFacetLabel),
        buildFacetMarkdown(window.sourceflow.languages.workbenchFacetProject, summary.projects || []),
        buildFacetMarkdown(window.sourceflow.languages.workbenchFacetTag, summary.tags || [], (facet) => `#${facet.name}`),
        "## " + window.sourceflow.languages.workbenchLiveEmbedIntoNote,
        "",
        buildWorkbenchLiveEmbedMarkdown(state),
        "",
        `## ${window.sourceflow.languages.workbenchReviewOverdue}`,
        "",
        overdueTasks.length ? buildResultsMarkdown(overdueTasks.slice(0, 20)) : `- ${window.sourceflow.languages.workbenchEmpty}`,
        "",
        `## ${window.sourceflow.languages.workbenchReviewUpcoming}`,
        "",
        upcomingItems.length ? buildResultsMarkdown(upcomingItems.slice(0, 20)) : `- ${window.sourceflow.languages.workbenchEmpty}`,
        "",
        `## ${window.sourceflow.languages.workbenchReviewStale}`,
        "",
        staleInbox.length ? buildResultsMarkdown(staleInbox.slice(0, 20)) : `- ${window.sourceflow.languages.workbenchEmpty}`,
        "",
        "## " + (isBlockLayer ? window.sourceflow.languages.workbenchLayerBlocks : window.sourceflow.languages.workbench),
        "",
        isBlockLayer ? buildBlockResultsMarkdown(blocks.slice(0, 80)) : buildResultsMarkdown(items.slice(0, 40)),
    ].filter(Boolean);
    return sections.join("\n");
};

const buildWorkbenchViewNoteMarkdown = (state: IWorkbenchState, summary: IWorkbenchSummary, blocks: IWorkbenchSearchBlock[] = [], blockScopeCount = 0) => {
    const sections = [
        `# ${window.sourceflow.languages.workbenchViewNoteTitle}`,
        "",
        `- ${window.sourceflow.languages.workbench}: ${getWorkbenchTabLabel(state.activeTab)}`,
        `- ${window.sourceflow.languages.workbenchQuery}: ${state.query || window.sourceflow.languages.workbenchGroupNone}`,
        `- ${window.sourceflow.languages.workbenchView}: ${getWorkbenchViewLabel(state.activeTab, getActiveView(state), state.resultLayer)}`,
        `- ${window.sourceflow.languages.workbenchGroupBy}: ${state.resultLayer === "blocks" ? window.sourceflow.languages.workbenchGroupNone : (getGroupByOptions().find((item) => item.value === state.groupBy)?.label || window.sourceflow.languages.workbenchGroupNone)}`,
        buildWorkbenchResultLayerMarkdown(state, blocks.length, blockScopeCount),
        "",
        buildSummaryMarkdown(summary),
        "## " + window.sourceflow.languages.workbenchLiveEmbedIntoNote,
        "",
        buildWorkbenchLiveEmbedMarkdown(state),
        state.resultLayer === "blocks" ? "" : "",
        state.resultLayer === "blocks" ? "## " + window.sourceflow.languages.workbenchLayerBlocks : "",
        state.resultLayer === "blocks" ? "" : "",
        state.resultLayer === "blocks" ? buildBlockResultsMarkdown(blocks.slice(0, 120)) : "",
    ].filter(Boolean);
    return sections.join("\n");
};

const buildWorkbenchSkillNoteMarkdown = (state: IWorkbenchState, summary: IWorkbenchSummary, blocks: IWorkbenchSearchBlock[] = [], blockScopeCount = 0) => {
    const sections = [
        `# ${window.sourceflow.config.lang === "zh_CN" ? "技能笔记" : "Skill Note"}`,
        "",
        window.sourceflow.config.lang === "zh_CN"
            ? "> 把学习路线拆成主线任务、阶段里程碑和可执行清单。当前实现基于 Workbench 视图，后续可以演进成更强的技能树。"
            : "> Break a learning roadmap into main quests, milestones, and executable tasks. This first version is built on top of Workbench views and can evolve into a richer skill tree later.",
        "",
        `- ${window.sourceflow.languages.workbench}: ${getWorkbenchTabLabel(state.activeTab)}`,
        `- ${window.sourceflow.languages.workbenchView}: ${getWorkbenchViewLabel(state.activeTab, getActiveView(state), state.resultLayer)}`,
        `- ${window.sourceflow.languages.workbenchQuery}: ${state.query || window.sourceflow.languages.workbenchGroupNone}`,
        buildWorkbenchResultLayerMarkdown(state, blocks.length, blockScopeCount),
        "",
        `## ${window.sourceflow.config.lang === "zh_CN" ? "主线技能" : "Main Skillline"}`,
        "",
        window.sourceflow.config.lang === "zh_CN"
            ? "- 当前目标：\n- 解锁条件：\n- 完成标准："
            : "- Current goal:\n- Unlock condition:\n- Definition of done:",
        "",
        `## ${window.sourceflow.config.lang === "zh_CN" ? "阶段里程碑" : "Milestones"}`,
        "",
        buildSummaryMarkdown(summary),
        "",
        `## ${window.sourceflow.config.lang === "zh_CN" ? "任务与素材" : "Quests & Materials"}`,
        "",
        buildWorkbenchLiveEmbedMarkdown(state),
        state.resultLayer === "blocks" ? "" : "",
        state.resultLayer === "blocks" ? "## " + window.sourceflow.languages.workbenchLayerBlocks : "",
        state.resultLayer === "blocks" ? "" : "",
        state.resultLayer === "blocks" ? buildBlockResultsMarkdown(blocks.slice(0, 120)) : "",
    ].filter(Boolean);
    return sections.join("\n");
};

const buildQueryEmbedMarkdownByIDs = (idsSource: string[]) => {
    const ids = Array.from(new Set(idsSource.filter(Boolean))).slice(0, 256);
    if (ids.length === 0) {
        return "";
    }
    const quoted = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    return `{{ SELECT * FROM blocks WHERE id IN (${quoted}) ORDER BY updated DESC }}`;
};

const buildQueryEmbedMarkdown = (items: IWorkbenchItem[]) => buildQueryEmbedMarkdownByIDs(items.map((item) => item.id));

const sqlQuote = (value: string) => `'${(value || "").replace(/'/g, "''")}'`;

const sqlLikeValue = (value: string) => (value || "")
    .replace(/'/g, "''")
    .replace(/[%_]/g, (match) => `\\${match}`);

const buildWorkbenchTypeCondition = (type: string) => {
    if (type === "doc") {
        return `(ial NOT LIKE '%${WorkbenchAttr.type}="%' OR ial LIKE '%${WorkbenchAttr.type}="doc"%')`;
    }
    return `ial LIKE '%${WorkbenchAttr.type}="${type}"%'`;
};

const buildWorkbenchLiveRootConditions = (state: IWorkbenchState, parsed = parseQuery(state.query), includeText = true) => {
    if (parsed.filters.kind?.length && !parsed.filters.kind.includes("doc")) {
        return ["1 = 0"];
    }
    const conditions: string[] = [
        "(" + ["doc", "note", "url", "task", "event", "project", "attachment"].map((type) => buildWorkbenchTypeCondition(type)).join(" OR ") + ")",
    ];
    if (state.activeTab === "inbox") {
        conditions.push(`ial LIKE '%${WorkbenchAttr.inbox}="true"%'`);
    } else if (state.activeTab === "library") {
        conditions.push(buildWorkbenchTypeCondition("doc"));
    } else if (state.activeTab === "task") {
        conditions.push(buildWorkbenchTypeCondition("task"));
    } else if (state.activeTab === "calendar") {
        conditions.push(`(${buildWorkbenchTypeCondition("event")} OR (${buildWorkbenchTypeCondition("task")} AND ial LIKE '%${WorkbenchAttr.dueDate}="%'))`);
    } else if (state.activeTab === "project") {
        conditions.push(buildWorkbenchTypeCondition("project"));
    }

    if (parsed.filters.type?.length) {
        conditions.push("(" + parsed.filters.type.map((value) => buildWorkbenchTypeCondition(value)).join(" OR ") + ")");
    }
    if (parsed.filters.status?.length) {
        conditions.push("(" + parsed.filters.status.map((value) => `ial LIKE '%${WorkbenchAttr.status}="${sqlLikeValue(value)}"%'`).join(" OR ") + ")");
    }
    if (parsed.filters.project?.length) {
        conditions.push("(" + parsed.filters.project.map((value) => `ial LIKE '%${WorkbenchAttr.project}="%${sqlLikeValue(value)}%"%'`).join(" OR ") + ")");
    }
    if (parsed.filters.notebook?.length) {
        conditions.push("(" + parsed.filters.notebook.map((value) => `hpath LIKE ${sqlQuote(`%${sqlLikeValue(value)}%`)} ESCAPE '\\'`).join(" OR ") + ")");
    }
    if (parsed.filters.tag?.length) {
        parsed.filters.tag.forEach((value) => {
            conditions.push(`tag LIKE ${sqlQuote(`%${sqlLikeValue(value)}%`)} ESCAPE '\\'`);
        });
    }
    if (parsed.filters.inbox?.length) {
        const wantsInbox = parsed.filters.inbox.some((value) => ["true", "1", "yes"].includes(value));
        conditions.push(wantsInbox ? `ial LIKE '%${WorkbenchAttr.inbox}="true"%'` : `ial NOT LIKE '%${WorkbenchAttr.inbox}="true"%'`);
    }
    (parsed.filters.has || []).forEach((value) => {
        if (value === "due") {
            conditions.push(`ial LIKE '%${WorkbenchAttr.dueDate}="%'`);
        } else if (value === "event") {
            conditions.push(`ial LIKE '%${WorkbenchAttr.eventTime}="%'`);
        } else if (value === "project") {
            conditions.push(`ial LIKE '%${WorkbenchAttr.project}="%'`);
        } else if (value === "url") {
            conditions.push(`ial LIKE '%${WorkbenchAttr.sourceURL}="%'`);
        } else if (value === "location") {
            conditions.push(`ial LIKE '%${WorkbenchAttr.location}="%'`);
        } else if (value === "view") {
            conditions.push(`ial LIKE '%${WorkbenchViewAttr.enabled}="true"%'`);
        } else if (value === "untagged") {
            conditions.push(`(tag = '' OR tag IS NULL)`);
        }
    });
    (parsed.filters.flag || []).forEach((value) => {
        if (value === "unprojected") {
            conditions.push(`ial NOT LIKE '%${WorkbenchAttr.project}="%'`);
        } else if (value === "untagged") {
            conditions.push(`(tag = '' OR tag IS NULL)`);
        }
    });
    if (includeText) {
        parsed.text.forEach((value) => {
            const like = sqlQuote(`%${sqlLikeValue(value)}%`);
            conditions.push(`(content LIKE ${like} ESCAPE '\\' OR markdown LIKE ${like} ESCAPE '\\' OR hpath LIKE ${like} ESCAPE '\\' OR tag LIKE ${like} ESCAPE '\\' OR ial LIKE ${like} ESCAPE '\\')`);
        });
    }
    return conditions;
};

const buildWorkbenchLiveQuerySQL = (state: IWorkbenchState) => {
    const conditions = buildWorkbenchLiveRootConditions(state);
    let orderBy = "updated DESC";
    if (state.sortBy === "created") {
        orderBy = `created ${state.sortOrder === "asc" ? "ASC" : "DESC"}`;
    } else if (state.sortBy === "title") {
        orderBy = `content ${state.sortOrder === "asc" ? "ASC" : "DESC"}`;
    } else {
        orderBy = `updated ${state.sortOrder === "asc" ? "ASC" : "DESC"}`;
    }
    return `SELECT * FROM blocks WHERE type = 'd' AND ${conditions.join(" AND ")} ORDER BY ${orderBy} LIMIT 256`;
};

const normalizeWorkbenchBoundState = (state: Partial<IWorkbenchBoundViewState>): IWorkbenchBoundViewState => {
    const activeTab = (state.activeTab || "inbox") as TWorkbenchTab;
    const resultLayer = normalizeWorkbenchResultLayer(state.resultLayer);
    return {
        activeTab,
        resultLayer,
        query: `${state.query || ""}`.trim(),
        sortBy: normalizeWorkbenchSortBy(resultLayer, `${state.sortBy || "captured"}`.trim() || "captured"),
        sortOrder: `${state.sortOrder || "desc"}`.trim() === "asc" ? "asc" : "desc",
        view: normalizeWorkbenchView(activeTab, state.view, resultLayer),
        groupBy: resultLayer === "blocks" ? "none" : normalizeWorkbenchGroupBy(state.groupBy),
    };
};

const buildWorkbenchBoundViewAttrs = (state: IWorkbenchState) => {
    const normalized = normalizeWorkbenchBoundState({
        activeTab: state.activeTab,
        resultLayer: state.resultLayer,
        query: state.query,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        view: getActiveView(state),
        groupBy: state.groupBy,
    });
    return {
        [WorkbenchViewAttr.enabled]: "true",
        [WorkbenchViewAttr.activeTab]: normalized.activeTab,
        [WorkbenchViewAttr.resultLayer]: normalized.resultLayer,
        [WorkbenchViewAttr.query]: normalized.query,
        [WorkbenchViewAttr.sortBy]: normalized.sortBy,
        [WorkbenchViewAttr.sortOrder]: normalized.sortOrder,
        [WorkbenchViewAttr.view]: normalized.view,
        [WorkbenchViewAttr.groupBy]: normalized.groupBy,
    };
};

const buildWorkbenchViewNoteAttrs = (state: IWorkbenchState) => {
    return {
        [WorkbenchAttr.type]: "doc",
        [WorkbenchAttr.inbox]: "false",
        [WorkbenchAttr.status]: "open",
        [WorkbenchAttr.capturedAt]: new Date().toISOString(),
        ...buildWorkbenchBoundViewAttrs(state),
    };
};

const parseWorkbenchBoundViewAttrs = (attrs: Record<string, string>) => {
    if (`${attrs?.[WorkbenchViewAttr.enabled] || ""}` !== "true") {
        return null;
    }
    return normalizeWorkbenchBoundState({
        activeTab: attrs[WorkbenchViewAttr.activeTab] as TWorkbenchTab,
        resultLayer: attrs[WorkbenchViewAttr.resultLayer] as TWorkbenchResultLayer,
        query: attrs[WorkbenchViewAttr.query],
        sortBy: attrs[WorkbenchViewAttr.sortBy],
        sortOrder: attrs[WorkbenchViewAttr.sortOrder],
        view: attrs[WorkbenchViewAttr.view] as TWorkbenchView,
        groupBy: attrs[WorkbenchViewAttr.groupBy] as TWorkbenchGroupBy,
    });
};

const applyWorkbenchBoundState = (state: IWorkbenchState, boundState: Partial<IWorkbenchBoundViewState>) => {
    const normalized = normalizeWorkbenchBoundState(boundState);
    state.activeTab = normalized.activeTab;
    state.resultLayer = normalized.resultLayer;
    state.query = normalized.query;
    state.sortBy = normalized.sortBy;
    state.sortOrder = normalized.sortOrder;
    state.groupBy = normalized.groupBy;
    state.views[normalized.activeTab] = normalized.view;
    clearWorkbenchSavedSelections(state);
};

const getActiveEditorProtyle = () => {
    /// #if MOBILE
    const mobileEditor = window.sourceflow.mobile.popEditor || window.sourceflow.mobile.editor;
    if (!mobileEditor) {
        return undefined;
    }
    const protyle = resolveEditorProtyle(mobileEditor);
    if (protyle?.element?.classList.contains("fn__none")) {
        return undefined;
    }
    return protyle;
    /// #else
    const range = getSelection().rangeCount > 0 ? getSelection().getRangeAt(0) : null;
    const allEditor = getAllEditor();
    let activeEditor = range ? allEditor.find((item) => item.protyle?.element?.contains(range.startContainer)) : undefined;
    if (!activeEditor) {
        activeEditor = allEditor.find((item) => {
            return !item.protyle?.element?.classList.contains("fn__none") &&
                hasClosestByClassName(item.protyle.element, "layout__wnd--active", true) &&
                item.protyle.model?.parent?.headElement?.classList.contains("item--focus");
        });
    }
    if (!activeEditor) {
        activeEditor = allEditor.find((item) => {
            return !item.protyle?.element?.classList.contains("fn__none") &&
                hasClosestByClassName(item.protyle.element, "layout__wnd--active", true);
        });
    }
    return activeEditor?.protyle;
    /// #endif
};

const appendMarkdownToCurrentNote = async (markdown: string) => {
    const protyle = getActiveEditorProtyle();
    if (!markdown.trim() || !protyle?.block?.rootID) {
        showMessage(window.sourceflow.languages.workbenchNeedCurrentNote);
        return false;
    }
    const response = await fetchSyncPost("/api/block/appendBlock", {
        parentID: protyle.block.rootID,
        data: markdown,
        dataType: "markdown",
    });
    if (response.code === 0) {
        showMessage(window.sourceflow.languages.workbenchInserted);
        return true;
    }
    return false;
};

const getCurrentRootID = () => {
    const protyle = getActiveEditorProtyle();
    return protyle?.block?.rootID;
};

const getCurrentWorkbenchBoundView = async () => {
    const rootID = getCurrentRootID();
    if (!rootID) {
        showMessage(window.sourceflow.languages.workbenchNeedCurrentNote);
        return null;
    }
    const response = await fetchSyncPost("/api/attr/getBlockAttrs", {id: rootID});
    return parseWorkbenchBoundViewAttrs(response.data || {});
};

export const openWorkbenchBoundViewByID = async (app: App, id: string) => {
    const response = await fetchSyncPost("/api/attr/getBlockAttrs", {id});
    const boundView = parseWorkbenchBoundViewAttrs(response.data || {});
    if (!boundView) {
        showMessage(window.sourceflow.languages.workbenchCurrentBoundViewEmpty);
        return false;
    }
    openWorkbenchDialog(app, undefined, undefined, undefined, undefined, boundView);
    return true;
};

const saveWorkbenchViewToCurrentNote = async (state: IWorkbenchState) => {
    const rootID = getCurrentRootID();
    if (!rootID) {
        showMessage(window.sourceflow.languages.workbenchNeedCurrentNote);
        return false;
    }
    const response = await fetchSyncPost("/api/attr/setBlockAttrs", {
        id: rootID,
        attrs: buildWorkbenchBoundViewAttrs(state),
    });
    if (response.code === 0) {
        showMessage(window.sourceflow.languages.workbenchBindCurrentViewSaved);
        return true;
    }
    return false;
};

const clearWorkbenchViewFromCurrentNote = async () => {
    const rootID = getCurrentRootID();
    if (!rootID) {
        showMessage(window.sourceflow.languages.workbenchNeedCurrentNote);
        return false;
    }
    const response = await fetchSyncPost("/api/attr/setBlockAttrs", {
        id: rootID,
        attrs: {
            [WorkbenchViewAttr.enabled]: null,
            [WorkbenchViewAttr.activeTab]: null,
            [WorkbenchViewAttr.resultLayer]: null,
            [WorkbenchViewAttr.query]: null,
            [WorkbenchViewAttr.sortBy]: null,
            [WorkbenchViewAttr.sortOrder]: null,
            [WorkbenchViewAttr.view]: null,
            [WorkbenchViewAttr.groupBy]: null,
        },
    });
    if (response.code === 0) {
        showMessage(window.sourceflow.languages.workbenchClearCurrentBoundView);
        return true;
    }
    return false;
};

const applyWorkbenchSavedViewsState = (state: IWorkbenchState) => {
    state.activeTab = "library";
    state.resultLayer = "items";
    state.query = WORKBENCH_SAVED_VIEWS_QUERY;
    state.sortBy = normalizeWorkbenchSortBy("items", state.sortBy);
    clearWorkbenchSavedSelections(state);
};

const fetchRelatedBlocks = async (query: string, pageSize = 12) => {
    if (!query.trim()) {
        return [] as IWorkbenchSearchBlock[];
    }
    const response = await fetchSyncPost("/api/search/fullTextSearchBlock", {
        query,
        method: 0,
        orderBy: 4,
        groupBy: 0,
        page: 1,
        pageSize,
    });
    return response.data?.blocks as IWorkbenchSearchBlock[] || [];
};

const renderSearchBlock = (block: IWorkbenchSearchBlock) => {
    return `<button class="b3-button b3-button--outline fn__block" data-action="open-block-hit" data-id="${block.id}" style="justify-content:flex-start;text-align:left;margin-bottom:8px;">
    <div class="fn__flex-column" style="align-items:flex-start;gap:4px;max-width:100%;">
        <span style="font-weight:600;">${escapeHTML(block.hPath || block.id)}</span>
        <span class="ft__secondary" style="white-space:normal;">${escapeHTML(block.content || "")}</span>
    </div>
</button>`;
};

const getWorkbenchBlockRootID = (block: IWorkbenchSearchBlock) => block.rootID || block.id;

const getBlockNotebookName = (block: IWorkbenchSearchBlock) => window.sourceflow.notebooks.find((item) => item.id === block.box)?.name || block.box || "";

const sortWorkbenchBlocks = (blocks: IWorkbenchSearchBlock[], state: IWorkbenchState) => {
    return blocks.slice().sort((left, right) => {
        if (state.sortBy === "title") {
            const leftTitle = `${left.hPath || left.content || left.id}`.toLowerCase();
            const rightTitle = `${right.hPath || right.content || right.id}`.toLowerCase();
            return state.sortOrder === "asc"
                ? leftTitle.localeCompare(rightTitle)
                : rightTitle.localeCompare(leftTitle);
        }
        const leftUpdated = `${left.updated || ""}`;
        const rightUpdated = `${right.updated || ""}`;
        if (leftUpdated === rightUpdated) {
            const leftTitle = `${left.hPath || left.content || left.id}`.toLowerCase();
            const rightTitle = `${right.hPath || right.content || right.id}`.toLowerCase();
            return leftTitle.localeCompare(rightTitle);
        }
        return state.sortOrder === "asc"
            ? leftUpdated.localeCompare(rightUpdated)
            : rightUpdated.localeCompare(leftUpdated);
    });
};

const filterWorkbenchBlocksByScope = (blocks: IWorkbenchSearchBlock[], scopeItems: IWorkbenchItem[]) => {
    const allowedRootIDs = new Set(scopeItems.map((item) => item.rootID || item.id));
    const dedup = new Set<string>();
    return blocks.filter((block) => {
        const rootID = getWorkbenchBlockRootID(block);
        if (!allowedRootIDs.has(rootID) || dedup.has(block.id)) {
            return false;
        }
        dedup.add(block.id);
        return true;
    });
};

const buildFilterOnlyQuery = (parsed: ReturnType<typeof parseQuery>) => {
    const keys = ["kind", "type", "status", "project", "tag", "notebook", "inbox", "before", "after", "has", "flag"];
    const tokens: string[] = [];
    keys.forEach((key) => {
        (parsed.filters[key] || []).forEach((value) => {
            tokens.push(value.includes(" ") ? `${key}:"${value}"` : `${key}:${value}`);
        });
    });
    return tokens.join(" ").trim();
};

const resolveWorkbenchBlocks = async (state: IWorkbenchState, scopeItems: IWorkbenchItem[], parsed = parseQuery(state.query), limit = 256) => {
    const query = parsed.text.join(" ").trim();
    if (!query) {
        return [] as IWorkbenchSearchBlock[];
    }
    const cacheKey = buildWorkbenchBlockCacheKey(state, scopeItems, parsed, limit);
    const now = Date.now();
    const cached = workbenchBlockCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.data;
    }
    if (workbenchBlockInflight.has(cacheKey)) {
        return workbenchBlockInflight.get(cacheKey);
    }
    const request = (async () => {
        const rawBlocks = await fetchRelatedBlocks(query, limit);
        const data = sortWorkbenchBlocks(filterWorkbenchBlocksByScope(rawBlocks, scopeItems), state);
        workbenchBlockCache.set(cacheKey, {
            expiresAt: Date.now() + WORKBENCH_BLOCK_CACHE_TTL,
            data,
        });
        pruneTimedCache(workbenchBlockCache, 24);
        return data;
    })();
    workbenchBlockInflight.set(cacheKey, request);
    try {
        return await request;
    } finally {
        workbenchBlockInflight.delete(cacheKey);
    }
};

const formatWorkbenchBlockUpdated = (block: IWorkbenchSearchBlock) => {
    const value = `${block.updated || ""}`;
    if (/^\d{14}$/.test(value)) {
        return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}`;
    }
    return value;
};

const renderBlockListItem = (block: IWorkbenchSearchBlock) => {
    return `<div class="b3-card" style="padding: 16px;margin-bottom: 12px;">
    <div class="fn__flex" style="justify-content: space-between;gap: 12px;align-items: flex-start;flex-wrap: wrap;">
        <div class="fn__flex-column" style="gap: 6px;min-width: 0;">
            <div style="font-weight: 600;word-break: break-all;">${escapeHTML(block.hPath || block.id)}</div>
            <div class="ft__secondary">${escapeHTML(getBlockNotebookName(block))}</div>
            ${block.content ? `<div style="white-space: normal;word-break: break-word;">${escapeHTML(block.content)}</div>` : ""}
        </div>
        <div class="fn__flex-column" style="gap: 8px;align-items: flex-end;">
            ${block.updated ? `<span class="ft__secondary">${escapeHTML(formatWorkbenchBlockUpdated(block))}</span>` : ""}
            <div class="fn__flex" style="gap: 8px;flex-wrap: wrap;justify-content: flex-end;">
                <button class="b3-button b3-button--outline" data-action="open-block-hit" data-id="${block.id}">${window.sourceflow.languages.open}</button>
                <button class="b3-button b3-button--outline" data-action="open-block-root" data-id="${getWorkbenchBlockRootID(block)}">${window.sourceflow.languages.doc}</button>
            </div>
        </div>
    </div>
</div>`;
};

const renderBlockTableView = (blocks: IWorkbenchSearchBlock[]) => {
    if (!blocks.length) {
        return `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`;
    }
    return `<div class="b3-card" style="padding: 0;overflow: auto;">
    <table style="width: 100%;border-collapse: collapse;min-width: 880px;">
        <thead>
            <tr>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.doc)}</th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.contentBlock)}</th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.fileTree)}</th>
                <th style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.workbenchSortUpdated)}</th>
                <th style="width: 168px;padding: 10px;border-bottom: 1px solid var(--b3-border-color);text-align: left;">${escapeHTML(window.sourceflow.languages.open)}</th>
            </tr>
        </thead>
        <tbody>
            ${blocks.map((block) => `<tr>
                <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">${escapeHTML(getBlockNotebookName(block))}</td>
                <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">
                    <div style="font-weight: 600;word-break: break-all;">${escapeHTML(block.hPath || block.id)}</div>
                    ${block.content ? `<div class="ft__secondary" style="margin-top: 4px;white-space: normal;word-break: break-word;">${escapeHTML(block.content)}</div>` : ""}
                </td>
                <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">${escapeHTML(block.hPath || "")}</td>
                <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">${escapeHTML(formatWorkbenchBlockUpdated(block))}</td>
                <td style="padding: 10px;border-bottom: 1px solid var(--b3-border-color);vertical-align: top;">
                    <div class="fn__flex" style="gap: 8px;flex-wrap: wrap;">
                        <button class="b3-button b3-button--outline" data-action="open-block-hit" data-id="${block.id}">${window.sourceflow.languages.open}</button>
                        <button class="b3-button b3-button--outline" data-action="open-block-root" data-id="${getWorkbenchBlockRootID(block)}">${window.sourceflow.languages.doc}</button>
                    </div>
                </td>
            </tr>`).join("")}
        </tbody>
    </table>
</div>`;
};

const renderBlockMainPanel = (state: IWorkbenchState, blocks: IWorkbenchSearchBlock[]) => {
    if (!parseQuery(state.query).text.length) {
        return `<div class="ft__secondary">${window.sourceflow.languages.workbenchBlocksNeedText}</div>`;
    }
    if (!blocks.length) {
        return `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`;
    }
    return getActiveView(state) === "table"
        ? renderBlockTableView(blocks)
        : blocks.map((block) => renderBlockListItem(block)).join("");
};

const openWorkbenchItem = (app: App, id: string) => {
    /// #if MOBILE
    openMobileFileById(app, id, [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]);
    /// #else
    openFileById({app, id, action: [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]});
    /// #endif
};

const parseWorkbenchAttrTime = (value?: string) => {
    const text = `${value || ""}`.trim();
    if (!text) {
        return 0;
    }
    const timestamp = Date.parse(text);
    return Number.isNaN(timestamp) ? 0 : timestamp;
};

const normalizeWorkbenchDraftType = (value?: string, fallback: IWorkbenchItem["type"] = "note"): IWorkbenchItem["type"] => {
    const candidate = `${value || ""}`.trim() as IWorkbenchItem["type"];
    if ((["doc", "note", "url", "task", "event", "project", "attachment"] as IWorkbenchItem["type"][]).includes(candidate)) {
        return candidate;
    }
    return fallback;
};

const buildCurrentWorkbenchItemDraft = async (defaultType: IWorkbenchItem["type"] = "doc") => {
    const protyle = getActiveEditorProtyle();
    if (!protyle?.block?.rootID) {
        showMessage(window.sourceflow.languages.workbenchNeedCurrentNote);
        return null;
    }
    const attrsResponse = await fetchSyncPost("/api/attr/getBlockAttrs", {id: protyle.block.rootID});
    const attrs = attrsResponse.data || {};
    const type = normalizeWorkbenchDraftType(attrs[WorkbenchAttr.type], defaultType);
    const notebook = window.sourceflow.notebooks.find((item) => item.id === protyle.notebookId)?.name || protyle.notebookId || "";
    const title = `${protyle.title?.editElement?.textContent || window.sourceflow.languages.untitled}`.trim() || window.sourceflow.languages.untitled;
    const capturedAt = `${attrs[WorkbenchAttr.capturedAt] || ""}`.trim() || (type === "doc" ? "" : new Date().toISOString());
    const now = Date.now();
    return {
        id: protyle.block.rootID,
        entityKind: "doc",
        rootID: protyle.block.rootID,
        parentID: "",
        box: protyle.notebookId || "",
        notebook,
        path: protyle.path || "",
        hPath: protyle.path || "",
        title,
        preview: "",
        type,
        status: `${attrs[WorkbenchAttr.status] || getStatusOptions(type)[0]}`.trim() || getStatusOptions(type)[0],
        project: `${attrs[WorkbenchAttr.project] || ""}`.trim(),
        dueDate: `${attrs[WorkbenchAttr.dueDate] || ""}`.trim(),
        eventTime: `${attrs[WorkbenchAttr.eventTime] || ""}`.trim(),
        location: `${attrs[WorkbenchAttr.location] || ""}`.trim(),
        sourceURL: `${attrs[WorkbenchAttr.sourceURL] || ""}`.trim(),
        capturedAt,
        goal: `${attrs[WorkbenchAttr.goal] || ""}`.trim(),
        nextStep: `${attrs[WorkbenchAttr.nextStep] || ""}`.trim(),
        tags: splitWorkbenchTags(`${attrs.tags || ""}`),
        inbox: `${attrs[WorkbenchAttr.inbox] || ""}`.trim() ? `${attrs[WorkbenchAttr.inbox]}` === "true" : type !== "doc",
        created: "",
        updated: "",
        createdAt: now,
        updatedAt: now,
        dueAt: parseWorkbenchAttrTime(attrs[WorkbenchAttr.dueDate]),
        eventAt: parseWorkbenchAttrTime(attrs[WorkbenchAttr.eventTime]),
        capturedTs: parseWorkbenchAttrTime(capturedAt) || now,
        refCount: 0,
        assetCount: 0,
        subFileCount: 0,
    } as IWorkbenchItem;
};

const buildCurrentWorkbenchBlockDraft = async (defaultType: IWorkbenchItem["type"] = "note") => {
    const protyle = getActiveEditorProtyle();
    if (!protyle?.block?.id) {
        showMessage(window.sourceflow.languages.workbenchNeedCurrentNote);
        return null;
    }
    const id = protyle.block.id;
    const infoResponse = await fetchSyncPost("/api/block/getBlockInfo", {id});
    if (infoResponse.code !== 0) {
        showMessage(infoResponse.msg || window.sourceflow.languages.workbenchNeedCurrentNote);
        return null;
    }
    const attrsResponse = await fetchSyncPost("/api/attr/getBlockAttrs", {id});
    const attrs = attrsResponse.data || {};
    const element = protyle.wysiwyg?.element?.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
    const blockText = `${element?.textContent || ""}`.replace(/\s+/g, " ").trim();
    const type = normalizeWorkbenchDraftType(attrs[WorkbenchAttr.type], defaultType);
    const title = `${attrs[WorkbenchAttr.title] || blockText || window.sourceflow.languages.untitled}`.trim() || window.sourceflow.languages.untitled;
    const capturedAt = `${attrs[WorkbenchAttr.capturedAt] || ""}`.trim() || (type === "doc" ? "" : new Date().toISOString());
    const now = Date.now();
    return {
        id,
        entityKind: "block",
        rootID: infoResponse.data?.rootID || protyle.block.rootID || id,
        parentID: protyle.block.parentID || "",
        box: infoResponse.data?.box || protyle.notebookId || "",
        notebook: window.sourceflow.notebooks.find((item) => item.id === (infoResponse.data?.box || protyle.notebookId))?.name || infoResponse.data?.box || protyle.notebookId || "",
        path: infoResponse.data?.path || protyle.path || "",
        hPath: [infoResponse.data?.rootTitle || "", title].filter(Boolean).join(" / "),
        title,
        preview: blockText,
        type,
        status: `${attrs[WorkbenchAttr.status] || getStatusOptions(type)[0]}`.trim() || getStatusOptions(type)[0],
        project: `${attrs[WorkbenchAttr.project] || ""}`.trim(),
        dueDate: `${attrs[WorkbenchAttr.dueDate] || ""}`.trim(),
        eventTime: `${attrs[WorkbenchAttr.eventTime] || ""}`.trim(),
        location: `${attrs[WorkbenchAttr.location] || ""}`.trim(),
        sourceURL: `${attrs[WorkbenchAttr.sourceURL] || ""}`.trim(),
        capturedAt,
        goal: `${attrs[WorkbenchAttr.goal] || ""}`.trim(),
        nextStep: `${attrs[WorkbenchAttr.nextStep] || ""}`.trim(),
        tags: splitWorkbenchTags(`${attrs.tags || ""}`),
        inbox: `${attrs[WorkbenchAttr.inbox] || ""}`.trim() ? `${attrs[WorkbenchAttr.inbox]}` === "true" : type !== "doc",
        created: "",
        updated: "",
        createdAt: now,
        updatedAt: now,
        dueAt: parseWorkbenchAttrTime(attrs[WorkbenchAttr.dueDate]),
        eventAt: parseWorkbenchAttrTime(attrs[WorkbenchAttr.eventTime]),
        capturedTs: parseWorkbenchAttrTime(capturedAt) || now,
        refCount: 0,
        assetCount: 0,
        subFileCount: 0,
    } as IWorkbenchItem;
};

const refreshWorkbenchStatusOptions = (dialogElement: Element, preferred?: string) => {
    const type = (dialogElement.querySelector("#workbenchMetaType") as HTMLSelectElement).value as IWorkbenchItem["type"];
    const statusElement = dialogElement.querySelector("#workbenchMetaStatus") as HTMLSelectElement;
    const currentValue = preferred || statusElement.value || statusElement.getAttribute("data-value") || "";
    const options = getStatusOptions(type);
    statusElement.innerHTML = options.map((item) => `<option value="${item}" ${item === currentValue ? "selected" : ""}>${escapeHTML(statusLabel(item))}</option>`).join("");
    if (!options.includes(statusElement.value)) {
        statusElement.value = options[0];
    }
    statusElement.setAttribute("data-value", statusElement.value);

    dialogElement.querySelectorAll<HTMLElement>("[data-workbench-meta-types]").forEach((item) => {
        const supportedTypes = (item.getAttribute("data-workbench-meta-types") || "").split(",").map((value) => value.trim()).filter(Boolean);
        item.classList.toggle("fn__none", !!supportedTypes.length && !supportedTypes.includes(type));
    });
};

const openWorkbenchMetaDialog = (item: IWorkbenchItem, allItems: IWorkbenchItem[]) => {
    return new Promise<boolean>((resolve) => {
        let resolved = false;
        const projectOptions = Array.from(new Set(allItems.filter((current) => current.type === "project" && current.title).map((current) => current.title))).sort((a, b) => a.localeCompare(b));
        const dialog = new Dialog({
            title: `${window.sourceflow.languages.edit} · ${window.sourceflow.languages.workbenchEditMeta}`,
            width: "640px",
            destroyCallback() {
                if (!resolved) {
                    resolved = true;
                    resolve(false);
                }
            },
            content: `<div class="b3-dialog__content">
    <label class="b3-label">
        <div>${window.sourceflow.languages.captureTitle}</div>
        <input id="workbenchMetaTitle" class="b3-text-field fn__block" spellcheck="false" value="${escapeAttr(item.title)}">
    </label>
    <div class="fn__flex" style="gap: 8px;">
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.type}</div>
            <select id="workbenchMetaType" class="b3-select fn__block">
                ${(["doc", "note", "url", "task", "event", "project", "attachment"] as IWorkbenchItem["type"][]).map((type) => `<option value="${type}" ${type === item.type ? "selected" : ""}>${escapeHTML(typeLabel(type))}</option>`).join("")}
            </select>
        </label>
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.status}</div>
            <select id="workbenchMetaStatus" class="b3-select fn__block" data-value="${escapeAttr(item.status)}"></select>
        </label>
    </div>
    <div class="fn__flex" style="gap: 8px;">
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.captureTags}</div>
            <input id="workbenchMetaTags" class="b3-text-field fn__block" spellcheck="false" value="${escapeAttr(item.tags.join(","))}">
        </label>
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.project}</div>
            <input id="workbenchMetaProject" class="b3-text-field fn__block" spellcheck="false" list="workbenchMetaProjectOptions" value="${escapeAttr(item.project)}" placeholder="${escapeAttr(window.sourceflow.languages.optional)}">
        </label>
    </div>
    <datalist id="workbenchMetaProjectOptions">${projectOptions.map((title) => `<option value="${escapeAttr(title)}"></option>`).join("")}</datalist>
    <label class="b3-label">
        <span class="fn__flex" style="gap: 8px;align-items: center;">
            <input id="workbenchMetaInbox" class="b3-switch" type="checkbox" ${item.inbox ? "checked" : ""}>
            <span>${window.sourceflow.languages.inbox}</span>
        </span>
    </label>
    <div class="fn__flex" style="gap: 8px;" data-workbench-meta-types="task">
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.taskDueDate}</div>
            <input id="workbenchMetaDueDate" class="b3-text-field fn__block" type="date" value="${escapeAttr(item.dueDate)}">
        </label>
        <div class="fn__flex-1"></div>
    </div>
    <div class="fn__flex" style="gap: 8px;" data-workbench-meta-types="event">
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.eventTime}</div>
            <input id="workbenchMetaEventTime" class="b3-text-field fn__block" type="datetime-local" value="${escapeAttr(item.eventTime)}">
        </label>
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.location}</div>
            <input id="workbenchMetaLocation" class="b3-text-field fn__block" spellcheck="false" value="${escapeAttr(item.location)}">
        </label>
    </div>
    <label class="b3-label" data-workbench-meta-types="url">
        <div>${window.sourceflow.languages.workbenchSourceURL}</div>
        <input id="workbenchMetaSourceURL" class="b3-text-field fn__block" spellcheck="false" value="${escapeAttr(item.sourceURL)}" placeholder="https://example.com">
    </label>
    <label class="b3-label" data-workbench-meta-types="project">
        <div>${window.sourceflow.languages.captureProjectGoal}</div>
        <textarea id="workbenchMetaGoal" class="b3-text-field fn__block" style="height: 80px;">${escapeHTML(item.goal)}</textarea>
    </label>
    <label class="b3-label" data-workbench-meta-types="project">
        <div>${window.sourceflow.languages.captureProjectNextStep}</div>
        <textarea id="workbenchMetaNextStep" class="b3-text-field fn__block" style="height: 80px;">${escapeHTML(item.nextStep)}</textarea>
    </label>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.save}</button>
</div>`,
        });
        const typeElement = dialog.element.querySelector("#workbenchMetaType") as HTMLSelectElement;
        const titleElement = dialog.element.querySelector("#workbenchMetaTitle") as HTMLInputElement;
        const buttons = dialog.element.querySelectorAll(".b3-dialog__action .b3-button");
        titleElement.focus();
        titleElement.select();
        refreshWorkbenchStatusOptions(dialog.element, item.status);
        typeElement.addEventListener("change", () => refreshWorkbenchStatusOptions(dialog.element));
        buttons[0].addEventListener("click", () => {
            dialog.destroy();
        });
        buttons[1].addEventListener("click", async () => {
            if (!validateName(titleElement.value, titleElement)) {
                return;
            }
            const title = replaceFileName(titleElement.value.trim());
            const attrs = applyWorkbenchRulesToAttrs(item, {
                [WorkbenchAttr.type]: (dialog.element.querySelector("#workbenchMetaType") as HTMLSelectElement).value,
                [WorkbenchAttr.status]: (dialog.element.querySelector("#workbenchMetaStatus") as HTMLSelectElement).value,
                [WorkbenchAttr.inbox]: (dialog.element.querySelector("#workbenchMetaInbox") as HTMLInputElement).checked ? "true" : "false",
                [WorkbenchAttr.project]: (dialog.element.querySelector("#workbenchMetaProject") as HTMLInputElement).value.trim(),
                [WorkbenchAttr.dueDate]: (dialog.element.querySelector("#workbenchMetaDueDate") as HTMLInputElement)?.value || "",
                [WorkbenchAttr.eventTime]: (dialog.element.querySelector("#workbenchMetaEventTime") as HTMLInputElement)?.value || "",
                [WorkbenchAttr.location]: (dialog.element.querySelector("#workbenchMetaLocation") as HTMLInputElement)?.value.trim() || "",
                [WorkbenchAttr.sourceURL]: (dialog.element.querySelector("#workbenchMetaSourceURL") as HTMLInputElement)?.value.trim() || "",
                [WorkbenchAttr.goal]: (dialog.element.querySelector("#workbenchMetaGoal") as HTMLTextAreaElement)?.value.trim() || "",
                [WorkbenchAttr.nextStep]: (dialog.element.querySelector("#workbenchMetaNextStep") as HTMLTextAreaElement)?.value.trim() || "",
                [WorkbenchAttr.capturedAt]: item.capturedAt || "",
                [WorkbenchAttr.title]: item.entityKind === "block" ? title : "",
                tags: (dialog.element.querySelector("#workbenchMetaTags") as HTMLInputElement).value.trim(),
            });
            const response = await fetchSyncPost("/api/workbench/saveWorkbenchItem", {
                id: item.id,
                title,
                attrs,
            });
            if (response.code === 0) {
                void loadWorkbenchReminderModule().then(({scheduleWorkbenchReminderSync}) => {
                    scheduleWorkbenchReminderSync();
                });
                showMessage(window.sourceflow.languages.workbenchSaved);
                resolved = true;
                dialog.destroy();
                resolve(true);
            }
        });
    });
};

const collectWorkbenchBatchAttrs = (dialogElement: HTMLElement) => {
    const attrs: Record<string, string | null> = {};
    if ((dialogElement.querySelector("#workbenchBatchApplyStatus") as HTMLInputElement).checked) {
        attrs[WorkbenchAttr.status] = (dialogElement.querySelector("#workbenchBatchStatus") as HTMLSelectElement).value;
    }
    if ((dialogElement.querySelector("#workbenchBatchApplyProject") as HTMLInputElement).checked) {
        attrs[WorkbenchAttr.project] = (dialogElement.querySelector("#workbenchBatchProject") as HTMLInputElement).value.trim();
    }
    if ((dialogElement.querySelector("#workbenchBatchApplyTags") as HTMLInputElement).checked) {
        attrs.tags = (dialogElement.querySelector("#workbenchBatchTags") as HTMLInputElement).value.trim();
    }
    if ((dialogElement.querySelector("#workbenchBatchApplyInbox") as HTMLInputElement).checked) {
        attrs[WorkbenchAttr.inbox] = (dialogElement.querySelector("#workbenchBatchInbox") as HTMLSelectElement).value;
    }
    if ((dialogElement.querySelector("#workbenchBatchApplyDueDate") as HTMLInputElement).checked) {
        attrs[WorkbenchAttr.dueDate] = (dialogElement.querySelector("#workbenchBatchDueDate") as HTMLInputElement).value;
    }
    if ((dialogElement.querySelector("#workbenchBatchApplyEventTime") as HTMLInputElement).checked) {
        attrs[WorkbenchAttr.eventTime] = (dialogElement.querySelector("#workbenchBatchEventTime") as HTMLInputElement).value;
    }
    if ((dialogElement.querySelector("#workbenchBatchApplyLocation") as HTMLInputElement).checked) {
        attrs[WorkbenchAttr.location] = (dialogElement.querySelector("#workbenchBatchLocation") as HTMLInputElement).value.trim();
    }
    return attrs;
};

const applyWorkbenchBatchPreset = (dialogElement: HTMLElement, attrs: Record<string, string | null>) => {
    const mapping: Array<{ key: string, applyId: string, valueId: string, type?: "checkbox" }> = [
        {key: WorkbenchAttr.status, applyId: "workbenchBatchApplyStatus", valueId: "workbenchBatchStatus"},
        {key: WorkbenchAttr.project, applyId: "workbenchBatchApplyProject", valueId: "workbenchBatchProject"},
        {key: "tags", applyId: "workbenchBatchApplyTags", valueId: "workbenchBatchTags"},
        {key: WorkbenchAttr.inbox, applyId: "workbenchBatchApplyInbox", valueId: "workbenchBatchInbox"},
        {key: WorkbenchAttr.dueDate, applyId: "workbenchBatchApplyDueDate", valueId: "workbenchBatchDueDate"},
        {key: WorkbenchAttr.eventTime, applyId: "workbenchBatchApplyEventTime", valueId: "workbenchBatchEventTime"},
        {key: WorkbenchAttr.location, applyId: "workbenchBatchApplyLocation", valueId: "workbenchBatchLocation"},
    ];
    mapping.forEach((item) => {
        const value = attrs[item.key];
        const applyElement = dialogElement.querySelector(`#${item.applyId}`) as HTMLInputElement;
        const valueElement = dialogElement.querySelector(`#${item.valueId}`) as HTMLInputElement | HTMLSelectElement;
        if (value == null || value === "") {
            applyElement.checked = false;
            if ("value" in valueElement) {
                valueElement.value = "";
            }
            return;
        }
        applyElement.checked = true;
        valueElement.value = value;
    });
};

const openWorkbenchBatchMetaDialog = (items: IWorkbenchItem[], state: IWorkbenchState) => {
    return new Promise<Record<string, string | null> | null>((resolve) => {
        let resolved = false;
        const statusOptions = getBatchStatusOptions(items);
        const dialog = new Dialog({
            title: `${window.sourceflow.languages.workbench} · ${window.sourceflow.languages.workbenchBatchEdit}`,
            width: "640px",
            destroyCallback() {
                if (!resolved) {
                    resolved = true;
                    resolve(null);
                }
            },
            content: `<div class="b3-dialog__content">
    <div class="b3-label__text" style="margin-bottom: 12px;">${window.sourceflow.languages.selected} ${items.length}</div>
    <label class="b3-label">
        <div>${window.sourceflow.languages.workbenchActionPreset}</div>
        <div class="fn__flex" style="gap: 8px;flex-wrap: wrap;">
            <select id="workbenchBatchPreset" class="b3-select fn__block" style="max-width: 240px;">
                <option value="">${window.sourceflow.languages.workbenchActionPreset}</option>
                ${state.actionPresets.map((item) => `<option value="${escapeAttr(item.name)}">${escapeHTML(item.name)}</option>`).join("")}
            </select>
            <button class="b3-button b3-button--outline" data-action="save-batch-preset">${window.sourceflow.languages.workbenchSaveActionPreset}</button>
            <button class="b3-button b3-button--outline" data-action="remove-batch-preset">${window.sourceflow.languages.workbenchDeleteActionPreset}</button>
        </div>
    </label>
    <div class="fn__flex-column" style="gap: 12px;">
        <label class="b3-label">
            <span class="fn__flex" style="gap: 8px;align-items: center;">
                <input id="workbenchBatchApplyStatus" class="b3-switch" type="checkbox">
                <span>${window.sourceflow.languages.status}</span>
            </span>
            <select id="workbenchBatchStatus" class="b3-select fn__block">
                ${statusOptions.map((status) => `<option value="${status}">${escapeHTML(statusLabel(status))}</option>`).join("")}
            </select>
        </label>
        <label class="b3-label">
            <span class="fn__flex" style="gap: 8px;align-items: center;">
                <input id="workbenchBatchApplyProject" class="b3-switch" type="checkbox">
                <span>${window.sourceflow.languages.project}</span>
            </span>
            <input id="workbenchBatchProject" class="b3-text-field fn__block" spellcheck="false" placeholder="${escapeAttr(window.sourceflow.languages.optional)}">
        </label>
        <label class="b3-label">
            <span class="fn__flex" style="gap: 8px;align-items: center;">
                <input id="workbenchBatchApplyTags" class="b3-switch" type="checkbox">
                <span>${window.sourceflow.languages.captureTags}</span>
            </span>
            <input id="workbenchBatchTags" class="b3-text-field fn__block" spellcheck="false" placeholder="inbox,task">
        </label>
        <label class="b3-label">
            <span class="fn__flex" style="gap: 8px;align-items: center;">
                <input id="workbenchBatchApplyInbox" class="b3-switch" type="checkbox">
                <span>${window.sourceflow.languages.inbox}</span>
            </span>
            <select id="workbenchBatchInbox" class="b3-select fn__block">
                <option value="true">${escapeHTML(window.sourceflow.languages.workbenchKeepInInbox)}</option>
                <option value="false">${escapeHTML(window.sourceflow.languages.workbenchRemoveFromInbox)}</option>
            </select>
        </label>
        <div class="fn__flex" style="gap: 8px;">
            <label class="b3-label fn__flex-1">
                <span class="fn__flex" style="gap: 8px;align-items: center;">
                    <input id="workbenchBatchApplyDueDate" class="b3-switch" type="checkbox">
                    <span>${window.sourceflow.languages.taskDueDate}</span>
                </span>
                <input id="workbenchBatchDueDate" class="b3-text-field fn__block" type="date">
            </label>
            <label class="b3-label fn__flex-1">
                <span class="fn__flex" style="gap: 8px;align-items: center;">
                    <input id="workbenchBatchApplyEventTime" class="b3-switch" type="checkbox">
                    <span>${window.sourceflow.languages.eventTime}</span>
                </span>
                <input id="workbenchBatchEventTime" class="b3-text-field fn__block" type="datetime-local">
            </label>
        </div>
        <label class="b3-label">
            <span class="fn__flex" style="gap: 8px;align-items: center;">
                <input id="workbenchBatchApplyLocation" class="b3-switch" type="checkbox">
                <span>${window.sourceflow.languages.location}</span>
            </span>
            <input id="workbenchBatchLocation" class="b3-text-field fn__block" spellcheck="false" placeholder="${escapeAttr(window.sourceflow.languages.optional)}">
        </label>
    </div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.save}</button>
</div>`,
        });
        const buttons = dialog.element.querySelectorAll(".b3-dialog__action .b3-button");
        buttons[0].addEventListener("click", () => {
            dialog.destroy();
        });
        dialog.element.addEventListener("click", (event) => {
            const target = (event.target as HTMLElement).closest("[data-action]") as HTMLElement;
            if (!target) {
                return;
            }
            const action = target.getAttribute("data-action");
            if (action === "save-batch-preset") {
                const attrs = collectWorkbenchBatchAttrs(dialog.element);
                if (!Object.keys(attrs).length) {
                    showMessage(window.sourceflow.languages.workbenchEmpty);
                    return;
                }
                const name = window.prompt(window.sourceflow.languages.workbenchSaveActionPreset, "");
                const trimmedName = `${name || ""}`.trim();
                if (!trimmedName) {
                    return;
                }
                state.actionPresets = [{name: trimmedName, attrs}].concat(state.actionPresets.filter((item) => item.name !== trimmedName)).slice(0, 20);
                saveState(state);
                const presetElement = dialog.element.querySelector("#workbenchBatchPreset") as HTMLSelectElement;
                presetElement.innerHTML = `<option value="">${window.sourceflow.languages.workbenchActionPreset}</option>${state.actionPresets.map((item) => `<option value="${escapeAttr(item.name)}">${escapeHTML(item.name)}</option>`).join("")}`;
                presetElement.value = trimmedName;
                showMessage(window.sourceflow.languages.workbenchActionPresetSaved);
                return;
            }
            if (action === "remove-batch-preset") {
                const presetElement = dialog.element.querySelector("#workbenchBatchPreset") as HTMLSelectElement;
                const currentName = presetElement.value;
                if (!currentName) {
                    return;
                }
                state.actionPresets = state.actionPresets.filter((item) => item.name !== currentName);
                saveState(state);
                presetElement.innerHTML = `<option value="">${window.sourceflow.languages.workbenchActionPreset}</option>${state.actionPresets.map((item) => `<option value="${escapeAttr(item.name)}">${escapeHTML(item.name)}</option>`).join("")}`;
                showMessage(window.sourceflow.languages.workbenchActionPresetDeleted);
            }
        });
        (dialog.element.querySelector("#workbenchBatchPreset") as HTMLSelectElement).addEventListener("change", (event) => {
            const name = (event.target as HTMLSelectElement).value;
            const preset = state.actionPresets.find((item) => item.name === name);
            if (!preset) {
                return;
            }
            applyWorkbenchBatchPreset(dialog.element, preset.attrs);
        });
        buttons[1].addEventListener("click", () => {
            const attrs = collectWorkbenchBatchAttrs(dialog.element);
            resolved = true;
            dialog.destroy();
            resolve(Object.keys(attrs).length ? attrs : null);
        });
    });
};

const batchSetAttrs = async (itemsOrIDs: Array<IWorkbenchItem | string>, attrs: Record<string, string | null>) => {
    if (!itemsOrIDs.length) {
        return;
    }
    const blockAttrs = itemsOrIDs.map((item) => {
        if (typeof item === "string") {
            return {id: item, attrs};
        }
        return {
            id: item.id,
            attrs: applyWorkbenchRulesToAttrs(item, attrs),
        };
    });
    const response = await fetchSyncPost("/api/attr/batchSetBlockAttrs", {
        blockAttrs,
    });
    if (response.code === 0) {
        void loadWorkbenchReminderModule().then(({scheduleWorkbenchReminderSync}) => {
            scheduleWorkbenchReminderSync();
        });
    }
};

const getEmptyWorkbenchSummary = (total = 0, filtered = 0): IWorkbenchSummary => ({
    total,
    filtered,
    docCount: 0,
    viewCount: 0,
    inboxCount: 0,
    taskCount: 0,
    eventCount: 0,
    projectCount: 0,
    reviewCount: 0,
    typeCounts: {},
    statusCounts: {},
    notebooks: [],
    projects: [],
    tags: [],
    quickFilters: [],
    refTotal: 0,
    assetTotal: 0,
    subFileTotal: 0,
});

const buildWorkbenchQueryCacheKey = (state: IWorkbenchState, limit: number) => JSON.stringify({
    limit,
    activeTab: state.activeTab,
    query: state.query.trim(),
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
});

const buildWorkbenchBlockCacheKey = (state: IWorkbenchState, scopeItems: IWorkbenchItem[], parsed: ReturnType<typeof parseQuery>, limit: number) => JSON.stringify({
    query: parsed.text.join(" ").trim(),
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
    limit,
    scope: scopeItems.map((item) => item.rootID || item.id).sort(),
});

const pruneTimedCache = <T>(cache: Map<string, { expiresAt: number, data: T }>, maxEntries: number) => {
    const now = Date.now();
    cache.forEach((entry, key) => {
        if (entry.expiresAt <= now) {
            cache.delete(key);
        }
    });
    if (cache.size <= maxEntries) {
        return;
    }
    Array.from(cache.entries()).sort((left, right) => left[1].expiresAt - right[1].expiresAt)
        .slice(0, cache.size - maxEntries)
        .forEach(([key]) => cache.delete(key));
};

const fetchWorkbenchData = async (state: IWorkbenchState, limit = 2048): Promise<IWorkbenchQueryResponse> => {
    const cacheKey = buildWorkbenchQueryCacheKey(state, limit);
    const now = Date.now();
    const cached = workbenchQueryCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.data;
    }
    if (workbenchQueryInflight.has(cacheKey)) {
        return workbenchQueryInflight.get(cacheKey);
    }
    const request = (async () => {
        const response = await fetchSyncPost("/api/workbench/queryWorkbenchItems", {
            limit,
            query: state.query,
            activeTab: state.activeTab,
            sortBy: state.sortBy,
            sortOrder: state.sortOrder,
        });
        const items = response.data?.allItems as IWorkbenchItem[] || [];
        const visibleItems = response.data?.items as IWorkbenchItem[] || [];
        const data = {
            items: visibleItems,
            allItems: items,
            summary: response.data?.summary as IWorkbenchSummary || getEmptyWorkbenchSummary(items.length, visibleItems.length),
        };
        workbenchQueryCache.set(cacheKey, {
            expiresAt: Date.now() + WORKBENCH_QUERY_CACHE_TTL,
            data,
        });
        pruneTimedCache(workbenchQueryCache, 24);
        return data;
    })();
    workbenchQueryInflight.set(cacheKey, request);
    try {
        return await request;
    } finally {
        workbenchQueryInflight.delete(cacheKey);
    }
};

interface IWorkbenchResolvedContext {
    allItems: IWorkbenchItem[];
    visibleItems: IWorkbenchItem[];
    summary: IWorkbenchSummary;
    parsed: ReturnType<typeof parseQuery>;
    blockScopeItems: IWorkbenchItem[];
    blocks: IWorkbenchSearchBlock[];
}

const resolveWorkbenchContext = async (state: IWorkbenchState, itemLimit = 2048, blockLimit = 256): Promise<IWorkbenchResolvedContext> => {
    const response = await fetchWorkbenchData(state, itemLimit);
    const parsed = parseQuery(state.query);
    let blockScopeItems = response.items;
    if (parsed.text.length) {
        const filterOnlyQuery = buildFilterOnlyQuery(parsed);
        if (filterOnlyQuery !== state.query.trim()) {
            const scopeResponse = await fetchWorkbenchData(Object.assign({}, state, {resultLayer: "items" as TWorkbenchResultLayer, query: filterOnlyQuery}), itemLimit);
            blockScopeItems = scopeResponse.items;
        }
    }
    return {
        allItems: response.allItems,
        visibleItems: response.items,
        summary: response.summary,
        parsed,
        blockScopeItems,
        blocks: await resolveWorkbenchBlocks(state, blockScopeItems, parsed, blockLimit),
    };
};

const buildWorkbenchDraft = async (app: App, kind: "report" | "review" | "dashboard", initialTab?: TWorkbenchTab, dashboardName?: string) => {
    const state = getState();
    if (initialTab) {
        state.activeTab = initialTab;
    }
    if (dashboardName) {
        const dashboard = state.dashboards.find((item) => item.name === dashboardName);
        if (dashboard) {
            applyWorkbenchDashboard(state, dashboard);
        }
    }
    const context = await resolveWorkbenchContext(state);
    const items = context.visibleItems;
    if (!items.length && !context.blocks.length && kind !== "review") {
        showMessage(window.sourceflow.languages.workbenchEmpty);
        return;
    }
    const draft = {
        report: {
            title: `${window.sourceflow.languages.workbenchReportTitle} ${formatDateTime(Date.now())}`,
            content: buildWorkbenchReportMarkdown(state, context.summary, items, context.blocks, context.blockScopeItems.length),
            tags: "workbench,report",
            pathPrefix: "Workbench/Reports",
        },
        review: {
            title: `${window.sourceflow.languages.workbenchReviewTitle} ${formatDateTime(Date.now())}`,
            content: buildWorkbenchReviewMarkdown(items),
            tags: "workbench,review",
            pathPrefix: "Workbench/Reviews",
        },
        dashboard: {
            title: `${window.sourceflow.languages.workbenchDashboardTitle} ${formatDateTime(Date.now())}`,
            content: buildWorkbenchDashboardMarkdown(state, context.summary, items, context.blocks, context.blockScopeItems.length),
            tags: "workbench,dashboard",
            pathPrefix: "Workbench/Dashboards",
        },
    }[kind];
    openWorkbenchItemDialog(app, "note", {
        mode: "note",
        title: draft.title,
        content: draft.content,
        tags: draft.tags,
        pathPrefix: draft.pathPrefix,
        openAfterSave: true,
    });
};

const buildWorkbenchAIPrompt = (state: IWorkbenchState, summary: IWorkbenchSummary, items: IWorkbenchItem[], blocks: IWorkbenchSearchBlock[], blockScopeCount: number, mode: "summary" | "plan") => {
    const headline = mode === "plan"
        ? window.sourceflow.languages.aiPlanWorkbench
        : window.sourceflow.languages.aiSummarizeWorkbench;
    const instruction = mode === "plan"
        ? "请根据当前工作台视图快照，识别优先级、风险和阻塞项，并给出一份下一步可执行的行动计划。"
        : "请根据当前工作台视图快照，给出结构化总结、关键趋势、风险点和建议。";
    const scopeLines = [
        `${window.sourceflow.languages.tab}: ${tabLabel(state.activeTab)}`,
        `${window.sourceflow.languages.workbenchResultLayer}: ${state.resultLayer === "blocks" ? window.sourceflow.languages.workbenchLayerBlocks : window.sourceflow.languages.workbenchLayerItems}`,
        `${window.sourceflow.languages.workbenchView}: ${viewLabel(getActiveView(state), state.activeTab)}`,
        `${window.sourceflow.languages.workbenchGroupBy}: ${state.resultLayer === "blocks" ? window.sourceflow.languages.none : groupByLabel(state.groupBy)}`,
        `${window.sourceflow.languages.sort}: ${sortLabel(state.sortBy, state.resultLayer)} / ${state.sortOrder === "asc" ? window.sourceflow.languages.asc : window.sourceflow.languages.desc}`,
        `${window.sourceflow.languages.workbenchQuery}: ${state.query.trim() || window.sourceflow.languages.none}`,
    ];
    return [
        `# ${headline}`,
        "",
        instruction,
        "",
        "## 当前视图快照",
        "",
        ...scopeLines.map((line) => `- ${line}`),
        "",
        buildWorkbenchReportMarkdown(state, summary, items, blocks, blockScopeCount),
    ].join("\n");
};

export const openWorkbenchAssistant = async (app: App, mode: "summary" | "plan" = "summary") => {
    const state = getState();
    const context = await resolveWorkbenchContext(state);
    if (!context.visibleItems.length && !context.blocks.length) {
        showMessage(window.sourceflow.languages.workbenchEmpty);
        return;
    }
    const prompt = buildWorkbenchAIPrompt(state, context.summary, context.visibleItems, context.blocks, context.blockScopeItems.length, mode);
    openWorkbenchAssistantDock({
        message: prompt,
        includeCurrentNote: false,
    });
};

const buildWorkbenchViewTemplate = (state: IWorkbenchState, name: string): IWorkbenchViewTemplate => ({
    name,
    activeTab: state.activeTab,
    resultLayer: state.resultLayer,
    query: state.query.trim(),
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
    view: getActiveView(state),
    groupBy: state.groupBy,
    pathPrefix: "Workbench/Views",
    tags: "workbench,view",
});

const createWorkbenchViewNote = async (app: App, state: IWorkbenchState, template?: IWorkbenchViewTemplate, target?: {
    notebook?: string;
    pathPrefix?: string;
}) => {
    const sourceState = {...state};
    if (template) {
        applyWorkbenchViewTemplate(sourceState, template);
    }
    const result = await resolveWorkbenchContext(sourceState);
    const titleBase = template?.name || window.sourceflow.languages.workbenchViewNoteTitle;
    openWorkbenchItemDialog(app, "note", {
        mode: "note",
        title: `${titleBase} ${formatDateTime(Date.now())}`,
        content: (template?.tags || "").includes("skill")
            ? buildWorkbenchSkillNoteMarkdown(sourceState, result.summary, result.blocks, result.blockScopeItems.length)
            : buildWorkbenchViewNoteMarkdown(sourceState, result.summary, result.blocks, result.blockScopeItems.length),
        tags: template?.tags || "workbench,view",
        notebook: target?.notebook,
        pathPrefix: target?.pathPrefix || template?.pathPrefix || "Workbench/Views",
        openAfterSave: true,
        modeTags: [],
        attrs: buildWorkbenchViewNoteAttrs(sourceState),
    });
};

const renderWorkbench = async (dialog: Dialog, app: App, state: IWorkbenchState, selected: Set<string>, focusQuery = false) => {
    const renderToken = ++workbenchRenderToken;
    state.sortBy = normalizeWorkbenchSortBy(state.resultLayer, state.sortBy);
    if (state.resultLayer === "blocks") {
        state.groupBy = "none";
    }
    saveState(state);
    const context = await resolveWorkbenchContext(state);
    if (renderToken !== workbenchRenderToken || !dialog.element.isConnected) {
        return;
    }
    const items = context.allItems;
    const visibleItems = context.visibleItems;
    const summary = context.summary;
    const activeView = getActiveView(state);
    const viewOptions = getViewOptions(state.activeTab, state.resultLayer);
    const parsed = context.parsed;
    const relatedBlocks = context.blocks;
    const selectedVisible = state.resultLayer === "items" ? visibleItems.filter((item) => selected.has(item.id)) : [];
    const isSavedViewsMode = state.activeTab === "library" &&
        state.resultLayer === "items" &&
        (parsed.filters["has"] || []).includes("view") &&
        (parsed.filters["type"] || []).includes("doc");
    const blockSummary = state.resultLayer === "blocks"
        ? window.sourceflow.languages.workbenchBlockSummary
            .replace("${x}", String(relatedBlocks.length))
            .replace("${y}", String(context.blockScopeItems.length))
        : "";
    const shouldDeferPanel = shouldDeferWorkbenchPanelRender(state, visibleItems, relatedBlocks);
    const panelLoadingHTML = `<div class="ft__secondary" style="padding: 24px 0;">${escapeHTML(window.sourceflow.languages.loading)}</div>`;

    const bodyElement = dialog.element.querySelector(".workbench-content") as HTMLElement;
bodyElement.innerHTML = `<div class="fn__flex" style="gap: 8px;flex-wrap: wrap;align-items: center;margin-bottom: 12px;">
    <button class="b3-button ${state.activeTab === "inbox" ? "b3-button--text" : "b3-button--outline"}" data-action="switch-tab" data-tab="inbox">${window.sourceflow.languages.inbox} <span class="ft__secondary">${summary.inboxCount}</span></button>
    <button class="b3-button ${state.activeTab === "library" ? "b3-button--text" : "b3-button--outline"}" data-action="switch-tab" data-tab="library">${window.sourceflow.languages.workbenchLibrary} <span class="ft__secondary">${summary.docCount}</span></button>
    <button class="b3-button ${isSavedViewsMode ? "b3-button--text" : "b3-button--outline"}" data-action="saved-views">${window.sourceflow.languages.workbenchSavedViews} <span class="ft__secondary">${summary.viewCount}</span></button>
    <button class="b3-button ${state.activeTab === "task" ? "b3-button--text" : "b3-button--outline"}" data-action="switch-tab" data-tab="task">${window.sourceflow.languages.taskCapture} <span class="ft__secondary">${summary.taskCount}</span></button>
    <button class="b3-button ${state.activeTab === "calendar" ? "b3-button--text" : "b3-button--outline"}" data-action="switch-tab" data-tab="calendar">${window.sourceflow.languages.calendar} <span class="ft__secondary">${summary.eventCount}</span></button>
    <button class="b3-button ${state.activeTab === "project" ? "b3-button--text" : "b3-button--outline"}" data-action="switch-tab" data-tab="project">${window.sourceflow.languages.project} <span class="ft__secondary">${summary.projectCount}</span></button>
    <button class="b3-button ${state.activeTab === "review" ? "b3-button--text" : "b3-button--outline"}" data-action="switch-tab" data-tab="review">${window.sourceflow.languages.review} <span class="ft__secondary">${summary.reviewCount}</span></button>
    <span class="fn__space"></span>
    <button class="b3-button b3-button--outline" data-action="open-capture">${window.sourceflow.languages.urlImport}</button>
    <button class="b3-button b3-button--outline" data-action="refresh">${window.sourceflow.languages.refresh}</button>
</div>
<label class="b3-label" style="margin-top: 0;">
    <div>${window.sourceflow.languages.workbenchQuery}</div>
    <div class="b3-label__text">${window.sourceflow.languages.workbenchQueryTip}</div>
    <div class="fn__flex" style="gap: 8px;flex-wrap:wrap;">
        <select id="workbenchDashboard" class="b3-select" style="max-width: 260px;">
            <option value="">${escapeHTML(window.sourceflow.languages.workbenchDashboard)}</option>
            ${renderWorkbenchDashboardOptions(state)}
        </select>
        <button class="b3-button b3-button--outline" data-action="save-dashboard">${window.sourceflow.languages.workbenchSaveDashboard}</button>
        <button class="b3-button b3-button--outline" data-action="remove-dashboard">${window.sourceflow.languages.workbenchDeleteDashboard}</button>
        <select id="workbenchViewTemplate" class="b3-select" style="max-width: 260px;">
            <option value="">${escapeHTML(window.sourceflow.languages.workbenchViewTemplate)}</option>
            ${renderWorkbenchViewTemplateOptions(state)}
        </select>
        <button class="b3-button b3-button--outline" data-action="save-view-template">${window.sourceflow.languages.workbenchSaveViewTemplate}</button>
        <button class="b3-button b3-button--outline" data-action="remove-view-template">${window.sourceflow.languages.workbenchDeleteViewTemplate}</button>
        <button class="b3-button b3-button--outline" data-action="create-view-note">${window.sourceflow.languages.workbenchCreateViewNote}</button>
        <input id="workbenchQuery" class="b3-text-field fn__block" spellcheck="false" value="${escapeAttr(state.query)}" placeholder="${escapeAttr(window.sourceflow.languages.workbenchQueryPlaceholder)}">
        <div class="fn__flex" style="gap: 8px;align-items: center;">
            <span class="ft__secondary">${escapeHTML(window.sourceflow.languages.workbenchResultLayer)}</span>
            <select id="workbenchResultLayer" class="b3-select" style="max-width: 180px;">
                <option value="items" ${state.resultLayer === "items" ? "selected" : ""}>${escapeHTML(window.sourceflow.languages.workbenchLayerItems)}</option>
                <option value="blocks" ${state.resultLayer === "blocks" ? "selected" : ""}>${escapeHTML(window.sourceflow.languages.workbenchLayerBlocks)}</option>
            </select>
        </div>
        <select id="workbenchPreset" class="b3-select" style="max-width: 260px;">
            <option value="">${escapeHTML(window.sourceflow.languages.workbenchQueryPreset)}</option>
            ${state.presets.map((preset) => `<option value="${escapeAttr(preset)}" ${preset === state.query ? "selected" : ""}>${escapeHTML(preset)}</option>`).join("")}
        </select>
        <select id="workbenchSortBy" class="b3-select" style="max-width: 180px;">
            ${getSortOptions(state.resultLayer).map((item) => `<option value="${item.value}" ${item.value === state.sortBy ? "selected" : ""}>${escapeHTML(item.label)}</option>`).join("")}
        </select>
        <select id="workbenchSortOrder" class="b3-select" style="max-width: 120px;">
            <option value="desc" ${state.sortOrder === "desc" ? "selected" : ""}>${escapeHTML(window.sourceflow.languages.desc)}</option>
            <option value="asc" ${state.sortOrder === "asc" ? "selected" : ""}>${escapeHTML(window.sourceflow.languages.asc)}</option>
        </select>
        ${viewOptions.length > 1 ? `<div class="fn__flex" style="gap: 8px;align-items: center;">
            <span class="ft__secondary">${escapeHTML(window.sourceflow.languages.workbenchView)}</span>
            <select id="workbenchView" class="b3-select" style="max-width: 180px;">
                ${viewOptions.map((item) => `<option value="${item.value}" ${item.value === activeView ? "selected" : ""}>${escapeHTML(item.label)}</option>`).join("")}
            </select>
        </div>` : ""}
        ${state.resultLayer === "items" ? `<div class="fn__flex" style="gap: 8px;align-items: center;">
            <span class="ft__secondary">${escapeHTML(window.sourceflow.languages.workbenchGroupBy)}</span>
            <select id="workbenchGroupBy" class="b3-select" style="max-width: 180px;">
                ${getGroupByOptions().map((item) => `<option value="${item.value}" ${item.value === state.groupBy ? "selected" : ""}>${escapeHTML(item.label)}</option>`).join("")}
            </select>
        </div>` : `<span class="ft__secondary">${escapeHTML(window.sourceflow.languages.workbenchBlocksListTableOnly)}</span>`}
        <button class="b3-button b3-button--outline" data-action="save-query">${window.sourceflow.languages.workbenchSaveQuery}</button>
        <button class="b3-button b3-button--outline" data-action="remove-query">${window.sourceflow.languages.workbenchDeleteQuery}</button>
        <button class="b3-button b3-button--outline" data-action="copy-results">${window.sourceflow.languages.copy} Markdown</button>
        <button class="b3-button b3-button--outline" data-action="copy-csv">${window.sourceflow.languages.workbenchCopyCSV}</button>
        <button class="b3-button b3-button--outline" data-action="download-csv">${window.sourceflow.languages.workbenchExportCSV}</button>
        <button class="b3-button b3-button--outline" data-action="download-markdown">${window.sourceflow.languages.workbenchExportMarkdown}</button>
        <button class="b3-button b3-button--outline" data-action="draft-report">${window.sourceflow.languages.workbenchDraftReport}</button>
        <button class="b3-button b3-button--outline" data-action="draft-review">${window.sourceflow.languages.workbenchDraftReview}</button>
        <button class="b3-button b3-button--outline" data-action="draft-dashboard">${window.sourceflow.languages.workbenchDraftDashboard}</button>
        <button class="b3-button b3-button--outline" data-action="assistant-summary">${window.sourceflow.languages.aiSummarizeWorkbench}</button>
        <button class="b3-button b3-button--outline" data-action="assistant-plan">${window.sourceflow.languages.aiPlanWorkbench}</button>
        <button class="b3-button b3-button--outline" data-action="bind-current-view">${window.sourceflow.languages.workbenchBindCurrentView}</button>
        <button class="b3-button b3-button--outline" data-action="insert-results">${window.sourceflow.languages.workbenchInsertIntoNote}</button>
        <button class="b3-button b3-button--outline" data-action="insert-embed">${window.sourceflow.languages.workbenchEmbedIntoNote}</button>
        <button class="b3-button b3-button--outline" data-action="insert-live-embed">${window.sourceflow.languages.workbenchLiveEmbedIntoNote}</button>
    </div>
</label>
${selectedVisible.length ? `<div class="fn__flex" style="gap: 8px;flex-wrap: wrap;margin-bottom: 12px;">
    <span class="ft__secondary">${window.sourceflow.languages.selected} ${selectedVisible.length}</span>
    ${state.actionPresets.length ? `<select id="workbenchActionPreset" class="b3-select" style="max-width: 220px;">
        <option value="">${escapeHTML(window.sourceflow.languages.workbenchActionPreset)}</option>
        ${state.actionPresets.map((item) => `<option value="${escapeAttr(item.name)}">${escapeHTML(item.name)}</option>`).join("")}
    </select>
    <button class="b3-button b3-button--outline" data-action="apply-action-preset">${window.sourceflow.languages.workbenchApplyActionPreset}</button>` : ""}
    <button class="b3-button b3-button--outline" data-action="batch-edit-meta">${window.sourceflow.languages.workbenchBatchEdit}</button>
    <button class="b3-button b3-button--outline" data-action="batch-clear-inbox">${window.sourceflow.languages.workbenchClearInbox}</button>
    <button class="b3-button b3-button--outline" data-action="batch-convert" data-type="task">${window.sourceflow.languages.workbenchConvertTask}</button>
    <button class="b3-button b3-button--outline" data-action="batch-convert" data-type="event">${window.sourceflow.languages.workbenchConvertEvent}</button>
    <button class="b3-button b3-button--outline" data-action="batch-convert" data-type="project">${window.sourceflow.languages.workbenchConvertProject}</button>
    <button class="b3-button b3-button--outline" data-action="batch-set-due" data-offset="0">${window.sourceflow.languages.workbenchScheduleToday}</button>
    <button class="b3-button b3-button--outline" data-action="batch-set-due" data-offset="1">${window.sourceflow.languages.workbenchScheduleTomorrow}</button>
    <button class="b3-button b3-button--outline" data-action="batch-set-due" data-offset="7">${window.sourceflow.languages.workbenchScheduleNextWeek}</button>
    <button class="b3-button b3-button--outline" data-action="batch-status" data-status="todo">${window.sourceflow.languages.workbenchTodo}</button>
    <button class="b3-button b3-button--outline" data-action="batch-status" data-status="doing">${window.sourceflow.languages.workbenchDoing}</button>
    <button class="b3-button b3-button--outline" data-action="batch-status" data-status="done">${window.sourceflow.languages.workbenchDone}</button>
</div>` : ""}
<div class="b3-label__text" style="margin-bottom: 8px;">${state.resultLayer === "blocks" ? blockSummary : window.sourceflow.languages.workbenchSummary.replace("${x}", String(summary.filtered))}</div>
<div class="fn__flex" style="gap: 8px;flex-wrap: wrap;margin-bottom: 12px;">
    ${summary.viewCount ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.workbenchHasView)} ${summary.viewCount}</span>` : ""}
    ${summary.refTotal ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.ref)} ${summary.refTotal}</span>` : ""}
    ${summary.assetTotal ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.workbenchHasAsset)} ${summary.assetTotal}</span>` : ""}
    ${summary.subFileTotal ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.workbenchHasSubdoc)} ${summary.subFileTotal}</span>` : ""}
    ${state.resultLayer === "blocks" ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.workbenchLayerBlocks)} ${relatedBlocks.length}</span>` : ""}
</div>
${state.resultLayer === "items" ? `<div class="fn__flex" style="gap: 8px;flex-wrap: wrap;margin-bottom: 12px;">
    ${Object.entries(summary.typeCounts || {}).map(([key, count]) => `<button class="b3-button b3-button--outline" data-action="append-query-token" data-token="${escapeAttr(`type:${key}`)}">${escapeHTML(typeLabel(key as IWorkbenchItem["type"]))} <span class="ft__secondary">${count}</span></button>`).join("")}
    ${Object.entries(summary.statusCounts || {}).map(([key, count]) => `<button class="b3-button b3-button--outline" data-action="append-query-token" data-token="${escapeAttr(`status:${key}`)}">${escapeHTML(statusLabel(key))} <span class="ft__secondary">${count}</span></button>`).join("")}
</div>` : ""}
${state.resultLayer === "items" ? `<div class="fn__flex" style="gap: 12px;flex-wrap: wrap;margin-bottom: 12px;">
    ${renderFacetSection(window.sourceflow.languages.workbenchFacetQuick, summary.quickFilters || [], getQuickFacetLabel)}
    ${renderFacetSection(window.sourceflow.languages.workbenchFacetNotebook, summary.notebooks || [])}
    ${renderFacetSection(window.sourceflow.languages.workbenchFacetProject, summary.projects || [])}
    ${renderFacetSection(window.sourceflow.languages.workbenchFacetTag, summary.tags || [], (facet) => `#${facet.name}`)}
</div>` : ""}
<div class="workbench-panel">${shouldDeferPanel ? panelLoadingHTML : renderWorkbenchPanelContent(state, visibleItems, items, relatedBlocks)}</div>
${state.resultLayer === "items" && parsed.text.length ? `<div class="b3-card" style="padding:16px;margin-top:16px;">
    <div class="fn__flex" style="justify-content:space-between;align-items:center;margin-bottom:12px;">
        <strong>${window.sourceflow.languages.workbenchRelatedResults}</strong>
        <div class="fn__flex" style="gap:8px;align-items:center;">
            <span class="ft__secondary">${relatedBlocks.length}</span>
            <button class="b3-button b3-button--outline" data-action="switch-result-layer" data-layer="blocks">${window.sourceflow.languages.workbenchLayerBlocks}</button>
        </div>
    </div>
    ${relatedBlocks.length ? relatedBlocks.map((item) => renderSearchBlock(item)).join("") : `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`}
</div>` : ""}`;

    const queryElement = bodyElement.querySelector("#workbenchQuery") as HTMLInputElement;
    if (focusQuery) {
        queryElement?.focus();
        queryElement?.setSelectionRange(state.query.length, state.query.length);
    }
    queryElement?.addEventListener("input", (event) => {
        state.query = (event.target as HTMLInputElement).value;
        clearWorkbenchSavedSelections(state);
        window.clearTimeout(workbenchQueryInputTimer);
        workbenchQueryInputTimer = window.setTimeout(() => {
            renderWorkbench(dialog, app, state, selected, true);
        }, 180);
    });
    const dashboardElement = bodyElement.querySelector("#workbenchDashboard") as HTMLSelectElement;
    dashboardElement?.addEventListener("change", (event) => {
        const name = (event.target as HTMLSelectElement).value;
        const dashboard = state.dashboards.find((item) => item.name === name);
        if (!dashboard) {
            return;
        }
        applyWorkbenchDashboard(state, dashboard);
        renderWorkbench(dialog, app, state, selected, true);
    });
    const viewTemplateElement = bodyElement.querySelector("#workbenchViewTemplate") as HTMLSelectElement;
    viewTemplateElement?.addEventListener("change", (event) => {
        const name = (event.target as HTMLSelectElement).value;
        if (!name) {
            clearWorkbenchViewTemplateSelection(state);
            renderWorkbench(dialog, app, state, selected, true);
            return;
        }
        const template = state.viewTemplates.find((item) => item.name === name);
        if (!template) {
            return;
        }
        applyWorkbenchViewTemplate(state, template);
        renderWorkbench(dialog, app, state, selected, true);
    });
    const presetElement = bodyElement.querySelector("#workbenchPreset") as HTMLSelectElement;
    presetElement?.addEventListener("change", (event) => {
        state.query = (event.target as HTMLSelectElement).value;
        clearWorkbenchSavedSelections(state);
        renderWorkbench(dialog, app, state, selected, true);
    });
    const resultLayerElement = bodyElement.querySelector("#workbenchResultLayer") as HTMLSelectElement;
    resultLayerElement?.addEventListener("change", (event) => {
        state.resultLayer = normalizeWorkbenchResultLayer((event.target as HTMLSelectElement).value);
        state.sortBy = normalizeWorkbenchSortBy(state.resultLayer, state.sortBy);
        state.views[state.activeTab] = normalizeWorkbenchView(state.activeTab, state.views[state.activeTab], state.resultLayer);
        if (state.resultLayer === "blocks") {
            state.groupBy = "none";
        }
        selected.clear();
        clearWorkbenchSavedSelections(state);
        renderWorkbench(dialog, app, state, selected, true);
    });
    const sortByElement = bodyElement.querySelector("#workbenchSortBy") as HTMLSelectElement;
    sortByElement?.addEventListener("change", (event) => {
        state.sortBy = normalizeWorkbenchSortBy(state.resultLayer, (event.target as HTMLSelectElement).value);
        clearWorkbenchSavedSelections(state);
        renderWorkbench(dialog, app, state, selected, true);
    });
    const sortOrderElement = bodyElement.querySelector("#workbenchSortOrder") as HTMLSelectElement;
    sortOrderElement?.addEventListener("change", (event) => {
        state.sortOrder = (event.target as HTMLSelectElement).value;
        clearWorkbenchSavedSelections(state);
        renderWorkbench(dialog, app, state, selected, true);
    });
    const viewElement = bodyElement.querySelector("#workbenchView") as HTMLSelectElement;
    viewElement?.addEventListener("change", (event) => {
        state.views[state.activeTab] = normalizeWorkbenchView(state.activeTab, (event.target as HTMLSelectElement).value, state.resultLayer);
        clearWorkbenchSavedSelections(state);
        renderWorkbench(dialog, app, state, selected, true);
    });
    const groupByElement = bodyElement.querySelector("#workbenchGroupBy") as HTMLSelectElement;
    groupByElement?.addEventListener("change", (event) => {
        state.groupBy = normalizeWorkbenchGroupBy((event.target as HTMLSelectElement).value);
        clearWorkbenchSavedSelections(state);
        renderWorkbench(dialog, app, state, selected, true);
    });

    bodyElement.onclick = async (event) => {
        const target = event.target as HTMLElement;
        const actionTarget = target.closest("[data-action]") as HTMLElement;
        if (!actionTarget) {
            return;
        }
        const action = actionTarget.getAttribute("data-action");
        if (action === "switch-tab") {
            state.activeTab = actionTarget.getAttribute("data-tab") as TWorkbenchTab;
            state.views[state.activeTab] = normalizeWorkbenchView(state.activeTab, state.views[state.activeTab], state.resultLayer);
            clearWorkbenchSavedSelections(state);
            renderWorkbench(dialog, app, state, selected);
            return;
        }
        if (action === "switch-result-layer") {
            state.resultLayer = normalizeWorkbenchResultLayer(actionTarget.getAttribute("data-layer"));
            state.sortBy = normalizeWorkbenchSortBy(state.resultLayer, state.sortBy);
            state.views[state.activeTab] = normalizeWorkbenchView(state.activeTab, state.views[state.activeTab], state.resultLayer);
            if (state.resultLayer === "blocks") {
                state.groupBy = "none";
            }
            selected.clear();
            clearWorkbenchSavedSelections(state);
            renderWorkbench(dialog, app, state, selected, true);
            return;
        }
        if (action === "refresh") {
            renderWorkbench(dialog, app, state, selected);
            return;
        }
        if (action === "save-dashboard") {
            const name = window.prompt(window.sourceflow.languages.workbenchSaveDashboard, state.currentDashboard || "");
            const trimmedName = `${name || ""}`.trim();
            if (!trimmedName) {
                return;
            }
            const dashboard: IWorkbenchDashboardPreset = {
                name: trimmedName,
                activeTab: state.activeTab,
                resultLayer: state.resultLayer,
                query: state.query.trim(),
                sortBy: state.sortBy,
                sortOrder: state.sortOrder,
                view: getActiveView(state),
                groupBy: state.groupBy,
            };
            state.dashboards = [dashboard].concat(state.dashboards.filter((item) => item.name !== trimmedName)).slice(0, 20);
            state.currentDashboard = trimmedName;
            renderWorkbench(dialog, app, state, selected, true);
            showMessage(window.sourceflow.languages.workbenchDashboardSaved);
            return;
        }
        if (action === "remove-dashboard") {
            const currentName = state.currentDashboard || (bodyElement.querySelector("#workbenchDashboard") as HTMLSelectElement)?.value || "";
            if (!currentName) {
                return;
            }
            state.dashboards = state.dashboards.filter((item) => item.name !== currentName);
            state.currentDashboard = "";
            renderWorkbench(dialog, app, state, selected, true);
            showMessage(window.sourceflow.languages.workbenchDashboardDeleted);
            return;
        }
        if (action === "save-view-template") {
            const name = window.prompt(window.sourceflow.languages.workbenchSaveViewTemplate, state.currentViewTemplate || "");
            const trimmedName = `${name || ""}`.trim();
            if (!trimmedName) {
                return;
            }
            const template = buildWorkbenchViewTemplate(state, trimmedName);
            state.viewTemplates = [template].concat(state.viewTemplates.filter((item) => item.name !== trimmedName)).slice(0, 30);
            state.currentViewTemplate = trimmedName;
            state.currentDashboard = "";
            renderWorkbench(dialog, app, state, selected, true);
            showMessage(window.sourceflow.languages.workbenchViewTemplateSaved);
            return;
        }
        if (action === "remove-view-template") {
            const currentName = state.currentViewTemplate || (bodyElement.querySelector("#workbenchViewTemplate") as HTMLSelectElement)?.value || "";
            if (!currentName) {
                return;
            }
            state.viewTemplates = state.viewTemplates.filter((item) => item.name !== currentName);
            state.currentViewTemplate = "";
            renderWorkbench(dialog, app, state, selected, true);
            showMessage(window.sourceflow.languages.workbenchViewTemplateDeleted);
            return;
        }
        if (action === "create-view-note") {
            const templateName = state.currentViewTemplate || (bodyElement.querySelector("#workbenchViewTemplate") as HTMLSelectElement)?.value || "";
            const template = templateName ? state.viewTemplates.find((item) => item.name === templateName) : undefined;
            await createWorkbenchViewNote(app, state, template);
            return;
        }
        if (action === "saved-views") {
            applyWorkbenchSavedViewsState(state);
            renderWorkbench(dialog, app, state, selected, true);
            return;
        }
        if (action === "append-query-token") {
            const token = actionTarget.getAttribute("data-token") || "";
            if (!token) {
                return;
            }
            const current = state.query.trim();
            state.query = current ? `${current} ${token}` : token;
            clearWorkbenchSavedSelections(state);
            renderWorkbench(dialog, app, state, selected, true);
            return;
        }
        if (action === "open-project-tab") {
            const projectName = actionTarget.getAttribute("data-project") || "";
            const nextTab = actionTarget.getAttribute("data-tab") as TWorkbenchTab;
            const nextView = actionTarget.getAttribute("data-view");
            state.activeTab = nextTab;
            state.query = `project:"${projectName}"`;
            if (nextView) {
                state.views[nextTab] = normalizeWorkbenchView(nextTab, nextView, state.resultLayer);
            }
            clearWorkbenchSavedSelections(state);
            renderWorkbench(dialog, app, state, selected, true);
            return;
        }
        if (action === "project-capture") {
            const mode = actionTarget.getAttribute("data-mode") as "note" | "task" | "event";
            openWorkbenchItemDialog(app, mode, {
                mode,
                project: actionTarget.getAttribute("data-project") || "",
            });
            return;
        }
        if (action === "open-capture") {
            openWorkbenchURLImportDialog(app);
            return;
        }
        if (action === "calendar-prev" || action === "calendar-next") {
            state.monthOffset += action === "calendar-prev" ? -1 : 1;
            clearWorkbenchSavedSelections(state);
            renderWorkbench(dialog, app, state, selected);
            return;
        }
        if (action === "copy-results") {
            writeText(state.resultLayer === "blocks" ? buildBlockResultsMarkdown(relatedBlocks) : buildResultsMarkdown(visibleItems));
            showMessage(window.sourceflow.languages.copied);
            return;
        }
        if (action === "copy-csv") {
            writeText(state.resultLayer === "blocks" ? buildBlockResultsCSV(relatedBlocks) : buildResultsCSV(visibleItems));
            showMessage(window.sourceflow.languages.copied);
            return;
        }
        if (action === "download-csv") {
            downloadTextFile(state.resultLayer === "blocks" ? buildBlockResultsCSV(relatedBlocks) : buildResultsCSV(visibleItems), `${buildExportFileBaseName(state)}.csv`, "text/csv;charset=utf-8");
            showMessage(window.sourceflow.languages.workbenchExported);
            return;
        }
        if (action === "download-markdown") {
            downloadTextFile(state.resultLayer === "blocks" ? buildBlockResultsMarkdown(relatedBlocks) : buildResultsMarkdown(visibleItems), `${buildExportFileBaseName(state)}.md`, "text/markdown;charset=utf-8");
            showMessage(window.sourceflow.languages.workbenchExported);
            return;
        }
        if (action === "draft-report") {
            await buildWorkbenchDraft(app, "report", state.activeTab, state.currentDashboard);
            return;
        }
        if (action === "draft-review") {
            await buildWorkbenchDraft(app, "review", state.activeTab, state.currentDashboard);
            return;
        }
        if (action === "draft-dashboard") {
            await buildWorkbenchDraft(app, "dashboard", state.activeTab, state.currentDashboard);
            return;
        }
        if (action === "assistant-summary") {
            await openWorkbenchAssistant(app, "summary");
            return;
        }
        if (action === "assistant-plan") {
            await openWorkbenchAssistant(app, "plan");
            return;
        }
        if (action === "bind-current-view") {
            await saveWorkbenchViewToCurrentNote(state);
            return;
        }
        if (action === "save-query") {
            const query = state.query.trim();
            if (!query) {
                return;
            }
            state.presets = [query].concat(state.presets.filter((item) => item !== query)).slice(0, 20);
            showMessage(window.sourceflow.languages.workbenchQuerySaved);
            renderWorkbench(dialog, app, state, selected, true);
            return;
        }
        if (action === "remove-query") {
            const query = state.query.trim();
            if (!query) {
                return;
            }
            state.presets = state.presets.filter((item) => item !== query);
            showMessage(window.sourceflow.languages.workbenchQueryDeleted);
            renderWorkbench(dialog, app, state, selected, true);
            return;
        }
        if (action === "insert-results") {
            if (state.resultLayer === "blocks" ? !relatedBlocks.length : !visibleItems.length) {
                showMessage(window.sourceflow.languages.workbenchEmpty);
                return;
            }
            await appendMarkdownToCurrentNote(`## ${state.resultLayer === "blocks" ? window.sourceflow.languages.workbenchLayerBlocks : window.sourceflow.languages.workbench}\n\n${state.resultLayer === "blocks" ? buildBlockResultsMarkdown(relatedBlocks) : buildResultsMarkdown(visibleItems)}`);
            return;
        }
        if (action === "insert-embed") {
            const embedMarkdown = state.resultLayer === "blocks"
                ? buildQueryEmbedMarkdownByIDs(relatedBlocks.map((item) => item.id))
                : buildQueryEmbedMarkdown(visibleItems);
            if (!embedMarkdown) {
                showMessage(window.sourceflow.languages.workbenchEmpty);
                return;
            }
            await appendMarkdownToCurrentNote(`## ${state.resultLayer === "blocks" ? window.sourceflow.languages.workbenchLayerBlocks : window.sourceflow.languages.workbench}\n\n${embedMarkdown}`);
            return;
        }
        if (action === "insert-live-embed") {
            await appendMarkdownToCurrentNote(`## ${state.resultLayer === "blocks" ? window.sourceflow.languages.workbenchLayerBlocks : window.sourceflow.languages.workbench}\n\n${buildWorkbenchLiveEmbedMarkdown(state)}`);
            return;
        }
        const id = actionTarget.getAttribute("data-id");
        if ((action === "open-item" || action === "open-block-hit") && id) {
            openWorkbenchItem(app, id);
            return;
        }
        if (action === "open-block-root" && id) {
            openWorkbenchItem(app, id);
            return;
        }
        if (action === "open-bound-view" && id) {
            await openWorkbenchBoundViewByID(app, id);
            return;
        }
        if (action === "edit-item" && id) {
            const workbenchItem = items.find((item) => item.id === id);
            if (!workbenchItem) {
                return;
            }
            if (await openWorkbenchMetaDialog(workbenchItem, items)) {
                renderWorkbench(dialog, app, state, selected);
            }
            return;
        }
        if (action === "clear-inbox" && id) {
            const workbenchItem = items.find((item) => item.id === id);
            await batchSetAttrs(workbenchItem ? [workbenchItem] : [id], {[WorkbenchAttr.inbox]: "false"});
            selected.delete(id);
            renderWorkbench(dialog, app, state, selected);
            return;
        }
        if (action === "convert-item" && id) {
            const type = actionTarget.getAttribute("data-type") as IWorkbenchItem["type"];
            const workbenchItem = items.find((item) => item.id === id);
            await batchSetAttrs(workbenchItem ? [workbenchItem] : [id], getWorkbenchConversionAttrs(type));
            selected.delete(id);
            showMessage(window.sourceflow.languages.workbenchSaved);
            renderWorkbench(dialog, app, state, selected);
            return;
        }
        if (action === "set-due" && id) {
            const offset = parseInt(actionTarget.getAttribute("data-offset") || "0", 10);
            const workbenchItem = items.find((item) => item.id === id);
            await batchSetAttrs(workbenchItem ? [workbenchItem] : [id], {
                [WorkbenchAttr.dueDate]: formatDateOffset(offset),
                [WorkbenchAttr.inbox]: "false",
            });
            showMessage(window.sourceflow.languages.workbenchSaved);
            renderWorkbench(dialog, app, state, selected);
            return;
        }
        if (action === "set-status" && id) {
            const status = actionTarget.getAttribute("data-status");
            const workbenchItem = items.find((item) => item.id === id);
            await batchSetAttrs(workbenchItem ? [workbenchItem] : [id], {
                [WorkbenchAttr.status]: status,
                [WorkbenchAttr.inbox]: status === "done" || status === "completed" ? "false" : null,
            });
            selected.delete(id);
            renderWorkbench(dialog, app, state, selected);
            return;
        }
        if (action === "batch-clear-inbox") {
            await batchSetAttrs(selectedVisible, {[WorkbenchAttr.inbox]: "false"});
            selected.clear();
            renderWorkbench(dialog, app, state, selected);
            return;
        }
        if (action === "batch-convert") {
            const type = actionTarget.getAttribute("data-type") as IWorkbenchItem["type"];
            await batchSetAttrs(selectedVisible, getWorkbenchConversionAttrs(type));
            selected.clear();
            showMessage(window.sourceflow.languages.workbenchSaved);
            renderWorkbench(dialog, app, state, selected);
            return;
        }
        if (action === "batch-set-due") {
            const offset = parseInt(actionTarget.getAttribute("data-offset") || "0", 10);
            await batchSetAttrs(selectedVisible.filter((item) => item.type === "task"), {
                [WorkbenchAttr.dueDate]: formatDateOffset(offset),
                [WorkbenchAttr.inbox]: "false",
            });
            selected.clear();
            showMessage(window.sourceflow.languages.workbenchSaved);
            renderWorkbench(dialog, app, state, selected);
            return;
        }
        if (action === "apply-action-preset") {
            const presetName = (bodyElement.querySelector("#workbenchActionPreset") as HTMLSelectElement)?.value;
            const preset = state.actionPresets.find((item) => item.name === presetName);
            if (!preset) {
                return;
            }
            await batchSetAttrs(selectedVisible, preset.attrs);
            showMessage(window.sourceflow.languages.workbenchSaved);
            renderWorkbench(dialog, app, state, selected);
            return;
        }
        if (action === "batch-edit-meta") {
            const attrs = await openWorkbenchBatchMetaDialog(selectedVisible, state);
            if (!attrs) {
                return;
            }
            const status = attrs[WorkbenchAttr.status];
            if ((status === "done" || status === "completed") && !(WorkbenchAttr.inbox in attrs)) {
                attrs[WorkbenchAttr.inbox] = "false";
            }
            await batchSetAttrs(selectedVisible, attrs);
            showMessage(window.sourceflow.languages.workbenchSaved);
            renderWorkbench(dialog, app, state, selected);
            return;
        }
        if (action === "batch-status") {
            const status = actionTarget.getAttribute("data-status");
            await batchSetAttrs(selectedVisible, {
                [WorkbenchAttr.status]: status,
                [WorkbenchAttr.inbox]: status === "done" ? "false" : null,
            });
            selected.clear();
            renderWorkbench(dialog, app, state, selected);
        }
    };

    bodyElement.onchange = async (event) => {
        const target = event.target as HTMLElement;
        const actionTarget = target.closest("[data-inline-action]") as HTMLElement;
        if (!actionTarget) {
            return;
        }
        const action = actionTarget.getAttribute("data-inline-action");
        const id = actionTarget.getAttribute("data-id");
        if (!action || !id) {
            return;
        }
        if (action === "toggle-inbox") {
            const workbenchItem = items.find((item) => item.id === id);
            await batchSetAttrs(workbenchItem ? [workbenchItem] : [id], {
                [WorkbenchAttr.inbox]: (actionTarget as HTMLInputElement).checked ? "true" : "false",
            });
            renderWorkbench(dialog, app, state, selected);
            return;
        }
        if (action === "set-status") {
            const status = (actionTarget as HTMLSelectElement).value;
            const workbenchItem = items.find((item) => item.id === id);
            await batchSetAttrs(workbenchItem ? [workbenchItem] : [id], {
                [WorkbenchAttr.status]: status,
                [WorkbenchAttr.inbox]: status === "done" || status === "completed" ? "false" : null,
            });
            renderWorkbench(dialog, app, state, selected);
            return;
        }
        if (action === "set-due-date" || action === "set-event-time") {
            const input = actionTarget as HTMLInputElement;
            const value = input.value || "";
            if ((input.getAttribute("data-original") || "") === value) {
                return;
            }
            input.setAttribute("data-original", value);
            const workbenchItem = items.find((item) => item.id === id);
            await batchSetAttrs(workbenchItem ? [workbenchItem] : [id], {
                [action === "set-due-date" ? WorkbenchAttr.dueDate : WorkbenchAttr.eventTime]: value,
            });
            renderWorkbench(dialog, app, state, selected);
        }
    };

    bodyElement.addEventListener("focusout", async (event) => {
        const target = event.target as HTMLElement;
        const actionTarget = target.closest("[data-inline-action]") as HTMLElement;
        if (!actionTarget) {
            return;
        }
        const action = actionTarget.getAttribute("data-inline-action");
        const id = actionTarget.getAttribute("data-id");
        if (!action || !id || !["set-project", "set-tags"].includes(action)) {
            return;
        }
        const input = actionTarget as HTMLInputElement;
        const value = input.value.trim();
        if ((input.getAttribute("data-original") || "") === value) {
            return;
        }
        input.setAttribute("data-original", value);
        const workbenchItem = items.find((item) => item.id === id);
        await batchSetAttrs(workbenchItem ? [workbenchItem] : [id], {
            [action === "set-project" ? WorkbenchAttr.project : "tags"]: value,
        });
        renderWorkbench(dialog, app, state, selected);
    }, true);

    bodyElement.querySelectorAll<HTMLInputElement>('[data-role="select-item"]').forEach((item) => {
        item.checked = selected.has(item.getAttribute("data-id"));
        item.addEventListener("change", () => {
            const id = item.getAttribute("data-id");
            if (item.checked) {
                selected.add(id);
            } else {
                selected.delete(id);
            }
            renderWorkbench(dialog, app, state, selected);
        });
    });
};

export const getWorkbenchDashboardPresets = () => getState().dashboards;

export const getWorkbenchViewTemplates = () => getState().viewTemplates;

export const getWorkbenchBuiltinViewNoteOptions = () => getWorkbenchBuiltinViewNoteOptionsInternal();

export const getWorkbenchQueryPresets = () => getState().presets;

export const getWorkbenchRules = () => getState().rules;

export const getWorkbenchActionPresets = () => getState().actionPresets;

export const saveWorkbenchRules = (rules: IWorkbenchRule[]) => {
    const state = getState();
    state.rules = normalizeWorkbenchRules(rules);
    saveState(state);
    return getState().rules;
};

export const removeWorkbenchRule = (name: string) => {
    const state = getState();
    const trimmed = `${name || ""}`.trim();
    state.rules = state.rules.filter((item) => item.name !== trimmed);
    saveState(state);
    return getState().rules;
};

export const removeWorkbenchQueryPreset = (query: string) => {
    const state = getState();
    state.presets = state.presets.filter((item) => item !== `${query || ""}`.trim());
    saveState(state);
    return getState();
};

export const removeWorkbenchActionPreset = (name: string) => {
    const state = getState();
    state.actionPresets = state.actionPresets.filter((item) => item.name !== `${name || ""}`.trim());
    saveState(state);
    return getState();
};

export const removeWorkbenchDashboardPreset = (name: string) => {
    const state = getState();
    const trimmed = `${name || ""}`.trim();
    state.dashboards = state.dashboards.filter((item) => item.name !== trimmed);
    if (state.currentDashboard === trimmed) {
        state.currentDashboard = "";
    }
    saveState(state);
    return getState();
};

export const removeWorkbenchViewTemplate = (name: string) => {
    const state = getState();
    const trimmed = `${name || ""}`.trim();
    state.viewTemplates = state.viewTemplates.filter((item) => item.name !== trimmed);
    if (state.currentViewTemplate === trimmed) {
        state.currentViewTemplate = "";
    }
    saveState(state);
    return getState();
};

export const exportWorkbenchAutomation = (): IWorkbenchAutomationData => {
    const state = getState();
    return {
        presets: Array.from(new Set((state.presets || []).map((item) => `${item || ""}`.trim()).filter(Boolean))).slice(0, 20),
        resultLayer: state.resultLayer,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        groupBy: normalizeWorkbenchGroupBy(state.groupBy),
        views: Object.assign({}, state.views),
        rules: normalizeWorkbenchRules(state.rules),
        actionPresets: normalizeWorkbenchActionPresets(state.actionPresets),
        dashboards: normalizeWorkbenchDashboards(state.dashboards),
        viewTemplates: normalizeWorkbenchViewTemplates(state.viewTemplates),
    };
};

export const importWorkbenchAutomation = (data: Partial<IWorkbenchAutomationData>) => {
    const state = getState();
    state.presets = Array.from(new Set((data?.presets || []).map((item) => `${item || ""}`.trim()).filter(Boolean))).slice(0, 20);
    state.resultLayer = normalizeWorkbenchResultLayer(data?.resultLayer || state.resultLayer);
    state.sortBy = normalizeWorkbenchSortBy(state.resultLayer, `${data?.sortBy || state.sortBy || "captured"}`.trim() || "captured");
    state.sortOrder = `${data?.sortOrder || state.sortOrder || "desc"}`.trim() === "asc" ? "asc" : "desc";
    state.groupBy = state.resultLayer === "blocks" ? "none" : normalizeWorkbenchGroupBy(data?.groupBy || state.groupBy);
    state.rules = normalizeWorkbenchRules(data?.rules || []);
    state.actionPresets = normalizeWorkbenchActionPresets(data?.actionPresets || []);
    state.dashboards = normalizeWorkbenchDashboards(data?.dashboards || []);
    state.viewTemplates = normalizeWorkbenchViewTemplates(data?.viewTemplates || []);
    state.currentDashboard = "";
    state.currentViewTemplate = "";
    if (data?.views) {
        state.views = Object.assign({}, state.views, data.views);
    }
    (["inbox", "library", "task", "calendar", "project", "review"] as TWorkbenchTab[]).forEach((tab) => {
        state.views[tab] = normalizeWorkbenchView(tab, state.views[tab], state.resultLayer);
    });
    saveState(state);
    return getState();
};

export const getWorkbenchQuickItems = async (limit = 60) => {
    const response = await fetchSyncPost("/api/workbench/getWorkbenchItems", {limit});
    return response.data?.items as IWorkbenchItem[] || [];
};

export const openWorkbenchDraft = async (app: App, kind: "report" | "review" | "dashboard", initialTab?: TWorkbenchTab, dashboardName?: string) => {
    await buildWorkbenchDraft(app, kind, initialTab, dashboardName);
};

export const openWorkbenchSavedViews = (app: App) => {
    openWorkbenchDialog(app, "library", undefined, WORKBENCH_SAVED_VIEWS_QUERY);
};

export const bindCurrentWorkbenchView = async () => {
    const state = getState();
    return saveWorkbenchViewToCurrentNote(state);
};

export const openCurrentWorkbenchView = async (app: App) => {
    const boundView = await getCurrentWorkbenchBoundView();
    if (!boundView) {
        showMessage(window.sourceflow.languages.workbenchCurrentBoundViewEmpty);
        return;
    }
    openWorkbenchDialog(app, undefined, undefined, undefined, undefined, boundView);
};

export const insertCurrentWorkbenchViewEmbed = async () => {
    const boundView = await getCurrentWorkbenchBoundView();
    if (!boundView) {
        showMessage(window.sourceflow.languages.workbenchCurrentBoundViewEmpty);
        return false;
    }
    const state = getState();
    applyWorkbenchBoundState(state, boundView);
    return appendMarkdownToCurrentNote(`## ${state.resultLayer === "blocks" ? window.sourceflow.languages.workbenchLayerBlocks : window.sourceflow.languages.workbench}\n\n${buildWorkbenchLiveEmbedMarkdown(state)}`);
};

export const clearCurrentWorkbenchView = async () => {
    return clearWorkbenchViewFromCurrentNote();
};

export const openWorkbenchViewNote = async (app: App, templateName?: string, target?: {
    notebook?: string;
    pathPrefix?: string;
}) => {
    const state = getState();
    const template = templateName ? state.viewTemplates.find((item) => item.name === templateName) : undefined;
    await createWorkbenchViewNote(app, state, template, target);
};

export const openWorkbenchBuiltinViewNote = async (app: App, key: TWorkbenchBuiltinViewNoteKey, target?: {
    notebook?: string;
    pathPrefix?: string;
}) => {
    const state = getState();
    const template = getBuiltinWorkbenchViewNoteTemplate(key, target?.pathPrefix || (key === "skill" ? "Workbench/Skills" : "Workbench/Views"));
    await createWorkbenchViewNote(app, state, template, target);
};

export const openWorkbenchViewTemplate = (app: App, templateName: string) => {
    const state = getState();
    const template = state.viewTemplates.find((item) => item.name === templateName);
    if (!template) {
        showMessage(window.sourceflow.languages.workbenchEmpty);
        return;
    }
    openWorkbenchDialog(app, undefined, undefined, undefined, template.name);
};

export const openWorkbenchCurrentMeta = async (defaultType: IWorkbenchItem["type"] = "doc") => {
    const draft = await buildCurrentWorkbenchItemDraft(defaultType);
    if (!draft) {
        return;
    }
    const allItems = await getWorkbenchQuickItems(512);
    await openWorkbenchMetaDialog(draft, allItems);
};

export const openWorkbenchCurrentBlockMeta = async (defaultType: IWorkbenchItem["type"] = "note") => {
    const draft = await buildCurrentWorkbenchBlockDraft(defaultType);
    if (!draft) {
        return;
    }
    const allItems = await getWorkbenchQuickItems(512);
    await openWorkbenchMetaDialog(draft, allItems);
};

export const openWorkbenchDialog = (app: App, initialTab?: TWorkbenchTab, dashboardName?: string, initialQuery?: string, viewTemplateName?: string, boundState?: Partial<IWorkbenchBoundViewState>) => {
    const existedDialog = window.sourceflow.dialogs.find((item) => {
        if (item.element.getAttribute("data-key") === Constants.DIALOG_WORKBENCH) {
            item.destroy();
            return true;
        }
    });
    if (existedDialog) {
        return;
    }
    const state = getState();
    if (initialTab) {
        state.activeTab = initialTab;
    }
    if (dashboardName) {
        const dashboard = state.dashboards.find((item) => item.name === dashboardName);
        if (dashboard) {
            applyWorkbenchDashboard(state, dashboard);
        }
    }
    if (viewTemplateName) {
        const template = state.viewTemplates.find((item) => item.name === viewTemplateName);
        if (template) {
            applyWorkbenchViewTemplate(state, template);
        }
    }
    if (boundState) {
        applyWorkbenchBoundState(state, boundState);
    }
    if (initialQuery != null) {
        state.query = initialQuery.trim();
        clearWorkbenchSavedSelections(state);
    }
    const selected = new Set<string>();
    const dialog = new Dialog({
        positionId: Constants.DIALOG_WORKBENCH,
        title: window.sourceflow.languages.workbench,
        width: "960px",
        height: "80vh",
        content: `<div class="b3-dialog__content workbench-content"></div>`,
    });
    dialog.element.setAttribute("data-key", Constants.DIALOG_WORKBENCH);
    renderWorkbench(dialog, app, state, selected);
};
