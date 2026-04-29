import {fetchSyncPost} from "../../../util/fetch";
import {getColIconByType} from "./col";
import {Constants} from "../../../constants";
import {addDragFill, cellScrollIntoView, popTextCell, renderCell} from "./cell";
import {unicode2Emoji} from "../../../emoji";
import {focusBlock} from "../../util/selection";
import {hasClosestBlock, hasClosestByAttribute, hasClosestByClassName} from "../../util/hasClosest";
import {stickyRow, updateHeader} from "./row";
import {getCalcValue} from "./calc";
import {renderAVAttribute} from "./blockAttr";
import {addClearButton} from "../../../util/addClearButton";
import {escapeAriaLabel, escapeAttr, escapeHtml} from "../../../util/escape";
import {electronUndo} from "../../undo";
import {isInMobileApp} from "../../util/compatibility";
import {isMobile} from "../../../util/functions";
import {getFieldsByData, getViewIcon} from "./view";
import {openMenuPanel} from "./openMenuPanel";
import {getPageSize} from "./groups";
import {clearSelect} from "../../util/clear";
import {showMessage} from "../../../dialog/message";
/// #if MOBILE
import {activeBlur} from "../../../mobile/util/keyboardToolbar";
/// #endif
import {getAVViewAttr} from "../../../util/attrCompat";

export interface IIds {
    groupId: string,
    rowId: string,
    colId?: string
}

export interface ITableOptions {
    protyle: IProtyle,
    blockElement: HTMLElement,
    cb: (data: IAV) => void,
    data: IAV,
    renderAll: boolean,
    resetData: {
        left: number,
        alignSelf: string,
        headerTransform: { groupId: string, transform: string },
        footerTransform: { groupId: string, transform: string },
        isSearching: boolean,
        selectCellId: IIds,
        selectRowIds: IIds[],
        dragFillId: IIds,
        activeIds: IIds[],
        query: string,
        pageSizes: { [key: string]: string },
    }
}

export const genTabHeaderHTML = (data: IAV, showSearch: boolean, editable: boolean) => {
    let tabHTML = "";
    let viewData: IAVView;
    let hasFilter = false;
    getFieldsByData(data).forEach((item) => {
        if (!hasFilter) {
            data.view.filters.find(filterItem => {
                if (filterItem.value.type === item.type && item.id === filterItem.column) {
                    hasFilter = true;
                    return true;
                }
            });
        }
    });
    data.views.forEach((item: IAVView) => {
        tabHTML += `<div draggable="true" data-position="north" data-av-type="${item.type}" data-id="${item.id}" data-page="${item.pageSize}" data-desc="${escapeAriaLabel(item.desc || "")}" class="ariaLabel item${item.id === data.viewID ? " item--focus" : ""}">
    ${item.icon ? unicode2Emoji(item.icon, "item__graphic", true) : `<svg class="item__graphic"><use xlink:href="#${getViewIcon(item.type)}"></use></svg>`}
    <span class="item__text">${escapeHtml(item.name)}</span>
</div>`;
        if (item.id === data.viewID) {
            viewData = item;
        }
    });
    return `<div class="av__header">
        <div class="fn__flex av__views${showSearch ? " av__views--show" : ""}">
            <div class="layout-tab-bar fn__flex">
                ${tabHTML}
            </div>
            <div class="fn__space"></div>
            <span data-type="av-add" class="block__icon ariaLabel" data-position="8south" aria-label="${window.sourceflow.languages.newView}">
                <svg><use xlink:href="#iconAdd"></use></svg>
            </span>
            <div class="fn__flex-1"></div>
            <div class="fn__space"></div>
            <span data-type="av-switcher" aria-label="${window.sourceflow.languages.allViews}" data-position="8south" class="ariaLabel block__icon${data.views.length > 0 ? "" : " fn__none"}">
                <svg><use xlink:href="#iconDown"></use></svg>
                <span class="fn__space"></span>
                <small>${data.views.length}</small>
            </span>
            <div class="fn__space"></div>
            <span data-type="av-filter" aria-label="${window.sourceflow.languages.filter}" data-position="8south" class="ariaLabel block__icon${hasFilter ? " block__icon--active" : ""}">
                <svg><use xlink:href="#iconFilter"></use></svg>
            </span>
            <div class="fn__space"></div>
            <span data-type="av-sort" aria-label="${window.sourceflow.languages.sort}" data-position="8south" class="ariaLabel block__icon${data.view.sorts.length > 0 ? " block__icon--active" : ""}">
                <svg><use xlink:href="#iconSort"></use></svg>
            </span>
            <div class="fn__space"></div>
            <button data-type="av-search-icon" aria-label="${window.sourceflow.languages.search}" data-position="8south" class="ariaLabel block__icon">
                <svg><use xlink:href="#iconSearch"></use></svg>
            </button>
            <div style="position: relative" class="fn__flex">
                <div contenteditable="plaintext-only" style="${showSearch ? "width:128px" : "width:0;padding-left: 0;padding-right: 0;"}" data-type="av-search" class="b3-text-field b3-text-field--text" placeholder="${window.sourceflow.languages.search}"></div>
            </div>
            <div class="fn__space"></div>
            <span data-type="av-more" aria-label="${window.sourceflow.languages.config}" data-position="8south" class="ariaLabel block__icon">
                <svg><use xlink:href="#iconSettings"></use></svg>
            </span>
            <div class="fn__space"></div>
            <span data-type="av-add-more" class="block__icon ariaLabel" data-position="8south" aria-label="${window.sourceflow.languages.newRow}">
                <svg><use xlink:href="#iconAdd"></use></svg>
            </span>
            <div class="fn__space"></div>
            ${data.isMirror ? ` <span data-av-id="${data.id}" data-popover-url="/api/av/getMirrorDatabaseBlocks" class="popover__block block__icon block__icon--show ariaLabel" data-position="8south" aria-label="${window.sourceflow.languages.mirrorTip}">
    <svg><use xlink:href="#iconSplitLR"></use></svg></span><div class="fn__space"></div>` : ""}
        </div>
        <div contenteditable="${editable}" spellcheck="${window.sourceflow.config.editor.spellcheck.toString()}" class="av__title${viewData.hideAttrViewName ? " fn__none" : ""}" data-title="${data.name || ""}" data-tip="${window.sourceflow.languages._kernel[267]}">${data.name || ""}</div>
        <div class="av__counter fn__none"></div>
    </div>`;
};

