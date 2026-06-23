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
import {updateCellsValue} from "./cellMutation";
import {getTypeByCellElement} from "./cellValue";

export const cellScrollIntoView = (blockElement: HTMLElement, cellElement: Element, onlyHeight = true) => {
    const cellRect = cellElement.getBoundingClientRect();
    if (!onlyHeight) {
        const avScrollElement = blockElement.querySelector(".av__scroll");
        const rowElement = hasClosestByClassName(cellElement, "av__row");
        if (avScrollElement && rowElement) {
            const stickyElement = rowElement.querySelector(".av__colsticky");
            if (!stickyElement.contains(cellElement)) { // https://github.com/lonelyor/SourceFlow/issues/12162
                const stickyRight = stickyElement.getBoundingClientRect().right;
                const avScrollRect = avScrollElement.getBoundingClientRect();
                if (stickyRight > cellRect.left || avScrollRect.right < cellRect.left) {
                    avScrollElement.scrollLeft = avScrollElement.scrollLeft + cellRect.left - stickyRight;
                } else if (stickyRight < cellRect.left && avScrollRect.right < cellRect.right) {
                    if (cellRect.width + stickyRight > avScrollRect.right) {
                        avScrollElement.scrollLeft = avScrollElement.scrollLeft + cellRect.left - stickyRight;
                    } else {
                        avScrollElement.scrollLeft = avScrollElement.scrollLeft + cellRect.right - avScrollRect.right;
                    }
                }
            }
        }
    }
    /// #if MOBILE
    const contentElement = hasClosestByClassName(blockElement, "protyle-content", true);
    if (contentElement && cellElement.getAttribute("data-dtype") !== "checkbox") {
        let keyboardToolbarTop = window.innerHeight / 2 - 48;
        if (window.sourceflow.mobile.size.isLandscape) {
            if (window.sourceflow.mobile.size.landscape.height1 !== window.sourceflow.mobile.size.landscape.height2) {
                keyboardToolbarTop = window.sourceflow.mobile.size.landscape.height2 - 48;
            }
        } else {
            if (window.sourceflow.mobile.size.portrait.height1 !== window.sourceflow.mobile.size.portrait.height2) {
                keyboardToolbarTop = window.sourceflow.mobile.size.portrait.height2 - 48;
            }
        }
        if (cellRect.bottom > keyboardToolbarTop) {
            contentElement.scrollTop = contentElement.scrollTop + (cellRect.bottom - keyboardToolbarTop);
        } else if (cellRect.top < 110) {
            contentElement.scrollTop -= 110 - cellRect.top;
        }
    }
    /// #else
    if (!blockElement.querySelector(".av__header")) {
        // 属性面板
        return;
    }
    const bodyElement = hasClosestByClassName(cellElement, "av__body");
    if (!bodyElement) {
        return;
    }
    const avHeaderRect = bodyElement.querySelector(".av__row--header").getBoundingClientRect();
    if (avHeaderRect.bottom > cellRect.top) {
        const contentElement = hasClosestByClassName(blockElement, "protyle-content", true);
        if (contentElement) {
            contentElement.scrollTop = contentElement.scrollTop + cellRect.top - avHeaderRect.bottom;
        }
    } else {
        const footerElement = bodyElement.querySelector(".av__row--footer");
        if (footerElement?.querySelector(".av__calc--ashow")) {
            const avFooterRect = footerElement.getBoundingClientRect();
            if (avFooterRect.top < cellRect.bottom) {
                const contentElement = hasClosestByClassName(blockElement, "protyle-content", true);
                if (contentElement) {
                    contentElement.scrollTop = contentElement.scrollTop + cellRect.bottom - avFooterRect.top;
                }
            }
        } else {
            const contentElement = hasClosestByClassName(blockElement, "protyle-content", true);
            if (contentElement) {
                const contentRect = contentElement.getBoundingClientRect();
                if (cellRect.bottom > contentRect.bottom) {
                    contentElement.scrollTop = contentElement.scrollTop + (cellRect.bottom - contentRect.bottom);
                }
            }
        }
    }
    /// #endif
};

