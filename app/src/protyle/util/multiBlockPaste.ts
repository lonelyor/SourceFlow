import * as dayjs from "dayjs";
import {Constants} from "../../constants";
import {processClonePHElement} from "../render/util";
import {getContenteditableElement} from "../wysiwyg/getBlock";
import {hasClosestByAttribute} from "./hasClosest";
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

const isListItemElement = (element: Element) => {
    return element.getAttribute("data-type") === "NodeListItem";
};

const isListContainer = (element: Element) => {
    return element.getAttribute("data-type") === "NodeList";
};

const getListItemChildBlocks = (listItemElement: Element) => {
    return Array.from(listItemElement.children).filter((item: HTMLElement) => item.getAttribute("data-node-id")) as HTMLElement[];
};

const isStructuralChildElement = (element: Element) => {
    return element.classList.contains("protyle-action") || element.classList.contains("protyle-attr");
};

// 简单列表项：块级子元素只有一个文本块，其余仅允许 protyle-action/protyle-attr，
// 不含嵌套列表、引用块等复杂结构
const isSimpleListItem = (element: HTMLElement) => {
    if (!isListItemElement(element)) {
        return false;
    }
    const childBlocks = getListItemChildBlocks(element);
    if (childBlocks.length !== 1 || !isTextBlock(childBlocks[0])) {
        return false;
    }
    return Array.from(element.children).every((item: Element) => item.getAttribute("data-node-id") || isStructuralChildElement(item));
};

// 选区边界所属的替换单元：普通文本块是块自身；列表项内的文本块归并到所在 li，
// 保证事务以列表项为粒度增删，避免破坏列表结构
const getUnitElement = (blockElement: HTMLElement): HTMLElement | undefined => {
    const listItemElement = hasClosestByAttribute(blockElement, "data-type", "NodeListItem");
    if (listItemElement) {
        return listItemElement;
    }
    return isTextBlock(blockElement) ? blockElement : undefined;
};

// 从 startUnit 沿兄弟链收集覆盖单元直到 endUnit；结构歧义时返回 undefined 交由上层降级。
// 只允许向包含 endUnit 的唯一列表容器下降一次；引用块/callout 等容器、跨列表、
// 嵌套列表都会产生歧义，必须走纯文本流降级，不做半结构删除。
const collectCoveredUnits = (startUnit: HTMLElement, endUnit: HTMLElement) => {
    const units: HTMLElement[] = [];
    const listContainers = new Set<Element>();
    let current: Element | null = startUnit;
    let descended = false;
    const trackContainer = (element: Element) => {
        if (isListItemElement(element) && element.parentElement) {
            listContainers.add(element.parentElement);
        } else if (isListContainer(element)) {
            listContainers.add(element);
        }
    };
    while (current) {
        if (current === endUnit) {
            trackContainer(current);
            units.push(current as HTMLElement);
            return units;
        }
        if (current.contains(endUnit)) {
            if (!descended && isListContainer(current) &&
                (listContainers.size === 0 || (listContainers.size === 1 && listContainers.has(current)))) {
                descended = true;
                current = current.firstElementChild;
                continue;
            }
            return undefined;
        }
        trackContainer(current);
        if (listContainers.size > 1) {
            return undefined;
        }
        units.push(current as HTMLElement);
        current = current.nextElementSibling;
    }
    return undefined;
};

// 覆盖单元只允许普通文本块、简单列表项和全部子项均为简单列表项的列表容器；
// 引用块/callout、表格、代码块等整体覆盖时也降级，避免半删复杂结构
const isSafeCoveredUnit = (element: HTMLElement) => {
    if (isListItemElement(element)) {
        return isSimpleListItem(element);
    }
    if (isListContainer(element)) {
        const childItems = getListItemChildBlocks(element);
        return childItems.length > 0 && childItems.every(isSimpleListItem) &&
            Array.from(element.children).every((item: Element) => item.getAttribute("data-node-id") || item.classList.contains("protyle-attr"));
    }
    return isTextBlock(element);
};

