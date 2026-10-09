import {hideElements} from "../../ui/hideElements";
import {isNotCtrl} from "../../util/compatibility";
import {
    getEditorRange,
    setInsertWbrHTML,
} from "../../util/selection";
import {
    hasClosestBlock,
    hasClosestByAttribute,
} from "../../util/hasClosest";
import {
    isNotEditBlock,
} from "../getBlock";
import {matchHotKey} from "../../util/hotKey";
import {insertEmptyBlock} from "../../../block/util";
import {Constants} from "../../../constants";
import {avKeydown} from "../../render/av/keydown";

import type {KeydownContext, KeydownEvent} from "./shared";

export const prepareKeydownContext = (protyle: IProtyle, editorElement: HTMLElement, event: KeydownEvent): KeydownContext | null => {
        if (event.target.localName === "protyle-html" || event.target.localName === "input") {
            event.stopPropagation();
            return null;
        }
        if (hasClosestByAttribute(event.target, "data-type", "av-search")) {
            if (matchHotKey("⌘A", event)) {
                event.preventDefault();
                getSelection().getRangeAt(0).selectNodeContents(event.target);
            }
            event.stopPropagation();
            return null;
        }
        if (protyle.disabled || !protyle.selectElement.classList.contains("fn__none")) {
            event.stopPropagation();
            event.preventDefault();
            return null;
        }
        protyle.wysiwyg.preventKeyup = false;
        hideElements(["util"], protyle);
        if (event.shiftKey && event.key.indexOf("Arrow") > -1) {
            // 防止连续选中的时候抖动 https://github.com/lonelyor/SourceFlow/issues/657#issuecomment-851391217
        } else if (!event.repeat &&
            event.code !== "") { // 悬浮工具会触发但 code 为空 https://github.com/lonelyor/SourceFlow/issues/6573
            hideElements(["toolbar"], protyle);
        }
        const range = getEditorRange(protyle.wysiwyg.element);
        const nodeElement = hasClosestBlock(range.startContainer);
        if (!nodeElement) {
            return null;
        }

        //
        const endElement = hasClosestBlock(range.endContainer);
        if (!matchHotKey("⌘C", event) && endElement && nodeElement !== endElement) {
            event.stopPropagation();
            event.preventDefault();
            return null;
        }
        if (document.querySelector(".av__panel")) {
            return null;
        }
        if (avKeydown(event, nodeElement, protyle)) {
            return null;
        }

        if (nodeElement.classList.contains("protyle-wysiwyg--select") && isNotCtrl(event) && !event.shiftKey && !event.altKey) {
            if (event.key.toLowerCase() === "a") {
                event.stopPropagation();
                event.preventDefault();
                protyle.wysiwyg.element.blur();
                // 阻止中文输入的残留
                setTimeout(() => {
                    insertEmptyBlock(protyle, "afterend");
                }, 100);
                return null;
            } else if (event.key.toLowerCase() === "b") {
                event.stopPropagation();
                event.preventDefault();
                protyle.wysiwyg.element.blur();
                setTimeout(() => {
                    insertEmptyBlock(protyle, "beforebegin");
                }, 100);
                return null;
            }
        }
        if (event.isComposing) {
            event.stopPropagation();
            return null;
        }
        // https://github.com/lonelyor/SourceFlow/issues/2261
        if (!["⌘", "⇧", "⌥", "⌃"].includes(Constants.KEYCODELIST[event.keyCode])) {
            if (Constants.KEYCODELIST[event.keyCode] === "/" ||
                // 德语
                event.key === "/" ||
                // windows 中文
                (event.code === "Slash" && event.key === "Process" && event.keyCode === 229)) {
                protyle.hint.enableSlash = true;
            } else if (Constants.KEYCODELIST[event.keyCode] === "\\" ||
                // 德语
                event.key === "\\" ||
                // Mac 日文-罗马字 https://github.com/lonelyor/SourceFlow/issues/13725
                (event.key === "," && event.keyCode === 229) ||
                // windows 中文
                (event.code === "Backslash" && event.key === "Process" && event.keyCode === 229)) {
                protyle.hint.enableSlash = false;
                hideElements(["hint"], protyle);
                // 此处不能返回，否则无法撤销 https://github.com/lonelyor/SourceFlow/issues/2795
            }
        }
        // 有可能输入 shift+. ，因此需要使用 event.key 来进行判断
        if (typeof event.key === "string" && event.key !== "PageUp" && event.key !== "PageDown" && event.key !== "Home" && event.key !== "End" && event.key.indexOf("Arrow") === -1 &&
            event.key !== "Escape" && event.key !== "Shift" && event.key !== "Meta" && event.key !== "Alt" && event.key !== "Control" && event.key !== "CapsLock" &&
            !isNotEditBlock(nodeElement) && !/^F\d{1,2}$/.test(event.key) &&
            // 微软双拼使用 compositionstart，否则 focusByRange 导致无法输入文字
            event.key !== "Process") {
            setInsertWbrHTML(nodeElement, range, protyle);
            protyle.wysiwyg.preventKeyup = true;
        }

        if (!window.sourceflow.menus.menu.element.classList.contains("fn__none") &&
            (["←", "↑", "→", "↓"].includes(Constants.KEYCODELIST[event.keyCode]) || Constants.KEYCODELIST[event.keyCode] === "↩") &&
            !event.altKey && !event.shiftKey && isNotCtrl(event)) {
            event.preventDefault();
            return null;
        } else if (event.key !== "Escape") {
            window.sourceflow.menus.menu.remove();
        }

        if (!["Alt", "Meta", "Shift", "Control", "CapsLock", "Escape"].includes(event.key) && protyle.options.render.breadcrumb) {
            protyle.breadcrumb.hide();
        }
        return {
            protyle,
            editorElement,
            event,
            range,
            nodeElement: nodeElement as HTMLElement,
            nodeType: nodeElement.getAttribute("data-type") || "",
        };
};
