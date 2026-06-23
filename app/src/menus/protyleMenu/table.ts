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


export const tableMenu = (protyle: IProtyle, nodeElement: Element, cellElement: HTMLTableCellElement, range: Range) => {
    const otherMenus: IMenu[] = [];
    const colIndex = getColIndex(cellElement);
    if (cellElement.rowSpan > 1 || cellElement.colSpan > 1) {
        otherMenus.push({
            id: "cancelMerged",
            label: window.sourceflow.languages.cancelMerged,
            click: () => {
                const oldHTML = nodeElement.outerHTML;
                let rowSpan = cellElement.rowSpan;
                let currentRowElement: Element = cellElement.parentElement;
                const orgColSpan = cellElement.colSpan;
                while (rowSpan > 0 && currentRowElement) {
                    let currentCellElement = currentRowElement.children[colIndex] as HTMLTableCellElement;
                    let colSpan = orgColSpan;
                    while (colSpan > 0 && currentCellElement) {
                        currentCellElement.classList.remove("fn__none");
                        currentCellElement.removeAttribute("colspan");
                        currentCellElement.removeAttribute("rowspan");
                        currentCellElement = currentCellElement.nextElementSibling as HTMLTableCellElement;
                        colSpan--;
                    }
                    currentRowElement = currentRowElement.nextElementSibling;
                    rowSpan--;
                }
                cellElement.removeAttribute("colspan");
                cellElement.removeAttribute("rowspan");
                if (cellElement.tagName === "TH") {
                    let prueTrElement: HTMLElement;
                    Array.from(nodeElement.querySelectorAll("thead tr")).find((item: HTMLElement) => {
                        prueTrElement = item;
                        Array.from(item.children).forEach((cellElement: HTMLTableCellElement) => {
                            if (cellElement.rowSpan !== 1 || cellElement.classList.contains("fn__none")) {
                                prueTrElement = undefined;
                            }
                        });
                        if (prueTrElement) {
                            return true;
                        }
                    });
                    if (prueTrElement) {
                        const tbodyElement = nodeElement.querySelector("tbody");
                        const theadElement = nodeElement.querySelector("thead");
                        while (prueTrElement !== theadElement.lastElementChild) {
                            tbodyElement.insertAdjacentElement("afterbegin", theadElement.lastElementChild);
                        }
                    }
                }
                focusByRange(range);
                updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
            }
        });
    }
    const thMatchElement = nodeElement.querySelectorAll("col")[colIndex];
    if (thMatchElement.style.width || thMatchElement.style.minWidth !== "60px") {
        otherMenus.push({
            id: "useDefaultWidth",
            label: window.sourceflow.languages.useDefaultWidth,
            click: () => {
                const html = nodeElement.outerHTML;
                thMatchElement.style.width = "";
                thMatchElement.style.minWidth = "60px";
                updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, html);
            }
        });
    }
    const isPinHead = nodeElement.getAttribute("custom-pinthead");
    otherMenus.push({
        id: isPinHead ? "unpinTableHead" : "pinTableHead",
        icon: isPinHead ? "iconUnpin" : "iconPin",
        label: isPinHead ? window.sourceflow.languages.unpinTableHead : window.sourceflow.languages.pinTableHead,
        click: () => {
            const html = nodeElement.outerHTML;
            if (isPinHead) {
                nodeElement.removeAttribute("custom-pinthead");
            } else {
                nodeElement.setAttribute("custom-pinthead", "true");
            }
            updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, html);
        }
    });
    otherMenus.push({
        icon: "iconHeadings",
        label: window.sourceflow.languages.title,
        click: () => {
            updateTableTitle(protyle, nodeElement);
        }
    });
    otherMenus.push({id: "separator_1", type: "separator"});
    otherMenus.push({
        id: "alignLeft",
        icon: "iconAlignLeft",
        accelerator: window.sourceflow.config.keymap.editor.general.alignLeft.custom,
        label: window.sourceflow.languages.alignLeft,
        click: () => {
            setTableAlign(protyle, [cellElement], nodeElement, "left", range);
        }
    });
    otherMenus.push({
        id: "alignCenter",
        icon: "iconAlignCenter",
        label: window.sourceflow.languages.alignCenter,
        accelerator: window.sourceflow.config.keymap.editor.general.alignCenter.custom,
        click: () => {
            setTableAlign(protyle, [cellElement], nodeElement, "center", range);
        }
    });
    otherMenus.push({
        id: "alignRight",
        icon: "iconAlignRight",
        label: window.sourceflow.languages.alignRight,
        accelerator: window.sourceflow.config.keymap.editor.general.alignRight.custom,
        click: () => {
            setTableAlign(protyle, [cellElement], nodeElement, "right", range);
        }
    });
    otherMenus.push({
        id: "useDefaultAlign",
        icon: "",
        label: window.sourceflow.languages.useDefaultAlign,
        click: () => {
            setTableAlign(protyle, [cellElement], nodeElement, "", range);
        }
    });
    const menus: IMenu[] = [];
    menus.push(...otherMenus);
    menus.push({
        type: "separator"
    });
    const tableElement = nodeElement.querySelector("table");
    const hasNone = cellElement.parentElement.querySelector(".fn__none");
    let hasColSpan = false;
    let hasRowSpan = false;
    Array.from(cellElement.parentElement.children).forEach((item: HTMLTableCellElement) => {
        if (item.colSpan > 1) {
            hasColSpan = true;
        }
        if (item.rowSpan > 1) {
            hasRowSpan = true;
        }
    });
    let previousHasNone: false | Element = false;
    let previousHasColSpan = false;
    let previousHasRowSpan = false;
    let previousRowElement = cellElement.parentElement.previousElementSibling;
    if (!previousRowElement && cellElement.parentElement.parentElement.tagName === "TBODY") {
        previousRowElement = tableElement.querySelector("thead").lastElementChild;
    }
    if (previousRowElement) {
        previousHasNone = previousRowElement.querySelector(".fn__none");
        Array.from(previousRowElement.children).forEach((item: HTMLTableCellElement) => {
            if (item.colSpan > 1) {
                previousHasColSpan = true;
            }
            if (item.rowSpan > 1) {
                previousHasRowSpan = true;
            }
        });
    }
    let nextHasNone: false | Element = false;
    let nextHasColSpan = false;
    let nextHasRowSpan = false;
    let nextRowElement = cellElement.parentElement.nextElementSibling;
    if (!nextRowElement && cellElement.parentElement.parentElement.tagName === "THEAD") {
        nextRowElement = tableElement.querySelector("tbody")?.firstElementChild;
    }
    if (nextRowElement) {
        nextHasNone = nextRowElement.querySelector(".fn__none");
        Array.from(nextRowElement.children).forEach((item: HTMLTableCellElement) => {
            if (item.colSpan > 1) {
                nextHasColSpan = true;
            }
            if (item.rowSpan > 1) {
                nextHasRowSpan = true;
            }
        });
    }
    let colIsPure = true;
    Array.from(tableElement.rows).find(item => {
        const cellElement = item.cells[colIndex];
        if (cellElement.classList.contains("fn__none") || cellElement.colSpan > 1 || cellElement.rowSpan > 1) {
            colIsPure = false;
            return true;
        }
    });
    let nextColIsPure = true;
    Array.from(tableElement.rows).find(item => {
        const cellElement = item.cells[colIndex + 1];
        if (cellElement && (cellElement.classList.contains("fn__none") || cellElement.colSpan > 1 || cellElement.rowSpan > 1)) {
            nextColIsPure = false;
            return true;
        }
    });
    let previousColIsPure = true;
    Array.from(tableElement.rows).find(item => {
        const cellElement = item.cells[colIndex - 1];
        if (cellElement && (cellElement.classList.contains("fn__none") || cellElement.colSpan > 1 || cellElement.rowSpan > 1)) {
            previousColIsPure = false;
            return true;
        }
    });
    const insertMenus = [];
    insertMenus.push({
        id: "insertRowAbove",
        icon: "iconBefore",
        label: `<div class="fn__flex" style="align-items: center;">
${window.sourceflow.languages.insertRowBefore.replace("${x}", `<span class="fn__space"></span><input type="number" step="1" min="1" value="1" placeholder="${window.sourceflow.languages.enterKey}" class="b3-text-field b3-text-field--size"><span class="fn__space"></span>`)}
</div>`,
        accelerator: window.sourceflow.config.keymap.editor.table.insertRowAbove.custom,
        bind(element: HTMLElement) {
            const inputElement = element.querySelector("input");
            element.addEventListener("click", () => {
                if (document.activeElement === inputElement) {
                    return;
                }
                insertRowAbove(protyle, range, cellElement, nodeElement, parseInt(element.querySelector("input").value));
                window.sourceflow.menus.menu.remove();
            });
            inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
                if (!event.isComposing && event.key === "Enter") {
                    insertRowAbove(protyle, range, cellElement, nodeElement, parseInt(element.querySelector("input").value));
                    window.sourceflow.menus.menu.remove();
                }
            });
        }
    });
    if (!nextHasNone || (nextHasNone && !nextHasRowSpan && nextHasColSpan)) {
        insertMenus.push({
            id: "insertRowBelow",
            icon: "iconAfter",
            label: `<div class="fn__flex" style="align-items: center;">
${window.sourceflow.languages.insertRowAfter.replace("${x}", `<span class="fn__space"></span><input type="number" step="1" min="1" value="1" placeholder="${window.sourceflow.languages.enterKey}" class="b3-text-field b3-text-field--size"><span class="fn__space"></span>`)}
</div>`,
            accelerator: window.sourceflow.config.keymap.editor.table.insertRowBelow.custom,
            bind(element: HTMLElement) {
                const inputElement = element.querySelector("input");
                element.addEventListener("click", () => {
                    if (document.activeElement === inputElement) {
                        return;
                    }
                    insertRow(protyle, range, cellElement, nodeElement, parseInt(element.querySelector("input").value));
                    window.sourceflow.menus.menu.remove();
                });
                inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
                    if (!event.isComposing && event.key === "Enter") {
                        insertRow(protyle, range, cellElement, nodeElement, parseInt(element.querySelector("input").value));
                        window.sourceflow.menus.menu.remove();
                    }
                });
            }
        });
    }
    if (colIsPure || previousColIsPure) {
        insertMenus.push({
            id: "insertColumnLeft",
            icon: "iconInsertLeft",
            label: `<div class="fn__flex" style="align-items: center;">
${window.sourceflow.languages.insertColumnLeft1.replace("${x}", `<span class="fn__space"></span><input type="number" step="1" min="1" value="1" placeholder="${window.sourceflow.languages.enterKey}" class="b3-text-field b3-text-field--size"><span class="fn__space"></span>`)}
</div>`,
            accelerator: window.sourceflow.config.keymap.editor.table.insertColumnLeft.custom,
            bind(element: HTMLElement) {
                const inputElement = element.querySelector("input");
                element.addEventListener("click", () => {
                    if (document.activeElement === inputElement) {
                        return;
                    }
                    insertColumn(protyle, nodeElement, cellElement, "beforebegin", range, parseInt(element.querySelector("input").value));
                    window.sourceflow.menus.menu.remove();
                });
                inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
                    if (!event.isComposing && event.key === "Enter") {
                        insertColumn(protyle, nodeElement, cellElement, "beforebegin", range, parseInt(element.querySelector("input").value));
                        window.sourceflow.menus.menu.remove();
                    }
                });
            }
        });
    }
    if (colIsPure || nextColIsPure) {
        insertMenus.push({
            id: "insertColumnRight",
            icon: "iconInsertRight",
            label: `<div class="fn__flex" style="align-items: center;">
${window.sourceflow.languages.insertColumnRight1.replace("${x}", `<span class="fn__space"></span><input type="number" step="1" min="1" value="1" placeholder="${window.sourceflow.languages.enterKey}" class="b3-text-field b3-text-field--size"><span class="fn__space"></span>`)}
</div>`,
            accelerator: window.sourceflow.config.keymap.editor.table.insertColumnRight.custom,
            bind(element: HTMLElement) {
                const inputElement = element.querySelector("input");
                element.addEventListener("click", () => {
                    if (document.activeElement === inputElement) {
                        return;
                    }
                    insertColumn(protyle, nodeElement, cellElement, "afterend", range, parseInt(element.querySelector("input").value));
                    window.sourceflow.menus.menu.remove();
                });
                inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
                    if (!event.isComposing && event.key === "Enter") {
                        insertColumn(protyle, nodeElement, cellElement, "afterend", range, parseInt(element.querySelector("input").value));
                        window.sourceflow.menus.menu.remove();
                    }
                });
            }
        });
    }
    menus.push(...insertMenus);
    const other2Menus: IMenu[] = [];
    if (((!hasNone || (hasNone && !hasRowSpan && hasColSpan)) &&
            (!previousHasNone || (previousHasNone && !previousHasRowSpan && previousHasColSpan))) ||
        ((!hasNone || (hasNone && !hasRowSpan && hasColSpan)) &&
            (!nextHasNone || (nextHasNone && !nextHasRowSpan && nextHasColSpan))) ||
        (colIsPure && previousColIsPure) ||
        (colIsPure && nextColIsPure)
    ) {
        other2Menus.push({
            id: "separator_2",
            type: "separator"
        });
    }

    if ((!hasNone || (hasNone && !hasRowSpan && hasColSpan)) &&
        (!previousHasNone || (previousHasNone && !previousHasRowSpan && previousHasColSpan))) {
        other2Menus.push({
            id: "moveToUp",
            icon: "iconUp",
            label: window.sourceflow.languages.moveToUp,
            accelerator: window.sourceflow.config.keymap.editor.table.moveToUp.custom,
            click: () => {
                moveRowToUp(protyle, range, cellElement, nodeElement);
            }
        });
    }
    if ((!hasNone || (hasNone && !hasRowSpan && hasColSpan)) &&
        (!nextHasNone || (nextHasNone && !nextHasRowSpan && nextHasColSpan))) {
        other2Menus.push({
            id: "moveToDown",
            icon: "iconDown",
            label: window.sourceflow.languages.moveToDown,
            accelerator: window.sourceflow.config.keymap.editor.table.moveToDown.custom,
            click: () => {
                moveRowToDown(protyle, range, cellElement, nodeElement);
            }
        });
    }
    if (colIsPure && previousColIsPure) {
        other2Menus.push({
            id: "moveToLeft",
            icon: "iconLeft",
            label: window.sourceflow.languages.moveToLeft,
            accelerator: window.sourceflow.config.keymap.editor.table.moveToLeft.custom,
            click: () => {
                moveColumnToLeft(protyle, range, cellElement, nodeElement);
            }
        });
    }
    if (colIsPure && nextColIsPure) {
        other2Menus.push({
            id: "moveToRight",
            icon: "iconRight",
            label: window.sourceflow.languages.moveToRight,
            accelerator: window.sourceflow.config.keymap.editor.table.moveToRight.custom,
            click: () => {
                moveColumnToRight(protyle, range, cellElement, nodeElement);
            }
        });
    }
    menus.push(...other2Menus);
    if ((cellElement.parentElement.parentElement.tagName !== "THEAD" &&
        ((!hasNone && !hasRowSpan) || (hasNone && !hasRowSpan && hasColSpan))) || colIsPure) {
        menus.push({
            type: "separator"
        });
    }
    const removeMenus = [];
    if (cellElement.parentElement.parentElement.tagName !== "THEAD" &&
        ((!hasNone && !hasRowSpan) || (hasNone && !hasRowSpan && hasColSpan))) {
        removeMenus.push({
            id: "deleteRow",
            icon: "iconDeleteRow",
            label: window.sourceflow.languages["delete-row"],
            accelerator: window.sourceflow.config.keymap.editor.table["delete-row"].custom,
            click: () => {
                deleteRow(protyle, range, cellElement, nodeElement);
            }
        });
    }
    if (colIsPure) {
        removeMenus.push({
            id: "deleteColumn",
            icon: "iconDeleteColumn",
            label: window.sourceflow.languages["delete-column"],
            accelerator: window.sourceflow.config.keymap.editor.table["delete-column"].custom,
            click: () => {
                deleteColumn(protyle, range, nodeElement, cellElement);
            }
        });
    }
    menus.push(...removeMenus);
    return {menus, removeMenus, insertMenus, otherMenus, other2Menus};
};

