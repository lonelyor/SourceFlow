import {IWorkbenchItem} from "./constants";
import {
    IWorkbenchSearchBlock,
    IWorkbenchState,
    IWorkbenchSummary,
    TWorkbenchView,
    escapeAttr,
    escapeHTML,
    getGroupByOptions,
    getSortOptions,
    statusLabel,
    typeLabel,
} from "./dialogShared";
import {
    getQuickFacetLabel,
    renderFacetSection,
    renderSearchBlock,
    renderWorkbenchDashboardOptions,
    renderWorkbenchPanelContent,
    renderWorkbenchViewTemplateOptions,
} from "./dialogRender";

export interface IWorkbenchDialogScreenInput {
    state: IWorkbenchState;
    summary: IWorkbenchSummary;
    items: IWorkbenchItem[];
    visibleItems: IWorkbenchItem[];
    relatedBlocks: IWorkbenchSearchBlock[];
    selectedVisible: IWorkbenchItem[];
    activeView: TWorkbenchView;
    viewOptions: Array<{ value: string, label: string }>;
    isSavedViewsMode: boolean;
    blockSummary: string;
    shouldDeferPanel: boolean;
    panelLoadingHTML: string;
    hasTextQuery: boolean;
    blockError: string;
}

const renderWorkbenchTopTabs = (state: IWorkbenchState, summary: IWorkbenchSummary, isSavedViewsMode: boolean) => {
    return `<div class="fn__flex" style="gap: 8px;flex-wrap: wrap;align-items: center;margin-bottom: 12px;">
    <button class="b3-button ${state.activeTab === "inbox" ? "b3-button--text" : "b3-button--outline"}" data-action="switch-tab" data-tab="inbox">${window.sourceflow.languages.inbox} <span class="ft__secondary">${summary.inboxCount}</span></button>
    <button class="b3-button ${state.activeTab === "task" ? "b3-button--text" : "b3-button--outline"}" data-action="switch-tab" data-tab="task">${window.sourceflow.languages.taskCapture} <span class="ft__secondary">${summary.taskCount}</span></button>
    <button class="b3-button ${state.activeTab === "calendar" ? "b3-button--text" : "b3-button--outline"}" data-action="switch-tab" data-tab="calendar">${window.sourceflow.languages.calendar} <span class="ft__secondary">${summary.eventCount}</span></button>
    <button class="b3-button ${state.activeTab === "project" ? "b3-button--text" : "b3-button--outline"}" data-action="switch-tab" data-tab="project">${window.sourceflow.languages.project} <span class="ft__secondary">${summary.projectCount}</span></button>
    <button class="b3-button ${state.activeTab === "library" ? "b3-button--text" : "b3-button--outline"}" data-action="switch-tab" data-tab="library">${window.sourceflow.languages.workbenchLibrary} <span class="ft__secondary">${summary.docCount}</span></button>
    <button class="b3-button ${state.activeTab === "review" ? "b3-button--text" : "b3-button--outline"}" data-action="switch-tab" data-tab="review">${window.sourceflow.languages.review} <span class="ft__secondary">${summary.reviewCount}</span></button>
    <button class="b3-button ${isSavedViewsMode ? "b3-button--text" : "b3-button--outline"}" data-action="saved-views">${window.sourceflow.languages.workbenchSavedViews} <span class="ft__secondary">${summary.viewCount}</span></button>
</div>`;
};

const renderWorkbenchSearchBar = (state: IWorkbenchState) => {
    return `<div class="fn__flex" style="gap: 8px;flex-wrap: wrap;align-items: center;margin-bottom: 12px;">
    <input id="workbenchQuery" class="b3-text-field fn__flex-1" style="min-width: 220px;" spellcheck="false" value="${escapeAttr(state.query)}" placeholder="${escapeAttr(window.sourceflow.languages.workbenchQueryPlaceholder)}">
    <button class="b3-button b3-button--outline" data-action="save-query">${window.sourceflow.languages.workbenchSaveQuery}</button>
    <button class="b3-button b3-button--outline" data-action="open-capture">${window.sourceflow.languages.urlImport}</button>
    <button class="b3-button b3-button--outline" data-action="refresh">${window.sourceflow.languages.refresh}</button>
</div>`;
};

