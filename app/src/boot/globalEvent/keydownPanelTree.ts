import {matchHotKey} from "../../protyle/util/hotKey";
import {
    hasClosestByAttribute,
    hasClosestByClassName,
} from "../../protyle/util/hasClosest";
import {getInstanceById} from "../../layout/util";
import {Tab} from "../../layout/Tab";
import {Backlink} from "../../layout/dock/Backlink";
import {App} from "../../index";

export const panelTreeKeydown = (app: App, event: KeyboardEvent) => {
    // 面板折叠展开操作
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA"].includes(target.tagName) ||
        hasClosestByAttribute(target, "contenteditable", null) ||
        hasClosestByClassName(target, "protyle", true)) {
        return false;
    }

    let activePanelElement = document.querySelector(".layout__tab--active");
    if (!activePanelElement) {
        Array.from(document.querySelectorAll(".layout__wnd--active .layout-tab-container > div")).find(item => {
            if (!item.classList.contains("fn__none") && item.className.indexOf("sf__") > -1) {
                activePanelElement = item;
                return true;
            }
        });
    }
    if (!activePanelElement) {
        return false;
    }
    if (activePanelElement.className.indexOf("sf__") === -1) {
        return false;
    }

    let matchCommand = false;
    app.plugins.find(item => {
        item.commands.find(command => {
            if (command.dockCallback && matchHotKey(command.customHotkey, event)) {
                matchCommand = true;
                command.dockCallback(activePanelElement as HTMLElement);
                return true;
            }
        });
        if (matchCommand) {
            return true;
        }
    });
    if (matchCommand) {
        return true;
    }
    if (!matchHotKey(window.sourceflow.config.keymap.editor.general.collapse.custom, event) &&
        !matchHotKey(window.sourceflow.config.keymap.editor.general.expand.custom, event) &&
        !event.key.startsWith("Arrow") && event.key !== "Enter") {
        return false;
    }
    if (!event.repeat && matchHotKey(window.sourceflow.config.keymap.editor.general.collapse.custom, event)) {
        const collapseElement = activePanelElement.querySelector('.block__icon[data-type="collapse"]');
        if (collapseElement) {
            collapseElement.dispatchEvent(new CustomEvent("click"));
            event.preventDefault();
            return true;
        }
    }
    if (!event.repeat && matchHotKey(window.sourceflow.config.keymap.editor.general.expand.custom, event)) {
        const expandElement = activePanelElement.querySelector('.block__icon[data-type="expand"]');
        if (expandElement) {
            expandElement.dispatchEvent(new CustomEvent("click"));
            event.preventDefault();
            return true;
        }
    }
    if (activePanelElement.classList.contains("sf__globalGraph") ||
        activePanelElement.classList.contains("sf__graph")) {
        return false;
    }
    const model = (getInstanceById(activePanelElement.getAttribute("data-id"), window.sourceflow.layout.layout) as Tab)?.model;
    if (!model) {
        return false;
    }
    let activeItemElement = activePanelElement.querySelector(".b3-list-item--focus");
    if (!activeItemElement) {
        activeItemElement = activePanelElement.querySelector(".b3-list .b3-list-item");
        if (activeItemElement) {
            activeItemElement.classList.add("b3-list-item--focus");
        }
        return false;
    }

    let tree = (model as Backlink).tree;
    if (activeItemElement.parentElement.parentElement.classList.contains("backlinkMList")) {
        tree = (model as Backlink).mTree;
    }
    if (!tree) {
        return false;
    }
    if (event.key === "Enter") {
        tree.click(activeItemElement);
        event.preventDefault();
        return true;
    }
    const arrowElement = activeItemElement.querySelector(".b3-list-item__arrow");
    if ((event.key === "ArrowRight" && !arrowElement.classList.contains("b3-list-item__arrow--open") && !arrowElement.parentElement.classList.contains("fn__hidden")) ||
        (event.key === "ArrowLeft" && arrowElement.classList.contains("b3-list-item__arrow--open") && !arrowElement.parentElement.classList.contains("fn__hidden"))) {
        tree.toggleBlocks(activeItemElement);
        event.preventDefault();
        return true;
    }
    const ulElement = hasClosestByClassName(activeItemElement, "b3-list");
    if (!ulElement) {
        return false;
    }
    if (event.key === "ArrowLeft") {
        let parentElement = activeItemElement.parentElement.previousElementSibling;
        if (parentElement) {
            if (parentElement.tagName !== "LI") {
                parentElement = ulElement.querySelector(".b3-list-item");
            }
            activeItemElement.classList.remove("b3-list-item--focus");
            parentElement.classList.add("b3-list-item--focus");
            const parentRect = parentElement.getBoundingClientRect();
            const scrollRect = ulElement.parentElement.getBoundingClientRect();
            if (parentRect.top < scrollRect.top || parentRect.bottom > scrollRect.bottom) {
                parentElement.scrollIntoView(parentRect.top < scrollRect.top);
            }
        }
        event.preventDefault();
        return true;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        let nextElement = activeItemElement;
        while (nextElement) {
            if (nextElement.nextElementSibling) {
                if (nextElement.nextElementSibling.tagName === "UL") {
                    if (nextElement.nextElementSibling.classList.contains("fn__none")) {   // 遇到折叠内容
                        if (nextElement.nextElementSibling.nextElementSibling) {
                            nextElement = nextElement.nextElementSibling.nextElementSibling;
                        }
                    } else {
                        nextElement = nextElement.nextElementSibling.firstElementChild;
                    }
                } else if (nextElement.nextElementSibling.classList.contains("protyle")) { // backlink
                    if (nextElement.nextElementSibling.nextElementSibling) {
                        nextElement = nextElement.nextElementSibling.nextElementSibling;
                    }
                } else {
                    nextElement = nextElement.nextElementSibling;
                }
                break;
            } else {
                if (nextElement.parentElement.classList.contains("fn__flex-1")) {
                    break;
                } else {
                    nextElement = nextElement.parentElement;
                }
            }
        }
        if (nextElement.classList.contains("b3-list-item") && !nextElement.classList.contains("b3-list-item--focus")) {
            activeItemElement.classList.remove("b3-list-item--focus");
            nextElement.classList.add("b3-list-item--focus");
            const nextRect = nextElement.getBoundingClientRect();
            const scrollRect = ulElement.parentElement.getBoundingClientRect();
            if (nextRect.top < scrollRect.top || nextRect.bottom > scrollRect.bottom) {
                nextElement.scrollIntoView(nextRect.top < scrollRect.top);
            }
        }
        event.preventDefault();
        return true;
    }
    if (event.key === "ArrowUp") {
        let previousElement = activeItemElement;
        while (previousElement) {
            if (previousElement.previousElementSibling) {
                if (previousElement.previousElementSibling.tagName === "LI") {
                    previousElement = previousElement.previousElementSibling;
                } else if (previousElement.previousElementSibling.classList.contains("protyle")) {
                    if (previousElement.previousElementSibling.previousElementSibling) {
                        previousElement = previousElement.previousElementSibling.previousElementSibling;
                    }
                } else if (previousElement.previousElementSibling.tagName === "UL" && previousElement.previousElementSibling.classList.contains("fn__none")) {   // 遇到折叠内容
                    if (previousElement.previousElementSibling.previousElementSibling) {
                        previousElement = previousElement.previousElementSibling.previousElementSibling;
                    }
                } else {
                    const liElements = previousElement.previousElementSibling.querySelectorAll(".b3-list-item");
                    previousElement = liElements[liElements.length - 1];
                }
                break;
            } else {
                if (previousElement.parentElement.classList.contains("fn__flex-1")) {
                    break;
                } else {
                    previousElement = previousElement.parentElement;
                }
            }
        }
        if (previousElement.classList.contains("b3-list-item") && !previousElement.classList.contains("b3-list-item--focus")) {
            activeItemElement.classList.remove("b3-list-item--focus");
            previousElement.classList.add("b3-list-item--focus");
            const previousRect = previousElement.getBoundingClientRect();
            const scrollRect = ulElement.parentElement.getBoundingClientRect();
            if (previousRect.top < scrollRect.top || previousRect.bottom > scrollRect.bottom) {
                previousElement.scrollIntoView(previousRect.top < scrollRect.top);
            }
        }
        event.preventDefault();
        return true;
    }
    return false;
};
