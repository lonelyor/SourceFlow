import {hideElements} from "../../ui/hideElements";
import {isMac, isNotCtrl, isOnlyMeta, writeText} from "../../util/compatibility";
import {
    focusBlock,
    focusByRange,
    focusByWbr,
    getEditorRange,
    getSelectionOffset,
    getSelectionPosition,
    selectAll,
    setFirstNodeRange,
    setInsertWbrHTML,
    setLastNodeRange,
} from "../../util/selection";
import {
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByAttribute,
    isInEmbedBlock
} from "../../util/hasClosest";
import {removeBlock, removeImage} from "../remove";
import {
    getContenteditableElement,
    getFirstBlock,
    getLastBlock,
    getNextBlock,
    getParentBlock,
    getPreviousBlock,
    getTopAloneElement,
    hasNextSibling,
    hasPreviousSibling,
    isEndOfBlock,
    isNotEditBlock,
} from "../getBlock";
import {isIncludesHotKey, matchHotKey} from "../../util/hotKey";
import {enter, softEnter} from "../enter";
import {clearTableCell, fixTable} from "../../util/table";
import {isTitleEmptyAttr} from "../../../util/attrCompat";
import {
    transaction,
    turnsIntoOneTransaction,
    turnsIntoTransaction,
    turnsOneInto,
    updateBatchTransaction,
    updateTransaction
} from "../transaction";
import {fontEvent} from "../../toolbar/Font";
import {addSubList, listIndent, listOutdent} from "../list";
import {newFileContentBySelect, rename, replaceFileName} from "../../../editor/rename";
import {cancelSB, insertEmptyBlock, jumpToParent} from "../../../block/util";
import {isLocalPath} from "../../../util/pathName";
/// #if !MOBILE
import {openBy, openFileById} from "../../../editor/util";
/// #endif
/// #if MOBILE
import {openMobileFileById} from "../../../mobile/editor";
/// #endif
import {alignImgCenter, alignImgLeft, commonHotkey, downSelect, getStartEndElement, upSelect} from "../commonHotkey";
import {fileAnnotationRefMenu, inlineMathMenu, linkMenu, refMenu, setFold, tagMenu} from "../../../menus/protyle";
import {openAttr} from "../../../menus/commonMenuItem";
import {Constants} from "../../../constants";
import {fetchPost} from "../../../util/fetch";
import {scrollCenter} from "../../../util/highlightById";
import {BlockPanel} from "../../../block/Panel";
import * as dayjs from "dayjs";
import {highlightRender} from "../../render/highlightRender";
import {countBlockWord} from "../../../layout/status";
import {moveToDown, moveToUp} from "../move";
import {pasteAsPlainText} from "../../util/paste";
import {preventScroll} from "../../scroll/preventScroll";
import {getSavePath, newFileBySelect} from "../../../util/newFile";
import {removeSearchMark} from "../../toolbar/util";
import {avKeydown} from "../../render/av/keydown";
import {checkFold} from "../../../util/noRelyPCFunction";
import {AIActions} from "../../../ai/actions";
import {openLink} from "../../../editor/openLink";
import {onlyProtyleCommand} from "../../../boot/globalEvent/command/protyle";
import {AIChat} from "../../../ai/chat";
import {updateCalloutType} from "../callout";
import {tabCodeBlock} from "../codeBlock";

import {getContentByInlineHTML} from "./inline";
import type {ActiveKeydownContext, KeydownHandlerResult} from "./shared";

