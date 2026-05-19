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

export const addAttrViewColAnimation = (options: {
    blockElement: Element,
    protyle: IProtyle,
    type: TAVCol,
    name: string,
    id: string,
    icon?: string,
    previousID: string,
    data?: IAV
}) => {
    if (!options.blockElement) {
        return;
    }
    const nodeId = options.blockElement.getAttribute("data-node-id");
    if (options.blockElement.classList.contains("av")) {
        options.blockElement.querySelectorAll(".av__row").forEach((item) => {
            let previousElement;
            if (options.previousID) {
                previousElement = item.querySelector(`[data-col-id="${options.previousID}"]`);
            } else {
                previousElement = item.querySelector(".av__cell").previousElementSibling;
            }
            let html = "";
            if (item.classList.contains("av__row--header")) {
                html = `<div class="av__cell av__cell--header" draggable="true" data-icon="${options.icon || ""}" data-col-id="${options.id}" data-dtype="${options.type}" data-wrap="false" style="width: 200px;">
    ${options.icon ? unicode2Emoji(options.icon, "av__cellheadericon", true) : `<svg class="av__cellheadericon"><use xlink:href="#${getColIconByType(options.type)}"></use></svg>`}
    <span class="av__celltext fn__flex-1">${options.name}</span>
    <div class="av__widthdrag"></div>
</div>`;
            } else {
                html = '<div class="av__cell" style="width: 200px"><span class="av__pulse"></span></div>';
            }
            previousElement.insertAdjacentHTML("afterend", html);
        });
    } else {
        options.blockElement.querySelector(".fn__hr").insertAdjacentHTML("beforebegin", `<div class="block__icons av__row" data-id="${nodeId}" data-col-id="${options.id}">
    <div class="block__icon" draggable="true"><svg><use xlink:href="#iconDrag"></use></svg></div>
    <div class="block__logo ariaLabel fn__pointer" data-type="editCol" data-position="parentW" aria-label="${getColNameByType(options.type)}">
        <svg class="block__logoicon"><use xlink:href="#${getColIconByType(options.type)}"></use></svg>
        <span>${getColNameByType(options.type)}</span>
    </div>
    <div data-col-id="${options.id}" data-block-id="${nodeId}" data-type="${options.type}" data-options="[]" class="fn__flex-1 fn__flex">
        <div class="fn__flex-1"></div>
    </div>
</div>`);
    }
    const menuElement = document.querySelector(".av__panel .b3-menu") as HTMLElement;
    if (menuElement && options.data && options.blockElement.classList.contains("av")) {
        menuElement.innerHTML = getEditHTML({
            protyle: options.protyle,
            data: options.data,
            colId: options.id,
            isCustomAttr: false
        });
        bindEditEvent({
            protyle: options.protyle,
            data: options.data,
            menuElement,
            isCustomAttr: false,
            blockID: nodeId
        });
        const tabRect = options.blockElement.querySelector(".av__views").getBoundingClientRect();
        if (tabRect) {
            setPosition(menuElement, tabRect.right - menuElement.clientWidth, tabRect.bottom, tabRect.height);
        }
        return;
    }
    // https://github.com/lonelyor/SourceFlow/issues/14724
    let colData;
    if (options.data) {
        colData = getFieldsByData(options.data).find((item => item.id === options.id));
    }
    openMenuPanel({
        protyle: options.protyle,
        blockElement: options.blockElement,
        type: "edit",
        colId: options.id,
        editData: {
            previousID: options.previousID,
            colData: colData || genColDataByType(options.type, options.id, options.name),
        }
    });
    window.sourceflow.menus.menu.remove();
};
