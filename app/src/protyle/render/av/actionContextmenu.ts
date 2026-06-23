import {Menu} from "../../../plugin/Menu";
import {hasClosestBlock, hasClosestByClassName} from "../../util/hasClosest";
import {transaction} from "../../wysiwyg/transaction";
import {openEditorTab} from "../../../menus/util";
import {openFileAttr} from "../../../menus/commonMenuItem";
import {
    addDragFill,
    genCellValueByElement,
    getCellText,
    getTypeByCellElement,
    popTextCell,
    updateCellsValue,
} from "./cell";
import {addCol, getColIconByType, showColMenu} from "./col";
import {deleteRow, insertRows, selectRow, setPageSize, updateHeader} from "./row";
import {emitOpenMenu} from "../../../plugin/EventBus";
import {openMenuPanel} from "./openMenuPanel";
import {hintRef} from "../../hint/extend";
import {focusBlock, focusByRange} from "../../util/selection";
import {showMessage} from "../../../dialog/message";
import {previewAttrViewImages} from "../../preview/image";
import {openEmojiPanel, unicode2Emoji} from "../../../emoji";
import * as dayjs from "dayjs";
import {openCalcMenu} from "./calc";
import {avRender} from "./render";
import {addView, openViewMenu} from "./view";
import {isOnlyMeta, writeText} from "../../util/compatibility";
import {openSearchAV} from "./relation";
import {Constants} from "../../../constants";
import {hideElements} from "../../ui/hideElements";
import {fetchPost, fetchSyncPost} from "../../../util/fetch";
import {scrollCenter} from "../../../util/highlightById";
import {escapeHtml} from "../../../util/escape";
import {editGalleryItem, openGalleryItemMenu} from "./gallery/util";
import {clearSelect} from "../../util/clear";
import {removeCompressURL} from "../../../util/image";
import {callMobileAppShowKeyboard} from "../../../mobile/util/mobileAppUtil";
import {getAVViewAttr} from "../../../util/attrCompat";

