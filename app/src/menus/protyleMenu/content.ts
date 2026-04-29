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
import {tableMenu} from "./table";


const loadWorkbenchDialogModule = () => import("../../workbench/dialog");
const hiddenInlineText = (zh: string, en: string) => window.sourceflow.config.lang === "zh_CN" ? zh : en;
const isHiddenInlineElement = (element?: HTMLElement | null) => element?.getAttribute("data-inline-hidden") === "true";

const revealHiddenInlineElement = (protyle: IProtyle, nodeElement: Element, inlineElement: HTMLElement, oldHTML: string) => {
    inlineElement.style.filter = "";
    inlineElement.style.opacity = "";
    inlineElement.style.userSelect = "";
    inlineElement.style.pointerEvents = "";
    inlineElement.removeAttribute("data-inline-hidden");
    if (!inlineElement.getAttribute("style")) {
        inlineElement.removeAttribute("style");
    }
    nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
    updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
};

const hideCurrentSelectionInline = (protyle: IProtyle, nodeElement: Element, oldHTML: string) => {
    const currentRange = getEditorRange(nodeElement);
    if (currentRange.toString() === "") {
        return;
    }
    protyle.toolbar.range = currentRange;
    protyle.toolbar.setInlineMark(protyle, "text", "range", {type: "style5", color: ""});
    nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
    updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
};

