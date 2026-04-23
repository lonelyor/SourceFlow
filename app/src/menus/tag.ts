import {MenuItem} from "./Menu";
import {fetchPost} from "../util/fetch";
import {confirmDialog} from "../dialog/confirmDialog";
import {escapeHtml} from "../util/escape";
import {renameTag} from "../util/noRelyPCFunction";
import {getDockByType} from "../layout/tabUtil";
import {Tag} from "../layout/dock/Tag";
import {Constants} from "../constants";

export const openTagMenu = (element: HTMLElement, event: MouseEvent, labelName: string) => {
    if (!window.sourceflow.menus.menu.element.classList.contains("fn__none") &&
        window.sourceflow.menus.menu.element.getAttribute("data-name") === Constants.MENU_TAG) {
        window.sourceflow.menus.menu.remove();
        return;
    }
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.append(new MenuItem({
        icon: "iconEdit",
        label: window.sourceflow.languages.rename,
        click: () => {
            renameTag(labelName);
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        icon: "iconTrashcan",
        label: window.sourceflow.languages.remove,
        click: () => {
            confirmDialog(window.sourceflow.languages.deleteOpConfirm, `${window.sourceflow.languages.confirmDelete} <b>${escapeHtml(labelName)}</b>?`, () => {
                fetchPost("/api/tag/removeTag", {label: labelName}, () => {
                    /// #if MOBILE
                    window.sourceflow.mobile.docks.tag.update();
                    /// #else
                    const dockTag = getDockByType("tag");
                    (dockTag.data.tag as Tag).update();
                    /// #endif
                });
            }, undefined, true);
        }
    }).element);
    window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_TAG);
    window.sourceflow.menus.menu.popup({x: event.clientX - 11, y: event.clientY + 11, h: 22, w: 12});
};
