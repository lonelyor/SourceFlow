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



export const refMenu = (protyle: IProtyle, element: HTMLElement) => {
    const nodeElement = hasClosestBlock(element);
    if (!nodeElement) {
        return;
    }
    hideElements(["util", "toolbar", "hint"], protyle);
    const refBlockId = element.getAttribute("data-id");
    const id = nodeElement.getAttribute("data-node-id");
    let oldHTML = nodeElement.outerHTML;
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_INLINE_REF);
    if (!protyle.disabled) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "anchor",
            iconHTML: "",
            type: "readonly",
            label: `<input style="margin: 4px 0" class="b3-text-field fn__block" placeholder="${window.sourceflow.languages.anchor}">`,
            bind(menuItemElement) {
                const inputElement = menuItemElement.querySelector("input");
                inputElement.value = element.getAttribute("data-subtype") === "d" ? "" : element.textContent;
                inputElement.addEventListener("input", () => {
                    if (inputElement.value) {
                        // 不能使用 textContent，否则 < 会变为 &lt;。
                        element.innerHTML = Lute.EscapeHTMLStr(inputElement.value).trim() || refBlockId;
                    } else {
                        fetchPost("/api/block/getRefText", {id: refBlockId}, (response) => {
                            element.innerHTML = response.data;
                        });
                    }
                    element.setAttribute("data-subtype", inputElement.value ? "s" : "d");
                });
                inputElement.addEventListener("keydown", (event) => {
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
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "separator_1",
            type: "separator"
        }).element);
    }
    /// #if !MOBILE
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "openBy",
        label: window.sourceflow.languages.openBy,
        icon: "iconOpen",
        accelerator: window.sourceflow.config.keymap.editor.general.openBy.custom + "/" + window.sourceflow.languages.click,
        click() {
            checkFold(refBlockId, (zoomIn, action, isRoot) => {
                if (!isRoot) {
                    action.push(Constants.CB_GET_HL);
                }
                openFileById({
                    app: protyle.app,
                    id: refBlockId,
                    action,
                    zoomIn
                });
            });
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "refTab",
        label: window.sourceflow.languages.refTab,
        icon: "iconEyeoff",
        accelerator: window.sourceflow.config.keymap.editor.general.refTab.custom + "/" + updateHotkeyTip("⌘" + window.sourceflow.languages.click),
        click() {
            checkFold(refBlockId, (zoomIn) => {
                openFileById({
                    app: protyle.app,
                    id: refBlockId,
                    action: zoomIn ? [Constants.CB_GET_HL, Constants.CB_GET_ALL] : [Constants.CB_GET_HL, Constants.CB_GET_CONTEXT, Constants.CB_GET_ROOTSCROLL],
                    keepCursor: true,
                    zoomIn
                });
            });
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "insertRight",
        label: window.sourceflow.languages.insertRight,
        icon: "iconLayoutRight",
        accelerator: window.sourceflow.config.keymap.editor.general.insertRight.custom + "/" + updateHotkeyTip("⌘" + window.sourceflow.languages.click),
        click() {
            checkFold(refBlockId, (zoomIn, action, isRoot) => {
                if (!isRoot) {
                    action.push(Constants.CB_GET_HL);
                }
                openFileById({
                    app: protyle.app,
                    id: refBlockId,
                    position: "right",
                    action,
                    zoomIn
                });
            });
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "insertBottom",
        label: window.sourceflow.languages.insertBottom,
        icon: "iconLayoutBottom",
        accelerator: window.sourceflow.config.keymap.editor.general.insertBottom.custom + (window.sourceflow.config.keymap.editor.general.insertBottom.custom ? "/" : "") + updateHotkeyTip("⌘" + window.sourceflow.languages.click),
        click() {
            checkFold(refBlockId, (zoomIn, action, isRoot) => {
                if (!isRoot) {
                    action.push(Constants.CB_GET_HL);
                }
                openFileById({
                    app: protyle.app,
                    id: refBlockId,
                    position: "bottom",
                    action,
                    zoomIn
                });
            });
        }
    }).element);
    /// #if !BROWSER
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "openByNewWindow",
        label: window.sourceflow.languages.openByNewWindow,
        icon: "iconOpenWindow",
        click() {
            openNewWindowById(refBlockId);
        }
    }).element);
    /// #endif
    window.sourceflow.menus.menu.append(new MenuItem({id: "separator_2", type: "separator"}).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "backlinks",
        icon: "iconLink",
        label: window.sourceflow.languages.backlinks,
        accelerator: window.sourceflow.config.keymap.editor.general.backlinks.custom,
        click: () => {
            openBacklink({
                app: protyle.app,
                blockId: refBlockId,
            });
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "graphView",
        icon: "iconGraph",
        label: window.sourceflow.languages.graphView,
        accelerator: window.sourceflow.config.keymap.editor.general.graphView.custom,
        click: () => {
            openGraph({
                app: protyle.app,
                blockId: refBlockId,
            });
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({id: "separator_3", type: "separator"}).element);
    /// #endif
    if (!protyle.disabled) {
        let submenu: IMenu[] = [];
        if (element.getAttribute("data-subtype") === "s") {
            submenu.push({
                id: "turnToDynamic",
                iconHTML: "",
                label: window.sourceflow.languages.turnToDynamic,
                click() {
                    element.setAttribute("data-subtype", "d");
                    fetchPost("/api/block/getRefText", {id: refBlockId}, (response) => {
                        element.innerHTML = response.data;
                        nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                        updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                        oldHTML = nodeElement.outerHTML;
                    });
                    focusByRange(protyle.toolbar.range);
                }
            });
        } else {
            submenu.push({
                id: "turnToStatic",
                iconHTML: "",
                label: window.sourceflow.languages.turnToStatic,
                click() {
                    element.setAttribute("data-subtype", "s");
                    nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                    updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                    focusByRange(protyle.toolbar.range);
                    oldHTML = nodeElement.outerHTML;
                }
            });
        }
        submenu = submenu.concat([{
            id: "text",
            iconHTML: "",
            label: window.sourceflow.languages.text,
            click() {
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                removeInlineType(element, "block-ref", protyle.toolbar.range);
                updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                oldHTML = nodeElement.outerHTML;
            }
        }, {
            id: "*",
            iconHTML: "",
            label: "*",
            click() {
                element.setAttribute("data-subtype", "s");
                element.textContent = "*";
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                focusByRange(protyle.toolbar.range);
                oldHTML = nodeElement.outerHTML;
            }
        }, {
            id: "text*",
            iconHTML: "",
            label: window.sourceflow.languages.text + " *",
            click() {
                element.insertAdjacentHTML("beforebegin", element.innerHTML + " ");
                element.setAttribute("data-subtype", "s");
                element.textContent = "*";
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                focusByRange(protyle.toolbar.range);
                oldHTML = nodeElement.outerHTML;
            }
        }, {
            id: "link",
            label: window.sourceflow.languages.link,
            iconHTML: "",
            click() {
                element.outerHTML = `<span data-type="a" data-href="sf://blocks/${element.getAttribute("data-id")}">${element.innerHTML}</span><wbr>`;
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                focusByWbr(nodeElement, protyle.toolbar.range);
                oldHTML = nodeElement.outerHTML;
            }
        }]);
        if (element.parentElement.textContent.trim() === element.textContent.trim() && element.parentElement.tagName === "DIV") {
            submenu.push({
                id: "blockEmbed",
                iconHTML: "",
                label: window.sourceflow.languages.blockEmbed,
                click() {
                    const html = `<div data-content="select * from blocks where id='${refBlockId}'" data-node-id="${id}" data-type="NodeBlockQueryEmbed" class="render-node" updated="${dayjs().format("YYYYMMDDHHmmss")}">${nodeElement.querySelector(".protyle-attr").outerHTML}</div>`;
                    nodeElement.outerHTML = html;
                    updateTransaction(protyle, id, html, oldHTML);
                    blockRender(protyle, protyle.wysiwyg.element);
                    oldHTML = nodeElement.outerHTML;
                }
            });
        }
        submenu.push({
            id: "defBlock",
            iconHTML: "",
            label: window.sourceflow.languages.defBlock,
            click() {
                fetchPost("/api/block/swapBlockRef", {
                    refID: id,
                    defID: refBlockId,
                    includeChildren: false
                });
            }
        });
        submenu.push({
            id: "defBlockChildren",
            iconHTML: "",
            label: window.sourceflow.languages.defBlockChildren,
            click() {
                fetchPost("/api/block/swapBlockRef", {
                    refID: id,
                    defID: refBlockId,
                    includeChildren: true
                });
            }
        });
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "turnInto",
            label: window.sourceflow.languages.turnInto,
            icon: "iconRefresh",
            submenu
        }).element);
    }
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "copy",
        label: window.sourceflow.languages.copy,
        icon: "iconCopy",
        click() {
            writeText(protyle.lute.BlockDOM2StdMd(element.outerHTML).trim());
        }
    }).element);
    if (!protyle.disabled) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "cut",
            label: window.sourceflow.languages.cut,
            icon: "iconCut",
            click() {
                writeText(protyle.lute.BlockDOM2StdMd(element.outerHTML));

                element.insertAdjacentHTML("afterend", "<wbr>");
                element.remove();
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                focusByWbr(nodeElement, protyle.toolbar.range);
                oldHTML = nodeElement.outerHTML;
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "remove",
            label: window.sourceflow.languages.remove,
            icon: "iconTrashcan",
            click() {
                element.insertAdjacentHTML("afterend", "<wbr>");
                element.remove();
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                focusByWbr(nodeElement, protyle.toolbar.range);
                oldHTML = nodeElement.outerHTML;
            }
        }).element);
    }
    if (protyle?.app?.plugins) {
        emitOpenMenu({
            plugins: protyle.app.plugins,
            type: "open-menu-blockref",
            detail: {
                protyle,
                element: element,
            },
            separatorPosition: "top",
        });
    }

    /// #if MOBILE
    window.sourceflow.menus.menu.fullscreen();
    /// #else
    const rect = element.getBoundingClientRect();
    window.sourceflow.menus.menu.popup({
        x: rect.left,
        y: rect.top + 26,
        h: 26
    });
    /// #endif
    const popoverElement = hasTopClosestByClassName(protyle.element, "block__popover", true);
    window.sourceflow.menus.menu.data = element;
    window.sourceflow.menus.menu.element.setAttribute("data-from", popoverElement ? popoverElement.dataset.level + "popover" : "app");
    if (!protyle.disabled) {
        window.sourceflow.menus.menu.element.querySelector("input").select();
        window.sourceflow.menus.menu.removeCB = () => {
            if (nodeElement.outerHTML !== oldHTML) {
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
            }
            const currentRange = getSelection().rangeCount === 0 ? undefined : getSelection().getRangeAt(0);
            if (currentRange && !protyle.element.contains(currentRange.startContainer)) {
                protyle.toolbar.range.selectNodeContents(element);
                protyle.toolbar.range.collapse(false);
                focusByRange(protyle.toolbar.range);
            }
        };
    }
};
