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
import {getActiveEditorProtyle} from "./dialogBinding";
import {applyWorkbenchRulesToAttrs} from "./dialogRules";

export const openWorkbenchItem = (app: App, id: string) => {
    /// #if MOBILE
    openMobileFileById(app, id, [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]);
    /// #else
    openFileById({app, id, action: [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]});
    /// #endif
};

export const parseWorkbenchAttrTime = (value?: string) => {
    const text = `${value || ""}`.trim();
    if (!text) {
        return 0;
    }
    const timestamp = Date.parse(text);
    return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const normalizeWorkbenchDraftType = (value?: string, fallback: IWorkbenchItem["type"] = "note"): IWorkbenchItem["type"] => {
    const candidate = `${value || ""}`.trim() as IWorkbenchItem["type"];
    if ((["doc", "note", "url", "task", "event", "project", "attachment"] as IWorkbenchItem["type"][]).includes(candidate)) {
        return candidate;
    }
    return fallback;
};

export const buildCurrentWorkbenchItemDraft = async (defaultType: IWorkbenchItem["type"] = "doc") => {
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

export const buildCurrentWorkbenchBlockDraft = async (defaultType: IWorkbenchItem["type"] = "note") => {
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

export const refreshWorkbenchStatusOptions = (dialogElement: Element, preferred?: string) => {
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

export const openWorkbenchMetaDialog = (item: IWorkbenchItem, allItems: IWorkbenchItem[]) => {
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

export const collectWorkbenchBatchAttrs = (dialogElement: HTMLElement) => {
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

export const applyWorkbenchBatchPreset = (dialogElement: HTMLElement, attrs: Record<string, string | null>) => {
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

export const openWorkbenchBatchMetaDialog = (items: IWorkbenchItem[], state: IWorkbenchState) => {
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

export const batchSetAttrs = async (itemsOrIDs: Array<IWorkbenchItem | string>, attrs: Record<string, string | null>) => {
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
