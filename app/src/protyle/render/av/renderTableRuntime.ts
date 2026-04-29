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
import {genTabHeaderHTML, getGroupTitleHTML, getTableHTMLs, IIds, ITableOptions} from "./renderTableHTML";

const renderGroupTable = (options: ITableOptions) => {
    const searchInputElement = options.blockElement.querySelector('[data-type="av-search"]');
    const isSearching = searchInputElement && document.activeElement === searchInputElement;
    const query = searchInputElement?.textContent || "";

    let avBodyHTML = "";
    options.data.view.groups.forEach((group: IAVTable) => {
        if (group.groupHidden === 0) {
            avBodyHTML += `${getGroupTitleHTML(group, group.rowCount)}
<div data-group-id="${group.id}" data-page-size="${group.pageSize}" data-dtype="${group.groupKey.type}" data-content="${Lute.EscapeHTMLStr(group.groupValue.text?.content || "")}" style="float: left" class="av__body${group.groupFolded ? " fn__none" : ""}">${getTableHTMLs(group, options.blockElement)}</div>`;
        }
    });
    if (options.renderAll) {
        options.blockElement.firstElementChild.outerHTML = `<div class="av__container">
    ${genTabHeaderHTML(options.data, isSearching || !!query, !options.protyle.disabled && !hasClosestByAttribute(options.blockElement, "data-type", "NodeBlockQueryEmbed"))}
    <div class="av__scroll">
        ${avBodyHTML}
    </div>
    <div class="av__cursor" contenteditable="true">${Constants.ZWSP}</div>
</div>`;
    } else {
        options.blockElement.firstElementChild.querySelector(".av__scroll").innerHTML = avBodyHTML;
    }
    afterRenderTable(options);
};

