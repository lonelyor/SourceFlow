import {Constants} from "../../../constants";
import {fetchPost} from "../../../util/fetch";
import {getAVViewAttr} from "../../../util/attrCompat";
import {isMobile} from "../../../util/functions";
import {setPosition} from "../../../util/setPosition";
import {hasClosestByClassName} from "../../util/hasClosest";
import {bindDateEvent, getDateHTML} from "./date";
import {bindLayoutEvent, getLayoutHTML} from "./layout";
import {bindAVPanelClick} from "./panelClick";
import {bindAVPanelDrag} from "./panelDrag";
import type {AVPanelOpenOptions, AVPanelState} from "./panelTypes";
import {bindAssetEvent, getAssetHTML} from "./asset";
import {bindEditEvent, getColId, getEditHTML} from "./col";
import {getFiltersHTML} from "./filter";
import {getPageSize} from "./groups";
import {getPropertiesHTML} from "./propertiesMenu";
import {bindRelationEvent, getRelationHTML} from "./relation";
import {getFieldIdByCellElement, setPageSize} from "./row";
import {bindRollupData, getRollupHTML} from "./rollup";
import {bindSelectEvent, getSelectHTML} from "./select";
import {bindSortsEvent, getSortsHTML} from "./sort";
import {
    addView,
    bindSwitcherEvent,
    bindViewEvent,
    getFieldsByData,
    getSwitcherHTML,
    getViewHTML,
    openViewMenu
} from "./view";

const getInitialPanelHTML = (options: AVPanelOpenOptions, data: IAV, fields: IAVColumn[], isCustomAttr: boolean) => {
    if (options.type === "config") {
        return getViewHTML(data);
    }
    if (options.type === "properties") {
        return getPropertiesHTML(fields);
    }
    if (options.type === "sorts") {
        return getSortsHTML(fields, data.view.sorts);
    }
    if (options.type === "switcher") {
        return getSwitcherHTML(data.views, data.viewID);
    }
    if (options.type === "filters") {
        return getFiltersHTML(data);
    }
    if (options.type === "select") {
        return getSelectHTML(fields, options.cellElements, true, options.blockElement);
    }
    if (options.type === "asset") {
        return getAssetHTML(options.cellElements);
    }
    if (options.type === "edit") {
        return getEditHTML({protyle: options.protyle, data, colId: options.colId, isCustomAttr});
    }
    if (options.type === "date") {
        return getDateHTML(options.cellElements);
    }
    if (options.type === "rollup") {
        return `<div class="b3-menu__items">${getRollupHTML({data, cellElements: options.cellElements})}</div>`;
    }
    if (options.type === "relation") {
        return getRelationHTML(data, options.cellElements);
    }
    return getLayoutHTML(data);
};

const normalizeEditFields = (options: AVPanelOpenOptions, data: IAV, fields: IAVColumn[]) => {
    if (options.type !== "edit" || !options.editData) {
        return fields;
    }
    if (typeof options.editData.colData.wrap === "undefined") {
        options.editData.colData.wrap = data.view.wrapField;
    }
    if (options.editData.previousID) {
        fields.find((item, index) => {
            if (item.id === options.editData.previousID) {
                fields.splice(index + 1, 0, options.editData.colData);
                return true;
            }
        });
    } else if (data.viewType === "table") {
        fields.splice(0, 0, options.editData.colData);
    } else {
        fields.push(options.editData.colData);
    }
    return fields;
};

const bindCellScopedPanel = (options: AVPanelOpenOptions, state: AVPanelState, menuElement: HTMLElement) => {
    let closeCB: () => void;
    let lastElement = options.cellElements[options.cellElements.length - 1];
    if (!options.blockElement.contains(lastElement)) {
        const rowID = getFieldIdByCellElement(lastElement, state.data.viewType);
        if (state.data.viewType === "table") {
            lastElement = options.blockElement.querySelector(`.av__row[data-id="${rowID}"] .av__cell[data-col-id="${lastElement.dataset.colId}"]`);
        } else {
            lastElement = options.blockElement.querySelector(`.av__gallery-item[data-id="${rowID}"] .av__cell[data-field-id="${lastElement.dataset.fieldId}"]`);
        }
    }
    const cellRect = (lastElement || options.cellElements[options.cellElements.length - 1]).getBoundingClientRect();
    if (options.type === "select") {
        bindSelectEvent(options.protyle, state.data, menuElement, options.cellElements, options.blockElement);
    } else if (options.type === "date") {
        closeCB = bindDateEvent({
            protyle: options.protyle,
            data: state.data,
            menuElement,
            cellElements: options.cellElements,
            blockElement: options.blockElement
        });
    } else if (options.type === "asset") {
        bindAssetEvent({
            protyle: options.protyle,
            menuElement,
            cellElements: options.cellElements,
            blockElement: options.blockElement
        });
        setTimeout(() => {
            setPosition(menuElement, cellRect.left, cellRect.bottom, cellRect.height);
        }, Constants.TIMEOUT_LOAD);
    } else if (options.type === "relation") {
        bindRelationEvent({
            menuElement,
            cellElements: options.cellElements,
            protyle: options.protyle,
            blockElement: options.blockElement
        });
    } else if (options.type === "rollup") {
        bindRollupData({protyle: options.protyle, data: state.data, menuElement});
    }
    if (["select", "date", "relation", "rollup"].includes(options.type)) {
        const inputElement = menuElement.querySelector("input");
        if (inputElement) {
            inputElement.select();
            inputElement.focus();
        }
        setPosition(menuElement, cellRect.left, cellRect.bottom, cellRect.height);
    }
    state.closeCB = closeCB;
};

