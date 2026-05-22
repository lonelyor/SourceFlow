const fileTreeDropClasses = ["dragover", "dragover__bottom", "dragover__top"];
const fileTreeDropSelector = fileTreeDropClasses.map((item) => `.${item}`).join(", ");

const toElement = (target: EventTarget | Element | null) => {
    return target instanceof Element ? target : null;
};

const closestTreeItem = (treeElement: HTMLElement, element: Element | null) => {
    const liElement = element?.closest("li.b3-list-item") as HTMLElement;
    if (liElement && treeElement.contains(liElement)) {
        return liElement;
    }
    return undefined;
};

const closestTreeList = (treeElement: HTMLElement, element: Element | null) => {
    const ulElement = element?.closest("ul") as HTMLElement;
    if (ulElement && treeElement.contains(ulElement)) {
        return ulElement;
    }
    return undefined;
};

const dropItemFromList = (ulElement?: HTMLElement) => {
    if (!ulElement) {
        return undefined;
    }
    if (ulElement.matches("ul[data-url]")) {
        return ulElement.querySelector(':scope > li[data-type="navigation-root"]') as HTMLElement;
    }
    const previousElement = ulElement.previousElementSibling;
    if (previousElement instanceof HTMLElement && previousElement.matches("li.b3-list-item[data-path]")) {
        return previousElement;
    }
    return undefined;
};

const findPointList = (treeElement: HTMLElement, event: DragEvent) => {
    let matchElement: HTMLElement | undefined;
    let matchArea = Number.MAX_SAFE_INTEGER;
    treeElement.querySelectorAll<HTMLElement>("ul").forEach((ulElement) => {
        const rect = ulElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }
        const containsPoint = event.clientX >= rect.left && event.clientX <= rect.right &&
            event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (!containsPoint) {
            return;
        }
        const area = rect.width * rect.height;
        if (area < matchArea) {
            matchArea = area;
            matchElement = ulElement;
        }
    });
    return matchElement;
};

export const clearFileTreeDropClasses = (treeElement: HTMLElement) => {
    treeElement.querySelectorAll(fileTreeDropSelector).forEach((item: HTMLElement) => {
        item.classList.remove(...fileTreeDropClasses);
    });
};

export const resolveFileTreeMoveDropElement = (treeElement: HTMLElement, event: DragEvent) => {
    const eventElement = toElement(event.target);
    const directItem = closestTreeItem(treeElement, eventElement);
    if (directItem) {
        return directItem;
    }

    const pointElement = document.elementFromPoint(event.clientX, event.clientY - 1);
    const pointItem = closestTreeItem(treeElement, pointElement);
    if (pointItem) {
        return pointItem;
    }

    const eventListItem = dropItemFromList(closestTreeList(treeElement, eventElement));
    if (eventListItem) {
        return eventListItem;
    }

    const pointListItem = dropItemFromList(closestTreeList(treeElement, pointElement));
    if (pointListItem) {
        return pointListItem;
    }

    return dropItemFromList(findPointList(treeElement, event));
};

export const getFileTreeNotebookElement = (itemElement: HTMLElement) => {
    return itemElement.closest("ul[data-url]") as HTMLElement;
};

export const isFileTreePathInside = (targetPath: string, sourcePath: string) => {
    return targetPath.startsWith(sourcePath.replace(".sf", ""));
};
