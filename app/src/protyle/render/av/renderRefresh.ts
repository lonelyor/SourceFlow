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

interface IIds {
    groupId: string,
    rowId: string,
    colId?: string
}

interface ITableOptions {
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

import {avRender} from "./renderTable";

const refreshTimeouts: {
    [key: string]: number;
} = {};

const getAVElements = (protyle: IProtyle, avID: string, viewID?: string): HTMLElement[] => {
    const elements = Array.from(protyle.wysiwyg.element.querySelectorAll(`.av[data-av-id="${avID}"]`)) as HTMLElement[];
    if (viewID) {
        return elements.filter((item) => getViewIDByAVElement(item) === viewID);
    }
    return elements;
};

const getViewIDByAVElement = (avElement: HTMLElement): string | null => {
    return getAVViewAttr(avElement)
        || avElement.querySelector(".layout-tab-bar .item--focus")?.getAttribute("data-id") // 旧版本的数据库块没有兼容属性，所以在视图元素上获取 viewID
        || null;
};

export const refreshAV = (protyle: IProtyle, operation: IOperation) => {
    if (operation.action === "setAttrViewName") {
        getAVElements(protyle, operation.id).forEach((item) => {
            const titleElement = item.querySelector(".av__title") as HTMLElement;
            if (!titleElement) {
                return;
            }
            titleElement.textContent = operation.data;
            titleElement.dataset.title = operation.data;
        });
        return;
    }
    if (operation.action === "setAttrViewColWidth") {
        getAVElements(protyle, operation.avID, operation.viewID).forEach((item) => {
            const cellElement = item.querySelector(`.av__cell[data-col-id="${operation.id}"]`) as HTMLElement;
            if (!cellElement || cellElement.style.width === operation.data) {
                return;
            }
            item.querySelectorAll(".av__row").forEach(rowItem => {
                (rowItem.querySelector(`[data-col-id="${operation.id}"]`) as HTMLElement).style.width = operation.data;
            });
        });
        return;
    }
    if (operation.action === "setAttrViewCardSize") {
        getAVElements(protyle, operation.avID, operation.viewID).forEach((item) => {
            if (item.getAttribute("data-av-type") === "kanban") {
                item.querySelectorAll(".av__kanban-group").forEach(galleryItem => {
                    galleryItem.classList.remove("av__kanban-group--small", "av__kanban-group--big");
                    if (operation.data === 0) {
                        galleryItem.classList.add("av__kanban-group--small");
                    } else if (operation.data === 2) {
                        galleryItem.classList.add("av__kanban-group--big");
                    }
                });
            } else {
                item.querySelectorAll(".av__gallery").forEach(galleryItem => {
                    galleryItem.classList.remove("av__gallery--small", "av__gallery--big");
                    if (operation.data === 0) {
                        galleryItem.classList.add("av__gallery--small");
                    } else if (operation.data === 2) {
                        galleryItem.classList.add("av__gallery--big");
                    }
                });
            }
        });
        return;
    }
    if (operation.action === "setAttrViewCardAspectRatio") {
        getAVElements(protyle, operation.avID, operation.viewID).forEach((item) => {
            item.querySelectorAll(".av__gallery-cover").forEach(coverItem => {
                coverItem.className = "av__gallery-cover av__gallery-cover--" + operation.data;
            });
        });
        return;
    }
    if (operation.action === "hideAttrViewName") {
        getAVElements(protyle, operation.avID, operation.viewID).forEach((item) => {
            const titleElement = item.querySelector(".av__title");
            if (titleElement) {
                if (!operation.data) {
                    titleElement.classList.remove("fn__none");
                } else {
                    // hide
                    titleElement.classList.add("fn__none");
                }
                if (item.getAttribute("data-av-type") === "gallery" && !item.querySelector(".av__group-title")) {
                    const galleryElement = item.querySelector(".av__gallery");
                    if (!operation.data) {
                        galleryElement.classList.remove("av__gallery--top");
                    } else {
                        // hide
                        galleryElement.classList.add("av__gallery--top");
                    }
                }
            }
        });
        return;
    }
    if (operation.action === "setAttrViewWrapField") {
        getAVElements(protyle, operation.avID, operation.viewID).forEach((item) => {
            item.querySelectorAll(".av__cell").forEach(fieldItem => {
                fieldItem.setAttribute("data-wrap", operation.data.toString());
            });
        });
        return;
    }
    if (operation.action === "setAttrViewFillColBackgroundColor") {
        getAVElements(protyle, operation.avID, operation.viewID).forEach((avItem: HTMLElement) => {
            const hasSelect = avItem.querySelector(".av__group-title .b3-chip");
            const kanbanElement = avItem.querySelector(".av__kanban");
            if (operation.data && hasSelect) {
                kanbanElement.classList.add("av__kanban--bg");
            } else {
                kanbanElement.classList.remove("av__kanban--bg");
            }
            avItem.querySelectorAll(".av__kanban-group").forEach(item => {
                if (operation.data && hasSelect) {
                    const nameElement = item.querySelector(".av__group-title .b3-chip") as HTMLElement;
                    if (nameElement) {
                        item.setAttribute("style", `--b3-av-kanban-background:var(--b3-font-background${nameElement.style.backgroundColor.slice(-2, -1)})`);
                    } else {
                        item.setAttribute("style", "--b3-av-kanban-background: var(--b3-border-color)");
                    }
                } else {
                    item.removeAttribute("style");
                }
            });
        });
        return;
    }
    if (operation.action === "setAttrViewFitImage") {
        getAVElements(protyle, operation.avID, operation.viewID).forEach((item) => {
            const imgElement = item.querySelector(".av__gallery-img");
            if (operation.data) {
                imgElement.classList.add("av__gallery-img--fit");
            } else {
                imgElement.classList.remove("av__gallery-img--fit");
            }
        });
        return;
    }
    if (operation.action === "setAttrViewShowIcon") {
        getAVElements(protyle, operation.avID, operation.viewID).forEach((item) => {
            item.querySelectorAll('.av__cell[data-dtype="block"] .b3-menu__avemoji, .av__cell[data-dtype="relation"] .b3-menu__avemoji').forEach(cellItem => {
                if (operation.data) {
                    cellItem.classList.remove("fn__none");
                } else {
                    cellItem.classList.add("fn__none");
                }
            });
        });
        return;
    }
    if (operation.action === "setAttrViewColWrap") {
        getAVElements(protyle, operation.avID, operation.viewID).forEach((item) => {
            item.querySelectorAll(`.av__cell[data-col-id="${operation.id}"],.av__cell[data-field-id="${operation.id}"]`).forEach(cellItem => {
                cellItem.setAttribute("data-wrap", operation.data.toString());
            });
        });
        return;
    }
    if (operation.action === "foldAttrViewGroup") {
        getAVElements(protyle, operation.avID).forEach((item) => {
            const foldElement = item.querySelector(`[data-type="av-group-fold"][data-id="${operation.id}"]`);
            if (foldElement) {
                if (foldElement.getAttribute("data-processed") === "true") {
                    foldElement.removeAttribute("data-processed");
                    return;
                }
                if (operation.data) {
                    foldElement.firstElementChild.classList.remove("av__group-arrow--open");
                    foldElement.parentElement.nextElementSibling.classList.add("fn__none");
                } else {
                    foldElement.firstElementChild.classList.add("av__group-arrow--open");
                    foldElement.parentElement.nextElementSibling.classList.remove("fn__none");
                }
                foldElement.removeAttribute("data-folding");
            }
        });
        return;
    }
    // 只能 setTimeout，以前方案快速输入后最后一次修改会被忽略；必须为每一个 protyle 单独设置，否则有多个 protyle 时，其余无法被执行
    clearTimeout(refreshTimeouts[protyle.id]);
    refreshTimeouts[protyle.id] = window.setTimeout(() => {
        // 修改表格名 avID 传入到 id 上了 https://github.com/lonelyor/SourceFlow/issues/12724
        const avID = operation.action === "setAttrViewName" ? operation.id : operation.avID;
        const attrElement = document.querySelector(`.b3-dialog--open[data-key="${Constants.DIALOG_ATTR}"] .custom-attr > [data-av-id="${avID}"]`) as HTMLElement;
        if (attrElement) {
            // 更新属性面板
            attrElement.removeAttribute("data-rendering");
            renderAVAttribute(attrElement.parentElement, attrElement.dataset.nodeId, protyle);
        }
        getAVElements(protyle, avID).forEach((item) => {
            item.removeAttribute("data-render");
            if (operation.action === "sortAttrViewRow") {
                clearSelect(["cell"], item);
            } else if (operation.action === "sortAttrViewCol") {
                item.querySelectorAll(".av__cell--active").forEach((item) => {
                    item.classList.remove("av__cell--active");
                    item.querySelector(".av__drag-fill")?.remove();
                });
                addDragFill(item.querySelector(".av__cell--select"));
            } else if (operation.action === "setAttrViewBlockView") {
                const viewTabElement = item.querySelector(`.av__views > .layout-tab-bar > .item[data-id="${operation.id}"]`) as HTMLElement;
                if (viewTabElement) {
                    item.querySelectorAll(".av__body").forEach((bodyItem: HTMLElement) => {
                        bodyItem.dataset.pageSize = viewTabElement.dataset.page;
                    });
                }
            } else if (operation.action === "addAttrViewView") {
                item.querySelectorAll(".av__body").forEach((bodyItem: HTMLElement) => {
                    bodyItem.dataset.pageSize = "50";
                });
            } else if (operation.action === "removeAttrViewView") {
                item.querySelectorAll(".av__body").forEach((bodyItem: HTMLElement) => {
                    bodyItem.dataset.pageSize = item.querySelector(`.av__views > .layout-tab-bar .item[data-id="${getViewIDByAVElement(item)}"]`)?.getAttribute("data-page");
                });
            } else if (operation.action === "sortAttrViewView" && operation.data === "unRefresh") {
                const viewTabElement = item.querySelector(`.av__views > .layout-tab-bar > .item[data-id="${operation.id}"]`) as HTMLElement;
                if (viewTabElement && !operation.previousID && !viewTabElement.previousElementSibling) {
                    return;
                } else if (viewTabElement && operation.previousID && viewTabElement.previousElementSibling?.getAttribute("data-id") === operation.previousID) {
                    return;
                }
            }
            const hasGhost = item.querySelector('[data-type="ghost"]');
            avRender(item, protyle, () => {
                if (operation.action === "insertAttrViewBlock" && operation.context?.ignoreTip !== "true") {
                    if (operation.context?.message) {
                        showMessage(operation.context.message);
                    } else {
                        const groupQuery = operation.groupID ? `[data-group-id="${operation.groupID}"]` : "";
                        if (["gallery", "kanban"].includes(item.getAttribute("data-av-type"))) {
                            operation.srcs.forEach(srcItem => {
                                const filesElement = item.querySelector(`.av__body${groupQuery} .av__gallery-item[data-id="${srcItem.itemID}"]`)?.querySelector(".av__gallery-fields");
                                if (filesElement && filesElement.querySelector('[data-dtype="block"]')?.parentElement.getAttribute("data-empty") === "true") {
                                    filesElement.classList.add("av__gallery-fields--edit");
                                }
                            });
                        }
                        if (operation.srcs.length === 1) {
                            let popCellElement = item.querySelector(`.av__body${groupQuery} [data-id="${operation.srcs[0].itemID}"] .av__cell[data-dtype="block"]`) as HTMLElement;
                            if (!popCellElement) {
                                const popCellElements = item.querySelectorAll(`.av__body [data-id="${operation.srcs[0].itemID}"] .av__cell[data-dtype="block"]`);
                                if (popCellElements.length === 1) {
                                    popCellElement = popCellElements[0] as HTMLElement;
                                }
                            }
                            if (popCellElement && popCellElement.getAttribute("data-detached") === "true" &&
                                popCellElement.querySelector(".av__celltext").textContent === "" &&
                                popCellElement.getBoundingClientRect().height !== 0 && hasGhost) {
                                popTextCell(protyle, [popCellElement], "block");
                            }
                        }
                        operation.srcs.find((srcItem) => {
                            if (!item.querySelector(`.av__body [data-id="${srcItem.itemID}"]`) &&
                                !item.querySelector(`.av__body [data-dtype="block"] .av__celltext--ref[data-id="${srcItem.id}"]`)) {
                                showMessage(window.sourceflow.languages.insertRowTip);
                                return true;
                            }
                        });
                    }
                } else if (operation.action === "addAttrViewView") {
                    if (item.getAttribute("data-node-id") === operation.blockID) {
                        openMenuPanel({protyle, blockElement: item, type: "config"});
                    }
                }
                item.removeAttribute("data-loading");
            });
        });
    }, ["insertAttrViewBlock"].includes(operation.action) ? 2 : 100);
};