export const contentMenu = (protyle: IProtyle, nodeElement: Element) => {
    const range = getEditorRange(nodeElement);
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_INLINE_CONTEXT);
    /// #if MOBILE
    protyle.toolbar.showContent(protyle, range, nodeElement);
    /// #else
    const oldHTML = nodeElement.outerHTML;
    const id = nodeElement.getAttribute("data-node-id");
    const captionElement = hasClosestByTag(range.startContainer, "CAPTION");
    if (range.toString() !== "" || (range.cloneContents().childNodes[0] as HTMLElement)?.classList?.contains("emoji")) {
        const hiddenStartElement = hasClosestByAttribute(range.startContainer, "data-inline-hidden", "true") as HTMLElement;
        const hiddenEndElement = hasClosestByAttribute(range.endContainer, "data-inline-hidden", "true") as HTMLElement;
        const canRevealHiddenSelection = hiddenStartElement && hiddenStartElement === hiddenEndElement;
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "copy",
            icon: "iconCopy",
            accelerator: "?C",
            label: window.sourceflow.languages.copy,
            click() {
                // range 需要重新获取。
                focusByRange(getEditorRange(nodeElement));
                document.execCommand("copy");
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "copyPlainText",
            label: window.sourceflow.languages.copyPlainText,
            accelerator: window.sourceflow.config.keymap.editor.general.copyPlainText.custom,
            click() {
                focusByRange(getEditorRange(nodeElement));
                copyPlainText(getSelection().getRangeAt(0).toString());
            }
        }).element);
        if (!protyle.disabled && !captionElement) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "toggleInlineHidden",
                icon: canRevealHiddenSelection ? "iconEye" : "iconEyeoff",
                label: canRevealHiddenSelection ? hiddenInlineText("显示选区隐藏内容", "Reveal selection") : hiddenInlineText("隐藏选区内容", "Hide selection"),
                click() {
                    if (canRevealHiddenSelection) {
                        revealHiddenInlineElement(protyle, nodeElement, hiddenStartElement, oldHTML);
                    } else {
                        hideCurrentSelectionInline(protyle, nodeElement, oldHTML);
                    }
                }
            }).element);
        }
        if (protyle.disabled || captionElement) {
            return;
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "cut",
            icon: "iconCut",
            accelerator: "?X",
            label: window.sourceflow.languages.cut,
            click() {
                focusByRange(getEditorRange(nodeElement));
                document.execCommand("cut");
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "delete",
            icon: "iconTrashcan",
            accelerator: "?",
            label: window.sourceflow.languages.delete,
            click() {
                const currentRange = getEditorRange(nodeElement);
                currentRange.insertNode(document.createElement("wbr"));
                currentRange.extractContents();
                focusByWbr(nodeElement, currentRange);
                focusByRange(currentRange);
                updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
            }
        }).element);
    } else {
        // https://github.com/lonelyor/SourceFlow/issues/9630
        const inlineElement = hasClosestByTag(range.startContainer, "SPAN");
        if (inlineElement) {
            const inlineTypes = protyle.toolbar.getCurrentType(range);
            if (isHiddenInlineElement(inlineElement)) {
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "revealHiddenInline",
                    icon: "iconEye",
                    label: hiddenInlineText("显示隐藏内容", "Reveal hidden content"),
                    click() {
                        revealHiddenInlineElement(protyle, nodeElement, inlineElement, oldHTML);
                    }
                }).element);
                window.sourceflow.menus.menu.append(new MenuItem({
                    type: "separator",
                }).element);
            }
            if (inlineTypes.includes("code") || inlineTypes.includes("kbd")) {
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "copy",
                    label: window.sourceflow.languages.copy,
                    icon: "iconCopy",
                    click() {
                        writeText(protyle.lute.BlockDOM2StdMd(inlineElement.outerHTML));
                    }
                }).element);
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "copyPlainText",
                    label: window.sourceflow.languages.copyPlainText,
                    click() {
                        copyPlainText(inlineElement.textContent);
                    }
                }).element);
                if (!protyle.disabled) {
                    const id = nodeElement.getAttribute("data-node-id");
                    window.sourceflow.menus.menu.append(new MenuItem({
                        id: "cut",
                        icon: "iconCut",
                        label: window.sourceflow.languages.cut,
                        click() {
                            writeText(protyle.lute.BlockDOM2StdMd(inlineElement.outerHTML));

                            inlineElement.insertAdjacentHTML("afterend", "<wbr>");
                            inlineElement.remove();
                            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                            updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                            focusByWbr(nodeElement, protyle.toolbar.range);
                        }
                    }).element);
                    window.sourceflow.menus.menu.append(new MenuItem({
                        id: "remove",
                        icon: "iconTrashcan",
                        label: window.sourceflow.languages.remove,
                        click() {
                            inlineElement.insertAdjacentHTML("afterend", "<wbr>");
                            inlineElement.remove();
                            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                            updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                            focusByWbr(nodeElement, protyle.toolbar.range);
                        }
                    }).element);
                }
                window.sourceflow.menus.menu.append(new MenuItem({
                    type: "separator",
                }).element);
            }
        }
    }
    if (!protyle.disabled && !captionElement) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "paste",
            label: window.sourceflow.languages.paste,
            icon: "iconPaste",
            accelerator: "?V",
            async click() {
                focusByRange(getEditorRange(nodeElement));
                if (document.queryCommandSupported("paste")) {
                    document.execCommand("paste");
                } else {
                    try {
                        const text = await readClipboard();
                        paste(protyle, Object.assign(text, {target: nodeElement as HTMLElement}));
                    } catch (e) {
                        console.log(e);
                    }
                }
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "pasteAsPlainText",
            label: window.sourceflow.languages.pasteAsPlainText,
            accelerator: "??V",
            click() {
                focusByRange(getEditorRange(nodeElement));
                pasteAsPlainText(protyle);
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "pasteAsSmartTable",
            label: window.sourceflow.languages.pasteAsSmartTable,
            click() {
                focusByRange(getEditorRange(nodeElement));
                pasteAsSmartTable(protyle, nodeElement);
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "pastePreserveLayout",
            label: window.sourceflow.languages.pastePreserveLayout,
            click() {
                focusByRange(getEditorRange(nodeElement));
                pastePreserveLayout(protyle, nodeElement);
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "pasteAsImage",
            label: window.sourceflow.languages.pasteAsImage,
            click() {
                focusByRange(getEditorRange(nodeElement));
                pasteAsImage(protyle, nodeElement);
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "pasteEscaped",
            label: window.sourceflow.languages.pasteEscaped,
            click() {
                focusByRange(getEditorRange(nodeElement));
                pasteEscaped(protyle, nodeElement);
            }
        }).element);
    }
    if (!captionElement) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "selectAll",
            label: window.sourceflow.languages.selectAll,
            icon: "iconSelect",
            accelerator: "?A",
            click() {
                selectAll(protyle, nodeElement, range);
            }
        }).element);
    }
    if (!captionElement) {
        appendAssistantContextActions({
            protyle,
            range: range?.cloneRange(),
            fallbackSelectionText: range?.toString().trim() || getPlainText(nodeElement as HTMLElement).trim(),
            includeOptimizeTypography: !protyle.disabled,
            onOptimizeTypography: () => {
                hideElements(["toolbar"], protyle);
                fetchPost("/api/format/autoSpace", {
                    id: protyle.block.rootID
                });
            }
        });
        if (!protyle.disabled) {
            let uploadHTML = '<input class="b3-form__upload" type="file" multiple="multiple"';
            if (protyle.options.upload.accept) {
                uploadHTML += ` accept="${protyle.options.upload.accept}">`;
            } else {
                uploadHTML += ">";
            }
            const uploadMenu = new MenuItem({
                id: "insertAsset",
                icon: "iconDownload",
                label: `${window.sourceflow.languages.insertAsset}${uploadHTML}`,
            }).element;
            uploadMenu.querySelector("input").addEventListener("change", (event: InputEvent & {
                target: HTMLInputElement
            }) => {
                if (event.target.files.length === 0) {
                    return;
                }
                uploadFiles(protyle, event.target.files, event.target);
                window.sourceflow.menus.menu.remove();
            });
            window.sourceflow.menus.menu.append(uploadMenu);
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "refresh",
            icon: "iconRefresh",
            accelerator: window.sourceflow.config.keymap.editor.general.refresh.custom,
            label: window.sourceflow.languages.refresh,
            click: () => {
                reloadProtyle(protyle, !isMobile());
            }
        }).element);
        if (!protyle.disabled) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "optimizeTypography",
                label: window.sourceflow.languages.optimizeTypography,
                accelerator: window.sourceflow.config.keymap.editor.general.optimizeTypography.custom,
                icon: "iconFormat",
                click: () => {
                    hideElements(["toolbar"], protyle);
                    fetchPost("/api/format/autoSpace", {
                        id: protyle.block.rootID
                    });
                }
            }).element);
        }
    }
    if (!protyle.disabled && !captionElement) {
        window.sourceflow.menus.menu.append(new MenuItem({
            type: "separator",
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "workbench",
            label: window.sourceflow.languages.workbench,
            icon: "iconLayout",
            type: "submenu",
            submenu: [{
                id: "workbenchCurrentBlockMeta",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchCurrentBlockMeta,
                click: () => {
                    void loadWorkbenchDialogModule().then(({openWorkbenchCurrentBlockMeta}) => openWorkbenchCurrentBlockMeta());
                }
            }, {
                id: "workbenchCurrentBlockTask",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchCurrentBlockTask,
                click: () => {
                    void loadWorkbenchDialogModule().then(({openWorkbenchCurrentBlockMeta}) => openWorkbenchCurrentBlockMeta("task"));
                }
            }, {
                id: "workbenchCurrentBlockEvent",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchCurrentBlockEvent,
                click: () => {
                    void loadWorkbenchDialogModule().then(({openWorkbenchCurrentBlockMeta}) => openWorkbenchCurrentBlockMeta("event"));
                }
            }, {
                id: "workbenchCurrentBlockProject",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchCurrentBlockProject,
                click: () => {
                    void loadWorkbenchDialogModule().then(({openWorkbenchCurrentBlockMeta}) => openWorkbenchCurrentBlockMeta("project"));
                }
            }],
        }).element);
    }
    if (nodeElement.classList.contains("table") && !protyle.disabled) {
        const cellElement = hasClosestByTag(range.startContainer, "TD") || hasClosestByTag(range.startContainer, "TH");
        if (cellElement) {
            const tableMenus = tableMenu(protyle, nodeElement, cellElement as HTMLTableCellElement, range);
            if (tableMenus.insertMenus.length > 0) {
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "separator_1",
                    type: "separator",
                }).element);
                tableMenus.insertMenus.forEach((menuItem) => {
                    window.sourceflow.menus.menu.append(new MenuItem(menuItem).element);
                });
            }
            if (tableMenus.removeMenus.length > 0) {
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "separator_2",
                    type: "separator",
                }).element);
                tableMenus.removeMenus.forEach((menuItem) => {
                    window.sourceflow.menus.menu.append(new MenuItem(menuItem).element);
                });
            }
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "separator_3",
                type: "separator",
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "more",
                type: "submenu",
                icon: "iconMore",
                label: window.sourceflow.languages.more,
                submenu: tableMenus.otherMenus.concat(tableMenus.other2Menus)
            }).element);
        }
    }
    /// #endif
    if (protyle?.app?.plugins) {
        emitOpenMenu({
            plugins: protyle.app.plugins,
            type: "open-menu-content",
            detail: {
                protyle,
                range,
                element: nodeElement,
            },
            separatorPosition: "top",
        });
    }
};
