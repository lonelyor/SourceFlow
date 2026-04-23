import {Dialog} from "../dialog";
import {Constants} from "../constants";
import {fetchPost, fetchSyncPost} from "../util/fetch";
import {hideMessage, showMessage} from "../dialog/message";
import {App} from "../index";
/// #if MOBILE
import {openMobileFileById} from "../mobile/editor";
/// #else
import {openFileById} from "../editor/util";
/// #endif
import {
    getCapturePathPrefix,
    getCaptureSettings,
    saveCaptureSettings,
    TCaptureMode,
} from "./settings";
import {WorkbenchAttr} from "../workbench/constants";
import {
    applyWorkbenchDocAttrs,
    buildWorkbenchAttrs,
    mergeWorkbenchAttrs,
    normalizeWorkbenchTags,
} from "../workbench/itemCreate";

interface ICaptureDraft {
    url?: string;
    notebook?: string;
    pathPrefix?: string;
    openAfterSave?: boolean;
    attrs?: Record<string, string>;
}

const getDomainTag = (url: string) => {
    try {
        const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(url) ? url : `https://${url.replace(/^\/+/, "")}`;
        return new URL(candidate).hostname.replace(/^www\./i, "");
    } catch (e) {
        return "";
    }
};

const normalizeCaptureURL = (rawURL: string) => {
    const trimmed = rawURL.trim();
    if (!trimmed) {
        return "";
    }

    const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
    const requestURL = hasScheme ? trimmed : trimmed.replace(/^\/+/, "");
    const candidate = hasScheme ? trimmed : `https://${requestURL}`;
    try {
        const parsedURL = new URL(candidate);
        if (!["http:", "https:"].includes(parsedURL.protocol) || !parsedURL.hostname) {
            return "";
        }
        return hasScheme ? parsedURL.toString() : requestURL;
    } catch (e) {
        return "";
    }
};

export const openCaptureDialog = async (app: App, _initialTab?: TCaptureMode, _presetName?: string, draft?: ICaptureDraft) => {
    const existedDialog = window.sourceflow.dialogs.find((item) => {
        if (item.element.getAttribute("data-key") === Constants.DIALOG_CAPTURE) {
            item.destroy();
            return true;
        }
    });
    if (existedDialog) {
        return;
    }

    const settings = getCaptureSettings();
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
        positionId: Constants.DIALOG_CAPTURE,
        title: window.sourceflow.languages.urlImport,
        width: "640px",
        content: `<div class="b3-dialog__content">
    <label class="b3-label">
        <div>URL</div>
        <div class="b3-label__text">${window.sourceflow.languages.urlImportTip}</div>
        <input id="captureURL" class="b3-text-field fn__block" spellcheck="false" placeholder="https://example.com">
    </label>
    <label class="b3-label">
        <div>${window.sourceflow.languages.targetNotebook}</div>
        <select id="captureNotebook" class="b3-select fn__block">${notebooks.map((item: INotebook) => `<option value="${item.id}" ${item.id === settings.notebook ? "selected" : ""}>${item.name}</option>`).join("")}</select>
    </label>
    <label class="b3-label">
        <div>${window.sourceflow.languages.pathPrefix}</div>
        <div class="b3-label__text">${window.sourceflow.languages.capturePathPrefixTip}</div>
        <input id="capturePathPrefix" class="b3-text-field fn__block" spellcheck="false" value="${getCapturePathPrefix(settings)}">
    </label>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.captureSaveAction}</button>
</div>`,
    });
    dialog.element.setAttribute("data-key", Constants.DIALOG_CAPTURE);
    if (draft?.notebook && notebooks.find((item: INotebook) => item.id === draft.notebook)) {
        settings.notebook = draft.notebook;
        (dialog.element.querySelector("#captureNotebook") as HTMLSelectElement).value = draft.notebook;
    }
    if (draft?.pathPrefix != null) {
        settings.pathPrefix = draft.pathPrefix;
        (dialog.element.querySelector("#capturePathPrefix") as HTMLInputElement).value = draft.pathPrefix;
    }
    if (draft?.openAfterSave != null) {
        settings.openAfterSave = !!draft.openAfterSave;
    }
    if (draft?.url != null) {
        (dialog.element.querySelector("#captureURL") as HTMLInputElement).value = draft.url;
    }

    const buttons = dialog.element.querySelectorAll(".b3-dialog__action .b3-button");
    const saveButton = buttons[1] as HTMLButtonElement;
    const setSavingState = (saving: boolean) => {
        dialog.element.querySelectorAll("input, select, button").forEach((element: HTMLInputElement | HTMLSelectElement | HTMLButtonElement) => {
            element.disabled = saving;
        });
        saveButton.textContent = saving ? window.sourceflow.languages.captureSaving : window.sourceflow.languages.captureSaveAction;
    };
    buttons[0].addEventListener("click", () => {
        dialog.destroy();
    });
    buttons[1].addEventListener("click", async () => {
        const notebook = (dialog.element.querySelector("#captureNotebook") as HTMLSelectElement).value;
        const pathPrefix = (dialog.element.querySelector("#capturePathPrefix") as HTMLInputElement).value.trim();
        const url = normalizeCaptureURL((dialog.element.querySelector("#captureURL") as HTMLInputElement).value);
        if (!url) {
            showMessage(window.sourceflow.languages.captureInvalidURL, 0, "error");
            return;
        }
        settings.notebook = notebook;
        settings.pathPrefix = pathPrefix;
        saveCaptureSettings(settings);

        const resolvedNotebook = notebook;
        const resolvedOpenAfterSave = settings.openAfterSave;
        const captureTags = normalizeWorkbenchTags("inbox", "url", getDomainTag(url));
        const progressMessageId = showMessage(window.sourceflow.languages.captureSaving, -1);
        const finishSaving = (response?: IWebSocketData) => {
            if (progressMessageId) {
                hideMessage(progressMessageId);
            }
            setSavingState(false);
            if (response?.code === 400) {
                showMessage(window.sourceflow.languages.captureNetworkError, 0, "error");
            }
        };

        setSavingState(true);

        fetchPost("/api/extension/clipURL", {
            notebook: resolvedNotebook,
            url,
            pathPrefix: pathPrefix || settings.pathPrefix,
            tags: captureTags,
        }, async (response) => {
            const savedSourceURL = response.data?.sourceURL || url;
            try {
                await applyWorkbenchDocAttrs(response.data.id, mergeWorkbenchAttrs(buildWorkbenchAttrs("url", {
                    [WorkbenchAttr.sourceURL]: savedSourceURL,
                }), draft?.attrs));
            } catch (error) {
                console.warn("apply collected web attrs failed", error);
            } finally {
                finishSaving();
            }
            dialog.destroy();
            showMessage(window.sourceflow.languages.captureSavedWeb);
            if (resolvedOpenAfterSave) {
                /// #if MOBILE
                openMobileFileById(app, response.data.id, [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]);
                /// #else
                openFileById({app, id: response.data.id, action: [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS]});
                /// #endif
            }
        }, undefined, (response) => {
            finishSaving(response);
        });
    });

    dialog.bindInput(dialog.element.querySelector("#captureURL") as HTMLInputElement, () => {
        buttons[1].dispatchEvent(new CustomEvent("click"));
    });
};