export const getTableHTMLs = (data: IAVTable, e: HTMLElement) => {
    let calcHTML = "";
    let contentHTML = '<div class="av__row av__row--header"><div class="av__colsticky"><div class="av__firstcol"><svg><use xlink:href="#iconUncheck"></use></svg></div></div>';
    let pinIndex = -1;
    let pinMaxIndex = -1;
    let indexWidth = 0;
    const eWidth = e.clientWidth;
    data.columns.forEach((item, index) => {
        if (!item.hidden) {
            if (item.pin) {
                pinIndex = index;
            }
            if (indexWidth < eWidth - 200) {
                indexWidth += parseInt(item.width) || 200;
                pinMaxIndex = index;
            }
        }
    });
    if (eWidth === 0) {
        pinMaxIndex = pinIndex;
    }
    pinIndex = Math.min(pinIndex, pinMaxIndex);
    if (pinIndex > -1) {
        contentHTML = '<div class="av__row av__row--header"><div class="av__colsticky"><div class="av__firstcol"><svg><use xlink:href="#iconUncheck"></use></svg></div>';
        calcHTML = '<div class="av__colsticky">';
    }
    let hasCalc = false;
    data.columns.forEach((column: IAVColumn, index: number) => {
        if (column.hidden) {
            return;
        }
        contentHTML += `<div class="av__cell av__cell--header" data-col-id="${column.id}"  draggable="true" 
data-icon="${column.icon}" data-dtype="${column.type}" data-wrap="${column.wrap}" data-pin="${column.pin}" 
data-desc="${escapeAttr(column.desc)}" data-position="north" 
style="width: ${column.width || "200px"};">
    ${column.icon ? unicode2Emoji(column.icon, "av__cellheadericon", true) : `<svg class="av__cellheadericon"><use xlink:href="#${getColIconByType(column.type)}"></use></svg>`}
    <span class="av__celltext fn__flex-1">${escapeHtml(column.name)}</span>
    ${column.pin ? '<svg class="av__cellheadericon av__cellheadericon--pin"><use xlink:href="#iconPin"></use></svg>' : ""}
    <div class="av__widthdrag"></div>
</div>`;
        if (pinIndex === index) {
            contentHTML += "</div>";
        }
        if (column.type === "lineNumber") {
            // lineNumber type 不参与计算操作
            calcHTML += `<div data-col-id="${column.id}" data-dtype="${column.type}" class="av__calc" style="width: ${column.width || "200px"}">&nbsp;</div>`;
        } else {
            calcHTML += `<div class="av__calc${column.calc && column.calc.operator !== "" ? " av__calc--ashow" : ""}" data-col-id="${column.id}" data-dtype="${column.type}" data-operator="${column.calc?.operator || ""}" 
style="width: ${column.width || "200px"}">${getCalcValue(column) || `<svg><use xlink:href="#iconDown"></use></svg><small>${window.sourceflow.languages.calc}</small>`}</div>`;
        }
        if (column.calc && column.calc.operator !== "") {
            hasCalc = true;
        }

        if (pinIndex === index) {
            calcHTML += "</div>";
        }
    });
    contentHTML += `<div class="block__icons" style="min-height: auto">
    <div class="block__icon block__icon--show" data-type="av-header-more"><svg><use xlink:href="#iconMore"></use></svg></div>
    <div class="fn__space"></div>
    <div class="block__icon block__icon--show ariaLabel" aria-label="${window.sourceflow.languages.newCol}" data-type="av-header-add" data-position="4south"><svg><use xlink:href="#iconAdd"></use></svg></div>
</div>
</div>`;
    // body
    data.rows.forEach((row: IAVRow, rowIndex: number) => {
        contentHTML += `<div class="av__row" data-id="${row.id}">`;
        if (pinIndex > -1) {
            contentHTML += '<div class="av__colsticky"><div class="av__firstcol"><svg><use xlink:href="#iconUncheck"></use></svg></div>';
        } else {
            contentHTML += '<div class="av__colsticky"><div class="av__firstcol"><svg><use xlink:href="#iconUncheck"></use></svg></div></div>';
        }

        row.cells.forEach((cell, index) => {
            if (data.columns[index].hidden) {
                return;
            }
            // https://github.com/lonelyor/SourceFlow/issues/10262
            let checkClass = "";
            if (cell.valueType === "checkbox") {
                checkClass = cell.value?.checkbox?.checked ? " av__cell-check" : " av__cell-uncheck";
            }
            contentHTML += `<div class="av__cell${checkClass}" data-id="${cell.id}" data-col-id="${data.columns[index].id}" 
data-wrap="${data.columns[index].wrap}" 
data-dtype="${data.columns[index].type}" 
${cell.value?.isDetached ? ' data-detached="true"' : ""} 
style="width: ${data.columns[index].width || "200px"};
${cell.valueType === "number" ? "text-align: right;" : ""}
${cell.bgColor ? `background-color:${cell.bgColor};` : ""}
${cell.color ? `color:${cell.color};` : ""}">${renderCell(cell.value, rowIndex, data.showIcon)}</div>`;

            if (pinIndex === index) {
                contentHTML += "</div>";
            }
        });
        contentHTML += "<div></div></div>";
    });
    return `${contentHTML}<div class="av__row--util${data.rowCount > data.rows.length ? " av__readonly--show" : ""}">
    <div class="av__colsticky">
        <button class="b3-button av__button" data-type="av-add-bottom">
            <svg><use xlink:href="#iconAdd"></use></svg>
            <span>${window.sourceflow.languages.newRow}</span>
        </button>
        <span class="fn__space"></span>
        <button class="b3-button av__button${data.rowCount > data.rows.length ? "" : " fn__none"}" data-type="av-load-more">
            <svg><use xlink:href="#iconArrowDown"></use></svg>
            <span>${window.sourceflow.languages.loadMore}</span>
            <svg data-type="set-page-size" data-size="${data.pageSize}"><use xlink:href="#iconMore"></use></svg>
        </button>
    </div>
</div>
<div class="av__row--footer${hasCalc ? " av__readonly--show" : ""}">${calcHTML}</div>`;
};

