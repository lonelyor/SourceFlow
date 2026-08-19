import {hideElements} from "../../ui/hideElements";
import {isMac, isNotCtrl, isOnlyMeta, writeText} from "../../util/compatibility";
import {
    focusBlock,
    focusByRange,
    focusByWbr,
    getEditorRange,
    getSelectionOffset,
    getSelectionPosition,
    selectAll,
    setFirstNodeRange,
    setInsertWbrHTML,
    setLastNodeRange,
} from "../../util/selection";
import {
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByAttribute,
    isInEmbedBlock
} from "../../util/hasClosest";
import {removeBlock, removeImage} from "../remove";
import {
    getContenteditableElement,
    getFirstBlock,
    getLastBlock,
    getNextBlock,
    getParentBlock,
    getPreviousBlock,
    getTopAloneElement,
    hasNextSibling,
    hasPreviousSibling,
    isEndOfBlock,
    isNotEditBlock,
} from "../getBlock";
import {isIncludesHotKey, matchHotKey} from "../../util/hotKey";
import {enter, softEnter} from "../enter";
import {clearTableCell, fixTable} from "../../util/table";
import {isTitleEmptyAttr} from "../../../util/attrCompat";
import {
    transaction,
    turnsIntoOneTransaction,
    turnsIntoTransaction,
    turnsOneInto,
    updateBatchTransaction,
    updateTransaction
} from "../transaction";
import {fontEvent} from "../../toolbar/Font";
import {addSubList, listIndent, listOutdent} from "../list";
import {newFileContentBySelect, rename, replaceFileName} from "../../../editor/rename";
import {cancelSB, insertEmptyBlock, jumpToParent} from "../../../block/util";
import {isLocalPath} from "../../../util/pathName";
/// #if !MOBILE
import {openBy, openFileById} from "../../../editor/util";
/// #endif
/// #if MOBILE
import {openMobileFileById} from "../../../mobile/editor";
/// #endif
import {alignImgCenter, alignImgLeft, commonHotkey, downSelect, getStartEndElement, upSelect} from "../commonHotkey";
import {fileAnnotationRefMenu, inlineMathMenu, linkMenu, refMenu, setFold, tagMenu} from "../../../menus/protyle";
import {openAttr} from "../../../menus/commonMenuItem";
import {Constants} from "../../../constants";
import {fetchPost} from "../../../util/fetch";
import {scrollCenter} from "../../../util/highlightById";
import {BlockPanel} from "../../../block/Panel";
import * as dayjs from "dayjs";
import {highlightRender} from "../../render/highlightRender";
import {countBlockWord} from "../../../layout/status";
import {moveToDown, moveToUp} from "../move";
import {pasteAsPlainText} from "../../util/paste";
import {preventScroll} from "../../scroll/preventScroll";
import {getSavePath, newFileBySelect} from "../../../util/newFile";
import {removeSearchMark} from "../../toolbar/util";
import {avKeydown} from "../../render/av/keydown";
import {checkFold} from "../../../util/noRelyPCFunction";
import {AIActions} from "../../../ai/actions";
import {openLink} from "../../../editor/openLink";
import {onlyProtyleCommand} from "../../../boot/globalEvent/command/protyle";
import {updateCalloutType} from "../callout";
import {tabCodeBlock} from "../codeBlock";

import type {ActiveKeydownContext, KeydownHandlerResult} from "./shared";

