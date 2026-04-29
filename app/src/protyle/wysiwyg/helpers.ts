import {enableLuteMarkdownSyntax, getTextStar, paste, restoreLuteMarkdownSyntax} from "../util/paste";
import {
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByClassName,
    isInEmbedBlock,
} from "../util/hasClosest";
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
} from "../util/selection";
import {Constants} from "../../constants";
import {isMobile} from "../../util/functions";
import {previewDocImage} from "../preview/image";
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
} from "../../menus/protyle";
import * as dayjs from "dayjs";
import {dropEvent} from "../util/editorCommonEvent";
import {input} from "./input";
import {
    getContenteditableElement,
    getNextBlock,
    getTopAloneElement,
    hasNextSibling,
    hasPreviousSibling,
    isEndOfBlock,
    isNotEditBlock
} from "./getBlock";
import {transaction, updateTransaction} from "./transaction";
import {hideElements} from "../ui/hideElements";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif
import {getEnableHTML, removeEmbed} from "./removeEmbed";
import {keydown} from "./keydown";
import {openMobileFileById} from "../../mobile/editor";
import {removeBlock} from "./remove";
import {highlightRender} from "../render/highlightRender";
import {openAttr} from "../../menus/commonMenuItem";
import {blockRender} from "../render/blockRender";
import {getIdFromSYProtocol, isSYProtocol} from "../../util/pathName";
/// #if !MOBILE
import {getAllModels} from "../../layout/getAll";
import {pushBack} from "../../util/backForward";
import {openFileById} from "../../editor/util";
import {openGlobalSearch} from "../../search/util";
/// #else
import {popSearch} from "../../mobile/menu/search";
/// #endif
import {BlockPanel} from "../../block/Panel";
import {appendSourceFlowClipboardHTMLComment, copyPlainText, isInIOS, isMac, isOnlyMeta, readClipboard} from "../util/compatibility";
import {MenuItem} from "../../menus/Menu";
import {fetchPost, fetchSyncPost} from "../../util/fetch";
import {onGet} from "../util/onGet";
import {clearTableCell, isIncludeCell, setTableAlign, updateTableTitle} from "../util/table";
import {countBlockWord, countSelectWord} from "../../layout/status";
import {showMessage} from "../../dialog/message";
import {getBacklinkHeadingMore, loadBreadcrumb} from "./renderBacklink";
import {removeSearchMark} from "../toolbar/util";
import {activeBlur} from "../../mobile/util/keyboardToolbar";
import {commonClick} from "./commonClick";
import {avClick, avContextmenu, updateAVName} from "../render/av/action";
import {selectRow, stickyRow} from "../render/av/row";
import {showColMenu} from "../render/av/col";
import {openViewMenu} from "../render/av/view";
import {checkFold} from "../../util/noRelyPCFunction";
import {
    addDragFill,
    dragFillCellsValue,
    genCellValueByElement,
    getCellText,
    getPositionByCellElement,
    getTypeByCellElement,
    updateCellsValue
} from "../render/av/cell";
import {openEmojiPanel, unicode2Emoji} from "../../emoji";
import {openLink} from "../../editor/openLink";
import {mathRender} from "../render/mathRender";
import {editAssetItem} from "../render/av/asset";
import {img3115} from "../../boot/compatibleVersion";
import {globalClickHideMenu} from "../../boot/globalEvent/click";
import {hideTooltip} from "../../dialog/tooltip";
import {openGalleryItemMenu} from "../render/av/gallery/util";
import {clearSelect} from "../util/clear";
import {chartRender} from "../render/chartRender";
import {reloadProtyle} from "../util/reload";
import {updateCalloutType} from "./callout";
import {nbsp2space, removeZWJ} from "../util/normalizeText";
import {getAVViewAttr, getFullWidthAttr} from "../../util/attrCompat";


    export const escapeInline = (protyle: IProtyle, range: Range, event: InputEvent) => {
        if (!event.data && event.inputType !== "insertLineBreak") {
            return;
        }

        const inputData = event.data;
        protyle.toolbar.range = range;
        const inlineElement = range.startContainer.parentElement;
        const currentTypes = protyle.toolbar.getCurrentType();

        // https://github.com/lonelyor/SourceFlow/issues/11766
        if (event.inputType === "insertLineBreak") {
            if (currentTypes.length > 0 && range.toString() === "" && inlineElement.tagName === "SPAN" &&
                inlineElement.textContent.startsWith("\n") &&
                range.startContainer.previousSibling && range.startContainer.previousSibling.textContent === "\n") {
                inlineElement.before(range.startContainer.previousSibling);
            }
            return;
        }

        let dataLength = inputData.length;
        if (inputData === "<" || inputData === ">") {
            // 使用 inlineElement.innerHTML 会出现 中的第2个问题
            dataLength = 4;
        } else if (inputData === "&") {
            // https://github.com/lonelyor/SourceFlow/issues/12239
            dataLength = 5;
        }
        // https://github.com/lonelyor/SourceFlow/issues/5924
        if (currentTypes.length > 0 && range.toString() === "" && range.startOffset === inputData.length &&
            inlineElement.tagName === "SPAN" &&
            inlineElement.textContent.replace(Constants.ZWSP, "") !== inputData &&
            inlineElement.textContent.replace(Constants.ZWSP, "").length >= inputData.length &&
            !hasPreviousSibling(range.startContainer) && !hasPreviousSibling(inlineElement)) {
            const html = inlineElement.innerHTML.replace(Constants.ZWSP, "");
            inlineElement.innerHTML = html.substr(dataLength);
            const textNode = document.createTextNode(inputData);
            inlineElement.before(textNode);
            range.selectNodeContents(textNode);
            range.collapse(false);
            return;
        }
        if (// 表格行内公式之前无法插入文字 https://github.com/lonelyor/SourceFlow/issues/3908
            inlineElement.tagName === "SPAN" &&
            inlineElement.textContent !== inputData &&
            !currentTypes.includes("search-mark") &&    // https://github.com/lonelyor/SourceFlow/issues/7586
            !currentTypes.includes("code") &&   // https://github.com/lonelyor/SourceFlow/issues/13871
            !currentTypes.includes("kbd") &&
            !currentTypes.includes("tag") &&
            range.toString() === "" && range.startContainer.nodeType === 3 &&
            (currentTypes.includes("inline-memo") || currentTypes.includes("block-ref") || currentTypes.includes("file-annotation-ref") || currentTypes.includes("a")) &&
            !hasNextSibling(range.startContainer) && range.startContainer.textContent.length === range.startOffset &&
            inlineElement.textContent.length > inputData.length
        ) {
            const position = getSelectionOffset(inlineElement, protyle.wysiwyg.element, range);
            const html = inlineElement.innerHTML;
            if (position.start === inlineElement.textContent.length) {
                // 使用 inlineElement.textContent **$a$b** 中数学公式消失
                inlineElement.innerHTML = html.substr(0, html.length - dataLength);
                const textNode = document.createTextNode(inputData);
                inlineElement.after(textNode);
                range.selectNodeContents(textNode);
                range.collapse(false);
            }
        }
    }

    export const setEmptyOutline = (protyle: IProtyle, element: HTMLElement) => {
        let nodeElement = element;
        if (!element.getAttribute("data-node-id")) {
            const tempElement = hasClosestBlock(element);
            if (!tempElement) {
                return;
            }
            nodeElement = tempElement;
        }
        /// #if !MOBILE
        if (protyle.model) {
            getAllModels().outline.forEach(item => {
                if (item.blockId === protyle.block.rootID) {
                    item.setCurrent(nodeElement);
                }
            });
        }
        /// #else
        if (protyle.disabled) {
            protyle.toolbar.range = getEditorRange(nodeElement);
        }
        /// #endif
    }

    export const emojiToMd = (element: HTMLElement) => {
        element.querySelectorAll(".emoji").forEach((item: HTMLElement) => {
            item.outerHTML = `:${item.getAttribute("alt")}:`;
        });
    }

