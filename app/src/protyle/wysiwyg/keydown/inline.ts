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
import {AIChat} from "../../../ai/chat";
import {updateCalloutType} from "../callout";
import {tabCodeBlock} from "../codeBlock";


export const getContentByInlineHTML = (range: Range, cb: (content: string) => void) => {
    let html = "";
    Array.from(range.cloneContents().childNodes).forEach((item: HTMLElement) => {
        if (item.nodeType === 3) {
            html += item.textContent;
        } else {
            html += item.outerHTML;
        }
    });
    fetchPost("/api/block/getDOMText", {dom: html}, (response) => {
        cb(response.data);
    });
};