const afterRenderTable = (options: ITableOptions) => {
    if (options.blockElement.getAttribute("data-need-focus") === "true") {
        focusBlock(options.blockElement);
        options.blockElement.removeAttribute("data-need-focus");
    }
    options.blockElement.setAttribute("data-render", "true");
    options.blockElement.querySelector(".av__scroll").scrollLeft = options.resetData.left;
    options.blockElement.style.alignSelf = options.resetData.alignSelf;
    const editRect = options.protyle.contentElement.getBoundingClientRect();
    if (options.resetData.headerTransform) {
        const headerTransformElement = options.blockElement.querySelector(`.av__body[data-group-id="${options.resetData.headerTransform.groupId}"] .av__row--header`) as HTMLElement;
        if (headerTransformElement) {
            headerTransformElement.style.transform = options.resetData.headerTransform.transform;
        }
    } else if (editRect && !options.protyle.options.action.includes(Constants.CB_GET_HISTORY)) {
        // 需等待渲染完，否则 getBoundingClientRect 错误 https://github.com/lonelyor/SourceFlow/issues/13787
        setTimeout(() => {
            stickyRow(options.blockElement, editRect, "top");
        }, Constants.TIMEOUT_LOAD);
    }
    if (options.resetData.footerTransform) {
        const footerTransformElement = options.blockElement.querySelector(`.av__body[data-group-id="${options.resetData.footerTransform.groupId}"] .av__row--footer`) as HTMLElement;
        if (footerTransformElement) {
            footerTransformElement.style.transform = options.resetData.footerTransform.transform;
        }
    } else if (editRect && !options.protyle.options.action.includes(Constants.CB_GET_HISTORY)) {
        // 需等待渲染完，否则 getBoundingClientRect 错误 https://github.com/lonelyor/SourceFlow/issues/13787
        setTimeout(() => {
            stickyRow(options.blockElement, editRect, "bottom");
        }, Constants.TIMEOUT_LOAD);
    }
    if (options.resetData.selectCellId) {
        let newCellElement = options.blockElement.querySelector(`.av__body[data-group-id="${options.resetData.selectCellId.groupId}"] .av__row[data-id="${options.resetData.selectCellId.rowId}"] .av__cell[data-col-id="${options.resetData.selectCellId.colId}"]`);
        if (!newCellElement) {
            newCellElement = options.blockElement.querySelector(`.av__row[data-id="${options.resetData.selectCellId.rowId}"] .av__cell[data-col-id="${options.resetData.selectCellId.colId}"]`);
        }
        if (newCellElement) {
            newCellElement.classList.add("av__cell--select");
            cellScrollIntoView(options.blockElement, newCellElement);
        }
        const avMaskElement = document.querySelector(".av__mask");
        const avPanelElement = document.querySelector(".av__panel");
        if (avMaskElement) {
            (avMaskElement.querySelector("textarea, input") as HTMLTextAreaElement)?.focus();
        } else if (!avPanelElement && !options.resetData.isSearching && getSelection().rangeCount > 0) {
            const range = getSelection().getRangeAt(0);
            const blockElement = hasClosestBlock(range.startContainer);
            if (blockElement && options.blockElement === blockElement) {
                focusBlock(options.blockElement);
            }
        } else if (avPanelElement && !newCellElement) {
            avPanelElement.remove();
        }
    }
    options.resetData.selectRowIds.forEach((selectRowId, index) => {
        let rowElement = options.blockElement.querySelector(`.av__body[data-group-id="${selectRowId.groupId}"] .av__row[data-id="${selectRowId.rowId}"]`) as HTMLElement;
        if (!rowElement) {
            rowElement = options.blockElement.querySelector(`.av__row[data-id="${selectRowId.rowId}"]`) as HTMLElement;
        }
        if (rowElement) {
            rowElement.classList.add("av__row--select");
            rowElement.querySelector(".av__firstcol use").setAttribute("xlink:href", "#iconCheck");
        }
        if (index === options.resetData.selectRowIds.length - 1 && rowElement) {
            updateHeader(rowElement);
        }
    });
    Object.keys(options.resetData.pageSizes).forEach((groupId) => {
        const bodyElement = options.blockElement.querySelector(`.av__body[data-group-id="${groupId === "unGroup" ? "" : groupId}"]`) as HTMLElement;
        if (bodyElement) {
            bodyElement.dataset.pageSize = options.resetData.pageSizes[groupId];
        }
    });
    if (options.resetData.dragFillId) {
        let dragCellElement = options.blockElement.querySelector(`.av__body[data-group-id="${options.resetData.dragFillId.groupId}"] .av__row[data-id="${options.resetData.dragFillId.rowId}"] .av__cell[data-col-id="${options.resetData.dragFillId.colId}"]`);
        if (!dragCellElement) {
            dragCellElement = options.blockElement.querySelector(`.av__row[data-id="${options.resetData.dragFillId.rowId}"] .av__cell[data-col-id="${options.resetData.dragFillId.colId}"]`);
        }
        addDragFill(dragCellElement);
    }
    options.resetData.activeIds.forEach(activeId => {
        let activeCellElement = options.blockElement.querySelector(`.av__body[data-group-id="${activeId.groupId}"] .av__row[data-id="${activeId.rowId}"] .av__cell[data-col-id="${activeId.colId}"]`);
        if (!activeCellElement) {
            activeCellElement = options.blockElement.querySelector(`.av__row[data-id="${activeId.rowId}"] .av__cell[data-col-id="${activeId.colId}"]`);
        }
        activeCellElement?.classList.add("av__cell--active");
    });
    if (getSelection().rangeCount > 0) {
        // 修改表头后光标重新定位
        const range = getSelection().getRangeAt(0);
        if (!hasClosestByClassName(range.startContainer, "av__title")) {
            const blockElement = hasClosestBlock(range.startContainer);
            if (blockElement && options.blockElement === blockElement && !options.resetData.isSearching) {
                focusBlock(options.blockElement);
            }
        }
    }
    options.blockElement.querySelector(".layout-tab-bar").scrollLeft = (options.blockElement.querySelector(".layout-tab-bar .item--focus") as HTMLElement).offsetLeft - 30;
    if (options.cb) {
        options.cb(options.data);
    }
    if (!options.renderAll) {
        return;
    }
    const viewsElement = options.blockElement.querySelector(".av__views") as HTMLElement;
    const searchInputElement = options.blockElement.querySelector('[data-type="av-search"]') as HTMLElement;
    searchInputElement.textContent = options.resetData.query || "";
    if (options.resetData.isSearching) {
        searchInputElement.focus();
    }
    searchInputElement.addEventListener("compositionstart", (event: KeyboardEvent) => {
        event.stopPropagation();
    });
    searchInputElement.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.isComposing) {
            return;
        }
        electronUndo(event);
    });
    searchInputElement.addEventListener("input", (event: KeyboardEvent) => {
        event.stopPropagation();
        if (event.isComposing) {
            return;
        }
        if (searchInputElement.textContent || document.activeElement === searchInputElement) {
            viewsElement.classList.add("av__views--show");
        } else {
            viewsElement.classList.remove("av__views--show");
        }
        updateSearch(options.blockElement, options.protyle);
    });
    searchInputElement.addEventListener("compositionend", () => {
        updateSearch(options.blockElement, options.protyle);
    });
    searchInputElement.addEventListener("blur", (event: KeyboardEvent) => {
        if (event.isComposing) {
            return;
        }
        if (!searchInputElement.textContent) {
            viewsElement.classList.remove("av__views--show");
            searchInputElement.style.width = "0";
            searchInputElement.style.paddingLeft = "0";
            searchInputElement.style.marginRight = "0";
        }
    });
    addClearButton({
        inputElement: searchInputElement,
        right: 0,
        width: "1em",
        height: searchInputElement.clientHeight,
        clearCB() {
            viewsElement.classList.remove("av__views--show");
            searchInputElement.style.width = "0";
            searchInputElement.style.paddingLeft = "0";
            searchInputElement.style.marginRight = "0";
            focusBlock(options.blockElement);
            updateSearch(options.blockElement, options.protyle);
            /// #if MOBILE
            activeBlur();
            /// #endif
        }
    });
};