const renderWorkbenchQuickFilters = (summary: IWorkbenchSummary) => {
    if (!summary.quickFilters?.length) {
        return "";
    }
    return `<div class="fn__flex" style="gap: 8px;flex-wrap: wrap;margin-bottom: 12px;">
    ${summary.quickFilters.slice(0, 8).map((facet) => `<button class="b3-button b3-button--outline" data-action="append-query-token" data-token="${escapeAttr(facet.token)}">${escapeHTML(getQuickFacetLabel(facet))} <span class="ft__secondary">${facet.count}</span></button>`).join("")}
</div>`;
};

const renderWorkbenchSelectionBar = (state: IWorkbenchState, selectedVisible: IWorkbenchItem[]) => {
    if (!selectedVisible.length) {
        return "";
    }
    return `<div class="fn__flex" style="gap: 8px;flex-wrap: wrap;margin-bottom: 12px;">
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
</div>`;
};

const renderWorkbenchSummaryChips = (state: IWorkbenchState, summary: IWorkbenchSummary, relatedBlocks: IWorkbenchSearchBlock[]) => {
    return `<div class="fn__flex" style="gap: 8px;flex-wrap: wrap;margin-bottom: 12px;">
    ${summary.viewCount ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.workbenchHasView)} ${summary.viewCount}</span>` : ""}
    ${summary.refTotal ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.ref)} ${summary.refTotal}</span>` : ""}
    ${summary.assetTotal ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.workbenchHasAsset)} ${summary.assetTotal}</span>` : ""}
    ${summary.subFileTotal ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.workbenchHasSubdoc)} ${summary.subFileTotal}</span>` : ""}
    ${state.resultLayer === "blocks" ? `<span class="b3-chip">${escapeHTML(window.sourceflow.languages.workbenchLayerBlocks)} ${relatedBlocks.length}</span>` : ""}
</div>`;
};

