import * as dayjs from "dayjs";
import {Constants} from "../../constants";
import {processClonePHElement} from "../render/util";
import {getContenteditableElement} from "../wysiwyg/getBlock";
import {transaction} from "../wysiwyg/transaction";
import {focusByOffset, focusByWbr} from "./selection";
import {resolveSelectionScope} from "./selectionScope";

const TEXT_BLOCK_TYPES = ["NodeParagraph", "NodeHeading"];

const getBlockID = (blockElement: HTMLElement) => {
    return blockElement.getAttribute("data-node-id") || "";
};

const getEditable = (blockElement: Element) => {
    return getContenteditableElement(blockElement) as HTMLElement;
};

const isTextBlock = (blockElement: HTMLElement) => {
    return TEXT_BLOCK_TYPES.includes(blockElement.getAttribute("data-type") || "") && !!getEditable(blockElement);
};

const getEditableTextLength = (editableElement: Element) => {
    return editableElement.textContent.length + editableElement.querySelectorAll("br").length;
};

const getBoundaryOffset = (editableElement: Element, container: Node, offset: number) => {
    if (container !== editableElement && !editableElement.contains(container)) {
        return undefined;
    }
    const boundaryRange = document.createRange();
    boundaryRange.selectNodeContents(editableElement);
    boundaryRange.setEnd(container, offset);
    return boundaryRange.toString().length + boundaryRange.cloneContents().querySelectorAll("br").length;
};

const deleteEditableRange = (blockElement: HTMLElement, start: number, end: number) => {
    if (start >= end) {
        return;
    }
    const deleteRange = focusByOffset(blockElement, start, end, false);
    if (deleteRange) {
        deleteRange.deleteContents();
    }
};

const normalizeEditableHTML = (html: string) => {
    return html === Constants.ZWSP ? "" : html;
};

const getEditableHTML = (blockElement: HTMLElement) => {
    return normalizeEditableHTML(getEditable(blockElement)?.innerHTML || "");
};

const setEditableHTML = (blockElement: HTMLElement, html: string) => {
    const editableElement = getEditable(blockElement);
    if (!editableElement) {
        return false;
    }
    editableElement.innerHTML = html || Constants.ZWSP;
    return true;
};

const collectSiblingBlocks = (startBlock: HTMLElement, endBlock: HTMLElement) => {
    if (startBlock.parentElement !== endBlock.parentElement) {
        return [];
    }
    const blocks: HTMLElement[] = [];
    let currentElement: Element | null = startBlock;
    while (currentElement) {
        if (currentElement.getAttribute("data-node-id")) {
            blocks.push(currentElement as HTMLElement);
        }
        if (currentElement === endBlock) {
            return blocks;
        }
        currentElement = currentElement.nextElementSibling;
    }
    return [];
};

const resetPastedBlockID = (blockElement: HTMLElement) => {
    const id = Lute.NewNodeID();
    blockElement.setAttribute("data-node-id", id);
    blockElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
    blockElement.classList.remove("protyle-wysiwyg--select");
    blockElement.removeAttribute("select-start");
    blockElement.removeAttribute("select-end");
    return blockElement;
};

const parsePastedTextBlocks = (html: string, protyle: IProtyle) => {
    let innerHTML = html.replace(/;;;lt;;;/g, "&lt;").replace(/;;;gt;;;/g, "&gt;");
    const template = document.createElement("template");
    template.innerHTML = innerHTML;
    if (!template.content.firstChild) {
        return [];
    }
    if (template.content.firstChild.nodeType === Node.TEXT_NODE ||
        (template.content.firstElementChild && template.content.firstElementChild.tagName !== "DIV")) {
        innerHTML = protyle.lute.SpinBlockDOM(innerHTML);
        template.innerHTML = innerHTML;
    }
    let blockElements = Array.from(template.content.children)
        .filter((item: HTMLElement) => item.getAttribute("data-node-id"))
        .map((item: HTMLElement) => resetPastedBlockID(item.cloneNode(true) as HTMLElement));

    if (blockElements.length === 0 || !blockElements.every(isTextBlock)) {
        const textContent = protyle.lute.BlockDOM2Content(innerHTML) || template.content.textContent || "";
        template.innerHTML = protyle.lute.Md2BlockDOM(textContent);
        blockElements = Array.from(template.content.children)
            .filter((item: HTMLElement) => item.getAttribute("data-node-id"))
            .map((item: HTMLElement) => resetPastedBlockID(item.cloneNode(true) as HTMLElement))
            .filter(isTextBlock);
    }
    return blockElements;
};

const insertBlocksAfter = (anchorElement: HTMLElement, blockElements: HTMLElement[]) => {
    let currentAnchor = anchorElement;
    blockElements.forEach((blockElement) => {
        currentAnchor.after(processClonePHElement(blockElement));
        currentAnchor = currentAnchor.nextElementSibling as HTMLElement;
    });
    return currentAnchor;
};

