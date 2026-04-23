import {App} from "../index";
import {fetchSyncPost} from "../util/fetch";
import {
    getCaptureSettings,
    ICaptureSettings,
    saveCaptureSettings,
} from "../capture/settings";

const loadCaptureDialogModule = () => import("../capture/dialog");

export const capture = {
    element: undefined as Element,
    genHTML: () => {
        const settings = getCaptureSettings();
        return `<div class="b3-label">
    <div>${window.sourceflow.languages.urlImport}</div>
    <div class="b3-label__text">${window.sourceflow.languages.captureCenterTip}</div>
    <div class="config-query">
        <button class="b3-button b3-button--outline fn__flex-center" id="captureOpenURLImport">
            <svg><use xlink:href="#iconLanguage"></use></svg>${window.sourceflow.languages.urlImport}
        </button>
    </div>
</div>
<label class="b3-label">
    <div>${window.sourceflow.languages.targetNotebook}</div>
    <div class="b3-label__text">${window.sourceflow.languages.captureNotebookTip}</div>
    <select id="captureNotebook" class="b3-select fn__block"></select>
</label>
<label class="b3-label">
    <div>${window.sourceflow.languages.pathPrefix}</div>
    <div class="b3-label__text">${window.sourceflow.languages.capturePathPrefixTip}</div>
    <input id="capturePathPrefix" class="b3-text-field fn__block" spellcheck="false" value="${settings.pathPrefix}">
</label>
<label class="fn__flex b3-label">
    <div class="fn__flex-1">
        ${window.sourceflow.languages.captureOpenAfterSave}
        <div class="b3-label__text">${window.sourceflow.languages.captureOpenAfterSaveTip}</div>
    </div>
    <span class="fn__space"></span>
    <input class="b3-switch fn__flex-center" id="captureOpenAfterSave" type="checkbox"${settings.openAfterSave ? " checked" : ""}/>
</label>
<div class="b3-label">
    <div>${window.sourceflow.languages.urlImport}</div>
    <div class="b3-label__text">${window.sourceflow.languages.urlImportTip}</div>
</div>`;
    },
    bindEvent: async (app: App) => {
        const settings = getCaptureSettings();
        const notebookElement = capture.element.querySelector("#captureNotebook") as HTMLSelectElement;
        const pathPrefixElement = capture.element.querySelector("#capturePathPrefix") as HTMLInputElement;
        const openAfterSaveElement = capture.element.querySelector("#captureOpenAfterSave") as HTMLInputElement;

        capture.element.querySelector("#captureOpenURLImport").addEventListener("click", () => {
            void loadCaptureDialogModule().then(({openCaptureDialog}) => openCaptureDialog(app, "url"));
        });

        const persist = () => {
            const nextSettings: ICaptureSettings = {
                notebook: notebookElement.value,
                pathPrefix: pathPrefixElement.value.trim(),
                openAfterSave: openAfterSaveElement.checked,
            };
            saveCaptureSettings(nextSettings);
        };

        [notebookElement, pathPrefixElement, openAfterSaveElement].forEach((item) => {
            item?.addEventListener("change", persist);
        });

        void (async () => {
            try {
                const response = await fetchSyncPost("/api/notebook/lsNotebooks", {flashcard: false});
                const notebooks = (response.data?.notebooks || []).filter((item: INotebook) => !item.closed);
                const resolvedNotebook = notebooks.find((item: INotebook) => item.id === settings.notebook)?.id || notebooks[0]?.id || "";
                notebookElement.innerHTML = notebooks.map((item: INotebook) => `<option value="${item.id}" ${item.id === resolvedNotebook ? "selected" : ""}>${item.name}</option>`).join("");
                if (resolvedNotebook !== settings.notebook) {
                    saveCaptureSettings({
                        ...settings,
                        notebook: resolvedNotebook,
                    });
                }
            } catch (e) {
                console.error("load capture notebooks failed", e);
            }
        })();
    },
};
