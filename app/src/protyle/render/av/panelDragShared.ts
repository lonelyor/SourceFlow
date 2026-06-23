export const clearAVPanelDragIndicators = (avPanelElement: Element) => {
    avPanelElement.querySelectorAll(".dragover__bottom, .dragover__top").forEach((item: HTMLElement) => {
        item.classList.remove("dragover__bottom", "dragover__top");
    });
};

export const setAVPanelDragIndicator = (avPanelElement: Element, targetElement: HTMLElement, clientY: number) => {
    clearAVPanelDragIndicators(avPanelElement);
    const nodeRect = targetElement.getBoundingClientRect();
    if (clientY > nodeRect.top + nodeRect.height / 2) {
        targetElement.classList.add("dragover__bottom");
    } else {
        targetElement.classList.add("dragover__top");
    }
};
