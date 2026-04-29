import {showMessage} from "../dialog/message";
import {writeText} from "../protyle/util/compatibility";
import {App} from "../index";
import {IWorkbenchItem, TWorkbenchTab, WorkbenchAttr} from "./constants";
import {
    IWorkbenchDashboardPreset,
    IWorkbenchSearchBlock,
    IWorkbenchState,
    applyWorkbenchDashboard,
    applyWorkbenchViewTemplate,
    clearWorkbenchSavedSelections,
    clearWorkbenchViewTemplateSelection,
    getActiveView,
    normalizeWorkbenchGroupBy,
    normalizeWorkbenchResultLayer,
    normalizeWorkbenchSortBy,
    normalizeWorkbenchView,
    openWorkbenchItemDialog,
    openWorkbenchURLImportDialog,
} from "./dialogShared";
import {
    buildBlockResultsCSV,
    buildBlockResultsMarkdown,
    buildExportFileBaseName,
    buildQueryEmbedMarkdown,
    buildQueryEmbedMarkdownByIDs,
    buildResultsCSV,
    buildResultsMarkdown,
    downloadTextFile,
    formatDateOffset,
} from "./dialogRender";
import {buildWorkbenchLiveEmbedMarkdown} from "./dialogQuery";
import {appendMarkdownToCurrentNote, applyWorkbenchSavedViewsState, saveWorkbenchViewToCurrentNote} from "./dialogBinding";
import {batchSetAttrs, openWorkbenchBatchMetaDialog, openWorkbenchItem, openWorkbenchMetaDialog} from "./dialogMeta";
import {buildWorkbenchDraft, buildWorkbenchViewTemplate, createWorkbenchViewNote} from "./dialogDraft";
import {getWorkbenchConversionAttrs} from "./dialogRules";

export interface IWorkbenchDialogEventInput {
    app: App;
    bodyElement: HTMLElement;
    state: IWorkbenchState;
    selected: Set<string>;
    items: IWorkbenchItem[];
    visibleItems: IWorkbenchItem[];
    relatedBlocks: IWorkbenchSearchBlock[];
    focusQuery: boolean;
    rerender: (focusQuery?: boolean) => void;
    openAssistant: (app: App, mode?: "summary" | "plan") => Promise<void>;
    openBoundView: (app: App, id: string) => Promise<boolean>;
}

const getSelectedVisible = (state: IWorkbenchState, visibleItems: IWorkbenchItem[], selected: Set<string>) => {
    return state.resultLayer === "items" ? visibleItems.filter((item) => selected.has(item.id)) : [];
};

let workbenchDialogQueryInputTimer = 0;

const handleWorkbenchDialogClick = async (event: MouseEvent, input: IWorkbenchDialogEventInput) => {
    const {app, bodyElement, state, selected, items, visibleItems, relatedBlocks, rerender, openAssistant, openBoundView} = input;
    const selectedVisible = getSelectedVisible(state, visibleItems, selected);

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
            rerender();
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
            rerender(true);
            return;
        }
        if (action === "refresh") {
            rerender();
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
            rerender(true);
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
            rerender(true);
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
            rerender(true);
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
            rerender(true);
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
            rerender(true);
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
            rerender(true);
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
            rerender(true);
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
            rerender();
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
            await openAssistant(app, "summary");
            return;
        }
        if (action === "assistant-plan") {
            await openAssistant(app, "plan");
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
            rerender(true);
            return;
        }
        if (action === "remove-query") {
            const query = state.query.trim();
            if (!query) {
                return;
            }
            state.presets = state.presets.filter((item) => item !== query);
            showMessage(window.sourceflow.languages.workbenchQueryDeleted);
            rerender(true);
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
            await openBoundView(app, id);
            return;
        }
        if (action === "edit-item" && id) {
            const workbenchItem = items.find((item) => item.id === id);
            if (!workbenchItem) {
                return;
            }
            if (await openWorkbenchMetaDialog(workbenchItem, items)) {
                rerender();
            }
            return;
        }
        if (action === "clear-inbox" && id) {
            const workbenchItem = items.find((item) => item.id === id);
            await batchSetAttrs(workbenchItem ? [workbenchItem] : [id], {[WorkbenchAttr.inbox]: "false"});
            selected.delete(id);
            rerender();
            return;
        }
        if (action === "convert-item" && id) {
            const type = actionTarget.getAttribute("data-type") as IWorkbenchItem["type"];
            const workbenchItem = items.find((item) => item.id === id);
            await batchSetAttrs(workbenchItem ? [workbenchItem] : [id], getWorkbenchConversionAttrs(type));
            selected.delete(id);
            showMessage(window.sourceflow.languages.workbenchSaved);
            rerender();
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
            rerender();
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
            rerender();
            return;
        }
        if (action === "batch-clear-inbox") {
            await batchSetAttrs(selectedVisible, {[WorkbenchAttr.inbox]: "false"});
            selected.clear();
            rerender();
            return;
        }
        if (action === "batch-convert") {
            const type = actionTarget.getAttribute("data-type") as IWorkbenchItem["type"];
            await batchSetAttrs(selectedVisible, getWorkbenchConversionAttrs(type));
            selected.clear();
            showMessage(window.sourceflow.languages.workbenchSaved);
            rerender();
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
            rerender();
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
            rerender();
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
            rerender();
            return;
        }
        if (action === "batch-status") {
            const status = actionTarget.getAttribute("data-status");
            await batchSetAttrs(selectedVisible, {
                [WorkbenchAttr.status]: status,
                [WorkbenchAttr.inbox]: status === "done" ? "false" : null,
            });
            selected.clear();
            rerender();
        }
};

