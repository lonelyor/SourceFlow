import {registerClickEvents} from "./editorEvents/click";
import {registerContextMenuEvent} from "./editorEvents/contextmenu";
import {registerCutEvent} from "./editorEvents/cut";
import {registerFocusOutEvent} from "./editorEvents/focusout";
import {registerInputLifecycleEvents} from "./editorEvents/inputLifecycle";
import {registerMouseWheelEvent} from "./editorEvents/mousewheel";
import {registerPasteEvent} from "./editorEvents/paste";
import {registerPointerDownEvent} from "./editorEvents/pointer";
import type {WYSIWYGEditorEventState, WYSIWYGEventContext} from "./shared";
import {bindResizeObserver} from "./editorEvents/resizeObserver";

export const bindEvent = (wysiwyg: WYSIWYGEventContext, protyle: IProtyle) => {
    bindResizeObserver(protyle);

    const state: WYSIWYGEditorEventState = {
        beforeContextmenuRange: undefined,
        preventGetTopHTML: false,
        isComposition: false,
        timeout: undefined,
        mobileBlur: false,
    };

    registerFocusOutEvent(wysiwyg, protyle);
    registerCutEvent(wysiwyg, protyle, state);
    registerContextMenuEvent(wysiwyg, protyle, state);
    registerPointerDownEvent(wysiwyg, protyle, state);
    registerMouseWheelEvent(wysiwyg, protyle, state);
    registerPasteEvent(wysiwyg, protyle);
    registerInputLifecycleEvents(wysiwyg, protyle, state);
    registerClickEvents(wysiwyg, protyle, state);
};
