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
import {filterSelectHTML, getSelectHTML} from "./selectMenuHTML";
import {selectRuntimeState} from "./selectState";
import {removeCellOption} from "./selectValueOps";

export const bindSelectEvent = (protyle: IProtyle, data: IAV, menuElement: HTMLElement, cellElements: HTMLElement[], blockElement: Element) => {
    const inputElement = menuElement.querySelector("input");
    const colId = getColId(cellElements[0], blockElement.getAttribute("data-av-type") as TAVView);
    let colData: IAVColumn;
    getFieldsByData(data).find((item: IAVColumn) => {
        if (item.id === colId) {
            colData = item;
            return;
        }
    });
    if (!colData.options) {
        colData.options = [];
    }
    const listElement = menuElement.lastElementChild.lastElementChild as HTMLElement;
    inputElement.addEventListener("input", (event: InputEvent) => {
        if (event.isComposing) {
            return;
        }
        listElement.innerHTML = filterSelectHTML(inputElement.value, colData.options);
    });
    inputElement.addEventListener("compositionend", () => {
        listElement.innerHTML = filterSelectHTML(inputElement.value, colData.options);
    });
    inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.isComposing) {
            return;
        }
        let currentElement = upDownHint(listElement, event, "b3-menu__item--current", listElement.firstElementChild);
        if (event.key === "Enter") {
            if (!currentElement) {
                currentElement = menuElement.querySelector(".b3-menu__item--current");
            }
            if (currentElement.querySelector(".b3-menu__checked")) {
                removeCellOption(protyle, cellElements, menuElement.querySelector(`.b3-chips .b3-chip[data-content="${escapeAttr(currentElement.dataset.name)}"]`), blockElement);
            } else {
                addColOptionOrCell(protyle, data, cellElements, currentElement, menuElement, blockElement);
            }
        } else if (event.key === "Backspace" && inputElement.value === "") {
            removeCellOption(protyle, cellElements, inputElement.previousElementSibling as HTMLElement, blockElement);
        }
    });
};

export const addColOptionOrCell = (protyle: IProtyle, data: IAV, cellElements: HTMLElement[], currentElement: HTMLElement, menuElement: HTMLElement, blockElement: Element) => {
    let hasSelected = false;
    Array.from(menuElement.querySelectorAll(".b3-chips .b3-chip")).find((item: HTMLElement) => {
        if (item.dataset.content === currentElement.dataset.name) {
            hasSelected = true;
            return true;
        }
    });
    if (hasSelected) {
        menuElement.querySelector("input").focus();
        return;
    }

    const nodeElement = hasClosestBlock(cellElements[0]);
    if (!nodeElement) {
        cellElements.forEach((item, index) => {
            const rowID = getFieldIdByCellElement(item, data.viewType);
            if (data.viewType === "table" || isCustomAttr(item)) {
                cellElements[index] = (blockElement.querySelector(`.av__row[data-id="${rowID}"] .av__cell[data-col-id="${item.dataset.colId}"]`) ||
                    blockElement.querySelector(`.fn__flex-1[data-col-id="${item.dataset.colId}"]`)) as HTMLElement;
            } else {
                cellElements[index] = (blockElement.querySelector(`.av__gallery-item[data-id="${rowID}"] .av__cell[data-field-id="${item.dataset.fieldId}"]`)) as HTMLElement;
            }
        });
    }
    const colId = getColId(cellElements[0], blockElement.getAttribute("data-av-type") as TAVView);
    let colData: IAVColumn;
    const fields = getFieldsByData(data);
    fields.find((item: IAVColumn) => {
        if (item.id === colId) {
            colData = item;
            if (!colData.options) {
                colData.options = [];
            }
            return;
        }
    });

    const cellDoOperations: IOperation[] = [];
    const cellUndoOperations: IOperation[] = [];
    let mSelectValue: IAVCellSelectValue[];
    cellElements.forEach((item, index) => {
        const rowID = getFieldIdByCellElement(item, data.viewType);
        if (!rowID) {
            return;
        }
        const cellValue: IAVCellValue = selectRuntimeState.cellValues[index];
        const oldValue = JSON.parse(JSON.stringify(cellValue));
        if (index === 0) {
            if (colData.type === "mSelect") {
                let hasOption = false;
                cellValue.mSelect.find((item) => {
                    if (item.content === currentElement.dataset.name) {
                        hasOption = true;
                        return true;
                    }
                });
                if (!hasOption) {
                    cellValue.mSelect.push({
                        color: currentElement.dataset.color,
                        content: currentElement.dataset.name
                    });
                }
            } else {
                cellValue.mSelect = [{
                    color: currentElement.dataset.color,
                    content: currentElement.dataset.name
                }];
            }
            mSelectValue = cellValue.mSelect;
        } else {
            cellValue.mSelect = mSelectValue;
        }
        cellDoOperations.push({
            action: "updateAttrViewCell",
            id: cellValue.id,
            keyID: colId,
            rowID,
            avID: data.id,
            data: cellValue
        });
        cellUndoOperations.push({
            action: "updateAttrViewCell",
            id: cellValue.id,
            keyID: colId,
            rowID,
            avID: data.id,
            data: oldValue
        });
        if (item.classList.contains("custom-attr__avvalue")) {
            item.innerHTML = genAVValueHTML(cellValue);
        } else {
            updateAttrViewCellAnimation(item, cellValue);
        }
    });

    if (currentElement.querySelector(".b3-menu__accelerator")) {
        colData.options.push({
            color: currentElement.dataset.color,
            name: currentElement.dataset.name
        });
        cellDoOperations.splice(0, 0, {
            action: "updateAttrViewColOptions",
            id: colId,
            avID: data.id,
            data: colData.options
        });
        cellDoOperations.push({
            action: "doUpdateUpdated",
            id: blockElement.getAttribute("data-node-id"),
            data: dayjs().format("YYYYMMDDHHmmss"),
        });
        transaction(protyle, cellDoOperations, [{
            action: "removeAttrViewColOption",
            id: colId,
            avID: data.id,
            data: currentElement.dataset.name,
        }]);
    } else {
        cellDoOperations.push({
            action: "doUpdateUpdated",
            id: blockElement.getAttribute("data-node-id"),
            data: dayjs().format("YYYYMMDDHHmmss"),
        });
        transaction(protyle, cellDoOperations, cellUndoOperations);
    }
    if (colData.type === "select") {
        blockElement.setAttribute("data-rendering", "true");
        menuElement.parentElement.dispatchEvent(new CustomEvent("click", {detail: "close"}));
    } else {
        const oldScroll = menuElement.querySelector(".b3-menu__items").scrollTop;
        const oldChipsHeight = menuElement.querySelector(".b3-chips").clientHeight;
        menuElement.innerHTML = getSelectHTML(fields, cellElements, false, blockElement);
        bindSelectEvent(protyle, data, menuElement, cellElements, blockElement);
        menuElement.querySelector("input").focus();
        menuElement.querySelector(".b3-menu__items").scrollTop = oldScroll + (menuElement.querySelector(".b3-chips").clientHeight - oldChipsHeight);
    }
};
