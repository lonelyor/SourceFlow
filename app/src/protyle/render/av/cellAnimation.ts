import {hasClosestBlock} from "../../util/hasClosest";

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
