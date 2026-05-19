import {transaction} from "../../wysiwyg/transaction";
import {addFilter, setFilter} from "./filter";
import {clearAVPanelMenus, refreshFiltersMenu} from "./panelShared";
import type {AVPanelClickBranchHandler} from "./panelTypes";

export const handleAVPanelFilterClick: AVPanelClickBranchHandler = ({type, target, context}) => {
    if (type === "removeFilters") {
        transaction(context.options.protyle, [{
            action: "setAttrViewFilters",
            avID: context.avID,
            data: [],
            blockID: context.blockID
        }], [{
            action: "setAttrViewFilters",
            avID: context.avID,
            data: context.state.data.view.filters,
            blockID: context.blockID
        }]);
        context.state.data.view.filters = [];
        refreshFiltersMenu(context);
        clearAVPanelMenus();
        return true;
    }
    if (type === "addFilter") {
        addFilter({
            data: context.state.data,
            rect: target.getBoundingClientRect(),
            menuElement: context.menuElement,
            tabRect: context.state.tabRect,
            avId: context.avID,
            protyle: context.options.protyle,
            blockElement: context.options.blockElement
        });
        return true;
    }
    if (type === "removeFilter") {
        clearAVPanelMenus();
        const oldFilters = Object.assign([], context.state.data.view.filters);
        context.state.data.view.filters.find((item: IAVFilter, index: number) => {
            if (item.column === target.parentElement.dataset.id && item.value.type === target.parentElement.dataset.filterType) {
                context.state.data.view.filters.splice(index, 1);
                return true;
            }
        });
        transaction(context.options.protyle, [{
            action: "setAttrViewFilters",
            avID: context.avID,
            data: context.state.data.view.filters,
            blockID: context.blockID
        }], [{
            action: "setAttrViewFilters",
            avID: context.avID,
            data: oldFilters,
            blockID: context.blockID
        }]);
        refreshFiltersMenu(context);
        return true;
    }
    if (type === "setFilter") {
        context.state.data.view.filters.find((item: IAVFilter) => {
            if (item.column === target.parentElement.parentElement.dataset.id &&
                item.value.type === target.parentElement.parentElement.dataset.filterType) {
                setFilter({
                    empty: false,
                    filter: item,
                    protyle: context.options.protyle,
                    data: context.state.data,
                    target,
                    blockElement: context.options.blockElement
                });
                return true;
            }
        });
        return true;
    }
    return false;
};
