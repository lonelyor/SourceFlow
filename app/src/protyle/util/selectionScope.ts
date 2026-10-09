import {hasClosestBlock, hasClosestByAttribute, hasClosestByClassName} from "./hasClosest";
import {imageLinkToDataURL} from "../../util/image";

// 仅匹配本地相对路径图片（assets/...），排除 data:/blob:/协议 URL/协议相对 URL，
// 这类图片无法被飞书等外部应用访问，需内联为 base64；远程图片外部应用可自行抓取，保持原样。
const isInlineableImageSrc = (src: string) => {
    if (!src) {
        return false;
    }
    return !/^(data:|blob:|[a-z][a-z0-9+.-]*:|\/\/)/i.test(src);
};

export const hasLocalClipboardImages = (html: string) => {
    const template = document.createElement("template");
    template.innerHTML = html;
    return Array.from(template.content.querySelectorAll("img")).some((img: HTMLImageElement) =>
        isInlineableImageSrc(img.getAttribute("src") || ""));
};

export const inlineLocalImages = async (html: string) => {
    const template = document.createElement("template");
    template.innerHTML = html;
    const imgElements = Array.from(template.content.querySelectorAll("img")) as HTMLImageElement[];
    if (imgElements.length === 0) {
        return html;
    }
    await Promise.all(imgElements.map(async (img) => {
        const src = img.getAttribute("src") || "";
        if (!isInlineableImageSrc(src)) {
            return;
        }
        try {
            const dataURL = await imageLinkToDataURL(src);
            img.setAttribute("src", dataURL);
            if (img.getAttribute("data-src")) {
                img.setAttribute("data-src", dataURL);
            }
        } catch (e) {
            // 加载失败或 canvas 被污染（远程图）时跳过，保留原 src
        }
    }));
    return template.innerHTML;
};

export type TSelectionScopeKind =
    | "collapsed"
    | "single-block-text"
    | "multi-block-text"
    | "explicit-block"
    | "table"
    | "attribute-view"
    | "code"
    | "unsupported";

export interface ISelectionScope {
    kind: TSelectionScopeKind;
    startBlock?: HTMLElement;
    endBlock?: HTMLElement;
    blockIds: string[];
    crossesBlock: boolean;
    containsBlockDOM: boolean;
    isExplicitBlockSelection: boolean;
}

