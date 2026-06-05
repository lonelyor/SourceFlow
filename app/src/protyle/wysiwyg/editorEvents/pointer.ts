import {
    hasClosestBlock,
} from "../../util/hasClosest";

import type {WYSIWYGEditorEventState, WYSIWYGEventContext} from "../shared";

export const registerPointerDownEvent = (wysiwyg: WYSIWYGEventContext, protyle: IProtyle, state: WYSIWYGEditorEventState) => {
        wysiwyg.element.addEventListener("pointerdown", () => {
            if (getSelection().rangeCount > 0) {
                state.beforeContextmenuRange = getSelection().getRangeAt(0);
            } else {
                state.beforeContextmenuRange = undefined;
            }
            /// #if BROWSER && !MOBILE
            if (protyle.breadcrumb) {
                const indentElement = protyle.breadcrumb.element.parentElement.querySelector('[data-type="indent"]');
                if (indentElement && getSelection().rangeCount > 0) {
                    setTimeout(() => {
                        const newRange = getSelection().getRangeAt(0);
                        const blockElement = hasClosestBlock(newRange.startContainer);
                        if (!blockElement) {
                            return;
                        }
                        const outdentElement = protyle.breadcrumb.element.parentElement.querySelector('[data-type="outdent"]');
                        if (blockElement.parentElement.classList.contains("li")) {
                            indentElement.removeAttribute("disabled");
                            outdentElement.removeAttribute("disabled");
                        } else {
                            indentElement.setAttribute("disabled", "true");
                            outdentElement.setAttribute("disabled", "true");
                        }
                    }, 520);
                }
            }
            /// #endif
        });

};
