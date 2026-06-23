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

export const updateRelation = (options: {
    protyle: IProtyle,
    avID: string,
    avElement: Element,
    colsData: IAVColumn[],
    blockElement: Element,
}) => {
    const inputElement = options.avElement.querySelector('input[data-type="colName"]') as HTMLInputElement;
    const goSearchAVElement = options.avElement.querySelector('.b3-menu__item[data-type="goSearchAV"]') as HTMLElement;
    const newAVId = goSearchAVElement.getAttribute("data-av-id");
    const colId = options.avElement.querySelector(".b3-menu__item").getAttribute("data-col-id");
    let colData: IAVColumn;
    options.colsData.find(item => {
        if (item.id === colId) {
            if (!item.relation) {
                item.relation = {};
            }
            colData = item;
            return true;
        }
    });
    const colNewName = (options.avElement.querySelector('[data-type="name"]') as HTMLInputElement).value;
    transaction(options.protyle, [{
        action: "updateAttrViewColRelation",
        avID: options.avID,
        keyID: colId,
        id: newAVId || colData.relation.avID,
        backRelationKeyID: colData.relation.avID === newAVId ? (colData.relation.backKeyID || Lute.NewNodeID()) : Lute.NewNodeID(),
        isTwoWay: (options.avElement.querySelector(".b3-switch") as HTMLInputElement).checked,
        name: inputElement.value,
        format: colNewName
    }, {
        action: "doUpdateUpdated",
        id: options.blockElement.getAttribute("data-node-id"),
        data: dayjs().format("YYYYMMDDHHmmss"),
    }], [{
        action: "updateAttrViewColRelation",
        avID: options.avID,
        keyID: colId,
        id: colData.relation.avID || newAVId,
        backRelationKeyID: colData.relation.backKeyID,
        isTwoWay: colData.relation.isTwoWay,
        name: inputElement.dataset.oldValue,
        format: colData.name
    }]);
    options.avElement.remove();
    updateAttrViewCellAnimation(options.blockElement.querySelector(`.av__row--header .av__cell[data-col-id="${colId}"]`), undefined, {name: colNewName});
    focusBlock(options.blockElement);
};

export const toggleUpdateRelationBtn = (menuItemsElement: HTMLElement, avId: string, resetData = false) => {
    const searchElement = menuItemsElement.querySelector('.b3-menu__item[data-type="goSearchAV"]') as HTMLElement;
    const switchItemElement = searchElement.nextElementSibling;
    const switchElement = switchItemElement.querySelector(".b3-switch") as HTMLInputElement;
    const inputItemElement = switchItemElement.nextElementSibling;
    const btnElement = inputItemElement.nextElementSibling;
    const oldValue = JSON.parse(searchElement.dataset.oldValue) as IAVColumnRelation;
    if (oldValue.avID) {
        const inputElement = inputItemElement.querySelector("input") as HTMLInputElement;
        if (resetData) {
            if (searchElement.dataset.avId !== oldValue.avID) {
                inputElement.value = "";
                switchElement.checked = false;
            } else {
                inputElement.value = inputElement.dataset.oldValue;
                switchElement.checked = oldValue.isTwoWay;
            }
        }
        if (switchElement.checked) {
            inputItemElement.classList.remove("fn__none");
        } else {
            inputItemElement.classList.add("fn__none");
        }
        if ((searchElement.dataset.avId && oldValue.avID !== searchElement.dataset.avId) || oldValue.isTwoWay !== switchElement.checked || inputElement.dataset.oldValue !== inputElement.value) {
            btnElement.classList.remove("fn__none");
        } else {
            btnElement.classList.add("fn__none");
        }
    } else if (searchElement.dataset.avId) {
        if (switchElement.checked) {
            inputItemElement.classList.remove("fn__none");
        } else {
            inputItemElement.classList.add("fn__none");
        }
        btnElement.classList.remove("fn__none");
    }
};