export const handleStructureKeydown = async (context: ActiveKeydownContext): Promise<KeydownHandlerResult> => {
    const {protyle, editorElement, event, range, nodeElement, nodeType, selectText} = context;
        // h1 - h6 hotkey
        if (matchHotKey(window.sourceflow.config.keymap.editor.heading.paragraph.custom, event)) {
            const selectsElement = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
            if (selectsElement.length === 0) {
                selectsElement.push(nodeElement);
            }
            if (selectsElement.length > 1) {
                turnsIntoTransaction({
                    protyle,
                    nodeElement: selectsElement[0],
                    type: "Blocks2Ps",
                });
            } else {
                const type = selectsElement[0].getAttribute("data-type");
                if (type === "NodeHeading") {
                    turnsIntoTransaction({
                        protyle,
                        nodeElement: selectsElement[0],
                        type: "Blocks2Ps",
                    });
                } else if (type === "NodeList") {
                    turnsOneInto({
                        protyle,
                        nodeElement: selectsElement[0],
                        id: selectsElement[0].getAttribute("data-node-id"),
                        type: "CancelList",
                    });
                } else if (type === "NodeBlockquote") {
                    turnsOneInto({
                        protyle,
                        nodeElement: selectsElement[0],
                        id: selectsElement[0].getAttribute("data-node-id"),
                        type: "CancelBlockquote",
                    });
                } else if (type === "NodeCallout") {
                    turnsOneInto({
                        protyle,
                        nodeElement: selectsElement[0],
                        id: selectsElement[0].getAttribute("data-node-id"),
                        type: "CancelCallout",
                    });
                }
            }
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.heading.heading1.custom, event)) {
            turnsIntoTransaction({
                protyle,
                nodeElement,
                type: "Blocks2Hs",
                level: 1
            });
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.heading.heading2.custom, event)) {
            turnsIntoTransaction({
                protyle,
                nodeElement,
                type: "Blocks2Hs",
                level: 2
            });
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.heading.heading3.custom, event)) {
            turnsIntoTransaction({
                protyle,
                nodeElement,
                type: "Blocks2Hs",
                level: 3
            });
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.heading.heading4.custom, event)) {
            turnsIntoTransaction({
                protyle,
                nodeElement,
                type: "Blocks2Hs",
                level: 4
            });
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.heading.heading5.custom, event)) {
            turnsIntoTransaction({
                protyle,
                nodeElement,
                type: "Blocks2Hs",
                level: 5
            });
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.heading.heading6.custom, event)) {
            turnsIntoTransaction({
                protyle,
                nodeElement,
                type: "Blocks2Hs",
                level: 6
            });
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.insert.code.custom, event) &&
            !["NodeCodeBlock", "NodeHeading", "NodeTable"].includes(nodeType)) {
            const editElement = getContenteditableElement(nodeElement);
            if (editElement) {
                const id = nodeElement.getAttribute("data-node-id");
                const html = nodeElement.outerHTML;
                // 需要 EscapeHTMLStr https://github.com/lonelyor/SourceFlow/issues/11451
                editElement.innerHTML = "```" + window.sourceflow.storage[Constants.LOCAL_CODELANG] + "\n" + Lute.EscapeHTMLStr(editElement.textContent) + "<wbr>\n```";
                const newHTML = protyle.lute.SpinBlockDOM(nodeElement.outerHTML);
                nodeElement.outerHTML = newHTML;
                const newNodeElement = protyle.wysiwyg.element.querySelector(`[data-node-id="${id}"]`);
                updateTransaction(protyle, id, newHTML, html);
                highlightRender(newNodeElement);
                event.preventDefault();
                event.stopPropagation();
                return true;
            }
        }

        // toolbar action
        if (matchHotKey(window.sourceflow.config.keymap.editor.insert.lastUsed.custom, event)) {
            protyle.toolbar.range = range;
            const selectElements: Element[] = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
            if (selectText === "" && selectElements.length === 0) {
                selectElements.push(nodeElement);
            }
            fontEvent(protyle, selectElements);
            event.stopPropagation();
            event.preventDefault();
            return;
        }

        if (!nodeElement.classList.contains("code-block") && !event.repeat && !isInEmbedBlock(nodeElement)) {
            let findToolbar = false;
            protyle.options.toolbar.find((menuItem: IMenuItem) => {
                if (!menuItem.hotkey) {
                    return false;
                }
                if (matchHotKey(menuItem.hotkey, event)) {
                    // 设置 lastHTMLs 会导致  protyle.toolbar.range 和 range 不一致，需重置一下 https://github.com/lonelyor/SourceFlow/issues/10933
                    protyle.toolbar.range = range;
                    if (["block-ref"].includes(menuItem.name) && protyle.toolbar.range.toString() === "") {
                        return true;
                    }
                    findToolbar = true;
                    if (["a", "block-ref", "inline-math", "inline-memo", "text"].includes(menuItem.name)) {
                        protyle.toolbar.element.querySelector(`[data-type="${menuItem.name}"]`).dispatchEvent(new CustomEvent("click"));
                    } else if (Constants.INLINE_TYPE.includes(menuItem.name)) {
                        protyle.toolbar.setInlineMark(protyle, menuItem.name, "range");
                    } else if (menuItem.click) {
                        menuItem.click(protyle.getInstance());
                    }
                    return true;
                }
            });
            if (findToolbar) {
                event.preventDefault();
                event.stopPropagation();
                protyle.wysiwyg.preventKeyup = true;
                return true;
            }
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.list.outdent.custom, event)) {
            const selectElements = protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select");
            if (selectElements.length > 0) {
                let isContinuous = true;
                selectElements.forEach((item, index) => {
                    if (item.nextElementSibling && selectElements[index + 1]) {
                        if (selectElements[index + 1] !== item.nextElementSibling) {
                            isContinuous = false;
                        }
                    }
                });
                if (isContinuous &&
                    (selectElements[0].classList.contains("li") || selectElements[0].parentElement.classList.contains("li"))) {
                    listOutdent(protyle, Array.from(selectElements), range);
                }
                event.preventDefault();
                event.stopPropagation();
                return true;
            } else if (nodeElement.parentElement.classList.contains("li") && nodeType !== "NodeCodeBlock") {
                listOutdent(protyle, [nodeElement.parentElement], range);
                event.preventDefault();
                event.stopPropagation();
                return true;
            }
        }

        if (matchHotKey(window.sourceflow.config.keymap.editor.list.indent.custom, event)) {
            const selectElements = protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select");
            if (selectElements.length > 0) {
                let isContinuous = true;
                selectElements.forEach((item, index) => {
                    if (item.nextElementSibling && selectElements[index + 1]) {
                        if (selectElements[index + 1] !== item.nextElementSibling) {
                            isContinuous = false;
                        }
                    }
                });
                if (isContinuous &&
                    (selectElements[0].classList.contains("li") || selectElements[0].parentElement.classList.contains("li"))) {
                    listIndent(protyle, Array.from(selectElements), range);
                }
                event.preventDefault();
                event.stopPropagation();
                return true;
            } else if (nodeElement.parentElement.classList.contains("li") && nodeType !== "NodeCodeBlock") {
                listIndent(protyle, [nodeElement.parentElement], range);
                event.preventDefault();
                event.stopPropagation();
                return true;
            }
        }
        const isMatchList = matchHotKey(window.sourceflow.config.keymap.editor.insert.list.custom, event);
        const isMatchCheck = matchHotKey(window.sourceflow.config.keymap.editor.insert.check.custom, event);
        const isMatchOList = matchHotKey(window.sourceflow.config.keymap.editor.insert["ordered-list"].custom, event);
        const isMatchQuote = matchHotKey(window.sourceflow.config.keymap.editor.insert.quote.custom, event);
        if (isMatchList || isMatchOList || isMatchCheck || isMatchQuote) {
            const selectsElement: HTMLElement[] = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
            if (selectsElement.length === 0) {
                selectsElement.push(nodeElement);
            }
            if (selectsElement.length === 1) {
                const subType = selectsElement[0].dataset.subtype;
                const type = selectsElement[0].dataset.type;
                if (isMatchQuote) {
                    if (["NodeHeading", "NodeParagraph", "NodeList"].includes(type)) {
                        turnsIntoOneTransaction({
                            protyle,
                            selectsElement,
                            type: "Blocks2Blockquote"
                        });
                    } else {
                        protyle.hint.splitChar = "/";
                        protyle.hint.lastIndex = -1;
                        protyle.hint.fill(">" + Lute.Caret, protyle);
                    }
                } else {
                    if (type === "NodeParagraph") {
                        turnsIntoOneTransaction({
                            protyle,
                            selectsElement,
                            type: isMatchCheck ? "Blocks2TLs" : (isMatchList ? "Blocks2ULs" : "Blocks2OLs")
                        });
                    } else if (type === "NodeList") {
                        const id = selectsElement[0].dataset.nodeId;
                        if (subType === "o" && (isMatchList || isMatchCheck)) {
                            turnsOneInto({
                                protyle,
                                nodeElement: selectsElement[0],
                                id,
                                type: isMatchCheck ? "UL2TL" : "OL2UL",
                            });
                        } else if (subType === "t" && (isMatchList || isMatchOList)) {
                            turnsOneInto({
                                protyle,
                                nodeElement: selectsElement[0],
                                id,
                                type: isMatchList ? "TL2UL" : "TL2OL",
                            });
                        } else if (subType === "u" && (isMatchCheck || isMatchOList)) {
                            turnsOneInto({
                                protyle,
                                nodeElement: selectsElement[0],
                                id,
                                type: isMatchCheck ? "OL2TL" : "UL2OL",
                            });
                        }
                    } else {
                        protyle.hint.splitChar = "/";
                        protyle.hint.lastIndex = -1;
                        protyle.hint.fill((isMatchCheck ? "- [ ] " : (isMatchList ? "- " : "1. ")) + Lute.Caret, protyle);
                    }
                }
            } else {
                let isList = false;
                let isContinue = false;
                selectsElement.find((item, index) => {
                    if (item.classList.contains("li")) {
                        isList = true;
                        return true;
                    }
                    if (item.nextElementSibling && selectsElement[index + 1] &&
                        item.nextElementSibling === selectsElement[index + 1]) {
                        isContinue = true;
                    } else if (index !== selectsElement.length - 1) {
                        isContinue = false;
                        return true;
                    }
                });
                if (!isList && isContinue) {
                    turnsIntoOneTransaction({
                        protyle,
                        selectsElement,
                        type: isMatchQuote ? "Blocks2Blockquote" : (isMatchCheck ? "Blocks2TLs" : (isMatchList ? "Blocks2ULs" : "Blocks2OLs"))
                    });
                }
            }
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (matchHotKey(window.sourceflow.config.keymap.editor.insert.table.custom, event)) {
            protyle.hint.splitChar = "/";
            protyle.hint.lastIndex = -1;
            protyle.hint.fill(`| ${Lute.Caret} |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |`, protyle);
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (matchHotKey(window.sourceflow.config.keymap.editor.list.checkToggle.custom, event)) {
            const taskItemElement = hasClosestByAttribute(range.startContainer, "data-subtype", "t");
            if (!taskItemElement) {
                return;
            }
            const html = taskItemElement.outerHTML;
            if (taskItemElement.classList.contains("protyle-task--done")) {
                taskItemElement.querySelector("use").setAttribute("xlink:href", "#iconUncheck");
                taskItemElement.classList.remove("protyle-task--done");
            } else {
                taskItemElement.querySelector("use").setAttribute("xlink:href", "#iconCheck");
                taskItemElement.classList.add("protyle-task--done");
            }
            taskItemElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
            updateTransaction(protyle, taskItemElement.getAttribute("data-node-id"), taskItemElement.outerHTML, html);
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.general.insertBefore.custom, event)) {
            // https://github.com/lonelyor/SourceFlow/issues/14290#issuecomment-2846594701
            nodeElement.querySelector(".img--select")?.classList.remove("img--select");
            insertEmptyBlock(protyle, "beforebegin");
            event.preventDefault();
            return true;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.general.insertAfter.custom, event)) {
            nodeElement.querySelector(".img--select")?.classList.remove("img--select");
            insertEmptyBlock(protyle, "afterend");
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.general.jumpToParentNext.custom, event)) {
            jumpToParent(protyle, nodeElement, "next");
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.general.jumpToParent.custom, event)) {
            jumpToParent(protyle, nodeElement, "parent");
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        if (matchHotKey(window.sourceflow.config.keymap.editor.general.jumpToParentPrev.custom, event)) {
            jumpToParent(protyle, nodeElement, "previous");
            event.preventDefault();
            event.stopPropagation();
            return true;
        }

        if (matchHotKey(window.sourceflow.config.keymap.editor.general.moveToUp.custom, event)) {
            event.preventDefault();
            event.stopPropagation();
            moveToUp(protyle, nodeElement, range);
            return;
        }

        if (matchHotKey(window.sourceflow.config.keymap.editor.general.moveToDown.custom, event)) {
            event.preventDefault();
            event.stopPropagation();
            moveToDown(protyle, nodeElement, range);
            return;
        }

        if (matchHotKey(window.sourceflow.config.keymap.editor.general.vLayout.custom, event)) {
            event.preventDefault();
            event.stopPropagation();
            const selectsElement: HTMLElement[] = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
            if (selectsElement.length === 1 && selectsElement[0].getAttribute("data-type") === "NodeSuperBlock") {
                if (selectsElement[0].getAttribute("data-sb-layout") === "col") {
                    const oldHTML = selectsElement[0].outerHTML;
                    selectsElement[0].setAttribute("data-sb-layout", "row");
                    selectsElement[0].setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                    updateTransaction(protyle, selectsElement[0].getAttribute("data-node-id"), selectsElement[0].outerHTML, oldHTML);
                } else {
                    range.insertNode(document.createElement("wbr"));
                    const sbData = await cancelSB(protyle, selectsElement[0]);
                    transaction(protyle, sbData.doOperations, sbData.undoOperations);
                    focusByWbr(protyle.wysiwyg.element, range);
                }
                return;
            }
            if (selectsElement.length < 2 || selectsElement[0]?.classList.contains("li")) {
                return;
            }
            turnsIntoOneTransaction({
                protyle, selectsElement,
                type: "BlocksMergeSuperBlock",
                level: "row"
            });
            return;
        }

        if (matchHotKey(window.sourceflow.config.keymap.editor.general.hLayout.custom, event)) {
            event.preventDefault();
            event.stopPropagation();
            const selectsElement: HTMLElement[] = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
            if (selectsElement.length === 1 && selectsElement[0].getAttribute("data-type") === "NodeSuperBlock") {
                if (selectsElement[0].getAttribute("data-sb-layout") === "row") {
                    const oldHTML = selectsElement[0].outerHTML;
                    selectsElement[0].setAttribute("data-sb-layout", "col");
                    selectsElement[0].setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                    updateTransaction(protyle, selectsElement[0].getAttribute("data-node-id"), selectsElement[0].outerHTML, oldHTML);
                } else {
                    range.insertNode(document.createElement("wbr"));
                    const sbData = await cancelSB(protyle, selectsElement[0]);
                    transaction(protyle, sbData.doOperations, sbData.undoOperations);
                    focusByWbr(protyle.wysiwyg.element, range);
                }
                return;
            }
            if (selectsElement.length < 2 || selectsElement[0]?.classList.contains("li")) {
                return;
            }
            turnsIntoOneTransaction({
                protyle, selectsElement,
                type: "BlocksMergeSuperBlock",
                level: "col"
            });
            return;
        }

        if (!event.repeat && matchHotKey(window.sourceflow.config.keymap.editor.general.ai.custom, event)) {
            event.preventDefault();
            event.stopPropagation();
            let selectsElement: HTMLElement[] = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
            if (selectsElement.length === 0) {
                selectsElement = [nodeElement];
            }
            AIActions(selectsElement, protyle);
            return;
        }

        if (!event.repeat && matchHotKey(window.sourceflow.config.keymap.editor.general.aiWriting.custom, event)) {
            event.preventDefault();
            event.stopPropagation();
            AIActions([nodeElement], protyle);
            return;
        }

        if (!event.repeat && matchHotKey(window.sourceflow.config.keymap.editor.general.openInNewTab.custom, event)) {
            event.preventDefault();
            event.stopPropagation();
            const blockPanel = window.sourceflow.blockPanels.find(item => {
                if (item.element.contains(nodeElement)) {
                    return true;
                }
            });
            const id = nodeElement.getAttribute("data-node-id");
            checkFold(id, (zoomIn, action) => {
                /// #if MOBILE
                openMobileFileById(protyle.app, id, action);
                void zoomIn;
                /// #else
                openFileById({
                    app: protyle.app,
                    id,
                    action,
                    zoomIn,
                    openNewTab: true
                });
                /// #endif
                blockPanel.destroy();
            });
            return;
        }

        // tab 需等待 list 和 table 处理完成
        if (event.key === "Tab" && isNotCtrl(event) && !event.altKey) {
            event.preventDefault();
            if (nodeType === "NodeCodeBlock" && selectText !== "") {
                tabCodeBlock(protyle, nodeElement, range, event.shiftKey);
                return;
            }
            if (!event.shiftKey) {
                document.execCommand("insertHTML", false, window.sourceflow.config.editor.codeTabSpaces === 0 ? "\t" : "".padStart(window.sourceflow.config.editor.codeTabSpaces, " "));
                return true;
            }
        }

        if (event.key === "ContextMenu") {
            const rangePosition = getSelectionPosition(nodeElement, range);
            protyle.wysiwyg.element.dispatchEvent(new CustomEvent("contextmenu", {
                detail: {
                    target: nodeElement,
                    y: rangePosition.top + 8,
                    x: rangePosition.left
                }
            }));
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        /// #if !MOBILE
        const refElement = hasClosestByAttribute(range.startContainer, "data-type", "block-ref");
        if (refElement) {
            const id = refElement.getAttribute("data-id");
            if (matchHotKey(window.sourceflow.config.keymap.editor.general.openBy.custom, event)) {
                checkFold(id, (zoomIn, action, isRoot) => {
                    if (!isRoot) {
                        action.push(Constants.CB_GET_HL);
                    }
                    openFileById({
                        app: protyle.app,
                        id,
                        action,
                        zoomIn,
                        scrollPosition: "start"
                    });
                });
                event.preventDefault();
                event.stopPropagation();
                return true;
            } else if (matchHotKey(window.sourceflow.config.keymap.editor.general.refTab.custom, event)) {
                // 打开块引和编辑器中引用、反链、书签中点击事件需保持一致，都加载上下文
                checkFold(id, (zoomIn) => {
                    openFileById({
                        app: protyle.app,
                        id,
                        action: zoomIn ? [Constants.CB_GET_HL, Constants.CB_GET_ALL] : [Constants.CB_GET_HL, Constants.CB_GET_CONTEXT, Constants.CB_GET_ROOTSCROLL],
                        keepCursor: true,
                        zoomIn,
                        scrollPosition: "start"
                    });
                });
                event.preventDefault();
                event.stopPropagation();
                return true;
            } else if (matchHotKey(window.sourceflow.config.keymap.editor.general.insertRight.custom, event)) {
                checkFold(id, (zoomIn, action, isRoot) => {
                    if (!isRoot) {
                        action.push(Constants.CB_GET_HL);
                    }
                    openFileById({
                        app: protyle.app,
                        id,
                        position: "right",
                        action,
                        zoomIn,
                        scrollPosition: "start"
                    });
                });
                event.preventDefault();
                event.stopPropagation();
                return true;
            } else if (matchHotKey(window.sourceflow.config.keymap.editor.general.insertBottom.custom, event)) {
                checkFold(id, (zoomIn, action, isRoot) => {
                    if (!isRoot) {
                        action.push(Constants.CB_GET_HL);
                    }
                    openFileById({
                        app: protyle.app,
                        id,
                        position: "bottom",
                        action,
                        zoomIn,
                        scrollPosition: "start"
                    });
                });
                event.preventDefault();
                event.stopPropagation();
                return true;
            } else if (matchHotKey(window.sourceflow.config.keymap.editor.general.refPopover.custom, event)) {
                // open popover
                window.sourceflow.blockPanels.push(new BlockPanel({
                    app: protyle.app,
                    isBacklink: false,
                    targetElement: refElement,
                    refDefs: [{refID: id}]
                }));
                event.preventDefault();
                event.stopPropagation();
                return true;
            }
        }
        /// #endif

        if (matchHotKey("⇧⌘V", event)) {
            event.returnValue = false;
            event.preventDefault();
            event.stopPropagation();
            pasteAsPlainText(protyle);
            return;
        }

        /// #if !BROWSER
        if (matchHotKey(window.sourceflow.config.keymap.editor.general.showInFolder.custom, event)) {
            const aElement = hasClosestByAttribute(range.startContainer, "data-type", "a");
            if (aElement) {
                const linkAddress = aElement.getAttribute("data-href");
                if (isLocalPath(linkAddress)) {
                    openBy(linkAddress, "folder");
                    event.preventDefault();
                    event.stopPropagation();
                }
            }
            return;
        }
        /// #endif

        if (matchHotKey(window.sourceflow.config.keymap.editor.general.openBy.custom, event)) {
            const aElement = hasClosestByAttribute(range.startContainer, "data-type", "a");
            if (aElement) {
                openLink(protyle, aElement.getAttribute("data-href"), undefined, false);
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const fileElement = hasClosestByAttribute(range.startContainer, "data-type", "file-annotation-ref");
            if (fileElement) {
                const fileIds = fileElement.getAttribute("data-id").split("/");
                const linkAddress = `assets/${fileIds[1]}`;
                openLink(protyle, linkAddress, undefined, false);
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            return;
        }

        // 和自定义 alt+shift+左/右 冲突，降低优先级  https://github.com/lonelyor/SourceFlow/issues/14638
        if (event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
            const selectElements = protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select");
            if (selectElements.length > 0) {
                event.stopPropagation();
                event.preventDefault();
                return;
            }

            if (!range.toString()) {
                if (event.key === "ArrowRight" && isEndOfBlock(range) && !isIncludesHotKey("⌥⇧→")) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                const nodeEditableElement = getContenteditableElement(nodeElement);
                const position = getSelectionOffset(nodeEditableElement, protyle.wysiwyg.element, range);
                if (position.start === 0 && event.key === "ArrowLeft" && !isIncludesHotKey("⌥⇧←")) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
            }
        }

        // 置于最后，太多快捷键会使用到选中元素
        if (isNotCtrl(event) && event.key !== "Backspace" && event.key !== "Escape" && event.key !== "Delete" && !event.shiftKey && !event.altKey && event.key !== "Enter") {
            hideElements(["select"], protyle);
        }

        if (matchHotKey("⌘B", event) || matchHotKey("⌘I", event) || matchHotKey("⌘U", event)) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
};
