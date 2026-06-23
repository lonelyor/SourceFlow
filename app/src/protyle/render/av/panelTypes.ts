export type AVPanelMenuType = "select" | "properties" | "config" | "sorts" | "filters" | "edit" | "date" | "asset" | "switcher" | "relation" | "rollup";

export interface AVPanelOpenOptions {
    protyle: IProtyle,
    blockElement: Element,
    type: AVPanelMenuType,
    colId?: string,
    editData?: {
        previousID: string,
        colData: IAVColumn,
    },
    cellElements?: HTMLElement[],
    cb?: (avPanelElement: Element) => void
}

export interface AVPanelState {
    data: IAV,
    fields: IAVColumn[],
    closeCB?: () => void,
    tabRect: DOMRect,
}

export interface AVPanelContext {
    options: AVPanelOpenOptions,
    avPanelElement: Element,
    menuElement: HTMLElement,
    avID: string,
    blockID: string,
    isCustomAttr: boolean,
    state: AVPanelState,
}

export interface AVPanelClickHandlerArgs {
    type: string,
    target: HTMLElement,
    event: MouseEvent,
    context: AVPanelContext,
}

export type AVPanelClickBranchHandler = (args: AVPanelClickHandlerArgs) => boolean | Promise<boolean>;

export interface AVPanelDropHandlerArgs {
    sourceElement: HTMLElement,
    targetElement: HTMLElement,
    isTop: boolean,
    context: AVPanelContext,
}

export type AVPanelDropHandler = (args: AVPanelDropHandlerArgs) => boolean;
