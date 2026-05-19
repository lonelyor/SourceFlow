import {Menu} from "../../../plugin/Menu";
import {hasClosestByClassName, hasTopClosestByClassName} from "../../util/hasClosest";
import {UDLRHint, upDownHint} from "../../../util/upDownHint";
import {fetchPost} from "../../../util/fetch";
import {escapeGreat, escapeHtml} from "../../../util/escape";
import {transaction} from "../../wysiwyg/transaction";
import {updateCellsValue} from "./cell";
import {updateAttrViewCellAnimation} from "./cell";
import {focusBlock} from "../../util/selection";
import {setPosition} from "../../../util/setPosition";
import * as dayjs from "dayjs";
import {getFieldsByData, getViewName} from "./view";
import {getColId} from "./col";
import {getFieldIdByCellElement} from "./row";
import {isMobile} from "../../../util/functions";
import {showMessage} from "../../../dialog/message";
import {writeText} from "../../util/compatibility";
import {genSelectItemHTML, updateCopyRelatedItems} from "./relationShared";
import {setRelationCell} from "./relationCell";

const filterItem = (menuElement: Element, cellElement: HTMLElement, keyword: string) => {
    fetchPost("/api/av/getAttributeViewPrimaryKeyValues", {
        id: menuElement.firstElementChild.getAttribute("data-av-id"),
        keyword,
    }, response => {
        const cells = response.data.rows.values as IAVCellValue[] || [];
        let html = "";
        let selectHTML = "";
        const hasIds: string[] = [];
        cellElement.querySelectorAll(".av__cell--relation").forEach((relationItem: HTMLElement) => {
            const item = relationItem.querySelector(".av__celltext") as HTMLElement;
            hasIds.push(relationItem.dataset.rowId);
            selectHTML += `<button data-row-id="${relationItem.dataset.rowId}" data-position="west" data-type="setRelationCell" 
class="b3-menu__item ariaLabel${item.textContent.indexOf(keyword) > -1 ? "" : " fn__none"}" 
draggable="true">${genSelectItemHTML({
                type: "selected",
                id: item.dataset.id,
                isDetached: !item.classList.contains("av__celltext--ref"),
                text: Lute.EscapeHTMLStr(item.textContent || window.sourceflow.languages.untitled)
            })}</button>`;
        });
        cells.forEach((item) => {
            if (!hasIds.includes(item.blockID)) {
                html += genSelectItemHTML({
                    type: "unselect",
                    rowId: item.blockID,
                    id: item.block.id,
                    isDetached: item.isDetached,
                    text: Lute.EscapeHTMLStr(item.block.content || window.sourceflow.languages.untitled)
                });
            }
        });
        const refElement = menuElement.querySelector(".popover__block");
        menuElement.querySelector(".b3-menu__items").innerHTML = `${selectHTML}
<button class="b3-menu__separator"></button>
${html}
${keyword ? genSelectItemHTML({
            type: "empty",
            newName: Lute.EscapeHTMLStr(keyword),
            text: `<span style="color: var(--b3-protyle-inline-blockref-color);" class="popover__block" data-id="${refElement.getAttribute("data-id")}">${refElement.textContent}</span>`,
        }) : (html ? "" : genSelectItemHTML({type: "empty"}))}`;
        menuElement.querySelector(".b3-menu__items .b3-menu__item:not(.fn__none)").classList.add("b3-menu__item--current");
        updateCopyRelatedItems(menuElement);
    });
};

