import {enableLuteMarkdownSyntax, getTextStar, paste, restoreLuteMarkdownSyntax} from "../../util/paste";
import {
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByClassName,
    isInEmbedBlock,
} from "../../util/hasClosest";
import {
    focusBlock,
    focusByRange,
    focusByWbr,
    focusSideBlock,
    getEditorRange,
    getSelectionOffset,
    setFirstNodeRange,
    setInsertWbrHTML,
    setLastNodeRange,
} from "../../util/selection";
import {Constants} from "../../../constants";
import {isMobile} from "../../../util/functions";
import {previewDocImage} from "../../preview/image";
import {
    contentMenu,
    enterBack,
    fileAnnotationRefMenu,
    imgMenu,
    inlineMathMenu,
    linkMenu,
    refMenu,
    setFold,
    tagMenu,
    zoomOut
} from "../../../menus/protyle";
import * as dayjs from "dayjs";
import {dropEvent} from "../../util/editorCommonEvent";
import {input} from "../input";
import {
    getContenteditableElement,
    getNextBlock,
    getTopAloneElement,
    hasNextSibling,
    hasPreviousSibling,
    isEndOfBlock,
    isNotEditBlock
} from "../getBlock";
import {transaction, updateTransaction} from "../transaction";
import {hideElements} from "../../ui/hideElements";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif
import {getEnableHTML, removeEmbed} from "../removeEmbed";
import {keydown} from "../keydown";
import {openMobileFileById} from "../../../mobile/editor";
import {removeBlock} from "../remove";
import {highlightRender} from "../../render/highlightRender";
import {openAttr} from "../../../menus/commonMenuItem";
import {blockRender} from "../../render/blockRender";
import {getIdFromSYProtocol, isSYProtocol} from "../../../util/pathName";
/// #if !MOBILE
import {getAllModels} from "../../../layout/getAll";
import {pushBack} from "../../../util/backForward";
import {openFileById} from "../../../editor/util";
import {openGlobalSearch} from "../../../search/util";
/// #else
import {popSearch} from "../../../mobile/menu/search";
/// #endif
import {BlockPanel} from "../../../block/Panel";
import {appendSourceFlowClipboardHTMLComment, copyPlainText, isInIOS, isMac, isOnlyMeta, readClipboard} from "../../util/compatibility";
import {MenuItem} from "../../../menus/Menu";
import {fetchPost, fetchSyncPost} from "../../../util/fetch";
import {onGet} from "../../util/onGet";
import {clearTableCell, isIncludeCell, setTableAlign, updateTableTitle} from "../../util/table";
import {countBlockWord, countSelectWord} from "../../../layout/status";
import {showMessage} from "../../../dialog/message";
import {getBacklinkHeadingMore, loadBreadcrumb} from "../renderBacklink";
import {removeSearchMark} from "../../toolbar/util";
import {activeBlur} from "../../../mobile/util/keyboardToolbar";
import {commonClick} from "../commonClick";
import {avClick, avContextmenu, updateAVName} from "../../render/av/action";
import {selectRow, stickyRow} from "../../render/av/row";
import {showColMenu} from "../../render/av/col";
import {openViewMenu} from "../../render/av/view";
import {checkFold} from "../../../util/noRelyPCFunction";
import {
    addDragFill,
    dragFillCellsValue,
    genCellValueByElement,
    getCellText,
    getPositionByCellElement,
    getTypeByCellElement,
    updateCellsValue
} from "../../render/av/cell";
import {openEmojiPanel, unicode2Emoji} from "../../../emoji";
import {openLink} from "../../../editor/openLink";
import {mathRender} from "../../render/mathRender";
import {editAssetItem} from "../../render/av/asset";
import {img3115} from "../../../boot/compatibleVersion";
import {globalClickHideMenu} from "../../../boot/globalEvent/click";
import {hideTooltip} from "../../../dialog/tooltip";
import {openGalleryItemMenu} from "../../render/av/gallery/util";
import {clearSelect} from "../../util/clear";
import {chartRender} from "../../render/chartRender";
import {reloadProtyle} from "../../util/reload";
import {updateCalloutType} from "../callout";
import {nbsp2space, removeZWJ} from "../../util/normalizeText";
import {getAVViewAttr, getFullWidthAttr} from "../../../util/attrCompat";

import {emojiToMd} from "../helpers";
import type {WYSIWYGEventContext} from "../shared";

