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



export const fileAnnotationRefMenu = (protyle: IProtyle, refElement: HTMLElement) => {
    const nodeElement = hasClosestBlock(refElement);
    if (!nodeElement) {
        return;
    }
    hideElements(["util", "toolbar", "hint"], protyle);
    const id = nodeElement.getAttribute("data-node-id");
    let oldHTML = nodeElement.outerHTML;
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_INLINE_FILE_ANNOTATION_REF);
    let anchorElement: HTMLInputElement;
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "idAndAnchor",
        iconHTML: "",
        type: "readonly",
        label: `<div>ID</div><textarea spellcheck="false" rows="1" style="margin:4px 0;width: ${isMobile() ? "100%" : "360px"}" class="b3-text-field" readonly>${refElement.getAttribute("data-id") || ""}</textarea><div class="fn__hr"></div><div>${window.sourceflow.languages.anchor}</div><textarea rows="1" style="margin:4px 0;width: ${isMobile() ? "100%" : "360px"}" class="b3-text-field"></textarea>`,
        bind(menuItemElement) {
            menuItemElement.style.maxWidth = "none";
            anchorElement = menuItemElement.querySelectorAll(".b3-text-field")[1] as HTMLInputElement;
            anchorElement.value = refElement.textContent;
            const inputEvent = () => {
                if (anchorElement.value) {
                    refElement.innerHTML = Lute.EscapeHTMLStr(anchorElement.value);
                } else {
                    refElement.innerHTML = "*";
                }
            };
            anchorElement.addEventListener("input", (event: KeyboardEvent) => {
                if (event.isComposing) {
                    return;
                }
                inputEvent();
                event.stopPropagation();
            });
            anchorElement.addEventListener("compositionend", (event: KeyboardEvent) => {
                if (event.isComposing) {
                    return;
                }
                inputEvent();
                event.stopPropagation();
            });
            anchorElement.addEventListener("keydown", (event: KeyboardEvent) => {
                if (event.isComposing) {
                    return;
                }
                if (event.key === "Enter" && !event.isComposing) {
                    window.sourceflow.menus.menu.remove();
                } else if (electronUndo(event)) {
                    return;
                }
            });
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({type: "separator"}).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "turnInto",
        label: window.sourceflow.languages.turnInto,
        icon: "iconRefresh",
        submenu: [{
            id: "text",
            iconHTML: "",
            label: window.sourceflow.languages.text,
            click() {
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                removeInlineType(refElement, "file-annotation-ref", protyle.toolbar.range);
                updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                oldHTML = nodeElement.outerHTML;
            }
        }, {
            id: "text*",
            iconHTML: "",
            label: window.sourceflow.languages.text + " *",
            click() {
                refElement.insertAdjacentHTML("beforebegin", refElement.innerHTML + " ");
                refElement.textContent = "*";
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                oldHTML = nodeElement.outerHTML;
            }
        }]
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "remove",
        icon: "iconTrashcan",
        label: window.sourceflow.languages.remove,
        click() {
            refElement.insertAdjacentHTML("afterend", "<wbr>");
            refElement.remove();
            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
            updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
            focusByWbr(nodeElement, protyle.toolbar.range);
            oldHTML = nodeElement.outerHTML;
        }
    }).element);

    if (protyle?.app?.plugins) {
        emitOpenMenu({
            plugins: protyle.app.plugins,
            type: "open-menu-fileannotationref",
            detail: {
                protyle,
                element: refElement,
            },
            separatorPosition: "top",
        });
    }
    /// #if MOBILE
    window.sourceflow.menus.menu.fullscreen();
    /// #else
    const rect = refElement.getBoundingClientRect();
    window.sourceflow.menus.menu.popup({
        x: rect.left,
        y: rect.top + 26,
        h: 26
    });
    /// #endif
    const popoverElement = hasTopClosestByClassName(protyle.element, "block__popover", true);
    window.sourceflow.menus.menu.element.setAttribute("data-from", popoverElement ? popoverElement.dataset.level + "popover" : "app");
    anchorElement.select();
    window.sourceflow.menus.menu.removeCB = () => {
        if (nodeElement.outerHTML !== oldHTML) {
            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
            updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
        }

        const currentRange = getSelection().rangeCount === 0 ? undefined : getSelection().getRangeAt(0);
        if (currentRange && !protyle.element.contains(currentRange.startContainer)) {
            protyle.toolbar.range.selectNodeContents(refElement);
            protyle.toolbar.range.collapse(false);
            focusByRange(protyle.toolbar.range);
        }
    };
};
