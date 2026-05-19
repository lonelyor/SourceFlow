import {Divider} from "./Divider";
import {Font, hasSameTextStyle, setFontStyle} from "./Font";
import {ToolbarItem} from "./ToolbarItem";
import {
    fixTableRange,
    focusBlock,
    focusByRange,
    focusByWbr,
    getEditorRange,
    getSelectionPosition,
    selectAll,
    setFirstNodeRange,
    setLastNodeRange
} from "../util/selection";
import {hasClosestBlock, hasClosestByAttribute, hasClosestByClassName, hasClosestByTag} from "../util/hasClosest";
import {Link} from "./Link";
import {setPosition} from "../../util/setPosition";
import {transaction, updateTransaction} from "../wysiwyg/transaction";
import {Constants} from "../../constants";
import {copyPlainText, openByMobile, readClipboard, setStorageVal} from "../util/compatibility";
import {upDownHint} from "../../util/upDownHint";
import {highlightRender} from "../render/highlightRender";
import {getContenteditableElement, hasNextSibling, hasPreviousSibling} from "../wysiwyg/getBlock";
import {processRender} from "../util/processCode";
import {BlockRef} from "./BlockRef";
import {hintRenderTemplate, hintRenderWidget} from "../hint/extend";
import {blockRender} from "../render/blockRender";
/// #if !BROWSER
import {openBy} from "../../editor/util";
/// #endif
import {fetchPost} from "../../util/fetch";
import {isArrayEqual, isMobile} from "../../util/functions";
import * as dayjs from "dayjs";
import {insertEmptyBlock} from "../../block/util";
import {matchHotKey} from "../util/hotKey";
import {hideElements} from "../ui/hideElements";
import {electronUndo} from "../undo";
import {previewTemplate, toolbarKeyToMenu} from "./util";
import {hideMessage, showMessage} from "../../dialog/message";
import {InlineMath} from "./InlineMath";
import {InlineMemo} from "./InlineMemo";
import {mathRender} from "../render/mathRender";
import {linkMenu} from "../../menus/protyle";
import {addScript} from "../util/addScript";
import {confirmDialog} from "../../dialog/confirmDialog";
import {paste, pasteAsImage, pasteAsPlainText, pasteAsSmartTable, pasteEscaped, pastePreserveLayout} from "../util/paste";
import {escapeHtml} from "../../util/escape";
import {resizeSide} from "../../history/resizeSide";
import {showRenderPanel} from "./renderPanel";
import {buildToolbarItemElement, mergeToolbarNodes, updateToolbarLanguage} from "./shared";
import {showCodeLanguagePanel, showSelectionContentPanel, showTemplatePanel, showWidgetPanel} from "./searchPanels";
import {setToolbarInlineMark} from "./inlineMark";

export class Toolbar {
    public element: HTMLElement;
    public subElement: HTMLElement;
    public subElementCloseCB: () => void;
    public range: Range;
    public toolbarHeight: number;

    constructor(protyle: IProtyle) {
        const options = protyle.options;
        const element = document.createElement("div");
        element.className = "protyle-toolbar fn__none";
        this.element = element;
        this.subElement = document.createElement("div");
        /// #if MOBILE
        this.subElement.className = "protyle-util fn__none protyle-util--mobile";
        /// #else
        this.subElement.className = "protyle-util fn__none";
        /// #endif
        this.toolbarHeight = 29;
        protyle.app.plugins.forEach(item => {
            const pluginToolbar = item.updateProtyleToolbar(options.toolbar);
            pluginToolbar.forEach(toolbarItem => {
                if (typeof toolbarItem === "string" || Constants.INLINE_TYPE.concat("|").includes(toolbarItem.name)) {
                    return;
                }
                if (typeof toolbarItem.hotkey !== "string") {
                    toolbarItem.hotkey = "";
                }
                if (window.sourceflow.config.keymap.plugin && window.sourceflow.config.keymap.plugin[item.name] && window.sourceflow.config.keymap.plugin[item.name][toolbarItem.name]) {
                    toolbarItem.hotkey = window.sourceflow.config.keymap.plugin[item.name][toolbarItem.name].custom;
                }
            });
            options.toolbar = toolbarKeyToMenu(pluginToolbar);
        });
        options.toolbar.forEach((menuItem: IMenuItem) => {
            const itemElement = this.genItem(protyle, menuItem);
            this.element.appendChild(itemElement);
        });
    }

