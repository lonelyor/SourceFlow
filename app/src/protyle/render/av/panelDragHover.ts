import {hasClosestByAttribute} from "../../util/hasClosest";
import {clearAVPanelDragIndicators, setAVPanelDragIndicator} from "./panelDragShared";

export const bindAVPanelDragHover = (avPanelElement: Element) => {
    let dragoverElement: HTMLElement;
    let counter = 0;
    avPanelElement.addEventListener("dragover", (event: DragEvent) => {
        if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            return;
        }
        const target = event.target as HTMLElement;
        let targetElement = hasClosestByAttribute(target, "draggable", "true");
        if (!targetElement) {
            targetElement = hasClosestByAttribute(document.elementFromPoint(event.clientX, event.clientY - 1), "draggable", "true");
        }
        if (!targetElement || targetElement === window.sourceflow.dragElement) {
            return;
        }
        event.preventDefault();
        dragoverElement = targetElement;
        setAVPanelDragIndicator(avPanelElement, targetElement, event.clientY);
    });
    avPanelElement.addEventListener("dragleave", () => {
        counter--;
        if (counter === 0) {
            clearAVPanelDragIndicators(avPanelElement);
        }
    });
    avPanelElement.addEventListener("dragenter", (event) => {
        event.preventDefault();
        counter++;
    });
    avPanelElement.addEventListener("dragend", () => {
        if (window.sourceflow.dragElement) {
            window.sourceflow.dragElement.style.opacity = "";
            window.sourceflow.dragElement = undefined;
        }
        dragoverElement = undefined;
        clearAVPanelDragIndicators(avPanelElement);
    });
};