const toHTMLElement = (node: Node | null): HTMLElement | undefined => {
    if (!node) {
        return undefined;
    }
    return (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement;
};

const getBlockID = (blockElement?: HTMLElement) => {
    return blockElement?.getAttribute("data-node-id") || "";
};

const getSelectedBlockElements = (wysiwygElement: HTMLElement) => {
    return Array.from(wysiwygElement.querySelectorAll(".protyle-wysiwyg--select")) as HTMLElement[];
};

const getRangeFragment = (range: Range) => {
    try {
        return range.cloneContents();
    } catch (error) {
        console.warn("Failed to clone editor selection:", error);
        return document.createDocumentFragment();
    }
};

const getRangeBlockIds = (range: Range, wysiwygElement: HTMLElement) => {
    const ids: string[] = [];
    wysiwygElement.querySelectorAll("[data-node-id]").forEach((item: HTMLElement) => {
        try {
            if (range.intersectsNode(item)) {
                const id = item.getAttribute("data-node-id");
                if (id && !ids.includes(id)) {
                    ids.push(id);
                }
            }
        } catch (error) {
            // Detached range boundary nodes can make intersectsNode throw in Chromium.
        }
    });
    return ids;
};

const isRangeInEditor = (range: Range, wysiwygElement: HTMLElement) => {
    const startElement = toHTMLElement(range.startContainer);
    const endElement = toHTMLElement(range.endContainer);
    return !!startElement && !!endElement &&
        (wysiwygElement === startElement || wysiwygElement.contains(startElement)) &&
        (wysiwygElement === endElement || wysiwygElement.contains(endElement));
};

const hasTableSelection = (blockElement?: HTMLElement) => {
    const selectElement = blockElement?.querySelector(".table__select") as HTMLElement;
    return !!selectElement && selectElement.clientWidth > 0;
};

const hasAttributeViewSelection = (blockElement?: HTMLElement) => {
    return !!blockElement?.querySelector(".av__row--select, .av__cell--select");
};

const isCodeRange = (range: Range, startBlock?: HTMLElement, endBlock?: HTMLElement) => {
    return startBlock?.getAttribute("data-type") === "NodeCodeBlock" ||
        endBlock?.getAttribute("data-type") === "NodeCodeBlock" ||
        !!hasClosestByAttribute(range.startContainer, "data-type", "code") ||
        !!hasClosestByAttribute(range.endContainer, "data-type", "code") ||
        !!hasClosestByClassName(range.startContainer, "hljs") ||
        !!hasClosestByClassName(range.endContainer, "hljs");
};

export const resolveSelectionScope = (range: Range, wysiwygElement: HTMLElement): ISelectionScope => {
    const selectedBlockElements = getSelectedBlockElements(wysiwygElement);
    const isExplicitBlockSelection = selectedBlockElements.length > 0;
    const fragment = getRangeFragment(range);
    const containsBlockDOM = !!fragment.querySelector("[data-node-id]");

    if (!isRangeInEditor(range, wysiwygElement)) {
        return {
            kind: "unsupported",
            blockIds: selectedBlockElements.map(getBlockID).filter(Boolean),
            crossesBlock: false,
            containsBlockDOM,
            isExplicitBlockSelection,
        };
    }

    if (isExplicitBlockSelection) {
        return {
            kind: "explicit-block",
            startBlock: selectedBlockElements[0],
            endBlock: selectedBlockElements[selectedBlockElements.length - 1],
            blockIds: selectedBlockElements.map(getBlockID).filter(Boolean),
            crossesBlock: selectedBlockElements.length > 1,
            containsBlockDOM: true,
            isExplicitBlockSelection,
        };
    }

    const startBlock = hasClosestBlock(range.startContainer) as HTMLElement;
    const endBlock = hasClosestBlock(range.endContainer) as HTMLElement;
    const crossesBlock = !!startBlock && !!endBlock && startBlock !== endBlock;
    const blockIds = getRangeBlockIds(range, wysiwygElement);

    if (!startBlock || !endBlock) {
        return {
            kind: "unsupported",
            startBlock,
            endBlock,
            blockIds,
            crossesBlock,
            containsBlockDOM,
            isExplicitBlockSelection,
        };
    }

    if (hasTableSelection(startBlock) || hasTableSelection(endBlock) ||
        hasClosestByAttribute(range.startContainer, "data-type", "NodeTable") ||
        hasClosestByAttribute(range.endContainer, "data-type", "NodeTable")) {
        return {
            kind: "table",
            startBlock,
            endBlock,
            blockIds,
            crossesBlock,
            containsBlockDOM,
            isExplicitBlockSelection,
        };
    }

    if (hasAttributeViewSelection(startBlock) || hasAttributeViewSelection(endBlock) ||
        startBlock.classList.contains("av") || endBlock.classList.contains("av")) {
        return {
            kind: "attribute-view",
            startBlock,
            endBlock,
            blockIds,
            crossesBlock,
            containsBlockDOM,
            isExplicitBlockSelection,
        };
    }

    if (isCodeRange(range, startBlock, endBlock)) {
        return {
            kind: "code",
            startBlock,
            endBlock,
            blockIds,
            crossesBlock,
            containsBlockDOM,
            isExplicitBlockSelection,
        };
    }

    if (range.collapsed || range.toString() === "") {
        return {
            kind: "collapsed",
            startBlock,
            endBlock,
            blockIds: [getBlockID(startBlock)].filter(Boolean),
            crossesBlock: false,
            containsBlockDOM,
            isExplicitBlockSelection,
        };
    }

    return {
        kind: crossesBlock ? "multi-block-text" : "single-block-text",
        startBlock,
        endBlock,
        blockIds,
        crossesBlock,
        containsBlockDOM,
        isExplicitBlockSelection,
    };
};

export const assertInlineRangeWithinSingleBlock = (scope: ISelectionScope) => {
    return scope.kind === "collapsed" || scope.kind === "single-block-text";
};

export const canWriteInternalSourceFlowClipboard = (scope: ISelectionScope, fragment: DocumentFragment) => {
    if (scope.kind === "explicit-block" || scope.kind === "table" || scope.kind === "attribute-view") {
        return true;
    }
    if (scope.kind !== "single-block-text") {
        return false;
    }
    return !fragment.querySelector("[data-node-id]");
};

export const sanitizeStandardClipboardHTML = (html: string) => {
    const template = document.createElement("template");
    template.innerHTML = html;
    template.content.querySelectorAll(".protyle-attr").forEach(item => item.remove());
    template.content.querySelectorAll("*").forEach((item: HTMLElement) => {
        item.removeAttribute("data-node-id");
        item.removeAttribute("updated");
        item.removeAttribute("contenteditable");
        item.removeAttribute("spellcheck");
        item.removeAttribute("parent-heading");
        item.classList.remove("protyle-wysiwyg--select");
        item.removeAttribute("select-start");
        item.removeAttribute("select-end");
    });
    return template.innerHTML;
};
