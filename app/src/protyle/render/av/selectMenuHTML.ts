import {Menu} from "../../../plugin/Menu";
import {transaction} from "../../wysiwyg/transaction";
import {hasClosestBlock, hasClosestByClassName} from "../../util/hasClosest";
import {confirmDialog} from "../../../dialog/confirmDialog";
import {upDownHint} from "../../../util/upDownHint";
import {bindEditEvent, getColId, getEditHTML} from "./col";
import {updateAttrViewCellAnimation} from "./cell";
import {genAVValueHTML, isCustomAttr} from "./blockAttr";
import {escapeAriaLabel, escapeAttr, escapeHtml} from "../../../util/escape";
import {genCellValueByElement, getTypeByCellElement} from "./cell";
import * as dayjs from "dayjs";
import {getFieldsByData} from "./view";
import {getFieldIdByCellElement} from "./row";
import {Constants} from "../../../constants";
import {selectRuntimeState} from "./selectState";

export const filterSelectHTML = (key: string, options: {
    name: string,
    color: string,
    desc?: string
}[], selected: string[] = []) => {
    let html = "";
    let hasMatch = false;
    if (selected.length === 0) {
        document.querySelectorAll(".av__panel .b3-chips .b3-chip").forEach((item: HTMLElement) => {
            selected.push(item.dataset.content);
        });
    }
    if (options) {
        const currentName = document.querySelector(".av__panel .b3-menu__item--current")?.getAttribute("data-name") || "";
        options.forEach(item => {
            if (!key ||
                (key.toLowerCase().indexOf(item.name.toLowerCase()) > -1 ||
                    item.name.toLowerCase().indexOf(key.toLowerCase()) > -1)) {
                const airaLabel = item.desc ? `${escapeAriaLabel(item.name)}<div class='ft__on-surface'>${escapeAriaLabel(item.desc || "")}</div>` : "";
                html += `<button data-type="addColOptionOrCell" class="b3-menu__item${currentName === item.name ? " b3-menu__item--current" : ""}" data-name="${escapeAttr(item.name)}" data-desc="${escapeAttr(item.desc || "")}" draggable="true" data-color="${item.color}">
    <svg class="b3-menu__icon fn__grab"><use xlink:href="#iconDrag"></use></svg>
    <div class="fn__flex-1 ariaLabel" data-position="parentW" aria-label="${airaLabel}">
        <span class="b3-chip" style="background-color:var(--b3-font-background${item.color});color:var(--b3-font-color${item.color})">
            <span class="fn__ellipsis">${escapeHtml(item.name)}</span>
        </span>
    </div>
    <svg class="b3-menu__action" data-type="setColOption"><use xlink:href="#iconEdit"></use></svg>
    ${selected.includes(item.name) ? '<svg class="b3-menu__checked"><use xlink:href="#iconSelect"></use></svg></span>' : ""}
</button>`;
            }
            if (key === item.name) {
                hasMatch = true;
            }
        });
    }
    if (!hasMatch && key) {
        html = html.replace('class="b3-menu__item b3-menu__item--current"', 'class="b3-menu__item"');
        const colorIndex = (options?.length || 0) % 14 + 1;
        html = `<button data-type="addColOptionOrCell" class="b3-menu__item b3-menu__item--current" data-name="${key}" data-color="${colorIndex}">
<svg class="b3-menu__icon"><use xlink:href="#iconAdd"></use></svg>
<div class="fn__flex-1">
    <span class="b3-chip" style="background-color:var(--b3-font-background${colorIndex});color:var(--b3-font-color${colorIndex})">
        <span class="fn__ellipsis">${escapeHtml(key)}</span>
    </span>
</div>
<span class="b3-menu__accelerator b3-menu__accelerator--hotkey">${window.sourceflow.languages.enterKey}</span>
</button>${html}`;
    } else if (html.indexOf("b3-menu__item--current") === -1) {
        html = html.replace('class="b3-menu__item"', 'class="b3-menu__item b3-menu__item--current"');
    }
    return html;
};

export const getSelectHTML = (fields: IAVColumn[], cellElements: HTMLElement[], init = false, blockElement: Element) => {
    if (init) {
        // 快速选中后如果 render 了再使用 genCellValueByElement 获取的元素和当前选中的不一致， https://github.com/lonelyor/SourceFlow/issues/11268
        selectRuntimeState.cellValues = [];
        const isCustomAttr = cellElements[0].classList.contains("custom-attr__avvalue");
        cellElements.forEach(item => {
            selectRuntimeState.cellValues.push(genCellValueByElement(isCustomAttr ? item.dataset.type as TAVCol : getTypeByCellElement(item), item));
        });
    }
    const colId = getColId(cellElements[0], blockElement.getAttribute("data-av-type") as TAVView);
    const colData = fields.find(item => {
        if (item.id === colId) {
            return item;
        }
    });
    let selectedHTML = "";
    const selected: string[] = [];
    selectRuntimeState.cellValues[0].mSelect?.forEach((item) => {
        selected.push(item.content);
        selectedHTML += `<div class="b3-chip b3-chip--middle" data-content="${escapeAttr(item.content)}" style="white-space: nowrap;max-width:100%;background-color:var(--b3-font-background${item.color});color:var(--b3-font-color${item.color})"><span class="fn__ellipsis">${escapeHtml(item.content)}</span><svg class="b3-chip__close" data-type="removeCellOption"><use xlink:href="#iconCloseRound"></use></svg></div>`;
    });

    return `<div class="b3-menu__items" style="display: flex;flex-direction: column;flex: 1;">
<div class="b3-chips" style="max-width: 50vw">
    ${selectedHTML}
    <input>
</div>
<div style="flex: 1;overflow: auto;">${filterSelectHTML("", colData.options, selected)}</div>
</div>`;
};
