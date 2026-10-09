import {
    hasClosestBlock
} from "../../../protyle/util/hasClosest";
import {MenuItem} from "../../Menu";
import {focusByRange, focusByWbr,} from "../../../protyle/util/selection";
import {updateTransaction} from "../../../protyle/wysiwyg/transaction";
import {Constants} from "../../../constants";
import * as dayjs from "dayjs";



export const inlineMathMenu = (protyle: IProtyle, element: Element) => {
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_INLINE_MATH);
    const nodeElement = hasClosestBlock(element);
    if (!nodeElement) {
        return;
    }
    const id = nodeElement.getAttribute("data-node-id");
    const html = nodeElement.outerHTML;
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "copy",
        label: window.sourceflow.languages.copy,
        icon: "iconCopy",
        click() {
            const range = document.createRange();
            range.selectNode(element);
            focusByRange(range);
            document.execCommand("copy");
        }
    }).element);
    if (!protyle.disabled) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "cut",
            icon: "iconCut",
            label: window.sourceflow.languages.cut,
            click() {
                const range = document.createRange();
                range.selectNode(element);
                focusByRange(range);
                document.execCommand("cut");
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "remove",
            icon: "iconTrashcan",
            label: window.sourceflow.languages.remove,
            click() {
                element.insertAdjacentHTML("afterend", "<wbr>");
                element.remove();
                nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                updateTransaction(protyle, id, nodeElement.outerHTML, html);
                focusByWbr(nodeElement, protyle.toolbar.range);
            }
        }).element);
    }
    const rect = element.getBoundingClientRect();
    window.sourceflow.menus.menu.popup({
        x: rect.left,
        y: rect.top + 26,
        h: 26
    });
};
