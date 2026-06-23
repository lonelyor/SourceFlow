import {fetchPost, fetchSyncPost} from "../../../util/fetch";
import {focusBlock, focusByWbr, focusSideBlock, getEditorRange} from "../../util/selection";
import {getContenteditableElement, getFirstBlock, getTopAloneElement} from "../getBlock";
import {Constants} from "../../../constants";
import {blockRender} from "../../render/blockRender";
import {processRender} from "../../util/processCode";
import {highlightRender} from "../../render/highlightRender";
import {hasClosestBlock, hasClosestByAttribute, hasTopClosestByAttribute, isInEmbedBlock} from "../../util/hasClosest";
import {setFold, zoomOut} from "../../../menus/protyle";
import {disabledProtyle, enableProtyle, onGet} from "../../util/onGet";
/// #if !MOBILE
import {getAllModels} from "../../../layout/getAll";
/// #endif
import {avRender, refreshAV} from "../../render/av/render";
import {removeFoldHeading} from "../../util/heading";
import {cancelSB, genEmptyElement, genSBElement} from "../../../block/util";
import {hideElements} from "../../ui/hideElements";
import {reloadProtyle} from "../../util/reload";
import {countBlockWord} from "../../../layout/status";
import {resize} from "../../util/resize";
import {processClonePHElement} from "../../render/util";
import {scrollCenter} from "../../../util/highlightById";
import {getFullWidthAttr, getReadonlyAttr, isAVStaticTextAttr} from "../../../util/attrCompat";

import {transaction, updateTransaction} from "./runtime";

