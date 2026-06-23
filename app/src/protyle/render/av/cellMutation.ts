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

import {updateAttrViewCellAnimation} from "./cellAnimation";
import {genCellValue, genCellValueByElement, getCellText, getTypeByCellElement, transformCellValue} from "./cellValue";

export const updateCellsValue = async (protyle: IProtyle, nodeElement: HTMLElement, value?: any,
                                       cElements?: HTMLElement[], columns?: IAVColumn[], html?: string, getOperations = false) => {
    const doOperations: IOperation[] = [];
    const undoOperations: IOperation[] = [];

    const avID = nodeElement.dataset.avId;
    const id = nodeElement.dataset.nodeId;
    let text = "";
    const json: IAVCellValue[][] = [];
    let cellElements: Element[];
    if (cElements?.length > 0) {
        cellElements = cElements;
    } else {
        cellElements = Array.from(nodeElement.querySelectorAll(".av__cell--active, .av__cell--select"));
        if (cellElements.length === 0) {
            nodeElement.querySelectorAll(".av__row--select:not(.av__row--header)").forEach(rowElement => {
                rowElement.querySelectorAll(".av__cell").forEach(cellElement => {
                    cellElements.push(cellElement);
                });
            });
        }
    }
    const isCustomAttr = hasClosestByClassName(cellElements[0], "custom-attr");
    const viewType = nodeElement.getAttribute("data-av-type") as TAVView;
    for (let elementIndex = 0; elementIndex < cellElements.length; elementIndex++) {
        let item = cellElements[elementIndex] as HTMLElement;
        const rowID = getFieldIdByCellElement(item, viewType);
        if (!rowID) {
            break;
        }
        if (!nodeElement.contains(item)) {
            if (viewType === "table") {
                item = cellElements[elementIndex] = (nodeElement.querySelector(`.av__row[data-id="${rowID}"] .av__cell[data-col-id="${item.dataset.colId}"]`) ||
                    nodeElement.querySelector(`.fn__flex-1[data-col-id="${item.dataset.colId}"]`)) as HTMLElement;
            } else {
                item = cellElements[elementIndex] = (nodeElement.querySelector(`.av__gallery-item[data-id="${rowID}"] .av__cell[data-field-id="${item.dataset.fieldId}"]`)) as HTMLElement;
            }
        }

        if (!item) {
            // 兼容新增行后台隐藏
            break;
        }
        const type = getTypeByCellElement(item) || item.dataset.type as TAVCol;
        if (["created", "updated", "template", "rollup"].includes(type)) {
            break;
        }
        const cellId = item.dataset.id;   // 刚创建时无 id，更新需和 oldValue 保持一致
        const colId = getColId(item, viewType);

        text += getCellText(item) + ((cellElements[elementIndex + 1] && item.nextElementSibling && item.nextElementSibling === cellElements[elementIndex + 1]) ? "\t" : "\n\n");
        const oldValue = genCellValueByElement(type, item);
        if (elementIndex === 0 || cellElements[elementIndex - 1] !== item.previousElementSibling) {
            json.push([]);
        }
        json[json.length - 1].push(oldValue);
        let newValue = value;
        // relation 为全部更新，以下类型为添加
        if (type === "mAsset") {
            if (Array.isArray(value)) {
                newValue = oldValue.mAsset.concat(value);
            } else if (typeof value !== "undefined" && typeof value !== "object") { // 不传入为删除，传入字符串不进行处理
                const htmlValue: IAVCellAssetValue[] = [];
                let link = protyle.lute.GetLinkDest(value);
                let name = "";
                // https://github.com/lonelyor/SourceFlow/issues/13892
                if (!link && value.startsWith("assets/")) {
                    link = value;
                    name = getAssetName(value) + pathPosix().extname(value);
                }
                // https://github.com/lonelyor/SourceFlow/issues/12308
                if (link) {
                    htmlValue.push({
                        type: "file",
                        content: link,
                        name
                    });
                }
                if (html) {
                    const tempElement = document.createElement("template");
                    tempElement.innerHTML = html;
                    tempElement.content.querySelectorAll('[data-type~="a"], .img img').forEach(item => {
                        if (item.tagName === "IMG") {
                            htmlValue.push({
                                type: "image",
                                content: item.getAttribute("data-src"),
                                name: ""
                            });
                        } else {
                            htmlValue.push({
                                type: "file",
                                content: item.getAttribute("data-href"),
                                name: item.textContent
                            });
                        }
                    });
                }
                newValue = oldValue.mAsset.concat(htmlValue);
            }
        } else if (type === "mSelect" || type === "select") {
            // 不传入为删除
            if (typeof value === "string") {
                const newMSelectValue: IAVCellSelectValue[] = [];
                let colorIndex = oldValue.mSelect.length;
                // 以逗号分隔，去重，去空，去换行后做为选项
                [...new Set(value.split(",").map(v => v.trim().replace(/\n|\r\n|\r|\u2028|\u2029/g, "")))].forEach((item) => {
                    if (!item) {
                        return;
                    }
                    let hasSameContent = false;
                    oldValue.mSelect.find((mSelectItem) => {
                        if (mSelectItem.content === item) {
                            hasSameContent = true;
                            return true;
                        }
                    });
                    if (hasSameContent) {
                        return;
                    }
                    colorIndex++;
                    newMSelectValue.push({
                        content: item,
                        color: colorIndex.toString()
                    });
                });
                newValue = oldValue.mSelect.concat(newMSelectValue);
            }
        } else if (type === "block" && typeof value === "string" && oldValue.block.id) {
            newValue = {
                content: value,
                id: oldValue.block.id,
            };
            if (oldValue.block.icon) {
                newValue.icon = oldValue.block.icon;
            }
        }
        let cellValue: IAVCellValue;
        if (typeof newValue === "object" && newValue.type) {
            cellValue = transformCellValue(type, newValue);
        } else {
            cellValue = genCellValue(type, newValue);
        }
        cellValue.id = cellId;
        if ((cellValue.type === "date" && typeof cellValue.date === "string") ||
            (cellValue.type === "relation" && typeof cellValue.relation === "string")) {
            break;
        }
        if (columns && (type === "select" || type === "mSelect")) {
            const operations = mergeAddOption(columns.find(e => e.id === colId), cellValue, avID);
            doOperations.push(...operations.doOperations);
            undoOperations.push(...operations.undoOperations);
        }
        // formattedContent 在单元格渲染时没有用到，需对比保持一致
        if (type === "date") {
            if (!(value && typeof value === "object" && typeof value.isNotTime === "boolean")) {
                const response = await fetchSyncPost("/api/av/getAttributeViewKeysByID", {avID: avID, keyIDs: [colId]});
                if (response.data[0].date) {
                    cellValue.date.isNotTime = !response.data[0].date.fillSpecificTime;
                }
            }
            cellValue.date.formattedContent = oldValue.date.formattedContent;
        }
        if (!objEquals(cellValue, oldValue)) {
            doOperations.push({
                action: "updateAttrViewCell",
                id: cellId,
                avID,
                keyID: colId,
                rowID,
                data: cellValue
            });

            undoOperations.push({
                action: "updateAttrViewCell",
                id: cellId,
                avID,
                keyID: colId,
                rowID,
                data: oldValue
            });
            if (isCustomAttr) {
                item.innerHTML = genAVValueHTML(cellValue);
            } else {
                updateAttrViewCellAnimation(item, cellValue);
            }
        }
    }
    if (getOperations) {
        return {doOperations, undoOperations};
    }
    if (doOperations.length > 0) {
        doOperations.push({
            action: "doUpdateUpdated",
            id,
            data: dayjs().format("YYYYMMDDHHmmss"),
        });
        undoOperations.push({
            action: "doUpdateUpdated",
            id,
            data: nodeElement.getAttribute("updated"),
        });
        transaction(protyle, doOperations, undoOperations);
    }
    return {text: text.substring(0, text.length - 2), json};
};
