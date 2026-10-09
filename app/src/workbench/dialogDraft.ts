import {showMessage} from "../dialog/message";
import {App} from "../index";
import {IWorkbenchItem, TWorkbenchTab} from "./constants";
import {
    IWorkbenchSearchBlock,
    IWorkbenchState,
    IWorkbenchSummary,
    IWorkbenchViewTemplate,
    applyWorkbenchDashboard,
    applyWorkbenchViewTemplate,
    getActiveView,
    getState,
    groupByLabel,
    openWorkbenchItemDialog,
    sortLabel,
    tabLabel,
    viewLabel,
} from "./dialogShared";
import {
    resolveWorkbenchContext,
} from "./dialogQuery";
import {
    buildWorkbenchDashboardMarkdown,
    buildWorkbenchReportMarkdown,
    buildWorkbenchReviewMarkdown,
    buildWorkbenchSkillNoteMarkdown,
    buildWorkbenchViewNoteMarkdown,
    formatDateTime,
} from "./dialogRender";
import {buildWorkbenchViewNoteAttrs} from "./dialogBinding";

export const buildWorkbenchDraft = async (app: App, kind: "report" | "review" | "dashboard", initialTab?: TWorkbenchTab, dashboardName?: string) => {
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

export const buildWorkbenchAIPrompt = (state: IWorkbenchState, summary: IWorkbenchSummary, items: IWorkbenchItem[], blocks: IWorkbenchSearchBlock[], blockScopeCount: number, mode: "summary" | "plan") => {
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

export const buildWorkbenchViewTemplate = (state: IWorkbenchState, name: string): IWorkbenchViewTemplate => ({
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

export const createWorkbenchViewNote = async (app: App, state: IWorkbenchState, template?: IWorkbenchViewTemplate, target?: {
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
