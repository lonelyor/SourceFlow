import {
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByClassName,
    isInEmbedBlock
} from "../../protyle/util/hasClosest";
import {MenuItem} from "../Menu";
import {focusBlock, focusByRange, focusByWbr, getEditorRange, selectAll,} from "../../protyle/util/selection";
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
} from "../../protyle/util/table";
import {mathRender} from "../../protyle/render/mathRender";
import {transaction, updateTransaction} from "../../protyle/wysiwyg/transaction";
import {openMenu} from "../commonMenuItem";
import {fetchPost, fetchSyncPost} from "../../util/fetch";
import {Constants} from "../../constants";
import {copyPlainText, readClipboard, setStorageVal, updateHotkeyTip, writeText} from "../../protyle/util/compatibility";
import {preventScroll} from "../../protyle/scroll/preventScroll";
import {onGet} from "../../protyle/util/onGet";
import {getAllModels} from "../../layout/getAll";
import {getPlainText, paste, pasteAsImage, pasteAsPlainText, pasteAsSmartTable, pasteEscaped, pastePreserveLayout} from "../../protyle/util/paste";
/// #if !MOBILE
import {openFileById, updateBacklinkGraph} from "../../editor/util";
import {openGlobalSearch} from "../../search/util";
import {openNewWindowById} from "../../window/openNewWindow";
/// #endif
import {getSearch, isMobile} from "../../util/functions";
import {removeFoldHeading} from "../../protyle/util/heading";
import {lineNumberRender} from "../../protyle/render/highlightRender";
import * as dayjs from "dayjs";
import {blockRender} from "../../protyle/render/blockRender";
import {renameAsset} from "../../editor/rename";
import {electronUndo} from "../../protyle/undo";
import {pushBack} from "../../mobile/util/MobileBackFoward";
import {copyPNGByLink, exportAsset, writeAssetToClipboard} from "../util";
import {removeInlineType} from "../../protyle/toolbar/util";
import {alignImgCenter, alignImgLeft} from "../../protyle/wysiwyg/commonHotkey";
import {checkFold, renameTag} from "../../util/noRelyPCFunction";
import {hideElements} from "../../protyle/ui/hideElements";
import {emitOpenMenu} from "../../plugin/EventBus";
import {openMobileFileById} from "../../mobile/editor";
import {openBacklink, openGraph} from "../../layout/dock/util";
import {renderAssetsPreview} from "../../asset/renderAssets";
import {upDownHint} from "../../util/upDownHint";
import {hintRenderAssets} from "../../protyle/hint/extend";
import {Menu} from "../../plugin/Menu";
import {getFirstBlock} from "../../protyle/wysiwyg/getBlock";
import {getIdFromSYProtocol, isSYProtocol} from "../../util/pathName";
import {popSearch} from "../../mobile/menu/search";
import {showMessage} from "../../dialog/message";
import {img3115} from "../../boot/compatibleVersion";
import {hideTooltip} from "../../dialog/tooltip";
import {clearSelect} from "../../protyle/util/clear";
import {scrollCenter} from "../../util/highlightById";
import {base64ToURL} from "../../util/image";
import {uploadFiles} from "../../protyle/upload";
import {reloadProtyle} from "../../protyle/util/reload";
import {appendAssistantContextActions} from "../../assistant/skills/contextActions";
import {net2LocalAssets} from "../../protyle/breadcrumb/action";


const renderAssetList = (element: Element, k: string, position: IPosition, exts: string[] = []) => {
    fetchPost("/api/search/searchAsset", {
        k,
        exts
    }, (response) => {
        let searchHTML = "";
        response.data.forEach((item: { path: string, hName: string }, index: number) => {
            searchHTML += `<div data-value="${item.path}" class="b3-list-item${index === 0 ? " b3-list-item--focus" : ""}"><div class="b3-list-item__text">${item.hName}</div></div>`;
        });

        const listElement = element.querySelector(".b3-list");
        const previewElement = element.querySelector("#preview");
        const inputElement = element.querySelector("input");
        listElement.innerHTML = searchHTML || `<li class="b3-list--empty">${window.sourceflow.languages.emptyContent}</li>`;
        if (response.data.length > 0) {
            previewElement.innerHTML = renderAssetsPreview(response.data[0].path);
        } else {
            previewElement.innerHTML = window.sourceflow.languages.emptyContent;
        }
        /// #if MOBILE
        window.sourceflow.menus.menu.fullscreen();
        /// #else
        window.sourceflow.menus.menu.popup(position);
        /// #endif
        if (!k) {
            inputElement.select();
        }
    });
};

