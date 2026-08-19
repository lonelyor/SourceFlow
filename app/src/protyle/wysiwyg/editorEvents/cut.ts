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

import {emojiToMd, escapeInline, setEmptyOutline} from "../helpers";
import type {WYSIWYGEditorEventState, WYSIWYGEventContext} from "../shared";
import {
    canWriteInternalSourceFlowClipboard,
    resolveSelectionScope,
    sanitizeStandardClipboardHTML,
    hasLocalClipboardImages,
    inlineLocalImages
} from "../../util/selectionScope";

export const registerCutEvent = (wysiwyg: WYSIWYGEventContext, protyle: IProtyle, state: WYSIWYGEditorEventState) => {
        wysiwyg.element.addEventListener("cut", async (event: ClipboardEvent & { target: HTMLElement }) => {
            window.sourceflow.ctrlIsPressed = false; // https://github.com/lonelyor/SourceFlow/issues/6373
            if (protyle.disabled) {
                return;
            }
            if (event.target.tagName === "PROTYLE-HTML" || event.target.localName === "input") {
                event.stopPropagation();
                return;
            }

            if (protyle.options.render.breadcrumb) {
                protyle.breadcrumb.hide();
            }
            const range = getEditorRange(protyle.wysiwyg.element);
            let nodeElement = hasClosestBlock(range.startContainer);
            if (!nodeElement) {
                event.stopPropagation();
                event.preventDefault();
                return;
            }
            // https://github.com/lonelyor/SourceFlow/issues/11793
            const embedElement = isInEmbedBlock(nodeElement);
            if (embedElement) {
                nodeElement = embedElement;
            }
            event.stopPropagation();
            event.preventDefault();
            const selectImgElement = nodeElement.querySelector(".img--select");
            const selectAVElement = nodeElement.querySelector(".av__row--select, .av__cell--select");
            const selectTableElement = nodeElement.querySelector(".table__select")?.clientWidth > 0;
            let selectElements = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
            if (selectElements.length === 0 && range.toString() === "" && !range.cloneContents().querySelector("img") &&
                !selectImgElement && !selectAVElement && !selectTableElement) {
                nodeElement.classList.add("protyle-wysiwyg--select");
                selectElements = [nodeElement];
            }
            const clipboardSelectionScope = resolveSelectionScope(range, protyle.wysiwyg.element);
            let html = "";
            let textPlain = "";
            let isInCodeBlock = false;
            let needClipboardWrite = false;
            if (selectElements.length > 0) {
                if (selectElements[0].getAttribute("data-type") === "NodeListItem" &&
                    selectElements[0].parentElement.classList.contains("list") &&   // 反链复制列表项 https://github.com/lonelyor/SourceFlow/issues/6555
                    selectElements[0].parentElement.childElementCount - 1 === selectElements.length) {
                    const hasNoLiElement = selectElements.find(item => {
                        if (!selectElements[0].parentElement.contains(item)) {
                            return true;
                        }
                    });
                    if (!hasNoLiElement) {
                        selectElements = [selectElements[0].parentElement];
                    }
                }
                let listHTML = "";
                for (let i = 0; i < selectElements.length; i++) {
                    const item = getTopAloneElement(selectElements[i]);
                    let itemHTML = "";
                    if (item.getAttribute("data-type") === "NodeHeading" && item.getAttribute("fold") === "1") {
                        needClipboardWrite = true;
                        const response = await fetchSyncPost("/api/block/getHeadingChildrenDOM", {
                            id: item.getAttribute("data-node-id"),
                            removeFoldAttr: false
                        });
                        itemHTML = response.data;
                    } else if (item.getAttribute("data-type") !== "NodeBlockQueryEmbed" && item.querySelector('[data-type="NodeHeading"][fold="1"]')) {
                        needClipboardWrite = true;
                        const response = await fetchSyncPost("/api/block/getBlockDOM", {
                            id: item.getAttribute("data-node-id"),
                        });
                        itemHTML = response.data.dom;
                    } else {
                        itemHTML = removeEmbed(item);
                    }
                    if (item.getAttribute("data-type") === "NodeListItem") {
                        if (!listHTML) {
                            listHTML = `<div data-subtype="${item.getAttribute("data-subtype")}" data-node-id="${Lute.NewNodeID()}" data-type="NodeList" class="list">`;
                        }
                        listHTML += itemHTML;
                        if (i === selectElements.length - 1 ||
                            selectElements[i + 1].getAttribute("data-type") !== "NodeListItem" ||
                            selectElements[i + 1].getAttribute("data-subtype") !== item.getAttribute("data-subtype")
                        ) {
                            html += `${listHTML}<div class="protyle-attr" contenteditable="false">${Constants.ZWSP}</div></div>`;
                            listHTML = "";
                        }
                    } else {
                        html += itemHTML;
                    }
                }
                const nextElement = getNextBlock(selectElements[selectElements.length - 1]);
                removeBlock(protyle, nodeElement, range, "remove");
                if (nextElement) {
                    // Ctrl+X 剪切后光标应跳到下一行行首 https://github.com/lonelyor/SourceFlow/issues/5485
                    focusBlock(nextElement);
                }
            } else if (selectAVElement) {
                needClipboardWrite = true;
                const cellsValue = await updateCellsValue(protyle, nodeElement);
                html = JSON.stringify(cellsValue.json);
                textPlain = cellsValue.text;
            } else if (selectTableElement) {
                const selectCellElements: HTMLTableCellElement[] = [];
                const scrollLeft = nodeElement.firstElementChild.scrollLeft;
                const scrollTop = nodeElement.querySelector("table").scrollTop;
                const tableSelectElement = nodeElement.querySelector(".table__select") as HTMLElement;
                html = "<table>";
                nodeElement.querySelectorAll("th, td").forEach((item: HTMLTableCellElement) => {
                    if (!item.classList.contains("fn__none") && isIncludeCell({
                        tableSelectElement,
                        scrollLeft,
                        scrollTop,
                        item,
                    })) {
                        selectCellElements.push(item);
                    }
                });
                tableSelectElement.removeAttribute("style");
                if (getSelection().rangeCount > 0) {
                    const range = getSelection().getRangeAt(0);
                    if (nodeElement.contains(range.startContainer)) {
                        range.insertNode(document.createElement("wbr"));
                    }
                }
                const oldHTML = nodeElement.outerHTML;
                nodeElement.querySelector("wbr")?.remove();
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                selectCellElements.forEach((item, index) => {
                    if (index === 0 || !item.previousElementSibling ||
                        item.previousElementSibling !== selectCellElements[index - 1]) {
                        html += "<tr>";
                    }
                    html += item.outerHTML;
                    if (!item.nextElementSibling || !selectCellElements[index + 1] ||
                        item.nextElementSibling !== selectCellElements[index + 1]) {
                        html += "</tr>";
                    }
                    item.innerHTML = "";
                });
                html += "</table>";
                textPlain = protyle.lute.HTML2Md(html);
                updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
            } else {
                const id = nodeElement.getAttribute("data-node-id");
                setInsertWbrHTML(nodeElement, range, protyle);
                const oldHTML = protyle.wysiwyg.lastHTMLs[id] || nodeElement.outerHTML;
                const tempElement = document.createElement("div");
                // 首次选中标题时，range.startContainer 会为空
                let startContainer = range.startContainer;
                if (startContainer.nodeType === 3 && startContainer.textContent === "") {
                    const nextSibling = hasNextSibling(range.startContainer);
                    if (nextSibling) {
                        startContainer = nextSibling;
                    }
                }
                const headElement = hasClosestByAttribute(startContainer, "data-type", "NodeHeading");
                if (headElement && range.toString() === headElement.firstElementChild.textContent) {
                    tempElement.insertAdjacentHTML("afterbegin", headElement.firstElementChild.innerHTML);
                    headElement.firstElementChild.innerHTML = "";
                } else if (range.toString() !== "" && startContainer === range.endContainer &&
                    range.startContainer.nodeType === 3 &&
                    // 需使用 wholeText https://github.com/lonelyor/SourceFlow/issues/14339
                    range.endOffset === (range.endContainer as Text).wholeText.length &&
                    range.startOffset === 0 &&
                    !["DIV", "TD", "TH", "TR"].includes(range.startContainer.parentElement.tagName)) {
                    // 选中整个内联元素
                    tempElement.append(range.startContainer.parentElement);
                } else if (selectImgElement) {
                    tempElement.append(selectImgElement);
                } else if (range.startContainer.nodeType === 3 && range.startContainer.parentElement.tagName === "SPAN" &&
                    range.startContainer.parentElement.getAttribute("data-type") &&
                    range.startContainer.parentElement === range.endContainer.parentElement) {
                    // 剪切粗体等字体中的一部分
                    const spanElement = range.startContainer.parentElement;
                    const attributes = spanElement.attributes;
                    const newSpanElement = document.createElement("span");
                    for (let i = 0; i < attributes.length; i++) {
                        newSpanElement.setAttribute(attributes[i].name, attributes[i].value);
                    }
                    if (spanElement.getAttribute("data-type").indexOf("block-ref") > -1 &&
                        spanElement.getAttribute("data-subtype") === "d") {
                        // 引用被剪切后需变为静态锚文本
                        newSpanElement.setAttribute("data-subtype", "s");
                        spanElement.setAttribute("data-subtype", "s");
                    }
                    newSpanElement.textContent = range.toString();
                    range.deleteContents();
                    tempElement.append(newSpanElement);
                } else {
                    if (range.cloneContents().querySelectorAll("td, th").length > 0) {
                        // 表格内多格子 cut https://github.com/lonelyor/SourceFlow/issues/564
                        const wbrElement = document.createElement("wbr");
                        range.insertNode(wbrElement);
                        range.setStartAfter(wbrElement);
                        tempElement.append(range.extractContents());
                        nodeElement.outerHTML = protyle.lute.SpinBlockDOM(nodeElement.outerHTML);
                        nodeElement = protyle.wysiwyg.element.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
                        mathRender(nodeElement);
                        focusByWbr(nodeElement, range);
                    } else {
                        const inlineMathElement = hasClosestByAttribute(range.commonAncestorContainer, "data-type", "inline-math");
                        if (inlineMathElement) {
                            // 表格内剪切数学公式
                            tempElement.append(inlineMathElement);
                        } else {
                            tempElement.append(range.extractContents());
                            let parentElement: Element | false;
                            //
                            if (nodeElement.classList.contains("av")) {
                                updateAVName(protyle, nodeElement);
                            } else if (nodeElement.classList.contains("table")) {
                                parentElement = hasClosestByTag(range.startContainer, "TD") || hasClosestByTag(range.startContainer, "TH");
                            } else {
                                parentElement = getContenteditableElement(nodeElement);
                            }
                            if (parentElement) {
                                // 引用文本剪切
                                // 表格多行剪切
                                // 自定义表情的段落剪切后表情丢失
                                Array.from(parentElement.children).forEach(item => {
                                    if (item.textContent === "" && (item.nodeType === 1 && !["BR", "IMG"].includes(item.tagName))) {
                                        item.remove();
                                    }
                                });
                            }
                        }
                    }
                }
                emojiToMd(tempElement);
                html = tempElement.innerHTML;
                // https://github.com/lonelyor/SourceFlow/issues/10722
                if (hasClosestByAttribute(range.startContainer, "data-type", "NodeCodeBlock") ||
                    hasClosestByTag(range.startContainer, "CODE")) {
                    textPlain = tempElement.textContent.replace(Constants.ZWSP, "");
                    isInCodeBlock = true;
                }
                // https://github.com/lonelyor/SourceFlow/issues/4321
                if (!nodeElement.classList.contains("table")) {
                    const editableElement = getContenteditableElement(nodeElement);
                    if (editableElement && editableElement.textContent === "") {
                        editableElement.innerHTML = "";
                    }
                }
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                if (nodeElement.getAttribute("data-type") === "NodeCodeBlock") {
                    range.insertNode(document.createElement("wbr"));
                    nodeElement.querySelector('[data-render="true"]')?.removeAttribute("data-render");
                    highlightRender(nodeElement);
                }
                if (nodeElement.parentElement.parentElement && !nodeElement.classList.contains("av")) {
                    // 选中 heading 时，使用删除的 transaction
                    setInsertWbrHTML(nodeElement, range, protyle);
                    updateTransaction(protyle, id, protyle.wysiwyg.lastHTMLs[id] || nodeElement.outerHTML, oldHTML);
                }
            }
            protyle.hint.render(protyle);
            if (!selectAVElement) {
                textPlain = textPlain || protyle.lute.BlockDOM2StdMd(html).trimEnd(); // 需要 trimEnd，否则 \n 会导致 https://github.com/lonelyor/SourceFlow/issues/6218
                if (nodeElement.classList.contains("table")) {
                    textPlain = textPlain.replace(/<br>/g, "\n").replace(/<br\/>/g, "\n");
                    textPlain = textPlain.endsWith("\n") ? textPlain.replace(/\n$/, "") : textPlain;
                }
            }
            textPlain = removeZWJ(nbsp2space(textPlain)); // Replace non-breaking spaces with normal spaces when copying https://github.com/lonelyor/SourceFlow/issues/9382
            event.clipboardData.setData("text/plain", textPlain);

            if (!isInCodeBlock) {
                enableLuteMarkdownSyntax(protyle);
                const textSourceFlow = selectTableElement ? protyle.lute.HTML2BlockDOM(html) : html;
                restoreLuteMarkdownSyntax(protyle);
                const sourceFlowTemplate = document.createElement("template");
                sourceFlowTemplate.innerHTML = textSourceFlow;
                const canWriteSourceFlowHTML = canWriteInternalSourceFlowClipboard(clipboardSelectionScope, sourceFlowTemplate.content);
                const standardHTML = sanitizeStandardClipboardHTML(removeZWJ(selectTableElement ? html : protyle.lute.BlockDOM2HTML(selectAVElement ? textPlain : html)));
                const textHTML = canWriteSourceFlowHTML ? appendSourceFlowClipboardHTMLComment(textSourceFlow, standardHTML) : standardHTML;
                if (canWriteSourceFlowHTML) {
                    event.clipboardData.setData(Constants.SOURCEFLOW_HTML_CLIPBOARD_MIME, textSourceFlow);
                }
                event.clipboardData.setData("text/html", textHTML);
                const needInlineImages = hasLocalClipboardImages(textHTML);
                if (needClipboardWrite || needInlineImages) {
                    try {
                        const finalHTML = needInlineImages ? await inlineLocalImages(textHTML) : textHTML;
                        await navigator.clipboard.write([new ClipboardItem({
                            ["text/plain"]: textPlain,
                            ["text/html"]: finalHTML,
                        })]);
                    } catch (e) {
                        console.log("Cut write clipboard error:", e);
                    }
                }
            }
        });

};
