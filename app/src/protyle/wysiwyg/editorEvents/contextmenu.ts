import {enableLuteMarkdownSyntax, getTextStar, paste, restoreLuteMarkdownSyntax} from "../../util/paste";
import {
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByClassName,
    isInEmbedBlock,
} from "../../util/hasClosest";
import {
    focusBlock,
    focusByRange,
    focusByWbr,
    focusSideBlock,
    getEditorRange,
    getSelectionOffset,
    setFirstNodeRange,
    setInsertWbrHTML,
    setLastNodeRange,
} from "../../util/selection";
import {Constants} from "../../../constants";
import {isMobile} from "../../../util/functions";
import {previewDocImage} from "../../preview/image";
import {
    contentMenu,
    enterBack,
    fileAnnotationRefMenu,
    imgMenu,
    inlineMathMenu,
    linkMenu,
    refMenu,
    setFold,
    tagMenu,
    zoomOut
} from "../../../menus/protyle";
import * as dayjs from "dayjs";
import {dropEvent} from "../../util/editorCommonEvent";
import {input} from "../input";
import {
    getContenteditableElement,
    getNextBlock,
    getTopAloneElement,
    hasNextSibling,
    hasPreviousSibling,
    isEndOfBlock,
    isNotEditBlock
} from "../getBlock";
import {transaction, updateTransaction} from "../transaction";
import {hideElements} from "../../ui/hideElements";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif
import {getEnableHTML, removeEmbed} from "../removeEmbed";
import {keydown} from "../keydown";
import {openMobileFileById} from "../../../mobile/editor";
import {removeBlock} from "../remove";
import {highlightRender} from "../../render/highlightRender";
import {openAttr} from "../../../menus/commonMenuItem";
import {blockRender} from "../../render/blockRender";
import {getIdFromSYProtocol, isSYProtocol} from "../../../util/pathName";
/// #if !MOBILE
import {getAllModels} from "../../../layout/getAll";
import {pushBack} from "../../../util/backForward";
import {openFileById} from "../../../editor/util";
import {openGlobalSearch} from "../../../search/util";
/// #else
import {popSearch} from "../../../mobile/menu/search";
/// #endif
import {BlockPanel} from "../../../block/Panel";
import {appendSourceFlowClipboardHTMLComment, copyPlainText, isInIOS, isMac, isOnlyMeta, readClipboard} from "../../util/compatibility";
import {MenuItem} from "../../../menus/Menu";
import {fetchPost, fetchSyncPost} from "../../../util/fetch";
import {onGet} from "../../util/onGet";
import {clearTableCell, isIncludeCell, setTableAlign, updateTableTitle} from "../../util/table";
import {countBlockWord, countSelectWord} from "../../../layout/status";
import {showMessage} from "../../../dialog/message";
import {getBacklinkHeadingMore, loadBreadcrumb} from "../renderBacklink";
import {removeSearchMark} from "../../toolbar/util";
import {activeBlur} from "../../../mobile/util/keyboardToolbar";
import {commonClick} from "../commonClick";
import {avClick, avContextmenu, updateAVName} from "../../render/av/action";
import {selectRow, stickyRow} from "../../render/av/row";
import {showColMenu} from "../../render/av/col";
import {openViewMenu} from "../../render/av/view";
import {checkFold} from "../../../util/noRelyPCFunction";
import {
    addDragFill,
    dragFillCellsValue,
    genCellValueByElement,
    getCellText,
    getPositionByCellElement,
    getTypeByCellElement,
    updateCellsValue
} from "../../render/av/cell";
import {openEmojiPanel, unicode2Emoji} from "../../../emoji";
import {openLink} from "../../../editor/openLink";
import {mathRender} from "../../render/mathRender";
import {editAssetItem} from "../../render/av/asset";
import {img3115} from "../../../boot/compatibleVersion";
import {globalClickHideMenu} from "../../../boot/globalEvent/click";
import {hideTooltip} from "../../../dialog/tooltip";
import {openGalleryItemMenu} from "../../render/av/gallery/util";
import {clearSelect} from "../../util/clear";
import {chartRender} from "../../render/chartRender";
import {reloadProtyle} from "../../util/reload";
import {updateCalloutType} from "../callout";
import {nbsp2space, removeZWJ} from "../../util/normalizeText";
import {getAVViewAttr, getFullWidthAttr} from "../../../util/attrCompat";

