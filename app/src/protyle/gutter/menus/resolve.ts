import {
    isInEmbedBlock
} from "../../util/hasClosest";
import {hideElements} from "../../ui/hideElements";
import {countBlockWord} from "../../../layout/status";
import {Constants} from "../../../constants";
import {isMobile} from "../../../util/functions";
import {activeBlur} from "../../../mobile/util/keyboardToolbar";

import {isMatchNode} from "../actions";

import {renderMultipleMenu} from "./multiple";
import type {PrepareSingleMenuResult} from "./shared";

export const prepareSingleMenuContext = (gutterElement: HTMLElement, protyle: IProtyle, buttonElement: Element): PrepareSingleMenuResult => {
    if (!buttonElement) {
        return {kind: "skip"};
    }
    hideElements(["util", "toolbar", "hint"], protyle);
    window.sourceflow.menus.menu.remove();
    if (isMobile()) {
        activeBlur();
    }
    const id = buttonElement.getAttribute("data-node-id") || "";
    const selectsElement = protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select");
    if (selectsElement.length > 1) {
        window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_BLOCK_MULTI);
        const match = Array.from(selectsElement).find(item => id === item.getAttribute("data-node-id"));
        if (match) {
            renderMultipleMenu(protyle, Array.from(selectsElement));
            return {kind: "menu"};
        }
    } else {
        window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_BLOCK_SINGLE);
    }

    let nodeElement: Element | undefined;
    if (buttonElement.tagName === "BUTTON") {
        Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${id}"]`)).find(item => {
            if (!isInEmbedBlock(item) && isMatchNode(gutterElement, item)) {
                nodeElement = item;
                return true;
            }
            return false;
        });
    } else {
        nodeElement = buttonElement;
    }
    if (!nodeElement) {
        return {kind: "skip"};
    }
    hideElements(["select"], protyle);
    nodeElement.classList.add("protyle-wysiwyg--select");
    countBlockWord([id], protyle.block.rootID);
    return {
        kind: "context",
        context: {
            protyle,
            nodeElement: nodeElement as HTMLElement,
            id,
            type: nodeElement.getAttribute("data-type") || "",
            subType: nodeElement.getAttribute("data-subtype") || "",
        },
    };
};
