import {
    hasClosestBlock,
    hasTopClosestByClassName
} from "../../../protyle/util/hasClosest";
import {MenuItem} from "../../Menu";
import {focusByRange, focusByWbr,} from "../../../protyle/util/selection";
import {updateTransaction} from "../../../protyle/wysiwyg/transaction";
import {Constants} from "../../../constants";
/// #if !MOBILE
import {openGlobalSearch} from "../../../search/util";
/// #endif
import * as dayjs from "dayjs";
import {electronUndo} from "../../../protyle/undo";
import {renameTag} from "../../../util/noRelyPCFunction";
import {hideElements} from "../../../protyle/ui/hideElements";
import {emitOpenMenu} from "../../../plugin/EventBus";
import {popSearch} from "../../../mobile/menu/search";



export const tagMenu = (protyle: IProtyle, tagElement: HTMLElement) => {
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_INLINE_TAG);
    const nodeElement = hasClosestBlock(tagElement);
    if (!nodeElement) {
        return;
    }
    hideElements(["util", "toolbar", "hint"], protyle);
    const id = nodeElement.getAttribute("data-node-id");
    let html = nodeElement.outerHTML;
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "tag",
        iconHTML: "",
        type: "readonly",
        label: `<input class="b3-text-field fn__block" style="margin: 4px 0" placeholder="${window.sourceflow.languages.tag}">`,
        bind(element) {
            const inputElement = element.querySelector("input");
            inputElement.value = tagElement.textContent.replace(Constants.ZWSP, "");
            inputElement.addEventListener("change", () => {
                updateTransaction(protyle, id, nodeElement.outerHTML, html);
                html = nodeElement.outerHTML;
            });
            inputElement.addEventListener("compositionend", () => {
                tagElement.innerHTML = Constants.ZWSP + Lute.EscapeHTMLStr(inputElement.value || "");
            });
            inputElement.addEventListener("input", (event: KeyboardEvent) => {
                if (!event.isComposing) {
                    // https://github.com/lonelyor/SourceFlow/issues/4511
                    tagElement.innerHTML = Constants.ZWSP + Lute.EscapeHTMLStr(inputElement.value || "");
                }
            });
            inputElement.addEventListener("keydown", (event) => {
                if ((event.key === "Enter" || event.key === "Escape") && !event.isComposing) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!inputElement.value) {
                        const oldHTML = nodeElement.outerHTML;
                        tagElement.insertAdjacentHTML("afterend", "<wbr>");
                        tagElement.remove();
                        nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                        updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                        focusByWbr(nodeElement, protyle.toolbar.range);
                    } else {
                        protyle.toolbar.range.selectNodeContents(tagElement);
                        protyle.toolbar.range.collapse(false);
                        focusByRange(protyle.toolbar.range);
                    }
                    window.sourceflow.menus.menu.remove();
                } else if (electronUndo(event)) {
                    return;
                }
            });
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({id: "separator_1", type: "separator"}).element);

    window.sourceflow.menus.menu.append(new MenuItem({
        id: "search",
        label: window.sourceflow.languages.search,
        accelerator: window.sourceflow.languages.click,
        icon: "iconSearch",
        click() {
            /// #if !MOBILE
            openGlobalSearch(protyle.app, `#${tagElement.textContent}#`, false, {method: 0});
            /// #else
            popSearch(protyle.app, {
                hasReplace: false,
                method: 0,
                hPath: "",
                idPath: [],
                k: `#${tagElement.textContent}#`,
                r: "",
                page: 1,
            });
            /// #endif
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "rename",
        label: window.sourceflow.languages.rename,
        icon: "iconEdit",
        click() {
            renameTag(tagElement.textContent.replace(Constants.ZWSP, ""));
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({id: "separator_2", type: "separator"}).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "turnIntoText",
        label: `${window.sourceflow.languages.turnInto} <b>${window.sourceflow.languages.text}</b>`,
        icon: "iconRefresh",
        click() {
            protyle.toolbar.range.setStart(tagElement.firstChild, 0);
            protyle.toolbar.range.setEnd(tagElement.lastChild, tagElement.lastChild.textContent.length);
            protyle.toolbar.setInlineMark(protyle, "tag", "range");
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "copy",
        label: window.sourceflow.languages.copy,
        icon: "iconCopy",
        click() {
            const range = document.createRange();
            range.selectNode(tagElement);
            focusByRange(range);
            document.execCommand("copy");
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "cut",
        label: window.sourceflow.languages.cut,
        icon: "iconCut",
        click() {
            const range = document.createRange();
            range.selectNode(tagElement);
            focusByRange(range);
            document.execCommand("cut");
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "remove",
        icon: "iconTrashcan",
        label: window.sourceflow.languages.remove,
        click() {
            const oldHTML = nodeElement.outerHTML;
            tagElement.insertAdjacentHTML("afterend", "<wbr>");
            tagElement.remove();
            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
            updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
            focusByWbr(nodeElement, protyle.toolbar.range);
        }
    }).element);

    if (protyle?.app?.plugins) {
        emitOpenMenu({
            plugins: protyle.app.plugins,
            type: "open-menu-tag",
            detail: {
                protyle,
                element: tagElement,
            },
            separatorPosition: "top",
        });
    }

    /// #if MOBILE
    window.sourceflow.menus.menu.fullscreen();
    /// #else
    const rect = tagElement.getBoundingClientRect();
    window.sourceflow.menus.menu.popup({
        x: rect.left,
        y: rect.top + 26,
        h: 26
    });
    /// #endif
    const popoverElement = hasTopClosestByClassName(protyle.element, "block__popover", true);
    window.sourceflow.menus.menu.element.setAttribute("data-from", popoverElement ? popoverElement.dataset.level + "popover" : "app");
    window.sourceflow.menus.menu.element.querySelector("input").select();
};
