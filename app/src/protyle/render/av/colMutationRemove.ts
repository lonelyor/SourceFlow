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

import {bindEditEvent, getEditHTML} from "./colEdit";
import {genColDataByType, getColIconByType, getColNameByType} from "./colLookups";

export const removeColByMenu = (options: {
    protyle: IProtyle,
    colId: string,
    avID: string,
    blockID: string,
    oldValue: string,
    type: TAVCol,
    cellElement: HTMLElement,
    blockElement: Element,
    removeDest: boolean
}) => {
    const newUpdated = dayjs().format("YYYYMMDDHHmmss");
    transaction(options.protyle, [{
        action: "removeAttrViewCol",
        id: options.colId,
        avID: options.avID,
        removeDest: options.removeDest
    }, {
        action: "doUpdateUpdated",
        id: options.blockID,
        data: newUpdated,
    }], [{
        action: "addAttrViewCol",
        name: options.oldValue,
        avID: options.avID,
        type: options.type,
        id: options.colId,
        previousID: options.cellElement.previousElementSibling?.getAttribute("data-col-id") || "",
    }, {
        action: "doUpdateUpdated",
        id: options.blockID,
        data: options.blockElement.getAttribute("updated")
    }]);
    removeAttrViewColAnimation(options.blockElement, options.colId);
    options.blockElement.setAttribute("updated", newUpdated);
};

export const removeCol = (options: {
    protyle: IProtyle,
    fields: IAVColumn[],
    avID: string,
    blockID: string,
    isCustomAttr: boolean
    menuElement: HTMLElement,
    blockElement: Element
    avPanelElement: Element
    tabRect: DOMRect,
    isTwoWay: boolean
}) => {
    const colId = options.menuElement.querySelector(".b3-menu__item").getAttribute("data-col-id");
    let previousID = "";
    const colData = options.fields.find((item: IAVColumn, index) => {
        if (item.id === colId) {
            previousID = options.fields[index - 1]?.id;
            options.fields.splice(index, 1);
            return true;
        }
    });
    const newUpdated = dayjs().format("YYYYMMDDHHmmss");
    transaction(options.protyle, [{
        action: "removeAttrViewCol",
        id: colId,
        avID: options.avID,
        removeDest: options.isTwoWay
    }, {
        action: "doUpdateUpdated",
        id: options.blockID,
        data: newUpdated,
    }], [{
        action: "addAttrViewCol",
        name: colData.name,
        avID: options.avID,
        type: colData.type,
        id: colId,
        previousID: previousID
    }, {
        action: "doUpdateUpdated",
        id: options.blockID,
        data: options.blockElement.getAttribute("updated")
    }]);
    removeAttrViewColAnimation(options.blockElement, colId);
    options.blockElement.setAttribute("updated", newUpdated);

    if (options.isCustomAttr) {
        options.avPanelElement.remove();
    } else {
        options.menuElement.innerHTML = getPropertiesHTML(options.fields);
        setPosition(options.menuElement,
            options.tabRect.right - options.menuElement.clientWidth, options.tabRect.bottom,
            options.tabRect.height);
    }
};
