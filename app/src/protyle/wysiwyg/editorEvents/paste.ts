import {paste} from "../../util/paste";
import {
    hasClosestBlock,
    hasClosestByAttribute,
} from "../../util/hasClosest";
import {
    getSelectionOffset,
} from "../../util/selection";
import {
    getContenteditableElement
} from "../getBlock";
import type {WYSIWYGEventContext} from "../shared";

export const registerPasteEvent = (wysiwyg: WYSIWYGEventContext, protyle: IProtyle) => {
        wysiwyg.element.addEventListener("paste", (event: ClipboardEvent & { target: HTMLElement }) => {
            // https://github.com/lonelyor/SourceFlow/issues/11241
            if (hasClosestByAttribute(event.target, "data-type", "av-search")) {
                return;
            }
            if (protyle.disabled) {
                event.stopPropagation();
                event.preventDefault();
                return;
            }
            window.sourceflow.ctrlIsPressed = false; // https://github.com/lonelyor/SourceFlow/issues/6373
            // https://github.com/lonelyor/SourceFlow/issues/4600
            if (event.target.tagName === "PROTYLE-HTML" || event.target.localName === "input") {
                event.stopPropagation();
                return;
            }
            if (!hasClosestByAttribute(event.target, "contenteditable", "true")) {
                event.stopPropagation();
                event.preventDefault();
                return;
            }
            const blockElement = hasClosestBlock(event.target);
            if (blockElement && !getContenteditableElement(blockElement)) {
                event.stopPropagation();
                event.preventDefault();
                return;
            }
            if (!blockElement) {
                return;
            }
            // 链接，备注，样式，引用，pdf标注粘贴 https://github.com/lonelyor/SourceFlow/issues/11572
            const range = getSelection().getRangeAt(0);
            protyle.toolbar.range = range;
            const inlineElement = range.startContainer.parentElement;
            if (range.toString() === "" && inlineElement.tagName === "SPAN") {
                const currentTypes = (inlineElement.getAttribute("data-type") || "").split(" ");
                if (currentTypes.includes("inline-memo") || currentTypes.includes("text") ||
                    currentTypes.includes("block-ref") || currentTypes.includes("file-annotation-ref") ||
                    currentTypes.includes("a")) {
                    const offset = getSelectionOffset(inlineElement, blockElement, range);
                    if (offset.start === 0) {
                        range.setStartBefore(inlineElement);
                        range.collapse(true);
                    } else if (offset.start === inlineElement.textContent.length) {
                        range.setEndAfter(inlineElement);
                        range.collapse(false);
                    }
                }
            }
            paste(protyle, event);
        });

        // 输入法测试点 https://github.com/lonelyor/SourceFlow/issues/3027
};
