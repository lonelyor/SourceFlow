import {transaction} from "../../wysiwyg/transaction";
import {hasClosestBlock, hasClosestByClassName} from "../../util/hasClosest";
import {openMenuPanel} from "./openMenuPanel";
import {isNotCtrl} from "../../util/compatibility";
import {isDynamicRef, objEquals} from "../../../util/functions";
import {fetchPost, fetchSyncPost} from "../../../util/fetch";
import {focusBlock, focusByRange} from "../../util/selection";
import * as dayjs from "dayjs";
import {unicode2Emoji} from "../../../emoji";
import {getColIconByType, getColId} from "./col";
import {genAVValueHTML} from "./blockAttr";
import {Constants} from "../../../constants";
import {getAssetName, pathPosix} from "../../../util/pathName";
import {mergeAddOption} from "./select";
import {escapeAttr, escapeHtml} from "../../../util/escape";
import {electronUndo} from "../../undo";
import {getFieldIdByCellElement} from "./row";
import {getFieldsByData} from "./view";
import {getCompressURL, removeCompressURL} from "../../../util/image";
import {callMobileAppShowKeyboard} from "../../../mobile/util/mobileAppUtil";
import {getAVViewAttr} from "../../../util/attrCompat";

import {renderCell, renderCellAttr} from "./cellRender";
import {genCellValueByElement, getTypeByCellElement} from "./cellValue";

export const getPositionByCellElement = (cellElement: HTMLElement) => {
    let rowElement = hasClosestByClassName(cellElement, "av__row");
    if (!rowElement) {
        return;
    }
    let rowIndex = -1;
    while (rowElement) {
        rowElement = rowElement.previousElementSibling as HTMLElement;
        rowIndex++;
    }
    let celIndex = -2;
    while (cellElement) {
        cellElement = cellElement.previousElementSibling as HTMLElement;
        if (cellElement && cellElement.classList.contains("av__colsticky")) {
            cellElement = cellElement.lastElementChild as HTMLElement;
        }
        celIndex++;
    }
    return {rowIndex, celIndex};
};

export const dragFillCellsValue = (protyle: IProtyle, nodeElement: HTMLElement, originData: {
    [key: string]: IAVCellValue[]
}, originCellIds: string[], activeElement: Element) => {
    nodeElement.querySelector(".av__drag-fill")?.remove();
    const newData: { [key: string]: Array<IAVCellValue & { colId?: string, element?: HTMLElement }> } = {};
    nodeElement.querySelectorAll(".av__cell--active").forEach((item: HTMLElement) => {
        if (originCellIds.includes(item.dataset.id)) {
            return;
        }
        const rowElement = hasClosestByClassName(item, "av__row");
        if (!rowElement) {
            return;
        }
        if (!newData[rowElement.dataset.id]) {
            newData[rowElement.dataset.id] = [];
        }
        const value: IAVCellValue & {
            colId?: string,
            element?: HTMLElement
        } = genCellValueByElement(getTypeByCellElement(item), item);
        value.colId = item.dataset.colId;
        value.element = item;
        newData[rowElement.dataset.id].push(value);
    });
    const doOperations: IOperation[] = [];
    const undoOperations: IOperation[] = [];
    const avID = nodeElement.dataset.avId;
    const originKeys = Object.keys(originData);
    const showIcon = activeElement.querySelector(".b3-menu__avemoji") ? true : false;
    Object.keys(newData).forEach((rowID, index) => {
        newData[rowID].forEach((item, cellIndex) => {
            if (["rollup", "template", "created", "updated"].includes(item.type) ||
                (item.type === "block" && item.element.getAttribute("data-detached") !== "true")) {
                return;
            }
            // 数据库下拉填充数据后异常
            const data = JSON.parse(JSON.stringify(originData[originKeys[index % originKeys.length]][cellIndex]));
            data.id = item.id;
            const keyID = item.colId;
            if (data.type === "block") {
                data.isDetached = true;
                delete data.block.id;
            }
            doOperations.push({
                action: "updateAttrViewCell",
                id: item.id,
                avID,
                keyID,
                rowID,
                data
            });
            item.element.innerHTML = renderCell(data, 0, showIcon);
            renderCellAttr(item.element, data);
            delete item.colId;
            delete item.element;
            undoOperations.push({
                action: "updateAttrViewCell",
                id: item.id,
                avID,
                keyID,
                rowID,
                data: item
            });
        });
    });
    focusBlock(nodeElement);
    if (doOperations.length > 0) {
        transaction(protyle, doOperations, undoOperations);
    }
};

export const addDragFill = (cellElement: Element) => {
    if (!cellElement) {
        return;
    }
    cellElement.classList.add("av__cell--active");
    if (!cellElement.querySelector(".av__drag-fill")) {
        const cellType = cellElement.getAttribute("data-dtype") as TAVCol;
        if (["template", "rollup", "lineNumber", "created", "updated"].includes(cellType)) {
            return;
        }
        cellElement.insertAdjacentHTML("beforeend", `<div aria-label="${window.sourceflow.languages.dragFill}" class="av__drag-fill ariaLabel"></div>`);
    }
};