    public update(protyle: IProtyle) {
        this.element.innerHTML = "";
        protyle.options.toolbar = toolbarKeyToMenu(Constants.PROTYLE_TOOLBAR);
        protyle.app.plugins.forEach(item => {
            const pluginToolbar = item.updateProtyleToolbar(protyle.options.toolbar);
            pluginToolbar.forEach(toolbarItem => {
                if (typeof toolbarItem === "string" || Constants.INLINE_TYPE.concat("|").includes(toolbarItem.name)) {
                    return;
                }
                if (typeof toolbarItem.hotkey !== "string") {
                    toolbarItem.hotkey = "";
                }
                if (window.sourceflow.config.keymap.plugin && window.sourceflow.config.keymap.plugin[item.name] && window.sourceflow.config.keymap.plugin[item.name][toolbarItem.name]) {
                    toolbarItem.hotkey = window.sourceflow.config.keymap.plugin[item.name][toolbarItem.name].custom;
                }
            });
            protyle.options.toolbar = toolbarKeyToMenu(pluginToolbar);
        });
        protyle.options.toolbar.forEach((menuItem: IMenuItem) => {
            const itemElement = this.genItem(protyle, menuItem);
            this.element.appendChild(itemElement);
        });
    }

    public render(protyle: IProtyle, range: Range, event?: KeyboardEvent) {
        this.range = range;
        let typeRange = range;
        let nodeElement = hasClosestBlock(range.startContainer);
        if (isMobile() || !nodeElement || protyle.disabled || nodeElement.classList.contains("av") ||
            hasClosestByTag(range.startContainer, "CAPTION")) {
            this.element.classList.add("fn__none");
            return;
        }
        // https://github.com/lonelyor/SourceFlow/issues/5157
        let hasText = false;
        Array.from(range.cloneContents().childNodes).find(item => {
            // zwsp 不显示工具栏
            if (item.textContent.length > 0 && item.textContent !== Constants.ZWSP) {
                if (item.nodeType === 1 && (item as HTMLElement).classList.contains("img")) {
                    // 图片不显示工具栏
                } else {
                    hasText = true;
                    return true;
                }
            }
        });
        if (!hasText ||
            // 拖拽图片到最右侧
            (range.commonAncestorContainer.nodeType !== 3 && (range.commonAncestorContainer as HTMLElement).classList.contains("img"))) {
            this.element.classList.add("fn__none");
            return;
        }
        // shift+方向键或三击选中，不同的块 https://github.com/lonelyor/SourceFlow/issues/3891
        const startElement = hasClosestBlock(range.startContainer);
        const endElement = hasClosestBlock(range.endContainer);
        if (startElement && endElement && startElement !== endElement) {
            const displayRange = range.cloneRange();
            if (event) { // 在 keyup 中使用 shift+方向键选中
                if (event.key === "ArrowLeft") {
                    typeRange = setLastNodeRange(getContenteditableElement(startElement), displayRange, false);
                } else if (event.key === "ArrowRight") {
                    typeRange = setFirstNodeRange(getContenteditableElement(endElement), displayRange);
                    typeRange.collapse(false);
                } else if (event.key === "ArrowUp") {
                    typeRange = setFirstNodeRange(getContenteditableElement(endElement), displayRange);
                    nodeElement = hasClosestBlock(endElement);
                    if (!nodeElement) {
                        return;
                    }
                } else if (event.key === "ArrowDown") {
                    typeRange = setLastNodeRange(getContenteditableElement(startElement), displayRange, false);
                }
            } else {
                typeRange = setLastNodeRange(getContenteditableElement(nodeElement), displayRange, false);
            }
            if (typeRange.toString() === "") {
                this.element.classList.add("fn__none");
                return;
            }
        }
        // 需放在 range 修改之后，否则 https://github.com/lonelyor/SourceFlow/issues/4726
        if (nodeElement.getAttribute("data-type") === "NodeCodeBlock") {
            this.element.classList.add("fn__none");
            return;
        }
        const rangePosition = getSelectionPosition(nodeElement, typeRange, true);
        this.element.classList.remove("fn__none");
        this.toolbarHeight = this.element.clientHeight;
        const y = rangePosition.isBottom ?
            Math.min(rangePosition.top + 4, protyle.element.getBoundingClientRect().bottom - this.toolbarHeight) :
            Math.max(rangePosition.top - this.toolbarHeight - 4, protyle.element.getBoundingClientRect().top + 30);
        this.element.setAttribute("data-inity", y + Constants.ZWSP + protyle.contentElement.scrollTop.toString());
        setPosition(this.element, rangePosition.left - this.element.clientWidth / 4, y);

        this.element.querySelectorAll(".protyle-toolbar__item--current").forEach(item => {
            item.classList.remove("protyle-toolbar__item--current");
        });
        const types = this.getCurrentType(typeRange);
        types.forEach(item => {
            if (["search-mark", "a", "block-ref", "virtual-block-ref", "text", "file-annotation-ref", "inline-math",
                "inline-memo", "", "backslash"].includes(item)) {
                return;
            }
            const itemElement = this.element.querySelector(`[data-type="${item}"]`);
            if (itemElement) {
                itemElement.classList.add("protyle-toolbar__item--current");
            }
        });
    }

