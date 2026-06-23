import {getAllModels} from "../../layout/getAll";
import {hasClosestByClassName, isInEmbedBlock} from "../util/hasClosest";

const CURRENT_HEADING_CLASS = "protyle-heading--current";
const STICKY_HEADING_CLASS = "protyle-current-heading";
const headingSyncRaf = new WeakMap<IProtyle, number>();

const getHeadingText = (headingElement: HTMLElement) => {
    const textElement = headingElement.querySelector("[contenteditable='true']") as HTMLElement;
    return (textElement?.textContent || headingElement.textContent || "").replace(/\s+/g, " ").trim();
};

const getHeadingLevel = (headingElement: HTMLElement) => {
    return (headingElement.getAttribute("data-subtype") || "h").replace("h", "").toUpperCase();
};

const isOutlineHeading = (headingElement: HTMLElement) => {
    return headingElement.getAttribute("data-type") === "NodeHeading" &&
        !isInEmbedBlock(headingElement) &&
        !hasClosestByClassName(headingElement, "bq") &&
        !hasClosestByClassName(headingElement, "callout-content");
};

const getStickyElement = (protyle: IProtyle) => {
    let stickyElement = protyle.contentElement.querySelector(`:scope > .${STICKY_HEADING_CLASS}`) as HTMLElement;
    if (stickyElement) {
        return stickyElement;
    }
    stickyElement = document.createElement("div");
    stickyElement.className = `${STICKY_HEADING_CLASS} fn__none`;
    stickyElement.innerHTML = `<div class="${STICKY_HEADING_CLASS}__inner" aria-hidden="true">
    <span class="${STICKY_HEADING_CLASS}__level"></span>
    <span class="${STICKY_HEADING_CLASS}__text"></span>
</div>`;
    protyle.contentElement.prepend(stickyElement);
    return stickyElement;
};

const clearHeadingContext = (protyle: IProtyle) => {
    protyle.wysiwyg.element.querySelectorAll(`.${CURRENT_HEADING_CLASS}`).forEach((item) => {
        item.classList.remove(CURRENT_HEADING_CLASS);
    });
    protyle.contentElement.querySelector(`:scope > .${STICKY_HEADING_CLASS}`)?.classList.add("fn__none");
    delete protyle.contentElement.dataset.currentHeadingId;
};

const findActiveHeading = (protyle: IProtyle, contentRect: DOMRect) => {
    const headings = Array.from(protyle.wysiwyg.element.querySelectorAll<HTMLElement>('[data-type="NodeHeading"]'))
        .filter(isOutlineHeading);
    const thresholdTop = contentRect.top + Math.min(96, contentRect.height * 0.18);
    let activeHeading: HTMLElement;
    let firstVisibleHeading: HTMLElement;

    headings.forEach((headingElement) => {
        const headingRect = headingElement.getBoundingClientRect();
        if (headingRect.top <= thresholdTop) {
            activeHeading = headingElement;
        }
        if (!firstVisibleHeading && headingRect.bottom > contentRect.top && headingRect.top < contentRect.bottom) {
            firstVisibleHeading = headingElement;
        }
    });
    return activeHeading || firstVisibleHeading;
};

const syncOutlineCurrent = (protyle: IProtyle, headingElement: HTMLElement) => {
    if (!protyle.model || !protyle.block?.rootID) {
        return;
    }
    getAllModels().outline.forEach((item) => {
        if (item.blockId === protyle.block.rootID && !item.isPreview) {
            item.setCurrent(headingElement);
        }
    });
};

const syncStickyHeading = (protyle: IProtyle, headingElement: HTMLElement, contentRect: DOMRect) => {
    const stickyElement = getStickyElement(protyle);
    const headingText = getHeadingText(headingElement);
    const headingRect = headingElement.getBoundingClientRect();
    if (!headingText || headingRect.top >= contentRect.top - 2) {
        stickyElement.classList.add("fn__none");
        return;
    }
    const levelElement = stickyElement.querySelector(`.${STICKY_HEADING_CLASS}__level`) as HTMLElement;
    const textElement = stickyElement.querySelector(`.${STICKY_HEADING_CLASS}__text`) as HTMLElement;
    levelElement.textContent = `H${getHeadingLevel(headingElement)}`;
    textElement.textContent = headingText;
    stickyElement.classList.remove("fn__none");
};

export const syncHeadingContext = (protyle: IProtyle, contentRect: DOMRect) => {
    if (!protyle.wysiwyg?.element || !protyle.contentElement ||
        !protyle.preview.element.classList.contains("fn__none")) {
        clearHeadingContext(protyle);
        return;
    }
    const headingElement = findActiveHeading(protyle, contentRect);
    if (!headingElement) {
        clearHeadingContext(protyle);
        return;
    }
    const headingId = headingElement.getAttribute("data-node-id") || "";
    if (!headingId) {
        clearHeadingContext(protyle);
        return;
    }
    if (protyle.contentElement.dataset.currentHeadingId !== headingId ||
        !headingElement.classList.contains(CURRENT_HEADING_CLASS)) {
        protyle.wysiwyg.element.querySelectorAll(`.${CURRENT_HEADING_CLASS}`).forEach((item) => {
            item.classList.remove(CURRENT_HEADING_CLASS);
        });
        headingElement.classList.add(CURRENT_HEADING_CLASS);
        protyle.contentElement.dataset.currentHeadingId = headingId;
        syncOutlineCurrent(protyle, headingElement);
    }
    syncStickyHeading(protyle, headingElement, contentRect);
};

export const scheduleHeadingContextSync = (protyle: IProtyle, contentRect: DOMRect) => {
    if (headingSyncRaf.has(protyle)) {
        return;
    }
    const rafId = requestAnimationFrame(() => {
        headingSyncRaf.delete(protyle);
        syncHeadingContext(protyle, contentRect);
    });
    headingSyncRaf.set(protyle, rafId);
};
