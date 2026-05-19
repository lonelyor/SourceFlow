import {
    hasClosestBlock,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByClassName,
    isInAVBlock,
    isInEmbedBlock
} from "../util/hasClosest";
import {getIconByType} from "../../editor/getIcon";
import {enterBack, iframeMenu, setFold, tableMenu, videoMenu, zoomOut} from "../../menus/protyle";
import {MenuItem} from "../../menus/Menu";
import {copySubMenu, openAttr, openFileAttr} from "../../menus/commonMenuItem";
import {
    copyPlainText,
    isInAndroid,
    isInHarmony,
    isMac,
    isOnlyMeta,
    openByMobile,
    updateHotkeyAfterTip,
    updateHotkeyTip,
    writeNativeSourceFlowHTMLClipboard,
    writeText
} from "../util/compatibility";
import {
    transaction,
    turnsIntoOneTransaction,
    turnsIntoTransaction,
    turnsOneInto,
    updateBatchTransaction,
    updateTransaction
} from "../wysiwyg/transaction";
import {removeBlock} from "../wysiwyg/remove";
import {focusBlock, focusByRange, getEditorRange} from "../util/selection";
import {hideElements} from "../ui/hideElements";
import {highlightRender} from "../render/highlightRender";
import {blockRender} from "../render/blockRender";
import {getContenteditableElement, getParentBlock, getTopAloneElement, isNotEditBlock} from "../wysiwyg/getBlock";
import * as dayjs from "dayjs";
import {fetchPost} from "../../util/fetch";
import {cancelSB, genEmptyElement, getLangByType, insertEmptyBlock, jumpToParent,} from "../../block/util";
import {countBlockWord} from "../../layout/status";
import {Constants} from "../../constants";
import {mathRender} from "../render/mathRender";
import {duplicateBlock} from "../wysiwyg/commonHotkey";
import {movePathTo, useShell} from "../../util/pathName";
import {hintMoveBlock} from "../hint/extend";
import {makeCard, quickMakeCard} from "../../card/makeCard";
import {transferBlockRef} from "../../menus/block";
import {isMobile} from "../../util/functions";
import {AIActions} from "../../ai/actions";
import {activeBlur, renderTextMenu, showKeyboardToolbarUtil} from "../../mobile/util/keyboardToolbar";
import {hideTooltip} from "../../dialog/tooltip";
import {appearanceMenu} from "../toolbar/Font";
import {setPosition} from "../../util/setPosition";
import {emitOpenMenu} from "../../plugin/EventBus";
import {insertAttrViewBlockAnimation, updateHeader} from "../render/av/row";
import {avContextmenu, duplicateCompletely} from "../render/av/action";
import {getPlainText} from "../util/paste";
import {addEditorToDatabase} from "../render/av/addToDatabase";
import {processClonePHElement} from "../render/util";
/// #if !MOBILE
import {openFileById} from "../../editor/util";
import * as path from "path";
/// #endif
/// #if MOBILE
import {openMobileFileById} from "../../mobile/editor";
/// #endif
import {hideMessage, showMessage} from "../../dialog/message";
import {checkFold} from "../../util/noRelyPCFunction";
import {clearSelect} from "../util/clear";
import {chartRender} from "../render/chartRender";
import {appendAssistantContextActions} from "../../assistant/skills/contextActions";
import {canRunCodeBlock, runCodeBlock} from "../codeRun";

import {isMatchNode} from "./actions";
import {renderMultipleMenu, renderMenu} from "./menus";
import {renderGutter} from "./render";

const openGutterFileById = (protyle: IProtyle, id: string, action: TProtyleAction[], zoomIn?: boolean) => {
    /// #if MOBILE
    openMobileFileById(protyle.app, id, action);
    void zoomIn;
    /// #else
    openFileById({
        app: protyle.app,
        id,
        action,
        zoomIn,
    });
    /// #endif
};

export class Gutter {
    public element: HTMLElement;
    private gutterTip: string;

