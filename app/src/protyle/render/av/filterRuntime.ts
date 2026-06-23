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
import {filterSelect, toggleEmpty} from "./filterShared";

export const setFilter = async (options: {
    filter: IAVFilter,
    protyle: IProtyle,
    data: IAV,
    target: HTMLElement,
    blockElement: Element,
    empty: boolean
}) => {
    let rectTarget = options.target.getBoundingClientRect();
    if (rectTarget.height === 0) {
        rectTarget = options.protyle.wysiwyg.element.querySelector(`[data-col-id="${options.target.dataset.colId}"]`).getBoundingClientRect();
    }
    const blockID = options.blockElement.getAttribute("data-node-id");
    let operationElement: HTMLSelectElement = undefined;
    const menu = new Menu("set-filter-" + options.filter.column, () => {
        const oldFilters = JSON.parse(JSON.stringify(options.data.view.filters));
        if (!operationElement || !operationElement.value) {
            return;
        }
        const newFilter: IAVFilter = {
            column: options.filter.column,
            value: {
                type: options.filter.value.type
            },
            operator: operationElement.value as TAVFilterOperator
        };
        let hasMatch = false;
        let newValue;
        if (filterValue.type === "select" || filterValue.type === "mSelect") {
            const mSelect: {
                color: string,
                content: string
            }[] = [];
            window.sourceflow.menus.menu.element.querySelectorAll("svg").forEach(item => {
                if (item.firstElementChild.getAttribute("xlink:href") === "#iconCheck") {
                    const chipElement = item.nextElementSibling.firstElementChild as HTMLElement;
                    mSelect.push({
                        color: chipElement.dataset.color,
                        content: chipElement.dataset.name
                    });
                }
            });
            newValue = genCellValue(filterValue.type, mSelect);
        } else if (["date", "updated", "created"].includes(filterValue.type)) {
            const typeElement = menu.element.querySelector('.b3-select[data-type="dateType"]') as HTMLSelectElement;
            const directElements = menu.element.querySelectorAll('.b3-select[data-type="dataDirection"]') as NodeListOf<HTMLSelectElement>;
            if (typeElement.value === "custom") {
                newFilter.relativeDate = {
                    count: parseInt((directElements[0].parentElement.querySelector(".b3-text-field") as HTMLInputElement).value || "1"),
                    unit: parseInt((directElements[0].parentElement.lastElementChild as HTMLSelectElement).value),
                    direction: parseInt(directElements[0].value)
                };
                newFilter.relativeDate2 = {
                    count: parseInt((directElements[1].parentElement.querySelector(".b3-text-field") as HTMLInputElement).value || "1"),
                    unit: parseInt((directElements[1].parentElement.lastElementChild as HTMLSelectElement).value),
                    direction: parseInt(directElements[1].value)
                };
                newValue = {type: filterValue.type};
            } else {
                newValue = genCellValue(filterValue.type, {
                    isNotEmpty2: textElements[2].value !== "",
                    isNotEmpty: textElements[0].value !== "",
                    content: textElements[0].value ? new Date(textElements[0].value + " 00:00").getTime() : 0,
                    content2: textElements[2].value ? new Date(textElements[2].value + " 00:00").getTime() : 0,
                    hasEndDate: newFilter.operator === "Is between",
                    isNotTime: true,
                });
                newFilter.relativeDate = null;
                newFilter.relativeDate2 = null;
            }
        } else if (["text", "mAsset", "url", "block", "email", "phone", "template", "relation", "number"].includes(filterValue.type)) {
            newValue = genCellValue(filterValue.type, textElements[0].value);
        } else if (filterValue.type === "checkbox") {
            newValue = genCellValue(filterValue.type, {
                checked: newFilter.operator === "Is true"
            });
        } else {
            newValue = genCellValue(filterValue.type, undefined);
        }
        if (options.filter.value.type === "rollup") {
            newFilter.value = {
                rollup: {
                    contents: [newValue],
                },
                type: "rollup"
            };
        } else {
            newFilter.value = newValue;
        }
        if (["rollup", "mAsset"].includes(options.filter.value.type)) {
            newFilter.quantifier = (menu.element.querySelector('.b3-select[data-type="quantifier"]') as HTMLSelectElement).value;
        }
        let isSame = false;
        options.data.view.filters.find((filter, index) => {
            if (filter.column === options.filter.column && filter.value.type === options.filter.value.type) {
                if (filter.value.type === "checkbox") {
                    hasMatch = true;
                    options.data.view.filters[index] = newFilter;
                    return true;
                }
                if (objEquals(filter, newFilter)) {
                    isSame = true;
                    return true;
                }
                options.data.view.filters[index] = newFilter;
                hasMatch = true;
                return true;
            }
        });
        if (!options.empty && (isSame || !hasMatch)) {
            return;
        }
        transaction(options.protyle, [{
            action: "setAttrViewFilters",
            avID: options.data.id,
            data: options.data.view.filters,
            blockID
        }], [{
            action: "setAttrViewFilters",
            avID: options.data.id,
            data: oldFilters,
            blockID
        }]);
        const menuElement = hasClosestByClassName(options.target, "b3-menu");
        if (menuElement) {
            menuElement.innerHTML = getFiltersHTML(options.data);
        }
    });
    if (menu.isOpen) {
        return;
    }
    let selectHTML = "";
    let colData: IAVColumn;
    const fields = getFieldsByData(options.data);
    fields.find((column) => {
        if (column.id === options.filter.column) {
            colData = column;
            return true;
        }
    });
    let filterValue: IAVCellValue = JSON.parse(JSON.stringify(options.filter.value));
    if (colData.type === "rollup") {
        if (!colData.rollup || !colData.rollup.relationKeyID || !colData.rollup.keyID) {
            showMessage(window.sourceflow.languages.plsChoose);
            document.querySelector(".av__panel")?.remove();
            openMenuPanel({
                protyle: options.protyle,
                blockElement: options.blockElement,
                type: "edit",
                colId: colData.id
            });
            return;
        }
        if (colData.rollup.calc?.operator && !["Range", "Unique values"].includes(colData.rollup.calc.operator)) {
            if (["Count all", "Count empty", "Count not empty", "Count values", "Count unique values", "Percent empty",
                "Percent not empty", "Percent unique values", "Percent checked", "Percent unchecked",
                "Sum", "Average", "Median", "Min", "Max"].includes(colData.rollup.calc.operator)) {
                filterValue.type = "number";
            } else if (["Checked", "Unchecked"].includes(colData.rollup.calc.operator)) {
                filterValue.type = "checkbox";
            } else if (["Earliest", "Latest"].includes(colData.rollup.calc.operator)) {
                filterValue.type = "date";
            }
        } else {
            let targetAVId = "";
            fields.find((column) => {
                if (column.id === colData.rollup.relationKeyID) {
                    targetAVId = column.relation.avID;
                    return true;
                }
            });
            const response = await fetchSyncPost("/api/av/getAttributeView", {id: targetAVId});
            response.data.av.keyValues.find((item: {
                key: {
                    id: string,
                    name: string,
                    type: TAVCol,
                    options: {
                        name: string,
                        color: string,
                    }[]
                }
            }) => {
                if (item.key.id === colData.rollup.keyID) {
                    filterValue.type = item.key.type;
                    if (item.key.type === "select") {
                        colData.options = item.key.options;
                    }
                    return true;
                }
            });
        }

        options.data.view.filters.find(item => {
            if (item.column === colData.id && item.value.type === "rollup") {
                if (!item.value.rollup || !item.value.rollup.contents || item.value.rollup.contents.length === 0) {
                    const colType = filterValue.type === "select" ? "mSelect" : filterValue.type;
                    filterValue = {
                        [colType]: genCellValue(filterValue.type, filterValue.type === "checkbox" ? {checked: undefined} : "")[colType as "text"],
                        type: filterValue.type
                    };
                } else {
                    filterValue = item.value.rollup.contents[0];
                }
                return true;
            }
        });
    }
    let checkboxInit = false;
    if (filterValue.type === "checkbox") {
        checkboxInit = typeof filterValue.checkbox === "undefined" || typeof filterValue.checkbox.checked === "undefined";
    }
    switch (filterValue.type) {
        case "checkbox":
            selectHTML = `<option ${("Is true" === options.filter.operator && !checkboxInit) ? "selected" : ""} value="Is true">${window.sourceflow.languages.checked}</option>
<option ${("Is false" === options.filter.operator && !checkboxInit) ? "selected" : ""} value="Is false">${window.sourceflow.languages.unchecked}</option>`;
            if (checkboxInit) {
                selectHTML = `<option selected></option>${selectHTML}`;
            }
            break;
        case "block":
        case "mAsset":
        case "text":
        case "url":
        case "phone":
        case "email":
            selectHTML = `<option ${"=" === options.filter.operator ? "selected" : ""} value="=">${window.sourceflow.languages.filterOperatorIs}</option>
<option ${"!=" === options.filter.operator ? "selected" : ""} value="!=">${window.sourceflow.languages.filterOperatorIsNot}</option>
<option ${"Contains" === options.filter.operator ? "selected" : ""} value="Contains">${window.sourceflow.languages.filterOperatorContains}</option>
<option ${"Does not contains" === options.filter.operator ? "selected" : ""} value="Does not contains">${window.sourceflow.languages.filterOperatorDoesNotContain}</option>
<option ${"Starts with" === options.filter.operator ? "selected" : ""} value="Starts with">${window.sourceflow.languages.filterOperatorStartsWith}</option>
<option ${"Ends with" === options.filter.operator ? "selected" : ""} value="Ends with">${window.sourceflow.languages.filterOperatorEndsWith}</option>
<option ${"Is empty" === options.filter.operator ? "selected" : ""} value="Is empty">${window.sourceflow.languages.filterOperatorIsEmpty}</option>
<option ${"Is not empty" === options.filter.operator ? "selected" : ""} value="Is not empty">${window.sourceflow.languages.filterOperatorIsNotEmpty}</option>`;
            break;
        case "template":
            selectHTML = `<option ${"=" === options.filter.operator ? "selected" : ""} value="=">${window.sourceflow.languages.filterOperatorIs}</option>
<option ${"!=" === options.filter.operator ? "selected" : ""} value="!=">${window.sourceflow.languages.filterOperatorIsNot}</option>
<option ${"Contains" === options.filter.operator ? "selected" : ""} value="Contains">${window.sourceflow.languages.filterOperatorContains}</option>
<option ${"Does not contains" === options.filter.operator ? "selected" : ""} value="Does not contains">${window.sourceflow.languages.filterOperatorDoesNotContain}</option>
<option ${"Starts with" === options.filter.operator ? "selected" : ""} value="Starts with">${window.sourceflow.languages.filterOperatorStartsWith}</option>
<option ${"Ends with" === options.filter.operator ? "selected" : ""} value="Ends with">${window.sourceflow.languages.filterOperatorEndsWith}</option>
<option ${"Is empty" === options.filter.operator ? "selected" : ""} value="Is empty">${window.sourceflow.languages.filterOperatorIsEmpty}</option>
<option ${"Is not empty" === options.filter.operator ? "selected" : ""} value="Is not empty">${window.sourceflow.languages.filterOperatorIsNotEmpty}</option>
<option ${">" === options.filter.operator ? "selected" : ""} value=">">&gt;</option>
<option ${"<" === options.filter.operator ? "selected" : ""} value="<">&lt;</option>
<option ${">=" === options.filter.operator ? "selected" : ""} value=">=">&GreaterEqual;</option>
<option ${"<=" === options.filter.operator ? "selected" : ""} value="<=">&le;</option>`;
            break;
        case "date":
        case "created":
        case "updated":
            selectHTML = `<option ${"=" === options.filter.operator ? "selected" : ""} value="=">${window.sourceflow.languages.filterOperatorIs}</option>
<option ${">" === options.filter.operator ? "selected" : ""} value=">">${window.sourceflow.languages.filterOperatorIsAfter}</option>
<option ${"<" === options.filter.operator ? "selected" : ""} value="<">${window.sourceflow.languages.filterOperatorIsBefore}</option>
<option ${">=" === options.filter.operator ? "selected" : ""} value=">=">${window.sourceflow.languages.filterOperatorIsOnOrAfter}</option>
<option ${"<=" === options.filter.operator ? "selected" : ""} value="<=">${window.sourceflow.languages.filterOperatorIsOnOrBefore}</option>
<option ${"Is between" === options.filter.operator ? "selected" : ""} value="Is between">${window.sourceflow.languages.filterOperatorIsBetween}</option>
<option ${"Is empty" === options.filter.operator ? "selected" : ""} value="Is empty">${window.sourceflow.languages.filterOperatorIsEmpty}</option>
<option ${"Is not empty" === options.filter.operator ? "selected" : ""} value="Is not empty">${window.sourceflow.languages.filterOperatorIsNotEmpty}</option>`;
            break;
        case "number":
            selectHTML = `<option ${"=" === options.filter.operator ? "selected" : ""} value="=">=</option>
<option ${"!=" === options.filter.operator ? "selected" : ""} value="!=">!=</option>
<option ${">" === options.filter.operator ? "selected" : ""} value=">">&gt;</option>
<option ${"<" === options.filter.operator ? "selected" : ""} value="<">&lt;</option>
<option ${">=" === options.filter.operator ? "selected" : ""} value=">=">&GreaterEqual;</option>
<option ${"<=" === options.filter.operator ? "selected" : ""} value="<=">&le;</option>
<option ${"Is empty" === options.filter.operator ? "selected" : ""} value="Is empty">${window.sourceflow.languages.filterOperatorIsEmpty}</option>
<option ${"Is not empty" === options.filter.operator ? "selected" : ""} value="Is not empty">${window.sourceflow.languages.filterOperatorIsNotEmpty}</option>`;
            break;
        case "mSelect":
        case "relation":
            selectHTML = `<option ${"Contains" === options.filter.operator ? "selected" : ""} value="Contains">${window.sourceflow.languages.filterOperatorContains}</option>
<option ${"Does not contains" === options.filter.operator ? "selected" : ""} value="Does not contains">${window.sourceflow.languages.filterOperatorDoesNotContain}</option>
<option ${"Is empty" === options.filter.operator ? "selected" : ""} value="Is empty">${window.sourceflow.languages.filterOperatorIsEmpty}</option>
<option ${"Is not empty" === options.filter.operator ? "selected" : ""} value="Is not empty">${window.sourceflow.languages.filterOperatorIsNotEmpty}</option>`;
            break;
        case "select":
            selectHTML = `<option ${"=" === options.filter.operator ? "selected" : ""} value="=">${window.sourceflow.languages.filterOperatorIs}</option>
<option ${"!=" === options.filter.operator ? "selected" : ""} value="!=">${window.sourceflow.languages.filterOperatorIsNot}</option>
<option ${"Is empty" === options.filter.operator ? "selected" : ""} value="Is empty">${window.sourceflow.languages.filterOperatorIsEmpty}</option>
<option ${"Is not empty" === options.filter.operator ? "selected" : ""} value="Is not empty">${window.sourceflow.languages.filterOperatorIsNotEmpty}</option>`;
            break;
    }
    if (["rollup", "mAsset"].includes(options.filter.value.type)) {
        menu.addItem({
            iconHTML: "",
            type: "readonly",
            label: ` <select style="margin: 4px 0" class="b3-select fn__size200" data-type="quantifier">
    <option ${(options.filter.quantifier === "" || options.filter.quantifier === "Any") ? "selected" : ""} value="Any">${window.sourceflow.languages.filterQuantifierAny}</option>
    <option ${"All" === options.filter.quantifier ? "selected" : ""} value="All">${window.sourceflow.languages.filterQuantifierAll}</option>
    <option ${"None" === options.filter.quantifier ? "selected" : ""} value="None">${window.sourceflow.languages.filterQuantifierNone}</option>
</select>`
        });
    }
    menu.addItem({
        iconHTML: "",
        type: "readonly",
        label: `<select style="margin: 4px 0" class="b3-select fn__size200" data-type="operation">${selectHTML}</select>`
    });
    if (filterValue.type === "select" || filterValue.type === "mSelect") {
        if (colData.options?.length > 0) {
            menu.addItem({
                iconHTML: "",
                type: "readonly",
                label: `<input class="b3-text-field fn__size200" style="margin: 4px 0" placeholder="${window.sourceflow.languages.search}">`,
                bind(element) {
                    const selectSearchElement = element.querySelector("input");
                    selectSearchElement.addEventListener("keydown", (event: KeyboardEvent) => {
                        if (event.isComposing) {
                            return;
                        }
                        let currentElement = upDownHint(menu.element.querySelector(".b3-menu__items"), event, "b3-menu__item--current", element.nextElementSibling);
                        if (event.key === "Enter") {
                            if (!currentElement) {
                                currentElement = menu.element.querySelector(".b3-menu__item--current");
                            }
                            currentElement.dispatchEvent(new CustomEvent("click"));
                        }
                    });
                    selectSearchElement.addEventListener("input", (event: InputEvent) => {
                        if (event.isComposing) {
                            return;
                        }
                        filterSelect(selectSearchElement.value.toLowerCase());
                    });
                    selectSearchElement.addEventListener("compositionend", () => {
                        filterSelect(selectSearchElement.value.toLowerCase());
                    });
                }
            });
        }
        colData.options?.forEach((option) => {
            let icon = "iconUncheck";
            filterValue?.mSelect?.find((optionItem: IAVCellSelectValue) => {
                if (optionItem.content === option.name) {
                    icon = "iconCheck";
                }
            });
            menu.addItem({
                icon,
                label: `<span class="b3-chip b3-chip--middle" data-name="${option.name}" data-color="${option.color}" style="max-width: 178px;margin:3px 0;background-color:var(--b3-font-background${option.color});color:var(--b3-font-color${option.color})">
    <span class="fn__ellipsis">${option.name}</span>
</span>`,
                bind(element) {
                    element.addEventListener("click", () => {
                        const useElement = element.querySelector("use");
                        if (useElement.getAttribute("xlink:href") === "#iconUncheck") {
                            useElement.setAttribute("xlink:href", "#iconCheck");
                        } else {
                            useElement.setAttribute("xlink:href", "#iconUncheck");
                        }
                    });
                }
            });
        });
    } else if (["text", "url", "block", "mAsset", "email", "phone", "template"].includes(filterValue.type)) {
        let value = "";
        if (filterValue) {
            if (filterValue.type === "mAsset") {
                if (filterValue.mAsset) {
                    value = filterValue.mAsset[0]?.content || "";
                }
            } else {
                value = filterValue[filterValue.type as "text"].content || "";
            }
        }
        menu.addItem({
            iconHTML: "",
            type: "readonly",
            label: `<input style="margin: 4px 0" value="${value}" class="b3-text-field fn__size200">`
        });
    } else if (filterValue.type === "relation") {
        let value = "";
        if (filterValue) {
            value = filterValue.relation.blockIDs[0] || "";
        }
        menu.addItem({
            iconHTML: "",
            type: "readonly",
            label: `<input style="margin: 4px 0" value="${value}" class="b3-text-field fn__size200"><div style="position:fixed" class="protyle-hint b3-list b3-list--background fn__none"></div>`,
            bind(element) {
                const inputElement = element.querySelector("input");
                const listElement = inputElement.nextElementSibling as HTMLElement;
                const renderList = () => {
                    if (!colData.relation || !colData.relation.avID) {
                        return;
                    }
                    fetchPost("/api/av/getAttributeViewPrimaryKeyValues", {
                        id: colData.relation.avID,
                        keyword: inputElement.value,
                    }, response => {
                        let html = "";
                        (response.data.rows.values as IAVCellValue[] || []).forEach((item, index) => {
                            html += `<div class="b3-list-item${index === 0 ? " b3-list-item--focus" : ""}">${item.block.content || window.sourceflow.languages.untitled}</div>`;
                        });
                        listElement.innerHTML = html;
                        if (html === "") {
                            listElement.classList.add("fn__none");
                        } else {
                            listElement.classList.remove("fn__none");
                        }
                        const inputRect = inputElement.getBoundingClientRect();
                        setPosition(listElement, inputRect.left, inputRect.bottom + 4, inputRect.height + 4);
                    });
                };
                inputElement.addEventListener("input", (event: KeyboardEvent) => {
                    if (event.isComposing) {
                        return;
                    }
                    renderList();
                });
                inputElement.addEventListener("compositionend", () => {
                    renderList();
                });
                inputElement.addEventListener("keydown", (event) => {
                    if (event.isComposing) {
                        return;
                    }
                    if (event.key !== "Enter" && listElement.innerHTML !== "") {
                        listElement.classList.remove("fn__none");
                    }
                    upDownHint(listElement, event);
                    if (event.key === "Enter") {
                        if (listElement.classList.contains("fn__none")) {
                            menu.close();
                        } else {
                            inputElement.value = listElement.querySelector(".b3-list-item--focus").textContent.replace(/\n/g, " ");
                            listElement.classList.add("fn__none");
                        }
                        event.preventDefault();
                        event.stopPropagation();
                    }
                });
                listElement.addEventListener("click", (event) => {
                    const itemElement = hasClosestByClassName(event.target as Element, "b3-list-item");
                    if (itemElement) {
                        inputElement.value = itemElement.textContent.replace(/\n/g, " ");
                        listElement.classList.add("fn__none");
                    }
                });
            }
        });
    } else if (filterValue.type === "number") {
        menu.addItem({
            iconHTML: "",
            type: "readonly",
            label: `<input style="margin: 4px 0" value="${filterValue?.number.isNotEmpty ? filterValue.number.content : ""}" class="b3-text-field fn__size200">`
        });
    } else if (["date", "updated", "created"].includes(filterValue.type)) {
        const dateValue = filterValue ? filterValue[filterValue.type as "date"] : null;
        const showToday = !options.filter.relativeDate?.direction;
        const showToday2 = !options.filter.relativeDate2?.direction;
        menu.addItem({
            iconHTML: "",
            type: "readonly",
            label: `<div data-type="filter1">
    <div class="fn__size200">
        <select class="b3-select fn__block" data-type="dateType">
            <option value="time"${!options.filter.relativeDate ? " selected" : ""}>${window.sourceflow.languages.includeTime}</option>
            <option value="custom"${options.filter.relativeDate ? " selected" : ""}>${window.sourceflow.languages.relativeToToday}</option>
        </select>
    </div>
    <div class="fn__hr"></div>
    <div class="fn__size200 ${options.filter.relativeDate ? "fn__none" : ""}">
        <input value="${(dateValue && (dateValue.isNotEmpty || filterValue.type !== "date")) ? dayjs(dateValue.content).format("YYYY-MM-DD") : ""}" type="date" max="9999-12-31" class="b3-text-field fn__block">
    </div>
    <div class="fn__flex fn__size200 ${options.filter.relativeDate ? "" : "fn__none"}">
        <select class="b3-select" data-type="dataDirection">
            <option value="-1"${options.filter.relativeDate?.direction === -1 ? " selected" : ""}>${window.sourceflow.languages.pastDate}</option>
            <option value="1"${options.filter.relativeDate?.direction === 1 ? " selected" : ""}>${window.sourceflow.languages.nextDate}</option>
            <option value="0"${showToday ? " selected" : ""}>${window.sourceflow.languages.current}</option>
        </select>
        <span class="fn__space"></span>
        <input type="number" min="1" oninput="this.value = Math.max(this.value, 1)" step="1" value="${options.filter.relativeDate?.count || 1}" class="b3-text-field fn__flex-1${showToday ? " fn__none" : ""}"/>
        <span class="fn__space${showToday ? " fn__none" : ""}"></span>
        <select class="b3-select fn__flex-1">
            <option value="0"${options.filter.relativeDate?.unit === 0 ? " selected" : ""}>${window.sourceflow.languages.day}</option>
            <option value="1"${(!options.filter.relativeDate || options.filter.relativeDate?.unit === 1) ? " selected" : ""}>${window.sourceflow.languages.week}</option>
            <option value="2"${options.filter.relativeDate?.unit === 2 ? " selected" : ""}>${window.sourceflow.languages.month}</option>
            <option value="3"${options.filter.relativeDate?.unit === 3 ? " selected" : ""}>${window.sourceflow.languages.year}</option>
        </select>
    </div>
    <div class="fn__hr--small"></div>
</div>
<div data-type="filter2 fn__none">
    <div class="fn__hr--small"></div>
    <div class="fn__size200 ${options.filter.relativeDate2 ? "fn__none" : ""}">
        <input value="${(dateValue && dateValue.isNotEmpty2) ? dayjs(dateValue.content2).format("YYYY-MM-DD") : ""}" type="date" max="9999-12-31" class="b3-text-field fn__block">
    </div>
    <div class="fn__flex fn__size200 ${options.filter.relativeDate2 ? "" : "fn__none"}">
        <select class="b3-select" data-type="dataDirection">
            <option value="-1"${options.filter.relativeDate2?.direction === -1 ? " selected" : ""}>${window.sourceflow.languages.pastDate}</option>
            <option value="1"${options.filter.relativeDate2?.direction === 1 ? " selected" : ""}>${window.sourceflow.languages.nextDate}</option>
            <option value="0"${showToday2 ? " selected" : ""}>${window.sourceflow.languages.current}</option>
        </select>
        <span class="fn__space"></span>
        <input type="number" min="1" step="1" oninput="this.value = Math.max(this.value, 1)" value="${options.filter.relativeDate2?.count || 1}" class="b3-text-field fn__flex-1${showToday2 ? " fn__none" : ""}"/>
        <span class="fn__space${showToday2 ? " fn__none" : ""}"></span>
        <select class="b3-select fn__flex-1">
            <option value="0"${options.filter.relativeDate2?.unit === 0 ? " selected" : ""}>${window.sourceflow.languages.day}</option>
            <option value="1"${(!options.filter.relativeDate2 || options.filter.relativeDate2?.unit === 1) ? " selected" : ""}>${window.sourceflow.languages.week}</option>
            <option value="2"${options.filter.relativeDate2?.unit === 2 ? " selected" : ""}>${window.sourceflow.languages.month}</option>
            <option value="3"${options.filter.relativeDate2?.unit === 3 ? " selected" : ""}>${window.sourceflow.languages.year}</option>
        </select>
    </div>
    <div class="fn__hr--small"></div>
</div>`
        });
    }
    menu.addItem({
        icon: "iconTrashcan",
        label: window.sourceflow.languages.removeFilters,
        click() {
            const oldFilters = Object.assign([], options.data.view.filters);
            options.data.view.filters.find((item: IAVFilter, index: number) => {
                if (item.column === options.filter.column && options.filter.value.type === item.value.type) {
                    options.data.view.filters.splice(index, 1);
                    return true;
                }
            });
            transaction(options.protyle, [{
                action: "setAttrViewFilters",
                avID: options.data.id,
                data: options.data.view.filters,
                blockID
            }], [{
                action: "setAttrViewFilters",
                avID: options.data.id,
                data: oldFilters,
                blockID
            }]);
            const menuElement = hasClosestByClassName(options.target, "b3-menu");
            if (menuElement) {
                menuElement.innerHTML = getFiltersHTML(options.data);
            }
        }
    });
    operationElement = (menu.element.querySelector('.b3-select[data-type="operation"]') as HTMLSelectElement);
    operationElement?.addEventListener("change", () => {
        toggleEmpty(operationElement, operationElement.value, filterValue.type);
    });
    const dateTypeElement = menu.element.querySelector('.b3-select[data-type="dateType"]') as HTMLSelectElement;
    dateTypeElement?.addEventListener("change", () => {
        const directionElements = menu.element.querySelectorAll('[data-type="dataDirection"]');
        const customerElement = directionElements[0].parentElement;
        const customer2Element = directionElements[1].parentElement;
        const timeElement = customerElement.previousElementSibling;
        const time2Element = customer2Element.previousElementSibling;
        if (dateTypeElement.value === "custom") {
            customerElement.classList.remove("fn__none");
            customer2Element.classList.remove("fn__none");
            timeElement.classList.add("fn__none");
            time2Element.classList.add("fn__none");
        } else {
            customerElement.classList.add("fn__none");
            customer2Element.classList.add("fn__none");
            timeElement.classList.remove("fn__none");
            time2Element.classList.remove("fn__none");
        }
    });
    menu.element.querySelectorAll('.b3-select[data-type="dataDirection"]').forEach((item: HTMLSelectElement) => {
        item.addEventListener("change", () => {
            const countElement = item.nextElementSibling.nextElementSibling;
            if (item.value === "0") {
                countElement.classList.add("fn__none");
                countElement.nextElementSibling.classList.add("fn__none");
            } else {
                countElement.classList.remove("fn__none");
                countElement.nextElementSibling.classList.remove("fn__none");
            }
        });
    });

    const textElements: NodeListOf<HTMLInputElement> = menu.element.querySelectorAll(".b3-text-field");
    if (!["relation", "select", "mSelect"].includes(filterValue.type)) {
        textElements.forEach(item => {
            item.addEventListener("keydown", (event: KeyboardEvent) => {
                if (event.isComposing) {
                    event.preventDefault();
                    return;
                }
                if (event.key === "Enter") {
                    menu.close();
                    event.preventDefault();
                }
            });
        });
    }
    toggleEmpty(operationElement, operationElement.value, filterValue.type);
    menu.open({x: rectTarget.left, y: rectTarget.bottom});
    if (textElements.length > 0) {
        textElements[0].select();
    }
};
