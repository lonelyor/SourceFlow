import {Constants} from "../constants";
import {setStorageVal} from "../protyle/util/compatibility";
import {App} from "../index";
import {runAssistantFeature} from "../assistant/runtime";
import {IWorkbenchItem, TWorkbenchTab} from "./constants";

export type TWorkbenchView = "list" | "table" | "board" | "timeline" | "calendar";
export type TWorkbenchGroupBy = "none" | "type" | "status" | "project" | "notebook" | "date";
export type TWorkbenchResultLayer = "items" | "blocks";
export type TWorkbenchBuiltinViewNoteKey = "list" | "table" | "board" | "timeline" | "skill";

export interface IWorkbenchActionPreset {
    name: string;
    attrs: Record<string, string | null>;
}

// 自动化规则语义动作（THEN）：actions 里以这些 actionId 为键，值为参数字符串。
// 其余键名（属性名）沿用旧语义——继续按属性设置工作（向后兼容）。
// 参数支持 {{title}} / {{notebook}} / {{path}} 占位符，由后端在编译 patch 时展开。
export type TWorkbenchRuleActionId = "setAttrs" | "moveToPath" | "appendContent" | "toInbox";

export const WORKBENCH_RULE_ACTION_IDS: TWorkbenchRuleActionId[] = ["setAttrs", "moveToPath", "appendContent", "toInbox"];

// 期二新增：技能动作（runSkill）是前端执行器语义——技能产出 patch 走前端补丁审阅，
// 不进后端 rules/run 批量任务；分类时单独归入 skill 桶，绝不落入旧属性键（attrs）语义。
export const WORKBENCH_RULE_SKILL_ACTION_ID = "runSkill";

export const isWorkbenchRuleActionId = (key: string): key is TWorkbenchRuleActionId => {
    return WORKBENCH_RULE_ACTION_IDS.includes(`${key || ""}`.trim() as TWorkbenchRuleActionId);
};

export const isWorkbenchRuleSkillActionId = (key: string): boolean => {
    return `${key || ""}`.trim() === WORKBENCH_RULE_SKILL_ACTION_ID;
};

export const splitWorkbenchRuleActions = (actions: Record<string, string | null> = {}) => {
    const semantic = {} as Record<TWorkbenchRuleActionId, string>;
    const attrs = {} as Record<string, string | null>;
    const skill = {} as Record<string, string>;
    Object.entries(actions || {}).forEach(([key, value]) => {
        if (value == null || `${value}`.trim() === "") {
            return;
        }
        if (isWorkbenchRuleActionId(key)) {
            semantic[key] = `${value}`.trim();
            return;
        }
        if (isWorkbenchRuleSkillActionId(key)) {
            skill[key] = `${value}`.trim();
            return;
        }
        attrs[key] = `${value}`.trim();
    });
    return {semantic, attrs, skill};
};

export interface IWorkbenchDashboardPreset {
    name: string;
    activeTab: TWorkbenchTab;
    resultLayer: TWorkbenchResultLayer;
    query: string;
    sortBy: string;
    sortOrder: string;
    view: TWorkbenchView;
    groupBy: TWorkbenchGroupBy;
}

