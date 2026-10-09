import {
    hasClosestBlock,
    hasTopClosestByClassName
} from "../../../protyle/util/hasClosest";
import {MenuItem} from "../../Menu";
import {focusByRange, focusByWbr,} from "../../../protyle/util/selection";
import {updateTransaction} from "../../../protyle/wysiwyg/transaction";
import {Constants} from "../../../constants";
import {isMobile} from "../../../util/functions";
/// #if !MOBILE
/// #endif
import * as dayjs from "dayjs";
import {electronUndo} from "../../../protyle/undo";
import {removeInlineType} from "../../../protyle/toolbar/util";
import {hideElements} from "../../../protyle/ui/hideElements";
import {emitOpenMenu} from "../../../plugin/EventBus";



export const fileAnnotationRefMenu = (protyle: IProtyle, refElement: HTMLElement) => {
    const nodeElement = hasClosestBlock(refElement);
    if (!nodeElement) {
        return;
    }
    hideElements(["util", "toolbar", "hint"], protyle);
    const id = nodeElement.getAttribute("data-node-id");
    let oldHTML = nodeElement.outerHTML;
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_INLINE_FILE_ANNOTATION_REF);
    let anchorElement: HTMLInputElement;
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "idAndAnchor",
        iconHTML: "",
        type: "readonly",
        label: `<div>ID</div><textarea spellcheck="false" rows="1" style="margin:4px 0;width: ${isMobile() ? "100%" : "360px"}" class="b3-text-field" readonly>${refElement.getAttribute("data-id") || ""}</textarea><div class="fn__hr"></div><div>${window.sourceflow.languages.anchor}</div><textarea rows="1" style="margin:4px 0;width: ${isMobile() ? "100%" : "360px"}" class="b3-text-field"></textarea>`,
        bind(menuItemElement) {
            menuItemElement.style.maxWidth = "none";
            anchorElement = menuItemElement.querySelectorAll(".b3-text-field")[1] as HTMLInputElement;
            anchorElement.value = refElement.textContent;
            const inputEvent = () => {
                if (anchorElement.value) {
                    refElement.innerHTML = Lute.EscapeHTMLStr(anchorElement.value);
                } else {
                    refElement.innerHTML = "*";
                }
            };
            anchorElement.addEventListener("input", (event: KeyboardEvent) => {
                if (event.isComposing) {
                    return;
                }
                inputEvent();
                event.stopPropagation();
            });
            anchorElement.addEventListener("compositionend", (event: KeyboardEvent) => {
                if (event.isComposing) {
                    return;
                }
                inputEvent();
                event.stopPropagation();
            });
            anchorElement.addEventListener("keydown", (event: KeyboardEvent) => {
                if (event.isComposing) {
                    return;
                }
                if (event.key === "Enter" && !event.isComposing) {
                    window.sourceflow.menus.menu.remove();
                } else if (electronUndo(event)) {
                    return;
                }
            });
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({type: "separator"}).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "turnInto",
        label: window.sourceflow.languages.turnInto,
        icon: "iconRefresh",
        submenu: [{
            id: "text",
            iconHTML: "",
            label: window.sourceflow.languages.text,
            click() {
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                removeInlineType(refElement, "file-annotation-ref", protyle.toolbar.range);
                updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                oldHTML = nodeElement.outerHTML;
            }
        }, {
            id: "text*",
            iconHTML: "",
            label: window.sourceflow.languages.text + " *",
            click() {
                refElement.insertAdjacentHTML("beforebegin", refElement.innerHTML + " ");
                refElement.textContent = "*";
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                oldHTML = nodeElement.outerHTML;
            }
        }]
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "remove",
        icon: "iconTrashcan",
        label: window.sourceflow.languages.remove,
        click() {
            refElement.insertAdjacentHTML("afterend", "<wbr>");
            refElement.remove();
            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
            updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
            focusByWbr(nodeElement, protyle.toolbar.range);
            oldHTML = nodeElement.outerHTML;
        }
    }).element);

    if (protyle?.app?.plugins) {
        emitOpenMenu({
            plugins: protyle.app.plugins,
            type: "open-menu-fileannotationref",
            detail: {
                protyle,
                element: refElement,
            },
            separatorPosition: "top",
        });
    }
    /// #if MOBILE
    window.sourceflow.menus.menu.fullscreen();
    /// #else
    const rect = refElement.getBoundingClientRect();
    window.sourceflow.menus.menu.popup({
        x: rect.left,
        y: rect.top + 26,
        h: 26
    });
    /// #endif
    const popoverElement = hasTopClosestByClassName(protyle.element, "block__popover", true);
    window.sourceflow.menus.menu.element.setAttribute("data-from", popoverElement ? popoverElement.dataset.level + "popover" : "app");
    anchorElement.select();
    window.sourceflow.menus.menu.removeCB = () => {
        if (nodeElement.outerHTML !== oldHTML) {
            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
            updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
        }

        const currentRange = getSelection().rangeCount === 0 ? undefined : getSelection().getRangeAt(0);
        if (currentRange && !protyle.element.contains(currentRange.startContainer)) {
            protyle.toolbar.range.selectNodeContents(refElement);
            protyle.toolbar.range.collapse(false);
            focusByRange(protyle.toolbar.range);
        }
    };
};
