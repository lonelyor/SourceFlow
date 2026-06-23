import {transaction} from "../../wysiwyg/transaction";
import {addSort} from "./sort";
import {refreshSortsMenu} from "./panelShared";
import type {AVPanelClickBranchHandler} from "./panelTypes";

export const handleAVPanelSortClick: AVPanelClickBranchHandler = ({type, target, context}) => {
    if (type === "removeSorts") {
        transaction(context.options.protyle, [{
            action: "setAttrViewSorts",
            avID: context.avID,
            data: [],
            blockID: context.blockID
        }], [{
            action: "setAttrViewSorts",
            avID: context.avID,
            data: context.state.data.view.sorts,
            blockID: context.blockID
        }]);
        context.state.data.view.sorts = [];
        refreshSortsMenu(context);
        return true;
    }
    if (type === "addSort") {
        addSort({
            data: context.state.data,
            rect: target.getBoundingClientRect(),
            menuElement: context.menuElement,
            tabRect: context.state.tabRect,
            avId: context.avID,
            protyle: context.options.protyle,
            blockID: context.blockID,
        });
        return true;
    }
    if (type === "removeSort") {
        const oldSorts = Object.assign([], context.state.data.view.sorts);
        context.state.data.view.sorts.find((item: IAVSort, index: number) => {
            if (item.column === target.parentElement.dataset.id) {
                context.state.data.view.sorts.splice(index, 1);
                return true;
            }
        });
        transaction(context.options.protyle, [{
            action: "setAttrViewSorts",
            avID: context.avID,
            data: context.state.data.view.sorts,
            blockID: context.blockID
        }], [{
            action: "setAttrViewSorts",
            avID: context.avID,
            data: oldSorts,
            blockID: context.blockID
        }]);
        refreshSortsMenu(context);
        return true;
    }
    return false;
};