export const turnsIntoOneTransaction = async (options: {
    protyle: IProtyle,
    selectsElement: Element[],
    type: TTurnIntoOne,
    level?: TTurnIntoOneSub,
    unfocus?: boolean,
    getOperations?: boolean,
}) => {
    let parentElement: Element;
    const id = Lute.NewNodeID();
    if (options.type === "BlocksMergeSuperBlock") {
        parentElement = genSBElement(options.level, id);
    } else if (options.type === "Blocks2Blockquote") {
        parentElement = document.createElement("div");
        parentElement.classList.add("bq");
        parentElement.setAttribute("data-node-id", id);
        parentElement.setAttribute("data-type", "NodeBlockquote");
        parentElement.innerHTML = `<div class="protyle-attr" contenteditable="false">${Constants.ZWSP}</div>`;
    } else if (options.type === "Blocks2Callout") {
        parentElement = document.createElement("div");
        parentElement.classList.add("callout");
        parentElement.setAttribute("data-node-id", id);
        parentElement.setAttribute("data-type", "NodeCallout");
        parentElement.setAttribute("contenteditable", "false");
        parentElement.setAttribute("data-subtype", "NOTE");
        parentElement.innerHTML = `<div class="callout-info"><span class="callout-icon">✏️</span><span class="callout-title">Note</span></div><div class="callout-content"></div><div class="protyle-attr" contenteditable="false">${Constants.ZWSP}</div>`;
    } else if (options.type.endsWith("Ls")) {
        parentElement = document.createElement("div");
        parentElement.classList.add("list");
        parentElement.setAttribute("data-node-id", id);
        parentElement.setAttribute("data-type", "NodeList");
        if (options.type === "Blocks2ULs") {
            parentElement.setAttribute("data-subtype", "u");
        } else if (options.type === "Blocks2OLs") {
            parentElement.setAttribute("data-subtype", "o");
        } else {
            parentElement.setAttribute("data-subtype", "t");
        }
        let html = "";
        options.selectsElement.forEach((item, index) => {
            if (options.type === "Blocks2ULs") {
                html += `<div data-marker="*" data-subtype="u" data-node-id="${Lute.NewNodeID()}" data-type="NodeListItem" class="li"><div class="protyle-action" draggable="true"><svg><use xlink:href="#iconDot"></use></svg></div><div class="protyle-attr" contenteditable="false"></div></div>`;
            } else if (options.type === "Blocks2OLs") {
                html += `<div data-marker="${index + 1}." data-subtype="o" data-node-id="${Lute.NewNodeID()}" data-type="NodeListItem" class="li"><div class="protyle-action protyle-action--order" contenteditable="false" draggable="true">${index + 1}.</div><div class="protyle-attr" contenteditable="false"></div></div>`;
            } else {
                html += `<div data-marker="*" data-subtype="t" data-node-id="${Lute.NewNodeID()}" data-type="NodeListItem" class="li"><div class="protyle-action protyle-action--task" draggable="true"><svg><use xlink:href="#iconUncheck"></use></svg></div><div class="protyle-attr" contenteditable="false"></div></div>`;
            }
        });
        parentElement.innerHTML = html + '<div class="protyle-attr" contenteditable="false"></div>';
    }
    const previousId = options.selectsElement[0].getAttribute("data-node-id");
    const parentId = options.selectsElement[0].parentElement.getAttribute("data-node-id") || options.protyle.block.parentID;
    const doOperations: IOperation[] = [{
        action: "insert",
        id,
        data: parentElement.outerHTML,
        nextID: previousId,
        parentID: parentId
    }];
    const undoOperations: IOperation[] = [];
    if (options.selectsElement[0].previousElementSibling) {
        options.selectsElement[0].before(parentElement);
    } else {
        options.selectsElement[0].parentElement.prepend(parentElement);
    }
    let itemPreviousId: string;
    options.selectsElement.forEach((item, index) => {
        item.classList.remove("protyle-wysiwyg--select");
        item.removeAttribute("select-start");
        item.removeAttribute("select-end");
        const itemId = item.getAttribute("data-node-id");
        undoOperations.push({
            action: "move",
            id: itemId,
            previousID: itemPreviousId || id,
            parentID: parentId
        });
        if (options.type.endsWith("Ls")) {
            doOperations.push({
                action: "move",
                id: itemId,
                parentID: parentElement.children[index].getAttribute("data-node-id")
            });
            parentElement.children[index].firstElementChild.after(item);
        } else if (options.type === "Blocks2Callout") {
            doOperations.push({
                action: "move",
                id: itemId,
                previousID: itemPreviousId,
                parentID: id
            });
            parentElement.querySelector(".callout-content").insertAdjacentElement("beforeend", item);
        } else {
            doOperations.push({
                action: "move",
                id: itemId,
                previousID: itemPreviousId,
                parentID: id
            });
            parentElement.lastElementChild.before(item);
        }
        itemPreviousId = item.getAttribute("data-node-id");

        if (index === options.selectsElement.length - 1) {
            undoOperations.push({
                action: "delete",
                id,
            });
        }
        // 超级块内嵌入块无面包屑，需重新渲染 https://github.com/lonelyor/SourceFlow/issues/7574
        if (item.getAttribute("data-type") === "NodeBlockQueryEmbed") {
            item.removeAttribute("data-render");
            blockRender(options.protyle, item);
        }
    });
    if ((["Blocks2Blockquote", "Blocks2Callout"].includes(options.type) || options.type.endsWith("Ls")) &&
        parentElement.parentElement.classList.contains("sb") && parentElement.parentElement.childElementCount === 2) {
        const cancelOperations = await cancelSB(options.protyle, parentElement.parentElement);
        doOperations.push(...cancelOperations.doOperations);
        undoOperations.splice(0, 0, ...cancelOperations.undoOperations);
    }
    if (options.getOperations) {
        return {
            doOperations,
            undoOperations,
        };
    }
    transaction(options.protyle, doOperations, undoOperations);
    if (!options.unfocus) {
        focusBlock(options.protyle.wysiwyg.element.querySelector(`[data-node-id="${options.selectsElement[0].getAttribute("data-node-id")}"]`));
    }
    hideElements(["gutter"], options.protyle);
};


