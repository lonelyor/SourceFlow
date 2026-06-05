import {Constants} from "../../constants";
import {isMobile} from "../../util/functions";
import {dropEvent} from "../util/editorCommonEvent";
import {keydown} from "./keydown";
import {getFullWidthAttr} from "../../util/attrCompat";
import {applyEditorStructureGuideClasses} from "../util/structureGuide";
import {isNoteStyleId, applyNoteStyle} from "../../editor/noteStylePresets";

import {bindCommonEvent as bindCommonEventImpl} from "./commonEvents";
import {bindEvent as bindEditorEventImpl} from "./editorEvents";
import {emojiToMd as emojiToMdImpl, escapeInline as escapeInlineImpl, setEmptyOutline as setEmptyOutlineImpl} from "./helpers";
import type {WYSIWYGEventContext} from "./shared";

export class WYSIWYG {
    public lastHTMLs: { [key: string]: string } = {};
    public element: HTMLDivElement;
    public preventKeyup: boolean;

    private preventClick: boolean;

    constructor(protyle: IProtyle) {
        this.element = document.createElement("div");
        this.element.className = "protyle-wysiwyg";
        this.element.setAttribute("spellcheck", "false");
        if (isMobile()) {
            // iPhone，iPad 端输入 contenteditable 为 true 时会在块中间插入 span
            // Android 端空块输入法弹出会收起
            this.element.setAttribute("contenteditable", "false");
        } else {
            this.element.setAttribute("contenteditable", "true");
        }
        if (window.sourceflow.config.editor.displayBookmarkIcon) {
            this.element.classList.add("protyle-wysiwyg--attr");
        }
        applyEditorStructureGuideClasses(this.element);
        this.bindCommonEvent(protyle);
        this.bindEvent(protyle);
        if (protyle.options.action.includes(Constants.CB_GET_HISTORY)) {
            return;
        }
        keydown(protyle, this.element);
        dropEvent(protyle, this.element);
    }

    public renderCustom(ial: IObject) {
        let isFullWidth = getFullWidthAttr(ial);
        if (!isFullWidth) {
            isFullWidth = window.sourceflow.config.editor.fullWidth ? "true" : "false";
        }
        if (isFullWidth === "true") {
            this.element.parentElement.setAttribute("data-fullwidth", "true");
        } else {
            this.element.parentElement.removeAttribute("data-fullwidth");
        }
        const ialKeys = Object.keys(ial);
        for (let i = 0; i < this.element.attributes.length; i++) {
            const oldKey = this.element.attributes[i].nodeName;
            if (!["type", "class", "spellcheck", "contenteditable", "data-doc-type", "style", "data-realwidth", "data-readonly"].includes(oldKey) &&
                !ialKeys.includes(oldKey)) {
                this.element.removeAttribute(oldKey);
                i--;
            }
        }
        ialKeys.forEach((key: string) => {
            if (!["title-img", "title", "updated", "icon", "id", "type", "class", "spellcheck", "contenteditable", "data-doc-type", "style", "data-realwidth", "data-readonly", "av-names"].includes(key)) {
                this.element.setAttribute(key, ial[key]);
            }
        });
        const noteStyleValue = ial["custom-note-style"] || this.element.getAttribute("data-note-style");
        if (noteStyleValue && isNoteStyleId(noteStyleValue)) {
            this.element.setAttribute("data-note-style", noteStyleValue);
            const protyleEl = this.element.closest(".protyle") as HTMLElement | null;
            if (protyleEl) {
                applyNoteStyle(protyleEl, noteStyleValue);
            }
        }
    }

    // text block-ref file-annotation-ref a 结尾处打字应为普通文本
    private escapeInline(protyle: IProtyle, range: Range, event: InputEvent) {
        return escapeInlineImpl(protyle, range, event);
    }

    private setEmptyOutline(protyle: IProtyle, element: HTMLElement) {
        return setEmptyOutlineImpl(protyle, element);
    }

    private emojiToMd(element: HTMLElement) {
        return emojiToMdImpl(element);
    }

    private bindCommonEvent(protyle: IProtyle) {
        return bindCommonEventImpl(this as unknown as WYSIWYGEventContext, protyle);
    }

    private bindEvent(protyle: IProtyle) {
        return bindEditorEventImpl(this as unknown as WYSIWYGEventContext, protyle);
    }
}