const renderWorkbenchAdvancedFilters = (summary: IWorkbenchSummary) => {
    const typeStatusHTML = `<div class="fn__flex" style="gap: 8px;flex-wrap: wrap;">
    ${Object.entries(summary.typeCounts || {}).map(([key, count]) => `<button class="b3-button b3-button--outline" data-action="append-query-token" data-token="${escapeAttr(`type:${key}`)}">${escapeHTML(typeLabel(key as IWorkbenchItem["type"]))} <span class="ft__secondary">${count}</span></button>`).join("")}
    ${Object.entries(summary.statusCounts || {}).map(([key, count]) => `<button class="b3-button b3-button--outline" data-action="append-query-token" data-token="${escapeAttr(`status:${key}`)}">${escapeHTML(statusLabel(key))} <span class="ft__secondary">${count}</span></button>`).join("")}
</div>`;
    const facetHTML = `<div class="fn__flex" style="gap: 12px;flex-wrap: wrap;margin-top: 12px;">
    ${renderFacetSection(window.sourceflow.languages.workbenchFacetNotebook, summary.notebooks || [])}
    ${renderFacetSection(window.sourceflow.languages.workbenchFacetProject, summary.projects || [])}
    ${renderFacetSection(window.sourceflow.languages.workbenchFacetTag, summary.tags || [], (facet) => `#${facet.name}`)}
</div>`;
    return `<details style="margin-bottom: 12px;">
    <summary class="b3-button b3-button--outline" style="display:inline-flex;cursor:pointer;">${escapeHTML(window.sourceflow.languages.filter)}</summary>
    <div style="margin-top: 12px;">${typeStatusHTML}${facetHTML}</div>
</details>`;
};

const renderWorkbenchMoreActions = (
    state: IWorkbenchState,
    activeView: TWorkbenchView,
    viewOptions: Array<{ value: string, label: string }>,
) => {
    return `<details style="margin-bottom: 12px;">
    <summary class="b3-button b3-button--outline" style="display:inline-flex;cursor:pointer;">${escapeHTML(window.sourceflow.languages.more)}</summary>
    <div class="b3-card" style="padding: 12px;margin-top: 12px;">
        <div class="fn__flex" style="gap: 8px;flex-wrap: wrap;margin-bottom: 12px;">
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
        </div>
        <div class="fn__flex" style="gap: 8px;flex-wrap: wrap;margin-bottom: 12px;">
            <select id="workbenchPreset" class="b3-select" style="max-width: 260px;">
                <option value="">${escapeHTML(window.sourceflow.languages.workbenchQueryPreset)}</option>
                ${state.presets.map((preset) => `<option value="${escapeAttr(preset)}" ${preset === state.query ? "selected" : ""}>${escapeHTML(preset)}</option>`).join("")}
            </select>
            <select id="workbenchResultLayer" class="b3-select" style="max-width: 180px;">
                <option value="items" ${state.resultLayer === "items" ? "selected" : ""}>${escapeHTML(window.sourceflow.languages.workbenchLayerItems)}</option>
                <option value="blocks" ${state.resultLayer === "blocks" ? "selected" : ""}>${escapeHTML(window.sourceflow.languages.workbenchLayerBlocks)}</option>
            </select>
            <select id="workbenchSortBy" class="b3-select" style="max-width: 180px;">
                ${getSortOptions(state.resultLayer).map((item) => `<option value="${item.value}" ${item.value === state.sortBy ? "selected" : ""}>${escapeHTML(item.label)}</option>`).join("")}
            </select>
            <select id="workbenchSortOrder" class="b3-select" style="max-width: 120px;">
                <option value="desc" ${state.sortOrder === "desc" ? "selected" : ""}>${escapeHTML(window.sourceflow.languages.desc)}</option>
                <option value="asc" ${state.sortOrder === "asc" ? "selected" : ""}>${escapeHTML(window.sourceflow.languages.asc)}</option>
            </select>
            ${viewOptions.length > 1 ? `<select id="workbenchView" class="b3-select" style="max-width: 180px;">
                ${viewOptions.map((item) => `<option value="${item.value}" ${item.value === activeView ? "selected" : ""}>${escapeHTML(item.label)}</option>`).join("")}
            </select>` : ""}
            ${state.resultLayer === "items" ? `<select id="workbenchGroupBy" class="b3-select" style="max-width: 180px;">
                ${getGroupByOptions().map((item) => `<option value="${item.value}" ${item.value === state.groupBy ? "selected" : ""}>${escapeHTML(item.label)}</option>`).join("")}
            </select>` : `<span class="ft__secondary">${escapeHTML(window.sourceflow.languages.workbenchBlocksListTableOnly)}</span>`}
            <button class="b3-button b3-button--outline" data-action="remove-query">${window.sourceflow.languages.workbenchDeleteQuery}</button>
        </div>
        <div class="fn__flex" style="gap: 8px;flex-wrap: wrap;">
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
    </div>
</details>`;
};

export const buildWorkbenchDialogHTML = (input: IWorkbenchDialogScreenInput) => {
    const {
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
        hasTextQuery,
        blockError,
    } = input;
    const blockErrorTemplate = window.sourceflow.languages.workbenchRelatedResultsFailed || "Related block search failed; primary results are still available: ${x}";
    const blockErrorHTML = blockError ? `<div class="b3-label__text" style="margin-bottom: 12px;color: var(--b3-theme-error);">${escapeHTML(blockErrorTemplate.replace("${x}", blockError))}</div>` : "";
    return `${renderWorkbenchTopTabs(state, summary, isSavedViewsMode)}
${renderWorkbenchSearchBar(state)}
${state.resultLayer === "items" ? renderWorkbenchQuickFilters(summary) : ""}
${renderWorkbenchSelectionBar(state, selectedVisible)}
${state.resultLayer === "items" ? renderWorkbenchAdvancedFilters(summary) : ""}
${renderWorkbenchMoreActions(state, activeView, viewOptions)}
<div class="b3-label__text" style="margin-bottom: 8px;">${state.resultLayer === "blocks" ? blockSummary : window.sourceflow.languages.workbenchSummary.replace("${x}", String(summary.filtered))}</div>
${renderWorkbenchSummaryChips(state, summary, relatedBlocks)}
${blockErrorHTML}
<div class="workbench-panel">${shouldDeferPanel ? panelLoadingHTML : renderWorkbenchPanelContent(state, visibleItems, items, relatedBlocks)}</div>
${state.resultLayer === "items" && hasTextQuery ? `<div class="b3-card" style="padding:16px;margin-top:16px;">
    <div class="fn__flex" style="justify-content:space-between;align-items:center;margin-bottom:12px;">
        <strong>${window.sourceflow.languages.workbenchRelatedResults}</strong>
        <div class="fn__flex" style="gap:8px;align-items:center;">
            <span class="ft__secondary">${relatedBlocks.length}</span>
            <button class="b3-button b3-button--outline" data-action="switch-result-layer" data-layer="blocks">${window.sourceflow.languages.workbenchLayerBlocks}</button>
        </div>
    </div>
    ${relatedBlocks.length ? relatedBlocks.map((item) => renderSearchBlock(item)).join("") : `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`}
</div>` : ""}`;
};