    constructor(protyle: IProtyle) {
        if (isMac()) {
            this.gutterTip = window.sourceflow.languages.gutterTip.replace("⌥→", updateHotkeyAfterTip(window.sourceflow.config.keymap.general.enter.custom, "/"))
                .replace("⌘↑", updateHotkeyAfterTip(window.sourceflow.config.keymap.editor.general.collapse.custom, "/"))
                .replace("⌥⌘A", updateHotkeyAfterTip(window.sourceflow.config.keymap.editor.general.attr.custom, "/"));
        } else {
            this.gutterTip = window.sourceflow.languages.gutterTip.replace("⌥→", updateHotkeyAfterTip(window.sourceflow.config.keymap.general.enter.custom, "/"))
                .replace("⌘↑", updateHotkeyAfterTip(window.sourceflow.config.keymap.editor.general.collapse.custom, "/"))
                .replace("⌥⌘A", updateHotkeyAfterTip(window.sourceflow.config.keymap.editor.general.attr.custom, "/"))
                .replace(/⌘/g, "Ctrl+").replace(/⌥/g, "Alt+").replace(/⇧/g, "Shift+").replace(/⌃/g, "Ctrl+");
        }
        if (protyle.options.backlinkData) {
            this.gutterTip = this.gutterTip.replace(window.sourceflow.languages.enter, window.sourceflow.languages.openBy);
        }
        this.element = document.createElement("div");
        this.element.className = "protyle-gutters";
        this.element.addEventListener("dragstart", (event: DragEvent & { target: HTMLElement }) => {
            hideTooltip();
            window.sourceflow.menus.menu.remove();
            const buttonElement = event.target.parentElement;
            let selectIds: string[] = [];
            let selectElements: Element[] = [];
            let avElement: Element;
            if (buttonElement.dataset.rowId) {
                avElement = Array.from(protyle.wysiwyg.element.querySelectorAll(`.av[data-node-id="${buttonElement.dataset.nodeId}"]`)).find((item: HTMLElement) => {
                    if (!isInEmbedBlock(item) && !isInAVBlock(item)) {
                        return true;
                    }
                });
                if (avElement.querySelector('.block__icon[data-type="av-sort"]')?.classList.contains("block__icon--active")) {
                    const bodyElements = avElement.querySelectorAll(".av__body");
                    if (bodyElements.length === 1) {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    } else if (["template", "created", "updated"].includes(bodyElements[0].getAttribute("data-dtype"))) {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                }
                const rowElement = avElement.querySelector(`.av__body${buttonElement.dataset.groupId ? `[data-group-id="${buttonElement.dataset.groupId}"]` : ""} .av__row[data-id="${buttonElement.dataset.rowId}"]`);
                if (!rowElement.classList.contains("av__row--select")) {
                    avElement.querySelectorAll(".av__row--select:not(.av__row--header)").forEach(item => {
                        item.classList.remove("av__row--select");
                        item.querySelector("use").setAttribute("xlink:href", "#iconUncheck");
                    });
                }
                rowElement.classList.add("av__row--select");
                rowElement.querySelector(".av__firstcol use").setAttribute("xlink:href", "#iconCheck");
                updateHeader(rowElement as HTMLElement);
                avElement.querySelectorAll(".av__row--select:not(.av__row--header)").forEach(item => {
                    const avBodyElement = hasClosestByClassName(item, "av__body") as HTMLElement;
                    const groupId = (avBodyElement ? avBodyElement.dataset.groupId : "") || "";
                    selectIds.push(item.getAttribute("data-id") + (groupId ? "@" + groupId : ""));
                    selectElements.push(item);
                });
            } else {
                const gutterId = buttonElement.getAttribute("data-node-id");
                selectElements = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
                let selectedIncludeGutter = false;
                selectElements.forEach((item => {
                    const itemId = item.getAttribute("data-node-id");
                    if (itemId === gutterId) {
                        selectedIncludeGutter = true;
                    }
                    selectIds.push(itemId);
                }));
                if (!selectedIncludeGutter) {
                    let gutterNodeElement: HTMLElement;
                    Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${gutterId}"]`)).find((item: HTMLElement) => {
                        if (!isInEmbedBlock(item) && this.isMatchNode(item)) {
                            gutterNodeElement = item;
                            return true;
                        }
                    });
                    if (gutterNodeElement) {
                        selectElements.forEach((item => {
                            item.classList.remove("protyle-wysiwyg--select");
                        }));
                        gutterNodeElement.classList.add("protyle-wysiwyg--select");
                        selectElements = [gutterNodeElement];
                        selectIds = [gutterId];
                    }
                }
            }

            const ghostElement = document.createElement("div");
            ghostElement.className = protyle.wysiwyg.element.className;
            selectElements.forEach(item => {
                if (item.querySelector("iframe")) {
                    const type = item.getAttribute("data-type");
                    const embedElement = genEmptyElement();
                    embedElement.classList.add("protyle-wysiwyg--select");
                    getContenteditableElement(embedElement).innerHTML = `<svg class="svg"><use xlink:href="${buttonElement.querySelector("use").getAttribute("xlink:href")}"></use></svg> ${getLangByType(type)}`;
                    ghostElement.append(embedElement);
                } else {
                    ghostElement.append(processClonePHElement(item.cloneNode(true) as Element));
                }
            });
            ghostElement.setAttribute("style", `position:fixed;opacity:.1;width:${selectElements[0].clientWidth}px;padding:0;`);
            document.body.append(ghostElement);
            event.dataTransfer.setDragImage(ghostElement, 0, 0);
            setTimeout(() => {
                ghostElement.remove();
            });
            buttonElement.style.opacity = "0.38";
            window.sourceflow.dragElement = avElement as HTMLElement || protyle.wysiwyg.element;
            event.dataTransfer.setData(`${Constants.SOURCEFLOW_DROP_GUTTER}${buttonElement.getAttribute("data-type")}${Constants.ZWSP}${buttonElement.getAttribute("data-subtype")}${Constants.ZWSP}${selectIds}${Constants.ZWSP}${window.sourceflow.config.system.workspaceDir}`,
                protyle.wysiwyg.element.innerHTML);
        });
        this.element.addEventListener("dragend", () => {
            this.element.querySelectorAll("button").forEach((item) => {
                item.style.opacity = "";
            });
            window.sourceflow.dragElement = undefined;
        });
        this.element.addEventListener("click", (event: MouseEvent & { target: HTMLInputElement }) => {
            const buttonElement = hasClosestByTag(event.target, "BUTTON");
            if (!buttonElement) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            hideTooltip();
            clearSelect(["cell", "img"], protyle.wysiwyg.element);
            const id = buttonElement.getAttribute("data-node-id");
            if (!id) {
                if (buttonElement.getAttribute("disabled")) {
                    return;
                }
                buttonElement.setAttribute("disabled", "disabled");
                let foldElement: Element;
                Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${(buttonElement.previousElementSibling || buttonElement.nextElementSibling).getAttribute("data-node-id")}"]`)).find(item => {
                    if (!isInEmbedBlock(item) && this.isMatchNode(item)) {
                        foldElement = item;
                        return true;
                    }
                });
                if (!foldElement) {
                    return;
                }
                if (event.altKey) {
                    // 折叠所有子集
                    let hasFold = true;
                    Array.from(foldElement.children).find((ulElement) => {
                        if (ulElement.classList.contains("list")) {
                            const foldElement = Array.from(ulElement.children).find((listItemElement) => {
                                if (listItemElement.classList.contains("li")) {
                                    if (listItemElement.getAttribute("fold") !== "1" && listItemElement.childElementCount > 3) {
                                        hasFold = false;
                                        return true;
                                    }
                                }
                            });
                            if (foldElement) {
                                return true;
                            }
                        }
                    });
                    const doOperations: IOperation[] = [];
                    const undoOperations: IOperation[] = [];
                    Array.from(foldElement.children).forEach((ulElement) => {
                        if (ulElement.classList.contains("list")) {
                            Array.from(ulElement.children).forEach((listItemElement) => {
                                if (listItemElement.classList.contains("li")) {
                                    if (hasFold) {
                                        listItemElement.removeAttribute("fold");
                                    } else if (listItemElement.childElementCount > 3) {
                                        listItemElement.setAttribute("fold", "1");
                                    }
                                    const listId = listItemElement.getAttribute("data-node-id");
                                    doOperations.push({
                                        action: "setAttrs",
                                        id: listId,
                                        data: JSON.stringify({fold: hasFold ? "" : "1"})
                                    });
                                    undoOperations.push({
                                        action: "setAttrs",
                                        id: listId,
                                        data: JSON.stringify({fold: hasFold ? "1" : ""})
                                    });
                                }
                            });
                        }
                    });
                    transaction(protyle, doOperations, undoOperations);
                    buttonElement.removeAttribute("disabled");
                } else {
                    const foldStatus = setFold(protyle, foldElement).fold;
                    if (foldStatus === 1) {
                        (buttonElement.firstElementChild as HTMLElement).style.transform = "";
                    } else if (foldStatus === 0) {
                        (buttonElement.firstElementChild as HTMLElement).style.transform = "rotate(90deg)";
                    }
                }
                hideElements(["select"], protyle);
                window.sourceflow.menus.menu.remove();
                return;
            }
            const gutterRect = buttonElement.getBoundingClientRect();
            if (buttonElement.dataset.type === "NodeAttributeViewRowMenu" || buttonElement.dataset.type === "NodeAttributeViewRow") {
                const rowElement = Array.from(protyle.wysiwyg.element.querySelectorAll(`.av[data-node-id="${buttonElement.dataset.nodeId}"] .av__row[data-id="${buttonElement.dataset.rowId}"]`)).find((item: HTMLElement) => {
                    if (!isInEmbedBlock(item)) {
                        return true;
                    }
                });
                if (!rowElement) {
                    return;
                }
                const blockElement = hasClosestBlock(rowElement);
                if (!blockElement) {
                    return;
                }
                if (buttonElement.dataset.type === "NodeAttributeViewRow") {
                    const avID = blockElement.getAttribute("data-av-id");
                    const srcIDs = [Lute.NewNodeID()];
                    const previousID = event.altKey ? (rowElement.previousElementSibling.getAttribute("data-id") || "") : buttonElement.dataset.rowId;
                    const newUpdated = dayjs().format("YYYYMMDDHHmmss");
                    const groupID = rowElement.parentElement.getAttribute("data-group-id");
                    transaction(protyle, [{
                        action: "insertAttrViewBlock",
                        avID,
                        previousID,
                        srcs: [{
                            itemID: Lute.NewNodeID(),
                            id: srcIDs[0],
                            isDetached: true,
                            content: ""
                        }],
                        blockID: id,
                        groupID,
                    }, {
                        action: "doUpdateUpdated",
                        id,
                        data: newUpdated,
                    }], [{
                        action: "removeAttrViewBlock",
                        srcIDs,
                        avID,
                    }, {
                        action: "doUpdateUpdated",
                        id,
                        data: blockElement.getAttribute("updated")
                    }]);
                    insertAttrViewBlockAnimation({protyle, blockElement, srcIDs, previousId: previousID, groupID});
                    if (event.altKey) {
                        this.element.querySelectorAll("button").forEach(item => {
                            item.dataset.rowId = srcIDs[0];
                        });
                    }
                    blockElement.setAttribute("updated", newUpdated);
                } else {
                    if (!protyle.disabled && event.shiftKey) {
                        const blockId = rowElement.querySelector('[data-dtype="block"] .av__celltext--ref')?.getAttribute("data-id");
                        if (blockId) {
                            fetchPost("/api/attr/getBlockAttrs", {id: blockId}, (response) => {
                                openFileAttr(response.data, "av", protyle);
                            });
                            return;
                        }
                    }
                    avContextmenu(protyle, rowElement as HTMLElement, {
                        x: gutterRect.left,
                        y: gutterRect.bottom,
                        w: gutterRect.width,
                        h: gutterRect.height,
                        isLeft: true
                    });
                }
                return;
            }
            if (isOnlyMeta(event)) {
                if (protyle.options.backlinkData) {
                    checkFold(id, (zoomIn, action) => {
                        openGutterFileById(protyle, id, action, zoomIn);
                    });
                } else {
                    zoomOut({protyle, id});
                }
            } else if (event.altKey) {
                let foldElement: Element;
                Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${id}"]`)).find(item => {
                    if (!isInEmbedBlock(item) && this.isMatchNode(item)) {
                        foldElement = item;
                        return true;
                    }
                });
                if (!foldElement) {
                    return;
                }
                if (buttonElement.getAttribute("data-type") === "NodeListItem" && foldElement.parentElement.getAttribute("data-node-id")) {
                    // 折叠同级
                    let hasFold = true;
                    Array.from(foldElement.parentElement.children).find((listItemElement) => {
                        if (listItemElement.classList.contains("li")) {
                            if (listItemElement.getAttribute("fold") !== "1" && listItemElement.childElementCount > 3) {
                                hasFold = false;
                                return true;
                            }
                        }
                    });
                    const arrowElement = buttonElement.parentElement.querySelector("[data-type='fold'] > svg") as HTMLElement;
                    if (arrowElement) {
                        arrowElement.style.transform = hasFold ? "rotate(90deg)" : "";
                    }
                    const doOperations: IOperation[] = [];
                    const undoOperations: IOperation[] = [];
                    Array.from(foldElement.parentElement.children).find((listItemElement) => {
                        if (listItemElement.classList.contains("li")) {
                            if (hasFold) {
                                listItemElement.removeAttribute("fold");
                            } else if (listItemElement.childElementCount > 3) {
                                listItemElement.setAttribute("fold", "1");
                            }
                            const listId = listItemElement.getAttribute("data-node-id");
                            doOperations.push({
                                action: "setAttrs",
                                id: listId,
                                data: JSON.stringify({fold: hasFold ? "" : "1"})
                            });
                            undoOperations.push({
                                action: "setAttrs",
                                id: listId,
                                data: JSON.stringify({fold: hasFold ? "1" : ""})
                            });
                        }
                    });
                    transaction(protyle, doOperations, undoOperations);
                } else {
                    const hasFold = setFold(protyle, foldElement).fold;
                    const foldArrowElement = buttonElement.parentElement.querySelector("[data-type='fold'] > svg") as HTMLElement;
                    if (hasFold !== -1 && foldArrowElement) {
                        foldArrowElement.style.transform = hasFold === 0 ? "rotate(90deg)" : "";
                    }
                }
                foldElement.classList.remove("protyle-wysiwyg--hl");
            } else if (event.shiftKey && !protyle.disabled) {
                // 不使用 window.sourceflow.shiftIsPressed ，否则窗口未激活时按 Shift 点击块标无法打开属性面板 https://github.com/lonelyor/SourceFlow/issues/15075
                openAttr(protyle.wysiwyg.element.querySelector(`[data-node-id="${id}"]`), "bookmark", protyle);
            } else if (!window.sourceflow.ctrlIsPressed && !window.sourceflow.altIsPressed && !window.sourceflow.shiftIsPressed) {
                this.renderMenu(protyle, buttonElement);
                //
                if (!protyle.toolbar.range) {
                    protyle.toolbar.range = getEditorRange(protyle.wysiwyg.element.querySelector(`[data-node-id="${id}"]`) || protyle.wysiwyg.element.firstElementChild);
                }
                /// #if MOBILE
                window.sourceflow.menus.menu.fullscreen();
                /// #else
                window.sourceflow.menus.menu.popup({x: gutterRect.left, y: gutterRect.bottom, isLeft: true});
                const popoverElement = hasTopClosestByClassName(protyle.element, "block__popover", true);
                window.sourceflow.menus.menu.element.setAttribute("data-from", popoverElement ? popoverElement.dataset.level + "popover" : "app");
                focusByRange(protyle.toolbar.range);
                /// #endif
            }
        });
        this.element.addEventListener("contextmenu", (event: MouseEvent & { target: HTMLInputElement }) => {
            const buttonElement = hasClosestByTag(event.target, "BUTTON");
            if (!buttonElement || buttonElement.getAttribute("data-type") === "fold") {
                return;
            }
            if (!window.sourceflow.ctrlIsPressed && !window.sourceflow.altIsPressed && !window.sourceflow.shiftIsPressed) {
                hideTooltip();
                clearSelect(["cell", "img"], protyle.wysiwyg.element);
                const gutterRect = buttonElement.getBoundingClientRect();
                if (buttonElement.dataset.type === "NodeAttributeViewRowMenu") {
                    const rowElement = Array.from(protyle.wysiwyg.element.querySelectorAll(`.av[data-node-id="${buttonElement.dataset.nodeId}"] .av__row[data-id="${buttonElement.dataset.rowId}"]`)).find((item: HTMLElement) => {
                        if (!isInEmbedBlock(item)) {
                            return true;
                        }
                    });
                    if (rowElement) {
                        avContextmenu(protyle, rowElement as HTMLElement, {
                            x: gutterRect.left,
                            y: gutterRect.bottom,
                            w: gutterRect.width,
                            h: gutterRect.height,
                            isLeft: true
                        });
                    }
                } else if (buttonElement.dataset.type !== "NodeAttributeViewRow") {
                    this.renderMenu(protyle, buttonElement);
                    if (!protyle.toolbar.range) {
                        protyle.toolbar.range = getEditorRange(
                            protyle.wysiwyg.element.querySelector(`[data-node-id="${buttonElement.getAttribute("data-node-id")}"]`) ||
                            protyle.wysiwyg.element.firstElementChild);
                    }
                    /// #if MOBILE
                    window.sourceflow.menus.menu.fullscreen();
                    /// #else
                    window.sourceflow.menus.menu.popup({x: gutterRect.left, y: gutterRect.bottom, isLeft: true});
                    const popoverElement = hasTopClosestByClassName(protyle.element, "block__popover", true);
                    window.sourceflow.menus.menu.element.setAttribute("data-from", popoverElement ? popoverElement.dataset.level + "popover" : "app");
                    focusByRange(protyle.toolbar.range);
                    /// #endif
                }
            }
            event.preventDefault();
            event.stopPropagation();
        });
        this.element.addEventListener("mouseleave", (event: MouseEvent & { target: HTMLInputElement }) => {
            Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--hl, .av__row--hl")).forEach(item => {
                item.classList.remove("protyle-wysiwyg--hl", "av__row--hl");
            });
            event.preventDefault();
            event.stopPropagation();
        });
        // https://github.com/lonelyor/SourceFlow/issues/12751
        this.element.addEventListener("mousewheel", (event) => {
            hideElements(["gutter"], protyle);
            event.stopPropagation();
        }, {passive: true});
    }


    public isMatchNode(item: Element) {
        return isMatchNode(this.element, item);
    }

    public renderMultipleMenu(protyle: IProtyle, selectsElement: Element[]) {
        return renderMultipleMenu(protyle, selectsElement);
    }

    public renderMenu(protyle: IProtyle, buttonElement: Element) {
        return renderMenu(this.element, protyle, buttonElement, this.gutterTip);
    }

    public render(protyle: IProtyle, element: Element, target?: Element) {
        return renderGutter(this.element, this.gutterTip, protyle, element, target);
    }
}