export const registerMouseDownEvent = (wysiwyg: WYSIWYGEventContext, protyle: IProtyle) => {
        wysiwyg.element.addEventListener("mousedown", (event: MouseEvent) => {
            protyle.wysiwyg.element.classList.remove("protyle-wysiwyg--hiderange");
            if (event.button === 2) {
                // 右键
                return;
            }
            const documentSelf = document;
            documentSelf.onmouseup = null;
            let target = event.target as HTMLElement;
            let nodeElement = hasClosestBlock(target) as HTMLElement;
            const hasSelectClassElement = wysiwyg.element.querySelector(".protyle-wysiwyg--select");
            const galleryItemElement = hasClosestByClassName(target, "av__gallery-item");
            if (event.shiftKey) {
                let startElement;
                let endElement = nodeElement;
                // Electron 更新后 shift 向上点击获取的 range 不为上一个位置的 https://github.com/lonelyor/SourceFlow/issues/9334
                if (getSelection().rangeCount > 0) {
                    startElement = hasClosestBlock(getSelection().getRangeAt(0).startContainer) as HTMLElement;
                }
                // shift 多选
                if (!hasSelectClassElement && galleryItemElement) {
                    galleryItemElement.classList.add("av__gallery-item--select");
                    let sideElement = galleryItemElement.previousElementSibling;
                    let previousList: Element[] = [];
                    while (sideElement) {
                        if (sideElement.classList.contains("av__gallery-item--select")) {
                            break;
                        } else {
                            previousList.push(sideElement);
                        }
                        sideElement = sideElement.previousElementSibling;
                        if (!sideElement) {
                            previousList = [];
                            break;
                        }
                    }
                    sideElement = galleryItemElement.nextElementSibling;
                    let nextList: Element[] = [];
                    while (sideElement) {
                        if (sideElement.classList.contains("av__gallery-item--select")) {
                            break;
                        } else {
                            nextList.push(sideElement);
                        }
                        sideElement = sideElement.nextElementSibling as HTMLElement;
                        if (!sideElement || sideElement.classList.contains("av__gallery-add")) {
                            nextList = [];
                            break;
                        }
                    }
                    previousList.concat(nextList).forEach(item => {
                        item.classList.add("av__gallery-item--select");
                    });
                    event.preventDefault();
                } else if (startElement && endElement && startElement !== endElement) {
                    let toDown = true;
                    const startRect = startElement.getBoundingClientRect();
                    const endRect = endElement.getBoundingClientRect();
                    let startTop = startRect.top;
                    let endTop = endRect.top;
                    if (startTop === endTop) {
                        // 横排
                        startTop = startRect.left;
                        endTop = endRect.left;
                    }
                    if (startTop > endTop) {
                        const tempElement = endElement;
                        endElement = startElement;
                        startElement = tempElement;
                        const tempTop = endTop;
                        endTop = startTop;
                        startTop = tempTop;
                        toDown = false;
                    }
                    let selectElements: Element[] = [];
                    let currentElement: HTMLElement = startElement;
                    let hasJump = false;
                    while (currentElement) {
                        if (currentElement && !currentElement.classList.contains("protyle-attr")) {
                            const currentRect = currentElement.getBoundingClientRect();
                            if (startRect.top === endRect.top ? (currentRect.left <= endTop) : (currentRect.top <= endTop)) {
                                if (hasJump) {
                                    // 父节点的下个节点在选中范围内才可使用父节点作为选中节点
                                    if (currentElement.nextElementSibling && !currentElement.nextElementSibling.classList.contains("protyle-attr")) {
                                        const currentNextRect = currentElement.nextElementSibling.getBoundingClientRect();
                                        if (startRect.top === endRect.top ?
                                            (currentNextRect.left <= endTop && currentNextRect.bottom <= endRect.bottom) :
                                            (currentNextRect.top <= endTop)) {
                                            selectElements = [currentElement];
                                            currentElement = currentElement.nextElementSibling as HTMLElement;
                                            hasJump = false;
                                        } else if (currentElement.parentElement.classList.contains("sb")) {
                                            currentElement = hasClosestBlock(currentElement.parentElement) as HTMLElement;
                                            hasJump = true;
                                        } else {
                                            break;
                                        }
                                    } else {
                                        currentElement = hasClosestBlock(currentElement.parentElement) as HTMLElement;
                                        hasJump = true;
                                    }
                                } else {
                                    selectElements.push(currentElement);
                                    currentElement = currentElement.nextElementSibling as HTMLElement;
                                }
                            } else if (currentElement.parentElement.classList.contains("sb")) {
                                // 跳出超级块横向排版中的未选中元素
                                currentElement = hasClosestBlock(currentElement.parentElement) as HTMLElement;
                                hasJump = true;
                            } else {
                                break;
                            }
                        } else {
                            currentElement = hasClosestBlock(currentElement.parentElement) as HTMLElement;
                            hasJump = true;
                        }
                    }
                    if (selectElements.length === 1 && !selectElements[0].classList.contains("list") &&
                        !selectElements[0].classList.contains("bq") && !selectElements[0].classList.contains("callout") &&
                        !selectElements[0].classList.contains("sb")) {
                        // 单个 p 不选中
                    } else {
                        const ids: string[] = [];
                        if (!hasSelectClassElement && protyle.scroll && !protyle.scroll.element.classList.contains("fn__none") && !protyle.scroll.keepLazyLoad &&
                            (startElement.getBoundingClientRect().top < -protyle.contentElement.clientHeight * 2 || endElement.getBoundingClientRect().bottom > protyle.contentElement.clientHeight * 2)) {
                            showMessage(window.sourceflow.languages.crossKeepLazyLoad);
                        }
                        selectElements.forEach(item => {
                            if (!hasClosestByClassName(item, "protyle-wysiwyg--select")) {
                                item.classList.add("protyle-wysiwyg--select");
                                ids.push(item.getAttribute("data-node-id"));
                                // 清除选中的子块
                                item.querySelectorAll(".protyle-wysiwyg--select").forEach(subItem => {
                                    subItem.classList.remove("protyle-wysiwyg--select");
                                });
                            }
                        });
                        countBlockWord(ids);
                        if (toDown) {
                            focusBlock(selectElements[selectElements.length - 1], protyle.wysiwyg.element, false);
                        } else {
                            focusBlock(selectElements[0], protyle.wysiwyg.element, false);
                        }
                    }
                    event.preventDefault();
                }
                return;
            }
            if (isOnlyMeta(event) && !event.shiftKey && !event.altKey) {
                let ctrlElement = nodeElement;
                const rowElement = hasClosestByClassName(target, "av__row");
                if (!hasSelectClassElement && (galleryItemElement || (rowElement && !rowElement.classList.contains("av__row--header")))) {
                    if (galleryItemElement) {
                        galleryItemElement.classList.toggle("av__gallery-item--select");
                    } else if (rowElement) {
                        selectRow(rowElement.querySelector(".av__firstcol"), "toggle");
                    }
                } else if (ctrlElement) {
                    clearSelect(["row", "galleryItem"], wysiwyg.element);
                    const embedBlockElement = isInEmbedBlock(ctrlElement);
                    if (embedBlockElement) {
                        ctrlElement = embedBlockElement;
                    }
                    ctrlElement = getTopAloneElement(ctrlElement) as HTMLElement;
                    if (ctrlElement.classList.contains("protyle-wysiwyg--select")) {
                        ctrlElement.classList.remove("protyle-wysiwyg--select");
                        ctrlElement.removeAttribute("select-start");
                        ctrlElement.removeAttribute("select-end");
                    } else {
                        ctrlElement.classList.add("protyle-wysiwyg--select");
                    }
                    ctrlElement.querySelectorAll(".protyle-wysiwyg--select").forEach(item => {
                        item.classList.remove("protyle-wysiwyg--select");
                        item.removeAttribute("select-start");
                        item.removeAttribute("select-end");
                    });
                    const ctrlParentElement = hasClosestByClassName(ctrlElement.parentElement, "protyle-wysiwyg--select");
                    if (ctrlParentElement) {
                        ctrlParentElement.classList.remove("protyle-wysiwyg--select");
                        ctrlParentElement.removeAttribute("select-start");
                        ctrlParentElement.removeAttribute("select-end");
                    }
                    const ids: string[] = [];
                    protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select").forEach(item => {
                        ids.push(item.getAttribute("data-node-id"));
                    });
                    countBlockWord(ids);
                }
                return;
            }

            // https://github.com/lonelyor/SourceFlow/issues/15100
            if (galleryItemElement && !hasClosestByAttribute(target, "data-type", "av-gallery-more")) {
                documentSelf.onmouseup = () => {
                    documentSelf.onmousemove = null;
                    documentSelf.onmouseup = null;
                    documentSelf.ondragstart = null;
                    documentSelf.onselectstart = null;
                    documentSelf.onselect = null;
                    clearSelect(["galleryItem"], protyle.wysiwyg.element);
                    return false;
                };
                return;
            }
            const avDragFillElement = hasClosestByClassName(target, "av__drag-fill");
            // https://github.com/lonelyor/SourceFlow/issues/3026
            hideElements(["select"], protyle);
            if (hasClosestByAttribute(target, "data-type", "av-gallery-more")) {
                clearSelect(["img", "row", "cell"], protyle.wysiwyg.element);
            } else if (!hasClosestByClassName(target, "av__firstcol") && !avDragFillElement) {
                clearSelect(["img", "av"], protyle.wysiwyg.element);
            }

            if ((hasClosestByClassName(target, "protyle-action") && !hasClosestByClassName(target, "code-block")) ||
                (hasClosestByClassName(target, "av__cell--header") && !hasClosestByClassName(target, "av__widthdrag"))) {
                return;
            }
            const wysiwygRect = protyle.wysiwyg.element.getBoundingClientRect();
            const wysiwygStyle = window.getComputedStyle(protyle.wysiwyg.element);
            const mostLeft = wysiwygRect.left + (parseInt(wysiwygStyle.paddingLeft) || 24) + 1;
            const mostRight = wysiwygRect.right - (parseInt(wysiwygStyle.paddingRight) || 16) - 2;

            const protyleRect = protyle.element.getBoundingClientRect();
            const mostBottom = protyleRect.bottom;
            const y = event.clientY;
            const contentRect = protyle.contentElement.getBoundingClientRect();
            // av col resize
            if (!protyle.disabled && target.classList.contains("av__widthdrag")) {
                if (!nodeElement) {
                    return;
                }
                const avId = nodeElement.getAttribute("data-av-id");
                const blockID = nodeElement.dataset.nodeId;
                const dragElement = target.parentElement;
                const oldWidth = dragElement.clientWidth;
                const dragColId = dragElement.getAttribute("data-col-id");
                let newWidth: number;
                const scrollElement = nodeElement.querySelector(".av__scroll");
                documentSelf.onmousemove = (moveEvent: MouseEvent) => {
                    newWidth = Math.max(oldWidth + (moveEvent.clientX - event.clientX), 25);
                    scrollElement.querySelectorAll(".av__row, .av__row--footer").forEach(item => {
                        (item.querySelector(`[data-col-id="${dragColId}"]`) as HTMLElement).style.width = newWidth + "px";
                    });
                    stickyRow(nodeElement, contentRect, "bottom");
                };

                documentSelf.onmouseup = () => {
                    documentSelf.onmousemove = null;
                    documentSelf.onmouseup = null;
                    documentSelf.ondragstart = null;
                    documentSelf.onselectstart = null;
                    documentSelf.onselect = null;
                    if (!newWidth || newWidth === oldWidth) {
                        return;
                    }
                    const viewID = getAVViewAttr(nodeElement);
                    transaction(protyle, [{
                        action: "setAttrViewColWidth",
                        id: dragColId,
                        avID: avId,
                        data: newWidth + "px",
                        blockID,
                        viewID // https://github.com/lonelyor/SourceFlow/issues/11019
                    }], [{
                        action: "setAttrViewColWidth",
                        id: dragColId,
                        avID: avId,
                        data: oldWidth + "px",
                        blockID,
                        viewID
                    }]);
                };
                wysiwyg.preventClick = true;
                event.preventDefault();
                return;
            }
            // av drag fill
            if (!protyle.disabled && avDragFillElement) {
                if (!nodeElement) {
                    return;
                }
                const bodyElement = hasClosestByClassName(avDragFillElement, "av__body") as HTMLElement;
                if (!bodyElement) {
                    return;
                }
                const originData: { [key: string]: IAVCellValue[] } = {};
                let lastOriginCellElement: HTMLElement;
                const originCellIds: string[] = [];
                bodyElement.querySelectorAll(".av__cell--active").forEach((item: HTMLElement) => {
                    const rowElement = hasClosestByClassName(item, "av__row");
                    if (rowElement) {
                        if (!originData[rowElement.dataset.id]) {
                            originData[rowElement.dataset.id] = [];
                        }
                        originData[rowElement.dataset.id].push(genCellValueByElement(getTypeByCellElement(item), item));
                        lastOriginCellElement = item;
                        originCellIds.push(item.dataset.id);
                    }
                });
                const dragFillCellIndex = getPositionByCellElement(lastOriginCellElement);
                const firstCellIndex = getPositionByCellElement(bodyElement.querySelector(".av__cell--active"));
                let moveAVCellElement: HTMLElement;
                let lastCellElement: HTMLElement;
                documentSelf.onmousemove = (moveEvent: MouseEvent) => {
                    const tempCellElement = hasClosestByClassName(moveEvent.target as HTMLElement, "av__cell") as HTMLElement;
                    if (moveAVCellElement && tempCellElement && (tempCellElement === moveAVCellElement)) {
                        return;
                    }
                    moveAVCellElement = tempCellElement;
                    if (moveAVCellElement && moveAVCellElement.dataset.id) {
                        const newIndex = getPositionByCellElement(moveAVCellElement);
                        bodyElement.querySelectorAll(".av__cell--active").forEach((item: HTMLElement) => {
                            if (!originCellIds.includes(item.dataset.id)) {
                                item.classList.remove("av__cell--active");
                            }
                        });
                        if (newIndex.celIndex !== dragFillCellIndex.celIndex) {
                            lastCellElement = undefined;
                            return;
                        }
                        bodyElement.querySelectorAll(".av__row").forEach((rowElement: HTMLElement, index: number) => {
                            if ((newIndex.rowIndex < firstCellIndex.rowIndex && index >= newIndex.rowIndex && index < firstCellIndex.rowIndex) ||
                                (newIndex.rowIndex > dragFillCellIndex.rowIndex && index <= newIndex.rowIndex && index > dragFillCellIndex.rowIndex)) {
                                rowElement.querySelectorAll(".av__cell").forEach((cellElement: HTMLElement, cellIndex: number) => {
                                    if (cellIndex >= firstCellIndex.celIndex && cellIndex <= newIndex.celIndex) {
                                        cellElement.classList.add("av__cell--active");
                                        lastCellElement = cellElement;
                                    }
                                });
                            }
                        });
                    }
                };

                documentSelf.onmouseup = () => {
                    documentSelf.onmousemove = null;
                    documentSelf.onmouseup = null;
                    documentSelf.ondragstart = null;
                    documentSelf.onselectstart = null;
                    documentSelf.onselect = null;
                    if (lastCellElement) {
                        dragFillCellsValue(protyle, nodeElement, originData, originCellIds, lastOriginCellElement);
                        const allActiveCellsElement = bodyElement.querySelectorAll(".av__cell--active");
                        addDragFill(allActiveCellsElement[allActiveCellsElement.length - 1]);
                    }
                    return false;
                };
                wysiwyg.preventClick = true;
                return false;
            }
            // av cell select
            const avCellElement = hasClosestByClassName(target, "av__cell");
            if (!protyle.disabled && avCellElement && avCellElement.dataset.id && !isInEmbedBlock(avCellElement)) {
                if (!nodeElement || nodeElement.dataset.avType !== "table") {
                    return;
                }
                nodeElement.querySelectorAll(".av__cell--select").forEach(item => {
                    item.classList.remove("av__cell--select");
                });
                nodeElement.querySelectorAll(".av__drag-fill").forEach(item => {
                    item.remove();
                });
                avCellElement.classList.add("av__cell--select");
                const originIndex = getPositionByCellElement(avCellElement);
                let moveSelectCellElement: HTMLElement;
                let lastCellElement: HTMLElement;
                const nodeRect = nodeElement.getBoundingClientRect();
                const scrollElement = nodeElement.querySelector(".av__scroll");
                const bodyElement = hasClosestByClassName(avCellElement, "av__body") as HTMLElement;
                documentSelf.onmousemove = (moveEvent: MouseEvent) => {
                    const tempCellElement = hasClosestByClassName(moveEvent.target as HTMLElement, "av__cell") as HTMLElement;
                    if (scrollElement.scrollWidth > scrollElement.clientWidth + 2) {
                        if (moveEvent.clientX > nodeRect.right - 10) {
                            scrollElement.scrollLeft += 10;
                        } else if (moveEvent.clientX < nodeRect.left + 34) {
                            scrollElement.scrollLeft -= 10;
                        }
                        if (moveEvent.clientY < contentRect.top + 48) {
                            protyle.contentElement.scrollTop -= 5;
                        } else if (moveEvent.clientY > contentRect.bottom - 48) {
                            protyle.contentElement.scrollTop += 5;
                        }
                    }
                    if (bodyElement !== hasClosestByClassName(tempCellElement, "av__body") ||
                        (moveSelectCellElement && tempCellElement && tempCellElement === moveSelectCellElement)) {
                        return;
                    }
                    if (tempCellElement && tempCellElement.dataset.id && (event.clientX !== moveEvent.clientX || event.clientY !== moveEvent.clientY)) {
                        const newIndex = getPositionByCellElement(tempCellElement);
                        nodeElement.querySelectorAll(".av__cell--active").forEach((item: HTMLElement) => {
                            item.classList.remove("av__cell--active");
                        });
                        bodyElement.querySelectorAll(".av__row").forEach((rowElement: HTMLElement, index: number) => {
                            if (index >= Math.min(originIndex.rowIndex, newIndex.rowIndex) && index <= Math.max(originIndex.rowIndex, newIndex.rowIndex)) {
                                rowElement.querySelectorAll(".av__cell").forEach((cellElement: HTMLElement, cellIndex: number) => {
                                    if (cellIndex >= Math.min(originIndex.celIndex, newIndex.celIndex) && cellIndex <= Math.max(originIndex.celIndex, newIndex.celIndex)) {
                                        cellElement.classList.add("av__cell--active");
                                        lastCellElement = cellElement;
                                    }
                                });
                            }
                        });
                        moveSelectCellElement = tempCellElement;
                    }
                };

                documentSelf.onmouseup = () => {
                    documentSelf.onmousemove = null;
                    documentSelf.onmouseup = null;
                    documentSelf.ondragstart = null;
                    documentSelf.onselectstart = null;
                    documentSelf.onselect = null;
                    if (lastCellElement) {
                        selectRow(nodeElement.querySelector(".av__firstcol"), "unselectAll");
                        focusBlock(nodeElement);
                        addDragFill(lastCellElement);
                        wysiwyg.preventClick = true;
                    }
                    return false;
                };
                return false;
            }
            // 图片、iframe、video、挂件缩放
            if (!protyle.disabled && target.classList.contains("protyle-action__drag")) {
                if (!nodeElement) {
                    return;
                }
                let isCenter = true;
                if ("NodeVideo" === nodeElement.dataset.type) {
                    nodeElement.classList.add("iframe--drag");
                    if (["left", "right", ""].includes(nodeElement.style.textAlign)) {
                        isCenter = false;
                    }
                } else if (["NodeIFrame", "NodeWidget"].includes(nodeElement.dataset.type)) {
                    nodeElement.classList.add("iframe--drag");
                    if (!nodeElement.style.margin) {
                        isCenter = false;
                    }
                } else if (target.parentElement.parentElement.getAttribute("data-type") === "img") {
                    target.parentElement.parentElement.classList.add("img--drag");
                }

                const id = nodeElement.getAttribute("data-node-id");
                const html = nodeElement.outerHTML;
                const x = event.clientX;
                const dragElement = target.previousElementSibling as HTMLElement;
                const dragWidth = dragElement.clientWidth;
                const dragHeight = dragElement.clientHeight;

                const imgElement = dragElement.parentElement.parentElement;
                if (dragElement.tagName === "IMG") {
                    img3115(imgElement);
                }
                // 3.4.1 以前历史数据兼容
                if (dragElement.tagName === "IFRAME") {
                    dragElement.style.height = "";
                    dragElement.style.width = "";
                }
                documentSelf.onmousemove = (moveEvent: MouseEvent) => {
                    if (dragElement.tagName === "IMG") {
                        dragElement.style.height = "";
                    }
                    if (moveEvent.clientX > x - dragWidth + 8 && moveEvent.clientX < mostRight) {
                        const multiple = ((dragElement.tagName === "IMG" && !imgElement.style.minWidth && nodeElement.style.textAlign !== "center") || !isCenter) ? 1 : 2;
                        if (dragElement.tagName === "IMG") {
                            dragElement.parentElement.style.width = Math.max(17, dragWidth + (moveEvent.clientX - x) * multiple) + "px";
                        } else if (dragElement.tagName === "IFRAME") {
                            nodeElement.style.width = Math.max(17, dragWidth + (moveEvent.clientX - x) * multiple) + "px";
                        } else {
                            dragElement.style.width = Math.max(17, dragWidth + (moveEvent.clientX - x) * multiple) + "px";
                        }
                    }
                    if (dragElement.tagName !== "IMG") {
                        if (moveEvent.clientY > y - dragHeight + 8 && moveEvent.clientY < mostBottom) {
                            if (dragElement.tagName === "IFRAME") {
                                nodeElement.style.height = (dragHeight + (moveEvent.clientY - y)) + "px";
                            } else {
                                dragElement.style.height = (dragHeight + (moveEvent.clientY - y)) + "px";
                            }
                        }
                    }
                };

                documentSelf.onmouseup = () => {
                    documentSelf.onmousemove = null;
                    documentSelf.onmouseup = null;
                    documentSelf.ondragstart = null;
                    documentSelf.onselectstart = null;
                    documentSelf.onselect = null;
                    if (target.classList.contains("protyle-action__drag") && nodeElement) {
                        updateTransaction(protyle, id, nodeElement.outerHTML, html);
                    }
                    nodeElement.classList.remove("iframe--drag");
                    target.parentElement.parentElement.classList.remove("img--drag");
                };
                return;
            }
            // table cell select
            let tableBlockElement: HTMLElement | false;
            const targetCellElement = hasClosestByTag(target, "TH") || hasClosestByTag(target, "TD");
            if (targetCellElement) {
                target = targetCellElement;
            }
            if (target.tagName === "TH" || target.tagName === "TD" || target.firstElementChild?.tagName === "TABLE" ||
                target.classList.contains("table__resize") || target.classList.contains("table__select")) {
                tableBlockElement = nodeElement;
                if (tableBlockElement) {
                    tableBlockElement.querySelector(".table__select").removeAttribute("style");
                    window.sourceflow.menus.menu.remove();
                    hideElements(["toolbar"], protyle);
                    if (target.classList.contains("table__select")) {
                        target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement;
                        nodeElement = hasClosestBlock(target) as HTMLElement;
                    }
                    event.stopPropagation();
                }
                // 后续拖拽操作写在多选节点中
            }
            // table col resize
            if (!protyle.disabled && target.classList.contains("table__resize")) {
                if (!nodeElement) {
                    return;
                }
                const html = nodeElement.outerHTML;
                // https://github.com/lonelyor/SourceFlow/issues/4455
                if (getSelection().rangeCount > 0) {
                    getSelection().getRangeAt(0).collapse(false);
                }
                // @ts-ignore
                nodeElement.firstElementChild.style.webkitUserModify = "read-only";
                nodeElement.style.cursor = "col-resize";
                target.removeAttribute("style");
                const id = nodeElement.getAttribute("data-node-id");
                const x = event.clientX;
                const colIndex = parseInt(target.getAttribute("data-col-index"));
                const colElement = nodeElement.querySelectorAll("table col")[colIndex] as HTMLElement;
                // 清空初始化 table 时的最小宽度
                if (colElement.style.minWidth) {
                    colElement.style.width = (nodeElement.querySelectorAll("table td, table th")[colIndex] as HTMLElement).offsetWidth + "px";
                    colElement.style.minWidth = "";
                }
                // 移除 cell 上的宽度限制 https://github.com/lonelyor/SourceFlow/issues/7795
                nodeElement.querySelectorAll("tr").forEach((trItem: HTMLTableRowElement) => {
                    trItem.cells[colIndex].style.width = "";
                });
                const oldWidth = colElement.clientWidth;
                const hasScroll = nodeElement.firstElementChild.clientWidth < nodeElement.firstElementChild.scrollWidth;
                documentSelf.onmousemove = (moveEvent: MouseEvent) => {
                    if (nodeElement.style.textAlign === "center" && !hasScroll) {
                        colElement.style.width = (oldWidth + (moveEvent.clientX - x) * 2) + "px";
                    } else {
                        colElement.style.width = (oldWidth + (moveEvent.clientX - x)) + "px";
                    }
                };

                documentSelf.onmouseup = () => {
                    // @ts-ignore
                    nodeElement.firstElementChild.style.webkitUserModify = "";
                    nodeElement.style.cursor = "";
                    documentSelf.onmousemove = null;
                    documentSelf.onmouseup = null;
                    documentSelf.ondragstart = null;
                    documentSelf.onselectstart = null;
                    documentSelf.onselect = null;
                    if (nodeElement) {
                        updateTransaction(protyle, id, nodeElement.outerHTML, html);
                    }
                };
                return;
            }

            // 多选节点
            let clentX = event.clientX;
            if (event.clientX > mostRight) {
                clentX = mostRight;
            } else if (event.clientX < mostLeft) {
                clentX = mostLeft;
            }
            const mostTop = protyleRect.top + (protyle.options.render.breadcrumb ? protyle.breadcrumb.element.parentElement.clientHeight : 0);

            let mouseElement: Element;
            let moveCellElement: HTMLElement;
            let startFirstElement: Element;
            let endLastElement: Element;
            wysiwyg.element.querySelectorAll("iframe").forEach(item => {
                item.style.pointerEvents = "none";
            });
            const needScroll = ["IMG", "VIDEO", "AUDIO"].includes(target.tagName) || target.classList.contains("img");
            documentSelf.onmousemove = (moveEvent: MouseEvent) => {
                let moveTarget: boolean | HTMLElement = moveEvent.target as HTMLElement;
                // table cell select
                if (tableBlockElement &&
                    !hasClosestByClassName(tableBlockElement, "protyle-wysiwyg__embed")) {
                    if (tableBlockElement.contains(moveTarget)) {
                        if (moveTarget.classList.contains("table__select")) {
                            moveTarget.classList.add("fn__none");
                            const pointElement = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
                            moveTarget.classList.remove("fn__none");
                            moveTarget = hasClosestByTag(pointElement, "TH") || hasClosestByTag(pointElement, "TD");
                        }
                        if (moveTarget && moveTarget === target) {
                            tableBlockElement.querySelector(".table__select").removeAttribute("style");
                            protyle.wysiwyg.element.classList.remove("protyle-wysiwyg--hiderange");
                            moveCellElement = moveTarget;
                            return false;
                        }
                        if (moveTarget && (moveTarget.tagName === "TH" || moveTarget.tagName === "TD") &&
                            (!moveCellElement || moveCellElement !== moveTarget)) {
                            // @ts-ignore
                            tableBlockElement.firstElementChild.style.webkitUserModify = "read-only";
                            let width = target.offsetLeft + target.clientWidth - moveTarget.offsetLeft;
                            let left = moveTarget.offsetLeft;
                            if (target.offsetLeft === moveTarget.offsetLeft) {
                                width = Math.max(target.clientWidth, moveTarget.clientWidth);
                            } else if (target.offsetLeft < moveTarget.offsetLeft) {
                                width = moveTarget.offsetLeft + moveTarget.clientWidth - target.offsetLeft;
                                left = target.offsetLeft;
                            }
                            let height = target.offsetTop + target.clientHeight - moveTarget.offsetTop;
                            let top = moveTarget.offsetTop;
                            if (target.offsetTop === moveTarget.offsetTop) {
                                height = Math.max(target.clientHeight, moveTarget.clientHeight);
                            } else if (target.offsetTop < moveTarget.offsetTop) {
                                height = moveTarget.offsetTop + moveTarget.clientHeight - target.offsetTop;
                                top = target.offsetTop;
                            }
                            // https://github.com/lonelyor/SourceFlow/issues/1015
                            Array.from(tableBlockElement.querySelectorAll("th, td")).find((item: HTMLElement) => {
                                const updateWidth = item.offsetLeft < left + width && item.offsetLeft + item.clientWidth > left + width;
                                const updateWidth2 = item.offsetLeft < left && item.offsetLeft + item.clientWidth > left;
                                if (item.offsetTop < top && item.offsetTop + item.clientHeight > top) {
                                    if ((item.offsetLeft + 6 > left && item.offsetLeft + item.clientWidth - 6 < left + width) || updateWidth || updateWidth2) {
                                        height = top + height - item.offsetTop;
                                        top = item.offsetTop;
                                    }
                                    if (updateWidth) {
                                        width = item.offsetLeft + item.clientWidth - left;
                                    }
                                    if (updateWidth2) {
                                        width = left + width - item.offsetLeft;
                                        left = item.offsetLeft;
                                    }
                                } else if (item.offsetTop < top + height && item.offsetTop + item.clientHeight > top + height) {
                                    if ((item.offsetLeft + 6 > left && item.offsetLeft + item.clientWidth - 6 < left + width) || updateWidth || updateWidth2) {
                                        height = item.clientHeight + item.offsetTop - top;
                                    }
                                    if (updateWidth) {
                                        width = item.offsetLeft + item.clientWidth - left;
                                    }
                                    if (updateWidth2) {
                                        width = left + width - item.offsetLeft;
                                        left = item.offsetLeft;
                                    }
                                } else if (updateWidth2 && item.offsetTop + 6 > top && item.offsetTop + item.clientHeight - 6 < top + height) {
                                    width = left + width - item.offsetLeft;
                                    left = item.offsetLeft;
                                } else if (updateWidth && item.offsetTop + 6 > top && item.offsetTop + item.clientHeight - 6 < top + height) {
                                    width = item.offsetLeft + item.clientWidth - left;
                                }
                            });
                            protyle.wysiwyg.element.classList.add("protyle-wysiwyg--hiderange");
                            tableBlockElement.querySelector(".table__select").setAttribute("style", `left:${left - tableBlockElement.firstElementChild.scrollLeft}px;top:${top - tableBlockElement.querySelector("table").scrollTop}px;height:${height}px;width:${width + 1}px;`);
                            moveCellElement = moveTarget;
                        }
                        return;
                    } else {
                        tableBlockElement.querySelector(".table__select").removeAttribute("style");
                        moveCellElement = undefined;
                    }
                }
                // 在包含 img， video， audio 的元素上划选后无法上下滚动
                // 在包含 img， video， audio 的元素上拖拽无法划选 https://github.com/lonelyor/SourceFlow/issues/11763
                if (needScroll) {
                    if (moveEvent.clientY < contentRect.top + Constants.SIZE_SCROLL_TB || moveEvent.clientY > contentRect.bottom - Constants.SIZE_SCROLL_TB) {
                        protyle.contentElement.scroll({
                            top: protyle.contentElement.scrollTop + (moveEvent.clientY < contentRect.top + Constants.SIZE_SCROLL_TB ? -Constants.SIZE_SCROLL_STEP : Constants.SIZE_SCROLL_STEP),
                            behavior: "smooth"
                        });
                    }
                }
                protyle.selectElement.classList.remove("fn__none");
                // 向左选择，遇到 gutter 就不会弹出 toolbar
                hideElements(["gutter"], protyle);
                let newTop = 0;
                let newLeft = 0;
                let newWidth = 0;
                let newHeight = 0;
                if (moveEvent.clientX < clentX) {
                    if (moveEvent.clientX < mostLeft) {
                        // 向左越界
                        newLeft = mostLeft;
                    } else {
                        // 向左
                        newLeft = moveEvent.clientX;
                    }
                    newWidth = clentX - newLeft;
                } else {
                    if (moveEvent.clientX > mostRight) {
                        // 向右越界
                        newLeft = clentX;
                        newWidth = mostRight - newLeft;
                    } else {
                        // 向右
                        newLeft = clentX;
                        newWidth = moveEvent.clientX - clentX;
                    }
                }

                if (moveEvent.clientY > y) {
                    if (moveEvent.clientY > mostBottom) {
                        // 向下越界
                        newTop = y;
                        newHeight = mostBottom - y;
                    } else {
                        // 向下
                        newTop = y;
                        newHeight = moveEvent.clientY - y;
                    }
                } else {
                    if (moveEvent.clientY < mostTop) {
                        // 向上越界
                        newTop = mostTop;
                    } else {
                        // 向上
                        newTop = moveEvent.clientY;
                    }
                    newHeight = y - newTop;
                }
                if (newHeight < 4) {
                    return;
                }
                protyle.selectElement.setAttribute("style", `background-color: ${protyle.selectElement.style.backgroundColor};top:${newTop}px;height:${newHeight}px;left:${newLeft + 2}px;width:${newWidth - 2}px;`);
                const newMouseElement = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
                if (mouseElement && mouseElement === newMouseElement && !mouseElement.classList.contains("protyle-wysiwyg") &&
                    !mouseElement.classList.contains("list") && !mouseElement.classList.contains("bq") &&
                    !mouseElement.classList.contains("sb") && !mouseElement.classList.contains("callout")) {
                    // 性能优化，同一个p元素不进行选中计算
                    return;
                } else {
                    mouseElement = newMouseElement;
                }
                hideElements(["select"], protyle);
                let firstElement;
                if (moveEvent.clientY > y) {
                    firstElement = startFirstElement || document.elementFromPoint(newLeft, newTop);
                    endLastElement = undefined;
                } else {
                    firstElement = document.elementFromPoint(newLeft, newTop);
                    startFirstElement = undefined;
                }
                if (!firstElement) {
                    return;
                }
                if (firstElement.classList.contains("protyle-wysiwyg") || firstElement.classList.contains("list") ||
                    firstElement.classList.contains("li") || firstElement.classList.contains("sb") ||
                    firstElement.classList.contains("callout") || firstElement.classList.contains("bq")) {
                    firstElement = document.elementFromPoint(newLeft, newTop + 16);
                }
                if (!firstElement) {
                    return;
                }
                let firstBlockElement = hasClosestBlock(firstElement);
                if (!firstBlockElement && firstElement.classList.contains("protyle-breadcrumb__bar")) {
                    firstBlockElement = firstElement.nextElementSibling as HTMLElement;
                }
                if (moveEvent.clientY > y) {
                    if (!startFirstElement) {
                        // 向上选择导致滚动条滚动到顶部再向下选择至 > y 时，firstBlockElement 为 undefined
                        if (!firstBlockElement) {
                            firstBlockElement = protyle.wysiwyg.element.firstElementChild as HTMLElement;
                            if (firstBlockElement.classList.contains("protyle-breadcrumb__bar")) {
                                firstBlockElement = firstBlockElement.nextElementSibling as HTMLElement;
                            }
                        }
                        startFirstElement = firstBlockElement;
                    }
                } else if (!firstBlockElement &&
                    // https://github.com/lonelyor/SourceFlow/issues/7580
                    moveEvent.clientY < protyle.wysiwyg.element.lastElementChild.getBoundingClientRect().bottom) {
                    firstBlockElement = protyle.wysiwyg.element.firstElementChild as HTMLElement;
                    if (firstBlockElement.classList.contains("protyle-breadcrumb__bar")) {
                        firstBlockElement = firstBlockElement.nextElementSibling as HTMLElement;
                    }
                }
                let selectElements: Element[] = [];
                let currentElement: Element | boolean = firstBlockElement;

                if (currentElement) {
                    // 从下往上划选遇到嵌入块时，选中整个嵌入块
                    const embedElement = isInEmbedBlock(currentElement);
                    if (embedElement) {
                        currentElement = embedElement;
                    }
                }

                let hasJump = false;
                const selectBottom = endLastElement ? endLastElement.getBoundingClientRect().bottom : (newTop + newHeight);
                while (currentElement) {
                    if (currentElement && !currentElement.classList.contains("protyle-attr")) {
                        const currentRect = currentElement.getBoundingClientRect();
                        if (currentRect.height > 0 && currentRect.top < selectBottom && currentRect.left < newLeft + newWidth) {
                            if (hasJump) {
                                // 父节点的下个节点在选中范围内才可使用父节点作为选中节点
                                if (currentElement.nextElementSibling && !currentElement.nextElementSibling.classList.contains("protyle-attr")) {
                                    const nextRect = currentElement.nextElementSibling.getBoundingClientRect();
                                    if (nextRect.top < selectBottom && nextRect.left < newLeft + newWidth) {
                                        selectElements = [currentElement];
                                        currentElement = currentElement.nextElementSibling;
                                        hasJump = false;
                                    } else if (currentElement.parentElement.classList.contains("sb")) {
                                        currentElement = hasClosestBlock(currentElement.parentElement);
                                        hasJump = true;
                                    } else {
                                        break;
                                    }
                                } else {
                                    currentElement = hasClosestBlock(currentElement.parentElement);
                                    hasJump = true;
                                }
                            } else {
                                if (!currentElement.classList.contains("protyle-breadcrumb__bar") &&
                                    !currentElement.classList.contains("protyle-breadcrumb__item")) {
                                    selectElements.push(currentElement);
                                }
                                if (!currentElement.nextElementSibling && currentElement.parentElement.classList.contains("callout-content")) {
                                    currentElement = currentElement.parentElement.nextElementSibling;
                                } else {
                                    currentElement = currentElement.nextElementSibling;
                                }
                            }
                        } else if (currentElement.parentElement.classList.contains("sb")) {
                            // 跳出超级块横向排版中的未选中元素
                            currentElement = hasClosestBlock(currentElement.parentElement);
                            hasJump = true;
                        } else if (currentRect.height === 0 && currentRect.width === 0 && currentElement.parentElement.getAttribute("fold") === "1") {
                            currentElement = currentElement.parentElement;
                            selectElements = [];
                        } else {
                            break;
                        }
                    } else {
                        currentElement = hasClosestBlock(currentElement.parentElement);
                        hasJump = true;
                    }
                }
                if (moveEvent.clientY <= y && !endLastElement) {
                    endLastElement = selectElements[selectElements.length - 1];
                }
                if (selectElements.length === 1 && !selectElements[0].classList.contains("list") &&
                    !selectElements[0].classList.contains("bq") && !selectElements[0].classList.contains("callout") &&
                    !selectElements[0].classList.contains("sb")) {
                    // 只有一个 p 时不选中
                    protyle.selectElement.style.backgroundColor = "transparent";
                    protyle.wysiwyg.element.classList.remove("protyle-wysiwyg--hiderange");
                } else {
                    protyle.wysiwyg.element.classList.add("protyle-wysiwyg--hiderange");
                    selectElements.forEach(item => {
                        if (!hasClosestByClassName(item, "protyle-wysiwyg__embed")) {
                            item.classList.add("protyle-wysiwyg--select");
                        }
                    });
                    protyle.selectElement.style.backgroundColor = "";
                }
            };

            documentSelf.onmouseup = (mouseUpEvent) => {
                documentSelf.onmousemove = null;
                documentSelf.onmouseup = null;
                documentSelf.ondragstart = null;
                documentSelf.onselectstart = null;
                documentSelf.onselect = null;
                startFirstElement = undefined;
                endLastElement = undefined;
                // 多选表格单元格后，选择菜单中的居左，然后 shift+左 选中的文字无法显示选中背景，因此需移除
                // 多选块后 shift+左 选中的文字无法显示选中背景，因此需移除
                protyle.wysiwyg.element.classList.remove("protyle-wysiwyg--hiderange");
                wysiwyg.element.querySelectorAll("iframe").forEach(item => {
                    item.style.pointerEvents = "";
                });
                protyle.selectElement.classList.add("fn__none");
                protyle.selectElement.removeAttribute("style");
                if (tableBlockElement) {
                    // @ts-ignore
                    tableBlockElement.firstElementChild.style.webkitUserModify = "";
                    const tableSelectElement = tableBlockElement.querySelector(".table__select") as HTMLElement;
                    if (tableSelectElement.getAttribute("style")) {
                        if (getSelection().rangeCount > 0) {
                            getSelection().getRangeAt(0).collapse(false);
                        }
                        window.sourceflow.menus.menu.remove();
                        if (!protyle.disabled) {
                            window.sourceflow.menus.menu.append(new MenuItem({
                                id: "mergeCell",
                                label: window.sourceflow.languages.mergeCell,
                                click: () => {
                                    if (tableBlockElement) {
                                        const selectCellElements: HTMLTableCellElement[] = [];
                                        const colIndexList: number[] = [];
                                        const colCount = tableBlockElement.querySelectorAll("th").length;
                                        let fnNoneMax = 0;
                                        const scrollLeft = tableBlockElement.firstElementChild.scrollLeft;
                                        const scrollTop = tableBlockElement.querySelector("table").scrollTop;
                                        let isTHead = false;
                                        let isTBody = false;
                                        tableBlockElement.querySelectorAll("th, td").forEach((item: HTMLTableCellElement, index: number) => {
                                            if (item.classList.contains("fn__none")) {
                                                // 合并的元素中间有 fn__none 的元素
                                                if (item.previousElementSibling && item.previousElementSibling === selectCellElements[selectCellElements.length - 1]) {
                                                    selectCellElements.push(item);
                                                    if (!isTHead && item.parentElement.parentElement.tagName === "THEAD") {
                                                        isTHead = true;
                                                    } else if (!isTBody && item.parentElement.parentElement.tagName === "TBODY") {
                                                        isTBody = true;
                                                    }
                                                } else {
                                                    if (index < fnNoneMax && colIndexList.includes((index + 1) % colCount)) {
                                                        selectCellElements.push(item);
                                                        if (!isTHead && item.parentElement.parentElement.tagName === "THEAD") {
                                                            isTHead = true;
                                                        } else if (!isTBody && item.parentElement.parentElement.tagName === "TBODY") {
                                                            isTBody = true;
                                                        }
                                                    }
                                                }
                                            } else {
                                                if (isIncludeCell({
                                                    tableSelectElement,
                                                    scrollLeft,
                                                    scrollTop,
                                                    item,
                                                })) {
                                                    selectCellElements.push(item);
                                                    if (!isTHead && item.parentElement.parentElement.tagName === "THEAD") {
                                                        isTHead = true;
                                                    } else if (!isTBody && item.parentElement.parentElement.tagName === "TBODY") {
                                                        isTBody = true;
                                                    }
                                                    colIndexList.push((index + 1) % colCount);
                                                    // https://github.com/lonelyor/SourceFlow/issues/1014
                                                    fnNoneMax = Math.max((item.rowSpan - 1) * colCount + index + 1, fnNoneMax);
                                                }
                                            }
                                        });
                                        tableSelectElement.removeAttribute("style");
                                        const oldHTML = tableBlockElement.outerHTML;
                                        let cellElement = selectCellElements[0];
                                        let colSpan = cellElement.colSpan;
                                        let index = 1;
                                        while (cellElement.nextElementSibling && cellElement.nextElementSibling === selectCellElements[index]) {
                                            cellElement = cellElement.nextElementSibling as HTMLTableCellElement;
                                            if (!cellElement.classList.contains("fn__none")) { // https://github.com/lonelyor/SourceFlow/issues/1007#issuecomment-1046195608
                                                colSpan += cellElement.colSpan;
                                            }
                                            index++;
                                        }
                                        let html = "";
                                        let rowElement: Element = selectCellElements[0].parentElement;
                                        let rowSpan = selectCellElements[0].rowSpan;
                                        selectCellElements.forEach((item, index) => {
                                            let cellHTML = item.innerHTML.trim();
                                            if (cellHTML.endsWith("<br>")) {
                                                cellHTML = cellHTML.substr(0, cellHTML.length - 4);
                                            }
                                            html += cellHTML + ((!cellHTML || index === selectCellElements.length - 1) ? "" : "<br>");
                                            if (index !== 0) {
                                                if (rowElement !== item.parentElement) {
                                                    if (!item.classList.contains("fn__none")) { // https://github.com/lonelyor/SourceFlow/issues/1011
                                                        rowSpan += item.rowSpan;
                                                    }
                                                    rowElement = item.parentElement;
                                                    if (selectCellElements[0].parentElement.parentElement.tagName === "THEAD" && item.parentElement.parentElement.tagName !== "THEAD") {
                                                        selectCellElements[0].parentElement.parentElement.insertAdjacentElement("beforeend", item.parentElement);
                                                    }
                                                }
                                                item.classList.add("fn__none");
                                                item.innerHTML = "";
                                            }
                                        });

                                        // https://github.com/lonelyor/SourceFlow/issues/1017
                                        if (isTHead && isTBody) {
                                            rowElement = rowElement.parentElement.nextElementSibling.firstElementChild;
                                            while (rowElement && rowElement.parentElement.tagName !== "THEAD") {
                                                let colSpanCount = 0;
                                                let noneCount = 0;
                                                Array.from(rowElement.children).forEach((item: HTMLTableCellElement) => {
                                                    colSpanCount += item.colSpan - 1;
                                                    if (item.classList.contains("fn__none")) {
                                                        noneCount++;
                                                    }
                                                });
                                                if (colSpanCount !== noneCount) {
                                                    selectCellElements[0].parentElement.parentElement.insertAdjacentElement("beforeend", rowElement);
                                                    rowElement = rowElement.parentElement.nextElementSibling.firstElementChild;
                                                } else {
                                                    break;
                                                }
                                            }
                                        }

                                        // 合并背景色不会修改，需要等计算完毕
                                        setTimeout(() => {
                                            if (tableBlockElement) {
                                                selectCellElements[0].innerHTML = (html.replace(/<br>$/, "") || "<br>") + "<wbr>";
                                                selectCellElements[0].colSpan = colSpan;
                                                selectCellElements[0].rowSpan = rowSpan;
                                                focusByWbr(selectCellElements[0], document.createRange());
                                                updateTransaction(protyle, tableBlockElement.getAttribute("data-node-id"), tableBlockElement.outerHTML, oldHTML);
                                            }
                                        });
                                    }
                                }
                            }).element);
                            window.sourceflow.menus.menu.append(new MenuItem({
                                id: "separator_1",
                                type: "separator"
                            }).element);
                            window.sourceflow.menus.menu.append(new MenuItem({
                                id: "alignLeft",
                                icon: "iconAlignLeft",
                                accelerator: window.sourceflow.config.keymap.editor.general.alignLeft.custom,
                                label: window.sourceflow.languages.alignLeft,
                                click: () => {
                                    if (tableBlockElement) {
                                        const selectCellElements: HTMLTableCellElement[] = [];
                                        const scrollLeft = tableBlockElement.firstElementChild.scrollLeft;
                                        const scrollTop = tableBlockElement.querySelector("table").scrollTop;
                                        tableBlockElement.querySelectorAll("th, td").forEach((item: HTMLTableCellElement) => {
                                            if (!item.classList.contains("fn__none") &&
                                                isIncludeCell({
                                                    tableSelectElement,
                                                    scrollLeft,
                                                    scrollTop,
                                                    item,
                                                }) && (selectCellElements.length === 0 || (selectCellElements.length > 0 && item.offsetTop === selectCellElements[0].offsetTop))) {
                                                selectCellElements.push(item);
                                            }
                                        });
                                        tableSelectElement.removeAttribute("style");
                                        setTableAlign(protyle, selectCellElements, tableBlockElement, "left", getEditorRange(tableBlockElement));
                                    }
                                }
                            }).element);
                            window.sourceflow.menus.menu.append(new MenuItem({
                                id: "alignCenter",
                                icon: "iconAlignCenter",
                                accelerator: window.sourceflow.config.keymap.editor.general.alignCenter.custom,
                                label: window.sourceflow.languages.alignCenter,
                                click: () => {
                                    if (tableBlockElement) {
                                        const selectCellElements: HTMLTableCellElement[] = [];
                                        const scrollLeft = tableBlockElement.firstElementChild.scrollLeft;
                                        const scrollTop = tableBlockElement.querySelector("table").scrollTop;
                                        tableBlockElement.querySelectorAll("th, td").forEach((item: HTMLTableCellElement) => {
                                            if (!item.classList.contains("fn__none") && isIncludeCell({
                                                    tableSelectElement,
                                                    scrollLeft,
                                                    scrollTop,
                                                    item,
                                                }) &&
                                                (selectCellElements.length === 0 || (selectCellElements.length > 0 && item.offsetTop === selectCellElements[0].offsetTop))) {
                                                selectCellElements.push(item);
                                            }
                                        });
                                        tableSelectElement.removeAttribute("style");
                                        setTableAlign(protyle, selectCellElements, tableBlockElement, "center", getEditorRange(tableBlockElement));
                                    }
                                }
                            }).element);
                            window.sourceflow.menus.menu.append(new MenuItem({
                                id: "alignRight",
                                icon: "iconAlignRight",
                                accelerator: window.sourceflow.config.keymap.editor.general.alignRight.custom,
                                label: window.sourceflow.languages.alignRight,
                                click: () => {
                                    if (tableBlockElement) {
                                        const selectCellElements: HTMLTableCellElement[] = [];
                                        const scrollLeft = tableBlockElement.firstElementChild.scrollLeft;
                                        const scrollTop = tableBlockElement.querySelector("table").scrollTop;
                                        tableBlockElement.querySelectorAll("th, td").forEach((item: HTMLTableCellElement) => {
                                            if (!item.classList.contains("fn__none") && isIncludeCell({
                                                tableSelectElement,
                                                scrollLeft,
                                                scrollTop,
                                                item,
                                            }) && (selectCellElements.length === 0 || (selectCellElements.length > 0 && item.offsetTop === selectCellElements[0].offsetTop))) {
                                                selectCellElements.push(item);
                                            }
                                        });
                                        tableSelectElement.removeAttribute("style");
                                        setTableAlign(protyle, selectCellElements, tableBlockElement, "right", getEditorRange(tableBlockElement));
                                    }
                                }
                            }).element);
                            window.sourceflow.menus.menu.append(new MenuItem({
                                id: "useDefaultAlign",
                                icon: "",
                                label: window.sourceflow.languages.useDefaultAlign,
                                click: () => {
                                    if (tableBlockElement) {
                                        const selectCellElements: HTMLTableCellElement[] = [];
                                        const scrollLeft = tableBlockElement.firstElementChild.scrollLeft;
                                        const scrollTop = tableBlockElement.querySelector("table").scrollTop;
                                        tableBlockElement.querySelectorAll("th, td").forEach((item: HTMLTableCellElement) => {
                                            if (!item.classList.contains("fn__none") && isIncludeCell({
                                                    tableSelectElement,
                                                    scrollLeft,
                                                    scrollTop,
                                                    item,
                                                }) &&
                                                (selectCellElements.length === 0 || (selectCellElements.length > 0 && item.offsetTop === selectCellElements[0].offsetTop))) {
                                                selectCellElements.push(item);
                                            }
                                        });
                                        tableSelectElement.removeAttribute("style");
                                        setTableAlign(protyle, selectCellElements, tableBlockElement, "", getEditorRange(tableBlockElement));
                                    }
                                }
                            }).element);
                            window.sourceflow.menus.menu.append(new MenuItem({
                                id: "separator_2",
                                type: "separator"
                            }).element);
                        }
                        window.sourceflow.menus.menu.append(new MenuItem({
                            id: "copyPlainText",
                            label: window.sourceflow.languages.copyPlainText,
                            click() {
                                if (tableBlockElement) {
                                    const selectCellElements: HTMLTableCellElement[] = [];
                                    const scrollLeft = tableBlockElement.firstElementChild.scrollLeft;
                                    const scrollTop = tableBlockElement.querySelector("table").scrollTop;
                                    const tableSelectElement = tableBlockElement.querySelector(".table__select") as HTMLElement;
                                    tableBlockElement.querySelectorAll("th, td").forEach((item: HTMLTableCellElement) => {
                                        if (!item.classList.contains("fn__none") && isIncludeCell({
                                            tableSelectElement,
                                            scrollLeft,
                                            scrollTop,
                                            item,
                                        })) {
                                            selectCellElements.push(item);
                                        }
                                    });
                                    let textPlain = "";
                                    selectCellElements.forEach((item, index) => {
                                        textPlain += item.textContent.trim() + "\t";
                                        if (!item.nextElementSibling || !selectCellElements[index + 1] ||
                                            item.nextElementSibling !== selectCellElements[index + 1]) {
                                            textPlain = textPlain.slice(0, -1) + "\n";
                                        }
                                    });
                                    copyPlainText(textPlain.slice(0, -1));
                                    focusBlock(tableBlockElement);
                                }
                            }
                        }).element);
                        window.sourceflow.menus.menu.append(new MenuItem({
                            id: "copy",
                            icon: "iconCopy",
                            accelerator: "⌘C",
                            label: window.sourceflow.languages.copy,
                            click() {
                                if (tableBlockElement) {
                                    focusByRange(getEditorRange(tableBlockElement));
                                    document.execCommand("copy");
                                }
                            }
                        }).element);
                        if (!protyle.disabled) {
                            window.sourceflow.menus.menu.append(new MenuItem({
                                id: "cut",
                                icon: "iconCut",
                                accelerator: "⌘X",
                                label: window.sourceflow.languages.cut,
                                click() {
                                    if (tableBlockElement) {
                                        focusByRange(getEditorRange(tableBlockElement));
                                        document.execCommand("cut");
                                    }
                                }
                            }).element);
                            window.sourceflow.menus.menu.append(new MenuItem({
                                id: "clear",
                                label: window.sourceflow.languages.clear,
                                icon: "iconTrashcan",
                                accelerator: "⌦",
                                click() {
                                    clearTableCell(protyle, tableBlockElement as HTMLElement);
                                }
                            }).element);
                            window.sourceflow.menus.menu.append(new MenuItem({
                                id: "paste",
                                label: window.sourceflow.languages.paste,
                                icon: "iconPaste",
                                accelerator: "⌘V",
                                async click() {
                                    if (document.queryCommandSupported("paste")) {
                                        document.execCommand("paste");
                                    } else if (tableBlockElement) {
                                        try {
                                            const text = await readClipboard();
                                            paste(protyle, Object.assign(text, {target: tableBlockElement as HTMLElement}));
                                        } catch (e) {
                                            console.log(e);
                                        }
                                    }
                                }
                            }).element);
                        }
                        window.sourceflow.menus.menu.popup({x: mouseUpEvent.clientX - 8, y: mouseUpEvent.clientY - 16});
                    }
                }

                const ids: string[] = [];
                const selectElement = protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select");
                selectElement.forEach(item => {
                    ids.push(item.getAttribute("data-node-id"));
                });
                countBlockWord(ids);
                // 划选后不能存在跨块的 range https://github.com/lonelyor/SourceFlow/issues/4473
                if (getSelection().rangeCount > 0) {
                    const range = getSelection().getRangeAt(0);
                    if (range.toString() === "" ||
                        window.sourceflow.shiftIsPressed  //
                    ) {
                        if (event.detail > 2) {
                            // table 前或最后一个 cell 三击状态不对
                            let cursorElement = hasClosestBlock(range.startContainer) as Element;
                            if (cursorElement) {
                                if (cursorElement.nextElementSibling?.classList.contains("table")) {
                                    setLastNodeRange(getContenteditableElement(cursorElement), range, false);
                                } else if (cursorElement.classList.contains("table")) {
                                    const cellElements = cursorElement.querySelectorAll("th, td");
                                    cursorElement = cellElements[cellElements.length - 1];
                                    if (cursorElement.contains(range.startContainer)) {
                                        setLastNodeRange(cursorElement, range, false);
                                    }
                                }
                            }
                            return;
                        }
                    }
                    if (selectElement.length > 0) {
                        range.collapse(true);
                        // https://github.com/lonelyor/SourceFlow/issues/17092 & https://github.com/lonelyor/SourceFlow/issues/15296
                        const endElement = hasClosestBlock(mouseUpEvent.target as HTMLElement);
                        if (endElement && document.activeElement.classList.contains("protyle-wysiwyg")) {
                            focusBlock(endElement);
                        }
                        return;
                    }
                    const startBlockElement = hasClosestBlock(range.startContainer);
                    let endBlockElement: false | HTMLElement;
                    if (mouseUpEvent.detail > 2 && range.endContainer.nodeType !== 3 && ["DIV", "TD", "TH"].includes((range.endContainer as HTMLElement).tagName) && range.endOffset === 0) {
                        // 三击选中段落块时，rangeEnd 会在下一个块
                        if ((range.endContainer as HTMLElement).classList.contains("protyle-attr") && startBlockElement) {
                            // 三击在悬浮层中会选择到 attr https://github.com/lonelyor/SourceFlow/issues/4636
                            // 需要获取可编辑元素，使用 previousElementSibling 的话会 https://github.com/lonelyor/SourceFlow/issues/9714
                            setLastNodeRange(getContenteditableElement(startBlockElement), range, false);
                        } else if (["TD", "TH"].includes((range.endContainer as HTMLElement).tagName)) {
                            const cellElement = hasClosestByTag(range.startContainer, "TH") || hasClosestByTag(range.startContainer, "TD");
                            if (cellElement) {
                                setLastNodeRange(cellElement, range, false);
                            }
                        }
                    } else {
                        endBlockElement = hasClosestBlock(range.endContainer);
                    }
                    if (startBlockElement && endBlockElement && endBlockElement !== startBlockElement) {
                        if ((range.startContainer.nodeType === 1 && (range.startContainer as HTMLElement).tagName === "DIV" && (range.startContainer as HTMLElement).classList.contains("protyle-attr")) ||
                            event.clientY > mouseUpEvent.clientY) {
                            setFirstNodeRange(getContenteditableElement(endBlockElement), range);
                        } else if (range.endOffset === 0 && range.endContainer.nodeType === 1 && (range.endContainer as HTMLElement).tagName === "DIV") {
                            setLastNodeRange(getContenteditableElement(startBlockElement), range, false);
                        } else {
                            range.collapse(true);
                        }
                    }
                }
            };
        });
};