export const assetMenu = (protyle: IProtyle, position: IPosition, callback?: (url: string, name: string) => void, exts?: string[]) => {
    const menu = new Menu(Constants.MENU_BACKGROUND_ASSET);
    if (menu.isOpen) {
        return;
    }
    menu.addItem({
        iconHTML: "",
        type: "readonly",
        label: `<div class="fn__flex" style="max-height: ${isMobile() ? "80" : "50"}vh">
<div class="fn__flex-column" style="${isMobile() ? "width:100%" : "min-width: 260px;max-width:420px"}">
    <div class="fn__flex" style="margin: 0 8px 4px 8px">
        <input class="b3-text-field fn__flex-1"/>
        <span class="fn__space"></span>
        <span data-type="previous" class="block__icon block__icon--show"><svg><use xlink:href="#iconLeft"></use></svg></span>
        <span class="fn__space"></span>
        <span data-type="next" class="block__icon block__icon--show"><svg><use xlink:href="#iconRight"></use></svg></span>
    </div>
    <div class="b3-list fn__flex-1 b3-list--background" style="position: relative"><img style="margin: 0 auto;display: block;width: 64px;height: 64px" src="/stage/loading-pure.svg"></div>
</div>
<div id="preview" style="width: 360px;display: ${isMobile() || window.outerWidth < window.outerWidth / 2 + 260 ? "none" : "flex"};padding: 8px;overflow: auto;justify-content: center;align-items: center;word-break: break-all;"></div>
</div>`,
        bind(element) {
            element.style.maxWidth = "none";
            const listElement = element.querySelector(".b3-list");
            const previewElement = element.querySelector("#preview");
            listElement.addEventListener("mouseover", (event) => {
                const target = event.target as HTMLElement;
                const hoverItemElement = hasClosestByClassName(target, "b3-list-item");
                if (!hoverItemElement) {
                    return;
                }
                previewElement.innerHTML = renderAssetsPreview(hoverItemElement.getAttribute("data-value"));
            });
            const inputElement = element.querySelector("input");
            inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
                if (event.isComposing) {
                    return;
                }
                const isEmpty = element.querySelector(".b3-list--empty");
                if (!isEmpty) {
                    const currentElement = upDownHint(listElement, event);
                    if (currentElement) {
                        previewElement.innerHTML = renderAssetsPreview(currentElement.getAttribute("data-value"));
                        event.stopPropagation();
                    }
                }

                if (event.key === "Enter") {
                    if (!isEmpty) {
                        const currentElement = element.querySelector(".b3-list-item--focus");
                        if (callback) {
                            callback(currentElement.getAttribute("data-value"), currentElement.textContent);
                        } else {
                            hintRenderAssets(currentElement.getAttribute("data-value"), protyle);
                            window.sourceflow.menus.menu.remove();
                        }
                    } else if (!callback) {
                        window.sourceflow.menus.menu.remove();
                        focusByRange(protyle.toolbar.range);
                    }
                    // 避免 Enter 继续触发编辑器里的资源选择逻辑。
                    event.preventDefault();
                    event.stopPropagation();
                } else if (event.key === "Escape") {
                    if (!callback) {
                        focusByRange(protyle.toolbar.range);
                    }
                }
            });
            inputElement.addEventListener("input", (event: InputEvent) => {
                if (event.isComposing) {
                    return;
                }
                event.stopPropagation();
                renderAssetList(element, inputElement.value, position, exts);
            });
            inputElement.addEventListener("compositionend", (event: InputEvent) => {
                event.stopPropagation();
                renderAssetList(element, inputElement.value, position, exts);
            });
            element.lastElementChild.addEventListener("click", (event) => {
                const target = event.target as HTMLElement;
                const previousElement = hasClosestByAttribute(target, "data-type", "previous");
                if (previousElement) {
                    inputElement.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowUp"}));
                    event.stopPropagation();
                    return;
                }
                const nextElement = hasClosestByAttribute(target, "data-type", "next");
                if (nextElement) {
                    inputElement.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"}));
                    event.stopPropagation();
                    return;
                }
                const listItemElement = hasClosestByClassName(target, "b3-list-item");
                if (listItemElement) {
                    event.stopPropagation();
                    const currentURL = listItemElement.getAttribute("data-value");
                    if (callback) {
                        callback(currentURL, listItemElement.textContent);
                    } else {
                        hintRenderAssets(currentURL, protyle);
                        window.sourceflow.menus.menu.remove();
                    }
                }
            });
            renderAssetList(element, "", position, exts);
        }
    });
};