    public getCurrentType(range = this.range) {
        let types: string[] = [];
        let startElement = range.startContainer as HTMLElement;
        if (startElement.nodeType === 3) {
            startElement = startElement.parentElement;
        } else if (startElement.childElementCount > 0 && startElement.childNodes[range.startOffset]?.nodeType !== 3) {
            startElement = startElement.childNodes[range.startOffset] as HTMLElement;
            if (startElement?.tagName === "WBR") {
                startElement = startElement.parentElement;
            }
        }
        if (!startElement || startElement.nodeType === 3) {
            return [];
        }
        if (!["DIV", "TD", "TH", "TR"].includes(startElement.tagName)) {
            types = (startElement.getAttribute("data-type") || "").split(" ");
        }
        let endElement = range.endContainer as HTMLElement;
        if (endElement.nodeType === 3) {
            endElement = endElement.parentElement;
        } else if (endElement.childElementCount > 0 && endElement.childNodes[range.endOffset]?.nodeType !== 3) {
            endElement = endElement.childNodes[range.endOffset] as HTMLElement;
        }
        if (types.length === 0 && (!endElement || endElement.nodeType === 3)) {
            return [];
        }
        if (endElement && !["DIV", "TD", "TH", "TR"].includes(endElement.tagName) && startElement !== endElement) {
            types = types.concat((endElement.getAttribute("data-type") || "").split(" "));
        }
        range.cloneContents().childNodes.forEach((item: HTMLElement) => {
            if (item.nodeType !== 3) {
                types = types.concat((item.getAttribute("data-type") || "").split(" "));
            }
        });
        types = [...new Set(types)];
        types.find((item, index) => {
            if (item === "") {
                types.splice(index, 1);
                return true;
            }
        });
        return types;
    }

    public setInlineMark(protyle: IProtyle, type: string, action: "range" | "toolbar", textObj?: ITextOption) {
        return setToolbarInlineMark(this, protyle, type, action, textObj);
    }

    public showRender(protyle: IProtyle, renderElement: Element, updateElements?: Element[], oldHTML?: string) {
        showRenderPanel(this, protyle, renderElement, updateElements, oldHTML);
    }

    public showCodeLanguage(protyle: IProtyle, languageElements: HTMLElement[]) {
        showCodeLanguagePanel(this, protyle, languageElements);
    }

    public showTpl(protyle: IProtyle, nodeElement: HTMLElement, range: Range) {
        showTemplatePanel(this, protyle, nodeElement, range);
    }

    public showWidget(protyle: IProtyle, nodeElement: HTMLElement, range: Range) {
        showWidgetPanel(this, protyle, nodeElement, range);
    }

    public showContent(protyle: IProtyle, range: Range, nodeElement: Element) {
        showSelectionContentPanel(this, protyle, range, nodeElement);
    }

    private genItem(protyle: IProtyle, menuItem: IMenuItem) {
        return buildToolbarItemElement(protyle, menuItem);
    }

    // 合并多个 text 为一个 text
    private mergeNode(nodes: NodeListOf<ChildNode>) {
        mergeToolbarNodes(nodes);
    }

    private updateLanguage(languageElements: HTMLElement[], protyle: IProtyle, selectedLang: string) {
        updateToolbarLanguage(this, languageElements, protyle, selectedLang);
    }
}