const bindViewScopedPanel = (options: AVPanelOpenOptions, state: AVPanelState, menuElement: HTMLElement, blockID: string, isCustomAttr: boolean) => {
    setPosition(menuElement, state.tabRect.right - menuElement.clientWidth, state.tabRect.bottom, state.tabRect.height);
    if (options.type === "sorts") {
        bindSortsEvent(options.protyle, menuElement, state.data, blockID);
    } else if (options.type === "edit") {
        bindEditEvent({protyle: options.protyle, data: state.data, menuElement, isCustomAttr, blockID});
    } else if (options.type === "config") {
        bindViewEvent({protyle: options.protyle, data: state.data, menuElement, blockElement: options.blockElement});
    } else if (options.type === "switcher") {
        bindSwitcherEvent({protyle: options.protyle, menuElement, blockElement: options.blockElement});
    }
};

export const openMenuPanel = (options: AVPanelOpenOptions) => {
    let avPanelElement = document.querySelector(".av__panel");
    if (avPanelElement) {
        avPanelElement.remove();
        return;
    }
    const avID = options.blockElement.getAttribute("data-av-id");
    const avPageSize = getPageSize(options.blockElement);
    fetchPost("/api/av/renderAttributeView", {
        id: avID,
        query: options.blockElement.querySelector('[data-type="av-search"]')?.textContent.trim() || "",
        pageSize: avPageSize.unGroupPageSize,
        groupPaging: avPageSize.groupPageSize,
        viewID: getAVViewAttr(options.blockElement)
    }, (response) => {
        avPanelElement = document.querySelector(".av__panel");
        if (avPanelElement) {
            avPanelElement.remove();
            return;
        }
        window.sourceflow.menus.menu.remove();
        const blockID = options.blockElement.getAttribute("data-node-id");
        const isCustomAttr = !options.blockElement.classList.contains("av");
        const data = response.data as IAV;
        const fields = normalizeEditFields(options, data, getFieldsByData(data));
        const html = getInitialPanelHTML(options, data, fields, isCustomAttr);
        if (options.type === "relation" && !html) {
            openMenuPanel({
                protyle: options.protyle,
                blockElement: options.blockElement,
                type: "edit",
                colId: getColId(options.cellElements[0], data.viewType)
            });
            return;
        }

        document.body.insertAdjacentHTML("beforeend", `<div class="av__panel" style="z-index: ${++window.sourceflow.zIndex};">
    <div class="b3-dialog__scrim" data-type="close"></div>
    <div class="b3-menu" ${["select", "date", "asset", "relation", "rollup"].includes(options.type) ? `style="${["select", "asset", "relation"].includes(options.type) ? "max-height: calc(100vh - 32px);display: flex;flex-direction: column;" : ""}min-width: 200px;${isMobile() ? "max-width: 90vw;" : "max-width: 50vw;"}"` : ""}>${html}</div>
</div>`);
        avPanelElement = document.querySelector(".av__panel");
        const menuElement = avPanelElement.lastElementChild as HTMLElement;
        const state: AVPanelState = {
            data,
            fields,
            tabRect: options.blockElement.querySelector(`.av__views, .av__row[data-col-id="${options.colId}"] > .block__logo`)?.getBoundingClientRect()
        };
        if (["select", "date", "asset", "relation", "rollup"].includes(options.type)) {
            bindCellScopedPanel(options, state, menuElement);
        } else {
            bindViewScopedPanel(options, state, menuElement, blockID, isCustomAttr);
        }
        options.cb?.(avPanelElement);
        bindAVPanelDrag({options, avPanelElement, menuElement, state, avID, blockID, isCustomAttr});
        avPanelElement.addEventListener("mousedown", (event: MouseEvent & { target: HTMLElement }) => {
            if (event.button === 1 && !hasClosestByClassName(event.target, "b3-menu")) {
                document.querySelector(".av__panel").dispatchEvent(new CustomEvent("click", {detail: "close"}));
            }
        });
        bindAVPanelClick({options, avPanelElement, menuElement, state, avID, blockID, isCustomAttr});
    });
};
