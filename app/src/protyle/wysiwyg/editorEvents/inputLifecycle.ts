import {
    hasClosestBlock,
} from "../../util/hasClosest";
import {
    getEditorRange,
    setInsertWbrHTML,
} from "../../util/selection";
import {Constants} from "../../../constants";
import {input} from "../input";
import {updateTransaction} from "../transaction";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif
import {isMac, isOnlyMeta} from "../../util/compatibility";
import {countSelectWord} from "../../../layout/status";
import {clearSelect} from "../../util/clear";

import {escapeInline, setEmptyOutline} from "../helpers";
import type {WYSIWYGEditorEventState, WYSIWYGEventContext} from "../shared";

export const registerInputLifecycleEvents = (wysiwyg: WYSIWYGEventContext, protyle: IProtyle, state: WYSIWYGEditorEventState) => {
        wysiwyg.element.addEventListener("compositionstart", (event) => {
            state.isComposition = true;
            // 微软双拼由于 focusByRange 导致无法输入文字，因此不再 keydown 中记录了，但 keyup 会记录拼音字符，因此使用 state.isComposition 阻止 keyup 记录。
            // 但搜狗输入法选中后继续输入不走 keydown，state.isComposition 阻止了 keyup 记录，因此需在此记录。
            const range = getEditorRange(protyle.wysiwyg.element);
            const nodeElement = hasClosestBlock(range.startContainer);
            if (!isMac() && nodeElement) {
                setInsertWbrHTML(nodeElement, range, protyle);
            }
            event.stopPropagation();
        });

        wysiwyg.element.addEventListener("compositionend", (event: InputEvent) => {
            event.stopPropagation();
            state.isComposition = false;
            const range = getEditorRange(wysiwyg.element);
            const blockElement = hasClosestBlock(range.startContainer);
            if (!blockElement) {
                return;
            }
            if ("" !== event.data) {
                escapeInline(protyle, range, event);
                // 小鹤音形 ;k 不能使用 setTimeout;
                // wysiwyg.element contenteditable 为 false 时，连拼 needRender 必须为 false
                // hr 渲染；任务列表、粗体、数学公示结尾 needRender 必须为 true
                input(protyle, blockElement, range, true);
            } else {
                const id = blockElement.getAttribute("data-node-id");
                if (protyle.wysiwyg.lastHTMLs[id]) {
                    updateTransaction(protyle, id, blockElement.outerHTML, protyle.wysiwyg.lastHTMLs[id]);
                }
            }
        });

        wysiwyg.element.addEventListener("input", (event: InputEvent) => {
            const target = event.target as HTMLElement;
            if (target.tagName === "VIDEO" || target.tagName === "AUDIO" || event.inputType === "historyRedo") {
                return;
            }
            if (event.inputType === "historyUndo") {
                /// #if !BROWSER
                ipcRenderer.send(Constants.SOURCEFLOW_CMD, "redo");
                /// #endif
                window.sourceflow.menus.menu.remove();
                return;
            }
            const range = getEditorRange(wysiwyg.element);
            const blockElement = hasClosestBlock(range.startContainer);
            if (!blockElement) {
                return;
            }
            if ([":", "(", "【", "（", "[", "{", "「", "『", "#", "/", "、"].includes(event.data)) {
                protyle.hint.enableExtend = true;
            }
            if (event.isComposing || state.isComposition ||
                // https://github.com/lonelyor/SourceFlow/issues/337 编辑器内容拖拽问题
                event.inputType === "deleteByDrag" || event.inputType === "insertFromDrop"
            ) {
                return;
            }
            escapeInline(protyle, range, event);

            if ((/^\d{1}$/.test(event.data) || event.data === "‘" || event.data === "“" ||
                // 百度输入法中文反双引号 https://github.com/lonelyor/SourceFlow/issues/9686
                event.data === "”" ||
                event.data === "「")) {
                clearTimeout(state.timeout);  // https://github.com/lonelyor/SourceFlow/issues/9179
                state.timeout = window.setTimeout(() => {
                    input(protyle, blockElement, range, true); // 搜狗拼音数字后面句号变为点；Mac 反向双引号无法输入
                });
            } else {
                if (isMac() && event.data === "【】") {
                    setTimeout(() => {
                        input(protyle, blockElement, range, true, event);
                    }, Constants.TIMEOUT_INPUT);
                } else {
                    input(protyle, blockElement, range, true, event);
                }
            }
            event.stopPropagation();
        });

        wysiwyg.element.addEventListener("keyup", (event) => {
            const range = getEditorRange(wysiwyg.element).cloneRange();
            const nodeElement = hasClosestBlock(range.startContainer);

            if (event.key !== "PageUp" && event.key !== "PageDown" && event.key !== "Home" && event.key !== "End" &&
                event.key.indexOf("Arrow") === -1 && event.key !== "Escape" && event.key !== "Shift" &&
                event.key !== "Meta" && event.key !== "Alt" && event.key !== "Control" && event.key !== "CapsLock" &&
                !event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey &&
                !/^F\d{1,2}$/.test(event.key)) {
                // 搜狗输入法不走 keydown，没有选中字符后不走 compositionstart，需重新记录历史状态
                if (!isMac() && nodeElement &&
                    // 微软双拼 keyup 会记录拼音字符，因此在 compositionstart 记录
                    !state.isComposition &&
                    (typeof protyle.wysiwyg.lastHTMLs[nodeElement.getAttribute("data-node-id")] === "undefined" || range.toString() !== "" || !wysiwyg.preventKeyup)) {
                    setInsertWbrHTML(nodeElement, range, protyle);
                }
                wysiwyg.preventKeyup = false;
                return;
            }

            // 需放在 lastHTMLs 后，否则 https://github.com/lonelyor/SourceFlow/issues/4388
            if (wysiwyg.preventKeyup) {
                wysiwyg.preventKeyup = false;
                return;
            }

            if ((event.shiftKey || isOnlyMeta(event)) && !event.isComposing && range.toString() !== "") {
                // 工具栏
                protyle.toolbar.render(protyle, range, event);
                countSelectWord(range);
            }

            if (event.eventPhase !== 3 && !event.shiftKey && (event.key.indexOf("Arrow") > -1 || event.key === "Home" || event.key === "End" || event.key === "PageUp" || event.key === "PageDown") && !event.isComposing) {
                if (nodeElement) {
                    clearSelect(["img", "av"], protyle.wysiwyg.element);
                    setEmptyOutline(protyle, nodeElement);
                    if (range.toString() === "" && !nodeElement.classList.contains("protyle-wysiwyg--select")) {
                        countSelectWord(range, protyle.block.rootID);
                    }
                    if (protyle.breadcrumb) {
                        const indentElement = protyle.breadcrumb.element.parentElement.querySelector('[data-type="indent"]');
                        if (indentElement) {
                            const outdentElement = protyle.breadcrumb.element.parentElement.querySelector('[data-type="outdent"]');
                            if (nodeElement.parentElement.classList.contains("li")) {
                                indentElement.removeAttribute("disabled");
                                outdentElement.removeAttribute("disabled");
                            } else {
                                indentElement.setAttribute("disabled", "true");
                                outdentElement.setAttribute("disabled", "true");
                            }
                        }
                    }
                }
                event.stopPropagation();
            }

            // 按下方向键后块高亮跟随光标移动 https://github.com/lonelyor/SourceFlow/issues/8918
            if ((event.key === "ArrowLeft" || event.key === "ArrowRight") &&
                nodeElement && !nodeElement.classList.contains("protyle-wysiwyg--select")) {
                const selectElements = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
                let containRange = false;
                selectElements.find(item => {
                    if (item.contains(range.startContainer)) {
                        containRange = true;
                        return true;
                    }
                });
                if (!containRange && selectElements.length > 0) {
                    selectElements.forEach(item => {
                        item.classList.remove("protyle-wysiwyg--select");
                    });
                    nodeElement.classList.add("protyle-wysiwyg--select");
                }
            }
        });

};
