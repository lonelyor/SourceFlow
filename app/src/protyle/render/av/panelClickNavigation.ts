import {hideElements} from "../../ui/hideElements";
import {bindLayoutEvent, getLayoutHTML} from "./layout";
import {openCalcMenu} from "./calc";
import {goSearchRollupCol} from "./rollup";
import {bindViewEvent, getViewHTML} from "./view";
import {openSearchAV, updateRelation} from "./relation";
import {
    clearAVPanelMenus,
    closeAVPanel,
    positionAVPanelMenu,
    recomputeAVPanelTabRect,
    refreshFiltersMenu,
    refreshPropertiesMenu,
    refreshSortsMenu,
    resolveAVPanelColId
} from "./panelShared";
import type {AVPanelClickBranchHandler} from "./panelTypes";

export const handleAVPanelNavigationClick: AVPanelClickBranchHandler = async ({type, target, context}) => {
    if (type === "close") {
        if (!context.options.protyle.toolbar.subElement.classList.contains("fn__none")) {
            hideElements(["util"], context.options.protyle);
        } else if (!window.sourceflow.menus.menu.element.classList.contains("fn__none")) {
            // 过滤面板先关闭过滤条件
        } else {
            closeAVPanel(context);
        }
        clearAVPanelMenus();
        return true;
    }
    if (type === "go-config") {
        context.menuElement.innerHTML = getViewHTML(context.state.data);
        positionAVPanelMenu(context);
        bindViewEvent({
            protyle: context.options.protyle,
            data: context.state.data,
            menuElement: context.menuElement,
            blockElement: context.options.blockElement
        });
        clearAVPanelMenus();
        return true;
    }
    if (type === "go-properties") {
        recomputeAVPanelTabRect(context);
        refreshPropertiesMenu(context);
        clearAVPanelMenus();
        return true;
    }
    if (type === "go-layout") {
        context.menuElement.innerHTML = getLayoutHTML(context.state.data);
        positionAVPanelMenu(context);
        bindLayoutEvent({
            protyle: context.options.protyle,
            data: context.state.data,
            menuElement: context.menuElement,
            blockElement: context.options.blockElement
        });
        clearAVPanelMenus();
        return true;
    }
    if (type === "goSorts") {
        refreshSortsMenu(context);
        clearAVPanelMenus();
        return true;
    }
    if (type === "goFilters") {
        refreshFiltersMenu(context);
        clearAVPanelMenus();
        return true;
    }
    if (type === "goSearchAV") {
        openSearchAV(context.avID, target, undefined, false);
        return true;
    }
    if (type === "goSearchRollupCol") {
        goSearchRollupCol({
            target,
            data: context.state.data,
            isRelation: true,
            protyle: context.options.protyle,
            colId: resolveAVPanelColId(context)
        });
        return true;
    }
    if (type === "goSearchRollupTarget") {
        goSearchRollupCol({
            target,
            data: context.state.data,
            isRelation: false,
            protyle: context.options.protyle,
            colId: resolveAVPanelColId(context)
        });
        return true;
    }
    if (type === "goSearchRollupCalc") {
        openCalcMenu(context.options.protyle, target, {
            data: context.state.data,
            colId: resolveAVPanelColId(context),
            blockID: context.blockID
        });
        return true;
    }
    if (type === "updateRelation") {
        updateRelation({
            protyle: context.options.protyle,
            avElement: context.avPanelElement,
            avID: context.avID,
            colsData: context.state.fields,
            blockElement: context.options.blockElement,
        });
        return true;
    }
    return false;
};
