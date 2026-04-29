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
import {
    IWorkbenchActionPreset,
    IWorkbenchAutomationData,
    IWorkbenchBoundViewState,
    IWorkbenchBuiltinViewNoteOption,
    IWorkbenchDashboardPreset,
    IWorkbenchFacet,
    IWorkbenchQueryResponse,
    IWorkbenchRule,
    IWorkbenchSearchBlock,
    IWorkbenchState,
    IWorkbenchSummary,
    IWorkbenchViewTemplate,
    WORKBENCH_BLOCK_CACHE_TTL,
    WORKBENCH_QUERY_CACHE_TTL,
    TWorkbenchBuiltinViewNoteKey,
    TWorkbenchGroupBy,
    TWorkbenchResultLayer,
    TWorkbenchView,
    WorkbenchViewAttr,
    WORKBENCH_SAVED_VIEWS_QUERY,
    applyWorkbenchDashboard,
    applyWorkbenchViewTemplate,
    clearWorkbenchDashboardSelection,
    clearWorkbenchSavedSelections,
    clearWorkbenchViewTemplateSelection,
    escapeAttr,
    escapeHTML,
    getActiveView,
    getBatchStatusOptions,
    getBuiltinWorkbenchViewNoteTemplate,
    getDefaultState,
    getGroupByOptions,
    getSortOptions,
    getState,
    getStatusOptions,
    getViewOptions,
    getWorkbenchBuiltinViewNoteLabel,
    getWorkbenchBuiltinViewNoteOptionsInternal,
    getWorkbenchResultLayerLabel,
    getWorkbenchTabLabel,
    getWorkbenchViewLabel,
    groupByLabel,
    normalizeWorkbenchActionPresets,
    normalizeWorkbenchDashboards,
    normalizeWorkbenchGroupBy,
    normalizeWorkbenchResultLayer,
    normalizeWorkbenchRules,
    normalizeWorkbenchSortBy,
    normalizeWorkbenchView,
    normalizeWorkbenchViewTemplates,
    loadWorkbenchReminderModule,
    openWorkbenchAssistantDock,
    openWorkbenchItemDialog,
    openWorkbenchURLImportDialog,
    resolveEditorProtyle,
    saveState,
    sortLabel,
    splitWorkbenchTags,
    statusLabel,
    tabLabel,
    typeLabel,
    viewLabel,
    workbenchBlockCache,
    workbenchBlockInflight,
    workbenchQueryCache,
    workbenchQueryInflight,
} from "./dialogShared";
import {
    buildWorkbenchLiveEmbedMarkdown,
    resolveWorkbenchContext,
} from "./dialogQuery";
import {
    buildBlockResultsCSV,
    buildBlockResultsMarkdown,
    buildExportFileBaseName,
    buildQueryEmbedMarkdown,
    buildQueryEmbedMarkdownByIDs,
    buildResultsCSV,
    buildResultsMarkdown,
    buildWorkbenchDashboardMarkdown,
    buildWorkbenchReportMarkdown,
    buildWorkbenchReviewMarkdown,
    buildWorkbenchSkillNoteMarkdown,
    buildWorkbenchViewNoteMarkdown,
    downloadTextFile,
    formatDateOffset,
    formatDateTime,
    getQuickFacetLabel,
    renderFacetSection,
    renderSearchBlock,
    renderWorkbenchDashboardOptions,
    renderWorkbenchPanelContent,
    renderWorkbenchViewTemplateOptions,
    shouldDeferWorkbenchPanelRender,
} from "./dialogRender";

export const normalizeWorkbenchBoundState = (state: Partial<IWorkbenchBoundViewState>): IWorkbenchBoundViewState => {
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

export const buildWorkbenchBoundViewAttrs = (state: IWorkbenchState) => {
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

export const buildWorkbenchViewNoteAttrs = (state: IWorkbenchState) => {
    return {
        [WorkbenchAttr.type]: "doc",
        [WorkbenchAttr.inbox]: "false",
        [WorkbenchAttr.status]: "open",
        [WorkbenchAttr.capturedAt]: new Date().toISOString(),
        ...buildWorkbenchBoundViewAttrs(state),
    };
};

export const parseWorkbenchBoundViewAttrs = (attrs: Record<string, string>) => {
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

export const applyWorkbenchBoundState = (state: IWorkbenchState, boundState: Partial<IWorkbenchBoundViewState>) => {
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

export const getActiveEditorProtyle = () => {
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

export const appendMarkdownToCurrentNote = async (markdown: string) => {
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

export const getCurrentRootID = () => {
    const protyle = getActiveEditorProtyle();
    return protyle?.block?.rootID;
};

export const getCurrentWorkbenchBoundView = async () => {
    const rootID = getCurrentRootID();
    if (!rootID) {
        showMessage(window.sourceflow.languages.workbenchNeedCurrentNote);
        return null;
    }
    const response = await fetchSyncPost("/api/attr/getBlockAttrs", {id: rootID});
    return parseWorkbenchBoundViewAttrs(response.data || {});
};

export const saveWorkbenchViewToCurrentNote = async (state: IWorkbenchState) => {
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

export const clearWorkbenchViewFromCurrentNote = async () => {
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

export const applyWorkbenchSavedViewsState = (state: IWorkbenchState) => {
    state.activeTab = "library";
    state.resultLayer = "items";
    state.query = WORKBENCH_SAVED_VIEWS_QUERY;
    state.sortBy = normalizeWorkbenchSortBy("items", state.sortBy);
    clearWorkbenchSavedSelections(state);
};