export const getGroupTitleHTML = (group: IAVView, counter: number) => {
    let nameHTML = "";
    if (["mSelect", "select"].includes(group.groupValue.type)) {
        group.groupValue.mSelect.forEach((item) => {
            nameHTML += `<span class="b3-chip" style="background-color:var(--b3-font-background${item.color});color:var(--b3-font-color${item.color})">${escapeHtml(item.content)}</span>`;
        });
    } else if (group.groupValue.type === "checkbox") {
        nameHTML = `<svg style="width:calc(1.625em - 12px);height:calc(1.625em - 12px)"><use xlink:href="#icon${group.groupValue.checkbox.checked ? "Check" : "Uncheck"}"></use></svg>`;
    } else {
        nameHTML = group.name;
    }
    // av__group-name 为第三方需求，本应用内没有使用，但不能移除 https://github.com/lonelyor/SourceFlow/issues/15736
    return `<div class="av__group-title">
    <div class="av__group-icon" data-type="av-group-fold" data-id="${group.id}">
        <svg class="${group.groupFolded ? "" : "av__group-arrow--open"}"><use xlink:href="#iconRight"></use></svg>
    </div>
    <span class="fn__space"></span>
    <span class="av__group-name">${nameHTML}</span>
    ${(!counter || counter === 0) ? '<span class="fn__space"></span>' : `<span aria-label="${window.sourceflow.languages.entryNum}" data-position="north" class="av__group-counter ariaLabel">${counter}</span>`}
    <span class="av__group-icon av__group-icon--hover ariaLabel" data-type="av-add-top" data-position="north" aria-label="${window.sourceflow.languages.newRow}"><svg><use xlink:href="#iconAdd"></use></svg></span>
</div>`;
};