export const avContextmenu = (protyle: IProtyle, rowElement: HTMLElement, position: IPosition) => {
    hideElements(["hint"], protyle);
    if (rowElement.classList.contains("av__row--header")) {
        return false;
    }
    const blockElement = hasClosestBlock(rowElement);
    if (!blockElement) {
        return false;
    }
    const avType = blockElement.getAttribute("data-av-type") as TAVView;
    if (avType === "table") {
        if (!rowElement.classList.contains("av__row--select")) {
            clearSelect(["row"], blockElement);
        }
        clearSelect(["cell"], blockElement);
        rowElement.classList.add("av__row--select");
        rowElement.querySelector(".av__firstcol use").setAttribute("xlink:href", "#iconCheck");
        updateHeader(rowElement);
    } else {
        if (!rowElement.classList.contains("av__gallery-item--select")) {
            clearSelect(["galleryItem"], blockElement);
        }
        rowElement.classList.add("av__gallery-item--select");
    }
    const menu = new Menu();
    const rowElements = blockElement.querySelectorAll(".av__row--select:not(.av__row--header), .av__gallery-item--select");
    const keyCellElement = rowElements[0].querySelector('.av__cell[data-dtype="block"]') as HTMLElement;
    const ids = Array.from(rowElements).map(item => item.querySelector('[data-dtype="block"] .av__celltext').getAttribute("data-id"));
    if (rowElements.length === 1 && keyCellElement.getAttribute("data-detached") !== "true") {
        /// #if !MOBILE
        const blockId = ids[0];
        const openSubmenus = openEditorTab(protyle.app, [blockId], undefined, undefined, true);
        openSubmenus.push({id: "separator_3", type: "separator"});
        openSubmenus.push({
            id: "attr",
            icon: "iconAttr",
            label: window.sourceflow.languages.attr,
            click: () => {
                fetchPost("/api/attr/getBlockAttrs", {id: blockId}, (response) => {
                    openFileAttr(response.data, "av", protyle);
                });
            }
        });
        menu.addItem({
            id: "openBy",
            label: window.sourceflow.languages.openBy,
            icon: "iconOpen",
            submenu: openSubmenus,
        });
        /// #endif
    }
    let hasBlock = false;
    rowElements.forEach((item) => {
        if (item.querySelector('.av__cell[data-dtype="block"]').getAttribute("data-detached") !== "true") {
            hasBlock = true;
        }
    });
    const copyMenu: IMenu[] = [{
        id: "copyKeyContent",
        iconHTML: "",
        label: window.sourceflow.languages.copyKeyContent,
        click() {
            let text = "";
            rowElements.forEach((item, i) => {
                if (rowElements.length > 1) {
                    text += "- ";
                }
                text += item.querySelector('.av__cell[data-dtype="block"] .av__celltext').textContent.trim();
                if (ids.length > 1 && i !== ids.length - 1) {
                    text += "\n";
                }
            });
            writeText(text);
        }
    }];
    if (hasBlock) {
        copyMenu.splice(1, 0, {
            id: "copyBlockRef",
            iconHTML: "",
            label: window.sourceflow.languages.copyBlockRef,
            click: () => {
                let text = "";
                for (let i = 0; i < ids.length; i++) {
                    const id = ids[i];
                    let content = "";
                    const cellElement = rowElements[i].querySelector(".av__cell[data-dtype='block']");
                    if (cellElement.getAttribute("data-detached") === "true") {
                        content = cellElement.querySelector(".av__celltext").textContent;
                    } else {
                        content = `((${id} '${cellElement.querySelector(".av__celltext").textContent.replace(/[\n]+/g, " ")}'))`;
                    }
                    if (ids.length > 1) {
                        text += "- ";
                    }
                    text += content;
                    if (ids.length > 1 && i !== ids.length - 1) {
                        text += "\n";
                    }
                }
                writeText(text);
            }
        }, {
            id: "copyBlockEmbed",
            iconHTML: "",
            label: window.sourceflow.languages.copyBlockEmbed,
            click: () => {
                let text = "";
                ids.forEach((id, index) => {
                    if (ids.length > 1) {
                        text += "- ";
                    }
                    const cellElement = rowElements[index].querySelector(".av__cell[data-dtype='block']");
                    if (cellElement.getAttribute("data-detached") === "true") {
                        text += cellElement.querySelector(".av__celltext").textContent;
                    } else {
                        text += `{{select * from blocks where id='${id}'}}`;
                    }
                    if (ids.length > 1 && index !== ids.length - 1) {
                        text += "\n";
                    }
                });
                writeText(text);
            }
        }, {
            id: "copyProtocol",
            iconHTML: "",
            label: window.sourceflow.languages.copyProtocol,
            click: () => {
                let text = "";
                ids.forEach((id, index) => {
                    if (ids.length > 1) {
                        text += "- ";
                    }
                    const cellElement = rowElements[index].querySelector(".av__cell[data-dtype='block']");
                    if (cellElement.getAttribute("data-detached") === "true") {
                        text += cellElement.querySelector(".av__celltext").textContent;
                    } else {
                        text += `sf://blocks/${id}`;
                    }
                    if (ids.length > 1 && index !== ids.length - 1) {
                        text += "\n";
                    }
                });
                writeText(text);
            }
        }, {
            id: "copyProtocolInMd",
            iconHTML: "",
            label: window.sourceflow.languages.copyProtocolInMd,
            click: () => {
                let text = "";
                for (let i = 0; i < ids.length; i++) {
                    const id = ids[i];
                    let content = "";
                    const cellElement = rowElements[i].querySelector(".av__cell[data-dtype='block']");
                    if (cellElement.getAttribute("data-detached") === "true") {
                        content = cellElement.querySelector(".av__celltext").textContent;
                    } else {
                        content = `[${cellElement.querySelector(".av__celltext").textContent.replace(/[\n]+/g, " ")}](sf://blocks/${id})`;
                    }
                    if (ids.length > 1) {
                        text += "- ";
                    }
                    text += content;
                    if (ids.length > 1 && i !== ids.length - 1) {
                        text += "\n";
                    }
                }
                writeText(text);
            }
        }, {
            id: "copyHPath",
            iconHTML: "",
            label: window.sourceflow.languages.copyHPath,
            click: async () => {
                let text = "";
                for (let i = 0; i < ids.length; i++) {
                    const id = ids[i];
                    let content = "";
                    const cellElement = rowElements[i].querySelector(".av__cell[data-dtype='block']");
                    if (cellElement.getAttribute("data-detached") === "true") {
                        content = cellElement.querySelector(".av__celltext").textContent;
                    } else {
                        const response = await fetchSyncPost("/api/filetree/getHPathByID", {id});
                        content = response.data;
                    }

                    if (ids.length > 1) {
                        text += "- ";
                    }
                    text += content;
                    if (ids.length > 1 && i !== ids.length - 1) {
                        text += "\n";
                    }
                }
                writeText(text);
            }
        }, {
            id: "copyID",
            iconHTML: "",
            label: window.sourceflow.languages.copyID,
            click: () => {
                let text = "";
                ids.forEach((id, index) => {
                    if (ids.length > 1) {
                        text += "- ";
                    }
                    const cellElement = rowElements[index].querySelector(".av__cell[data-dtype='block']");
                    if (cellElement.getAttribute("data-detached") === "true") {
                        text += cellElement.querySelector(".av__celltext").textContent;
                    } else {
                        text += id;
                    }
                    if (ids.length > 1 && index !== ids.length - 1) {
                        text += "\n";
                    }
                });
                writeText(text);
            }
        });
    }

    menu.addItem({
        id: "copy",
        label: window.sourceflow.languages.copy,
        icon: "iconCopy",
        type: "submenu",
        submenu: copyMenu
    });
    if (!protyle.disabled) {
        menu.addItem({
            id: "addToDatabase",
            label: window.sourceflow.languages.addToDatabase,
            icon: "iconDatabase",
            click() {
                openSearchAV(blockElement.getAttribute("data-av-id"), rowElements[0] as HTMLElement, (listItemElement) => {
                    const srcs: IOperationSrcs[] = [];
                    const sourceIds: string[] = [];
                    rowElements.forEach(item => {
                        const rowId = item.getAttribute("data-id");
                        const blockValue = genCellValueByElement("block", item.querySelector('.av__cell[data-dtype="block"]'));
                        srcs.push({
                            itemID: Lute.NewNodeID(),
                            content: blockValue.block.content,
                            id: blockValue.block.id || "",
                            isDetached: blockValue.isDetached,
                        });
                        sourceIds.push(rowId);
                    });
                    const avID = listItemElement.dataset.avId;
                    const viewID = listItemElement.dataset.viewId;
                    transaction(protyle, [{
                        action: "insertAttrViewBlock",
                        ignoreDefaultFill: viewID ? false : true,
                        viewID,
                        avID,
                        srcs,
                        context: {ignoreTip: "true"},
                        blockID: listItemElement.dataset.blockId,
                        groupID: rowElement.parentElement.getAttribute("data-group-id")
                    }, {
                        action: "doUpdateUpdated",
                        id: listItemElement.dataset.blockId,
                        data: dayjs().format("YYYYMMDDHHmmss"),
                    }], [{
                        action: "removeAttrViewBlock",
                        srcIDs: sourceIds,
                        avID,
                    }]);
                });
            }
        });
        if (rowElements.length === 1) {
            if (keyCellElement.getAttribute("data-detached") !== "true") {
                menu.addSeparator({id: "separator_1"});
            }
            menu.addItem({
                id: avType === "table" ? "insertRowBefore" : "insertItemBefore",
                icon: "iconBefore",
                label: `<div class="fn__flex" style="align-items: center;">
${window.sourceflow.languages[avType === "table" ? "insertRowBefore" : "insertItemBefore"].replace("${x}", `<span class="fn__space"></span><input type="number" step="1" min="1" value="1" placeholder="${window.sourceflow.languages.enterKey}" class="b3-text-field b3-text-field--size"><span class="fn__space"></span>`)}
</div>`,
                bind(element) {
                    const inputElement = element.querySelector("input");
                    element.addEventListener("click", () => {
                        if (document.activeElement === inputElement) {
                            return;
                        }
                        insertRows({
                            blockElement,
                            protyle,
                            count: parseInt(inputElement.value),
                            previousID: rowElements[0].previousElementSibling?.getAttribute("data-id"),
                            groupID: rowElements[0].parentElement.getAttribute("data-group-id")
                        });
                        menu.close();
                    });
                    inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
                        if (!event.isComposing && event.key === "Enter") {
                            insertRows({
                                blockElement,
                                protyle,
                                count: parseInt(inputElement.value),
                                previousID: rowElements[0].previousElementSibling?.getAttribute("data-id"),
                                groupID: rowElements[0].parentElement.getAttribute("data-group-id")
                            });
                            menu.close();
                        }
                    });
                }
            });
            menu.addItem({
                id: avType === "table" ? "insertRowAfter" : "insertItemAfter",
                icon: "iconAfter",
                label: `<div class="fn__flex" style="align-items: center;">
${window.sourceflow.languages[avType === "table" ? "insertRowAfter" : "insertItemAfter"].replace("${x}", `<span class="fn__space"></span><input type="number" step="1" min="1" placeholder="${window.sourceflow.languages.enterKey}" class="b3-text-field b3-text-field--size" value="1"><span class="fn__space"></span>`)}
</div>`,
                bind(element) {
                    const inputElement = element.querySelector("input");
                    element.addEventListener("click", () => {
                        if (document.activeElement === inputElement) {
                            return;
                        }
                        insertRows({
                            blockElement,
                            protyle,
                            count: parseInt(inputElement.value),
                            previousID: rowElements[0].getAttribute("data-id"),
                            groupID: rowElements[0].parentElement.getAttribute("data-group-id")
                        });
                        menu.close();
                    });
                    inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
                        if (!event.isComposing && event.key === "Enter") {
                            insertRows({
                                blockElement,
                                protyle,
                                count: parseInt(inputElement.value),
                                previousID: rowElements[0].getAttribute("data-id"),
                                groupID: rowElements[0].parentElement.getAttribute("data-group-id")
                            });
                            menu.close();
                        }
                    });
                }
            });
            menu.addSeparator({id: "separator_2"});
            if (keyCellElement.getAttribute("data-detached") !== "true") {
                menu.addItem({
                    id: "unbindBlock",
                    label: window.sourceflow.languages.unbindBlock,
                    icon: "iconLinkOff",
                    click() {
                        updateCellsValue(protyle, blockElement, {
                            content: keyCellElement.querySelector(".av__celltext").textContent,
                        }, [keyCellElement]);
                    }
                });
            }
        }
        menu.addItem({
            id: "delete",
            icon: "iconTrashcan",
            label: window.sourceflow.languages.delete,
            click() {
                deleteRow(blockElement, protyle);
            }
        });
        const editAttrSubmenu: IMenu[] = [];
        if (avType === "table") {
            rowElement.parentElement.querySelectorAll(".av__row--header .av__cell").forEach((cellElement: HTMLElement) => {
                const selectElements: HTMLElement[] = Array.from(blockElement.querySelectorAll(`.av__row--select:not(.av__row--header) .av__cell[data-col-id="${cellElement.dataset.colId}"]`));
                const type = cellElement.getAttribute("data-dtype") as TAVCol;
                if (!["updated", "created"].includes(type)) {
                    const icon = cellElement.dataset.icon;
                    editAttrSubmenu.push({
                        iconHTML: icon ? unicode2Emoji(icon, "b3-menu__icon", true) : `<svg class="b3-menu__icon"><use xlink:href="#${getColIconByType(type)}"></use></svg>`,
                        label: escapeHtml(cellElement.querySelector(".av__celltext").textContent.trim()),
                        click() {
                            popTextCell(protyle, selectElements);
                        }
                    });
                }
            });
        } else {
            rowElement.querySelectorAll(".av__cell").forEach((cellElement: HTMLElement) => {
                const selectElements: HTMLElement[] = Array.from(blockElement.querySelectorAll(`.av__gallery-item--select .av__cell[data-field-id="${cellElement.dataset.fieldId}"]`));
                const type = cellElement.getAttribute("data-dtype") as TAVCol;
                if (!["updated", "created"].includes(type)) {
                    const iconElement = cellElement.parentElement.querySelector(".av__gallery-tip, .av__gallery-name").firstElementChild.cloneNode(true) as HTMLElement;
                    iconElement.classList.add("b3-menu__icon");
                    editAttrSubmenu.push({
                        iconHTML: iconElement.outerHTML,
                        label: escapeHtml(cellElement.getAttribute("aria-label").split('<div class="ft__on-surface">')[0]),
                        click() {
                            rowElement.querySelector(".av__gallery-fields").classList.add("av__gallery-fields--edit");
                            rowElement.querySelector('[data-type="av-gallery-edit"]').setAttribute("aria-label", window.sourceflow.languages.hideEmptyFields);
                            popTextCell(protyle, selectElements);
                        }
                    });
                }
            });
        }
        menu.addItem({
            id: "fields",
            icon: "iconAttr",
            label: window.sourceflow.languages.fields,
            type: "submenu",
            submenu: editAttrSubmenu
        });
    }
    if (protyle?.app?.plugins) {
        emitOpenMenu({
            plugins: protyle.app.plugins,
            type: "open-menu-av",
            detail: {
                protyle,
                element: blockElement,
                selectRowElements: rowElements,
            },
            separatorPosition: "top",
        });
    }
    menu.open(position);
    return true;
};
