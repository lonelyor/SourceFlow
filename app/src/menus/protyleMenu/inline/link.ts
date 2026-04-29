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



export const linkMenu = (protyle: IProtyle, linkElement: HTMLElement, focusText = false) => {
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_INLINE_A);
    const nodeElement = hasClosestBlock(linkElement);
    if (!nodeElement) {
        return;
    }
    hideTooltip();
    hideElements(["util", "toolbar", "hint"], protyle);
    const id = nodeElement.getAttribute("data-node-id");
    let html = nodeElement.outerHTML;
    const linkAddress = linkElement.getAttribute("data-href");
    let inputElements: NodeListOf<HTMLTextAreaElement>;
    if (!protyle.disabled) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "linkAndAnchorAndTitle",
            iconHTML: "",
            type: "readonly",
            label: `<div class="fn__flex">
    <span class="fn__flex-center">${window.sourceflow.languages.link}</span>
    <span class="fn__space"></span>
    <span data-action="copy" class="block__icon block__icon--show b3-tooltips b3-tooltips__e fn__flex-center" aria-label="${window.sourceflow.languages.copy}">
        <svg><use xlink:href="#iconCopy"></use></svg>
    </span>   
</div><textarea spellcheck="false" rows="1" 
style="margin:4px 0;width: ${isMobile() ? "100%" : "360px"}" class="b3-text-field"></textarea><div class="fn__hr"></div><div class="fn__flex">
    <span class="fn__flex-center">${window.sourceflow.languages.anchor}</span>
    <span class="fn__space"></span>
    <span data-action="copy" class="block__icon block__icon--show b3-tooltips b3-tooltips__e fn__flex-center" aria-label="${window.sourceflow.languages.copy}">
        <svg><use xlink:href="#iconCopy"></use></svg>
    </span>   
</div><textarea style="width: ${isMobile() ? "100%" : "360px"};margin: 4px 0;" rows="1" class="b3-text-field"></textarea><div class="fn__hr"></div><div class="fn__flex">
    <span class="fn__flex-center">${window.sourceflow.languages.title}</span>
    <span class="fn__space"></span>
    <span data-action="copy" class="block__icon block__icon--show b3-tooltips b3-tooltips__e fn__flex-center" aria-label="${window.sourceflow.languages.copy}">
        <svg><use xlink:href="#iconCopy"></use></svg>
    </span>   
</div><textarea style="width: ${isMobile() ? "100%" : "360px"};margin: 4px 0;" rows="1" class="b3-text-field"></textarea>`,
            bind(element) {
                element.style.maxWidth = "none";
                inputElements = element.querySelectorAll("textarea");
                inputElements[0].value = Lute.UnEscapeHTMLStr(linkAddress) || "";
                inputElements[0].addEventListener("keydown", (event) => {
                    if ((event.key === "Enter" || event.key === "Escape") && !event.isComposing) {
                        event.preventDefault();
                        event.stopPropagation();
                        window.sourceflow.menus.menu.remove();
                    } else if (event.key === "Tab" && !event.isComposing) {
                        event.preventDefault();
                        event.stopPropagation();
                        inputElements[1].focus();
                    } else if (electronUndo(event)) {
                        return;
                    }
                });

                // https://github.com/lonelyor/SourceFlow/issues/6798
                let anchor = linkElement.textContent.replace(Constants.ZWSP, "");
                if (!anchor && linkAddress) {
                    anchor = decodeURIComponent(linkAddress.replace("https://", "").replace("http://", ""));
                    if (anchor.length > Constants.SIZE_LINK_TEXT_MAX) {
                        anchor = anchor.substring(0, Constants.SIZE_LINK_TEXT_MAX) + "...";
                    }
                    linkElement.innerHTML = Lute.EscapeHTMLStr(anchor);
                }
                inputElements[1].value = anchor;
                inputElements[1].addEventListener("compositionend", () => {
                    linkElement.innerHTML = Lute.EscapeHTMLStr(inputElements[1].value.replace(/\n|\r\n|\r|\u2028|\u2029/g, "").trim() || "*");
                });
                inputElements[1].addEventListener("input", (event: KeyboardEvent) => {
                    if (!event.isComposing) {
                        // https://github.com/lonelyor/SourceFlow/issues/4511
                        linkElement.innerHTML = Lute.EscapeHTMLStr(inputElements[1].value.replace(/\n|\r\n|\r|\u2028|\u2029/g, "").trim()) || "*";
                    }
                });
                inputElements[1].addEventListener("keydown", (event) => {
                    if ((event.key === "Enter" || event.key === "Escape") && !event.isComposing) {
                        event.preventDefault();
                        event.stopPropagation();
                        window.sourceflow.menus.menu.remove();
                    } else if (event.key === "Tab" && !event.isComposing) {
                        event.preventDefault();
                        event.stopPropagation();
                        if (event.shiftKey) {
                            inputElements[0].focus();
                        } else {
                            inputElements[2].focus();
                        }
                    } else if (electronUndo(event)) {
                        return;
                    }
                });

                inputElements[2].value = Lute.UnEscapeHTMLStr(linkElement.getAttribute("data-title") || "");
                inputElements[2].addEventListener("keydown", (event) => {
                    if ((event.key === "Enter" || event.key === "Escape") && !event.isComposing) {
                        event.preventDefault();
                        event.stopPropagation();
                        window.sourceflow.menus.menu.remove();
                    } else if (event.key === "Tab" && event.shiftKey && !event.isComposing) {
                        event.preventDefault();
                        event.stopPropagation();
                        inputElements[1].focus();
                    } else if (electronUndo(event)) {
                        return;
                    }
                });

                element.addEventListener("click", (event) => {
                    let target = event.target as HTMLElement;
                    while (target) {
                        if (target.dataset.action === "copy") {
                            writeText((target.parentElement.nextElementSibling as HTMLTextAreaElement).value);
                            showMessage(window.sourceflow.languages.copied);
                            break;
                        }
                        target = target.parentElement;
                    }
                });
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_1", type: "separator"}).element);
    }
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "copy",
        label: window.sourceflow.languages.copy,
        icon: "iconCopy",
        click() {
            const range = document.createRange();
            range.selectNode(linkElement);
            focusByRange(range);
            document.execCommand("copy");
        }
    }).element);
    if (protyle.disabled) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "copyAHref",
            label: window.sourceflow.languages.copyAHref,
            icon: "iconLink",
            click() {
                writeText(linkAddress);
            }
        }).element);
    }
    if (!protyle.disabled) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "cut",
            icon: "iconCut",
            label: window.sourceflow.languages.cut,
            click() {
                const range = document.createRange();
                range.selectNode(linkElement);
                focusByRange(range);
                document.execCommand("cut");
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "remove",
            icon: "iconTrashcan",
            label: window.sourceflow.languages.remove,
            click() {
                linkElement.insertAdjacentHTML("afterend", "<wbr>");
                linkElement.remove();
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                updateTransaction(protyle, id, nodeElement.outerHTML, html);
                focusByWbr(nodeElement, protyle.toolbar.range);
                html = nodeElement.outerHTML;
            }
        }).element);
        if (linkAddress?.startsWith("assets/")) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "rename",
                label: window.sourceflow.languages.rename,
                icon: "iconEdit",
                click() {
                    renameAsset(linkAddress);
                }
            }).element);
        }
        if (isSYProtocol(linkAddress || "")) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "turnIntoRef",
                label: `${window.sourceflow.languages.turnInto} <b>${window.sourceflow.languages.ref}</b>`,
                icon: "iconRef",
                click() {
                    linkElement.setAttribute("data-subtype", "s");
                    const types = linkElement.getAttribute("data-type").split(" ");
                    types.push("block-ref");
                    types.splice(types.indexOf("a"), 1);
                    linkElement.setAttribute("data-type", types.join(" "));
                    linkElement.setAttribute("data-id", getIdFromSYProtocol(inputElements[0].value));
                    inputElements[0].value = "";
                    inputElements[2].value = "";
                    linkElement.removeAttribute("data-href");
                    linkElement.removeAttribute("data-title");
                    nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                    updateTransaction(protyle, id, nodeElement.outerHTML, html);
                    protyle.toolbar.range.selectNode(linkElement);
                    protyle.toolbar.range.collapse(false);
                    focusByRange(protyle.toolbar.range);
                    html = nodeElement.outerHTML;
                }
            }).element);
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "turnIntoText",
            label: `${window.sourceflow.languages.turnInto} <b>${window.sourceflow.languages.text}</b>`,
            icon: "iconRefresh",
            click() {
                inputElements[0].value = "";
                inputElements[2].value = "";
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                removeInlineType(linkElement, "a", protyle.toolbar.range);
                updateTransaction(protyle, id, nodeElement.outerHTML, html);
                html = nodeElement.outerHTML;
            }
        }).element);
    }

    if (linkAddress) {
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_2", type: "separator"}).element);
        openMenu(protyle.app, linkAddress, false, true);
        if (linkAddress?.startsWith("assets/")) {
            window.sourceflow.menus.menu.append(new MenuItem(exportAsset(linkAddress)).element);
            window.sourceflow.menus.menu.append(new MenuItem(writeAssetToClipboard(linkAddress)).element);
        }
    }

    if (!protyle.disabled && protyle?.app?.plugins) {
        emitOpenMenu({
            plugins: protyle.app.plugins,
            type: "open-menu-link",
            detail: {
                protyle,
                element: linkElement,
            },
            separatorPosition: "top",
        });
    }
    /// #if MOBILE
    window.sourceflow.menus.menu.fullscreen();
    /// #else
    const rect = linkElement.getBoundingClientRect();
    window.sourceflow.menus.menu.popup({
        x: rect.left,
        y: rect.top + 26,
        h: 26
    });
    /// #endif

    const popoverElement = hasTopClosestByClassName(protyle.element, "block__popover", true);
    window.sourceflow.menus.menu.element.setAttribute("data-from", popoverElement ? popoverElement.dataset.level + "popover" : "app");
    if (protyle.disabled) {
        return;
    }
    if (focusText || protyle.lute.GetLinkDest(linkAddress) || linkAddress?.startsWith("assets/")) {
        inputElements[1].select();
    } else {
        inputElements[0].select();
    }
    window.sourceflow.menus.menu.removeCB = () => {
        if (inputElements[2].value) {
            linkElement.setAttribute("data-title", Lute.EscapeHTMLStr(inputElements[2].value.replace(/\n|\r\n|\r|\u2028|\u2029/g, "")));
        } else {
            linkElement.removeAttribute("data-title");
        }
        if (linkElement.getAttribute("data-type").indexOf("a") > -1) {
            linkElement.setAttribute("data-href", Lute.EscapeHTMLStr(inputElements[0].value.replace(/\n|\r\n|\r|\u2028|\u2029/g, "")));
        } else {
            linkElement.removeAttribute("data-href");
        }
        if (!inputElements[1].value && (inputElements[0].value || inputElements[2].value)) {
            linkElement.textContent = "*";
        }
        const currentRange = getSelection().rangeCount === 0 ? undefined : getSelection().getRangeAt(0);
        if (currentRange && !protyle.element.contains(currentRange.startContainer)) {
            protyle.toolbar.range.selectNodeContents(linkElement);
            protyle.toolbar.range.collapse(false);
            focusByRange(protyle.toolbar.range);
        }
        if (!inputElements[1].value && !inputElements[0].value && !inputElements[2].value) {
            linkElement.remove();
        }
        if (html !== nodeElement.outerHTML) {
            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
            updateTransaction(protyle, id, nodeElement.outerHTML, html);
        }
    };
};
