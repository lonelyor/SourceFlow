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

export const setRelationCell = async (protyle: IProtyle, nodeElement: HTMLElement, target: HTMLElement, cellElements: HTMLElement[]) => {
    const menuElement = hasClosestByClassName(target, "b3-menu");
    if (!menuElement) {
        return;
    }
    if (menuElement.querySelector(".dragover__bottom, .dragover__top")) {
        return;
    }

    if (!nodeElement.contains(cellElements[0])) {
        const viewType = nodeElement.getAttribute("data-av-type") as TAVView;
        const rowID = getFieldIdByCellElement(cellElements[0], viewType);
        if (viewType === "table") {
            cellElements[0] = (nodeElement.querySelector(`.av__row[data-id="${rowID}"] .av__cell[data-col-id="${cellElements[0].dataset.colId}"]`) ||
                nodeElement.querySelector(`.fn__flex-1[data-col-id="${cellElements[0].dataset.colId}"]`)) as HTMLElement;
        } else {
            cellElements[0] = (nodeElement.querySelector(`.av__gallery-item[data-id="${rowID}"] .av__cell[data-field-id="${cellElements[0].dataset.fieldId}"]`)) as HTMLElement;
        }
    }

    const newValue: IAVCellRelationValue = {blockIDs: [], contents: []};
    menuElement.querySelectorAll('[draggable="true"]').forEach(item => {
        const rowId = item.getAttribute("data-row-id");
        const blockPopElement = item.querySelector(".b3-menu__label");
        newValue.blockIDs.push(rowId);
        newValue.contents.push({
            type: "block",
            block: {
                id: blockPopElement.getAttribute("data-id"),
                content: blockPopElement.textContent
            },
            isDetached: !blockPopElement.classList.contains("popover__block")
        });
    });
    if (target.classList.contains("b3-menu__item")) {
        const rowId = target.getAttribute("data-row-id");
        const id = target.querySelector(".b3-menu__label").getAttribute("data-id");
        const separatorElement = menuElement.querySelector(".b3-menu__separator");
        const searchValue = menuElement.querySelector("input").value;
        if (target.getAttribute("draggable")) {
            if (!separatorElement.nextElementSibling.getAttribute("data-row-id") && !searchValue) {
                separatorElement.nextElementSibling.remove();
            }
            const removeIndex = newValue.blockIDs.indexOf(rowId);
            newValue.blockIDs.splice(removeIndex, 1);
            newValue.contents.splice(removeIndex, 1);
            separatorElement.after(target);
            target.outerHTML = genSelectItemHTML({
                type: "unselect",
                rowId,
                id,
                isDetached: !target.querySelector(".popover__block"),
                text: Lute.EscapeHTMLStr(target.querySelector(".b3-menu__label").textContent),
                className: target.className
            });
            updateCellsValue(protyle, nodeElement, newValue, cellElements);
        } else if (rowId) {
            newValue.blockIDs.push(rowId);
            newValue.contents.push({
                type: "block",
                block: {
                    id,
                    content: target.firstElementChild.textContent
                },
                isDetached: !target.firstElementChild.getAttribute("style")
            });
            separatorElement.before(target);
            target.outerHTML = `<button data-row-id="${rowId}" data-position="west" data-type="setRelationCell" class="${target.className}" 
draggable="true">${genSelectItemHTML({
                type: "selected",
                rowId,
                id,
                isDetached: !target.querySelector(".popover__block"),
                text: Lute.EscapeHTMLStr(target.querySelector(".b3-menu__label").textContent)
            })}</button>`;
            if (!separatorElement.nextElementSibling) {
                separatorElement.insertAdjacentHTML("afterend", genSelectItemHTML({type: "empty"}));
            }
            updateCellsValue(protyle, nodeElement, newValue, cellElements);
        } else {
            const blockID = target.querySelector(".popover__block").getAttribute("data-id");
            const content = target.querySelector("b").textContent;
            const rowId = Lute.NewNodeID();
            const bodyElement = hasClosestByClassName(cellElements[0], "av__body");
            newValue.blockIDs.push(rowId);
            newValue.contents.push({
                type: "block",
                block: {
                    content
                },
                isDetached: true
            });
            const updateOptions = await updateCellsValue(protyle, nodeElement, newValue, cellElements, null, null, true);
            const doOperations: IOperation[] = [{
                action: "insertAttrViewBlock",
                ignoreDefaultFill: true,
                avID: menuElement.firstElementChild.getAttribute("data-av-id"),
                srcs: [{
                    itemID: rowId,
                    id: Lute.NewNodeID(),
                    isDetached: true,
                    content
                }],
                blockID,
                groupID: bodyElement ? bodyElement.getAttribute("data-group-id") : "",
            }, {
                action: "doUpdateUpdated",
                id: blockID,
                data: dayjs().format("YYYYMMDDHHmmss"),
            }];
            separatorElement.insertAdjacentHTML("beforebegin", `<button data-row-id="${rowId}" data-position="west" data-type="setRelationCell" 
class="${target.className} ariaLabel" draggable="true">${genSelectItemHTML({
                type: "selected",
                rowId,
                isDetached: true,
                text: Lute.EscapeHTMLStr(content)
            })}</button>`);
            transaction(protyle, doOperations.concat(updateOptions.doOperations));
        }
    }
    updateCopyRelatedItems(menuElement);
};
