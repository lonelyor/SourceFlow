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
import {buildWorkbenchLiveEmbedMarkdown, getBlockNotebookName, getWorkbenchBlockRootID, parseQuery} from "./dialogQuery";

export const getPrimaryTime = (item: IWorkbenchItem) => {
    return item.eventAt || item.dueAt || item.capturedTs || item.updatedAt;
};

export const getGroupValue = (item: IWorkbenchItem, groupBy: TWorkbenchGroupBy) => {
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

export const shouldRenderGroupedResults = (state: IWorkbenchState) => {
    if (state.groupBy === "none" || state.activeTab === "review") {
        return false;
    }
    const activeView = getActiveView(state);
    return !["board", "timeline", "calendar"].includes(activeView);
};

export const formatDateTime = (time: number, withTime = false) => {
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

export const formatDateOffset = (offsetDays: number) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offsetDays);
    return formatDateTime(date.getTime());
};

export const getWeekdayLabels = () => {
    if (window.sourceflow.config.lang === "zh_CN") {
        return ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    }
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
};

export const renderListItem = (item: IWorkbenchItem, selectable = true) => {
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
            ${item.project ? ` ?? ${escapeHTML(window.sourceflow.languages.project)}: <button class="b3-button b3-button--outline" style="height:22px;padding:0 6px;min-height:auto;" data-action="append-query-token" data-token="${escapeAttr(`project:"${item.project}"`)}">${escapeHTML(item.project)}</button>` : ""}
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

export const renderTaskBoard = (items: IWorkbenchItem[]) => {
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

export const renderStatusBoard = (items: IWorkbenchItem[]) => {
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

export const renderCalendar = (items: IWorkbenchItem[], monthOffset: number) => {
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

export const renderProjects = (items: IWorkbenchItem[], allItems: IWorkbenchItem[]) => {
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

export const renderWorkbenchTableStatusEditor = (item: IWorkbenchItem) => {
    return `<select class="b3-select fn__block" data-inline-action="set-status" data-id="${item.id}">
        ${getStatusOptions(item.type).map((status) => `<option value="${status}" ${status === item.status ? "selected" : ""}>${escapeHTML(statusLabel(status))}</option>`).join("")}
    </select>`;
};

export const renderWorkbenchTableTimeEditor = (item: IWorkbenchItem) => {
    if (item.type === "task") {
        return `<input class="b3-text-field fn__block" type="date" value="${escapeAttr(item.dueDate)}" data-inline-action="set-due-date" data-id="${item.id}" data-original="${escapeAttr(item.dueDate)}">`;
    }
    if (item.type === "event") {
        return `<input class="b3-text-field fn__block" type="datetime-local" value="${escapeAttr(item.eventTime)}" data-inline-action="set-event-time" data-id="${item.id}" data-original="${escapeAttr(item.eventTime)}">`;
    }
    return `<span class="ft__secondary">-</span>`;
};

export const renderWorkbenchTableTextEditor = (value: string, action: string, id: string, placeholder = "", extraAttrs = "") => {
    return `<input class="b3-text-field fn__block" spellcheck="false" value="${escapeAttr(value)}" placeholder="${escapeAttr(placeholder)}" data-inline-action="${action}" data-id="${id}" data-original="${escapeAttr(value)}" ${extraAttrs}>`;
};

export const renderTableView = (items: IWorkbenchItem[], allItems: IWorkbenchItem[] = items) => {
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

export const renderTimelineView = (items: IWorkbenchItem[]) => {
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

export const renderGroupedPanel = (state: IWorkbenchState, items: IWorkbenchItem[], allItems: IWorkbenchItem[]) => {
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

export const renderMainPanel = (state: IWorkbenchState, visibleItems: IWorkbenchItem[], allItems: IWorkbenchItem[]) => {
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

export const shouldDeferWorkbenchPanelRender = (state: IWorkbenchState, visibleItems: IWorkbenchItem[], blocks: IWorkbenchSearchBlock[]) => {
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

export const renderWorkbenchPanelContent = (state: IWorkbenchState, visibleItems: IWorkbenchItem[], allItems: IWorkbenchItem[], blocks: IWorkbenchSearchBlock[]) => {
    return state.resultLayer === "blocks"
        ? renderBlockMainPanel(state, blocks)
        : renderMainPanel(state, visibleItems, allItems);
};

export const getQuickFacetLabel = (facet: IWorkbenchFacet) => {
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

export const renderFacetSection = (title: string, facets: IWorkbenchFacet[], formatter?: (facet: IWorkbenchFacet) => string) => {
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

export const renderWorkbenchDashboardOptions = (state: IWorkbenchState) => {
    return state.dashboards.map((item) => `<option value="${escapeAttr(item.name)}" ${item.name === state.currentDashboard ? "selected" : ""}>${escapeHTML(item.name)}</option>`).join("");
};

export const renderWorkbenchViewTemplateOptions = (state: IWorkbenchState) => {
    return state.viewTemplates.map((item) => `<option value="${escapeAttr(item.name)}" ${item.name === state.currentViewTemplate ? "selected" : ""}>${escapeHTML(item.name)}</option>`).join("");
};

export const renderReviewSection = (title: string, items: IWorkbenchItem[]) => {
    return `<div class="b3-card" style="padding: 16px;">
    <div class="fn__flex" style="justify-content: space-between;align-items: center;margin-bottom: 12px;">
        <strong>${escapeHTML(title)}</strong>
        <span class="ft__secondary">${items.length}</span>
    </div>
    ${items.length ? items.slice(0, 8).map((item) => renderListItem(item, false)).join("") : `<div class="ft__secondary">${window.sourceflow.languages.workbenchEmpty}</div>`}
</div>`;
};

export const collectReviewBuckets = (items: IWorkbenchItem[]) => {
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

export const renderReview = (items: IWorkbenchItem[]) => {
    const {overdueTasks, upcomingItems, recentInbox, completedRecently, staleInbox} = collectReviewBuckets(items);
    return `<div class="fn__flex-column" style="gap: 12px;">
${renderReviewSection(window.sourceflow.languages.workbenchReviewOverdue, overdueTasks)}
${renderReviewSection(window.sourceflow.languages.workbenchReviewUpcoming, upcomingItems)}
${renderReviewSection(window.sourceflow.languages.workbenchReviewRecent, recentInbox)}
${renderReviewSection(window.sourceflow.languages.workbenchReviewCompleted, completedRecently)}
${renderReviewSection(window.sourceflow.languages.workbenchReviewStale, staleInbox)}
</div>`;
};

export const buildResultsMarkdown = (items: IWorkbenchItem[]) => {
    return items.map((item) => {
        const parts = [
            `- [${item.title || window.sourceflow.languages.untitled}](sf://blocks/${item.id})`,
            `${window.sourceflow.languages.type}: ${typeLabel(item.type)}`,
            `${window.sourceflow.languages.status}: ${statusLabel(item.status)}`,
        ];
        if (item.project) {
            parts.push(`${window.sourceflow.languages.project}: ${item.project}`);
        }
        if (item.dueDate) {
            parts.push(`${window.sourceflow.languages.taskDueDate}: ${item.dueDate}`);
        }
        if (item.eventTime) {
            parts.push(`${window.sourceflow.languages.eventTime}: ${item.eventTime}`);
        }
        if (item.sourceURL) {
            parts.push(`${window.sourceflow.languages.workbenchSourceURL}: ${item.sourceURL}`);
        }
        return parts.join(" | ");
    }).join("\n");
};

export const buildBlockResultsMarkdown = (blocks: IWorkbenchSearchBlock[]) => {
    return blocks.map((block) => {
        const parts = [
            `- [${block.hPath || block.id}](sf://blocks/${block.id})`,
            `${window.sourceflow.languages.fileTree}: ${getBlockNotebookName(block)}`,
        ];
        if (block.content) {
            parts.push(`${window.sourceflow.languages.content}: ${block.content.replace(/\r?\n/g, " ").trim()}`);
        }
        if (block.updated) {
            parts.push(`${window.sourceflow.languages.workbenchSortUpdated}: ${formatWorkbenchBlockUpdated(block)}`);
        }
        return parts.join(" | ");
    }).join("\n");
};

export const toCSVCell = (value: string) => {
    const normalized = `${value || ""}`.replace(/\r?\n/g, " ").trim();
    return `"${normalized.replace(/"/g, "\"\"")}"`;
};

export const buildResultsCSV = (items: IWorkbenchItem[]) => {
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

export const buildBlockResultsCSV = (blocks: IWorkbenchSearchBlock[]) => {
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

export const downloadTextFile = (content: string, fileName: string, mimeType: string) => {
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

export const buildExportFileBaseName = (state: IWorkbenchState) => {
    const stamp = formatDateTime(Date.now(), true).replace(/[: ]/g, "-");
    return `workbench-${state.activeTab}-${state.resultLayer}-${stamp}`;
};

export const buildFacetMarkdown = (title: string, facets: IWorkbenchFacet[], formatter?: (facet: IWorkbenchFacet) => string) => {
    if (!facets?.length) {
        return "";
    }
    const values = facets.map((facet) => `${formatter ? formatter(facet) : facet.name} (${facet.count})`).join(" / ");
    return `## ${title}\n\n${values}\n`;
};

export const buildSummaryMarkdown = (summary: IWorkbenchSummary) => {
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

export const buildWorkbenchResultLayerMarkdown = (state: IWorkbenchState, blockCount = 0, blockScopeCount = 0) => {
    const lines = [
        `- ${window.sourceflow.languages.workbenchResultLayer}: ${getWorkbenchResultLayerLabel(state.resultLayer)}`,
    ];
    if (state.resultLayer === "blocks") {
        lines.push(`- ${window.sourceflow.languages.workbenchBlockSummary.replace("${x}", String(blockCount)).replace("${y}", String(blockScopeCount))}`);
    }
    return lines.join("\n");
};

export const buildWorkbenchReportMarkdown = (state: IWorkbenchState, summary: IWorkbenchSummary, items: IWorkbenchItem[], blocks: IWorkbenchSearchBlock[] = [], blockScopeCount = 0) => {
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

export const buildWorkbenchReviewMarkdown = (items: IWorkbenchItem[]) => {
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

export const buildWorkbenchDashboardMarkdown = (state: IWorkbenchState, summary: IWorkbenchSummary, items: IWorkbenchItem[], blocks: IWorkbenchSearchBlock[] = [], blockScopeCount = 0) => {
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

export const buildWorkbenchViewNoteMarkdown = (state: IWorkbenchState, summary: IWorkbenchSummary, blocks: IWorkbenchSearchBlock[] = [], blockScopeCount = 0) => {
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

export const buildWorkbenchSkillNoteMarkdown = (state: IWorkbenchState, summary: IWorkbenchSummary, blocks: IWorkbenchSearchBlock[] = [], blockScopeCount = 0) => {
    const sections = [
        `# ${window.sourceflow.config.lang === "zh_CN" ? "技能笔记" : "Skill Note"}`,
        "",
        window.sourceflow.config.lang === "zh_CN"
            ? "> 把学习路线拆成主线任务、阶段里程碑和可执行清单。当前实现基于 Workbench 视图，后续可以演进成更丰富的技能树。"
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

export const buildQueryEmbedMarkdownByIDs = (idsSource: string[]) => {
    const ids = Array.from(new Set(idsSource.filter(Boolean))).slice(0, 256);
    if (ids.length === 0) {
        return "";
    }
    const quoted = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    return `{{ SELECT * FROM blocks WHERE id IN (${quoted}) ORDER BY updated DESC }}`;
};

export const buildQueryEmbedMarkdown = (items: IWorkbenchItem[]) => buildQueryEmbedMarkdownByIDs(items.map((item) => item.id));

export const renderSearchBlock = (block: IWorkbenchSearchBlock) => {
    return `<button class="b3-button b3-button--outline fn__block" data-action="open-block-hit" data-id="${block.id}" style="justify-content:flex-start;text-align:left;margin-bottom:8px;">
    <div class="fn__flex-column" style="align-items:flex-start;gap:4px;max-width:100%;">
        <span style="font-weight:600;">${escapeHTML(block.hPath || block.id)}</span>
        <span class="ft__secondary" style="white-space:normal;">${escapeHTML(block.content || "")}</span>
    </div>
</button>`;
};

export const formatWorkbenchBlockUpdated = (block: IWorkbenchSearchBlock) => {
    const value = `${block.updated || ""}`;
    if (/^\d{14}$/.test(value)) {
        return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}`;
    }
    return value;
};

export const renderBlockListItem = (block: IWorkbenchSearchBlock) => {
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

export const renderBlockTableView = (blocks: IWorkbenchSearchBlock[]) => {
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

export const renderBlockMainPanel = (state: IWorkbenchState, blocks: IWorkbenchSearchBlock[]) => {
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
