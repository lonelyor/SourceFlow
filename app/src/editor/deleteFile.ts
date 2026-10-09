import {fetchPost} from "../util/fetch";
import {getDisplayName, getNotebookName} from "../util/pathName";
import {confirmDialog} from "../dialog/confirmDialog";
import {hasTopClosestByTag} from "../protyle/util/hasClosest";
import {showMessage} from "../dialog/message";
import {escapeHtml} from "../util/escape";
import {Constants} from "../constants";

export const deleteFile = (notebookId: string, pathString: string) => {
    if (window.sourceflow.config.fileTree.removeDocWithoutConfirm) {
        fetchPost("/api/block/getDocInfo", {
            id: getDisplayName(pathString, true, true)
        }, (response) => {
            if (response.data && response.data.subFileCount > 0) {
                const fileName = escapeHtml(response.data.name);
                const tip = `${window.sourceflow.languages.andSubFile.replace("${x}", fileName).replace("${y}", response.data.subFileCount)}
<div class="fn__hr"></div>
<div class="ft__smaller ft__on-surface">${window.sourceflow.languages.rollbackTip.replace("${x}", window.sourceflow.config.editor.historyRetentionDays)}</div>`;
                confirmDialog(window.sourceflow.languages.deleteOpConfirm, tip, () => {
                    fetchPost("/api/filetree/removeDoc", {
                        notebook: notebookId,
                        path: pathString
                    });
                }, undefined, true);
                return;
            }
            fetchPost("/api/filetree/removeDoc", {
                notebook: notebookId,
                path: pathString
            });
        });
        return;
    }
    fetchPost("/api/block/getDocInfo", {
        id: getDisplayName(pathString, true, true)
    }, (response) => {
        if (!response.data) {
            showMessage(window.sourceflow.languages.delGetInfoFailed);
            return;
        }
        const fileName = escapeHtml(response.data.name);
        let tip = `${window.sourceflow.languages.confirmDeleteTip.replace("${x}", fileName)}
<div class="fn__hr"></div>
<div class="ft__smaller ft__on-surface">${window.sourceflow.languages.rollbackTip.replace("${x}", window.sourceflow.config.editor.historyRetentionDays)}</div>`;
        if (response.data.subFileCount > 0) {
            tip = `${window.sourceflow.languages.andSubFile.replace("${x}", fileName).replace("${y}", response.data.subFileCount)}
<div class="fn__hr"></div>
<div class="ft__smaller ft__on-surface">${window.sourceflow.languages.rollbackTip.replace("${x}", window.sourceflow.config.editor.historyRetentionDays)}</div>`;
        }
        confirmDialog(window.sourceflow.languages.deleteOpConfirm, tip, () => {
            fetchPost("/api/filetree/removeDoc", {
                notebook: notebookId,
                path: pathString
            });
        }, undefined, true);
    });
};

export const deleteFiles = (liElements: Element[]) => {
    if (liElements.length === 1) {
        const itemTopULElement = hasTopClosestByTag(liElements[0], "UL");
        if (itemTopULElement) {
            const itemNotebookId = itemTopULElement.getAttribute("data-url");
            if (liElements[0].getAttribute("data-type") === "navigation-file") {
                deleteFile(itemNotebookId, liElements[0].getAttribute("data-path"));
            } else {
                const isHelpNotebook = Object.values(Constants.HELP_PATH).includes(itemNotebookId);
                confirmDialog(isHelpNotebook ? "" : window.sourceflow.languages.deleteOpConfirm,
                    isHelpNotebook ? "" : `${window.sourceflow.languages.confirmDeleteTip.replace("${x}", Lute.EscapeHTMLStr(getNotebookName(itemNotebookId)))}
<div class="fn__hr"></div>
<div class="ft__smaller ft__on-surface">${window.sourceflow.languages.rollbackTip.replace("${x}", window.sourceflow.config.editor.historyRetentionDays)}</div>`, () => {
                        fetchPost("/api/notebook/removeNotebook", {
                            notebook: itemNotebookId,
                        });
                    }, undefined, true);
            }
        }
    } else {
        const docs: Array<{notebook: string, path: string}> = [];
        const docKeys = new Set<string>();
        const notebookIds: string[] = [];
        liElements.forEach(item => {
            const itemTopULElement = hasTopClosestByTag(item, "UL");
            const notebookId = itemTopULElement ? itemTopULElement.getAttribute("data-url") : null;
            if (item.getAttribute("data-type") === "navigation-root") {
                if (notebookId && !Object.values(Constants.HELP_PATH).includes(notebookId) && !notebookIds.includes(notebookId)) {
                    notebookIds.push(notebookId);
                }
            } else {
                const dataPath = item.getAttribute("data-path");
                if (notebookId && dataPath && dataPath !== "/") {
                    const docKey = `${notebookId}\n${dataPath}`;
                    if (!docKeys.has(docKey)) {
                        docKeys.add(docKey);
                        docs.push({notebook: notebookId, path: dataPath});
                    }
                }
            }
        });
        const totalCount = docs.length + notebookIds.length;
        if (totalCount === 0) {
            showMessage(window.sourceflow.languages.notBatchRemove);
            return;
        }
        confirmDialog(window.sourceflow.languages.deleteOpConfirm,
            `${window.sourceflow.languages.confirmRemoveAll.replace("${count}", totalCount)}
<div class="fn__hr"></div>
<div class="ft__smaller ft__on-surface">${window.sourceflow.languages.rollbackTip.replace("${x}", window.sourceflow.config.editor.historyRetentionDays)}</div>`, () => {
                if (docs.length > 0) {
                    fetchPost("/api/filetree/removeDocs", {
                        docs,
                        paths: docs.map(doc => doc.path),
                    });
                }
                notebookIds.forEach(notebookId => {
                    fetchPost("/api/notebook/removeNotebook", {
                        notebook: notebookId,
                    });
                });
            }, undefined, true);
    }
};