export const bindRelationEvent = (options: {
    menuElement: HTMLElement,
    protyle: IProtyle,
    blockElement: Element,
    cellElements: HTMLElement[]
}) => {
    fetchPost("/api/av/getAttributeViewPrimaryKeyValues", {
        id: options.menuElement.firstElementChild.getAttribute("data-av-id"),
        keyword: "",
    }, response => {
        const cells = response.data.rows.values as IAVCellValue[] || [];
        let html = "";
        let selectHTML = "";
        const hasIds: string[] = [];
        options.cellElements[0].querySelectorAll(".av__cell--relation").forEach((relationItem: HTMLElement) => {
            const item = relationItem.querySelector(".av__celltext") as HTMLElement;
            hasIds.push(relationItem.dataset.rowId);
            selectHTML += `<button data-row-id="${relationItem.dataset.rowId}" data-position="west" data-type="setRelationCell" class="b3-menu__item ariaLabel" 
draggable="true">${genSelectItemHTML({
                type: "selected",
                id: item.dataset.id,
                isDetached: !item.classList.contains("av__celltext--ref"),
                text: Lute.EscapeHTMLStr(item.textContent || window.sourceflow.languages.untitled)
            })}</button>`;
        });
        cells.forEach((item) => {
            if (!hasIds.includes(item.blockID)) {
                html += genSelectItemHTML({
                    type: "unselect",
                    rowId: item.blockID,
                    id: item.block.id,
                    isDetached: item.isDetached,
                    text: Lute.EscapeHTMLStr(item.block.content || window.sourceflow.languages.untitled)
                });
            }
        });
        options.menuElement.querySelector(".b3-menu__items").innerHTML = `${selectHTML}
<button class="b3-menu__separator"></button>
${html || genSelectItemHTML({type: "empty"})}`;
        const cellRect = options.cellElements[options.cellElements.length - 1].getBoundingClientRect();
        setPosition(options.menuElement, cellRect.left, cellRect.bottom, cellRect.height);
        options.menuElement.querySelector(".b3-menu__items .b3-menu__item:not(.fn__none)").classList.add("b3-menu__item--current");
        const inputElement = options.menuElement.querySelector("input");
        inputElement.focus();
        const databaseName = inputElement.parentElement.parentElement.querySelector(".popover__block");
        databaseName.innerHTML = Lute.EscapeHTMLStr(response.data.name);
        databaseName.setAttribute("data-id", response.data.blockIDs[0]);
        const listElement = options.menuElement.querySelector(".b3-menu__items");
        inputElement.addEventListener("keydown", (event) => {
            if (event.isComposing) {
                return;
            }
            upDownHint(listElement, event, "b3-menu__item--current");
            const currentElement = options.menuElement.querySelector(".b3-menu__item--current") as HTMLElement;
            if (event.key === "Enter" && currentElement && currentElement.getAttribute("data-type") === "setRelationCell") {
                setRelationCell(options.protyle, options.blockElement as HTMLElement, currentElement, options.cellElements);
                event.preventDefault();
                event.stopPropagation();
            }
        });
        inputElement.addEventListener("input", (event: InputEvent) => {
            if (event.isComposing) {
                return;
            }
            filterItem(options.menuElement, options.cellElements[0], inputElement.value);
            event.stopPropagation();
        });
        inputElement.addEventListener("compositionend", (event) => {
            event.stopPropagation();
            filterItem(options.menuElement, options.cellElements[0], inputElement.value);
        });
        updateCopyRelatedItems(options.menuElement);
        options.menuElement.querySelector('[data-type="copyRelatedItems"]').addEventListener("click", () => {
            let copyText = "";
            const selectedElements = options.menuElement.querySelectorAll('.b3-menu__item[draggable="true"]');
            selectedElements.forEach((item: HTMLElement) => {
                if (selectedElements.length > 1) {
                    copyText += "- ";
                }
                const textElement = item.querySelector(".b3-menu__label") as HTMLElement;
                if (!textElement.dataset.id || textElement.dataset.id === "undefined") {
                    copyText += textElement.textContent + "\n";
                } else {
                    copyText += `((${textElement.dataset.id} "${textElement.textContent}"))\n`;
                }
            });
            if (copyText) {
                writeText(copyText.trimEnd());
                showMessage(window.sourceflow.languages.copied);
            }
        });
    });
};

export const getRelationHTML = (data: IAV, cellElements?: HTMLElement[]) => {
    let colRelationData: IAVColumnRelation;
    getFieldsByData(data).find(item => {
        if (item.id === getColId(cellElements[0], data.viewType)) {
            colRelationData = item.relation;
            return true;
        }
    });
    if (colRelationData && colRelationData.avID) {
        return `<div data-av-id="${colRelationData.avID}" class="fn__flex-column">
<div class="b3-menu__item" data-type="nobg">
    <div class="b3-form__icona fn__flex-1" style="overflow: visible">
        <input class="b3-text-field fn__block" style="min-width: 190px"/>
        <svg class="b3-form__icona-icon ariaLabel fn__none" data-position="north" data-type="copyRelatedItems" aria-label="${window.sourceflow.languages.copy} ${window.sourceflow.languages.relatedItems}"><use xlink:href="#iconCopy"></use></svg>
    </div>
    <span class="fn__space"></span>
    <span style="color: var(--b3-protyle-inline-blockref-color);max-width: 200px" data-id="" class="popover__block fn__pointer fn__ellipsis"></span>
</div>
<div class="b3-menu__items">
    <img style="margin: 0 auto;display: block;width: 64px;height: 64px" src="/stage/loading-pure.svg">
</div>`;
    } else {
        return "";
    }
};