export interface IWorkbenchViewTemplate {
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

export interface IWorkbenchBuiltinViewNoteOption {
    key: TWorkbenchBuiltinViewNoteKey;
    icon: string;
    label: string;
}

// 定时触发（期三，诚实版）：kind=interval 每 N 小时（1-24 整数）/ kind=daily 每天 HH:MM（24 小时制）。
// 仅在 SourceFlow 运行时触发，错过的时点不补跑；undefined = 不定时。
export interface IWorkbenchRuleSchedule {
    kind: "interval" | "daily";
    everyHours?: number;
    atTime?: string;
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
    // 文档事件触发（规则级开关，默认关）：显式开启后才参与内核文档创建/更新的自动触发。
    eventTrigger?: boolean;
    // 定时触发（规则级配置，默认无）：设置后由调度器（assistant/rules/scheduler.ts）按计划自动运行，
    // 需规则列表里的自动触发总开关同时开启。
    schedule?: IWorkbenchRuleSchedule;
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

export interface IWorkbenchState {
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

export interface IWorkbenchSearchBlock {
    id: string;
    rootID?: string;
    box: string;
    hPath: string;
    content: string;
    updated: string;
    type: string;
}

export interface IWorkbenchFacet {
    name: string;
    count: number;
    token: string;
}

export interface IWorkbenchSummary {
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

export interface IWorkbenchQueryResponse {
    items: IWorkbenchItem[];
    allItems: IWorkbenchItem[];
    summary: IWorkbenchSummary;
}

export interface IWorkbenchBoundViewState {
    activeTab: TWorkbenchTab;
    resultLayer: TWorkbenchResultLayer;
    query: string;
    sortBy: string;
    sortOrder: string;
    view: TWorkbenchView;
    groupBy: TWorkbenchGroupBy;
}

export const WorkbenchViewAttr = {
    enabled: "custom-workbench-view-enabled",
    activeTab: "custom-workbench-view-tab",
    resultLayer: "custom-workbench-view-result-layer",
    query: "custom-workbench-view-query",
    sortBy: "custom-workbench-view-sort-by",
    sortOrder: "custom-workbench-view-sort-order",
    view: "custom-workbench-view-mode",
    groupBy: "custom-workbench-view-group-by",
};

export const WORKBENCH_SAVED_VIEWS_QUERY = "type:doc has:view";
export const WORKBENCH_QUERY_CACHE_TTL = 8000;
export const WORKBENCH_BLOCK_CACHE_TTL = 8000;
export const workbenchQueryCache = new Map<string, { expiresAt: number, data: IWorkbenchQueryResponse }>();
export const workbenchQueryInflight = new Map<string, Promise<IWorkbenchQueryResponse>>();
export const workbenchBlockCache = new Map<string, { expiresAt: number, data: IWorkbenchSearchBlock[] }>();
export const workbenchBlockInflight = new Map<string, Promise<IWorkbenchSearchBlock[]>>();
export const loadCaptureDialogModule = () => import("../capture/dialog");
export const loadWorkbenchItemDialogModule = () => import("./itemDialog");
export const loadAssistantAIDockModule = () => import("../assistant/ai/AIDock");
export const loadWorkbenchReminderModule = () => import("./reminders");

export const resolveEditorProtyle = (editor?: import("../protyle").Protyle | IProtyle) => {
    if (!editor) {
        return undefined;
    }
    return "protyle" in editor ? editor.protyle : editor;
};

export const openWorkbenchURLImportDialog = (app: App) => {
    void loadCaptureDialogModule().then(({openCaptureDialog}) => {
        openCaptureDialog(app, "url");
    });
};

export const openWorkbenchItemDialog = (app: App, mode: "note" | "task" | "event", draft?: Record<string, unknown>) => {
    void loadWorkbenchItemDialogModule().then(({openWorkbenchItemDialog}) => {
        openWorkbenchItemDialog(app, mode, draft as never);
    });
};

export const openWorkbenchAssistantDock = (options: {
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

export const getDefaultState = (): IWorkbenchState => ({
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

export const getState = (): IWorkbenchState => {
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

export const saveState = (state: IWorkbenchState) => {
    window.sourceflow.storage[Constants.LOCAL_WORKBENCH] = state;
    setStorageVal(Constants.LOCAL_WORKBENCH, state);
};

export const escapeHTML = (text: string) => (text || "").replace(/[&<>"']/g, (match) => {
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

export const escapeAttr = (text: string) => escapeHTML(text).replace(/"/g, "&quot;");

export const splitWorkbenchTags = (text: string) => (text || "").replace(/，/g, ",").split(",").map((item) => item.trim()).filter(Boolean);

export const typeLabel = (type: IWorkbenchItem["type"]) => {
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

export const statusLabel = (status: string) => {
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

export const getStatusOptions = (type: IWorkbenchItem["type"]) => {
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

export const getBatchStatusOptions = (items: IWorkbenchItem[]) => {
    const options = new Set<string>();
    items.forEach((item) => {
        getStatusOptions(item.type).forEach((status) => options.add(status));
    });
    return Array.from(options);
};

export const normalizeWorkbenchResultLayer = (candidate?: string) => candidate === "blocks" ? "blocks" as TWorkbenchResultLayer : "items" as TWorkbenchResultLayer;

export const getWorkbenchResultLayerLabel = (layer: TWorkbenchResultLayer) => layer === "blocks"
    ? window.sourceflow.languages.workbenchLayerBlocks
    : window.sourceflow.languages.workbenchLayerItems;

export const getSortOptions = (resultLayer: TWorkbenchResultLayer = "items") => {
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

export const getGroupByOptions = () => ([
    {value: "none" as TWorkbenchGroupBy, label: window.sourceflow.languages.workbenchGroupNone},
    {value: "type" as TWorkbenchGroupBy, label: window.sourceflow.languages.workbenchGroupType},
    {value: "status" as TWorkbenchGroupBy, label: window.sourceflow.languages.workbenchGroupStatus},
    {value: "project" as TWorkbenchGroupBy, label: window.sourceflow.languages.workbenchGroupProject},
    {value: "notebook" as TWorkbenchGroupBy, label: window.sourceflow.languages.workbenchGroupNotebook},
    {value: "date" as TWorkbenchGroupBy, label: window.sourceflow.languages.workbenchGroupDate},
]);

export const getViewOptions = (tab: TWorkbenchTab, resultLayer: TWorkbenchResultLayer = "items") => {
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

export const tabLabel = (tab: TWorkbenchTab) => {
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

export const viewLabel = (view: TWorkbenchView, tab: TWorkbenchTab) => {
    return getViewOptions(tab).find((item) => item.value === view)?.label || view;
};

export const groupByLabel = (groupBy: TWorkbenchGroupBy) => {
    return getGroupByOptions().find((item) => item.value === groupBy)?.label || groupBy;
};

export const sortLabel = (sortBy: string, resultLayer: TWorkbenchResultLayer) => {
    return getSortOptions(resultLayer).find((item) => item.value === sortBy)?.label || sortBy;
};

export const getWorkbenchTabLabel = (tab: TWorkbenchTab) => {
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

export const normalizeWorkbenchView = (tab: TWorkbenchTab, candidate?: string, resultLayer: TWorkbenchResultLayer = "items") => {
    const options = getViewOptions(tab, resultLayer).map((item) => item.value);
    if (candidate && options.includes(candidate as TWorkbenchView)) {
        return candidate as TWorkbenchView;
    }
    return options[0];
};

export const normalizeWorkbenchSortBy = (resultLayer: TWorkbenchResultLayer, candidate?: string) => {
    const options = getSortOptions(resultLayer).map((item) => item.value);
    if (candidate && options.includes(candidate)) {
        return candidate;
    }
    return options[0];
};

export const normalizeWorkbenchGroupBy = (candidate?: string) => {
    const options = getGroupByOptions().map((item) => item.value);
    if (candidate && options.includes(candidate as TWorkbenchGroupBy)) {
        return candidate as TWorkbenchGroupBy;
    }
    return "none" as TWorkbenchGroupBy;
};

export const getActiveView = (state: IWorkbenchState) => {
    const view = normalizeWorkbenchView(state.activeTab, state.views[state.activeTab], state.resultLayer);
    state.views[state.activeTab] = view;
    return view;
};

export const getWorkbenchViewLabel = (tab: TWorkbenchTab, view: TWorkbenchView, resultLayer: TWorkbenchResultLayer = "items") => {
    return getViewOptions(tab, resultLayer).find((item) => item.value === view)?.label || view;
};

export const normalizeWorkbenchActionPresets = (presets: IWorkbenchActionPreset[]): IWorkbenchActionPreset[] => {
    return (presets || []).map((item) => ({
        name: `${item?.name || ""}`.trim(),
        attrs: Object.entries(item?.attrs || {}).reduce((result, [key, value]) => {
            result[key] = value == null ? null : `${value}`.trim();
            return result;
        }, {} as Record<string, string | null>),
    })).filter((item) => item.name && Object.keys(item.attrs).length).slice(0, 20);
};

export const normalizeWorkbenchDashboards = (dashboards: IWorkbenchDashboardPreset[]): IWorkbenchDashboardPreset[] => {
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

export const normalizeWorkbenchViewTemplates = (templates: IWorkbenchViewTemplate[]): IWorkbenchViewTemplate[] => {
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

export const getWorkbenchBuiltinViewNoteLabel = (key: TWorkbenchBuiltinViewNoteKey) => {
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

export const getWorkbenchBuiltinViewNoteOptionsInternal = (): IWorkbenchBuiltinViewNoteOption[] => ([
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

export const getBuiltinWorkbenchViewNoteTemplate = (key: TWorkbenchBuiltinViewNoteKey, pathPrefix = "Workbench/Views") => {
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

// 定时时间格式：HH:MM（24 小时制）。编辑器收集与归一层共用同一正则，口径唯一。
export const WORKBENCH_RULE_SCHEDULE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// 定时配置归一：kind 必须是 interval/daily；everyHours 须为 1-24 整数；atTime 须为 HH:MM。
// 非法配置整体删除（undefined=不定时），绝不猜测修正——诚实优于聪明。
export const normalizeWorkbenchRuleSchedule = (candidate?: IWorkbenchRuleSchedule | null): IWorkbenchRuleSchedule | undefined => {
    if (!candidate || typeof candidate !== "object") {
        return undefined;
    }
    if (candidate.kind === "interval") {
        const everyHours = Number(candidate.everyHours);
        if (!Number.isInteger(everyHours) || everyHours < 1 || everyHours > 24) {
            return undefined;
        }
        return {kind: "interval", everyHours};
    }
    if (candidate.kind === "daily") {
        const atTime = `${candidate.atTime || ""}`.trim();
        if (!WORKBENCH_RULE_SCHEDULE_TIME_PATTERN.test(atTime)) {
            return undefined;
        }
        return {kind: "daily", atTime};
    }
    return undefined;
};

export const normalizeWorkbenchRules = (rules: IWorkbenchRule[]): IWorkbenchRule[] => {
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
        eventTrigger: item?.eventTrigger === true,
        schedule: normalizeWorkbenchRuleSchedule(item?.schedule),
        actions: Object.entries(item?.actions || {}).reduce((result, [key, value]) => {
            const normalized = value == null ? null : `${value}`.trim();
            if (normalized != null && normalized !== "") {
                result[key] = normalized;
            }
            return result;
        }, {} as Record<string, string | null>),
    })).filter((item) => item.name).slice(0, 50);
};

export const applyWorkbenchDashboard = (state: IWorkbenchState, dashboard: IWorkbenchDashboardPreset) => {
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

export const applyWorkbenchViewTemplate = (state: IWorkbenchState, template: IWorkbenchViewTemplate) => {
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

export const clearWorkbenchDashboardSelection = (state: IWorkbenchState) => {
    state.currentDashboard = "";
};

export const clearWorkbenchViewTemplateSelection = (state: IWorkbenchState) => {
    state.currentViewTemplate = "";
};

export const clearWorkbenchSavedSelections = (state: IWorkbenchState) => {
    clearWorkbenchDashboardSelection(state);
    clearWorkbenchViewTemplateSelection(state);
};
