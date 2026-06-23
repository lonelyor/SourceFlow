import {clearAVPanelDragIndicators} from "./panelDragShared";
import {bindAVPanelDragHover} from "./panelDragHover";
import {handleAVPanelDrop} from "./panelDragDrop";
import type {AVPanelContext, AVPanelOpenOptions, AVPanelState} from "./panelTypes";

export const bindAVPanelDrag = ({
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
    const context: AVPanelContext = {
        options,
        avPanelElement,
        menuElement,
        state,
        avID,
        blockID,
        isCustomAttr,
    };
    avPanelElement.addEventListener("dragstart", (event: DragEvent) => {
        window.sourceflow.dragElement = event.target as HTMLElement;
        window.sourceflow.dragElement.style.opacity = ".38";
    });
    avPanelElement.addEventListener("drop", (event) => {
        if (!window.sourceflow.dragElement) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        window.sourceflow.dragElement.style.opacity = "";
        const sourceElement = window.sourceflow.dragElement;
        window.sourceflow.dragElement = undefined;
        if (options.protyle && options.protyle.disabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (!options.protyle && window.sourceflow.config.readonly) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const targetElement = avPanelElement.querySelector(".dragover__bottom, .dragover__top") as HTMLElement;
        if (!targetElement) {
            return;
        }
        const isTop = targetElement.classList.contains("dragover__top");
        clearAVPanelDragIndicators(avPanelElement);
        if (handleAVPanelDrop({sourceElement, targetElement, isTop, context})) {
            event.preventDefault();
            event.stopPropagation();
        }
    });
    bindAVPanelDragHover(avPanelElement);
};
