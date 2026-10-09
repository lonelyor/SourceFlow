import {Dialog} from "../dialog";
import {Constants} from "../constants";
import {fetchSyncPost} from "../util/fetch";
import {showMessage} from "../dialog/message";
import {App} from "../index";
/// #if MOBILE
/// #else
/// #endif
import {IWorkbenchItem, TWorkbenchTab} from "./constants";
import {
    IWorkbenchAutomationData,
    IWorkbenchBoundViewState,
    IWorkbenchRule,
    IWorkbenchState,
    TWorkbenchBuiltinViewNoteKey,
    WORKBENCH_SAVED_VIEWS_QUERY,
    applyWorkbenchDashboard,
    applyWorkbenchViewTemplate,
    clearWorkbenchSavedSelections,
    escapeHTML,
    getActiveView,
    getBuiltinWorkbenchViewNoteTemplate,
    getState,
    getViewOptions,
    getWorkbenchBuiltinViewNoteOptionsInternal,
    normalizeWorkbenchActionPresets,
    normalizeWorkbenchDashboards,
    normalizeWorkbenchGroupBy,
    normalizeWorkbenchResultLayer,
    normalizeWorkbenchRules,
    normalizeWorkbenchSortBy,
    normalizeWorkbenchView,
    normalizeWorkbenchViewTemplates,
    openWorkbenchAssistantDock,
    saveState,
} from "./dialogShared";
import {
    buildWorkbenchLiveEmbedMarkdown,
    resolveWorkbenchContext,
} from "./dialogQuery";
import {
    shouldDeferWorkbenchPanelRender,
} from "./dialogRender";
import {buildWorkbenchDialogHTML} from "./dialogScreen";
import {bindWorkbenchDialogEvents} from "./dialogEvents";
import {applyWorkbenchBoundState, appendMarkdownToCurrentNote, clearWorkbenchViewFromCurrentNote, getCurrentWorkbenchBoundView, parseWorkbenchBoundViewAttrs, saveWorkbenchViewToCurrentNote} from "./dialogBinding";
import {buildCurrentWorkbenchBlockDraft, buildCurrentWorkbenchItemDraft, openWorkbenchMetaDialog} from "./dialogMeta";
import {buildWorkbenchAIPrompt, buildWorkbenchDraft, createWorkbenchViewNote} from "./dialogDraft";

let workbenchRenderToken = 0;

const workbenchText = (zh: string, en: string) => window.sourceflow.config.lang === "zh_CN" ? zh : en;

const getWorkbenchErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return `${error || workbenchText("未知错误", "Unknown error")}`;
};

const renderWorkbenchLoadingHTML = () => `<div class="fn__flex-center fn__flex-column" style="min-height: 360px;gap: 12px;padding: 32px;">
    <div class="ft__secondary">${escapeHTML(window.sourceflow.languages.loading || workbenchText("加载中", "Loading"))}</div>
</div>`;

const renderWorkbenchErrorHTML = (message: string) => `<div class="fn__flex-center fn__flex-column" style="min-height: 360px;gap: 12px;padding: 32px;text-align: center;">
    <strong>${escapeHTML(workbenchText("工作台加载失败", "Workbench failed to load"))}</strong>
    <div class="ft__secondary" style="max-width: 560px;word-break: break-word;">${escapeHTML(message)}</div>
    <button class="b3-button b3-button--outline" data-action="retry-workbench">${escapeHTML(window.sourceflow.languages.refresh)}</button>
</div>`;

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

const renderWorkbench = async (dialog: Dialog, app: App, state: IWorkbenchState, selected: Set<string>, focusQuery = false) => {
    const renderToken = ++workbenchRenderToken;
    const bodyElement = dialog.element.querySelector(".workbench-content") as HTMLElement;
    if (!bodyElement) {
        console.error("[workbench] content element missing");
        showMessage(workbenchText("工作台入口异常", "Workbench entry is unavailable"), 5000, "error");
        return;
    }
    bodyElement.innerHTML = renderWorkbenchLoadingHTML();
    try {
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
        const relatedBlocks = context.blocks;
        const selectedVisible = state.resultLayer === "items" ? visibleItems.filter((item) => selected.has(item.id)) : [];
        const isSavedViewsMode = state.activeTab === "library" &&
            state.resultLayer === "items" &&
            (context.parsed.filters["has"] || []).includes("view") &&
            (context.parsed.filters["type"] || []).includes("doc");
        const blockSummary = state.resultLayer === "blocks"
            ? window.sourceflow.languages.workbenchBlockSummary
                .replace("${x}", String(relatedBlocks.length))
                .replace("${y}", String(context.blockScopeItems.length))
            : "";
        const shouldDeferPanel = shouldDeferWorkbenchPanelRender(state, visibleItems, relatedBlocks);
        const panelLoadingHTML = `<div class="ft__secondary" style="padding: 24px 0;">${escapeHTML(window.sourceflow.languages.loading)}</div>`;
        bodyElement.innerHTML = buildWorkbenchDialogHTML({
            state,
            summary,
            items,
            visibleItems,
            relatedBlocks,
            selectedVisible,
            activeView,
            viewOptions,
            isSavedViewsMode,
            blockSummary,
            shouldDeferPanel,
            panelLoadingHTML,
            hasTextQuery: !!context.parsed.text.length,
            blockError: context.blockError,
        });
        bindWorkbenchDialogEvents({
            app,
            bodyElement,
            state,
            selected,
            items,
            visibleItems,
            relatedBlocks,
            focusQuery,
            rerender: (nextFocus = false) => {
                void renderWorkbench(dialog, app, state, selected, nextFocus);
            },
            openAssistant: openWorkbenchAssistant,
            openBoundView: (targetApp, id) => openWorkbenchBoundViewByID(targetApp, id),
        });
        // 工作台规则「文档事件触发」：工作台打开时武装监听（总开关与规则级开关默认关，均需显式开启才生效）。
        void import("../assistant/rules/triggers").then((module) => {
            module.initAssistantRulesEventTrigger();
        }).catch((error) => {
            console.error("[workbench] assistant rules event trigger init failed", error);
        });
    } catch (error) {
        if (renderToken !== workbenchRenderToken || !dialog.element.isConnected) {
            return;
        }
        const message = getWorkbenchErrorMessage(error);
        console.error("[workbench] render failed", error);
        bodyElement.innerHTML = renderWorkbenchErrorHTML(message);
        bodyElement.querySelector('[data-action="retry-workbench"]')?.addEventListener("click", () => {
            void renderWorkbench(dialog, app, state, selected, focusQuery);
        });
        showMessage(`${workbenchText("工作台加载失败", "Workbench failed to load")}: ${message}`, 5000, "error");
    }
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