export const handleDocumentActionKeydown = (context: ActiveKeydownContext): KeydownHandlerResult => {
    const {protyle, editorElement, event, range, nodeElement, nodeType, selectText} = context;
        if (matchHotKey(window.sourceflow.config.keymap.editor.general.copyText.custom, event)) {
            // 用于标识复制文本 *
            if (selectText !== "") {
                // 和复制块引用保持一致 https://github.com/lonelyor/SourceFlow/issues/9093
                getContentByInlineHTML(range, (content) => {
                    writeText(`${content.trim()} ((${nodeElement.getAttribute("data-node-id")} "*"))`);
                });
            } else {
                const selectElements = protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select");
                if (selectElements.length > 0) {
                    selectElements[0].setAttribute("data-reftext", "true");
                    focusByRange(getEditorRange(nodeElement));
                    document.execCommand("copy");
                } else {
                    writeText(`((${nodeElement.getAttribute("data-node-id")} "*"))`);
                }
            }
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.general.attr.custom, event)) {
            const topElement = getTopAloneElement(nodeElement);
            if (selectText === "") {
                const selectElements = protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select");
                let actionElement;
                if (selectElements.length === 1) {
                    actionElement = selectElements[0];
                } else {
                    actionElement = topElement;
                }
                openAttr(actionElement, "bookmark", protyle);
            } else {
                getContentByInlineHTML(range, (content) => {
                    const oldHTML = topElement.outerHTML;
                    const nameElement = topElement.lastElementChild.querySelector(".protyle-attr--name");
                    if (nameElement) {
                        nameElement.innerHTML = `<svg><use xlink:href="#iconN"></use></svg>${content.trim()}`;
                    } else {
                        topElement.lastElementChild.insertAdjacentHTML("afterbegin", `<div class="protyle-attr--name"><svg><use xlink:href="#iconN"></use></svg>${content.trim()}</div>`);
                    }
                    topElement.setAttribute("name", content.trim());
                    updateTransaction(protyle, topElement.getAttribute("data-node-id"), topElement.outerHTML, oldHTML);
                });
            }
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.general.rename.custom, event) && !protyle.disabled) {
            if (selectText === "") {
                fetchPost("/api/block/getDocInfo", {
                    id: protyle.block.rootID
                }, (response) => {
                    rename({
                        notebookId: protyle.notebookId,
                        path: protyle.path,
                        name: response.data.ial.title,
                        empty: isTitleEmptyAttr(response.data.ial),
                        range,
                        type: "file",
                    });
                });
            } else {
                fetchPost("/api/filetree/renameDoc", {
                    notebook: protyle.notebookId,
                    path: protyle.path,
                    title: replaceFileName(selectText),
                });
            }
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        const isNewNameFile = matchHotKey(window.sourceflow.config.keymap.editor.general.newNameFile.custom, event);
        if (isNewNameFile || matchHotKey(window.sourceflow.config.keymap.editor.general.newNameSettingFile.custom, event)) {
            if (!selectText.trim() && (nodeElement.querySelector("tr") || nodeElement.querySelector("span"))) {
                // 没选中时，都是纯文本就创建子文档
            } else {
                if (!selectText.trim() &&
                    getContenteditableElement(nodeElement).textContent  // https://github.com/lonelyor/SourceFlow/issues/8099
                ) {
                    selectAll(protyle, nodeElement, range);
                }
                if (isNewNameFile) {
                    fetchPost("/api/filetree/getHPathByPath", {
                        notebook: protyle.notebookId,
                        path: protyle.path,
                    }, (response) => {
                        newFileBySelect(protyle, selectText, nodeElement, response.data, protyle.notebookId);
                    });
                } else {
                    getSavePath(protyle.path, protyle.notebookId, (pathString, targetNotebookId) => {
                        newFileBySelect(protyle, selectText, nodeElement, pathString, targetNotebookId);
                    });
                }
            }
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (matchHotKey(window.sourceflow.config.keymap.editor.general.newContentFile.custom, event)) {
            newFileContentBySelect(protyle);
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.general.alignLeft.custom, event)) {
            const imgSelectElements = nodeElement.querySelectorAll(".img--select");
            if (imgSelectElements.length > 0) {
                alignImgLeft(protyle, nodeElement, Array.from(imgSelectElements), nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML);
            } else {
                let selectElements: HTMLElement[] = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
                if (selectElements.length === 0) {
                    selectElements = [nodeElement];
                }
                updateBatchTransaction(selectElements, protyle, (e: HTMLElement) => {
                    if (e.classList.contains("av")) {
                        e.style.justifyContent = "";
                    } else {
                        e.style.textAlign = "left";
                    }
                });
            }
            event.stopPropagation();
            event.preventDefault();
            return;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.general.alignCenter.custom, event)) {
            const imgSelectElements = nodeElement.querySelectorAll(".img--select");
            if (imgSelectElements.length > 0) {
                alignImgCenter(protyle, nodeElement, Array.from(imgSelectElements), nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML);
            } else {
                let selectElements: HTMLElement[] = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
                if (selectElements.length === 0) {
                    selectElements = [nodeElement];
                }
                updateBatchTransaction(selectElements, protyle, (e: HTMLElement) => {
                    if (e.classList.contains("av")) {
                        e.style.justifyContent = "center";
                    } else {
                        e.style.textAlign = "center";
                    }
                });
            }
            event.stopPropagation();
            event.preventDefault();
            return;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.general.alignRight.custom, event)) {
            let selectElements: HTMLElement[] = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
            if (selectElements.length === 0) {
                selectElements = [nodeElement];
            }
            updateBatchTransaction(selectElements, protyle, (e: HTMLElement) => {
                if (e.classList.contains("av")) {
                    e.style.justifyContent = "flex-end";
                } else {
                    e.style.textAlign = "right";
                }
            });
            event.stopPropagation();
            event.preventDefault();
            return;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.general.rtl.custom, event)) {
            let selectElements: HTMLElement[] = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
            if (selectElements.length === 0) {
                selectElements = [nodeElement];
            }
            updateBatchTransaction(selectElements, protyle, (e: HTMLElement) => {
                e.style.direction = "rtl";
            });
            event.stopPropagation();
            event.preventDefault();
            return;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.general.ltr.custom, event)) {
            let selectElements: HTMLElement[] = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
            if (selectElements.length === 0) {
                selectElements = [nodeElement];
            }
            updateBatchTransaction(selectElements, protyle, (e: HTMLElement) => {
                e.style.direction = "ltr";
            });
            event.stopPropagation();
            event.preventDefault();
            return;
        }

        // esc
        if (event.key === "Escape") {
            if (event.repeat) {
                // https://github.com/lonelyor/SourceFlow/issues/12989
                const cardElement = hasClosestByClassName(range.startContainer, "card__main", true);
                if (cardElement && document.activeElement && document.activeElement.classList.contains("protyle-wysiwyg")) {
                    (cardElement.querySelector(".card__action:not(.fn__none) button:not([disabled])") as HTMLElement).focus();
                    hideElements(["select"], protyle);
                }
            } else {
                if (!protyle.toolbar.element.classList.contains("fn__none") ||
                    !protyle.hint.element.classList.contains("fn__none") ||
                    !protyle.toolbar.subElement.classList.contains("fn__none")) {
                    hideElements(["toolbar", "hint", "util"], protyle);
                    protyle.hint.enableExtend = false;
                } else if (!window.sourceflow.menus.menu.element.classList.contains("fn__none")) {
                    // 防止 ESC 时选中当前块
                    window.sourceflow.menus.menu.remove(true);
                } else if (nodeElement.classList.contains("protyle-wysiwyg--select")) {
                    hideElements(["select"], protyle);
                    countBlockWord([], protyle.block.rootID);
                } else {
                    hideElements(["select"], protyle);
                    range.collapse(false);
                    nodeElement.classList.add("protyle-wysiwyg--select");
                    countBlockWord([nodeElement.getAttribute("data-node-id")], protyle.block.rootID);
                }
            }
            event.stopPropagation();
            event.preventDefault();
            return;
        }

};
