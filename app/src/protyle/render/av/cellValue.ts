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

export const getCellText = (cellElement: HTMLElement | false) => {
    if (!cellElement) {
        return "";
    }
    let cellText = "";
    const textElements = cellElement.querySelectorAll(".b3-chip, .av__celltext--ref, .av__celltext");
    if (textElements.length > 0) {
        textElements.forEach(item => {
            if (item.querySelector(".av__cellicon")) {
                cellText += `${item.firstChild.textContent} → ${item.lastChild.textContent}, `;
            } else if (item.getAttribute("data-type") === "url") {
                cellText = item.getAttribute("data-href") + ", ";
            } else if (item.getAttribute("data-type") !== "block-more") {
                cellText += item.textContent + ", ";
            }
        });
        cellText = cellText.substring(0, cellText.length - 2);
    } else {
        cellText = cellElement.textContent;
    }
    return cellText;
};

export const genCellValueByElement = (colType: TAVCol, cellElement: HTMLElement) => {
    const cellValue: IAVCellValue = {
        type: colType,
        id: cellElement.dataset.id,
    };
    if (colType === "number") {
        const value = cellElement.querySelector(".av__celltext").getAttribute("data-content");
        cellValue.number = {
            content: parseFloat(value) || 0,
            isNotEmpty: !!value
        };
    } else if (["text", "block", "url", "phone", "email", "template"].includes(colType)) {
        const textElement = cellElement.querySelector(".av__celltext") as HTMLElement;
        cellValue[colType as "text"] = {
            content: colType === "url" ? textElement.dataset.href : textElement.textContent
        };
        if (colType === "block" && textElement.dataset.id) {
            cellValue.block.id = textElement.dataset.id;
            if (textElement.previousElementSibling?.classList.contains("b3-menu__avemoji")) {
                const unicode = textElement.previousElementSibling.getAttribute("data-unicode");
                if (unicode) {
                    cellValue.block.icon = unicode;
                }
            }
        }
    } else if (colType === "mSelect" || colType === "select") {
        const mSelect: IAVCellSelectValue[] = [];
        cellElement.querySelectorAll(".b3-chip").forEach((item: HTMLElement) => {
            mSelect.push({
                content: item.textContent.trim(),
                color: item.style.color.replace("var(--b3-font-color", "").replace(")", "")
            });
        });
        cellValue.mSelect = mSelect;
    } else if (["date", "created", "updated"].includes(colType)) {
        cellValue[colType as "date"] = JSON.parse(cellElement.querySelector(".av__celltext").getAttribute("data-value"));
    } else if (colType === "checkbox") {
        cellValue.checkbox = {
            checked: cellElement.querySelector("use").getAttribute("xlink:href") === "#iconCheck" ? true : false
        };
    } else if (colType === "relation") {
        const blockIDs: string[] = [];
        const contents: IAVCellValue[] = [];
        Array.from(cellElement.querySelectorAll(".av__cell--relation")).forEach((relationItem: HTMLElement) => {
            const item = relationItem.querySelector(".av__celltext") as HTMLElement;
            blockIDs.push(relationItem.dataset.rowId);
            contents.push({
                isDetached: !item.classList.contains("av__celltext--ref"),
                block: {
                    content: item.textContent,
                    id: item.dataset.id,
                },
                type: "block"
            });
        });
        cellValue.relation = {
            blockIDs,
            contents
        };
    } else if (colType === "mAsset") {
        const mAsset: IAVCellAssetValue[] = [];
        Array.from(cellElement.children).forEach((item) => {
            if (!item.classList.contains("av__celltext--url") && !item.classList.contains("av__cellassetimg")) {
                return;
            }
            const isImg = item.classList.contains("av__cellassetimg");
            mAsset.push({
                type: isImg ? "image" : "file",
                content: isImg ? removeCompressURL(item.getAttribute("src")) : item.getAttribute("data-url"),
                name: isImg ? "" : item.getAttribute("data-name")
            });
        });
        cellValue.mAsset = mAsset;
    }
    if (colType === "block") {
        cellValue.isDetached = cellElement.dataset.detached === "true";
    }
    return cellValue;
};