export const popTextCell = (protyle: IProtyle, cellElements: HTMLElement[], type?: TAVCol) => {
    if (cellElements.length === 0 || (cellElements.length === 1 && !cellElements[0])) {
        return;
    }
    if (!type) {
        type = getTypeByCellElement(cellElements[0]);
    }
    if (type === "updated" || type === "created" || document.querySelector(".av__mask")) {
        return;
    }
    const blockElement = hasClosestBlock(cellElements[0]);
    if (!blockElement) {
        return;
    }
    const viewType = blockElement.getAttribute("data-av-type") as TAVView;
    let cellRect = cellElements[0].getBoundingClientRect();
    const contentElement = hasClosestByClassName(blockElement, "protyle-content", true);
    if (viewType === "table") {
        cellScrollIntoView(blockElement, cellElements[0], false);
    }
    cellRect = cellElements[0].getBoundingClientRect();
    let html = "";
    let height = cellRect.height;
    const cssStyle = getComputedStyle(cellElements[0]);
    let style = `font-family:${cssStyle.fontFamily};font-size:${cssStyle.fontSize};line-height:${cssStyle.lineHeight};padding:${cssStyle.padding};position:absolute;top: ${cellRect.top}px;`;
    if (contentElement) {
        const contentRect = contentElement.getBoundingClientRect();
        if (cellRect.bottom > contentRect.bottom) {
            height = contentRect.bottom - cellRect.top;
        }
        const width = Math.min(Math.max(cellRect.width, 25), contentRect.width);
        style = `style='height: ${height}px;width:${width}px;left: ${(cellRect.left < contentRect.left || cellRect.left + width > contentRect.right) ? contentRect.left : cellRect.left}px;${style}'`;
    } else {
        style = `style='height: ${height}px;width:${Math.max(cellRect.width, 25)}px;left: ${cellRect.left}px;${style}'`;
    }

    if (["text", "email", "phone", "block", "template"].includes(type)) {
        html = `<textarea ${style} spellcheck="false" class="b3-text-field"></textarea>`;
    } else if (type === "url") {
        html = `<textarea ${style} spellcheck="false" class="b3-text-field">${cellElements[0].firstElementChild.getAttribute("data-href")}</textarea>`;
    } else if (type === "number") {
        html = `<input type="number" spellcheck="false" value="${cellElements[0].firstElementChild.getAttribute("data-content")}" ${style} class="b3-text-field">`;
    } else {
        if (["select", "mSelect"].includes(type)) {
            if (blockElement.getAttribute("data-rendering") === "true") {
                return;
            }
            openMenuPanel({protyle, blockElement, type: "select", cellElements});
        } else if (type === "mAsset") {
            openMenuPanel({protyle, blockElement, type: "asset", cellElements});
            focusBlock(blockElement);
        } else if (type === "date") {
            openMenuPanel({protyle, blockElement, type: "date", cellElements});
        } else if (type === "checkbox") {
            updateCellValueByInput(protyle, type, blockElement, cellElements);
        } else if (type === "relation") {
            openMenuPanel({protyle, blockElement, type: "relation", cellElements});
        } else if (type === "rollup") {
            openMenuPanel({
                protyle,
                blockElement,
                type: "rollup",
                cellElements,
                colId: getColId(cellElements[0], viewType)
            });
        }
        if (viewType === "table" && !hasClosestByClassName(cellElements[0], "custom-attr")) {
            cellElements[0].classList.add("av__cell--select");
            addDragFill(cellElements[0]);
        }
        return;
    }
    window.sourceflow.menus.menu.remove();
    document.body.insertAdjacentHTML("beforeend", `<div class="av__mask" style="z-index: ${++window.sourceflow.zIndex}">
    ${html}
</div>`);
    const avMaskElement = document.querySelector(".av__mask");
    const inputElement = avMaskElement.querySelector(".b3-text-field") as HTMLInputElement;
    if (inputElement) {
        if (["text", "email", "phone", "block", "template"].includes(type)) {
            inputElement.value = cellElements[0].querySelector(".av__celltext")?.textContent || "";
        }
        inputElement.select();
        inputElement.focus();
        callMobileAppShowKeyboard();
        if (type === "template") {
            fetchPost("/api/av/renderAttributeView", {
                id: blockElement.dataset.avId,
                viewID: getAVViewAttr(blockElement)
            }, (response) => {
                getFieldsByData(response.data).find((item: IAVColumn) => {
                    if (item.id === getColId(cellElements[0], viewType)) {
                        inputElement.value = item.template;
                        inputElement.dataset.template = item.template;
                        return true;
                    }
                });
            });
        }
        if (type === "block") {
            inputElement.addEventListener("input", (event: InputEvent) => {
                if (Constants.BLOCK_HINT_KEYS.includes(inputElement.value.substring(0, 2))) {
                    protyle.toolbar.range = document.createRange();
                    if (cellElements[0] && !blockElement.contains(cellElements[0])) {
                        const rowID = getFieldIdByCellElement(cellElements[0], viewType);
                        if (viewType === "table") {
                            cellElements[0] = (blockElement.querySelector(`.av__row[data-id="${rowID}"] .av__cell[data-col-id="${cellElements[0].dataset.colId}"]`)) as HTMLElement;
                        } else {
                            cellElements[0] = (blockElement.querySelector(`.av__gallery-item[data-id="${rowID}"] .av__cell[data-field-id="${cellElements[0].dataset.fieldId}"]`)) as HTMLElement;
                        }
                    }
                    protyle.toolbar.range.selectNodeContents(cellElements[0].lastChild);
                    focusByRange(protyle.toolbar.range);
                    if (viewType === "table") {
                        cellElements[0].classList.add("av__cell--select");
                        addDragFill(cellElements[0]);
                    }
                    let textPlain = inputElement.value;
                    if (isDynamicRef(textPlain)) {
                        textPlain = textPlain.substring(2, 22 + 2);
                    } else {
                        textPlain = textPlain.substring(2);
                    }
                    void import("../../hint/extend").then(({hintRef}) => {
                        hintRef(textPlain, protyle, "av");
                    });
                    avMaskElement?.remove();
                    event.preventDefault();
                    event.stopPropagation();
                }
            });
        }
        inputElement.addEventListener("keydown", (event) => {
            if (event.isComposing) {
                return;
            }
            if (electronUndo(event)) {
                return;
            }
            if (event.key === "Escape" || event.key === "Tab" ||
                (event.key === "Enter" && !event.shiftKey && isNotCtrl(event))) {
                updateCellValueByInput(protyle, type, blockElement, cellElements);
                if (event.key === "Tab") {
                    protyle.wysiwyg.element.dispatchEvent(new KeyboardEvent("keydown", {
                        shiftKey: event.shiftKey,
                        ctrlKey: event.ctrlKey,
                        altKey: event.altKey,
                        metaKey: event.metaKey,
                        key: "Tab",
                        keyCode: 9
                    }));
                }
                event.preventDefault();
                event.stopPropagation();
            }
        });
    }

    const removeAvMask = (event: Event) => {
        if ((event.target as HTMLElement).classList.contains("av__mask")
            && document.activeElement.tagName !== "TEXTAREA" && document.activeElement.tagName !== "INPUT") {
            updateCellValueByInput(protyle, type, blockElement, cellElements);
            avMaskElement?.remove();
        }
    };
    avMaskElement.addEventListener("click", (event) => {
        removeAvMask(event);
    });
    avMaskElement.addEventListener("contextmenu", (event) => {
        removeAvMask(event);
    });
    avMaskElement.addEventListener("mousedown", (event: MouseEvent & { target: HTMLElement }) => {
        if (event.button === 1) {
            if (event.target.classList.contains("av__mask") && document.activeElement && document.activeElement.nodeType === 1) {
                (document.activeElement as HTMLElement).blur();
            }
            removeAvMask(event);
        }
    });
};

