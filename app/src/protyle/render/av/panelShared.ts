import {Constants} from "../../../constants";
import {setPosition} from "../../../util/setPosition";
import {bindEditEvent, getEditHTML} from "./col";
import {getFiltersHTML} from "./filter";
import {getPropertiesHTML} from "./propertiesMenu";
import {bindSortsEvent, getSortsHTML} from "./sort";
import {focusBlock} from "../../util/selection";
import type {AVPanelContext} from "./panelTypes";

export const clearAVPanelMenus = () => {
    window.sourceflow.menus.menu.remove();
};

export const stopAVPanelEvent = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
};

export const positionAVPanelMenu = (context: AVPanelContext) => {
    setPosition(
        context.menuElement,
        context.state.tabRect.right - context.menuElement.clientWidth,
        context.state.tabRect.bottom,
        context.state.tabRect.height,
    );
};

export const recomputeAVPanelTabRect = (context: AVPanelContext) => {
    const nextRect = context.options.blockElement.querySelector(".av__views")?.getBoundingClientRect();
    if (nextRect) {
        context.state.tabRect = nextRect;
    }
    return context.state.tabRect;
};

export const closeAVPanel = (context: AVPanelContext) => {
    context.state.closeCB?.();
    context.avPanelElement.remove();
    setTimeout(() => {
        focusBlock(context.options.blockElement);
    }, Constants.TIMEOUT_TRANSITION);
};

export const refreshPropertiesMenu = (context: AVPanelContext) => {
    context.menuElement.innerHTML = getPropertiesHTML(context.state.fields);
    positionAVPanelMenu(context);
};

export const refreshSortsMenu = (context: AVPanelContext) => {
    context.menuElement.innerHTML = getSortsHTML(context.state.fields, context.state.data.view.sorts);
    bindSortsEvent(context.options.protyle, context.menuElement, context.state.data, context.blockID);
    positionAVPanelMenu(context);
};

export const refreshFiltersMenu = (context: AVPanelContext) => {
    context.menuElement.innerHTML = getFiltersHTML(context.state.data);
    positionAVPanelMenu(context);
};

export const resolveAVPanelColId = (context: AVPanelContext) => {
    return (context.options.colId || context.menuElement.querySelector(".b3-menu__item")?.getAttribute("data-col-id") || "") as string;
};

export const refreshEditMenu = (context: AVPanelContext, colId = resolveAVPanelColId(context)) => {
    context.menuElement.innerHTML = getEditHTML({
        protyle: context.options.protyle,
        data: context.state.data,
        colId,
        isCustomAttr: context.isCustomAttr
    });
    bindEditEvent({
        protyle: context.options.protyle,
        data: context.state.data,
        menuElement: context.menuElement,
        isCustomAttr: context.isCustomAttr,
        blockID: context.blockID
    });
    positionAVPanelMenu(context);
    return colId;
};
