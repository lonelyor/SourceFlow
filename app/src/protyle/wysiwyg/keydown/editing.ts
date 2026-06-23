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

import type {ActiveKeydownContext, KeydownHandlerResult} from "./shared";

export const handleEditingKeydown = (context: ActiveKeydownContext): KeydownHandlerResult => {
    const {protyle, editorElement, event, range, nodeElement, nodeType, selectText} = context;
        if (fixTable(protyle, event, range)) {
            event.preventDefault();
            return;
        }
        if (!event.altKey && !event.shiftKey && isNotCtrl(event) && !event.isComposing && (event.key.indexOf("Arrow") > -1)) {
            // 需使用 editabled，否则代码块会把语言字数算入
            const tdElement = hasClosestByTag(range.startContainer, "TD") || hasClosestByTag(range.startContainer, "TH");
            let tdStatus;
            if (tdElement) {
                const cells = nodeElement.querySelectorAll("td, th");
                if (cells[cells.length - 1] === tdElement) {
                    tdStatus = "last";
                }
            }
            const nodeEditableElement = (tdElement || getContenteditableElement(nodeElement) || nodeElement) as HTMLElement;
            const position = getSelectionOffset(nodeEditableElement, protyle.wysiwyg.element, range);
            if (nodeElement.classList.contains("code-block") && position.end === nodeEditableElement.innerText.length) {
                // 代码块换最后一个 /n 肉眼是无法区分是否在其后的，因此统一在之前
                position.end -= 1;

            }
            if (event.key === "ArrowUp") {
                const firstEditElement = getContenteditableElement(protyle.wysiwyg.element.firstElementChild);
                if ((
                        !getPreviousBlock(nodeElement) &&  // 列表第一个块为嵌入块，第二个块为段落块，上键应选中第一个块
                        nodeElement.contains(firstEditElement)
                    ) ||
                    (!firstEditElement && nodeElement === protyle.wysiwyg.element.firstElementChild)) {
                    // 不能用\n判断，否则文字过长折行将错误 https://github.com/lonelyor/SourceFlow/issues/6156
                    if (getSelectionPosition(nodeEditableElement, range).top - nodeEditableElement.getBoundingClientRect().top < 20 || nodeElement.classList.contains("av")) {
                        if (protyle.title && protyle.title.editElement &&
                            (protyle.wysiwyg.element.firstElementChild.getAttribute("data-eof") === "1" ||
                                protyle.contentElement.scrollTop === 0)) {
                            const titleRange = setLastNodeRange(protyle.title.editElement, range, false);
                            titleRange.collapse(false);
                            focusByRange(titleRange);
                            event.stopPropagation();
                            event.preventDefault();
                        } else {
                            protyle.contentElement.scrollTop = 0;
                            protyle.scroll.lastScrollTop = 8;
                        }
                    }
                } else {
                    if (((nodeEditableElement?.innerText.substr(0, position.end).indexOf("\n") === -1 || position.start === 0) &&
                        getSelectionPosition(nodeEditableElement, range).top - nodeEditableElement.getBoundingClientRect().top < 20)) {
                        let previousElement: HTMLElement = getPreviousBlock(nodeElement) as HTMLElement;
                        if (previousElement) {
                            previousElement = getLastBlock(previousElement) as HTMLElement;
                            if (previousElement) {
                                const foldElement = hasTopClosestByAttribute(previousElement, "fold", "1") as HTMLElement;
                                // 代码块或以软换行结尾的块移动光标 ↑ 会跳过 https://github.com/lonelyor/SourceFlow/issues/5498
                                // 代码块全选后 ↑ 光标不会上移 https://github.com/lonelyor/SourceFlow/issues/11581
                                // 段落块不能设置，否则 ↑ 后光标位置不能保持 https://github.com/lonelyor/SourceFlow/issues/12710
                                if (!foldElement && previousElement.classList.contains("code-block")) {
                                    focusBlock(previousElement, undefined, false);
                                    scrollCenter(protyle, previousElement);
                                    event.stopPropagation();
                                    event.preventDefault();
                                } else if (foldElement) {
                                    // 遇到折叠块
                                    foldElement.scrollTop = 0;
                                    focusBlock(foldElement, undefined, true);
                                    scrollCenter(protyle, foldElement);
                                    event.stopPropagation();
                                    event.preventDefault();
                                } else {
                                    // 修正光标上移至 \n 结尾的块时落点错误 https://github.com/lonelyor/SourceFlow/issues/14443
                                    const prevEditableElement = getContenteditableElement(previousElement) as HTMLElement;
                                    if (prevEditableElement && prevEditableElement.lastChild?.nodeType === 3 &&
                                        prevEditableElement.lastChild?.textContent.endsWith("\n")) {
                                        //  不能移除 /n, 否则两个 /n 导致界面异常
                                        focusBlock(previousElement, undefined, false);
                                        event.preventDefault();
                                        event.stopPropagation();
                                        return;
                                    }
                                }
                            }
                        }
                    }
                }
            } else if (selectText === "" && (event.key === "ArrowDown" || event.key === "ArrowRight") &&
                nodeElement === getLastBlock(protyle.wysiwyg.element.lastElementChild)) {
                // 末尾按向下/右箭头丢失焦点
                const lastEditElement = getContenteditableElement(nodeElement);
                // 代码块需替换最后一个 /n  https://github.com/lonelyor/SourceFlow/issues/3221
                if (lastEditElement && !lastEditElement.querySelector(".emoji") &&
                    lastEditElement.textContent.replace(/\n$/, "").length <= getSelectionOffset(lastEditElement, undefined, range).end) {
                    event.stopPropagation();
                    event.preventDefault();
                    focusByRange(range);
                }
            } else if (selectText === "" && event.key === "ArrowLeft" && nodeElement === getFirstBlock(protyle.wysiwyg.element.firstElementChild)) {
                // 页面向左箭头丢失焦点 https://github.com/lonelyor/SourceFlow/issues/2768
                const firstEditElement = getContenteditableElement(nodeElement);
                if (firstEditElement && getSelectionOffset(firstEditElement, undefined, range).start === 0) {
                    event.stopPropagation();
                    event.preventDefault();
                    focusByRange(range);
                }
            }
            if (event.key === "ArrowDown") {
                const nextElement = getNextBlock(nodeElement);
                // 末尾块/单元格统一移动到末尾 https://github.com/lonelyor/SourceFlow/issues/17116
                if (tdElement && tdStatus === "last" && nodeType === "NodeTable" && !nextElement &&
                    // 需使用 innerText 否则表格内 br 无法转换为 /n
                    nodeEditableElement?.innerText.trimRight().substr(position.start).indexOf("\n") === -1) {
                    setLastNodeRange(nodeEditableElement, range, false);
                    range.collapse(false);
                    event.stopPropagation();
                    event.preventDefault();
                    return;
                }
                if (!nextElement && !tdElement &&
                    nodeEditableElement?.innerText.trimRight().substr(position.start).indexOf("\n") === -1) {
                    setLastNodeRange(getContenteditableElement(nodeEditableElement), range, false);
                    range.collapse(false);
                    event.stopPropagation();
                    event.preventDefault();
                    return;
                }
                const foldElement = hasClosestByAttribute(range.startContainer, "fold", "1");
                if (foldElement) {
                    // 本身为折叠块
                    let nextElement = getNextBlock(foldElement) as HTMLElement;
                    if (nextElement) {
                        if (nextElement.getAttribute("fold") === "1"
                            && (nextElement.classList.contains("sb") || nextElement.classList.contains("bq"))) {
                            // https://github.com/lonelyor/SourceFlow/issues/3913
                        } else {
                            nextElement = getFirstBlock(nextElement) as HTMLElement;
                        }
                        focusBlock(nextElement);
                        scrollCenter(protyle, nextElement);
                    }
                    event.stopPropagation();
                    event.preventDefault();
                } else if (nodeEditableElement?.innerText.substr(position.end).indexOf("\n") === -1 || position.end >= nodeEditableElement.innerText.trimEnd().length) {
                    // 需使用 innerText，否则 td 中的 br 无法转换为 \n; position.end 不能加1，否则倒数第二行行末无法下移
                    range.collapse(false);
                    if (nextElement &&
                        (nextElement.getAttribute("fold") === "1" || nextElement.classList.contains("code-block")) &&
                        nodeEditableElement.getBoundingClientRect().bottom - getSelectionPosition(nodeElement, range).top < 40) {
                        focusBlock(nextElement);
                        scrollCenter(protyle, nextElement);
                        event.stopPropagation();
                        event.preventDefault();
                    }
                }
            }
            if (selectText === "" && event.key === "ArrowLeft" && position.start === 1 &&
                range.startContainer.textContent === Constants.ZWSP) {
                range.setStart(range.startContainer, 0);
                range.collapse(true);
            }
            if (selectText === "" && event.key === "ArrowRight" && position.start === 0 &&
                range.startContainer.textContent === Constants.ZWSP) {
                range.setStart(range.startContainer, 1);
                range.collapse(true);
            }
            return;
        }

        // 删除，不可使用 isNotCtrl(event)，否则软删除回导致 https://github.com/lonelyor/SourceFlow/issues/5607
        // 不可使用 !event.shiftKey，否则
        if ((!event.altKey && (event.key === "Backspace" || event.key === "Delete")) ||
            matchHotKey("⌃D", event)) {
            if (protyle.wysiwyg.element.querySelector(".protyle-wysiwyg--select")) {
                removeBlock(protyle, nodeElement, range, event.key === "Backspace" ? "Backspace" : "Delete");
                event.stopPropagation();
                event.preventDefault();
                return;
            }
            // https://github.com/lonelyor/SourceFlow/issues/6796
            if (selectText === "" && event.key === "Backspace" &&
                range.startOffset === range.startContainer.textContent.length &&
                range.startContainer.textContent.endsWith("\n" + Constants.ZWSP)) {
                range.setStart(range.startContainer, range.startOffset - 1);
                range.collapse(true);
                event.stopPropagation();
                event.preventDefault();
                return;
            }
            const previousSibling = hasPreviousSibling(range.startContainer) as HTMLElement;
            // https://github.com/lonelyor/SourceFlow/issues/5547
            if (range.startOffset === 1 && range.startContainer.textContent === Constants.ZWSP &&
                previousSibling && previousSibling.nodeType !== 3 &&
                event.key === "Backspace" // https://github.com/lonelyor/SourceFlow/issues/6786
            ) {
                if (previousSibling.classList.contains("img")) {
                    previousSibling.classList.add("img--select");
                } else if (previousSibling.getAttribute("data-type")?.indexOf("inline-math") > -1) {
                    // 数学公式相邻中有 zwsp,无法删除
                    previousSibling.after(document.createElement("wbr"));
                    const oldHTML = nodeElement.outerHTML;
                    range.startContainer.textContent = "";
                    previousSibling.remove();
                    updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
                    focusByWbr(nodeElement, range);
                    event.stopPropagation();
                    event.preventDefault();
                    return;
                }
            }
            const editElement = getContenteditableElement(nodeElement) as HTMLElement;
            const imgSelectElement = protyle.wysiwyg.element.querySelector(".img--select");
            if (imgSelectElement) {
                imgSelectElement.classList.remove("img--select");
                if (nodeElement.contains(imgSelectElement)) {
                    removeImage(imgSelectElement, nodeElement, range, protyle);
                    event.stopPropagation();
                    event.preventDefault();
                    return;
                }
            } else if (selectText === "") {
                if (nodeElement.classList.contains("table") && nodeElement.querySelector(".table__select").clientHeight > 0) {
                    clearTableCell(protyle, nodeElement);
                    event.stopPropagation();
                    event.preventDefault();
                    return;
                }
                if (!editElement) {
                    nodeElement.classList.add("protyle-wysiwyg--select");
                    removeBlock(protyle, nodeElement, range, event.key === "Backspace" ? "Backspace" : "Delete");
                    event.stopPropagation();
                    event.preventDefault();
                    return;
                }
                const position = getSelectionOffset(editElement, protyle.wysiwyg.element, range);
                if (event.key === "Delete" || matchHotKey("⌃D", event)) {
                    if (range.startOffset === 0 && range.startContainer.textContent.length === 1) {
                        // 图片后为空格，在空格后删除 https://github.com/lonelyor/SourceFlow/issues/13949
                        const rangePreviousElement = hasPreviousSibling(range.startContainer) as HTMLElement;
                        const rangeNextElement = hasNextSibling(range.startContainer) as HTMLElement;
                        if (rangePreviousElement && rangePreviousElement.nodeType === 1 && rangePreviousElement.classList.contains("img") &&
                            rangeNextElement && rangeNextElement.nodeType === 1 && rangeNextElement.classList.contains("img")) {
                            const wbrElement = document.createElement("wbr");
                            range.insertNode(wbrElement);
                            const oldHTML = nodeElement.outerHTML;
                            wbrElement.nextSibling.textContent = Constants.ZWSP;
                            updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
                            focusByWbr(nodeElement, range);
                            event.preventDefault();
                            return;
                        }
                        // 图片前有一个字符，在字符后删除 https://github.com/lonelyor/SourceFlow/issues/15911
                        if (position.start === 0 &&
                            range.startContainer.textContent !== Constants.ZWSP &&  // 如果为 zwsp 需前移光标
                            !rangePreviousElement &&
                            rangeNextElement && rangeNextElement.nodeType === 1 && rangeNextElement.classList.contains("img")) {
                            const wbrElement = document.createElement("wbr");
                            range.insertNode(wbrElement);
                            const oldHTML = nodeElement.outerHTML;
                            wbrElement.nextSibling.textContent = Constants.ZWSP;
                            updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
                            focusByWbr(nodeElement, range);
                            event.preventDefault();
                            return;
                        }
                    }
                    // 需使用 innerText，否则 br 无法转换为 /n https://github.com/lonelyor/SourceFlow/issues/12066
                    // 段末反向删除 https://github.com/lonelyor/SourceFlow/issues/274
                    if (isEndOfBlock(range) || editElement.textContent.substring(position.start) === "\n") {
                        const cloneRange = range.cloneRange();
                        const nextElement = getNextBlock(getTopAloneElement(nodeElement));
                        if (nextElement) {
                            const nextRange = focusBlock(nextElement);
                            if (nextRange) {
                                const nextBlockElement = hasClosestBlock(nextRange.startContainer);
                                if (nextBlockElement &&
                                    (!nextBlockElement.classList.contains("code-block") ||
                                        (nextBlockElement.classList.contains("code-block") &&
                                            (getContenteditableElement(nextBlockElement).textContent == "\n") || nextBlockElement.parentElement.classList.contains("li")))
                                ) {
                                    // 反向删除合并为一个块时，光标应保持在尾部 https://github.com/lonelyor/SourceFlow/issues/14290#issuecomment-2849810529
                                    cloneRange.insertNode(document.createElement("wbr"));
                                    removeBlock(protyle, nextBlockElement, nextRange, "Delete");
                                }
                            }
                            event.stopPropagation();
                            event.preventDefault();
                            return;
                        }
                    } else if (position.end === editElement.innerText.length - 1 && nodeType === "NodeCodeBlock") {
                        event.stopPropagation();
                        event.preventDefault();
                        return;
                    } else {
                        // 图片前 Delete 无效 https://github.com/lonelyor/SourceFlow/issues/11209
                        let nextSibling = hasNextSibling(range.startContainer) as Element;
                        if (nextSibling) {
                            if (nextSibling.nodeType === 3 && nextSibling.textContent === Constants.ZWSP) {
                                if (!nextSibling.nextSibling) {
                                    // https://github.com/lonelyor/SourceFlow/issues/13524
                                    const nextBlockElement = getNextBlock(nodeElement);
                                    if (nextBlockElement) {
                                        removeBlock(protyle, nextBlockElement, range, "remove");
                                    }
                                    event.stopPropagation();
                                    event.preventDefault();
                                    return;
                                }
                                nextSibling = nextSibling.nextSibling as Element;
                            }

                            if (nextSibling.nodeType === 1 && nextSibling.classList.contains("img")) {
                                // 光标需在图片前 https://github.com/lonelyor/SourceFlow/issues/12452
                                const textPosition = getSelectionOffset(range.startContainer, protyle.wysiwyg.element, range);
                                if (textPosition.start === range.startContainer.textContent.length ||
                                    (textPosition.start === 0 && range.startContainer.textContent === Constants.ZWSP)) {
                                    removeImage(nextSibling as Element, nodeElement, range, protyle);
                                    event.stopPropagation();
                                    event.preventDefault();
                                    return;
                                }
                            }
                        }
                    }
                } else {
                    const currentNode = range.startContainer.childNodes[range.startOffset - 1] as HTMLElement;
                    if (position.start === 0 && (
                        range.startOffset === 0 ||
                        (currentNode && currentNode.nodeType === 3 && !hasPreviousSibling(currentNode) &&
                            // 需使用 textContent，文本元素没有 innerText
                            currentNode.textContent === "") //
                    )) {
                        if (!nodeElement.classList.contains("code-block") ||
                            (nodeElement.classList.contains("code-block") &&
                                (editElement.textContent == "\n" || nodeElement.parentElement.classList.contains("li")))
                        ) {
                            removeBlock(protyle, nodeElement, range, "Backspace");
                        }
                        event.stopPropagation();
                        event.preventDefault();
                        return;
                    }
                    if (range.startContainer.nodeType !== 3 &&
                        nodeType === "NodeTable" &&
                        (range.startContainer as HTMLElement).children[range.startOffset - 1]?.tagName === "TABLE") {
                        nodeElement.classList.add("protyle-wysiwyg--select");
                        removeBlock(protyle, nodeElement, range, "Backspace");
                        event.stopPropagation();
                        event.preventDefault();
                        return;
                    }
                    // 图片后为 br，在 br 后删除 https://github.com/lonelyor/SourceFlow/issues/4963
                    if (currentNode && currentNode.nodeType !== 3 && currentNode.classList.contains("img")) {
                        removeImage(currentNode, nodeElement, range, protyle);
                        event.stopPropagation();
                        event.preventDefault();
                        return;
                    }
                    const rangeNextElement = hasNextSibling(range.startContainer) as HTMLElement;
                    // \n1`2` 1后按 Backspace 光标错误 https://github.com/lonelyor/SourceFlow/issues/15424
                    if (rangeNextElement && rangeNextElement.nodeType === 1 &&
                        ["code", "tag", "kbd"].includes(rangeNextElement.dataset.type)) {
                        if (position.start === 1 || range.startContainer.textContent.slice(-2, -1) === "\n") {
                            range.insertNode(document.createTextNode(Constants.ZWSP));
                            range.collapse(true);
                        }
                    }
                    if (range.startOffset === 1 && range.startContainer.textContent.length === 1) {
                        // 图片后为空格，在空格后删除 https://github.com/lonelyor/SourceFlow/issues/13949
                        const rangePreviousElement = hasPreviousSibling(range.startContainer) as HTMLElement;
                        if (rangePreviousElement && rangePreviousElement.nodeType === 1 && rangePreviousElement.classList.contains("img") &&
                            rangeNextElement && rangeNextElement.nodeType === 1 && rangeNextElement.classList.contains("img")) {
                            const wbrElement = document.createElement("wbr");
                            range.insertNode(wbrElement);
                            const oldHTML = nodeElement.outerHTML;
                            wbrElement.previousSibling.textContent = Constants.ZWSP;
                            updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
                            focusByWbr(nodeElement, range);
                            event.preventDefault();
                            return;
                        }
                        // 图片前有一个字符，在字符后删除
                        if (position.start === 1 &&
                            range.startContainer.textContent !== Constants.ZWSP &&  // 如果为 zwsp 需前移光标
                            !rangePreviousElement &&
                            rangeNextElement && rangeNextElement.nodeType === 1 && rangeNextElement.classList.contains("img")) {
                            const wbrElement = document.createElement("wbr");
                            range.insertNode(wbrElement);
                            const oldHTML = nodeElement.outerHTML;
                            wbrElement.previousSibling.textContent = Constants.ZWSP;
                            updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
                            focusByWbr(nodeElement, range);
                            event.preventDefault();
                            return;
                        }
                    }
                    // 代码块中空行 ⌘+Del 异常
                    if (nodeElement.classList.contains("code-block") && isOnlyMeta(event) &&
                        range.startContainer.nodeType === 3 && range.startContainer.textContent.substring(range.startOffset - 1, range.startOffset) === "\n") {
                        event.stopPropagation();
                        event.preventDefault();
                        return;
                    }
                    // https://github.com/lonelyor/SourceFlow/issues/9690
                    const inlineElement = hasClosestByTag(range.startContainer, "SPAN");
                    if (position.start === 2 && inlineElement &&
                        getSelectionOffset(inlineElement, protyle.wysiwyg.element, range).start === 1 &&
                        inlineElement.innerText.startsWith(Constants.ZWSP) &&
                        // 7.1 ctrl+g 后删除 https://github.com/lonelyor/SourceFlow/issues/14290#issuecomment-2867478746
                        inlineElement.innerText !== Constants.ZWSP &&
                        // 需排除行内代码前有一个字符的情况
                        editElement.innerText.startsWith(Constants.ZWSP)) {
                        focusBlock(nodeElement);
                        event.stopPropagation();
                        event.preventDefault();
                        return;
                    }
                    if (position.start === 1 && !inlineElement && editElement.innerText.startsWith(Constants.ZWSP) &&
                        // https://github.com/lonelyor/SourceFlow/issues/12149
                        editElement.innerText.length > 1) {
                        setFirstNodeRange(editElement, range);
                        removeBlock(protyle, nodeElement, range, "Backspace");
                        event.stopPropagation();
                        event.preventDefault();
                        return;
                    }
                }
            } else if (nodeElement.classList.contains("code-block") && editElement.textContent === "\n") {
                // 空代码块全选删除异常 https://github.com/lonelyor/SourceFlow/issues/6706
                range.collapse(true);
                event.stopPropagation();
                event.preventDefault();
                return;
            } else if (selectText !== "") {
                const position = getSelectionOffset(editElement, protyle.wysiwyg.element, range);
                if (range.startOffset === 0 && range.endContainer.textContent.length === range.endOffset) {
                    // 图片后为空格，在空格后删除 https://github.com/lonelyor/SourceFlow/issues/13949
                    // 图片前有一个字符，在字符后删除 https://github.com/lonelyor/SourceFlow/issues/15911
                    const rangePreviousElement = hasPreviousSibling(range.startContainer) as HTMLElement;
                    const rangeNextElement = hasNextSibling(range.endContainer) as HTMLElement;
                    if ((rangePreviousElement && rangePreviousElement.nodeType === 1 && rangePreviousElement.classList.contains("img") &&
                            rangeNextElement && rangeNextElement.nodeType === 1 && rangeNextElement.classList.contains("img")) ||
                        (position.start === 0 &&
                            range.startContainer.textContent !== Constants.ZWSP &&  // 如果为 zwsp 需前移光标
                            !rangePreviousElement &&
                            rangeNextElement && rangeNextElement.nodeType === 1 && rangeNextElement.classList.contains("img"))) {
                        range.insertNode(document.createElement("wbr"));
                        const oldHTML = nodeElement.outerHTML;
                        range.deleteContents();
                        range.insertNode(document.createTextNode(Constants.ZWSP));
                        range.insertNode(document.createElement("wbr"));
                        updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
                        focusByWbr(nodeElement, range);
                        event.preventDefault();
                        return;
                    }
                }
            }
        }

        // 软换行
        if (matchHotKey("⇧↩", event) && selectText === "" && softEnter(range, nodeElement, protyle)) {
            event.stopPropagation();
            event.preventDefault();
            return;
        }

        // 代码块语言选择 https://github.com/lonelyor/SourceFlow/issues/14126
        if (matchHotKey("⌥↩", event) && selectText === "") {
            const selectElements = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
            if (selectElements.length === 0) {
                selectElements.push(nodeElement);
            }
            if (selectElements.length > 0 && !isIncludesHotKey("⌥↩")) {
                const languageElements: HTMLElement[] = [];
                const calloutElements: HTMLElement[] = [];
                selectElements.forEach(item => {
                    if (item.classList.contains("code-block")) {
                        languageElements.push(item.querySelector(".protyle-action__language"));
                    } else {
                        const calloutElement = hasClosestByClassName(item, "callout");
                        if (calloutElement) {
                            calloutElements.push(calloutElement);
                        }
                    }
                });
                if (languageElements.length > 0) {
                    protyle.toolbar.showCodeLanguage(protyle, languageElements);
                } else if (addSubList(protyle, nodeElement, range)) {
                    // 函数内部已处理
                } else if (calloutElements.length > 0) {
                    updateCalloutType(calloutElements, protyle);
                }
                event.stopPropagation();
                event.preventDefault();
                return;
            }
        }

        // 回车
        if (matchHotKey("↩", event) ||
            (matchHotKey("⇧↩", event) && nodeType === "NodeHeading")) {
            enter(nodeElement, range, protyle);
            event.stopPropagation();
            event.preventDefault();
            return;
        }

        if (matchHotKey("⌘A", event)) {
            event.preventDefault();
            selectAll(protyle, nodeElement, range);
            return true;
        }

        if (matchHotKey(window.sourceflow.config.keymap.editor.general.undo.custom, event)) {
            protyle.undo.undo(protyle);
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (matchHotKey(window.sourceflow.config.keymap.editor.general.redo.custom, event)) {
            protyle.undo.redo(protyle);
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        /// #if !MOBILE
        if (commonHotkey(protyle, event, nodeElement)) {
            return true;
        }
        /// #endif
};
