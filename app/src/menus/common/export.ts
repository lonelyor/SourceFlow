import {Dialog} from "../../dialog";
import {confirmDialog} from "../../dialog/confirmDialog";
import {hideMessage, showMessage} from "../../dialog/message";
import {fetchPost, fetchSyncPost} from "../../util/fetch";
import {replaceFileName} from "../../editor/rename";
import {MenuItem} from "../Menu";
import {Constants} from "../../constants";
import {isMobile} from "../../util/functions";
import {isInAndroid, isInHarmony, isInIOS, isInMobileApp, openByMobile} from "../../protyle/util/compatibility";
import {buildMobilePDFExportHTML, exportImageAsync, runAsyncMenuAction, saveExportAsync, showAsyncMenuActionError} from "./runtime";

const createExportArchiveMenuItem = (id: string, type: string, label: string, icon?: string) => {
    return {
        id: `export${type}`,
        label,
        ...(icon ? {icon} : {}),
        click: () => {
            const msgId = showMessage(window.sourceflow.languages.exporting, -1);
            fetchPost(`/api/export/export${type}`, {id}, (response) => {
                hideMessage(msgId);
                openByMobile(response.data.zip);
            });
        }
    };
};

const createDesktopSaveExportMenuItem = (id: string, type: "pdf" | "html" | "htmlmd" | "word", label: string, icon: string, iconClass?: string) => {
    return {
        id: `export${type}`,
        label,
        icon,
        ...(iconClass ? {iconClass} : {}),
        click: () => {
            runAsyncMenuAction(window.sourceflow.languages.export, async () => {
                await saveExportAsync({type, id});
            });
        }
    };
};

const createBrowserSaveExportMenuItem = (id: string, type: "html" | "htmlmd", label: string, icon: string, iconClass?: string) => {
    return {
        id: `export${type}`,
        label,
        icon,
        ...(iconClass ? {iconClass} : {}),
        click: () => {
            runAsyncMenuAction(window.sourceflow.languages.export, async () => {
                await saveExportAsync({type, id});
            });
        }
    };
};

const createExportTemplateMenuItem = (id: string) => ({
    id: "exportTemplate",
    label: window.sourceflow.languages.template,
    iconClass: "ft__error",
    icon: "iconMarkdown",
    click: async () => {
        const result = await fetchSyncPost("/api/block/getRefText", {id});
        const dialog = new Dialog({
            title: window.sourceflow.languages.fileName,
            content: `<div class="b3-dialog__content"><input class="b3-text-field fn__block" value=""></div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.confirm}</button>
</div>`,
            width: isMobile() ? "92vw" : "520px",
        });
        dialog.element.setAttribute("data-key", Constants.DIALOG_EXPORTTEMPLATE);
        const inputElement = dialog.element.querySelector("input") as HTMLInputElement;
        const btnsElement = dialog.element.querySelectorAll(".b3-button");
        dialog.bindInput(inputElement, () => {
            (btnsElement[1] as HTMLButtonElement).click();
        });
        let name = replaceFileName(result.data);
        const maxNameLen = 32;
        if (name.length > maxNameLen) {
            name = name.substring(0, maxNameLen);
        }
        inputElement.value = name;
        inputElement.focus();
        inputElement.select();
        btnsElement[0].addEventListener("click", () => {
            dialog.destroy();
        });
        btnsElement[1].addEventListener("click", () => {
            if (inputElement.value.trim() === "") {
                inputElement.value = window.sourceflow.languages.untitled;
            } else {
                inputElement.value = replaceFileName(inputElement.value);
            }

            if (name.length > maxNameLen) {
                name = name.substring(0, maxNameLen);
            }

            fetchPost("/api/template/docSaveAsTemplate", {
                id,
                name: inputElement.value,
                overwrite: false
            }, response => {
                if (response.code === 1) {
                    confirmDialog(window.sourceflow.languages.export, window.sourceflow.languages.exportTplTip, () => {
                        fetchPost("/api/template/docSaveAsTemplate", {
                            id,
                            name: inputElement.value,
                            overwrite: true
                        }, resp => {
                            if (resp.code === 0) {
                                showMessage(window.sourceflow.languages.exportTplSucc);
                            }
                        });
                    });
                    return;
                }
                showMessage(window.sourceflow.languages.exportTplSucc);
            });
            dialog.destroy();
        });
    }
});

