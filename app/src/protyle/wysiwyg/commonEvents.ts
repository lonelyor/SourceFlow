import type {WYSIWYGEventContext} from "./shared";
import {registerCopyEvent} from "./commonEvents/copy";
import {registerMouseDownEvent} from "./commonEvents/mousedown";

export const bindCommonEvent = (wysiwyg: WYSIWYGEventContext, protyle: IProtyle) => {
    registerCopyEvent(wysiwyg, protyle);
    registerMouseDownEvent(wysiwyg, protyle);
};
