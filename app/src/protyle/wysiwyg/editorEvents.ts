import {registerClickEvents} from "./editorEvents/click";
import {registerContextMenuEvent} from "./editorEvents/contextmenu";
import {registerCutEvent} from "./editorEvents/cut";
import {registerFocusOutEvent} from "./editorEvents/focusout";
import {registerInputLifecycleEvents} from "./editorEvents/inputLifecycle";
import {registerMouseWheelEvent} from "./editorEvents/mousewheel";
import {registerPasteEvent} from "./editorEvents/paste";
import {registerPointerDownEvent} from "./editorEvents/pointer";
import type {WYSIWYGEditorEventState, WYSIWYGEventContext} from "./shared";
import {stickyRow} from "../render/av/row";

export const bindEvent = (wysiwyg: WYSIWYGEventContext, protyle: IProtyle) => {
    let resizeRaf = 0;
    protyle.observer = new ResizeObserver(() => {
        if (resizeRaf) {
            cancelAnimationFrame(resizeRaf);
        }
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = 0;
            const contentRect = protyle.contentElement.getBoundingClientRect();
            protyle.wysiwyg.element.querySelectorAll(".av").forEach((item: HTMLElement) => {
                if (item.querySelector(".av__scroll")) {
                    const rect = item.getBoundingClientRect();
                    if (rect.bottom >= contentRect.top - contentRect.height && rect.top <= contentRect.bottom + contentRect.height) {
                        stickyRow(item, contentRect, "all");
                    }
                }
            });
        });
    });

    const state: WYSIWYGEditorEventState = {
        beforeContextmenuRange: undefined,
        preventGetTopHTML: false,
        isComposition: false,
        timeout: undefined,
        mobileBlur: false,
    };

    registerFocusOutEvent(wysiwyg, protyle, state);
    registerCutEvent(wysiwyg, protyle, state);
    registerContextMenuEvent(wysiwyg, protyle, state);
    registerPointerDownEvent(wysiwyg, protyle, state);
    registerMouseWheelEvent(wysiwyg, protyle, state);
    registerPasteEvent(wysiwyg, protyle, state);
    registerInputLifecycleEvents(wysiwyg, protyle, state);
    registerClickEvents(wysiwyg, protyle, state);
};
