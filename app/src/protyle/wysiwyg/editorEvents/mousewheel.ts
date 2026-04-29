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
