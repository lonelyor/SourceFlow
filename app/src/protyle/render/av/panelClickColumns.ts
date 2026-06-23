import {transaction} from "../../wysiwyg/transaction";
import {
    addCol,
    duplicateCol,
    getColIconByType,
    getColNameByType,
    removeCol
} from "./col";
import {formatNumber} from "./number";
import {updateAttrViewCellAnimation} from "./cell";
import {openEmojiPanel, unicode2Emoji} from "../../../emoji";
import {Dialog} from "../../../dialog";
import {Constants} from "../../../constants";
import {
    positionAVPanelMenu,
    refreshEditMenu,
    refreshPropertiesMenu,
    resolveAVPanelColId
} from "./panelShared";
import {setPageSize} from "./row";
import type {AVPanelClickBranchHandler} from "./panelTypes";

export const handleAVPanelColumnClick: AVPanelClickBranchHandler = ({type, target, context}) => {
    if (type === "numberFormat") {
        formatNumber({
            avPanelElement: context.avPanelElement,
            element: target,
            protyle: context.options.protyle,
            oldFormat: target.dataset.format,
            colId: context.menuElement.querySelector(".b3-menu__item").getAttribute("data-col-id"),
            avID: context.avID
        });
        return true;
    }
    if (type === "newCol") {
        context.avPanelElement.remove();
        const addMenu = addCol(context.options.protyle, context.options.blockElement);
        addMenu.open({
            x: context.state.tabRect.right,
            y: context.state.tabRect.bottom,
            h: context.state.tabRect.height,
            isLeft: true
        });
        return true;
    }
    if (type === "update-view-icon") {
        const rect = target.getBoundingClientRect();
        openEmojiPanel("", "av", {
            x: rect.left,
            y: rect.bottom + 4,
            h: rect.height,
            w: rect.width
        }, (unicode) => {
            transaction(context.options.protyle, [{
                action: "setAttrViewViewIcon",
                avID: context.avID,
                id: context.state.data.viewID,
                data: unicode,
            }], [{
                action: "setAttrViewViewIcon",
                id: context.state.data.viewID,
                avID: context.avID,
                data: target.dataset.icon,
            }]);
            target.innerHTML = unicode ? unicode2Emoji(unicode) : '<svg style="width: 14px;height: 14px;"><use xlink:href="#iconTable"></use></svg>';
            target.dataset.icon = unicode;
        }, target.querySelector("img"));
        return true;
    }
    if (type === "set-page-size") {
        setPageSize({
            target,
            protyle: context.options.protyle,
            avID: context.avID,
            nodeElement: context.options.blockElement
        });
        return true;
    }
    if (type === "duplicate-view") {
        const id = Lute.NewNodeID();
        transaction(context.options.protyle, [{
            action: "duplicateAttrViewView",
            avID: context.avID,
            previousID: context.state.data.viewID,
            id,
            blockID: context.blockID
        }], [{
            action: "removeAttrViewView",
            avID: context.avID,
            id,
            blockID: context.blockID
        }]);
        context.avPanelElement.remove();
        return true;
    }
    if (type === "delete-view") {
        transaction(context.options.protyle, [{
            action: "removeAttrViewView",
            avID: context.avID,
            id: context.state.data.viewID,
            blockID: context.blockID
        }]);
        context.avPanelElement.remove();
        return true;
    }
    if (type === "update-icon") {
        const rect = target.getBoundingClientRect();
        openEmojiPanel("", "av", {
            x: rect.left,
            y: rect.bottom + 4,
            h: rect.height,
            w: rect.width
        }, (unicode) => {
            const colId = context.menuElement.querySelector(".b3-menu__item").getAttribute("data-col-id");
            transaction(context.options.protyle, [{
                action: "setAttrViewColIcon",
                id: colId,
                avID: context.avID,
                data: unicode,
            }], [{
                action: "setAttrViewColIcon",
                id: colId,
                avID: context.avID,
                data: target.dataset.icon,
            }]);
            target.innerHTML = unicode ? unicode2Emoji(unicode) : `<svg style="height: 14px;width: 14px"><use xlink:href="#${getColIconByType(target.dataset.colType as TAVCol)}"></use></svg>`;
            if (context.isCustomAttr) {
                const iconElement = context.options.blockElement.querySelector(`.av__row[data-col-id="${colId}"] .block__logoicon`);
                iconElement.outerHTML = unicode ?
                    unicode2Emoji(unicode, "block__logoicon", true) :
                    `<svg class="block__logoicon"><use xlink:href="#${getColIconByType(iconElement.nextElementSibling.getAttribute("data-type") as TAVCol)}"></use></svg>`;
            } else {
                updateAttrViewCellAnimation(
                    context.options.blockElement.querySelector(`.av__row--header .av__cell[data-col-id="${colId}"]`),
                    undefined,
                    {icon: unicode}
                );
            }
            target.dataset.icon = unicode;
        }, target.querySelector("img"));
        return true;
    }
    if (type === "showAllCol") {
        const doOperations: IOperation[] = [];
        const undoOperations: IOperation[] = [];
        context.state.fields.forEach((item: IAVColumn) => {
            if (item.hidden) {
                doOperations.push({
                    action: "setAttrViewColHidden",
                    id: item.id,
                    avID: context.avID,
                    data: false,
                    blockID: context.blockID,
                });
                undoOperations.push({
                    action: "setAttrViewColHidden",
                    id: item.id,
                    avID: context.avID,
                    data: true,
                    blockID: context.blockID
                });
                item.hidden = false;
            }
        });
        if (doOperations.length > 0) {
            transaction(context.options.protyle, doOperations, undoOperations);
            refreshPropertiesMenu(context);
        }
        return true;
    }
    if (type === "hideAllCol") {
        const doOperations: IOperation[] = [];
        const undoOperations: IOperation[] = [];
        context.state.fields.forEach((item: IAVColumn) => {
            if (!item.hidden && item.type !== "block") {
                doOperations.push({
                    action: "setAttrViewColHidden",
                    id: item.id,
                    avID: context.avID,
                    data: true,
                    blockID: context.blockID
                });
                undoOperations.push({
                    action: "setAttrViewColHidden",
                    id: item.id,
                    avID: context.avID,
                    data: false,
                    blockID: context.blockID
                });
                item.hidden = true;
            }
        });
        if (doOperations.length > 0) {
            transaction(context.options.protyle, doOperations, undoOperations);
            refreshPropertiesMenu(context);
        }
        return true;
    }
    if (type === "editCol") {
        refreshEditMenu(context, target.dataset.id);
        return true;
    }
    if (type === "updateColType") {
        const colId = resolveAVPanelColId(context);
        if (target.dataset.newType !== target.dataset.oldType) {
            const nameElement = context.avPanelElement.querySelector('.b3-text-field[data-type="name"]') as HTMLInputElement;
            const name = nameElement.value;
            let newName = name;
            context.state.fields.find((item: IAVColumn) => {
                if (item.id === colId) {
                    item.type = target.dataset.newType as TAVCol;
                    if (getColNameByType(target.dataset.oldType as TAVCol) === name) {
                        newName = getColNameByType(target.dataset.newType as TAVCol);
                        item.name = newName;
                    }
                    return true;
                }
            });

            transaction(context.options.protyle, [{
                action: "updateAttrViewCol",
                id: colId,
                avID: context.avID,
                name: newName,
                type: target.dataset.newType as TAVCol,
            }], [{
                action: "updateAttrViewCol",
                id: colId,
                avID: context.avID,
                name,
                type: target.dataset.oldType as TAVCol,
            }]);

            if (target.dataset.newType === "lineNumber") {
                const sortExist = context.state.data.view.sorts.find((sort) => sort.column === colId);
                if (sortExist) {
                    const oldSorts = Object.assign([], context.state.data.view.sorts);
                    const newSorts = context.state.data.view.sorts.filter((sort) => sort.column !== colId);
                    context.state.data.view.sorts = newSorts;
                    transaction(context.options.protyle, [{
                        action: "setAttrViewSorts",
                        avID: context.state.data.id,
                        data: newSorts,
                        blockID: context.blockID,
                    }], [{
                        action: "setAttrViewSorts",
                        avID: context.state.data.id,
                        data: oldSorts,
                        blockID: context.blockID,
                    }]);
                }

                const filterExist = context.state.data.view.filters.find((filter) => filter.column === colId);
                if (filterExist) {
                    const oldFilters = JSON.parse(JSON.stringify(context.state.data.view.filters));
                    const newFilters = context.state.data.view.filters.filter((filter) => filter.column !== colId);
                    context.state.data.view.filters = newFilters;
                    transaction(context.options.protyle, [{
                        action: "setAttrViewFilters",
                        avID: context.state.data.id,
                        data: newFilters,
                        blockID: context.blockID
                    }], [{
                        action: "setAttrViewFilters",
                        avID: context.state.data.id,
                        data: oldFilters,
                        blockID: context.blockID
                    }]);
                }
            }
        }
        refreshEditMenu(context, colId);
        return true;
    }
    if (type === "goUpdateColType") {
        const editMenuElement = target.closest(".b3-menu");
        if (editMenuElement) {
            editMenuElement.firstElementChild.classList.add("fn__none");
            editMenuElement.lastElementChild.classList.remove("fn__none");
        }
        positionAVPanelMenu(context);
        return true;
    }
    if (type === "goEditCol") {
        const editMenuElement = target.closest(".b3-menu");
        if (editMenuElement) {
            editMenuElement.firstElementChild.classList.remove("fn__none");
            editMenuElement.lastElementChild.classList.add("fn__none");
        }
        positionAVPanelMenu(context);
        return true;
    }
    if (type === "hideCol" || type === "showCol") {
        const isEdit = context.menuElement.querySelector('[data-type="go-properties"]');
        const colId = isEdit ?
            context.menuElement.querySelector(".b3-menu__item").getAttribute("data-col-id") :
            target.parentElement.getAttribute("data-id");
        const hidden = type === "hideCol";
        transaction(context.options.protyle, [{
            action: "setAttrViewColHidden",
            id: colId,
            avID: context.avID,
            data: hidden,
            blockID: context.blockID
        }], [{
            action: "setAttrViewColHidden",
            id: colId,
            avID: context.avID,
            data: !hidden,
            blockID: context.blockID
        }]);
        context.state.fields.find((item: IAVColumn) => item.id === colId).hidden = hidden;
        if (isEdit) {
            refreshEditMenu(context, colId);
        } else {
            refreshPropertiesMenu(context);
        }
        return true;
    }
    if (type === "duplicateCol") {
        duplicateCol({
            blockElement: context.options.blockElement,
            protyle: context.options.protyle,
            colId: context.menuElement.querySelector(".b3-menu__item").getAttribute("data-col-id"),
            data: context.state.data,
            viewID: context.state.data.viewID,
        });
        return true;
    }
    if (type === "removeCol") {
        if (!context.isCustomAttr) {
            context.state.tabRect = context.options.blockElement.querySelector(".av__views").getBoundingClientRect();
        }
        const colId = context.menuElement.querySelector(".b3-menu__item").getAttribute("data-col-id");
        const colData = context.state.fields.find((item: IAVColumn) => item.id === colId);
        const isTwoWay = colData.type === "relation" && colData.relation?.isTwoWay;
        if (context.isCustomAttr || isTwoWay) {
            const dialog = new Dialog({
                title: isTwoWay ? window.sourceflow.languages.removeColConfirm : window.sourceflow.languages.deleteOpConfirm,
                content: `<div class="b3-dialog__content">
    ${isTwoWay ? window.sourceflow.languages.confirmRemoveRelationField
                        .replace("${x}", context.menuElement.querySelector("input").value || window.sourceflow.languages._kernel[272])
                        .replace("${y}", context.menuElement.querySelector('.b3-menu__item[data-type="goSearchAV"] .b3-menu__accelerator').textContent)
                        .replace("${z}", (context.menuElement.querySelector('input[data-type="colName"]') as HTMLInputElement).value || window.sourceflow.languages._kernel[272])
                    : window.sourceflow.languages.removeCol.replace("${x}", context.menuElement.querySelector("input").value || window.sourceflow.languages._kernel[272])}
    <div class="fn__hr--b"></div>
    <button class="fn__block b3-button b3-button--remove" data-action="delete">${isTwoWay ? window.sourceflow.languages.removeBothRelationField : window.sourceflow.languages.delete}</button>
    <div class="fn__hr"></div>
    <button class="fn__block b3-button b3-button--remove${isTwoWay ? "" : " fn__none"}" data-action="keep-relation">${window.sourceflow.languages.removeButKeepRelationField}</button>
    <div class="fn__hr"></div>
    <button class="fn__block b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button>
</div>`,
                width: "520px",
            });
            dialog.element.addEventListener("click", (dialogEvent) => {
                let dialogTarget = dialogEvent.target as HTMLElement;
                const isDispatch = typeof dialogEvent.detail === "string";
                while ((dialogTarget && dialogTarget !== dialog.element) || isDispatch) {
                    const action = dialogTarget.getAttribute("data-action");
                    if (action === "delete" || (isDispatch && dialogEvent.detail === "Enter")) {
                        removeCol({
                            protyle: context.options.protyle,
                            fields: context.state.fields,
                            avID: context.avID,
                            blockID: context.blockID,
                            menuElement: context.menuElement,
                            isCustomAttr: context.isCustomAttr,
                            blockElement: context.options.blockElement,
                            avPanelElement: context.avPanelElement,
                            tabRect: context.state.tabRect,
                            isTwoWay: true
                        });
                        dialog.destroy();
                        break;
                    }
                    if (action === "keep-relation") {
                        removeCol({
                            protyle: context.options.protyle,
                            fields: context.state.fields,
                            avID: context.avID,
                            blockID: context.blockID,
                            menuElement: context.menuElement,
                            isCustomAttr: context.isCustomAttr,
                            blockElement: context.options.blockElement,
                            avPanelElement: context.avPanelElement,
                            tabRect: context.state.tabRect,
                            isTwoWay: false
                        });
                        dialog.destroy();
                        break;
                    }
                    if (dialogTarget.classList.contains("b3-button--cancel") || (isDispatch && dialogEvent.detail === "Escape")) {
                        dialog.destroy();
                        break;
                    }
                    dialogTarget = dialogTarget.parentElement;
                }
            });
            dialog.element.setAttribute("data-key", Constants.DIALOG_CONFIRM);
        } else {
            removeCol({
                protyle: context.options.protyle,
                fields: context.state.fields,
                avID: context.avID,
                blockID: context.blockID,
                menuElement: context.menuElement,
                isCustomAttr: context.isCustomAttr,
                blockElement: context.options.blockElement,
                avPanelElement: context.avPanelElement,
                tabRect: context.state.tabRect,
                isTwoWay: false
            });
        }
        return true;
    }
    return false;
};
