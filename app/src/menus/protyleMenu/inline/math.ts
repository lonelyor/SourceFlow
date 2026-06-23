import {
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByClassName,
    isInEmbedBlock
} from "../../../protyle/util/hasClosest";
import {MenuItem} from "../../Menu";
import {focusBlock, focusByRange, focusByWbr, getEditorRange, selectAll,} from "../../../protyle/util/selection";
import {
    deleteColumn,
    deleteRow,
    getColIndex,
    insertColumn,
    insertRow,
    insertRowAbove,
    moveColumnToLeft,
    moveColumnToRight,
    moveRowToDown,
    moveRowToUp,
    setTableAlign,
    updateTableTitle
} from "../../../protyle/util/table";
import {mathRender} from "../../../protyle/render/mathRender";
import {transaction, updateTransaction} from "../../../protyle/wysiwyg/transaction";
import {openMenu} from "../../commonMenuItem";
import {fetchPost, fetchSyncPost} from "../../../util/fetch";
import {Constants} from "../../../constants";
import {copyPlainText, readClipboard, setStorageVal, updateHotkeyTip, writeText} from "../../../protyle/util/compatibility";
import {preventScroll} from "../../../protyle/scroll/preventScroll";
import {onGet} from "../../../protyle/util/onGet";
import {getAllModels} from "../../../layout/getAll";
import {getPlainText, paste, pasteAsImage, pasteAsPlainText, pasteAsSmartTable, pasteEscaped, pastePreserveLayout} from "../../../protyle/util/paste";
/// #if !MOBILE
import {openFileById, updateBacklinkGraph} from "../../../editor/util";
import {openGlobalSearch} from "../../../search/util";
import {openNewWindowById} from "../../../window/openNewWindow";
/// #endif
import {getSearch, isMobile} from "../../../util/functions";
import {removeFoldHeading} from "../../../protyle/util/heading";
import {lineNumberRender} from "../../../protyle/render/highlightRender";
import * as dayjs from "dayjs";
import {blockRender} from "../../../protyle/render/blockRender";
import {renameAsset} from "../../../editor/rename";
import {electronUndo} from "../../../protyle/undo";
import {pushBack} from "../../../mobile/util/MobileBackFoward";
import {copyPNGByLink, exportAsset, writeAssetToClipboard} from "../../util";
import {removeInlineType} from "../../../protyle/toolbar/util";
import {alignImgCenter, alignImgLeft} from "../../../protyle/wysiwyg/commonHotkey";
import {checkFold, renameTag} from "../../../util/noRelyPCFunction";
import {hideElements} from "../../../protyle/ui/hideElements";
import {emitOpenMenu} from "../../../plugin/EventBus";
import {openMobileFileById} from "../../../mobile/editor";
import {openBacklink, openGraph} from "../../../layout/dock/util";
import {renderAssetsPreview} from "../../../asset/renderAssets";
import {upDownHint} from "../../../util/upDownHint";
import {hintRenderAssets} from "../../../protyle/hint/extend";
import {Menu} from "../../../plugin/Menu";
import {getFirstBlock} from "../../../protyle/wysiwyg/getBlock";
import {getIdFromSYProtocol, isSYProtocol} from "../../../util/pathName";
import {popSearch} from "../../../mobile/menu/search";
import {showMessage} from "../../../dialog/message";
import {img3115} from "../../../boot/compatibleVersion";
import {hideTooltip} from "../../../dialog/tooltip";
import {clearSelect} from "../../../protyle/util/clear";
import {scrollCenter} from "../../../util/highlightById";
import {base64ToURL} from "../../../util/image";
import {uploadFiles} from "../../../protyle/upload";
import {reloadProtyle} from "../../../protyle/util/reload";
import {appendAssistantContextActions} from "../../../assistant/skills/contextActions";
import {net2LocalAssets} from "../../../protyle/breadcrumb/action";



export const inlineMathMenu = (protyle: IProtyle, element: Element) => {
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_INLINE_MATH);
    const nodeElement = hasClosestBlock(element);
    if (!nodeElement) {
        return;
    }
    const id = nodeElement.getAttribute("data-node-id");
    const html = nodeElement.outerHTML;
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "copy",
        label: window.sourceflow.languages.copy,
        icon: "iconCopy",
        click() {
            const range = document.createRange();
            range.selectNode(element);
            focusByRange(range);
            document.execCommand("copy");
        }
    }).element);
    if (!protyle.disabled) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "cut",
            icon: "iconCut",
            label: window.sourceflow.languages.cut,
            click() {
                const range = document.createRange();
                range.selectNode(element);
                focusByRange(range);
                document.execCommand("cut");
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "remove",
            icon: "iconTrashcan",
            label: window.sourceflow.languages.remove,
            click() {
                element.insertAdjacentHTML("afterend", "<wbr>");
                element.remove();
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                updateTransaction(protyle, id, nodeElement.outerHTML, html);
                focusByWbr(nodeElement, protyle.toolbar.range);
            }
        }).element);
    }
    const rect = element.getBoundingClientRect();
    window.sourceflow.menus.menu.popup({
        x: rect.left,
        y: rect.top + 26,
        h: 26
    });
};
