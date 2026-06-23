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
import {selectRuntimeState} from "./selectState";

export const removeCellOption = (protyle: IProtyle, cellElements: HTMLElement[], target: HTMLElement, blockElement: Element) => {
    if (!target) {
        return;
    }
    const viewType = blockElement.getAttribute("data-av-type") as TAVView;
    const colId = getColId(cellElements[0], viewType);
    const doOperations: IOperation[] = [];
    const undoOperations: IOperation[] = [];
    let mSelectValue: IAVCellSelectValue[];
    const avID = blockElement.getAttribute("data-av-id");
    cellElements.forEach((item, elementIndex) => {
        const rowID = getFieldIdByCellElement(item, viewType);
        if (!rowID) {
            return;
        }
        if (!blockElement.contains(item)) {
            if (viewType === "table") {
                item = cellElements[elementIndex] = (blockElement.querySelector(`.av__row[data-id="${rowID}"] .av__cell[data-col-id="${item.dataset.colId}"]`) ||
                    blockElement.querySelector(`.fn__flex-1[data-col-id="${item.dataset.colId}"]`)) as HTMLElement;
            } else {
                item = cellElements[elementIndex] = (blockElement.querySelector(`.av__gallery-item[data-id="${rowID}"] .av__cell[data-field-id="${item.dataset.fieldId}"]`)) as HTMLElement;
            }
        }
        const cellValue: IAVCellValue = selectRuntimeState.cellValues[elementIndex];
        const oldValue = JSON.parse(JSON.stringify(cellValue));
        if (elementIndex === 0) {
            cellValue.mSelect?.find((item, index) => {
                if (item.content === target.dataset.content) {
                    cellValue.mSelect.splice(index, 1);
                    return true;
                }
            });
            mSelectValue = cellValue.mSelect;
        } else {
            cellValue.mSelect = mSelectValue;
        }
        doOperations.push({
            action: "updateAttrViewCell",
            id: cellValue.id,
            keyID: colId,
            rowID,
            avID,
            data: cellValue
        });
        undoOperations.push({
            action: "updateAttrViewCell",
            id: cellValue.id,
            keyID: colId,
            rowID,
            avID,
            data: oldValue
        });
        if (item.classList.contains("custom-attr__avvalue")) {
            item.innerHTML = genAVValueHTML(cellValue);
        } else {
            updateAttrViewCellAnimation(item, cellValue);
        }
    });
    doOperations.push({
        action: "doUpdateUpdated",
        id: blockElement.getAttribute("data-node-id"),
        data: dayjs().format("YYYYMMDDHHmmss"),
    });
    transaction(protyle, doOperations, undoOperations);
    Array.from(document.querySelectorAll(".av__panel .b3-menu__item")).find((item: HTMLElement) => {
        if (item.dataset.name === target.dataset.content) {
            item.querySelector(".b3-menu__checked")?.remove();
            return true;
        }
    });
    target.remove();
};

export const mergeAddOption = (column: IAVColumn, cellValue: IAVCellValue, avID: string) => {
    const doOperations: IOperation[] = [];
    const undoOperations: IOperation[] = [];
    cellValue.mSelect.forEach((item: IAVCellSelectValue) => {
        if (!column.options) {
            column.options = [];
        }
        const needAdd = column.options.find((option: {
            name: string,
            color: string,
        }) => {
            if (option.name === item.content) {
                item.color = option.color;
                return true;
            }
        });
        if (!needAdd) {
            const newColor = ((column.options?.length || 0) % 14 + 1).toString();
            column.options.push({
                name: item.content,
                color: newColor
            });
            item.color = newColor;
            doOperations.push({
                action: "updateAttrViewColOptions",
                id: column.id,
                avID,
                data: column.options
            });
            undoOperations.push({
                action: "removeAttrViewColOption",
                id: column.id,
                avID,
                data: item.content,
            });
        }
    });
    return {
        doOperations,
        undoOperations
    };
};
