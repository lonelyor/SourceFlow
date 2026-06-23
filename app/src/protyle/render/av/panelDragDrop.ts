import {transaction} from "../../wysiwyg/transaction";
import {updateAssetCell} from "./asset";
import {updateCellsValue} from "./cell";
import {bindEditEvent, getColId, getEditHTML} from "./col";
import {getFiltersHTML} from "./filter";
import {getLanguageByIndex} from "./groups";
import {getPropertiesHTML} from "./propertiesMenu";
import {bindSelectEvent, getSelectHTML} from "./select";
import {bindSortsEvent, getSortsHTML} from "./sort";
import type {AVPanelDropHandler} from "./panelTypes";

export const handleAVPanelDrop: AVPanelDropHandler = ({
    sourceElement,
    targetElement,
    isTop,
    context,
}) => {
    const sourceId = sourceElement.dataset.id;
    const targetId = targetElement.dataset.id;
    if (targetElement.querySelector('[data-type="removeSort"]')) {
        const changeData = context.state.data.view.sorts;
        const oldData = Object.assign([], changeData);
        let sortFilter: IAVSort;
        changeData.find((sort, index: number) => {
            if (sort.column === sourceId) {
                sortFilter = changeData.splice(index, 1)[0];
                return true;
            }
        });
        changeData.find((sort, index: number) => {
            if (sort.column === targetId) {
                changeData.splice(isTop ? index : index + 1, 0, sortFilter);
                return true;
            }
        });
        transaction(context.options.protyle, [{
            action: "setAttrViewSorts",
            avID: context.avID,
            data: changeData,
            blockID: context.blockID
        }], [{
            action: "setAttrViewSorts",
            avID: context.avID,
            data: oldData,
            blockID: context.blockID
        }]);
        context.menuElement.innerHTML = getSortsHTML(context.state.fields, context.state.data.view.sorts);
        bindSortsEvent(context.options.protyle, context.menuElement, context.state.data, context.blockID);
        return true;
    }
    if (targetElement.querySelector('[data-type="removeFilter"]')) {
        const changeData = context.state.data.view.filters;
        const oldData = Object.assign([], changeData);
        let targetFilter: IAVFilter;
        changeData.find((filter, index: number) => {
            if (filter.column === sourceId) {
                targetFilter = changeData.splice(index, 1)[0];
                return true;
            }
        });
        changeData.find((filter, index: number) => {
            if (filter.column === targetId) {
                changeData.splice(isTop ? index : index + 1, 0, targetFilter);
                return true;
            }
        });
        transaction(context.options.protyle, [{
            action: "setAttrViewFilters",
            avID: context.avID,
            data: changeData,
            blockID: context.blockID
        }], [{
            action: "setAttrViewFilters",
            avID: context.avID,
            data: oldData,
            blockID: context.blockID
        }]);
        context.menuElement.innerHTML = getFiltersHTML(context.state.data);
        return true;
    }
    if (targetElement.querySelector('[data-type="av-view-edit"]')) {
        transaction(context.options.protyle, [{
            action: "sortAttrViewView",
            avID: context.avID,
            blockID: context.blockID,
            id: sourceId,
            previousID: isTop ? targetElement.previousElementSibling?.getAttribute("data-id") : targetElement.getAttribute("data-id")
        }], [{
            action: "sortAttrViewView",
            avID: context.avID,
            blockID: context.blockID,
            id: sourceId,
            previousID: sourceElement.previousElementSibling?.getAttribute("data-id")
        }]);
        if (isTop) {
            targetElement.before(sourceElement);
            targetElement.classList.remove("dragover__top");
        } else {
            targetElement.after(sourceElement);
            targetElement.classList.remove("dragover__bottom");
        }
        return true;
    }
    if (targetElement.querySelector('[data-type="editAssetItem"]')) {
        if (isTop) {
            targetElement.before(sourceElement);
        } else {
            targetElement.after(sourceElement);
        }
        const replaceValue: IAVCellAssetValue[] = [];
        Array.from(targetElement.parentElement.children).forEach((item: HTMLElement) => {
            if (["image", "file"].includes(item.dataset.type)) {
                replaceValue.push({
                    content: item.dataset.content,
                    name: item.dataset.name,
                    type: item.dataset.type as "image" | "file",
                });
            }
        });
        updateAssetCell({
            protyle: context.options.protyle,
            cellElements: context.options.cellElements,
            replaceValue,
            blockElement: context.options.blockElement
        });
        return true;
    }
    if (targetElement.querySelector('[data-type="setColOption"]')) {
        const colId = context.options.cellElements ?
            getColId(context.options.cellElements[0], context.state.data.viewType) :
            context.menuElement.querySelector(".b3-menu__item").getAttribute("data-col-id");
        const changeData = context.state.fields.find((column) => column.id === colId).options;
        const oldData = Object.assign([], changeData);
        let targetOption: { name: string, color: string };
        changeData.find((option, index: number) => {
            if (option.name === sourceElement.dataset.name) {
                targetOption = changeData.splice(index, 1)[0];
                return true;
            }
        });
        changeData.find((option, index: number) => {
            if (option.name === targetElement.dataset.name) {
                changeData.splice(isTop ? index : index + 1, 0, targetOption);
                return true;
            }
        });
        transaction(context.options.protyle, [{
            action: "updateAttrViewColOptions",
            id: colId,
            avID: context.avID,
            data: changeData,
        }], [{
            action: "updateAttrViewColOptions",
            id: colId,
            avID: context.avID,
            data: oldData,
        }]);
        const oldScroll = context.menuElement.querySelector(".b3-menu__items").scrollTop;
        if (context.options.cellElements) {
            context.menuElement.innerHTML = getSelectHTML(
                context.state.fields,
                context.options.cellElements,
                false,
                context.options.blockElement
            );
            bindSelectEvent(
                context.options.protyle,
                context.state.data,
                context.menuElement,
                context.options.cellElements,
                context.options.blockElement
            );
        } else {
            context.menuElement.innerHTML = getEditHTML({
                protyle: context.options.protyle,
                data: context.state.data,
                colId,
                isCustomAttr: context.isCustomAttr
            });
            bindEditEvent({
                protyle: context.options.protyle,
                data: context.state.data,
                menuElement: context.menuElement,
                isCustomAttr: context.isCustomAttr,
                blockID: context.blockID
            });
        }
        context.menuElement.querySelector(".b3-menu__items").scrollTop = oldScroll;
        return true;
    }
    if (targetElement.getAttribute("data-type") === "setRelationCell") {
        if (isTop) {
            targetElement.before(sourceElement);
        } else {
            targetElement.after(sourceElement);
        }
        targetElement.classList.remove("dragover__bottom", "dragover__top");
        const blockIDs: string[] = [];
        const contents: IAVCellValue[] = [];
        targetElement.parentElement.querySelectorAll(".fn__grab").forEach(item => {
            const dateElement = item.nextElementSibling as HTMLElement;
            blockIDs.push(dateElement.parentElement.dataset.rowId);
            contents.push({
                isDetached: !dateElement.style.color,
                type: "block",
                block: {
                    content: dateElement.textContent,
                    id: dateElement.dataset.id
                }
            });
        });
        updateCellsValue(context.options.protyle, context.options.blockElement as HTMLElement, {
            blockIDs,
            contents,
        }, context.options.cellElements);
        return true;
    }
    if (targetElement.getAttribute("data-type") === "editCol") {
        const previousID = (isTop ? targetElement.previousElementSibling?.getAttribute("data-id") : targetElement.getAttribute("data-id")) || "";
        const undoPreviousID = sourceElement.previousElementSibling?.getAttribute("data-id") || "";
        if (previousID !== undoPreviousID && previousID !== sourceId) {
            transaction(context.options.protyle, [{
                action: "sortAttrViewCol",
                avID: context.avID,
                previousID,
                id: sourceId,
                blockID: context.blockID,
            }], [{
                action: "sortAttrViewCol",
                avID: context.avID,
                previousID: undoPreviousID,
                id: sourceId,
                blockID: context.blockID
            }]);
            let column: IAVColumn;
            context.state.fields.find((item, index: number) => {
                if (item.id === sourceId) {
                    column = context.state.fields.splice(index, 1)[0];
                    return true;
                }
            });
            context.state.fields.find((item, index: number) => {
                if (item.id === targetId) {
                    context.state.fields.splice(isTop ? index : index + 1, 0, column);
                    return true;
                }
            });
        }
        context.menuElement.innerHTML = getPropertiesHTML(context.state.fields);
        return true;
    }
    if (targetElement.querySelector('[data-type="hideGroup"]')) {
        const previousID = (isTop ? targetElement.previousElementSibling?.getAttribute("data-id") : targetElement.getAttribute("data-id")) || "";
        const undoPreviousID = sourceElement.previousElementSibling?.getAttribute("data-id") || "";
        if (previousID !== undoPreviousID && previousID !== sourceId) {
            transaction(context.options.protyle, [{
                action: "sortAttrViewGroup",
                avID: context.avID,
                blockID: context.blockID,
                previousID,
                id: sourceId,
            }], [{
                action: "sortAttrViewGroup",
                avID: context.avID,
                blockID: context.blockID,
                previousID: undoPreviousID,
                id: sourceId,
            }]);
            context.menuElement.querySelector('[data-type="goGroupsSort"] .b3-menu__accelerator').textContent = getLanguageByIndex(2, "sort");
            context.state.data.view.group.order = 2;
            context.state.data.view.groups.find((group, index) => {
                if (group.id === sourceId) {
                    const groupData = context.state.data.view.groups.splice(index, 1)[0];
                    context.state.data.view.groups.find((item, groupIndex: number) => {
                        if (item.id === targetId) {
                            context.state.data.view.groups.splice(isTop ? groupIndex : groupIndex + 1, 0, groupData);
                            return true;
                        }
                    });
                    return true;
                }
            });
            if (isTop) {
                targetElement.before(sourceElement);
            } else {
                targetElement.after(sourceElement);
            }
        }
        targetElement.classList.remove("dragover__top", "dragover__bottom");
        return true;
    }
    return false;
};