const createImageExportMenuItem = (id: string) => ({
    id: "exportImage",
    label: window.sourceflow.languages.image,
    icon: "iconImage",
    click: () => {
        runAsyncMenuAction(window.sourceflow.languages.export, async () => {
            await exportImageAsync(id);
        });
    }
});

const createMobilePrintMenuItem = (id: string) => ({
    id: "exportPDF",
    label: window.sourceflow.languages.print,
    icon: "iconPDF",
    ignore: !isInMobileApp(),
    click: () => {
        const msgId = showMessage(window.sourceflow.languages.exporting);
        const localData = window.sourceflow.storage[Constants.LOCAL_EXPORTPDF];
        fetchPost("/api/export/exportPreviewHTML", {
            id,
            keepFold: localData.keepFold,
            merge: localData.mergeSubdocs,
        }, async response => {
            try {
                const html = await buildMobilePDFExportHTML(response, id);
                if (isInAndroid()) {
                    window.JSAndroid.print(response.data.name, html);
                } else if (isInHarmony()) {
                    window.JSHarmony.print(response.data.name, html);
                } else if (isInIOS()) {
                    window.webkit.messageHandlers.print.postMessage(response.data.name + Constants.ZWSP + html);
                }
            } catch (error) {
                showAsyncMenuActionError(window.sourceflow.languages.export, error);
            } finally {
                setTimeout(() => {
                    hideMessage(msgId);
                }, 3000);
            }
        });
    }
});

const createDesktopMoreExportMenuItem = (id: string) => ({
    id: "exportMore",
    label: window.sourceflow.languages.more,
    icon: "iconMore",
    type: "submenu" as const,
    submenu: [
        createExportArchiveMenuItem(id, "ReStructuredText", "reStructuredText"),
        createExportArchiveMenuItem(id, "AsciiDoc", "AsciiDoc"),
        createExportArchiveMenuItem(id, "Textile", "Textile"),
        createExportArchiveMenuItem(id, "OPML", "OPML"),
        createExportArchiveMenuItem(id, "OrgMode", "Org-Mode"),
        createExportArchiveMenuItem(id, "MediaWiki", "MediaWiki"),
        createExportArchiveMenuItem(id, "ODT", "ODT"),
        createExportArchiveMenuItem(id, "RTF", "RTF"),
        createExportArchiveMenuItem(id, "EPUB", "EPUB"),
    ]
});

export const exportMd = (id: string) => {
    if (window.sourceflow.isPublish) {
        return;
    }
    return new MenuItem({
        id: "export",
        label: window.sourceflow.languages.export,
        type: "submenu",
        icon: "iconUpload",
        submenu: [
            createExportTemplateMenuItem(id),
            {
                id: "exportSourceFlowZip",
                label: "SourceFlow .sf.zip",
                icon: "iconUpload",
                click: () => {
                    const msgId = showMessage(window.sourceflow.languages.exporting, -1);
                    fetchPost("/api/export/exportSY", {id}, response => {
                        hideMessage(msgId);
                        openByMobile(response.data.zip);
                    });
                }
            },
            {
                id: "exportMarkdown",
                label: "Markdown .zip",
                icon: "iconMarkdown",
                click: () => {
                    const msgId = showMessage(window.sourceflow.languages.exporting, -1);
                    fetchPost("/api/export/exportMd", {id}, response => {
                        hideMessage(msgId);
                        openByMobile(response.data.zip);
                    });
                }
            },
            createImageExportMenuItem(id),
            /// #if !BROWSER
            createDesktopSaveExportMenuItem(id, "pdf", "PDF", "iconPDF"),
            createDesktopSaveExportMenuItem(id, "html", "HTML (SourceFlow)", "iconHTML5", "ft__error"),
            createDesktopSaveExportMenuItem(id, "htmlmd", "HTML (Markdown)", "iconHTML5"),
            createDesktopSaveExportMenuItem(id, "word", "Word .docx", "iconExact"),
            createDesktopMoreExportMenuItem(id),
            /// #else
            createMobilePrintMenuItem(id),
            createBrowserSaveExportMenuItem(id, "html", "HTML (SourceFlow)", "iconHTML5", "ft__error"),
            createBrowserSaveExportMenuItem(id, "htmlmd", "HTML (Markdown)", "iconHTML5"),
            /// #endif
        ]
    }).element;
};