const updateCellValueByInput = (protyle: IProtyle, type: TAVCol, blockElement: HTMLElement, cellElements: HTMLElement[]) => {
    const viewType = blockElement.getAttribute("data-av-type") as TAVView;
    if (viewType === "table") {
        const rowElement = hasClosestByClassName(cellElements[0], "av__row");
        if (!rowElement) {
            return;
        }
        if (cellElements.length === 1 && cellElements[0].dataset.detached === "true" && !rowElement.dataset.id) {
            return;
        }
    }
    const avMaskElement = document.querySelector(".av__mask");
    const avID = blockElement.getAttribute("data-av-id");
    if (type === "template") {
        const colId = getColId(cellElements[0], viewType);
        const textElement = avMaskElement.querySelector(".b3-text-field") as HTMLInputElement;
        if (textElement.value !== textElement.dataset.template && !blockElement.getAttribute("data-loading")) {
            transaction(protyle, [{
                action: "updateAttrViewColTemplate",
                id: colId,
                avID,
                data: textElement.value,
                type: "template",
            }], [{
                action: "updateAttrViewColTemplate",
                id: colId,
                avID,
                data: textElement.dataset.template,
                type: "template",
            }]);
            blockElement.setAttribute("data-loading", "true");
        }
    } else {
        updateCellsValue(protyle, blockElement, type === "checkbox" ? {
            checked: cellElements[0].querySelector("use").getAttribute("xlink:href") === "#iconUncheck"
        } : (avMaskElement.querySelector(".b3-text-field") as HTMLInputElement).value, cellElements);
    }
    if (viewType === "table" &&
        // 兼容新增行后台隐藏
        cellElements[0] &&
        !hasClosestByClassName(cellElements[0], "custom-attr")) {
        cellElements[0].classList.add("av__cell--select");
        addDragFill(cellElements[0]);
    }
    //  单元格编辑中 ctrl+p 光标定位
    if (!document.querySelector(".b3-dialog")) {
        focusBlock(blockElement);
    }
    document.querySelectorAll(".av__mask").forEach((item) => {
        item.remove();
    });
};
