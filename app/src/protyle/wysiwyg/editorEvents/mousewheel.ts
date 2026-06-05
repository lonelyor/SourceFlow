import {
    hasClosestByClassName,
} from "../../util/hasClosest";
import {Constants} from "../../../constants";
import {fetchPost} from "../../../util/fetch";
import {onGet} from "../../util/onGet";
import {hideTooltip} from "../../../dialog/tooltip";

import type {WYSIWYGEditorEventState, WYSIWYGEventContext} from "../shared";

export const registerMouseWheelEvent = (wysiwyg: WYSIWYGEventContext, protyle: IProtyle, state: WYSIWYGEditorEventState) => {
        wysiwyg.element.addEventListener("mousewheel", (event: WheelEvent) => {
            hideTooltip();
            //
            // 不能使用上一版本的 timeStamp，否则一直滚动将导致间隔不够
            if (!state.preventGetTopHTML && !protyle.scroll.element.classList.contains("fn__none")) {
                if (event.deltaY < 0 && protyle.wysiwyg.element.firstElementChild.getAttribute("data-eof") !== "1" &&
                    (protyle.contentElement.clientHeight === protyle.contentElement.scrollHeight || protyle.contentElement.scrollTop === 0)) {
                    fetchPost("/api/filetree/getDoc", {
                        id: protyle.wysiwyg.element.firstElementChild.getAttribute("data-node-id"),
                        mode: 1,
                        size: window.sourceflow.config.editor.dynamicLoadBlocks,
                    }, getResponse => {
                        state.preventGetTopHTML = false;
                        onGet({
                            data: getResponse,
                            protyle,
                            action: [Constants.CB_GET_BEFORE, Constants.CB_GET_UNCHANGEID],
                        });
                    });
                    state.preventGetTopHTML = true;
                } else if (event.deltaY > 0 && protyle.wysiwyg.element.lastElementChild.getAttribute("data-eof") !== "2" &&
                    (protyle.contentElement.clientHeight === protyle.contentElement.scrollHeight ||
                        protyle.contentElement.clientHeight + Math.ceil(protyle.contentElement.scrollTop) >= protyle.contentElement.scrollHeight)) {
                    fetchPost("/api/filetree/getDoc", {
                        id: protyle.wysiwyg.element.lastElementChild.getAttribute("data-node-id"),
                        mode: 2,
                        size: window.sourceflow.config.editor.dynamicLoadBlocks,
                    }, getResponse => {
                        state.preventGetTopHTML = false;
                        onGet({
                            data: getResponse,
                            protyle,
                            action: [Constants.CB_GET_APPEND, Constants.CB_GET_UNCHANGEID],
                        });
                    });
                    state.preventGetTopHTML = true;
                }
            }
            if (event.deltaX === 0) {
                return;
            }
            // https://github.com/lonelyor/SourceFlow/issues/4099
            const tableElement = hasClosestByClassName(event.target as HTMLElement, "table");
            if (tableElement) {
                const tableSelectElement = tableElement.querySelector(".table__select") as HTMLElement;
                if (tableSelectElement?.style.width) {
                    tableSelectElement.removeAttribute("style");
                    window.sourceflow.menus.menu.remove();
                }
            }
        }, {passive: true});

};
