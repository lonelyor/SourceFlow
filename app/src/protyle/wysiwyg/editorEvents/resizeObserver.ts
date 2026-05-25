import {stickyRow} from "../../render/av/row";

export const bindResizeObserver = (protyle: IProtyle) => {
    let resizeRaf = 0;
    protyle.observer = new ResizeObserver(() => {
        if (resizeRaf) {
            cancelAnimationFrame(resizeRaf);
        }
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = 0;
            const contentRect = protyle.contentElement.getBoundingClientRect();
            protyle.wysiwyg.element.querySelectorAll(".av").forEach((item: HTMLElement) => {
                if (item.querySelector(".av__scroll")) {
                    const rect = item.getBoundingClientRect();
                    if (rect.bottom >= contentRect.top - contentRect.height && rect.top <= contentRect.bottom + contentRect.height) {
                        stickyRow(item, contentRect, "all");
                    }
                }
            });
        });
    });
};