import {emojiToMd, escapeInline, setEmptyOutline} from "../helpers";
import type {WYSIWYGEditorEventState, WYSIWYGEventContext} from "../shared";

export const registerContextMenuEvent = (wysiwyg: WYSIWYGEventContext, protyle: IProtyle, state: WYSIWYGEditorEventState) => {
        wysiwyg.element.addEventListener("contextmenu", (event: MouseEvent & { detail: any }) => {
            if (event.shiftKey) {
                return;
            }
            event.stopPropagation();
            event.preventDefault();
            const x = event.clientX || event.detail.x;
            const y = event.clientY || event.detail.y;
            const selectElements = protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select");
            if (selectElements.length > 1) {
                // 多选块
                hideElements(["util"], protyle);
                protyle.gutter.renderMenu(protyle, selectElements[0]);
                window.sourceflow.menus.menu.popup({x, y});
                return;
            }
            const target = event.detail.target || event.target as HTMLElement;
            const embedElement = isInEmbedBlock(target);
            if (embedElement) {
                if (getSelection().rangeCount === 0) {
                    focusSideBlock(embedElement);
                }
                protyle.gutter.renderMenu(protyle, embedElement);
                /// #if MOBILE
                window.sourceflow.menus.menu.fullscreen();
                /// #else
                window.sourceflow.menus.menu.popup({x, y});
                /// #endif
                return false;
            }

            const nodeElement = hasClosestBlock(target);
            if (!nodeElement) {
                return false;
            }
            const avGalleryItemElement = hasClosestByClassName(target, "av__gallery-item");
            if (avGalleryItemElement) {
                openGalleryItemMenu({
                    target: avGalleryItemElement.querySelector(".protyle-icon--last"),
                    protyle,
                    position: {
                        x: event.clientX,
                        y: event.clientY
                    }
                });
                event.stopPropagation();
                event.preventDefault();
                return false;
            }
            const avCellElement = hasClosestByClassName(target, "av__cell");
            if (avCellElement) {
                if (avCellElement.classList.contains("av__cell--header")) {
                    if (!protyle.disabled) {
                        showColMenu(protyle, nodeElement, avCellElement);
                    }
                    event.stopPropagation();
                    event.preventDefault();
                    return;
                }
                if (getTypeByCellElement(avCellElement) === "mAsset") {
                    const assetImgElement = hasClosestByClassName(target, "av__cellassetimg") || hasClosestByClassName(target, "av__celltext--url");
                    if (assetImgElement) {
                        let index = 0;
                        Array.from(avCellElement.children).find((item, i) => {
                            if (item === assetImgElement) {
                                index = i;
                                return true;
                            }
                        });
                        editAssetItem({
                            protyle,
                            cellElements: [avCellElement],
                            blockElement: hasClosestBlock(assetImgElement) as HTMLElement,
                            content: target.tagName === "IMG" ? target.getAttribute("src") : target.getAttribute("data-url"),
                            type: target.tagName === "IMG" ? "image" : "file",
                            name: target.tagName === "IMG" ? "" : target.getAttribute("data-name"),
                            index,
                            rect: target.getBoundingClientRect()
                        });
                        event.stopPropagation();
                        event.preventDefault();
                        return;
                    }
                }
            }
            // 在 span 前面，防止单元格哪 block-ref 被修改
            const avRowElement = hasClosestByClassName(target, "av__row");
            if (avRowElement && avContextmenu(protyle, avRowElement, {
                x: event.clientX,
                y: avRowElement.getBoundingClientRect().bottom,
                h: avRowElement.clientHeight
            })) {
                event.stopPropagation();
                event.preventDefault();
                return;
            }

            const avTabHeaderElement = hasClosestByClassName(target, "item");
            if (nodeElement.classList.contains("av") && avTabHeaderElement) {
                if (avTabHeaderElement.classList.contains("item--focus")) {
                    openViewMenu({protyle, blockElement: nodeElement, element: avTabHeaderElement});
                } else {
                    transaction(protyle, [{
                        action: "setAttrViewBlockView",
                        blockID: nodeElement.getAttribute("data-node-id"),
                        id: avTabHeaderElement.dataset.id,
                        avID: nodeElement.getAttribute("data-av-id"),
                    }], [{
                        action: "setAttrViewBlockView",
                        blockID: nodeElement.getAttribute("data-node-id"),
                        id: avTabHeaderElement.parentElement.querySelector(".item--focus").getAttribute("data-id"),
                        avID: nodeElement.getAttribute("data-av-id"),
                    }]);
                    window.sourceflow.menus.menu.remove();
                    openViewMenu({
                        protyle,
                        blockElement: nodeElement,
                        element: avTabHeaderElement
                    });
                }
                event.stopPropagation();
                event.preventDefault();
                return;
            }

            protyle.toolbar.range = getEditorRange(protyle.element);

            if (target.tagName === "SPAN" && !isNotEditBlock(nodeElement)) { //
                let types = target.getAttribute("data-type")?.split(" ") || [];
                if (types.length === 0) {
                    // https://github.com/lonelyor/SourceFlow/issues/8960
                    types = (target.dataset.type || "").split(" ");
                }
                if (types.length > 0) {
                    removeSearchMark(target);
                }
                if (types.includes("block-ref")) {
                    refMenu(protyle, target);
                    // 阻止 popover
                    target.setAttribute("prevent-popover", "true");
                    setTimeout(() => {
                        target.removeAttribute("prevent-popover");
                    }, 620);
                    return false;
                } else if (types.includes("file-annotation-ref") && !protyle.disabled) {
                    fileAnnotationRefMenu(protyle, target);
                    return false;
                } else if (types.includes("tag") && !protyle.disabled) {
                    tagMenu(protyle, target);
                    return false;
                } else if (types.includes("inline-memo")) {
                    protyle.toolbar.showRender(protyle, target);
                    return false;
                } else if (types.includes("a")) {
                    linkMenu(protyle, target);
                    if (window.sourceflow.config.editor.floatWindowMode === 0 &&
                        isSYProtocol(target.getAttribute("data-href") || "")) {
                        // 阻止 popover
                        target.setAttribute("prevent-popover", "true");
                        setTimeout(() => {
                            target.removeAttribute("prevent-popover");
                        }, 620);
                    }
                    return false;
                }
            }
            const inlineMathElement = hasClosestByAttribute(target, "data-type", "inline-math");
            if (inlineMathElement) {
                inlineMathMenu(protyle, inlineMathElement);
                return false;
            }
            if (target.tagName === "IMG" && hasClosestByClassName(target, "img")) {
                imgMenu(protyle, protyle.toolbar.range, target.parentElement.parentElement, {
                    clientX: x + 4,
                    clientY: y
                });
                return false;
            }
            if (!isNotEditBlock(nodeElement) && !nodeElement.classList.contains("protyle-wysiwyg--select") &&
                !hasClosestByClassName(target, "protyle-action") && // https://github.com/lonelyor/SourceFlow/issues/8983
                (isMobile() || event.detail.target || (state.beforeContextmenuRange && nodeElement.contains(state.beforeContextmenuRange.startContainer)))
            ) {
                if ((!isMobile() || protyle.toolbar?.element.classList.contains("fn__none")) && !nodeElement.classList.contains("av")) {
                    contentMenu(protyle, nodeElement);
                    window.sourceflow.menus.menu.popup({x, y: y + 13, h: 26});
                    protyle.toolbar?.element.classList.add("fn__none");
                    if (nodeElement.classList.contains("table")) {
                        nodeElement.querySelector(".table__select").removeAttribute("style");
                    }
                }
            } else if (protyle.toolbar.range.toString() === "") {
                hideElements(["util"], protyle);
                if (protyle.gutter) {
                    protyle.gutter.renderMenu(protyle, nodeElement);
                }
                /// #if MOBILE
                window.sourceflow.menus.menu.fullscreen();
                /// #else
                window.sourceflow.menus.menu.popup({x, y});
                /// #endif
                protyle.toolbar?.element.classList.add("fn__none");
            }
        });

};
