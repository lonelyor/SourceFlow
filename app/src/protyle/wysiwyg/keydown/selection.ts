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
import {updateCalloutType} from "../callout";
import {tabCodeBlock} from "../codeBlock";

import type {KeydownContext, KeydownHandlerResult} from "./shared";

export const handleSelectionKeydown = (context: KeydownContext): KeydownHandlerResult => {
    const {protyle, editorElement, event, range, nodeElement, nodeType} = context;
        if (!event.altKey && !event.shiftKey && isNotCtrl(event) && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            const selectElements = protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select");
            if (selectElements.length > 0) {
                event.preventDefault();
                event.stopPropagation();
                hideElements(["select"], protyle);
                if (event.key === "ArrowDown") {
                    const currentSelectElement = selectElements[selectElements.length - 1] as HTMLElement;
                    let nextElement = getNextBlock(currentSelectElement) as HTMLElement;
                    if (nextElement) {
                        if (nextElement.getBoundingClientRect().width === 0) {
                            // https://github.com/lonelyor/SourceFlow/issues/4294
                            const foldElement = hasTopClosestByAttribute(nextElement, "fold", "1");
                            if (foldElement) {
                                nextElement = getNextBlock(foldElement) as HTMLElement;
                                if (nextElement) {
                                    nextElement = getFirstBlock(nextElement) as HTMLElement;
                                } else {
                                    nextElement = currentSelectElement;
                                }
                            } else {
                                nextElement = currentSelectElement;
                            }
                        } else if (nextElement.getAttribute("fold") === "1"
                            && (nextElement.classList.contains("sb") || nextElement.classList.contains("bq"))) {
                            // https://github.com/lonelyor/SourceFlow/issues/3913
                        } else {
                            nextElement = getFirstBlock(nextElement) as HTMLElement;
                        }
                    } else {
                        nextElement = currentSelectElement;
                    }

                    nextElement.classList.add("protyle-wysiwyg--select");
                    countBlockWord([nextElement.getAttribute("data-node-id")]);
                    const bottom = nextElement.getBoundingClientRect().bottom - protyle.contentElement.getBoundingClientRect().bottom;
                    if (bottom > 0) {
                        protyle.contentElement.scrollTop = protyle.contentElement.scrollTop + bottom;
                        protyle.scroll.lastScrollTop = protyle.contentElement.scrollTop - 1;
                    }
                    focusBlock(nextElement);
                } else if (event.key === "ArrowUp") {
                    let previousElement: HTMLElement = getPreviousBlock(selectElements[0]) as HTMLElement;
                    if (previousElement) {
                        previousElement = getLastBlock(previousElement) as HTMLElement;
                        if (previousElement.getBoundingClientRect().width === 0) {
                            // https://github.com/lonelyor/SourceFlow/issues/4294
                            const foldElement = hasTopClosestByAttribute(previousElement, "fold", "1");
                            if (foldElement) {
                                previousElement = getFirstBlock(foldElement) as HTMLElement;
                            } else {
                                previousElement = selectElements[0] as HTMLElement;
                            }
                        } else if (previousElement) {
                            // https://github.com/lonelyor/SourceFlow/issues/3913
                            const foldElement = hasTopClosestByAttribute(previousElement, "fold", "1");
                            if (foldElement && (foldElement.classList.contains("sb") || foldElement.classList.contains("bq"))) {
                                previousElement = foldElement;
                            }
                        }
                    } else if (protyle.title && protyle.title.editElement &&
                        (protyle.wysiwyg.element.firstElementChild.getAttribute("data-eof") === "1" || protyle.contentElement.scrollTop === 0)) {
                        const titleRange = setLastNodeRange(protyle.title.editElement, range, false);
                        titleRange.collapse(false);
                        focusByRange(titleRange);
                        event.stopPropagation();
                        event.preventDefault();
                    } else if (protyle.contentElement.scrollTop !== 0) {
                        protyle.contentElement.scrollTop = 0;
                        protyle.scroll.lastScrollTop = 8;
                    } else {
                        previousElement = selectElements[0] as HTMLElement;
                    }
                    if (previousElement) {
                        previousElement.classList.add("protyle-wysiwyg--select");
                        countBlockWord([previousElement.getAttribute("data-node-id")]);
                        const top = previousElement.getBoundingClientRect().top - protyle.contentElement.getBoundingClientRect().top;
                        if (top < 0) {
                            protyle.contentElement.scrollTop = protyle.contentElement.scrollTop + top;
                            protyle.scroll.lastScrollTop = protyle.contentElement.scrollTop + 1;
                        }
                        focusBlock(previousElement);
                    }
                }
                return;
            }
        }

        // 仅处理以下快捷键操作
        if (event.key !== "PageUp" && event.key !== "PageDown" && event.key !== "Home" && event.key !== "End" && event.key.indexOf("Arrow") === -1 &&
            isNotCtrl(event) && event.key !== "Escape" && !event.shiftKey && !event.altKey && !/^F\d{1,2}$/.test(event.key) &&
            event.key !== "Enter" && event.key !== "Tab" && event.key !== "Backspace" && event.key !== "Delete" && event.key !== "ContextMenu") {
            event.stopPropagation();
            hideElements(["select"], protyle);
            // https://github.com/lonelyor/SourceFlow/issues/14743
            if (nodeElement && getContenteditableElement(nodeElement) &&
                range.endContainer.nodeType === 1 && (range.endContainer as HTMLElement).classList.contains("protyle-attr")) {
                range.collapse(true);
            }
            return false;
        }

        if (matchHotKey(window.sourceflow.config.keymap.editor.general.collapse.custom, event) && !event.repeat) {
            const selectElements = protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select");
            if (selectElements.length > 0) {
                setFold(protyle, selectElements[0]);
            } else {
                if (nodeElement.parentElement.getAttribute("data-type") === "NodeListItem") {
                    if (nodeElement.parentElement.childElementCount > 3) {
                        setFold(protyle, nodeElement.parentElement);
                    } else {
                        setFold(protyle, nodeElement);
                    }
                } else if (nodeType === "NodeHeading") {
                    setFold(protyle, nodeElement);
                } else {
                    setFold(protyle, getTopAloneElement(nodeElement));
                }
            }
            event.stopPropagation();
            event.preventDefault();
            return false;
        }

        if (matchHotKey(window.sourceflow.config.keymap.editor.general.expand.custom, event) && !event.repeat) {
            const selectElements = protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select");
            if (selectElements.length > 0) {
                setFold(protyle, selectElements[0], true);
            } else {
                if (nodeElement.parentElement.getAttribute("data-type") === "NodeListItem") {
                    if (nodeElement.parentElement.childElementCount > 3) {
                        setFold(protyle, nodeElement.parentElement, true);
                    } else {
                        setFold(protyle, nodeElement, true);
                    }
                } else if (nodeType === "NodeHeading") {
                    setFold(protyle, nodeElement, true);
                } else {
                    setFold(protyle, getTopAloneElement(nodeElement), true);
                }
            }
            event.stopPropagation();
            event.preventDefault();
            return;
        }

        if (matchHotKey(window.sourceflow.config.keymap.editor.general.expandUp.custom, event)) {
            upSelect({
                protyle, event, nodeElement, editorElement, range,
                cb(selectElements) {
                    const previousElement = selectElements[0].previousElementSibling as HTMLElement;
                    if (previousElement && previousElement.getAttribute("data-node-id")) {
                        previousElement.classList.add("protyle-wysiwyg--select");
                        selectElements.forEach(item => {
                            item.removeAttribute("select-end");
                        });
                        previousElement.setAttribute("select-end", "true");
                        const top = previousElement.getBoundingClientRect().top - protyle.contentElement.getBoundingClientRect().top;
                        if (top < 0) {
                            protyle.contentElement.scrollTop = protyle.contentElement.scrollTop + top;
                            protyle.scroll.lastScrollTop = protyle.contentElement.scrollTop + 1;
                        }
                    } else if (!getParentBlock(selectElements[0]).classList.contains("protyle-wysiwyg")) {
                        hideElements(["select"], protyle);
                        getParentBlock(selectElements[0]).classList.add("protyle-wysiwyg--select");
                    }
                }
            });
            return;
        }

        if (matchHotKey(window.sourceflow.config.keymap.editor.general.expandDown.custom, event)) {
            downSelect({
                protyle, event, nodeElement, editorElement, range,
                cb(selectElements) {
                    const selectLastElement = selectElements[selectElements.length - 1];
                    const nextElement = selectLastElement.nextElementSibling as HTMLElement;
                    if (nextElement && nextElement.getAttribute("data-node-id")) {
                        nextElement.classList.add("protyle-wysiwyg--select");
                        selectElements.forEach(item => {
                            item.removeAttribute("select-end");
                        });
                        nextElement.setAttribute("select-end", "true");
                        const bottom = nextElement.getBoundingClientRect().bottom - protyle.contentElement.getBoundingClientRect().bottom;
                        if (bottom > 0) {
                            protyle.contentElement.scrollTop = protyle.contentElement.scrollTop + bottom;
                            protyle.scroll.lastScrollTop = protyle.contentElement.scrollTop - 1;
                        }
                    } else if (!getParentBlock(selectLastElement).classList.contains("protyle-wysiwyg")) {
                        hideElements(["select"], protyle);
                        getParentBlock(selectLastElement).classList.add("protyle-wysiwyg--select");
                    }
                }
            });
            return;
        }

        if (matchHotKey("⇧↑", event)) {
            upSelect({
                protyle, event, nodeElement, editorElement, range,
                cb(selectElements) {
                    const startEndElement = getStartEndElement(selectElements);
                    if (startEndElement.startElement.getBoundingClientRect().top >= startEndElement.endElement.getBoundingClientRect().top) {
                        const previousElement = startEndElement.endElement.previousElementSibling as HTMLElement;
                        if (previousElement && previousElement.getAttribute("data-node-id")) {
                            previousElement.classList.add("protyle-wysiwyg--select");
                            previousElement.setAttribute("select-end", "true");
                            startEndElement.endElement.removeAttribute("select-end");
                            const top = previousElement.getBoundingClientRect().top - protyle.contentElement.getBoundingClientRect().top;
                            if (top < 0) {
                                protyle.contentElement.scrollTop = protyle.contentElement.scrollTop + top;
                                protyle.scroll.lastScrollTop = protyle.contentElement.scrollTop + 1;
                            }
                        } else if (!getParentBlock(startEndElement.endElement).classList.contains("protyle-wysiwyg")) {
                            hideElements(["select"], protyle);
                            getParentBlock(startEndElement.endElement).classList.add("protyle-wysiwyg--select");
                        }
                    } else {
                        startEndElement.endElement.classList.remove("protyle-wysiwyg--select");
                        startEndElement.endElement.removeAttribute("select-end");
                        const previousElement = getPreviousBlock(startEndElement.endElement);
                        if (previousElement) {
                            previousElement.setAttribute("select-end", "true");
                            if (previousElement.getBoundingClientRect().top <= protyle.contentElement.getBoundingClientRect().top) {
                                preventScroll(protyle);
                                previousElement.scrollIntoView(true);
                            }
                        }
                    }
                }
            });
            return;
        }

        if (matchHotKey("⇧↓", event)) {
            downSelect({
                protyle,
                event,
                nodeElement,
                editorElement,
                range,
                cb(selectElements) {
                    const startEndElement = getStartEndElement(selectElements);
                    if (startEndElement.startElement.getBoundingClientRect().top <= startEndElement.endElement.getBoundingClientRect().top) {
                        const nextElement = startEndElement.endElement.nextElementSibling as HTMLElement;
                        if (nextElement && nextElement.getAttribute("data-node-id")) {
                            if (nextElement.getBoundingClientRect().width === 0) {
                                // https://github.com/lonelyor/SourceFlow/issues/11194
                                hideElements(["select"], protyle);
                                getParentBlock(startEndElement.endElement).classList.add("protyle-wysiwyg--select");
                            } else {
                                nextElement.classList.add("protyle-wysiwyg--select");
                                nextElement.setAttribute("select-end", "true");
                                startEndElement.endElement.removeAttribute("select-end");
                                const bottom = nextElement.getBoundingClientRect().bottom - protyle.contentElement.getBoundingClientRect().bottom;
                                if (bottom > 0) {
                                    protyle.contentElement.scrollTop = protyle.contentElement.scrollTop + bottom;
                                    protyle.scroll.lastScrollTop = protyle.contentElement.scrollTop - 1;
                                }
                            }
                        } else if (!getParentBlock(startEndElement.endElement).classList.contains("protyle-wysiwyg")) {
                            hideElements(["select"], protyle);
                            getParentBlock(startEndElement.endElement).classList.add("protyle-wysiwyg--select");
                        }
                    } else {
                        startEndElement.endElement.classList.remove("protyle-wysiwyg--select");
                        startEndElement.endElement.removeAttribute("select-end");
                        const nextElement = getNextBlock(startEndElement.endElement);
                        if (nextElement) {
                            nextElement.setAttribute("select-end", "true");
                            if (nextElement.getBoundingClientRect().bottom >= protyle.contentElement.getBoundingClientRect().bottom) {
                                preventScroll(protyle);
                                nextElement.scrollIntoView(false);
                            }
                        }
                    }
                }
            });
            return;
        }

        if (matchHotKey(window.sourceflow.config.keymap.general.enter.custom, event)) {
            onlyProtyleCommand({
                protyle,
                command: "enter",
                previousRange: range,
            });
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (matchHotKey(window.sourceflow.config.keymap.general.enterBack.custom, event)) {
            onlyProtyleCommand({
                protyle,
                command: "enterBack",
                previousRange: range,
            });
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if ((event.shiftKey && !event.altKey && isNotCtrl(event) && (event.key === "Home" || event.key === "End") && isMac()) ||
            (event.shiftKey && !event.altKey && isOnlyMeta(event) && (event.key === "Home" || event.key === "End") && !isMac())) {
            const topElement = hasTopClosestByAttribute(nodeElement, "data-node-id", null);
            if (topElement) {
                // 超级块内已选中某个块
                topElement.querySelectorAll(".protyle-wysiwyg--select").forEach(item => {
                    item.classList.remove("protyle-wysiwyg--select");
                });
                topElement.classList.add("protyle-wysiwyg--select");
                let nextElement = event.key === "Home" ? topElement.previousElementSibling : topElement.nextElementSibling;
                while (nextElement) {
                    nextElement.classList.add("protyle-wysiwyg--select");
                    nextElement = event.key === "Home" ? nextElement.previousElementSibling : nextElement.nextElementSibling;
                }
                if (event.key === "Home") {
                    protyle.wysiwyg.element.firstElementChild.scrollIntoView();
                } else {
                    protyle.wysiwyg.element.lastElementChild.scrollIntoView(false);
                }
            }
            event.stopPropagation();
            event.preventDefault();
            return;
        }
        // https://github.com/lonelyor/SourceFlow/issues/11726
        if ((event.key === "Home" || event.key === "End") && !event.shiftKey && !event.altKey && isNotCtrl(event)) {
            hideElements(["hint"], protyle);
        }
        // 向上/下滚动一屏
        if (!event.altKey && !event.shiftKey && isNotCtrl(event) && (event.key === "PageUp" || event.key === "PageDown")) {
            if (event.key === "PageUp") {
                protyle.contentElement.scrollTop = protyle.contentElement.scrollTop - protyle.contentElement.clientHeight + 60;
                protyle.scroll.lastScrollTop = protyle.contentElement.scrollTop + 1;
            } else {
                protyle.contentElement.scrollTop = protyle.contentElement.scrollTop + protyle.contentElement.clientHeight - 60;
                protyle.scroll.lastScrollTop = protyle.contentElement.scrollTop - 1;
            }
            const contentRect = protyle.contentElement.getBoundingClientRect();
            let centerElement = document.elementFromPoint(contentRect.x + contentRect.width / 2, contentRect.y + contentRect.height / 2);
            if (centerElement.classList.contains("protyle-wysiwyg")) {
                centerElement = document.elementFromPoint(contentRect.x + contentRect.width / 2, contentRect.y + contentRect.height / 2 + Constants.SIZE_TOOLBAR_HEIGHT);
            }
            const centerBlockElement = hasClosestBlock(centerElement);
            if (centerBlockElement && centerBlockElement !== nodeElement) {
                focusBlock(centerBlockElement, undefined, false);
            }
            event.stopPropagation();
            event.preventDefault();
            return;
        }
        // hint: 上下、回车选择
        if (!event.altKey && !event.shiftKey &&
            ((event.key.indexOf("Arrow") > -1 && isNotCtrl(event)) || event.key === "Enter") &&
            !protyle.hint.element.classList.contains("fn__none") && protyle.hint.select(event, protyle)) {
            return;
        }
        if (matchHotKey("⌘/", event)) {
            event.stopPropagation();
            event.preventDefault();
            const selectElements = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
            if (selectElements.length === 0) {
                const inlineElement = hasClosestByAttribute(range.startContainer, "data-type", null);
                if (inlineElement && inlineElement.tagName === "SPAN") {
                    const types = inlineElement.getAttribute("data-type").split(" ");
                    if (types.length > 0) {
                        protyle.toolbar.range = range;
                        removeSearchMark(inlineElement);
                    }
                    if (types.includes("block-ref")) {
                        refMenu(protyle, inlineElement);
                        return;
                    } else if (types.includes("inline-memo")) {
                        protyle.toolbar.showRender(protyle, inlineElement);
                        return;
                    } else if (types.includes("file-annotation-ref")) {
                        fileAnnotationRefMenu(protyle, inlineElement);
                        return;
                    } else if (types.includes("a")) {
                        linkMenu(protyle, inlineElement);
                        return;
                    } else if (types.includes("tag")) {
                        tagMenu(protyle, inlineElement);
                        return;
                    }
                }

                // https://github.com/lonelyor/SourceFlow/issues/5185
                if (range.startOffset === 0 && range.startContainer.nodeType === 3) {
                    const previousSibling = hasPreviousSibling(range.startContainer) as HTMLElement;
                    if (previousSibling &&
                        previousSibling.nodeType !== 3 &&
                        previousSibling.getAttribute("data-type")?.indexOf("inline-math") > -1
                    ) {
                        inlineMathMenu(protyle, previousSibling);
                        return;
                    } else if (!previousSibling &&
                        range.startContainer.parentElement.previousSibling &&
                        range.startContainer.parentElement.previousSibling === range.startContainer.parentElement.previousElementSibling &&
                        range.startContainer.parentElement.previousElementSibling.getAttribute("data-type")?.indexOf("inline-math") > -1
                    ) {
                        inlineMathMenu(protyle, range.startContainer.parentElement.previousElementSibling);
                        return;
                    }
                }

                selectElements.push(nodeElement);
            }
            if (selectElements.length === 1) {
                protyle.gutter.renderMenu(protyle, selectElements[0]);
            } else {
                protyle.gutter.renderMultipleMenu(protyle, selectElements);
            }
            const rect = nodeElement.getBoundingClientRect();
            window.sourceflow.menus.menu.popup({x: rect.left, y: rect.top, isLeft: true});
            return;
        }

};