const getCellValueContent = (value: IAVCellValue): string => {
    if (["number", "text", "block", "url", "phone", "email", "template", "mAsset"].includes(value.type)) {
        return value[value.type as "text"].content;
    }
    if (["mSelect", "select"].includes(value.type)) {
        return value.mSelect[0].content;
    }
    if (value.type === "rollup") {
        return getCellValueContent(value.relation.contents[0]);
    }
    if (value.type === "checkbox") {
        return value.checkbox.checked ? "true" : "false";
    }
    if (value.type === "relation") {
        return getCellValueContent(value.relation.contents[0]);
    }
    if (["date", "created", "updated"].includes(value.type)) {
        return dayjs(value[value.type as "date"].content).format("YYYY-MM-DD HH:mm");
    }
    if (value.type === "lineNumber") {
        return "";
    }
};

export const transformCellValue = (colType: TAVCol, value: IAVCellValue): IAVCellValue => {
    if (colType === value.type) {
        return value;
    }
    const newValue: IAVCellValue = {
        type: colType,
    };
    if (colType === "number") {
        if (["date", "created", "updated"].includes(colType)) {
            newValue.number = {
                content: value[value.type as "date"].content,
                isNotEmpty: value[value.type as "date"].isNotEmpty
            };
        } else {
            newValue.number = {
                content: parseFloat(getCellValueContent(value)) || 0,
                isNotEmpty: true
            };
        }
    } else if (["text", "block", "url", "phone", "email", "template"].includes(colType)) {
        newValue[colType as "text"] = {
            content: getCellValueContent(value).toString()
        };
    } else if (colType === "mSelect" || colType === "select") {
        newValue.mSelect = [{
            content: getCellValueContent(value).toString(),
            color: "1"
        }];
        if (!newValue.mSelect[0].content) {
            newValue.mSelect = [];
        }
    } else if (colType === "rollup") {
        newValue.rollup = {contents: [value]};
    } else if (colType === "checkbox") {
        newValue.checkbox = {
            checked: true
        };
    } else if (colType === "relation") {
        if (value.type === "block") {
            newValue.relation = {
                blockIDs: [value.blockID],
                contents: [value]
            };
        } else {
            newValue.relation = {blockIDs: [], contents: []};
        }
    } else if (colType === "mAsset") {
        const content = getCellValueContent(value).toString();
        newValue.mAsset = [{
            type: Constants.SOURCEFLOW_ASSETS_IMAGE.includes(pathPosix().extname(content).toLowerCase()) ? "image" : "file",
            content,
            name: "",
        }];
    } else if (["date", "created", "updated"].includes(colType)) {
        if (["date", "created", "updated"].includes(value.type)) {
            newValue[colType as "date"] = JSON.parse(JSON.stringify(value[value.type as "date"]));
        } else {
            newValue[colType as "date"] = {
                content: null,
                isNotEmpty: false,
                content2: null,
                isNotEmpty2: false,
                hasEndDate: false,
                isNotTime: true,
            };
        }
    } else if (colType === "lineNumber") {
        return {
            type: "lineNumber"
        };
    }
    return newValue;
};