// 克隆后的手术目标：普通文本块是克隆自身，简单列表项是其中唯一的文本块子块
const getSurgeryTarget = (unitClone: HTMLElement): HTMLElement | undefined => {
    if (!isListItemElement(unitClone)) {
        return unitClone;
    }
    const childBlocks = getListItemChildBlocks(unitClone);
    return childBlocks.length === 1 ? childBlocks[0] : undefined;
};

const resetCloneBlockIDs = (rootElement: HTMLElement) => {
    if (rootElement.getAttribute("data-node-id")) {
        resetPastedBlockID(rootElement);
    }
    rootElement.querySelectorAll("[data-node-id]").forEach((item) => {
        resetPastedBlockID(item as HTMLElement);
    });
    return rootElement;
};

// 锚点是列表项时，插入的文本块需包一层同结构列表项，保持列表语义完整
const wrapPastedBlockInListItem = (blockElement: HTMLElement, templateListItem: HTMLElement): HTMLElement | undefined => {
    const listItemClone = templateListItem.cloneNode(true) as HTMLElement;
    const target = getSurgeryTarget(listItemClone);
    if (!target) {
        return undefined;
    }
    target.replaceWith(blockElement);
    resetCloneBlockIDs(listItemClone);
    listItemClone.querySelectorAll('.protyle-action input[type="checkbox"]').forEach((item: HTMLInputElement) => {
        item.removeAttribute("checked");
    });
    return listItemClone;
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
    const startUnit = getUnitElement(startBlock);
    const endUnit = getUnitElement(endBlock);
    const units = startUnit && endUnit ? collectCoveredUnits(startUnit, endUnit) : undefined;
    if (scope.kind !== "multi-block-text" || !units || units.length < 2 || !units.every(isSafeCoveredUnit)) {
        collapseToSafeStart(range);
        return false;
    }

    const startOffset = getBoundaryOffset(getEditable(startBlock), range.startContainer, range.startOffset);
    const endOffset = getBoundaryOffset(getEditable(endBlock), range.endContainer, range.endOffset);
    if (typeof startOffset !== "number" || typeof endOffset !== "number") {
        collapseToSafeStart(range);
        return false;
    }

    const pastedBlocks = parsePastedTextBlocks(html, protyle);
    if (pastedBlocks.length === 0) {
        collapseToSafeStart(range);
        return false;
    }

    const startIsListItem = isListItemElement(startUnit);
    const endIsListItem = isListItemElement(endUnit);
    const endFullyCovered = endOffset >= getEditableTextLength(getEditable(endBlock));
    // 段落起点进入列表且列表尾部被整体选中：可能出现空列表且撤销锚点歧义，保守降级
    if (!startIsListItem && endIsListItem && endFullyCovered) {
        collapseToSafeStart(range);
        return false;
    }
    // 列表项边界且尾部未整体覆盖：两侧边界单元都以 update 保留，
    // 避免未选中的列表项后缀脱离列表结构
    const keepEndUnit = (startIsListItem || endIsListItem) && !endFullyCovered;
    const removedUnits = keepEndUnit ? units.slice(1, -1) : units.slice(1);
    const insertedBlocks = keepEndUnit ? pastedBlocks.slice(1, -1) : pastedBlocks.slice(1);

    const now = dayjs().format("YYYYMMDDHHmmss");
    const startClone = startUnit.cloneNode(true) as HTMLElement;
    const endClone = endUnit.cloneNode(true) as HTMLElement;
    const startTarget = getSurgeryTarget(startClone);
    const endTarget = getSurgeryTarget(endClone);
    if (!startTarget || !endTarget) {
        collapseToSafeStart(range);
        return false;
    }
    // 首尾部分区间只在克隆上删除，真实 DOM 在事务前保持不动
    deleteEditableRange(startTarget, startOffset, getEditableTextLength(getEditable(startTarget)));
    deleteEditableRange(endTarget, 0, endOffset);

    const startOldHTML = startUnit.outerHTML;
    const endOldHTML = endUnit.outerHTML;
    const removedOldHTMLs = removedUnits.map(unitElement => unitElement.outerHTML);
    const prefixHTML = getEditableHTML(startTarget);
    const suffixHTML = getEditableHTML(endTarget);
    const firstPastedBlock = pastedBlocks[0];
    const lastPastedBlock = pastedBlocks[pastedBlocks.length - 1];

    startClone.setAttribute("updated", now);
    if (keepEndUnit) {
        if (pastedBlocks.length === 1) {
            setEditableHTML(startTarget, `${prefixHTML}${getEditableHTML(firstPastedBlock)}<wbr>`);
            setEditableHTML(endTarget, suffixHTML);
        } else {
            setEditableHTML(startTarget, `${prefixHTML}${getEditableHTML(firstPastedBlock)}`);
            setEditableHTML(endTarget, `${getEditableHTML(lastPastedBlock)}<wbr>${suffixHTML}`);
        }
    } else {
        if (pastedBlocks.length === 1) {
            setEditableHTML(startTarget, `${prefixHTML}${getEditableHTML(firstPastedBlock)}<wbr>${suffixHTML}`);
        } else {
            setEditableHTML(startTarget, `${prefixHTML}${getEditableHTML(firstPastedBlock)}`);
            setEditableHTML(lastPastedBlock, `${getEditableHTML(lastPastedBlock)}<wbr>${suffixHTML}`);
        }
    }
    if (keepEndUnit) {
        endClone.setAttribute("updated", now);
    }

    let insertedElements = insertedBlocks;
    if (startIsListItem && insertedBlocks.length > 0) {
        const templateListItem = startUnit.cloneNode(true) as HTMLElement;
        const wrappedElements: HTMLElement[] = [];
        for (const blockElement of insertedBlocks) {
            const wrappedElement = wrapPastedBlockInListItem(blockElement, templateListItem);
            if (!wrappedElement) {
                collapseToSafeStart(range);
                return false;
            }
            wrappedElements.push(wrappedElement);
        }
        insertedElements = wrappedElements;
    }

    const doOperations: IOperation[] = [{
        action: "update",
        id: getBlockID(startUnit),
        data: startClone.outerHTML,
    }];
    const undoOperations: IOperation[] = [];

    removedUnits.forEach((unitElement) => {
        doOperations.push({
            action: "delete",
            id: getBlockID(unitElement),
        });
    });

    let previousID = getBlockID(startUnit);
    insertedElements.forEach((blockElement) => {
        doOperations.push(buildInsertOperation(blockElement, previousID));
        previousID = getBlockID(blockElement);
    });

    if (keepEndUnit) {
        doOperations.push({
            action: "update",
            id: getBlockID(endUnit),
            data: endClone.outerHTML,
        });
    }

    insertedElements.slice().reverse().forEach((blockElement) => {
        undoOperations.push({
            action: "delete",
            id: getBlockID(blockElement),
        });
    });
    const sameUnitContainer = startUnit.parentElement === endUnit.parentElement;
    removedUnits.forEach((unitElement, index) => {
        const previousRemovedUnit = removedUnits[index - 1];
        if (index === 0 && !sameUnitContainer) {
            // 下降进入列表时，被覆盖的列表项位于保留的 endUnit 之前，撤销需插回其前方
            undoOperations.push({
                action: "insert",
                data: removedOldHTMLs[index],
                id: getBlockID(unitElement),
                nextID: getBlockID(endUnit),
            });
            return;
        }
        undoOperations.push(buildInsertUndoOperation(
            unitElement,
            removedOldHTMLs[index],
            previousRemovedUnit ? getBlockID(previousRemovedUnit) : getBlockID(startUnit)
        ));
    });
    undoOperations.push({
        action: "update",
        id: getBlockID(startUnit),
        data: startOldHTML,
    });
    if (keepEndUnit) {
        undoOperations.push({
            action: "update",
            id: getBlockID(endUnit),
            data: endOldHTML,
        });
    }

    startUnit.replaceWith(startClone);
    deleteBlocksFromDOM(removedUnits);
    const focusElement = insertBlocksAfter(startClone, insertedElements);
    if (keepEndUnit) {
        endUnit.replaceWith(endClone);
        focusByWbr(pastedBlocks.length === 1 ? startClone : endClone, range);
    } else {
        focusByWbr(focusElement || startClone, range);
    }

    transaction(protyle, doOperations, undoOperations);
    return true;
};
