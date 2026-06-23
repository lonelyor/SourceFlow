import {stopAVPanelEvent} from "./panelShared";
import {handleAVPanelCellValueClick} from "./panelClickCellValues";
import {handleAVPanelColumnClick} from "./panelClickColumns";
import {handleAVPanelFilterClick} from "./panelClickFilters";
import {handleAVPanelGroupClick} from "./panelClickGroups";
import {handleAVPanelNavigationClick} from "./panelClickNavigation";
import {handleAVPanelSortClick} from "./panelClickSorts";
import {handleAVPanelViewClick} from "./panelClickViews";
import type {AVPanelClickBranchHandler, AVPanelClickHandlerArgs, AVPanelOpenOptions, AVPanelState} from "./panelTypes";

const PANEL_CLICK_HANDLERS: AVPanelClickBranchHandler[] = [
    handleAVPanelNavigationClick,
    handleAVPanelSortClick,
    handleAVPanelFilterClick,
    handleAVPanelColumnClick,
    handleAVPanelCellValueClick,
    handleAVPanelViewClick,
    handleAVPanelGroupClick,
];

const dispatchAVPanelClick = async (args: AVPanelClickHandlerArgs) => {
    for (const handler of PANEL_CLICK_HANDLERS) {
        if (await handler(args)) {
            return true;
        }
    }
    return false;
};

export const bindAVPanelClick = ({
    options,
    avPanelElement,
    menuElement,
    state,
    avID,
    blockID,
    isCustomAttr,
}: {
    options: AVPanelOpenOptions,
    avPanelElement: Element,
    menuElement: HTMLElement,
    state: AVPanelState,
    avID: string,
    blockID: string,
    isCustomAttr: boolean,
}) => {
    const context = {
        options,
        avPanelElement,
        menuElement,
        state,
        avID,
        blockID,
        isCustomAttr,
    };
    avPanelElement.addEventListener("click", async (event: MouseEvent) => {
        let target = event.target as HTMLElement;
        let dispatchedType = "";
        if (typeof event.detail === "string") {
            dispatchedType = event.detail;
        } else if (typeof event.detail === "object") {
            dispatchedType = (event.detail as { type: string }).type;
            target = (event.detail as { target: HTMLElement }).target;
        }
        while ((target && target !== avPanelElement) || dispatchedType) {
            const currentType = target?.dataset.type || dispatchedType;
            if (currentType) {
                const handled = await dispatchAVPanelClick({
                    type: currentType,
                    target,
                    event,
                    context,
                });
                if (handled) {
                    stopAVPanelEvent(event);
                    break;
                }
            }
            if (!target || !target.parentElement) {
                break;
            }
            target = target.parentElement;
            dispatchedType = "";
        }
    });
};
