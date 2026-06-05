import {enableLuteMarkdownSyntax, getTextStar, restoreLuteMarkdownSyntax} from "../../util/paste";
import {
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByTag,
} from "../../util/hasClosest";
import {
    getEditorRange,
} from "../../util/selection";
import {Constants} from "../../../constants";
import {
    isEndOfBlock
} from "../getBlock";
import {getEnableHTML, removeEmbed} from "../removeEmbed";
import {appendSourceFlowClipboardHTMLComment} from "../../util/compatibility";
import {fetchSyncPost} from "../../../util/fetch";
import {isIncludeCell} from "../../util/table";
import {countBlockWord} from "../../../layout/status";
import {
    genCellValueByElement,
    getCellText,
    getTypeByCellElement
} from "../../render/av/cell";
import {nbsp2space, removeZWJ} from "../../util/normalizeText";

import {emojiToMd} from "../helpers";
import type {WYSIWYGEventContext} from "../shared";
import {
    canWriteInternalSourceFlowClipboard,
    resolveSelectionScope,
    sanitizeStandardClipboardHTML
} from "../../util/selectionScope";

export const registerCopyEvent = (wysiwyg: WYSIWYGEventContext, protyle: IProtyle) => {
        wysiwyg.element.addEventListener("copy", async (event: ClipboardEvent & { target: HTMLElement }) => {
            window.sourceflow.ctrlIsPressed = false; // https://github.com/lonelyor/SourceFlow/issues/6373
            // https://github.com/lonelyor/SourceFlow/issues/4600
            if (event.target.tagName === "PROTYLE-HTML" || event.target.localName === "input") {
                event.stopPropagation();
                return;
            }
            event.stopPropagation();
            event.preventDefault();
            const range = getEditorRange(protyle.wysiwyg.element);
            const nodeElement = hasClosestBlock(range.startContainer);
            if (!nodeElement) {
                return;
            }
            const selectImgElement = nodeElement.querySelector(".img--select");
            const selectAVElement = nodeElement.querySelector(".av__row--select, .av__cell--select");
            const selectTableElement = nodeElement.querySelector(".table__select")?.clientWidth > 0;
            let selectElements = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
            if (selectElements.length === 0 && range.toString() === "" && !range.cloneContents().querySelector("img") &&
                !selectImgElement && !selectAVElement && !selectTableElement) {
                nodeElement.classList.add("protyle-wysiwyg--select");
                countBlockWord([nodeElement.getAttribute("data-node-id")]);
                selectElements = [nodeElement];
            }
            let html = "";
            let textPlain = "";
            let isInCodeBlock = false;
            let needClipboardWrite = false;
            if (selectElements.length > 0) {
                const isRefText = selectElements[0].getAttribute("data-reftext") === "true";
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
                    const item = selectElements[i] as HTMLElement;
                    // 复制列表项中的块会变为复制列表项，因此不能使用 getTopAloneElement https://github.com/lonelyor/SourceFlow/issues/8925
                    if (isRefText) {
                        html += getTextStar(item) + "\n\n";
                    } else {
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
                }
                if (isRefText) {
                    html = html.slice(0, -2);
                    selectElements[0].removeAttribute("data-reftext");
                }
            } else if (selectAVElement) {
                const cellElements: Element[] = Array.from(nodeElement.querySelectorAll(".av__cell--active, .av__cell--select")) || [];
                if (cellElements.length === 0) {
                    nodeElement.querySelectorAll(".av__row--select:not(.av__row--header)").forEach(rowElement => {
                        rowElement.querySelectorAll(".av__cell").forEach(cellElement => {
                            cellElements.push(cellElement);
                        });
                    });
                }
                if (cellElements.length > 0) {
                    html = "[";
                    cellElements.forEach((item: HTMLElement, index) => {
                        const cellText = getCellText(item);
                        if (index === 0 || (
                            cellElements[index - 1] !== item.previousElementSibling &&
                            !(item.previousElementSibling?.classList.contains("av__colsticky") && !cellElements[index - 1].nextElementSibling &&
                                cellElements[index - 1].parentElement === item.previousElementSibling)
                        )) {
                            html += "[";
                        }
                        html += JSON.stringify(genCellValueByElement(getTypeByCellElement(item), item)) + ",";
                        if (index === cellElements.length - 1 || (
                            cellElements[index + 1] !== item.nextElementSibling &&
                            !(!item.nextElementSibling && item.parentElement.nextElementSibling === cellElements[index + 1])
                        )) {
                            html = html.substring(0, html.length - 1) + "],";
                            textPlain += cellText + "\n";
                        } else {
                            textPlain += cellText + "\t";
                        }
                    });
                    textPlain = textPlain.substring(0, textPlain.length - 1);
                    html = html.substring(0, html.length - 1) + "]";
                }
            } else if (selectTableElement) {
                const scrollLeft = nodeElement.firstElementChild.scrollLeft;
                const scrollTop = nodeElement.querySelector("table").scrollTop;
                const tableSelectElement = nodeElement.querySelector(".table__select") as HTMLElement;
                html = "<table>";
                nodeElement.querySelectorAll("tr").forEach(rowElement => {
                    const rowCells: HTMLTableCellElement[] = [];
                    rowElement.querySelectorAll("th, td").forEach((item: HTMLTableCellElement) => {
                        if (!item.classList.contains("fn__none") && isIncludeCell({
                            tableSelectElement,
                            scrollLeft,
                            scrollTop,
                            item,
                        })) {
                            rowCells.push(item);
                        }
                    });
                    if (rowCells.length > 0) {
                        html += "<tr>";
                        rowCells.forEach(cell => {
                            html += cell.outerHTML;
                        });
                        html += "</tr>";
                    }
                });
                html += "</table>";
                textPlain = protyle.lute.HTML2Md(html);
            } else {
                const tempElement = document.createElement("div");
                // https://github.com/lonelyor/SourceFlow/issues/5540
                const selectTypes = protyle.toolbar.getCurrentType(range);
                const spanElement = hasClosestByTag(range.startContainer, "SPAN");
                const headingElement = hasClosestByAttribute(range.startContainer, "data-type", "NodeHeading");
                const matchHeading = headingElement && headingElement.textContent.replace(Constants.ZWSP, "") === range.toString();
                if ((selectTypes.length > 0 && spanElement && spanElement.textContent.replace(Constants.ZWSP, "") === range.toString()) ||
                    matchHeading) {
                    if (matchHeading) {
                        // 复制标题 https://github.com/lonelyor/SourceFlow/issues/297
                        tempElement.append(headingElement.cloneNode(true));
                        // https://github.com/lonelyor/SourceFlow/issues/13232
                        headingElement.removeAttribute("fold");
                    } else if (!["DIV", "TD", "TH", "TR"].includes(range.startContainer.parentElement.tagName)) {
                        // 复制行内元素 https://github.com/lonelyor/SourceFlow/issues/191
                        tempElement.append(range.startContainer.parentElement.cloneNode(true));
                        emojiToMd(tempElement);
                    } else {
                        // 直接复制块 https://github.com/lonelyor/SourceFlow/issues/318
                        tempElement.append(range.cloneContents());
                        emojiToMd(tempElement);
                    }
                    html = tempElement.innerHTML;
                    textPlain = range.toString();
                } else if (selectImgElement) {
                    html = selectImgElement.outerHTML;
                    textPlain = selectImgElement.querySelector("img").getAttribute("data-src");
                } else if (selectTypes.length > 0 && range.startContainer.nodeType === 3 &&
                    range.startContainer.parentElement.tagName === "SPAN" &&
                    range.startContainer.parentElement === range.endContainer.parentElement) {
                    // 复制粗体等字体中的一部分
                    const attributes = range.startContainer.parentElement.attributes;
                    const spanElement = document.createElement("span");
                    for (let i = 0; i < attributes.length; i++) {
                        spanElement.setAttribute(attributes[i].name, attributes[i].value);
                    }
                    if (spanElement.getAttribute("data-type").indexOf("block-ref") > -1 &&
                        spanElement.getAttribute("data-subtype") === "d") {
                        // 需变为静态锚文本
                        spanElement.setAttribute("data-subtype", "s");
                    }
                    spanElement.textContent = range.toString();
                    html = spanElement.outerHTML;
                    textPlain = range.toString();
                } else {
                    tempElement.append(range.cloneContents());
                    emojiToMd(tempElement);
                    const inlineMathElement = hasClosestByAttribute(range.commonAncestorContainer, "data-type", "inline-math");
                    if (inlineMathElement) {
                        // 表格内复制数学公式
                        html = inlineMathElement.outerHTML;
                    } else {
                        html = tempElement.innerHTML;
                    }
                    // 不能使用 commonAncestorContainer
                    textPlain = tempElement.textContent;
                    if (hasClosestByAttribute(range.startContainer, "data-type", "NodeCodeBlock")) {
                        if (isEndOfBlock(range)) {
                            textPlain = textPlain.replace(/\n$/, "");
                        }
                        isInCodeBlock = true;
                    } else if (hasClosestByTag(range.startContainer, "TD") || hasClosestByTag(range.startContainer, "TH")) {
                        tempElement.innerHTML = tempElement.innerHTML.replace(/<br>/g, "\n").replace(/<br\/>/g, "\n");
                        textPlain = tempElement.textContent.endsWith("\n") ? tempElement.textContent.replace(/\n$/, "") : tempElement.textContent;
                    } else if (!hasClosestByTag(range.startContainer, "CODE")) {
                        textPlain = range.toString();
                    }
                }
            }
            if (protyle.disabled) {
                html = getEnableHTML(html);
            }
            textPlain = textPlain || protyle.lute.BlockDOM2StdMd(html).trimEnd();
            textPlain = removeZWJ(nbsp2space(textPlain)) // Replace non-breaking spaces with normal spaces when copying https://github.com/lonelyor/SourceFlow/issues/9382
                // Remove ZWSP when copying inline elements https://github.com/lonelyor/SourceFlow/issues/13882
                .replace(new RegExp(Constants.ZWSP, "g"), "");
            event.clipboardData.setData("text/plain", textPlain);

            if (!isInCodeBlock) {
                enableLuteMarkdownSyntax(protyle);
                const textSourceFlow = selectTableElement ? protyle.lute.HTML2BlockDOM(html) : html;
                restoreLuteMarkdownSyntax(protyle);
                const sourceFlowTemplate = document.createElement("template");
                sourceFlowTemplate.innerHTML = textSourceFlow;
                const selectionScope = resolveSelectionScope(range, protyle.wysiwyg.element);
                const canWriteSourceFlowHTML = canWriteInternalSourceFlowClipboard(selectionScope, sourceFlowTemplate.content);
                const standardHTML = sanitizeStandardClipboardHTML(removeZWJ(selectTableElement ? html : protyle.lute.BlockDOM2HTML(selectAVElement ? textPlain : html)));
                const textHTML = canWriteSourceFlowHTML ? appendSourceFlowClipboardHTMLComment(textSourceFlow, standardHTML) : standardHTML;
                if (canWriteSourceFlowHTML) {
                    event.clipboardData.setData(Constants.SOURCEFLOW_HTML_CLIPBOARD_MIME, textSourceFlow);
                }
                event.clipboardData.setData("text/html", textHTML);
                if (needClipboardWrite) {
                    try {
                        await navigator.clipboard.write([new ClipboardItem({
                            ["text/plain"]: textPlain,
                            ["text/html"]: textHTML,
                        })]);
                    } catch (e) {
                        console.log("Copy write clipboard error:", e);
                    }
                }
            }
        });

};
