import {Menu} from "../../../plugin/Menu";
import {transaction} from "../../wysiwyg/transaction";
import {fetchPost, fetchSyncPost} from "../../../util/fetch";
import {getDefaultOperatorByType, setFilter} from "./filter";
import {genCellValue} from "./cell";
import {getPropertiesHTML, openMenuPanel} from "./openMenuPanel";
import {getLabelByNumberFormat} from "./number";
import {removeAttrViewColAnimation, updateAttrViewCellAnimation} from "./cell";
import {openEmojiPanel, unicode2Emoji} from "../../../emoji";
import {focusBlock} from "../../util/selection";
import {toggleUpdateRelationBtn} from "./relation";
import {bindRollupData, getRollupHTML} from "./rollup";
import {Constants} from "../../../constants";
import * as dayjs from "dayjs";
import {setPosition} from "../../../util/setPosition";
import {duplicateNameAddOne, isMobile} from "../../../util/functions";
import {Dialog} from "../../../dialog";
import {escapeAriaLabel, escapeAttr, escapeHtml} from "../../../util/escape";
import {getFieldsByData} from "./view";
import {hasClosestByClassName} from "../../util/hasClosest";
import {getAVViewAttr} from "../../../util/attrCompat";

import {getColIconByType} from "./colLookups";
import {addCol, duplicateCol, removeColByMenu} from "./colMutations";

