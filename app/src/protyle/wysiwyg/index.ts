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
import {applyEditorStructureGuideClasses} from "../util/structureGuide";

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
