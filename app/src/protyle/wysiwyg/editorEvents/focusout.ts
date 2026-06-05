import type {WYSIWYGEventContext} from "../shared";

export const registerFocusOutEvent = (wysiwyg: WYSIWYGEventContext, protyle: IProtyle) => {
        wysiwyg.element.addEventListener("focusout", () => {
            if (getSelection().rangeCount === 0) {
                return;
            }
            const range = getSelection().getRangeAt(0);
            if (wysiwyg.element === range.startContainer || wysiwyg.element.contains(range.startContainer)) {
                protyle.toolbar.range = range.cloneRange();
            }
        });

};