export const avRender = async (element: Element, protyle: IProtyle, cb?: (data: IAV) => void, renderAll = true, avData?: IAV) => {
    const renderGalleryView = async (options: {
        blockElement: HTMLElement,
        protyle: IProtyle,
        cb?: (data: IAV) => void,
        renderAll: boolean,
        data?: IAV,
    }) => {
        const {renderGallery} = await import("./gallery/render");
        await renderGallery(options);
    };
    const renderKanbanView = async (options: {
        blockElement: HTMLElement,
        protyle: IProtyle,
        cb?: (data: IAV) => void,
        renderAll: boolean,
        data?: IAV,
    }) => {
        const {renderKanban} = await import("./kanban/render");
        await renderKanban(options);
    };
    let avElements: Element[] = [];
    if (element.getAttribute("data-type") === "NodeAttributeView") {
        avElements = [element];
    } else {
        avElements = Array.from(element.querySelectorAll('[data-type="NodeAttributeView"]'));
    }
    if (avElements.length === 0) {
        return;
    }
    for (let i = 0; i < avElements.length; i++) {
        const e = avElements[i] as HTMLElement;
        e.removeAttribute("data-rendering");
        if (e.getAttribute("data-render") === "true" || hasClosestByClassName(e, "av__gallery-content")) {
            continue;
        }
        if (isMobile() || isInMobileApp()) {
            e.classList.add("av--touch");
        }

        if (e.getAttribute("data-av-type") === "gallery") {
            await renderGalleryView({blockElement: e, protyle, cb, renderAll});
            continue;
        }
        if (e.getAttribute("data-av-type") === "kanban") {
            await renderKanbanView({blockElement: e, protyle, cb, renderAll});
            continue;
        }

        let selectCellId;
        const selectCellElement = e.querySelector(".av__cell--select") as HTMLElement;
        if (selectCellElement) {
            selectCellId = {
                groupId: (hasClosestByClassName(selectCellElement, "av__body") as HTMLElement).dataset.groupId || "",
                rowId: (hasClosestByClassName(selectCellElement, "av__row") as HTMLElement).dataset.id,
                colId: selectCellElement.getAttribute("data-col-id"),
            };
        }
        const selectRowIds: IIds[] = [];
        e.querySelectorAll(".av__row--select").forEach(rowItem => {
            const rowId = rowItem.getAttribute("data-id");
            if (rowId) {
                selectRowIds.push({
                    groupId: (hasClosestByClassName(rowItem, "av__body") as HTMLElement).dataset.groupId || "",
                    rowId
                });
            }
        });
        let dragFillId;
        const dragFillElement = e.querySelector(".av__drag-fill") as HTMLElement;
        if (dragFillElement) {
            dragFillId = {
                groupId: (hasClosestByClassName(dragFillElement, "av__body") as HTMLElement).dataset.groupId || "",
                rowId: (hasClosestByClassName(dragFillElement, "av__row") as HTMLElement).dataset.id,
                colId: dragFillElement.parentElement.getAttribute("data-col-id"),
            };
        }
        const activeIds: IIds[] = [];
        e.querySelectorAll(".av__cell--active").forEach((item) => {
            activeIds.push({
                groupId: (hasClosestByClassName(item, "av__body") as HTMLElement).dataset.groupId || "",
                rowId: (hasClosestByClassName(item, "av__row") as HTMLElement).dataset.id,
                colId: item.getAttribute("data-col-id"),
            });
        });
        const searchInputElement = e.querySelector('[data-type="av-search"]') as HTMLInputElement;
        const pageSizes: { [key: string]: string } = {};
        e.querySelectorAll(".av__body").forEach((item: HTMLElement) => {
            pageSizes[item.dataset.groupId || "unGroup"] = item.dataset.pageSize;
        });
        const headerTransformElement = e.querySelector('.av__row--header[style^="transform"]') as HTMLElement;
        const footerTransformElement = e.querySelector('.av__row--footer[style^="transform"]') as HTMLElement;
        const resetData = {
            selectCellId,
            alignSelf: e.style.alignSelf,
            left: e.querySelector(".av__scroll")?.scrollLeft || 0,
            headerTransform: headerTransformElement ? {
                groupId: headerTransformElement.parentElement.getAttribute("data-group-id"),
                transform: headerTransformElement.style.transform
            } : null,
            footerTransform: footerTransformElement ? {
                groupId: footerTransformElement.parentElement.getAttribute("data-group-id"),
                transform: footerTransformElement.style.transform
            } : null,
            isSearching: searchInputElement && document.activeElement === searchInputElement,
            selectRowIds,
            dragFillId,
            activeIds,
            query: searchInputElement?.textContent || "",
            pageSizes
        };
        if (e.firstElementChild.innerHTML === "") {
            e.style.alignSelf = "";
            let html = "";
            [1, 2, 3].forEach(() => {
                html += `<div class="av__row">
    <div style="width: 24px;flex-shrink: 0"></div>
    <div class="av__cell" style="width: 200px"><span class="av__pulse"></span></div>
    <div class="av__cell" style="width: 200px"><span class="av__pulse"></span></div>
    <div class="av__cell" style="width: 200px"><span class="av__pulse"></span></div>
    <div class="av__cell" style="width: 200px"><span class="av__pulse"></span></div>
</div>`;
            });
            e.firstElementChild.innerHTML = html;
        }
        const avPageSize = getPageSize(e);
        let data: IAV;
        if (!avData) {
            const created = protyle.options.history?.created;
            const snapshot = protyle.options.history?.snapshot;
            const response = await fetchSyncPost(created ? "/api/av/renderHistoryAttributeView" : (snapshot ? "/api/av/renderSnapshotAttributeView" : "/api/av/renderAttributeView"), {
                id: e.getAttribute("data-av-id"),
                created,
                snapshot,
                pageSize: avPageSize.unGroupPageSize,
                groupPaging: avPageSize.groupPageSize,
                viewID: getAVViewAttr(e) || "",
                query: resetData.query.trim(),
                blockID: e.getAttribute("data-node-id"),
                createIfNotExist: !protyle.block.action?.includes(Constants.CB_GET_AV_NO_CREATE),
            });
            data = response.data;
        } else {
            data = avData;
        }
        if (data.viewType === "gallery") {
            e.setAttribute("data-av-type", data.viewType);
            await renderGalleryView({blockElement: e, protyle, cb, renderAll, data});
            continue;
        }
        if (data.viewType === "kanban") {
            e.setAttribute("data-av-type", data.viewType);
            await renderKanbanView({blockElement: e, protyle, cb, renderAll, data});
            continue;
        }
        const view = data.view as IAVTable;
        if (view.groups?.length > 0) {
            renderGroupTable({blockElement: e, protyle, cb, renderAll, data, resetData});
            continue;
        }
        const avBodyHTML = `<div class="av__body" data-group-id="" data-page-size="${view.pageSize}" style="float: left">
    ${getTableHTMLs(view, e)}
</div>`;
        if (renderAll) {
            e.firstElementChild.outerHTML = `<div class="av__container">
    ${genTabHeaderHTML(data, resetData.isSearching || !!resetData.query, !protyle.disabled && !hasClosestByAttribute(e, "data-type", "NodeBlockQueryEmbed"))}
    <div class="av__scroll">
        ${avBodyHTML}
    </div>
    <div class="av__cursor" contenteditable="true">${Constants.ZWSP}</div>
</div>`;
        } else {
            e.firstElementChild.querySelector(".av__scroll").innerHTML = avBodyHTML;
        }
        afterRenderTable({
            renderAll,
            data,
            cb,
            protyle,
            blockElement: e,
            resetData
        });
        // 历史兼容
        e.style.margin = "";
    }
};

let searchTimeout: number;

export const updateSearch = (e: HTMLElement, protyle: IProtyle) => {
    clearTimeout(searchTimeout);
    searchTimeout = window.setTimeout(() => {
        e.removeAttribute("data-render");
        avRender(e, protyle, undefined, false);
    }, Constants.TIMEOUT_INPUT);
};
