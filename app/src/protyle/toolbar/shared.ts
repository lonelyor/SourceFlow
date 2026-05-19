import * as dayjs from "dayjs";
import {Constants} from "../../constants";
import {highlightRender} from "../render/highlightRender";
import {setStorageVal} from "../util/compatibility";
import {processRender} from "../util/processCode";
import {focusByRange} from "../util/selection";
import {getContenteditableElement} from "../wysiwyg/getBlock";
import {transaction} from "../wysiwyg/transaction";
import {BlockRef} from "./BlockRef";
import {Divider} from "./Divider";
import {Font} from "./Font";
import {InlineMath} from "./InlineMath";
import {InlineMemo} from "./InlineMemo";
import type {Toolbar} from "./index";
import {Link} from "./Link";
import {ToolbarItem} from "./ToolbarItem";

export const buildToolbarItemElement = (protyle: IProtyle, menuItem: IMenuItem) => {
    let menuItemObj;
    switch (menuItem.name) {
        case "strong":
        case "em":
        case "s":
        case "code":
        case "mark":
        case "tag":
        case "u":
        case "sup":
        case "clear":
        case "sub":
        case "kbd":
            menuItemObj = new ToolbarItem(protyle, menuItem);
            break;
        case "block-ref":
            menuItemObj = new BlockRef(protyle, menuItem);
            break;
        case "inline-math":
            menuItemObj = new InlineMath(protyle, menuItem);
            break;
        case "inline-memo":
            menuItemObj = new InlineMemo(protyle, menuItem);
            break;
        case "|":
            menuItemObj = new Divider();
            break;
        case "text":
            menuItemObj = new Font(protyle, menuItem);
            break;
        case "a":
            menuItemObj = new Link(protyle, menuItem);
            break;
        default:
            menuItemObj = new ToolbarItem(protyle, menuItem);
            break;
    }
    if (!menuItemObj) {
        return;
    }
    return menuItemObj.element;
};

export const mergeToolbarNodes = (nodes: NodeListOf<ChildNode>) => {
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].nodeType !== 3 && (nodes[i] as HTMLElement).tagName === "WBR") {
            nodes[i].remove();
            i--;
        }
    }
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].nodeType === 3) {
            if (nodes[i].textContent === "") {
                nodes[i].remove();
                i--;
            } else if (nodes[i + 1] && nodes[i + 1].nodeType === 3) {
                nodes[i].textContent = nodes[i].textContent + nodes[i + 1].textContent;
                nodes[i + 1].remove();
                i--;
            }
        }
    }
};

export const updateToolbarLanguage = (
    toolbar: Toolbar,
    languageElements: HTMLElement[],
    protyle: IProtyle,
    selectedLang: string,
) => {
    const currentLang = selectedLang === window.sourceflow.languages.clear ? "" : selectedLang;

    if (protyle.app && protyle.app.plugins) {
        protyle.app.plugins.forEach((plugin: any) => {
            plugin.eventBus.emit("code-language-change", {
                language: currentLang,
                languageElements,
                protyle: protyle
            });
        });
    }

    if (!Constants.SOURCEFLOW_RENDER_CODE_LANGUAGES.includes(currentLang)) {
        window.sourceflow.storage[Constants.LOCAL_CODELANG] = currentLang;
        setStorageVal(Constants.LOCAL_CODELANG, window.sourceflow.storage[Constants.LOCAL_CODELANG]);
    }
    const doOperations: IOperation[] = [];
    const undoOperations: IOperation[] = [];
    languageElements.forEach(item => {
        const nodeElement = item.closest("[data-node-id]") as HTMLElement;
        if (nodeElement) {
            const id = nodeElement.getAttribute("data-node-id");
            undoOperations.push({
                id,
                data: nodeElement.outerHTML,
                action: "update"
            });
            item.textContent = selectedLang === window.sourceflow.languages.clear ? "" : selectedLang;
            const editElement = getContenteditableElement(nodeElement);
            if (Constants.SOURCEFLOW_RENDER_CODE_LANGUAGES.includes(currentLang)) {
                nodeElement.dataset.content = editElement.textContent.trim();
                nodeElement.dataset.subtype = currentLang;
                nodeElement.className = "render-node";
                nodeElement.innerHTML = `<div spin="1"></div><div class="protyle-attr" contenteditable="false">${Constants.ZWSP}</div>`;
                processRender(nodeElement);
            } else {
                (editElement as HTMLElement).textContent = editElement.textContent;
                editElement.parentElement.removeAttribute("data-render");
                highlightRender(nodeElement);
            }
            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
            doOperations.push({
                id,
                data: nodeElement.outerHTML,
                action: "update"
            });
        }
    });
    transaction(protyle, doOperations, undoOperations);
    toolbar.subElement.classList.add("fn__none");
    focusByRange(toolbar.range);
};
