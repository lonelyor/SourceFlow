import {Dialog} from "../dialog";
import {showMessage} from "../dialog/message";
import {fetchSyncPost} from "../util/fetch";
import {App} from "../index";
import {
    buildCaptureDocPath,
} from "../capture/settings";
import {WorkbenchAttr} from "./constants";
import {
    buildWorkbenchAttrs,
    createWorkbenchDoc,
    mergeWorkbenchAttrs,
    normalizeWorkbenchTags,
} from "./itemCreate";
import {
    fillWorkbenchItemTemplate,
    getWorkbenchItemPathPrefix,
    getWorkbenchItemSettings,
    IWorkbenchItemSettings,
    saveWorkbenchItemSettings,
    setWorkbenchItemPathPrefix,
} from "./itemSettings";

const WORKBENCH_ITEM_DIALOG_KEY = "dialog-workbench-item";

export type TWorkbenchItemDialogMode = "note" | "task" | "event";

export interface IWorkbenchItemDialogDraft {
    mode?: TWorkbenchItemDialogMode;
    title?: string;
    content?: string;
    tags?: string;
    project?: string;
    dueDate?: string;
    eventTime?: string;
    location?: string;
    notebook?: string;
    pathPrefix?: string;
    openAfterSave?: boolean;
    modeTags?: string[];
    attrs?: Record<string, string>;
}

const getNowText = () => new Date().toLocaleString();

const getFieldSelector = (mode: TWorkbenchItemDialogMode) => {
    switch (mode) {
        case "task":
            return "#workbenchTaskTitle";
        case "event":
            return "#workbenchEventTitle";
        default:
            return "#workbenchNoteTitle";
    }
};

const setDraftValue = (dialog: Dialog, selector: string, value?: string) => {
    const element = dialog.element.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    if (element && value != null) {
        element.value = value;
    }
};

const buildNoteMarkdown = (settings: IWorkbenchItemSettings, title: string, content: string, project: string) => {
    return fillWorkbenchItemTemplate(settings.noteTemplate, {
        title: title || window.sourceflow.languages.untitled,
        details: content.trim(),
        project,
        now: getNowText(),
    });
};

const buildTaskMarkdown = (settings: IWorkbenchItemSettings, title: string, dueDate: string, project: string, details: string) => {
    return fillWorkbenchItemTemplate(settings.taskTemplate, {
        title: title || window.sourceflow.languages.taskCapture,
        dueDate,
        project,
        details,
        now: getNowText(),
    });
};

const buildEventMarkdown = (settings: IWorkbenchItemSettings, title: string, eventTime: string, location: string, details: string) => {
    return fillWorkbenchItemTemplate(settings.eventTemplate, {
        title: title || window.sourceflow.languages.eventCapture,
        eventTime,
        location,
        details,
        now: getNowText(),
    });
};

