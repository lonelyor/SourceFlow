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

interface IAVItem {
    avID: string;
    avName: string;
    blockID: string;
    hPath: string;
    viewName: string;
    viewID: string;
    viewLayout: string;
}

import {toggleUpdateRelationBtn} from "./relationConfig";

const genSearchList = (element: Element, keyword: string, avId?: string, excludes = true, cb?: () => void) => {
    fetchPost("/api/av/searchAttributeView", {
        keyword,
        excludes: (excludes && avId) ? [avId] : undefined
    }, (response) => {
        let html = "";
        response.data.results.forEach((item: IAVItem & { children: IAVItem[] }, index: number) => {
            const hasChildren = item.children && item.children.length > 0 && excludes;
            html += `<div class="b3-list-item b3-list-item--narrow${index === 0 ? " b3-list-item--focus" : ""}" data-av-id="${item.avID}" data-block-id="${item.blockID}">
    <span class="b3-list-item__toggle b3-list-item__toggle--hl${excludes ? "" : " fn__none"}" style="height:auto;align-self: stretch;margin: 4px 0;">
        <svg class="b3-list-item__arrow">${hasChildren ? '<use xlink:href="#iconRight"></use>' : ""}</svg>
    </span>
    <span class="fn__space--small"></span>
    <div class="b3-list-item--two fn__flex-1">
        <div class="b3-list-item__first">
            <span class="b3-list-item__text">${escapeHtml(item.avName || window.sourceflow.languages._kernel[267])}</span>
        </div>
        <div class="b3-list-item__meta b3-list-item__showall">${escapeGreat(item.hPath)}</div>
    </div>
    <svg aria-label="${window.sourceflow.languages.thisDatabase}" style="margin: 0 0 0 4px" class="b3-list-item__hinticon ariaLabel${item.avID === avId ? "" : " fn__none"}"><use xlink:href="#iconInfo"></use></svg>
</div>`;
            if (hasChildren) {
                html += '<div class="fn__none">';
                item.children.forEach((subItem) => {
                    const viewDefaultName = getViewName(subItem.viewLayout);
                    html += `<div style="padding-left: 48px;" class="b3-list-item b3-list-item--narrow" data-av-id="${subItem.avID}" data-view-id="${subItem.viewID}">
<span class="b3-list-item__text">${escapeHtml(subItem.viewName)}</span> 
<span class="b3-list-item__meta">${viewDefaultName}</span>
</div>`;
                });
                html += "</div>";
            }
        });
        element.innerHTML = html;
        if (cb) {
            cb();
        }
    });
};

const setDatabase = (avId: string, element: HTMLElement, item: HTMLElement) => {
    element.dataset.avId = item.dataset.avId;
    element.dataset.blockId = item.dataset.blockId;
    element.querySelector(".b3-menu__accelerator").textContent = item.querySelector(".b3-list-item__hinticon").classList.contains("fn__none") ? item.querySelector(".b3-list-item__text").textContent : window.sourceflow.languages.thisDatabase;
    const menuElement = hasClosestByClassName(element, "b3-menu__items");
    if (menuElement) {
        toggleUpdateRelationBtn(menuElement, avId, true);
    }
};

export const openSearchAV = (avId: string, target: HTMLElement, cb?: (element: HTMLElement) => void, excludes = true) => {
    window.sourceflow.menus.menu.remove();
    const menu = new Menu();
    menu.addItem({
        iconHTML: "",
        type: "empty",
        label: `<div class="fn__flex-column b3-menu__filter"${isMobile() ? "" : ' style="width: 50vw"'} >
    <input class="b3-text-field fn__flex-shrink"/>
    <div class="fn__hr"></div>
    <div class="b3-list fn__flex-1 b3-list--background">
        <img style="margin: 0 auto;display: block;width: 64px;height: 64px" src="/stage/loading-pure.svg">
    </div>
</div>`,
        bind(element) {
            const listElement = element.querySelector(".b3-list");
            const inputElement = element.querySelector("input");
            inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
                if (event.isComposing) {
                    return;
                }
                UDLRHint(listElement, event);
                if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    const listItemElement = listElement.querySelector(".b3-list-item--focus") as HTMLElement;
                    if (cb) {
                        cb(listItemElement);
                    } else {
                        setDatabase(avId, target, listItemElement);
                    }
                    window.sourceflow.menus.menu.remove();
                }
            });
            inputElement.addEventListener("input", (event: InputEvent) => {
                event.stopPropagation();
                if (event.isComposing) {
                    return;
                }
                genSearchList(listElement, inputElement.value, avId, excludes);
            });
            inputElement.addEventListener("compositionend", () => {
                genSearchList(listElement, inputElement.value, avId, excludes);
            });
            element.lastElementChild.addEventListener("click", (event) => {
                let clickTarget = event.target as HTMLElement;
                while (clickTarget && !clickTarget.classList.contains("b3-list")) {
                    if (clickTarget.classList.contains("b3-list-item__toggle")) {
                        if (clickTarget.firstElementChild.classList.contains("b3-list-item__arrow--open")) {
                            clickTarget.firstElementChild.classList.remove("b3-list-item__arrow--open");
                            clickTarget.parentElement.nextElementSibling.classList.add("fn__none");
                        } else {
                            clickTarget.firstElementChild.classList.add("b3-list-item__arrow--open");
                            clickTarget.parentElement.nextElementSibling.classList.remove("fn__none");
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (clickTarget.classList.contains("b3-list-item")) {
                        event.preventDefault();
                        event.stopPropagation();
                        if (cb) {
                            cb(clickTarget);
                        } else {
                            setDatabase(avId, target, clickTarget);
                        }
                        window.sourceflow.menus.menu.remove();
                        break;
                    }
                    clickTarget = clickTarget.parentElement;
                }
            });
            genSearchList(listElement, "", avId, excludes, () => {
                const rect = target.getBoundingClientRect();
                menu.open({
                    x: rect.left,
                    y: rect.bottom,
                    h: rect.height,
                });
                element.querySelector("input").focus();
            });
        }
    });
    menu.element.querySelector(".b3-menu__items").setAttribute("style", "overflow: initial");
    const popoverElement = hasTopClosestByClassName(target, "block__popover", true);
    menu.element.setAttribute("data-from", popoverElement ? popoverElement.dataset.level + "popover" : "app");
};
