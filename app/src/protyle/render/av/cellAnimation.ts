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

import {addDragFill} from "./cellDrag";
import {renderCell, renderCellAttr, updateHeaderCell} from "./cellRender";
import {cellValueIsEmpty} from "./cellValue";

export const updateAttrViewCellAnimation = (cellElement: HTMLElement, value: IAVCellValue, headerValue?: {
    icon?: string,
    name?: string,
    pin?: boolean,
    type?: TAVCol
}) => {
    if (!cellElement) {
        return;
    }
    if (headerValue) {
        updateHeaderCell(cellElement, headerValue);
        return;
    }
    const hasDragFill = cellElement.querySelector(".av__drag-fill");
    const blockElement = hasClosestBlock(cellElement);
    if (!blockElement) {
        return;
    }
    const viewType = blockElement.getAttribute("data-av-type") as TAVView;
    const iconElement = cellElement.querySelector(".b3-menu__avemoji");
    if (["gallery", "kanban"].includes(viewType)) {
        if (value.type === "checkbox") {
            value.checkbox = {
                checked: value.checkbox?.checked || false,
                content: cellElement.getAttribute("aria-label").split('<div class="ft__on-surface">')[0],
            };
        }
        cellElement.innerHTML = renderCell(value, 0, iconElement ? !iconElement.classList.contains("fn__none") : false, viewType);
        cellElement.parentElement.setAttribute("data-empty", cellValueIsEmpty(value).toString());
    } else {
        cellElement.innerHTML = renderCell(value, 0, iconElement ? !iconElement.classList.contains("fn__none") : false);
    }
    if (hasDragFill) {
        addDragFill(cellElement);
    }
    renderCellAttr(cellElement, value);
};

export const removeAttrViewColAnimation = (blockElement: Element, id: string) => {
    blockElement.querySelectorAll(`.av__cell[data-col-id="${id}"]`).forEach(item => {
        item.remove();
    });
};