export const openWorkbenchItemDialog = async (app: App, mode: TWorkbenchItemDialogMode, draft?: IWorkbenchItemDialogDraft) => {
    const existedDialog = window.sourceflow.dialogs.find((item) => {
        if (item.element.getAttribute("data-key") === WORKBENCH_ITEM_DIALOG_KEY) {
            item.destroy();
            return true;
        }
    });
    if (existedDialog) {
        return;
    }

    const settings = getWorkbenchItemSettings();
    const notebookResponse = await fetchSyncPost("/api/notebook/lsNotebooks", {flashcard: false});
    const notebooks = (notebookResponse.data?.notebooks || []).filter((item: INotebook) => !item.closed);
    if (!notebooks.length) {
        showMessage(window.sourceflow.languages.newFileTip);
        return;
    }
    if (!settings.notebook || !notebooks.find((item: INotebook) => item.id === settings.notebook)) {
        settings.notebook = notebooks[0].id;
    }

    const dialog = new Dialog({
        positionId: WORKBENCH_ITEM_DIALOG_KEY,
        title: mode === "task"
            ? window.sourceflow.languages.taskCapture
            : mode === "event"
                ? window.sourceflow.languages.eventCapture
                : window.sourceflow.languages.quickCapture,
        width: "640px",
        content: `<div class="b3-dialog__content">
    ${mode === "note" ? `<div class="fn__flex" style="gap: 8px;flex-wrap: wrap;">
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.captureTitle}</div>
            <input id="workbenchNoteTitle" class="b3-text-field fn__block" spellcheck="false" placeholder="${window.sourceflow.languages.quickCapture}">
        </label>
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.project}</div>
            <input id="workbenchNoteProject" class="b3-text-field fn__block" spellcheck="false" placeholder="${window.sourceflow.languages.optional}">
        </label>
    </div>
    <label class="b3-label">
        <div>${window.sourceflow.languages.captureContent}</div>
        <textarea id="workbenchNoteContent" class="b3-text-field fn__block" style="height: 180px;"></textarea>
    </label>` : ""}
    ${mode === "task" ? `<div class="fn__flex" style="gap: 8px;flex-wrap: wrap;">
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.captureTitle}</div>
            <input id="workbenchTaskTitle" class="b3-text-field fn__block" spellcheck="false" placeholder="${window.sourceflow.languages.taskCapture}">
        </label>
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.taskDueDate}</div>
            <input id="workbenchTaskDueDate" class="b3-text-field fn__block" type="date">
        </label>
    </div>
    <label class="b3-label">
        <div>${window.sourceflow.languages.project}</div>
        <input id="workbenchTaskProject" class="b3-text-field fn__block" spellcheck="false" placeholder="${window.sourceflow.languages.optional}">
    </label>
    <label class="b3-label">
        <div>${window.sourceflow.languages.captureContent}</div>
        <textarea id="workbenchTaskDetails" class="b3-text-field fn__block" style="height: 160px;"></textarea>
    </label>` : ""}
    ${mode === "event" ? `<div class="fn__flex" style="gap: 8px;flex-wrap: wrap;">
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.captureTitle}</div>
            <input id="workbenchEventTitle" class="b3-text-field fn__block" spellcheck="false" placeholder="${window.sourceflow.languages.eventCapture}">
        </label>
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.eventTime}</div>
            <input id="workbenchEventTime" class="b3-text-field fn__block" type="datetime-local">
        </label>
    </div>
    <div class="fn__flex" style="gap: 8px;flex-wrap: wrap;">
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.location}</div>
            <input id="workbenchEventLocation" class="b3-text-field fn__block" spellcheck="false" placeholder="${window.sourceflow.languages.optional}">
        </label>
        <label class="b3-label fn__flex-1">
            <div>${window.sourceflow.languages.project}</div>
            <input id="workbenchEventProject" class="b3-text-field fn__block" spellcheck="false" placeholder="${window.sourceflow.languages.optional}">
        </label>
    </div>
    <label class="b3-label">
        <div>${window.sourceflow.languages.captureContent}</div>
        <textarea id="workbenchEventDetails" class="b3-text-field fn__block" style="height: 160px;"></textarea>
    </label>` : ""}
    <label class="b3-label">
        <div>${window.sourceflow.languages.targetNotebook}</div>
        <select id="workbenchItemNotebook" class="b3-select fn__block">${notebooks.map((item: INotebook) => `<option value="${item.id}" ${item.id === settings.notebook ? "selected" : ""}>${item.name}</option>`).join("")}</select>
    </label>
    <label class="fn__flex b3-label">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.captureOpenAfterSave}
            <div class="b3-label__text">${window.sourceflow.languages.captureOpenAfterSaveTip}</div>
        </div>
        <span class="fn__space"></span>
        <input class="b3-switch fn__flex-center" id="workbenchItemOpenAfterSave" type="checkbox"${settings.openAfterSave ? " checked" : ""}/>
    </label>
    <label class="b3-label">
        <div>${window.sourceflow.languages.pathPrefix}</div>
        <div class="b3-label__text">${window.sourceflow.languages.capturePathPrefixTip}</div>
        <input id="workbenchItemPathPrefix" class="b3-text-field fn__block" spellcheck="false" value="${getWorkbenchItemPathPrefix(settings, mode)}">
    </label>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.saveToInbox}</button>
</div>`,
    });
    dialog.element.setAttribute("data-key", WORKBENCH_ITEM_DIALOG_KEY);

    if (draft?.notebook && notebooks.find((item: INotebook) => item.id === draft.notebook)) {
        settings.notebook = draft.notebook;
        (dialog.element.querySelector("#workbenchItemNotebook") as HTMLSelectElement).value = draft.notebook;
    }
    if (draft?.pathPrefix != null) {
        setWorkbenchItemPathPrefix(settings, mode, draft.pathPrefix);
        (dialog.element.querySelector("#workbenchItemPathPrefix") as HTMLInputElement).value = draft.pathPrefix;
    }
    if (draft?.openAfterSave != null) {
        (dialog.element.querySelector("#workbenchItemOpenAfterSave") as HTMLInputElement).checked = !!draft.openAfterSave;
    }
    setDraftValue(dialog, "#workbenchNoteTitle", draft?.title);
    setDraftValue(dialog, "#workbenchNoteContent", draft?.content);
    setDraftValue(dialog, "#workbenchNoteProject", draft?.project);
    setDraftValue(dialog, "#workbenchTaskTitle", draft?.title);
    setDraftValue(dialog, "#workbenchTaskDueDate", draft?.dueDate);
    setDraftValue(dialog, "#workbenchTaskProject", draft?.project);
    setDraftValue(dialog, "#workbenchTaskDetails", draft?.content);
    setDraftValue(dialog, "#workbenchEventTitle", draft?.title);
    setDraftValue(dialog, "#workbenchEventTime", draft?.eventTime);
    setDraftValue(dialog, "#workbenchEventLocation", draft?.location);
    setDraftValue(dialog, "#workbenchEventProject", draft?.project);
    setDraftValue(dialog, "#workbenchEventDetails", draft?.content);

    const buttons = dialog.element.querySelectorAll(".b3-dialog__action .b3-button");
    buttons[0].addEventListener("click", () => {
        dialog.destroy();
    });
    buttons[1].addEventListener("click", async () => {
        const notebook = (dialog.element.querySelector("#workbenchItemNotebook") as HTMLSelectElement).value;
        const pathPrefix = (dialog.element.querySelector("#workbenchItemPathPrefix") as HTMLInputElement).value.trim();
        const openAfterSave = (dialog.element.querySelector("#workbenchItemOpenAfterSave") as HTMLInputElement).checked;
        settings.notebook = notebook;
        settings.openAfterSave = openAfterSave;
        setWorkbenchItemPathPrefix(settings, mode, pathPrefix);
        saveWorkbenchItemSettings(settings);

        if (mode === "note") {
            const title = ((dialog.element.querySelector("#workbenchNoteTitle") as HTMLInputElement).value || window.sourceflow.languages.quickCapture).trim();
            const content = (dialog.element.querySelector("#workbenchNoteContent") as HTMLTextAreaElement).value || "";
            const project = (dialog.element.querySelector("#workbenchNoteProject") as HTMLInputElement).value.trim();
            const path = buildCaptureDocPath(pathPrefix || settings.notePathPrefix, title);
            const response = await createWorkbenchDoc(app, notebook, path, buildNoteMarkdown(settings, title, content, project), normalizeWorkbenchTags(draft?.tags || settings.tags, "inbox", "note", project, ...(draft?.modeTags || [])), openAfterSave, mergeWorkbenchAttrs(buildWorkbenchAttrs("note", {
                [WorkbenchAttr.project]: project,
            }), draft?.attrs));
            if (response.code === 0) {
                dialog.destroy();
                showMessage(window.sourceflow.languages.captureSaved);
            }
            return;
        }

        if (mode === "task") {
            const title = ((dialog.element.querySelector("#workbenchTaskTitle") as HTMLInputElement).value || window.sourceflow.languages.taskCapture).trim();
            const dueDate = (dialog.element.querySelector("#workbenchTaskDueDate") as HTMLInputElement).value;
            const project = (dialog.element.querySelector("#workbenchTaskProject") as HTMLInputElement).value.trim();
            const details = (dialog.element.querySelector("#workbenchTaskDetails") as HTMLTextAreaElement).value.trim();
            const path = buildCaptureDocPath(pathPrefix || settings.taskPathPrefix, title);
            const response = await createWorkbenchDoc(app, notebook, path, buildTaskMarkdown(settings, title, dueDate, project, details), normalizeWorkbenchTags(draft?.tags || settings.tags, "inbox", "task", project, ...(draft?.modeTags || [])), openAfterSave, mergeWorkbenchAttrs(buildWorkbenchAttrs("task", {
                [WorkbenchAttr.dueDate]: dueDate,
                [WorkbenchAttr.project]: project,
            }), draft?.attrs));
            if (response.code === 0) {
                dialog.destroy();
                showMessage(window.sourceflow.languages.captureSaved);
            }
            return;
        }

        const title = ((dialog.element.querySelector("#workbenchEventTitle") as HTMLInputElement).value || window.sourceflow.languages.eventCapture).trim();
        const eventTime = (dialog.element.querySelector("#workbenchEventTime") as HTMLInputElement).value;
        const location = (dialog.element.querySelector("#workbenchEventLocation") as HTMLInputElement).value.trim();
        const project = (dialog.element.querySelector("#workbenchEventProject") as HTMLInputElement).value.trim();
        const details = (dialog.element.querySelector("#workbenchEventDetails") as HTMLTextAreaElement).value.trim();
        const path = buildCaptureDocPath(pathPrefix || settings.eventPathPrefix, title);
        const response = await createWorkbenchDoc(app, notebook, path, buildEventMarkdown(settings, title, eventTime, location, details), normalizeWorkbenchTags(draft?.tags || settings.tags, "inbox", "event", location, project, ...(draft?.modeTags || [])), openAfterSave, mergeWorkbenchAttrs(buildWorkbenchAttrs("event", {
            [WorkbenchAttr.eventTime]: eventTime,
            [WorkbenchAttr.location]: location,
            [WorkbenchAttr.project]: project,
        }), draft?.attrs));
        if (response.code === 0) {
            dialog.destroy();
            showMessage(window.sourceflow.languages.captureSaved);
        }
    });

    dialog.bindInput(dialog.element.querySelector(getFieldSelector(mode)) as HTMLInputElement, () => {
        buttons[1].dispatchEvent(new CustomEvent("click"));
    });
};
