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

import {getDefaultOperatorByType, setFilter} from "./filterEditor";
import {getFiltersHTML} from "./filterDisplay";

export const addFilter = (options: {
    data: IAV,
    rect: DOMRect,
    menuElement: HTMLElement,
    tabRect: DOMRect,
    avId: string,
    protyle: IProtyle
    blockElement: Element
}) => {
    const menu = new Menu(Constants.MENU_AV_ADD_FILTER);
    getFieldsByData(options.data).forEach((column) => {
        let filter: IAVFilter;
        options.data.view.filters.find((item) => {
            if (item.column === column.id && item.value.type === column.type) {
                filter = item;
                return true;
            }
        });
        // 该列是行号类型列，则不允许添加到过滤器
        if (!filter && column.type !== "lineNumber") {
            menu.addItem({
                label: column.name,
                iconHTML: column.icon ? unicode2Emoji(column.icon, "b3-menu__icon", true) : `<svg class="b3-menu__icon"><use xlink:href="#${getColIconByType(column.type)}"></use></svg>`,
                click: () => {
                    const cellValue = genCellValue(column.type, column.type === "checkbox" ? {checked: undefined} : "");
                    filter = {
                        column: column.id,
                        operator: getDefaultOperatorByType(column.type),
                        value: cellValue,
                    };
                    options.data.view.filters.push(filter);
                    options.menuElement.innerHTML = getFiltersHTML(options.data);
                    setPosition(options.menuElement, options.tabRect.right - options.menuElement.clientWidth, options.tabRect.bottom, options.tabRect.height);
                    const filterElement = options.menuElement.querySelector(`[data-id="${column.id}"] .b3-chip`) as HTMLElement;
                    setFilter({
                        empty: true,
                        filter,
                        protyle: options.protyle,
                        data: options.data,
                        target: filterElement,
                        blockElement: options.blockElement
                    });
                }
            });
        }
    });
    menu.open({
        x: options.rect.left,
        y: options.rect.bottom,
        h: options.rect.height,
    });
};