const deleteBlocksFromDOM = (blockElements: HTMLElement[]) => {
    blockElements.forEach((blockElement) => {
        blockElement.remove();
    });
};

const buildInsertOperation = (blockElement: HTMLElement, previousID: string): IOperation => {
    return {
        action: "insert",
        data: blockElement.outerHTML,
        id: getBlockID(blockElement),
        previousID,
    };
};

const buildInsertUndoOperation = (blockElement: HTMLElement, oldHTML: string, previousID: string): IOperation => {
    return {
        action: "insert",
        data: oldHTML,
        id: getBlockID(blockElement),
        previousID,
    };
};

const collapseToSafeStart = (range: Range) => {
    range.collapse(true);
};

export const replaceMultiBlockSelection = (protyle: IProtyle, range: Range, html: string) => {
    const scope = resolveSelectionScope(range, protyle.wysiwyg.element);
    if (!scope.crossesBlock) {
        return false;
    }
    const startBlock = scope.startBlock;
    const endBlock = scope.endBlock;
    if (!startBlock || !endBlock) {
        collapseToSafeStart(range);
        return false;
    }
    const affectedBlocks = collectSiblingBlocks(startBlock, endBlock);
    if (scope.kind !== "multi-block-text" || affectedBlocks.length < 2 || !affectedBlocks.every(isTextBlock)) {
        collapseToSafeStart(range);
        return false;
    }

    const startEditable = getEditable(startBlock);
    const endEditable = getEditable(endBlock);
    const startOffset = getBoundaryOffset(startEditable, range.startContainer, range.startOffset);
    const endOffset = getBoundaryOffset(endEditable, range.endContainer, range.endOffset);
    if (typeof startOffset !== "number" || typeof endOffset !== "number") {
        collapseToSafeStart(range);
        return false;
    }

    const pastedBlocks = parsePastedTextBlocks(html, protyle);
    if (pastedBlocks.length === 0) {
        collapseToSafeStart(range);
        return false;
    }

    const now = dayjs().format("YYYYMMDDHHmmss");
    const startClone = startBlock.cloneNode(true) as HTMLElement;
    const endClone = endBlock.cloneNode(true) as HTMLElement;
    deleteEditableRange(startClone, startOffset, getEditableTextLength(getEditable(startClone)));
    deleteEditableRange(endClone, 0, endOffset);

    const startOldHTML = startBlock.outerHTML;
    const removedBlocks = affectedBlocks.slice(1);
    const removedOldHTMLs = removedBlocks.map(blockElement => blockElement.outerHTML);
    const prefixHTML = getEditableHTML(startClone);
    const suffixHTML = getEditableHTML(endClone);
    const firstPastedBlock = pastedBlocks[0];
    const lastPastedBlock = pastedBlocks[pastedBlocks.length - 1];
    const insertedBlocks = pastedBlocks.slice(1);

    startClone.setAttribute("updated", now);
    if (pastedBlocks.length === 1) {
        setEditableHTML(startClone, `${prefixHTML}${getEditableHTML(firstPastedBlock)}<wbr>${suffixHTML}`);
    } else {
        setEditableHTML(startClone, `${prefixHTML}${getEditableHTML(firstPastedBlock)}`);
        setEditableHTML(lastPastedBlock, `${getEditableHTML(lastPastedBlock)}<wbr>${suffixHTML}`);
    }

    const doOperations: IOperation[] = [{
        action: "update",
        id: getBlockID(startBlock),
        data: startClone.outerHTML,
    }];
    const undoOperations: IOperation[] = [];

    removedBlocks.forEach((blockElement) => {
        doOperations.push({
            action: "delete",
            id: getBlockID(blockElement),
        });
    });

    let previousID = getBlockID(startBlock);
    insertedBlocks.forEach((blockElement) => {
        doOperations.push(buildInsertOperation(blockElement, previousID));
        previousID = getBlockID(blockElement);
    });

    insertedBlocks.slice().reverse().forEach((blockElement) => {
        undoOperations.push({
            action: "delete",
            id: getBlockID(blockElement),
        });
    });
    removedBlocks.forEach((blockElement, index) => {
        const previousRemovedBlock = removedBlocks[index - 1];
        undoOperations.push(buildInsertUndoOperation(
            blockElement,
            removedOldHTMLs[index],
            previousRemovedBlock ? getBlockID(previousRemovedBlock) : getBlockID(startBlock)
        ));
    });
    undoOperations.push({
        action: "update",
        id: getBlockID(startBlock),
        data: startOldHTML,
    });

    startBlock.replaceWith(startClone);
    deleteBlocksFromDOM(removedBlocks);
    const focusElement = insertBlocksAfter(startClone, insertedBlocks);
    focusByWbr(focusElement || startClone, range);

    transaction(protyle, doOperations, undoOperations);
    return true;
};