export const showColMenu = (protyle: IProtyle, blockElement: Element, cellElement: HTMLElement) => {
    const type = cellElement.getAttribute("data-dtype") as TAVCol;
    const colId = cellElement.getAttribute("data-col-id");
    const avID = blockElement.getAttribute("data-av-id");
    const blockID = blockElement.getAttribute("data-node-id");
    const viewID = getAVViewAttr(blockElement);
    const oldValue = cellElement.querySelector(".av__celltext").textContent.trim();
    const oldDesc = cellElement.dataset.desc;
    const menu = new Menu(Constants.MENU_AV_HEADER_CELL, () => {
        const newValue = (menu.element.querySelector(".b3-text-field") as HTMLInputElement).value;
        if (newValue !== oldValue) {
            transaction(protyle, [{
                action: "updateAttrViewCol",
                id: colId,
                avID,
                name: newValue,
                type,
            }], [{
                action: "updateAttrViewCol",
                id: colId,
                avID,
                name: oldValue,
                type,
            }]);
            updateAttrViewCellAnimation(blockElement.querySelector(`.av__row--header .av__cell[data-col-id="${colId}"]`), undefined, {name: newValue});
        }
        const newDesc = menu.element.querySelector("textarea").value;
        if (newDesc !== oldDesc) {
            transaction(protyle, [{
                action: "setAttrViewColDesc",
                id: colId,
                avID,
                data: newDesc,
            }], [{
                action: "setAttrViewColDesc",
                id: colId,
                avID,
                data: oldDesc,
            }]);
        }
        // https://github.com/lonelyor/SourceFlow/issues/9862
        focusBlock(blockElement);
    });
    menu.addItem({
        iconHTML: "",
        type: "empty",
        label: `<div class="fn__hr"></div><div class="fn__flex">
    <div class="fn__space"></div>
    <span class="b3-menu__avemoji">${cellElement.dataset.icon ? unicode2Emoji(cellElement.dataset.icon) : `<svg style="height: 14px;width: 14px;"><use xlink:href="#${getColIconByType(type)}"></use></svg>`}</span>
    <div class="b3-form__icona fn__block">
        <input class="b3-text-field b3-form__icona-input" type="text">
        <svg data-position="north" class="b3-form__icona-icon ariaLabel" aria-label="${oldDesc ? escapeAriaLabel(oldDesc) : window.sourceflow.languages.addDesc}"><use xlink:href="#iconInfo"></use></svg>
    </div>
    <div class="fn__space"></div>
</div>
<div class="fn__none">
    <div class="fn__hr"></div>
    <div class="fn__flex">
        <span class="fn__space"></span>
        <textarea placeholder="${window.sourceflow.languages.addDesc}" rows="1" class="b3-text-field fn__block" type="text" data-value="${escapeAttr(oldDesc)}">${oldDesc}</textarea>
        <span class="fn__space"></span>    
    </div>
</div>
<div class="fn__hr--small"></div>`,
        bind(element) {
            const iconElement = element.querySelector(".b3-menu__avemoji") as HTMLElement;
            iconElement.addEventListener("click", (event) => {
                const rect = iconElement.getBoundingClientRect();
                openEmojiPanel("", "av", {
                    x: rect.left,
                    y: rect.bottom + 4,
                    h: rect.height,
                    w: rect.width
                }, (unicode) => {
                    transaction(protyle, [{
                        action: "setAttrViewColIcon",
                        id: colId,
                        avID,
                        data: unicode,
                    }], [{
                        action: "setAttrViewColIcon",
                        id: colId,
                        avID,
                        data: cellElement.dataset.icon,
                    }]);
                    iconElement.innerHTML = unicode ? unicode2Emoji(unicode) : `<svg style="height: 14px;width: 14px"><use xlink:href="#${getColIconByType(type)}"></use></svg>`;
                    updateAttrViewCellAnimation(blockElement.querySelector(`.av__row--header .av__cell[data-col-id="${colId}"]`), undefined, {icon: unicode});
                }, iconElement.querySelector("img"));
                event.preventDefault();
                event.stopPropagation();
            });
            const inputElement = element.querySelector("input");
            inputElement.value = oldValue;
            inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
                if (event.isComposing) {
                    return;
                }
                if (event.key === "Enter") {
                    menu.close();
                    event.preventDefault();
                }
            });
            const descElement = element.querySelector("textarea");
            inputElement.nextElementSibling.addEventListener("click", () => {
                const descPanelElement = descElement.parentElement.parentElement;
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
                    event.preventDefault();
                }
            });
            descElement.addEventListener("input", () => {
                inputElement.nextElementSibling.setAttribute("aria-label", descElement.value ? escapeHtml(descElement.value) : window.sourceflow.languages.addDesc);
            });
        }
    });
    menu.addItem({
        id: "edit",
        icon: "iconEdit",
        label: window.sourceflow.languages.edit,
        click() {
            const colName = (menu.element.querySelector(".b3-text-field") as HTMLInputElement).value;
            openMenuPanel({
                protyle,
                blockElement,
                type: "edit",
                colId,
                cb(avElement) {
                    // 修改名字后点击编辑，需要更新名字
                    const editNameElement = avElement.querySelector('.b3-text-field[data-type="name"]') as HTMLInputElement;
                    editNameElement.value = colName;
                    editNameElement.select();
                }
            });
        }
    });
    menu.addSeparator({id: "separator_1"});

    // 行号类型不参与筛选和排序
    if (type !== "lineNumber") {
        menu.addItem({
            id: "filter",
            icon: "iconFilter",
            label: window.sourceflow.languages.filter,
            click() {
                fetchPost("/api/av/renderAttributeView", {
                    id: avID,
                }, (response) => {
                    const avData = response.data as IAV;
                    let filter: IAVFilter;
                    avData.view.filters.find((item) => {
                        if (item.column === colId && item.value.type === type) {
                            filter = item;
                            return true;
                        }
                    });
                    let empty = false;
                    if (!filter) {
                        empty = true;
                        filter = {
                            column: colId,
                            operator: getDefaultOperatorByType(type),
                            value: genCellValue(type, ""),
                        };
                        avData.view.filters.push(filter);
                    }
                    setFilter({
                        empty,
                        filter,
                        protyle,
                        data: avData,
                        blockElement: blockElement,
                        target: blockElement.querySelector(`.av__row--header .av__cell[data-col-id="${colId}"]`),
                    });
                });
            }
        });
        menu.addItem({
            id: "asc",
            icon: "iconUp",
            label: window.sourceflow.languages.asc,
            click() {
                fetchPost("/api/av/renderAttributeView", {
                    id: avID,
                }, (response) => {
                    transaction(protyle, [{
                        action: "setAttrViewSorts",
                        avID: response.data.id,
                        data: [{
                            column: colId,
                            order: "ASC"
                        }],
                        blockID
                    }], [{
                        action: "setAttrViewSorts",
                        avID: response.data.id,
                        data: response.data.view.sorts,
                        blockID
                    }]);
                });
            }
        });
        menu.addItem({
            id: "desc",
            icon: "iconDown",
            label: window.sourceflow.languages.desc,
            click() {
                fetchPost("/api/av/renderAttributeView", {
                    id: avID,
                }, (response) => {
                    transaction(protyle, [{
                        action: "setAttrViewSorts",
                        avID: response.data.id,
                        data: [{
                            column: colId,
                            order: "DESC"
                        }],
                        blockID
                    }], [{
                        action: "setAttrViewSorts",
                        avID: response.data.id,
                        data: response.data.view.sorts,
                        blockID
                    }]);
                });
            }
        });
    }
    const isPin = cellElement.dataset.pin === "true";
    menu.addItem({
        id: isPin ? "unfreezeCol" : "freezeCol",
        icon: isPin ? "iconUnpin" : "iconPin",
        label: isPin ? window.sourceflow.languages.unfreezeCol : window.sourceflow.languages.freezeCol,
        click() {
            transaction(protyle, [{
                action: "setAttrViewColPin",
                id: colId,
                avID,
                data: !isPin,
                blockID
            }], [{
                action: "setAttrViewColPin",
                id: colId,
                avID,
                data: isPin,
                blockID
            }]);
            updateAttrViewCellAnimation(blockElement.querySelector(`.av__row--header .av__cell[data-col-id="${colId}"]`), undefined, {pin: !isPin});
        }
    });
    if (type !== "block") {
        menu.addItem({
            id: "hide",
            icon: "iconEyeoff",
            label: window.sourceflow.languages.hide,
            click() {
                transaction(protyle, [{
                    action: "setAttrViewColHidden",
                    id: colId,
                    avID,
                    data: true,
                    blockID
                }], [{
                    action: "setAttrViewColHidden",
                    id: colId,
                    avID,
                    data: false,
                    blockID
                }]);
            }
        });
    }
    menu.addItem({
        icon: "iconRefresh",
        label: window.sourceflow.languages.syncColWidth,
        click() {
            transaction(protyle, [{
                action: "syncAttrViewTableColWidth",
                keyID: colId,
                avID,
                id: viewID,
            }]);
        }
    });
    menu.addItem({
        icon: "iconSoftWrap",
        label: `<label class="fn__flex fn__pointer"><span>${window.sourceflow.languages.wrap}</span><span class="fn__space fn__flex-1"></span>
<input type="checkbox" class="b3-switch b3-switch--menu"${cellElement.dataset.wrap === "true" ? " checked" : ""}></label>`,
        bind(element) {
            const wrapElement = element.querySelector(".b3-switch") as HTMLInputElement;
            wrapElement.addEventListener("change", () => {
                cellElement.dataset.wrap = wrapElement.checked.toString();
                transaction(protyle, [{
                    action: "setAttrViewColWrap",
                    id: colId,
                    avID,
                    data: wrapElement.checked,
                    blockID,
                    viewID
                }], [{
                    action: "setAttrViewColWrap",
                    id: colId,
                    avID,
                    data: !wrapElement.checked,
                    blockID,
                    viewID
                }]);
                menu.close();
            });
        }
    });
    menu.addSeparator({id: "separator_2"});
    menu.addItem({
        id: "insertColumnLeft",
        icon: "iconInsertLeft",
        label: window.sourceflow.languages.insertColumnLeft,
        click() {
            const addMenu = addCol(protyle, blockElement, cellElement.previousElementSibling?.getAttribute("data-col-id") || "");
            if (!blockElement.contains(cellElement)) {
                cellElement = blockElement.querySelector(`.av__row--header .av__cell--header[data-col-id="${colId}"]`);
            }
            const addRect = cellElement.getBoundingClientRect();
            addMenu.open({
                x: addRect.left,
                y: addRect.bottom,
                h: addRect.height
            });
        }
    });
    menu.addItem({
        id: "insertColumnRight",
        icon: "iconInsertRight",
        label: window.sourceflow.languages.insertColumnRight,
        click() {
            const addMenu = addCol(protyle, blockElement, colId);
            if (!blockElement.contains(cellElement)) {
                cellElement = blockElement.querySelector(`.av__row--header .av__cell--header[data-col-id="${colId}"]`);
            }
            const addRect = cellElement.getBoundingClientRect();
            addMenu.open({
                x: addRect.left,
                y: addRect.bottom,
                h: addRect.height
            });
        }
    });
    if (type !== "block") {
        if (type !== "relation") {
            menu.addItem({
                id: "duplicate",
                icon: "iconCopy",
                label: window.sourceflow.languages.duplicate,
                click() {
                    fetchPost("/api/av/renderAttributeView", {
                        id: avID,
                    }, (response) => {
                        duplicateCol({
                            blockElement,
                            viewID,
                            protyle,
                            colId,
                            data: response.data
                        });
                    });
                }
            });
        }
        menu.addItem({
            id: "delete",
            icon: "iconTrashcan",
            label: window.sourceflow.languages.delete,
            async click() {
                if (type === "relation") {
                    const response = await fetchSyncPost("/api/av/getAttributeView", {id: avID});
                    const colData = response.data.av.keyValues.find((item: {
                        key: { id: string }
                    }) => item.key.id === colId);
                    if (colData.key.relation?.isTwoWay) {
                        const relResponse = await fetchSyncPost("/api/av/getAttributeView", {id: colData.key.relation.avID});
                        const dialog = new Dialog({
                            title: window.sourceflow.languages.removeColConfirm,
                            content: `<div class="b3-dialog__content">
    ${window.sourceflow.languages.confirmRemoveRelationField
                                .replace("${x}", colData.key.name || window.sourceflow.languages._kernel[272])
                                .replace("${y}", relResponse.data.av.name || window.sourceflow.languages._kernel[267])
                                .replace("${z}", relResponse.data.av.keyValues.find((item: {
                                    key: { id: string }
                                }) => item.key.id === colData.key.relation.backKeyID).key.name || window.sourceflow.languages._kernel[272])}
    <div class="fn__hr--b"></div>
    <button class="fn__block b3-button b3-button--remove" data-action="delete">${window.sourceflow.languages.removeBothRelationField}</button>
    <div class="fn__hr"></div>
    <button class="fn__block b3-button b3-button--remove" data-action="keep-relation">${window.sourceflow.languages.removeButKeepRelationField}</button>
    <div class="fn__hr"></div>
    <button class="fn__block b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button>
</div>`,
                            width: isMobile() ? "92vw" : "520px",
                        });
                        dialog.element.addEventListener("click", (event) => {
                            let target = event.target as HTMLElement;
                            const isDispatch = typeof event.detail === "string";
                            while (target && target !== dialog.element || isDispatch) {
                                const action = target.getAttribute("data-action");
                                if (action === "delete" || (isDispatch && event.detail === "Enter")) {
                                    removeColByMenu({
                                        protyle,
                                        colId,
                                        avID,
                                        blockID,
                                        oldValue,
                                        type,
                                        cellElement,
                                        blockElement,
                                        removeDest: true
                                    });
                                    dialog.destroy();
                                    break;
                                } else if (action === "keep-relation") {
                                    removeColByMenu({
                                        protyle,
                                        colId,
                                        avID,
                                        blockID,
                                        oldValue,
                                        type,
                                        cellElement,
                                        blockElement,
                                        removeDest: false
                                    });
                                    dialog.destroy();
                                    break;
                                } else if (target.classList.contains("b3-button--cancel") || (isDispatch && event.detail === "Escape")) {
                                    dialog.destroy();
                                    break;
                                }
                                target = target.parentElement;
                            }
                        });
                        dialog.element.querySelector("button").focus();
                        dialog.element.setAttribute("data-key", Constants.DIALOG_CONFIRM);
                        return;
                    }
                }
                removeColByMenu({
                    protyle,
                    colId,
                    avID,
                    blockID,
                    oldValue,
                    type,
                    cellElement,
                    blockElement,
                    removeDest: false
                });
            }
        });
    }
    const cellRect = cellElement.getBoundingClientRect();
    menu.open({
        x: cellRect.left,
        y: cellRect.bottom,
        h: cellRect.height
    });
    const inputElement = window.sourceflow.menus.menu.element.querySelector(".b3-text-field") as HTMLInputElement;
    if (inputElement) {
        inputElement.select();
        inputElement.focus();
    }
};