export const turnsIntoTransaction = (options: {
    protyle: IProtyle,
    selectsElement?: Element[],
    nodeElement?: Element,
    type: TTurnInto,
    level?: number,
    isContinue?: boolean,
    range?: Range
}) => {
    // https://github.com/lonelyor/SourceFlow/issues/14505
    options.protyle.observerLoad?.disconnect();
    let selectsElement: Element[] = options.selectsElement;
    let range: Range;
    // 通过快捷键触发
    if (options.nodeElement) {
        range = getSelection().getRangeAt(0);
        range.insertNode(document.createElement("wbr"));
        selectsElement = Array.from(options.protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
        if (selectsElement.length === 0) {
            selectsElement = [options.nodeElement];
        }
        let isContinue = false;
        let isList = false;
        selectsElement.find((item, index) => {
            if (item.classList.contains("li")) {
                isList = true;
                return true;
            }
            if (item.nextElementSibling && selectsElement[index + 1] &&
                item.nextElementSibling === selectsElement[index + 1]) {
                isContinue = true;
            } else if (index !== selectsElement.length - 1) {
                isContinue = false;
                return true;
            }
        });
        if (isList) {
            return;
        }
        if (selectsElement.length === 1 && options.type === "Blocks2Hs" &&
            selectsElement[0].getAttribute("data-type") === "NodeHeading" &&
            options.level === parseInt(selectsElement[0].getAttribute("data-subtype").substr(1))) {
            // 快捷键同级转换，消除标题
            options.type = "Blocks2Ps";
        }
        options.isContinue = isContinue;
    }

    let html = "";
    const doOperations: IOperation[] = [];
    const undoOperations: IOperation[] = [];
    let previousId: string;
    selectsElement.forEach((item: HTMLElement, index) => {
        item.classList.remove("protyle-wysiwyg--select");
        item.removeAttribute("select-start");
        item.removeAttribute("select-end");
        html += item.outerHTML;
        const id = item.getAttribute("data-node-id");

        const tempElement = document.createElement("template");
        if (!options.isContinue || options.level) {
            // @ts-ignore
            let newHTML = options.protyle.lute[options.type](item.outerHTML, options.level);
            tempElement.innerHTML = newHTML;

            if (!tempElement.content.querySelector(`[data-node-id="${id}"]`)) {
                undoOperations.push({
                    action: "insert",
                    id,
                    previousID: previousId || item.previousElementSibling?.getAttribute("data-node-id"),
                    data: item.outerHTML,
                    parentID: item.parentElement?.getAttribute("data-node-id") || options.protyle.block.parentID || options.protyle.block.rootID,
                });
                Array.from(tempElement.content.children).forEach((tempItem: HTMLElement) => {
                    const tempItemId = tempItem.getAttribute("data-node-id");
                    doOperations.push({
                        action: "insert",
                        id: tempItemId,
                        previousID: tempItem.previousElementSibling?.getAttribute("data-node-id") || item.previousElementSibling?.getAttribute("data-node-id"),
                        data: tempItem.outerHTML,
                        parentID: item.parentElement?.getAttribute("data-node-id") || options.protyle.block.parentID || options.protyle.block.rootID,
                    });
                    undoOperations.splice(0, 0, {
                        action: "delete",
                        id: tempItemId,
                    });
                });
                doOperations.push({
                    action: "delete",
                    id,
                });
                if (item === selectsElement[index + 1]?.previousElementSibling) {
                    previousId = id;
                } else {
                    previousId = undefined;
                }
            } else {
                let foldData;
                if (item.getAttribute("data-type") === "NodeHeading" && item.getAttribute("fold") === "1" &&
                    tempElement.content.firstElementChild.getAttribute("data-subtype") !== item.dataset.subtype) {
                    foldData = setFold(options.protyle, item, undefined, undefined, false, true);
                    newHTML = newHTML.replace(' fold="1"', "");
                }
                if (foldData && foldData.doOperations?.length > 0) {
                    doOperations.push(...foldData.doOperations);
                }
                undoOperations.push({
                    action: "update",
                    id,
                    data: item.outerHTML,
                });
                doOperations.push({
                    action: "update",
                    id,
                    data: newHTML
                });
                if (foldData && foldData.undoOperations?.length > 0) {
                    undoOperations.push(...foldData.undoOperations);
                }
            }
            item.outerHTML = newHTML;
        } else {
            undoOperations.push({
                action: "insert",
                id,
                previousID: doOperations[doOperations.length - 1]?.id || item.previousElementSibling?.getAttribute("data-node-id"),
                data: item.outerHTML,
                parentID: item.parentElement?.getAttribute("data-node-id") || options.protyle.block.parentID || options.protyle.block.rootID,
            });
            doOperations.push({
                action: "delete",
                id,
            });
            if (index === selectsElement.length - 1) {
                // @ts-ignore
                const newHTML = options.protyle.lute[options.type](html, options.level);
                tempElement.innerHTML = newHTML;
                Array.from(tempElement.content.children).forEach((tempItem: HTMLElement) => {
                    const tempItemId = tempItem.getAttribute("data-node-id");
                    doOperations.push({
                        action: "insert",
                        id: tempItemId,
                        previousID: tempItem.previousElementSibling?.getAttribute("data-node-id") || item.previousElementSibling?.getAttribute("data-node-id"),
                        data: tempItem.outerHTML,
                        parentID: item.parentElement?.getAttribute("data-node-id") || options.protyle.block.parentID || options.protyle.block.rootID,
                    });
                    undoOperations.splice(0, 0, {
                        action: "delete",
                        id: tempItemId,
                    });
                });
                item.outerHTML = newHTML;
            } else {
                item.remove();
            }
        }
    });
    transaction(options.protyle, doOperations, undoOperations);
    processRender(options.protyle.wysiwyg.element);
    highlightRender(options.protyle.wysiwyg.element);
    avRender(options.protyle.wysiwyg.element, options.protyle);
    blockRender(options.protyle, options.protyle.wysiwyg.element);
    if (range || options.range) {
        focusByWbr(options.protyle.wysiwyg.element, range || options.range);
    } else {
        focusBlock(options.protyle.wysiwyg.element.querySelector(`[data-node-id="${selectsElement[0].getAttribute("data-node-id")}"]`));
    }
    hideElements(["gutter"], options.protyle);
};

export const turnsOneInto = async (options: {
    protyle: IProtyle,
    nodeElement: Element,
    id: string,
    type: string,
    level?: number
}) => {
    if (!options.nodeElement.querySelector("wbr")) {
        getContenteditableElement(options.nodeElement)?.insertAdjacentHTML("afterbegin", "<wbr>");
    }
    if (["CancelBlockquote", "CancelList", "CancelCallout"].includes(options.type)) {
        for (const item of options.nodeElement.querySelectorAll('[data-type="NodeHeading"][fold="1"]')) {
            const itemId = item.getAttribute("data-node-id");
            item.removeAttribute("fold");
            const response = await fetchSyncPost("/api/transactions", {
                session: options.protyle.id,
                app: Constants.SOURCEFLOW_APPID,
                transactions: [{
                    doOperations: [{
                        action: "unfoldHeading",
                        id: itemId,
                    }],
                    undoOperations: [{
                        action: "foldHeading",
                        id: itemId
                    }],
                }]
            });
            options.protyle.undo.add([{
                action: "unfoldHeading",
                id: itemId,
            }], [{
                action: "foldHeading",
                id: itemId
            }], options.protyle);
            item.insertAdjacentHTML("afterend", response.data[0].doOperations[0].retData);
        }
    }
    const oldHTML = options.nodeElement.outerHTML;
    let previousId = options.nodeElement.previousElementSibling?.getAttribute("data-node-id");
    if (!options.nodeElement.previousElementSibling && options.protyle.block.showAll) {
        const response = await fetchSyncPost("/api/block/getBlockRelevantIDs", {id: options.id});
        previousId = response.data.previousID;
    }
    const parentId = options.nodeElement.parentElement.getAttribute("data-node-id") || options.protyle.block.parentID;
    // @ts-ignore
    const newHTML = options.protyle.lute[options.type](options.nodeElement.outerHTML, options.level);
    options.nodeElement.outerHTML = newHTML;
    if (["CancelBlockquote", "CancelList", "CancelCallout"].includes(options.type)) {
        const tempElement = document.createElement("template");
        tempElement.innerHTML = newHTML;
        const doOperations: IOperation[] = [{
            action: "delete",
            id: options.id
        }];
        const undoOperations: IOperation[] = [];
        let tempPreviousId = previousId;
        Array.from(tempElement.content.children).forEach((item) => {
            const tempId = item.getAttribute("data-node-id");
            doOperations.push({
                action: "insert",
                data: item.outerHTML,
                id: tempId,
                previousID: tempPreviousId,
                parentID: parentId
            });
            undoOperations.push({
                action: "delete",
                id: tempId
            });
            tempPreviousId = tempId;
        });
        undoOperations.push({
            action: "insert",
            data: oldHTML,
            id: options.id,
            previousID: previousId,
            parentID: parentId
        });
        transaction(options.protyle, doOperations, undoOperations);
    } else {
        updateTransaction(options.protyle, options.id, newHTML, oldHTML);
    }
    focusByWbr(options.protyle.wysiwyg.element, getEditorRange(options.protyle.wysiwyg.element));
    options.protyle.wysiwyg.element.querySelectorAll('[data-type~="block-ref"]').forEach(item => {
        if (item.textContent === "") {
            fetchPost("/api/block/getRefText", {id: item.getAttribute("data-id")}, (response) => {
                item.innerHTML = response.data;
            });
        }
    });
    blockRender(options.protyle, options.protyle.wysiwyg.element);
    processRender(options.protyle.wysiwyg.element);
    highlightRender(options.protyle.wysiwyg.element);
    avRender(options.protyle.wysiwyg.element, options.protyle);
};

let transactionsTimeout: number;