export const genCellValue = (colType: TAVCol, value: string | any) => {
    let cellValue: IAVCellValue = {
        type: colType,
        [colType === "select" ? "mSelect" : colType]: value as IAVCellDateValue
    };
    if (typeof value === "string" && value) {
        if (colType === "number") {
            cellValue = {
                type: colType,
                number: {
                    content: parseFloat(value) || 0,
                    isNotEmpty: true
                }
            };
        } else if (["text", "block", "url", "phone", "email", "template"].includes(colType)) {
            cellValue = {
                type: colType,
                [colType]: {
                    content: value
                }
            };
        } else if (colType === "mSelect" || colType === "select") {
            cellValue = {
                type: colType,
                mSelect: [{
                    content: value,
                    color: "1"
                }]
            };
        } else if (colType === "checkbox") {
            cellValue = {
                type: colType,
                checkbox: {
                    checked: true
                }
            };
        } else if (colType === "date") {
            let values = value.split("→");
            if (values.length !== 2) {
                values = value.split("-");
                if (values.length !== 2) {
                    values = value.split("~");
                }
            }
            const dateObj1 = dayjs(values[0]);
            const dateObj2 = dayjs(values[1] || "");
            if (isNaN(dateObj1.valueOf())) {
                cellValue = {
                    type: colType,
                    date: {
                        content: null,
                        isNotEmpty: false,
                        content2: null,
                        isNotEmpty2: false,
                        formattedContent: "",
                        hasEndDate: false,
                        isNotTime: true,
                    }
                };
            } else {
                cellValue = {
                    type: colType,
                    date: {
                        content: dateObj1.valueOf(),
                        isNotEmpty: true,
                        content2: dateObj2.valueOf() || 0,
                        isNotEmpty2: !isNaN(dateObj2.valueOf()),
                        hasEndDate: !isNaN(dateObj2.valueOf()),
                        isNotTime: dateObj1.hour() === 0 && values[0].split(":").length === 1,
                        formattedContent: "",
                    }
                };
            }
        } else if (colType === "relation") {
            cellValue = {
                type: colType,
                relation: {blockIDs: [value], contents: []}
            };
        } else if (colType === "mAsset") {
            const type = pathPosix().extname(value).toLowerCase();
            cellValue = {
                type: colType,
                mAsset: [{
                    type: Constants.SOURCEFLOW_ASSETS_IMAGE.includes(type) ? "image" : "file",
                    content: value,
                    name: "",
                }]
            };
        }
    } else if (typeof value === "undefined" || !value) {
        if (colType === "number") {
            cellValue = {
                type: colType,
                number: {
                    content: 0,
                    isNotEmpty: false
                }
            };
        } else if (["text", "block", "url", "phone", "email", "template"].includes(colType)) {
            cellValue = {
                type: colType,
                [colType]: {
                    content: ""
                }
            };
        } else if (colType === "mSelect" || colType === "select" || colType === "mAsset") {
            cellValue = {
                type: colType,
                [colType === "select" ? "mSelect" : colType]: []
            };
        } else if (["date", "created", "updated"].includes(colType)) {
            cellValue = {
                type: colType,
                [colType]: {
                    content: null,
                    isNotEmpty: false,
                    content2: null,
                    isNotEmpty2: false,
                    hasEndDate: false,
                    isNotTime: true,
                }
            };
        } else if (colType === "checkbox") {
            cellValue = {
                type: colType,
                checkbox: {
                    checked: false
                }
            };
        } else if (colType === "relation") {
            cellValue = {
                type: colType,
                relation: {blockIDs: [], contents: []}
            };
        } else if (colType === "rollup") {
            cellValue = {
                type: colType,
                rollup: {contents: []}
            };
        }
    }
    if (colType === "block") {
        if (typeof value === "object" && value && value.id) {
            cellValue.isDetached = false;
        } else {
            cellValue.isDetached = true;
        }
    }
    return cellValue;
};

export const getTypeByCellElement = (cellElement: Element) => {
    if (cellElement.parentElement.classList.contains("av__gallery-field")) {
        return cellElement.getAttribute("data-dtype") as TAVCol;
    }
    const scrollElement = hasClosestByClassName(cellElement, "av__scroll");
    if (!scrollElement) {
        return;
    }
    return scrollElement.querySelector(".av__row--header").querySelector(`[data-col-id="${cellElement.getAttribute("data-col-id")}"]`).getAttribute("data-dtype") as TAVCol;
};

export const cellValueIsEmpty = (value: IAVCellValue) => {
    if (value.type === "checkbox") {
        return false;
    }
    if (["text", "block", "url", "phone", "email", "template"].includes(value.type)) {
        return !value[value.type as "text"]?.content;
    }
    if (value.type === "number") {
        return value.number ? !value.number.isNotEmpty : true;
    }
    if (["mSelect", "mAsset", "select"].includes(value.type)) {
        if (value[(value.type === "select" ? "mSelect" : value.type) as "mSelect"]?.length > 0) {
            return false;
        }
        return true;
    }
    if (["date", "created", "updated"].includes(value.type)) {
        return !value[value.type as "date"]?.isNotEmpty &&
            !value[value.type as "date"]?.isNotEmpty2;
    }
    if (value.type === "relation") {
        if (value.relation?.blockIDs && value.relation.blockIDs.length > 0) {
            return false;
        }
        return true;
    }
    if (value.type === "rollup") {
        if (value.rollup?.contents && value.rollup.contents.length > 0) {
            return false;
        }
        return true;
    }
};
