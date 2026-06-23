import {Menu} from "../../../plugin/Menu";
import {transaction} from "../../wysiwyg/transaction";
import {hasClosestBlock, hasClosestByClassName} from "../../util/hasClosest";
import {confirmDialog} from "../../../dialog/confirmDialog";
import {upDownHint} from "../../../util/upDownHint";
import {bindEditEvent, getColId, getEditHTML} from "./col";
import {updateAttrViewCellAnimation} from "./cell";
import {genAVValueHTML, isCustomAttr} from "./blockAttr";
import {escapeAriaLabel, escapeAttr, escapeHtml} from "../../../util/escape";
import {genCellValueByElement, getTypeByCellElement} from "./cell";
import * as dayjs from "dayjs";
import {getFieldsByData} from "./view";
import {getFieldIdByCellElement} from "./row";
import {Constants} from "../../../constants";
import {getSelectHTML} from "./selectMenuHTML";
import {bindSelectEvent} from "./selectEvents";
import {selectRuntimeState} from "./selectState";

export const setColOption = (protyle: IProtyle, data: IAV, target: HTMLElement, blockElement: Element, isCustomAttr: boolean, cellElements?: HTMLElement[]) => {
    const menuElement = hasClosestByClassName(target, "b3-menu");
    if (!menuElement) {
        return;
    }
    const blockID = blockElement.getAttribute("data-node-id");
    const viewType = blockElement.getAttribute("data-av-type") as TAVView;
    const colId = (cellElements && cellElements[0]) ? getColId(cellElements[0], viewType) : menuElement.querySelector(".b3-menu__item").getAttribute("data-col-id");
    let name = target.parentElement.dataset.name;
    let desc = target.parentElement.dataset.desc;
    let color = target.parentElement.dataset.color;
    const fields = getFieldsByData(data);
    const menu = new Menu(Constants.MENU_AV_COL_OPTION, () => {
        if ((name === inputElement.value && desc === descElement.value) || !inputElement.value) {
            return;
        }
        // cell 不判断重名 https://github.com/lonelyor/SourceFlow/issues/11484
        transaction(protyle, [{
            action: "updateAttrViewColOption",
            id: colId,
            avID: data.id,
            data: {
                newColor: color,
                oldName: name,
                newName: inputElement.value,
                newDesc: descElement.value
            },
        }, {
            action: "doUpdateUpdated",
            id: blockID,
            data: dayjs().format("YYYYMMDDHHmmss"),
        }], [{
            action: "updateAttrViewColOption",
            id: colId,
            avID: data.id,
            data: {
                newColor: color,
                oldName: inputElement.value,
                newName: name,
                newDesc: desc
            },
        }]);
        fields.find(column => {
            if (column.id === colId) {
                // 重名不进行更新 https://github.com/lonelyor/SourceFlow/issues/13554
                const sameItem = column.options.find((item) => {
                    if (item.name === inputElement.value && item.desc === descElement.value) {
                        return true;
                    }
                });
                if (!sameItem) {
                    column.options.find((item) => {
                        if (item.name === name) {
                            item.name = inputElement.value;
                            item.desc = descElement.value;
                            return true;
                        }
                    });
                }
                return true;
            }
        });
        const oldScroll = menuElement.querySelector(".b3-menu__items").scrollTop;
        const selectedElement = menuElement.querySelector(".b3-chips");
        const oldChipsHeight = selectedElement ? selectedElement.clientHeight : 0;
        if (!cellElements) {
            menuElement.innerHTML = getEditHTML({protyle, data, colId, isCustomAttr});
            bindEditEvent({protyle, data, menuElement, isCustomAttr, blockID});
        } else {
            cellElements.forEach((cellElement: HTMLElement, index) => {
                const rowID = getFieldIdByCellElement(cellElement, viewType);
                if (viewType === "table" || isCustomAttr) {
                    cellElement = cellElements[index] = (blockElement.querySelector(`.av__row[data-id="${rowID}"] .av__cell[data-col-id="${cellElement.dataset.colId}"]`) ||
                        blockElement.querySelector(`.fn__flex-1[data-col-id="${cellElement.dataset.colId}"]`)) as HTMLElement;
                } else {
                    cellElement = cellElements[index] = (blockElement.querySelector(`.av__gallery-item[data-id="${rowID}"] .av__cell[data-field-id="${cellElement.dataset.fieldId}"]`)) as HTMLElement;
                }

                selectRuntimeState.cellValues[index].mSelect.find((item) => {
                    if (item.content === name) {
                        item.content = inputElement.value;
                        return true;
                    }
                });
                if (cellElement.classList.contains("custom-attr__avvalue")) {
                    cellElement.innerHTML = genAVValueHTML(selectRuntimeState.cellValues[index]);
                } else {
                    updateAttrViewCellAnimation(cellElement, selectRuntimeState.cellValues[index]);
                }
            });
            menuElement.innerHTML = getSelectHTML(fields, cellElements, false, blockElement);
            bindSelectEvent(protyle, data, menuElement, cellElements, blockElement);
        }
        if (selectedElement) {
            menuElement.querySelector(".b3-menu__items").scrollTop = oldScroll + (menuElement.querySelector(".b3-chips").clientHeight - oldChipsHeight);
        }
    });
    if (menu.isOpen) {
        return;
    }
    menu.addItem({
        iconHTML: "",
        type: "empty",
        label: `<div class="fn__hr"></div>
<div class="b3-form__icona fn__block">
    <input class="b3-text-field b3-form__icona-input" type="text" size="16">
    <svg data-position="north" class="b3-form__icona-icon ariaLabel" aria-label="${desc ? escapeAriaLabel(desc) : window.sourceflow.languages.addDesc}"><use xlink:href="#iconInfo"></use></svg>
</div>
<div class="fn__none">
    <div class="fn__hr"></div>
    <textarea rows="1" placeholder="${window.sourceflow.languages.addDesc}" class="b3-text-field fn__block" type="text" data-value="${escapeAttr(desc)}">${desc}</textarea>
</div>
<div class="fn__hr--small"></div>`,
        bind(element) {
            const inputElement = element.querySelector("input");
            inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
                if (event.isComposing) {
                    return;
                }
                if (event.key === "Enter") {
                    menu.close();
                }
            });
            inputElement.value = name;
            const descElement = element.querySelector("textarea");
            inputElement.nextElementSibling.addEventListener("click", () => {
                const descPanelElement = descElement.parentElement;
                descPanelElement.classList.toggle("fn__none");
                if (!descPanelElement.classList.contains("fn__none")) {
                    descElement.focus();
                }
            });
            descElement.addEventListener("keydown", (event: KeyboardEvent) => {
                if (event.isComposing) {
                    return;
                }
                if (event.key === "Enter") {
                    menu.close();
                }
            });
            descElement.addEventListener("input", () => {
                inputElement.nextElementSibling.setAttribute("aria-label", descElement.value ? escapeHtml(descElement.value) : window.sourceflow.languages.addDesc);
            });
        }
    });
    menu.addItem({
        id: "delete",
        label: window.sourceflow.languages.delete,
        icon: "iconTrashcan",
        click() {
            confirmDialog(window.sourceflow.languages.deleteOpConfirm, window.sourceflow.languages.confirmDelete, () => {
                let colOptions: { name: string, color: string }[] = [];
                fields.find(column => {
                    if (column.id === colId) {
                        colOptions = column.options;
                        return true;
                    }
                });
                const newName = target.parentElement.dataset.name;
                transaction(protyle, [{
                    action: "removeAttrViewColOption",
                    id: colId,
                    avID: data.id,
                    data: newName,
                }, {
                    action: "doUpdateUpdated",
                    id: blockID,
                    data: dayjs().format("YYYYMMDDHHmmss"),
                }], [{
                    action: "updateAttrViewColOptions",
                    id: colId,
                    avID: data.id,
                    data: colOptions
                }]);
                colOptions.find((item, index) => {
                    if (item.name === newName) {
                        colOptions.splice(index, 1);
                        return true;
                    }
                });
                const oldScroll = menuElement.querySelector(".b3-menu__items").scrollTop;
                const selectedElement = menuElement.querySelector(".b3-chips");
                const oldChipsHeight = selectedElement ? selectedElement.clientHeight : 0;
                if (!cellElements) {
                    menuElement.innerHTML = getEditHTML({protyle, data, colId, isCustomAttr});
                    bindEditEvent({protyle, data, menuElement, isCustomAttr, blockID});
                } else {
                    cellElements.forEach((cellElement: HTMLElement, index) => {
                        const rowID = getFieldIdByCellElement(cellElement, viewType);
                        if (viewType === "table" || isCustomAttr) {
                            cellElement = cellElements[index] = (blockElement.querySelector(`.av__row[data-id="${rowID}"] .av__cell[data-col-id="${cellElement.dataset.colId}"]`) ||
                                blockElement.querySelector(`.fn__flex-1[data-col-id="${cellElement.dataset.colId}"]`)) as HTMLElement;
                        } else {
                            cellElement = cellElements[index] = (blockElement.querySelector(`.av__gallery-item[data-id="${rowID}"] .av__cell[data-field-id="${cellElement.dataset.fieldId}"]`)) as HTMLElement;
                        }
                        selectRuntimeState.cellValues[index].mSelect.find((item, selectIndex) => {
                            if (item.content === newName) {
                                selectRuntimeState.cellValues[index].mSelect.splice(selectIndex, 1);
                                return true;
                            }
                        });
                        if (cellElement.classList.contains("custom-attr__avvalue")) {
                            cellElement.innerHTML = genAVValueHTML(selectRuntimeState.cellValues[index]);
                        } else {
                            updateAttrViewCellAnimation(cellElement, selectRuntimeState.cellValues[index]);
                        }
                    });
                    menuElement.innerHTML = getSelectHTML(fields, cellElements, false, blockElement);
                    bindSelectEvent(protyle, data, menuElement, cellElements, blockElement);
                }
                if (selectedElement) {
                    menuElement.querySelector(".b3-menu__items").scrollTop = oldScroll + (menuElement.querySelector(".b3-chips").clientHeight - oldChipsHeight);
                }
            }, undefined, true);
        }
    });
    menu.addSeparator();
    let html = "<div class=\"fn__flex fn__flex-wrap\" style=\"width: 238px\">";
    Array.from(Array(14).keys()).forEach(index => {
        html += `<button data-color="${index + 1}" class="color__square${parseInt(color) === index + 1 ? " color__square--current" : ""}" style="color: var(--b3-font-color${index + 1});background-color: var(--b3-font-background${index + 1});">A</button>`;
    });
    menu.addItem({
        type: "empty",
        iconHTML: "",
        label: html + "</div>",
        bind(element) {
            element.addEventListener("click", (event) => {
                const colorTarget = event.target as HTMLElement;
                if (colorTarget.classList.contains("color__square") && !colorTarget.classList.contains("color__square--current")) {
                    element.querySelector(".color__square--current")?.classList.remove("color__square--current");
                    colorTarget.classList.add("color__square--current");
                    const newColor = colorTarget.getAttribute("data-color");
                    transaction(protyle, [{
                        action: "updateAttrViewColOption",
                        id: colId,
                        avID: data.id,
                        data: {
                            oldName: name,
                            newName: inputElement.value,
                            oldColor: color,
                            newColor,
                            newDesc: descElement.value
                        },
                    }, {
                        action: "doUpdateUpdated",
                        id: blockID,
                        data: dayjs().format("YYYYMMDDHHmmss"),
                    }], [{
                        action: "updateAttrViewColOption",
                        id: colId,
                        avID: data.id,
                        data: {
                            oldName: inputElement.value,
                            newName: name,
                            oldColor: newColor,
                            newColor: color,
                            newDesc: descElement.value
                        },
                    }]);

                    fields.find(column => {
                        if (column.id === colId) {
                            column.options.find((item) => {
                                if (item.name === name) {
                                    item.name = inputElement.value;
                                    item.color = newColor;
                                    return true;
                                }
                            });
                            return true;
                        }
                    });
                    const oldScroll = menuElement.querySelector(".b3-menu__items").scrollTop;
                    if (!cellElements) {
                        menuElement.innerHTML = getEditHTML({protyle, data, colId, isCustomAttr});
                        bindEditEvent({protyle, data, menuElement, isCustomAttr, blockID});
                    } else {
                        cellElements.forEach((cellElement: HTMLElement, cellIndex) => {
                            const rowID = getFieldIdByCellElement(cellElement, viewType);
                            if (viewType === "table") {
                                cellElement = cellElements[cellIndex] = (blockElement.querySelector(`.av__row[data-id="${rowID}"] .av__cell[data-col-id="${cellElement.dataset.colId}"]`) ||
                                    blockElement.querySelector(`.fn__flex-1[data-col-id="${cellElement.dataset.colId}"]`)) as HTMLElement;
                            } else {
                                cellElement = cellElements[cellIndex] = (blockElement.querySelector(`.av__gallery-item[data-id="${rowID}"] .av__cell[data-field-id="${cellElement.dataset.fieldId}"]`)) as HTMLElement;
                            }
                            selectRuntimeState.cellValues[cellIndex].mSelect.find((item) => {
                                if (item.content === name) {
                                    item.content = inputElement.value;
                                    item.color = newColor;
                                    return true;
                                }
                            });
                            if (cellElement.classList.contains("custom-attr__avvalue")) {
                                cellElement.innerHTML = genAVValueHTML(selectRuntimeState.cellValues[cellIndex]);
                            } else {
                                updateAttrViewCellAnimation(cellElement, selectRuntimeState.cellValues[cellIndex]);
                            }
                        });
                        menuElement.innerHTML = getSelectHTML(fields, cellElements, false, blockElement);
                        bindSelectEvent(protyle, data, menuElement, cellElements, blockElement);
                    }
                    menuElement.querySelector(".b3-menu__items").scrollTop = oldScroll;
                    name = inputElement.value;
                    desc = descElement.value;
                    color = newColor;
                }
            });
        }
    });
    const rect = target.getBoundingClientRect();
    menu.open({
        x: rect.right,
        y: rect.bottom,
        w: rect.width,
        h: rect.height,
    });
    const inputElement = window.sourceflow.menus.menu.element.querySelector("input");
    inputElement.select();
    const descElement = window.sourceflow.menus.menu.element.querySelector("textarea");
};
