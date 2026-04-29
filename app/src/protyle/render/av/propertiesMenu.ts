import {unicode2Emoji} from "../../../emoji";
import {escapeHtml} from "../../../util/escape";
import {getColIconByType} from "./col";

export const getPropertiesHTML = (fields: IAVColumn[]) => {
    let showHTML = "";
    let hideHTML = "";
    fields.forEach((item: IAVColumn) => {
        if (item.hidden) {
            hideHTML += `<button class="b3-menu__item" data-type="editCol" draggable="true" data-id="${item.id}">
    <svg class="b3-menu__icon fn__grab"><use xlink:href="#iconDrag"></use></svg>
    <div class="b3-menu__label fn__flex">
        ${item.icon ? unicode2Emoji(item.icon, "b3-menu__icon", true) : `<svg class="b3-menu__icon"><use xlink:href="#${getColIconByType(item.type)}"></use></svg>`}
        ${escapeHtml(item.name) || "&nbsp;"}
    </div>
    <svg class="b3-menu__action" data-type="showCol"><use xlink:href="#iconEye"></use></svg>
    <svg class="b3-menu__icon b3-menu__icon--small"><use xlink:href="#iconRight"></use></svg>
</button>`;
        } else {
            showHTML += `<button class="b3-menu__item" data-type="editCol" draggable="true" data-id="${item.id}">
    <svg class="b3-menu__icon fn__grab"><use xlink:href="#iconDrag"></use></svg>
    <div class="b3-menu__label fn__flex">
        ${item.icon ? unicode2Emoji(item.icon, "b3-menu__icon", true) : `<svg class="b3-menu__icon"><use xlink:href="#${getColIconByType(item.type)}"></use></svg>`}
        ${escapeHtml(item.name) || "&nbsp;"}
    </div>
    <svg class="b3-menu__action${item.type === "block" ? " fn__none" : ""}" data-type="hideCol"><use xlink:href="#iconEyeoff"></use></svg>
    <svg class="b3-menu__icon b3-menu__icon--small"><use xlink:href="#iconRight"></use></svg>
</button>`;
        }
    });
    if (hideHTML) {
        hideHTML = `<button class="b3-menu__separator"></button>
<button class="b3-menu__item" data-type="nobg">
    <span class="b3-menu__label">
        ${window.sourceflow.languages.hideCol} 
    </span>
    <span class="block__icon" data-type="showAllCol">
        ${window.sourceflow.languages.showAll}
        <span class="fn__space"></span>
        <svg><use xlink:href="#iconEye"></use></svg>
    </span>
</button>
${hideHTML}`;
    }
    return `<div class="b3-menu__items">
<button class="b3-menu__item" data-type="nobg">
    <span class="block__icon" style="padding: 8px;margin-left: -4px;" data-type="go-config">
        <svg><use xlink:href="#iconLeft"></use></svg>
    </span>
    <span class="b3-menu__label ft__center">${window.sourceflow.languages.fields}</span>
</button>
<button class="b3-menu__separator"></button>
<button class="b3-menu__item" data-type="nobg">
    <span class="b3-menu__label">
        ${window.sourceflow.languages.showCol} 
    </span>
    <span class="block__icon" data-type="hideAllCol">
        ${window.sourceflow.languages.hideAll}
        <span class="fn__space"></span>
        <svg><use xlink:href="#iconEyeoff"></use></svg>
    </span>
</button>
${showHTML}
${hideHTML}
<button class="b3-menu__separator"></button>
<button class="b3-menu__item" data-type="newCol">
    <svg class="b3-menu__icon"><use xlink:href="#iconAdd"></use></svg>
    <span class="b3-menu__label">${window.sourceflow.languages.new}</span>
</button>
</div>`;
};
