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

import {getColIconByType, getColNameByType} from "./colLookups";

export const getEditHTML = (options: {
    protyle: IProtyle,
    colId: string,
    data: IAV,
    isCustomAttr: boolean
}) => {
    let colData: IAVColumn;
    getFieldsByData(options.data).find((item) => {
        if (item.id === options.colId) {
            colData = item;
            return true;
        }
    });
    let html = `<button class="b3-menu__item" data-type="nobg" data-col-id="${options.colId}">
    <span class="block__icon${options.isCustomAttr ? " fn__none" : ""}" style="padding: 8px;margin-left: -4px;" data-type="go-properties">
        <svg><use xlink:href="#iconLeft"></use></svg>
    </span>
    <span class="b3-menu__label ft__center">${window.sourceflow.languages.edit}</span>
</button>
<button class="b3-menu__separator" data-id="separator_1"></button>
<button class="b3-menu__item" data-type="nobg">
    <div class="fn__block">
        <div class="fn__flex">
            <span class="b3-menu__avemoji" data-col-type="${colData.type}" data-icon="${colData.icon}" data-type="update-icon">${colData.icon ? unicode2Emoji(colData.icon) : `<svg style="width: 14px;height: 14px"><use xlink:href="#${getColIconByType(colData.type)}"></use></svg>`}</span>
            <div class="b3-form__icona fn__block">
                <input data-type="name" class="b3-text-field b3-form__icona-input" type="text">
                <svg data-position="north" class="b3-form__icona-icon ariaLabel" aria-label="${colData.desc ? escapeAriaLabel(colData.desc) : window.sourceflow.languages.addDesc}"><use xlink:href="#iconInfo"></use></svg>
            </div>
        </div>
        <div class="fn__none">
            <div class="fn__hr"></div>
            <textarea placeholder="${window.sourceflow.languages.addDesc}" rows="1" data-type="desc" class="b3-text-field fn__block" type="text" data-value="${escapeAttr(colData.desc)}">${colData.desc}</textarea>
        </div>
        <div class="fn__hr--small"></div>
    </div>
</button>
<button class="b3-menu__item" data-type="goUpdateColType" ${colData.type === "block" ? "disabled" : ""}>
    <span class="b3-menu__label">${window.sourceflow.languages.type}</span>
    <span class="fn__space"></span>
    <svg class="b3-menu__icon"><use xlink:href="#${getColIconByType(colData.type)}"></use></svg>
    <span class="b3-menu__accelerator" style="margin-left: 0">${getColNameByType(colData.type)}</span>
    <svg class="b3-menu__icon b3-menu__icon--small"><use xlink:href="#iconRight"></use></svg>
</button>`;
    if (["mSelect", "select"].includes(colData.type)) {
        html += `<button class="b3-menu__separator" data-id="separator_2"></button>
<button class="b3-menu__item" data-type="nobg">
    <svg class="b3-menu__icon"><use xlink:href="#iconAdd"></use></svg>
    <input data-type="addOption" class="b3-text-field fn__block" type="text" placeholder="${window.sourceflow.languages.enterKey} ${window.sourceflow.languages.addAttr}" style="margin: 4px 0">
</button>`;
        if (!colData.options) {
            colData.options = [];
        }
        colData.options.forEach(item => {
            const airaLabel = item.desc ? `${escapeAriaLabel(item.name)}<div class='ft__on-surface'>${escapeAriaLabel(item.desc || "")}</div>` : "";
            html += `<button class="b3-menu__item${html ? "" : " b3-menu__item--current"}" draggable="true" data-name="${escapeAttr(item.name)}" data-desc="${escapeAttr(item.desc || "")}" data-color="${item.color}">
    <svg class="b3-menu__icon fn__grab"><use xlink:href="#iconDrag"></use></svg>
    <div class="fn__flex-1 ariaLabel" data-position="parentW" aria-label="${airaLabel}">
        <span class="b3-chip" style="background-color:var(--b3-font-background${item.color});color:var(--b3-font-color${item.color})">
            <span class="fn__ellipsis">${escapeHtml(item.name)}</span>
        </span>
    </div>
    <svg class="b3-menu__action" data-type="setColOption"><use xlink:href="#iconEdit"></use></svg>
</button>`;
        });
    } else if (colData.type === "number") {
        html += `<button class="b3-menu__separator" data-id="separator_2"></button>
<button class="b3-menu__item" data-type="numberFormat" data-format="${colData.numberFormat}">
    <svg class="b3-menu__icon"><use xlink:href="#iconFormat"></use></svg>
    <span class="b3-menu__label">${window.sourceflow.languages.format}</span>
    <span class="b3-menu__accelerator">${getLabelByNumberFormat(colData.numberFormat)}</span>
</button>`;
    } else if (colData.type === "template") {
        html += `<button class="b3-menu__separator" data-id="separator_2"></button>
<button class="b3-menu__item" data-type="nobg">
    <textarea spellcheck="false" rows="${Math.min(colData.template.split("\n").length, 8)}" placeholder="${window.sourceflow.languages.template}" data-type="updateTemplate" style="margin: 4px 0" rows="1" class="fn__block b3-text-field">${colData.template}</textarea>
</button>`;
    } else if (colData.type === "relation") {
        const isSelf = colData.relation?.avID === options.data.id;
        html += `<button class="b3-menu__separator" data-id="separator_2"></button>
<button class="b3-menu__item" data-type="goSearchAV" data-av-id="${colData.relation?.avID || ""}" data-old-value='${JSON.stringify(colData.relation || {})}'>
    <span class="b3-menu__label">${window.sourceflow.languages.relatedTo}</span>
    <span class="b3-menu__accelerator">${isSelf ? window.sourceflow.languages.thisDatabase : ""}</span>
    <svg class="b3-menu__icon b3-menu__icon--small"><use xlink:href="#iconRight"></use></svg>
</button>
<label class="b3-menu__item">
    <span class="fn__flex-center">${window.sourceflow.languages.backRelation}</span>
    <svg class="b3-menu__icon b3-menu__icon--small fn__none"><use xlink:href="#iconHelp"></use></svg>
    <span class="fn__space fn__flex-1"></span>
    <input data-type="backRelation" type="checkbox" class="b3-switch b3-switch--menu" ${colData.relation?.isTwoWay ? "checked" : ""}>
</label>
<div class="b3-menu__item fn__flex-column fn__none" data-type="nobg">
    <input data-old-value="" data-type="colName" style="margin: 8px 0 4px" class="b3-text-field fn__block" placeholder="${options.data.name} ${colData.name}">
</div>
<div class="b3-menu__item fn__flex-column fn__none" data-type="nobg">
    <button style="margin: 4px 0 8px;" class="b3-button fn__block" data-type="updateRelation">${window.sourceflow.languages.confirm}</button>
</div>`;
    } else if (colData.type === "rollup") {
        html += '<button class="b3-menu__separator" data-id="separator_2"></button>' + getRollupHTML({colData});
    } else if (colData.type === "date") {
        html += `<button class="b3-menu__separator" data-id="separator_2"></button>
<label class="b3-menu__item">
    <span class="fn__flex-center">${window.sourceflow.languages.fillCreated}</span>
    <span class="fn__space fn__flex-1"></span>
    <input data-type="fillCreated" type="checkbox" class="b3-switch b3-switch--menu" ${colData.date?.autoFillNow ? "checked" : ""}>
</label>
<label class="b3-menu__item">
    <span class="fn__flex-center">${window.sourceflow.languages.fillSpecificTime}</span>
    <span class="fn__space fn__flex-1"></span>
    <input data-type="fillSpecificTime" type="checkbox" class="b3-switch b3-switch--menu" ${colData.date?.fillSpecificTime ? "checked" : ""}>
</label>`;
    } else if (["updated", "created"].includes(colData.type)) {
        html += `<button class="b3-menu__separator" data-id="separator_2"></button>
<label class="b3-menu__item">
    <span class="fn__flex-center">${window.sourceflow.languages.includeTime}</span>
    <span class="fn__space fn__flex-1"></span>
    <input data-type="includeTime" type="checkbox" class="b3-switch b3-switch--menu" ${(!colData[colData.type as "updated"] || colData[colData.type as "updated"].includeTime) ? "checked" : ""}>
</label>`;
    }
    html += `<button class="b3-menu__separator" data-id="separator_3"></button>
<label class="b3-menu__item">
    <svg class="b3-menu__icon" style=""><use xlink:href="#iconSoftWrap"></use></svg>
    <span class="fn__flex-center">${window.sourceflow.languages.wrap}</span>
    <span class="fn__space fn__flex-1"></span>
    <input type="checkbox" data-type="wrap" class="b3-switch b3-switch--menu"${colData.wrap ? " checked" : ""}>
</label>`;
    if (colData.type !== "block") {
        html += `<button class="b3-menu__item${colData.type === "relation" ? " fn__none" : ""}" data-type="duplicateCol">
    <svg class="b3-menu__icon" style=""><use xlink:href="#iconCopy"></use></svg>
    <span class="b3-menu__label">${window.sourceflow.languages.duplicate}</span>
</button>
<button class="b3-menu__item  b3-menu__item--warning" data-type="removeCol">
    <svg class="b3-menu__icon" style=""><use xlink:href="#iconTrashcan"></use></svg>
    <span class="b3-menu__label">${window.sourceflow.languages.delete}</span>
</button>`;
    }
    return `<div class="b3-menu__items">
    ${html}
</div>
<div class="b3-menu__items fn__none">
    <button class="b3-menu__item" data-type="nobg" data-col-id="${colData.id}">
        <span class="block__icon" style="padding: 8px;margin-left: -4px;" data-type="goEditCol">
            <svg><use xlink:href="#iconLeft"></use></svg>
        </span>
        <span class="b3-menu__label ft__center">${window.sourceflow.languages.edit}</span>
    </button>
    <button class="b3-menu__separator"></button>
    ${genUpdateColItem("text", colData.type)}
    ${genUpdateColItem("number", colData.type)}
    ${genUpdateColItem("select", colData.type)}
    ${genUpdateColItem("mSelect", colData.type)}
    ${genUpdateColItem("date", colData.type)}
    ${genUpdateColItem("mAsset", colData.type)}
    ${genUpdateColItem("checkbox", colData.type)}
    ${genUpdateColItem("url", colData.type)}
    ${genUpdateColItem("email", colData.type)}
    ${genUpdateColItem("phone", colData.type)}
    ${genUpdateColItem("template", colData.type)}
    ${genUpdateColItem("relation", colData.type)}
    ${genUpdateColItem("rollup", colData.type)}
    ${genUpdateColItem("lineNumber", colData.type)}
    ${genUpdateColItem("created", colData.type)}
    ${genUpdateColItem("updated", colData.type)}
</div>`;
};