const handleWorkbenchDialogChange = async (event: Event, input: IWorkbenchDialogEventInput) => {
    const {state, selected, items, visibleItems, rerender} = input;

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
            rerender();
            return;
        }
        if (action === "set-status") {
            const status = (actionTarget as HTMLSelectElement).value;
            const workbenchItem = items.find((item) => item.id === id);
            await batchSetAttrs(workbenchItem ? [workbenchItem] : [id], {
                [WorkbenchAttr.status]: status,
                [WorkbenchAttr.inbox]: status === "done" || status === "completed" ? "false" : null,
            });
            rerender();
            return;
        }
        if (action === "set-due-date" || action === "set-event-time") {
            const textInput = actionTarget as HTMLInputElement;
            const value = textInput.value || "";
            if ((textInput.getAttribute("data-original") || "") === value) {
                return;
            }
            textInput.setAttribute("data-original", value);
            const workbenchItem = items.find((item) => item.id === id);
            await batchSetAttrs(workbenchItem ? [workbenchItem] : [id], {
                [action === "set-due-date" ? WorkbenchAttr.dueDate : WorkbenchAttr.eventTime]: value,
            });
            rerender();
        }
};

const handleWorkbenchDialogFocusOut = async (event: Event, input: IWorkbenchDialogEventInput) => {
    const {state, selected, items, rerender} = input;

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
        const textInput = actionTarget as HTMLInputElement;
        const value = textInput.value.trim();
        if ((textInput.getAttribute("data-original") || "") === value) {
            return;
        }
        textInput.setAttribute("data-original", value);
        const workbenchItem = items.find((item) => item.id === id);
        await batchSetAttrs(workbenchItem ? [workbenchItem] : [id], {
            [action === "set-project" ? WorkbenchAttr.project : "tags"]: value,
        });
        rerender();
};

export const bindWorkbenchDialogEvents = (input: IWorkbenchDialogEventInput) => {
    const {bodyElement, focusQuery, rerender, state, selected} = input;
    const queryElement = bodyElement.querySelector("#workbenchQuery") as HTMLInputElement;
    if (focusQuery) {
        queryElement?.focus();
        queryElement?.setSelectionRange(state.query.length, state.query.length);
    }
    queryElement?.addEventListener("input", (event) => {
        state.query = (event.target as HTMLInputElement).value;
        clearWorkbenchSavedSelections(state);
        window.clearTimeout(workbenchDialogQueryInputTimer);
        workbenchDialogQueryInputTimer = window.setTimeout(() => {
            rerender(true);
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
        rerender(true);
    });
    const viewTemplateElement = bodyElement.querySelector("#workbenchViewTemplate") as HTMLSelectElement;
    viewTemplateElement?.addEventListener("change", (event) => {
        const name = (event.target as HTMLSelectElement).value;
        if (!name) {
            clearWorkbenchViewTemplateSelection(state);
            rerender(true);
            return;
        }
        const template = state.viewTemplates.find((item) => item.name === name);
        if (!template) {
            return;
        }
        applyWorkbenchViewTemplate(state, template);
        rerender(true);
    });
    const presetElement = bodyElement.querySelector("#workbenchPreset") as HTMLSelectElement;
    presetElement?.addEventListener("change", (event) => {
        state.query = (event.target as HTMLSelectElement).value;
        clearWorkbenchSavedSelections(state);
        rerender(true);
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
        rerender(true);
    });
    const sortByElement = bodyElement.querySelector("#workbenchSortBy") as HTMLSelectElement;
    sortByElement?.addEventListener("change", (event) => {
        state.sortBy = normalizeWorkbenchSortBy(state.resultLayer, (event.target as HTMLSelectElement).value);
        clearWorkbenchSavedSelections(state);
        rerender(true);
    });
    const sortOrderElement = bodyElement.querySelector("#workbenchSortOrder") as HTMLSelectElement;
    sortOrderElement?.addEventListener("change", (event) => {
        state.sortOrder = (event.target as HTMLSelectElement).value;
        clearWorkbenchSavedSelections(state);
        rerender(true);
    });
    const viewElement = bodyElement.querySelector("#workbenchView") as HTMLSelectElement;
    viewElement?.addEventListener("change", (event) => {
        state.views[state.activeTab] = normalizeWorkbenchView(state.activeTab, (event.target as HTMLSelectElement).value, state.resultLayer);
        clearWorkbenchSavedSelections(state);
        rerender(true);
    });
    const groupByElement = bodyElement.querySelector("#workbenchGroupBy") as HTMLSelectElement;
    groupByElement?.addEventListener("change", (event) => {
        state.groupBy = normalizeWorkbenchGroupBy((event.target as HTMLSelectElement).value);
        clearWorkbenchSavedSelections(state);
        rerender(true);
    });
    bodyElement.onclick = (event) => {
        void handleWorkbenchDialogClick(event as MouseEvent, input);
    };

    bodyElement.onchange = (event) => {
        void handleWorkbenchDialogChange(event, input);
    };

    bodyElement.addEventListener("focusout", (event) => {
        void handleWorkbenchDialogFocusOut(event, input);
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
            rerender();
        });
    });
};
