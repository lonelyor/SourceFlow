import {Menu} from "../../../plugin/Menu";
import {transaction} from "../../wysiwyg/transaction";
import {hasClosestByClassName} from "../../util/hasClosest";
import {getColIconByType} from "./col";
import {setPosition} from "../../../util/setPosition";
import {objEquals} from "../../../util/functions";
import {genCellValue} from "./cell";
import * as dayjs from "dayjs";
import {unicode2Emoji} from "../../../emoji";
import {openMenuPanel} from "./openMenuPanel";
import {fetchPost, fetchSyncPost} from "../../../util/fetch";
import {showMessage} from "../../../dialog/message";
import {upDownHint} from "../../../util/upDownHint";
import {getFieldsByData} from "./view";
import {Constants} from "../../../constants";

import {getFiltersHTML} from "./filterDisplay";

export const getDefaultOperatorByType = (type: TAVCol) => {
    if (["select", "number", "date", "created", "updated"].includes(type)) {
        return "=";
    }
    if (["checkbox"].includes(type)) {
        return "Is false";
    }
    if (["rollup", "relation", "mAsset", "text", "mSelect", "url", "block", "email", "phone", "template"].includes(type)) {
        return "Contains";
    }
};

export const toggleEmpty = (element: HTMLElement, operator: string, type: TAVCol) => {
    const menuElement = hasClosestByClassName(element, "b3-menu");
    if (menuElement) {
        if (["date", "updated", "created"].includes(type)) {
            const filterElement = menuElement.querySelector('.b3-menu__item div[data-type="filter1"]');
            const filter2Element = filterElement.nextElementSibling;
            if (operator === "Is between") {
                filter2Element.classList.remove("fn__none");
                filterElement.classList.remove("fn__none");
            } else if (operator === "Is empty" || operator === "Is not empty") {
                filter2Element.classList.add("fn__none");
                filterElement.classList.add("fn__none");
            } else {
                filterElement.classList.remove("fn__none");
                filter2Element.classList.add("fn__none");
            }
            return;
        }
        menuElement.querySelectorAll("input, .b3-chip").forEach((inputElement) => {
            const menuItemElement = hasClosestByClassName(inputElement, "b3-menu__item");
            if (menuItemElement) {
                if (operator !== "Is empty" && operator !== "Is not empty") {
                    menuItemElement.classList.remove("fn__none");
                } else {
                    menuItemElement.classList.add("fn__none");
                }
            }
        });
    }
};

export const filterSelect = (key: string) => {
    window.sourceflow.menus.menu.element.querySelectorAll(".b3-menu__item").forEach((item) => {
        const nameElement = item.querySelector(".b3-chip.b3-chip--middle") as HTMLElement;
        if (nameElement) {
            const itemName = nameElement.dataset.name.toLowerCase();
            if (!key || (key.indexOf(itemName) > -1 || itemName.indexOf(key) > -1)) {
                item.classList.remove("fn__none");
            } else {
                item.classList.add("fn__none");
            }
        }
    });
};