export const bindEditEvent = (options: {
    protyle: IProtyle,
    data: IAV,
    blockID: string,
    menuElement: HTMLElement,
    isCustomAttr: boolean
}) => {
    const avID = options.data.id;
    const colId = options.menuElement.querySelector(".b3-menu__item").getAttribute("data-col-id");
    const colData = getFieldsByData(options.data).find((item: IAVColumn) => item.id === colId);
    const nameElement = options.menuElement.querySelector('[data-type="name"]') as HTMLInputElement;
    nameElement.addEventListener("blur", () => {
        const newValue = nameElement.value;
        if (newValue === colData.name) {
            return;
        }
        transaction(options.protyle, [{
            action: "updateAttrViewCol",
            id: colId,
            avID,
            name: newValue,
            type: colData.type,
        }], [{
            action: "updateAttrViewCol",
            id: colId,
            avID,
            name: colData.name,
            type: colData.type,
        }]);
        colData.name = newValue;
        updateAttrViewCellAnimation(options.protyle.wysiwyg.element.querySelector(`.av__row--header .av__cell[data-col-id="${colId}"]`), undefined, {name: newValue});
    });
    nameElement.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.isComposing) {
            return;
        }
        if (event.key === "Escape") {
            options.menuElement.parentElement.remove();
        } else if (event.key === "Enter") {
            nameElement.dispatchEvent(new CustomEvent("blur"));
            options.menuElement.parentElement.remove();
        }
    });
    nameElement.addEventListener("keyup", (event: KeyboardEvent) => {
        if (event.isComposing) {
            return;
        }
        const inputElement = options.menuElement.querySelector('[data-type="colName"]') as HTMLInputElement;
        if (inputElement) {
            inputElement.setAttribute("placeholder", `${options.data.name} ${nameElement.value}`);
        }
    });
    nameElement.select();
    nameElement.value = colData.name;
    const descElement = options.menuElement.querySelector('.b3-text-field[data-type="desc"]') as HTMLTextAreaElement;
    nameElement.nextElementSibling.addEventListener("click", () => {
        const descPanelElement = descElement.parentElement;
        descPanelElement.classList.toggle("fn__none");
        if (!descPanelElement.classList.contains("fn__none")) {
            descElement.focus();
        }
    });
    descElement.addEventListener("blur", () => {
        const newValue = descElement.value;
        if (newValue === colData.desc) {
            return;
        }
        transaction(options.protyle, [{
            action: "setAttrViewColDesc",
            id: colId,
            avID,
            data: newValue,
        }], [{
            action: "setAttrViewColDesc",
            id: colId,
            avID,
            data: colData.desc,
        }]);
        colData.desc = newValue;
    });
    descElement.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.isComposing) {
            return;
        }
        if (event.key === "Escape") {
            options.menuElement.parentElement.remove();
        } else if (event.key === "Enter") {
            descElement.dispatchEvent(new CustomEvent("blur"));
            options.menuElement.parentElement.remove();
        }
    });
    descElement.addEventListener("input", () => {
        nameElement.nextElementSibling.setAttribute("aria-label", descElement.value ? escapeHtml(descElement.value) : window.sourceflow.languages.addDesc);
    });
    const tplElement = options.menuElement.querySelector('[data-type="updateTemplate"]') as HTMLTextAreaElement;
    if (tplElement) {
        tplElement.addEventListener("blur", () => {
            const newValue = tplElement.value;
            if (newValue === colData.template) {
                return;
            }
            transaction(options.protyle, [{
                action: "updateAttrViewColTemplate",
                id: colId,
                avID,
                data: newValue,
                type: colData.type,
            }], [{
                action: "updateAttrViewColTemplate",
                id: colId,
                avID,
                data: colData.template,
                type: colData.type,
            }]);
            colData.template = newValue;
        });
        tplElement.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.isComposing) {
                return;
            }
            if (event.key === "Escape") {
                options.menuElement.parentElement.remove();
            } else if (event.key === "Enter" && !event.shiftKey) {
                tplElement.dispatchEvent(new CustomEvent("blur"));
                options.menuElement.parentElement.remove();
            }
        });
    }

    const includeTimeElement = options.menuElement.querySelector('.b3-switch[data-type="includeTime"]') as HTMLInputElement;
    if (includeTimeElement) {
        includeTimeElement.addEventListener("change", () => {
            transaction(options.protyle, [{
                action: colData.type === "updated" ? "setAttrViewUpdatedIncludeTime" : "setAttrViewCreatedIncludeTime",
                id: colId,
                avID,
                data: includeTimeElement.checked,
            }], [{
                action: colData.type === "updated" ? "setAttrViewUpdatedIncludeTime" : "setAttrViewCreatedIncludeTime",
                id: colId,
                avID,
                data: !includeTimeElement.checked,
            }]);
            if (colData[colData.type as "updated"]) {
                colData[colData.type as "updated"].includeTime = includeTimeElement.checked;
            } else {
                colData[colData.type as "updated"] = {includeTime: includeTimeElement.checked};
            }
        });
    }

    const wrapElement = options.menuElement.querySelector('.b3-switch[data-type="wrap"]') as HTMLInputElement;
    if (wrapElement) {
        wrapElement.addEventListener("change", () => {
            transaction(options.protyle, [{
                action: "setAttrViewColWrap",
                id: colId,
                avID,
                data: wrapElement.checked,
                blockID: options.blockID,
                viewID: options.data.viewID,
            }], [{
                action: "setAttrViewColWrap",
                id: colId,
                avID,
                data: !wrapElement.checked,
                viewID: options.data.viewID,
                blockID: options.blockID
            }]);
            colData.wrap = wrapElement.checked;
            options.data.view.wrapField = options.data.view.wrapField && wrapElement.checked;
        });
    }

    const addOptionElement = options.menuElement.querySelector('[data-type="addOption"]') as HTMLInputElement;
    if (addOptionElement) {
        addOptionElement.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.isComposing) {
                return;
            }
            if (event.key === "Escape") {
                options.menuElement.parentElement.remove();
            }
            if (event.key === "Enter") {
                let hasSelected = false;
                colData.options.find((item) => {
                    if (addOptionElement.value === item.name) {
                        hasSelected = true;
                        return true;
                    }
                });
                if (hasSelected || !addOptionElement.value) {
                    return;
                }
                colData.options.push({
                    color: ((colData.options.length || 0) % 14 + 1).toString(),
                    name: addOptionElement.value
                });
                transaction(options.protyle, [{
                    action: "updateAttrViewColOptions",
                    id: colId,
                    avID,
                    data: colData.options
                }], [{
                    action: "removeAttrViewColOption",
                    id: colId,
                    avID,
                    data: addOptionElement.value
                }]);
                options.menuElement.innerHTML = getEditHTML({
                    protyle: options.protyle,
                    colId,
                    data: options.data,
                    isCustomAttr: options.isCustomAttr
                });
                bindEditEvent({
                    protyle: options.protyle,
                    menuElement: options.menuElement,
                    data: options.data,
                    isCustomAttr: options.isCustomAttr,
                    blockID: options.blockID
                });
                (options.menuElement.querySelector('[data-type="addOption"]') as HTMLInputElement).focus();
            }
        });
    }

    const fillCreatedElement = options.menuElement.querySelector('[data-type="fillCreated"]') as HTMLInputElement;
    if (fillCreatedElement) {
        fillCreatedElement.addEventListener("change", () => {
            transaction(options.protyle, [{
                avID,
                action: "setAttrViewColDateFillCreated",
                id: colId,
                data: fillCreatedElement.checked
            }], [{
                avID,
                action: "setAttrViewColDateFillCreated",
                id: colId,
                data: !fillCreatedElement.checked
            }]);
        });
    }

    const fillSpecificTimeElement = options.menuElement.querySelector('[data-type="fillSpecificTime"]') as HTMLInputElement;
    if (fillSpecificTimeElement) {
        fillSpecificTimeElement.addEventListener("change", () => {
            transaction(options.protyle, [{
                avID,
                action: "setAttrViewColDateFillSpecificTime",
                id: colId,
                data: fillSpecificTimeElement.checked
            }], [{
                avID,
                action: "setAttrViewColDateFillSpecificTime",
                id: colId,
                data: !fillSpecificTimeElement.checked
            }]);
        });
    }

    const backRelationElement = options.menuElement.querySelector('[data-type="backRelation"]') as HTMLInputElement;
    if (backRelationElement) {
        backRelationElement.addEventListener("change", () => {
            toggleUpdateRelationBtn(options.menuElement, avID);
        });
        const goSearchElement = options.menuElement.querySelector('[data-type="goSearchAV"]') as HTMLElement;
        const oldValue = JSON.parse(goSearchElement.getAttribute("data-old-value"));
        const inputElement = options.menuElement.querySelector('[data-type="colName"]') as HTMLInputElement;
        inputElement.addEventListener("input", () => {
            toggleUpdateRelationBtn(options.menuElement, avID);
        });
        if (oldValue.avID) {
            fetchPost("/api/av/getAttributeView", {id: oldValue.avID}, (response) => {
                goSearchElement.querySelector(".b3-menu__accelerator").textContent = oldValue.avID === avID ? window.sourceflow.languages.thisDatabase : (response.data.av.name || window.sourceflow.languages._kernel[267]);
                response.data.av.keyValues.find((item: { key: { id: string, name: string } }) => {
                    if (item.key.id === oldValue.backKeyID) {
                        inputElement.setAttribute("data-old-value", item.key.name || window.sourceflow.languages._kernel[272]);
                        inputElement.value = item.key.name || window.sourceflow.languages._kernel[272];
                        return true;
                    }
                });
                toggleUpdateRelationBtn(options.menuElement, avID);
            });
        } else {
            toggleUpdateRelationBtn(options.menuElement, avID);
        }
    }
    bindRollupData(options);
};

const genUpdateColItem = (type: TAVCol, oldType: TAVCol) => {
    return `<button class="b3-menu__item" data-type="updateColType" data-old-type="${oldType}" data-new-type="${type}">
    <svg class="b3-menu__icon"><use xlink:href="#${getColIconByType(type)}"></use></svg>
    <span class="b3-menu__label">${getColNameByType(type)}</span>
    ${type === oldType ? '<svg class="b3-menu__checked"><use xlink:href="#iconSelect"></use></svg></span>' : ""}
</button>`;
};
