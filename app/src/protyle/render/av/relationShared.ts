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

export const updateCopyRelatedItems = (menuElement: Element) => {
    const inputElement = menuElement.querySelector(".b3-form__icona .b3-text-field") as HTMLInputElement;
    if (menuElement.querySelector(".b3-menu__icon.fn__grab")) {
        inputElement.nextElementSibling.classList.remove("fn__none");
        inputElement.style.paddingRight = "26px";
    } else {
        inputElement.nextElementSibling.classList.add("fn__none");
        inputElement.style.paddingRight = "";
    }
};

export const genSelectItemHTML = (options: {
    type: "selected" | "empty" | "unselect",
    id?: string,
    isDetached?: boolean,
    text?: string,
    className?: string,
    rowId?: string,
    newName?: string
}) => {
    if (options.type === "selected") {
        return `<svg class="b3-menu__icon fn__grab"><use xlink:href="#iconDrag"></use></svg>
<span class="b3-menu__label fn__ellipsis ${options.isDetached ? "" : " popover__block"}" ${options.isDetached ? "" : 'style="color:var(--b3-protyle-inline-blockref-color)"'} data-id="${options.id}">${options.text}</span>
<svg class="b3-menu__action"><use xlink:href="#iconMin"></use></svg>`;
    }
    if (options.type === "empty") {
        if (options.newName) {
            return `<button class="b3-menu__item" data-type="setRelationCell">
    <span class="b3-menu__label fn__ellipsis">${window.sourceflow.languages.newRowInRelation.replace("${x}", options.text).replace("${y}", options.newName)}</span>
</button>`;
        }
        return `<button class="b3-menu__item">
    <span class="b3-menu__label">${window.sourceflow.languages.emptyContent}</span>
</button>`;
    }
    if (options.type == "unselect") {
        return `<button data-row-id="${options.rowId}" class="${options.className || "b3-menu__item ariaLabel"}" data-position="west" data-type="setRelationCell">
    <span class="b3-menu__label fn__ellipsis${options.isDetached ? "" : " popover__block"}" ${options.isDetached ? "" : 'style="color:var(--b3-protyle-inline-blockref-color)"'} data-id="${options.id}">${options.text}</span>
    <svg class="b3-menu__action"><use xlink:href="#iconAdd"></use></svg>
</button>`;
    }
};
