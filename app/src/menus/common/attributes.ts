import * as dayjs from "dayjs";
import {Dialog} from "../../dialog";
import {showMessage} from "../../dialog/message";
import {fetchPost} from "../../util/fetch";
import {focusByRange} from "../../protyle/util/selection";
import {hideElements} from "../../protyle/ui/hideElements";
import {renderAVAttribute} from "../../protyle/render/av/blockAttr";
import {Protyle} from "../../protyle";
import {getAllEditor} from "../../layout/getAll";
import {hasClosestByClassName} from "../../protyle/util/hasClosest";
import {isMobile, isValidCustomAttrName} from "../../util/functions";
import {Constants} from "../../constants";
import {MenuItem} from "../Menu";

const bindAttrInput = (inputElement: HTMLInputElement, id: string) => {
    inputElement.addEventListener("change", () => {
        fetchPost("/api/attr/setBlockAttrs", {
            id,
            attrs: {[inputElement.dataset.name]: inputElement.value}
        });
    });
};

export const openFileAttr = (attrs: IObject, focusName = "bookmark", protyle?: IProtyle) => {
    let customHTML = "";
    let notifyHTML = "";
    let hasAV = false;
    const range = getSelection().rangeCount > 0 ? getSelection().getRangeAt(0) : null;
    let ghostProtyle: Protyle;
    if (!protyle) {
        getAllEditor().find(item => {
            if (attrs.id === item.protyle.block.rootID) {
                protyle = item.protyle;
                return true;
            }
        });
        if (!protyle) {
            ghostProtyle = new Protyle(window.sourceflow.ws.app, document.createElement("div"), {
                blockId: attrs.id,
            });
        }
    }
    Object.keys(attrs).forEach(item => {
        if (Constants.CUSTOM_RIFF_DECKS === item || item.startsWith("custom-sf-")) {
            return;
        }
        if (item === Constants.CUSTOM_REMINDER_WECHAT) {
            notifyHTML = `<label class="b3-label b3-label--noborder">
    ${window.sourceflow.languages.wechatReminder}
    <div class="fn__hr"></div>
    <input class="b3-text-field fn__block" type="datetime-local" max="9999-12-31 23:59" readonly data-name="${item}" value="${dayjs(attrs[item]).format("YYYY-MM-DD HH:mm")}">
</label>`;
        } else if (item.indexOf("custom-av") > -1) {
            hasAV = true;
        } else if (item.indexOf("custom") > -1) {
            customHTML += `<label class="b3-label b3-label--noborder">
     <div class="fn__flex">
        <span class="fn__flex-1">${item.replace("custom-", "")}</span>
        <span data-action="remove" class="block__icon block__icon--show"><svg><use xlink:href="#iconMin"></use></svg></span>
    </div>
    <div class="fn__hr"></div>
    <textarea style="resize: vertical;" spellcheck="false" class="b3-text-field fn__block" rows="1" data-name="${item}"></textarea>
</label>`;
        }
    });
    const dialog = new Dialog({
        width: isMobile() ? "92vw" : "50vw",
        containerClassName: "b3-dialog__container--theme",
        height: "80vh",
        content: `<div class="fn__flex-column">
    <div class="layout-tab-bar fn__flex" style="flex-shrink:0;border-radius: var(--b3-border-radius-b) var(--b3-border-radius-b) 0 0">
        <div class="item item--full item--focus" data-type="attr">
            <span class="fn__flex-1"></span>
            <span class="item__text">${window.sourceflow.languages.builtIn}</span>
            <span class="fn__flex-1"></span>
        </div>
        <div class="item item--full${hasAV ? "" : " fn__none"}" data-type="NodeAttributeView">
            <span class="fn__flex-1"></span>
            <span class="item__text">${window.sourceflow.languages.database}</span>
            <span class="fn__flex-1"></span>
        </div>
        <div class="item item--full" data-type="custom">
            <span class="fn__flex-1"></span>
            <span class="item__text">${window.sourceflow.languages.custom}</span>
            <span class="fn__flex-1"></span>
        </div>
    </div>
    <div class="fn__flex-1">
        <div class="custom-attr" data-type="attr">
            <label class="b3-label b3-label--noborder">
                <div class="fn__flex">
                    <span class="fn__flex-1">${window.sourceflow.languages.bookmark}</span>
                    <span data-action="bookmark" class="block__icon block__icon--show"><svg><use xlink:href="#iconDown"></use></svg></span>
                </div>
                <div class="fn__hr"></div>
                <input spellcheck="${window.sourceflow.config.editor.spellcheck}" class="b3-text-field fn__block" placeholder="${window.sourceflow.languages.attrBookmarkTip}" data-name="bookmark">
            </label>
            <label class="b3-label b3-label--noborder">
                ${window.sourceflow.languages.name}
                <div class="fn__hr"></div>
                <input spellcheck="${window.sourceflow.config.editor.spellcheck}" class="b3-text-field fn__block" placeholder="${window.sourceflow.languages.attrNameTip}" data-name="name">
            </label>
            <label class="b3-label b3-label--noborder">
                ${window.sourceflow.languages.alias}
                <div class="fn__hr"></div>
                <input spellcheck="${window.sourceflow.config.editor.spellcheck}" class="b3-text-field fn__block" placeholder="${window.sourceflow.languages.attrAliasTip}" data-name="alias">
            </label>
            <label class="b3-label b3-label--noborder">
                ${window.sourceflow.languages.memo}
                <div class="fn__hr"></div>
                <textarea style="resize: vertical" spellcheck="${window.sourceflow.config.editor.spellcheck}" class="b3-text-field fn__block" placeholder="${window.sourceflow.languages.attrMemoTip}" rows="2" data-name="memo"></textarea>
            </label>
            ${notifyHTML}
        </div>
        <div data-type="NodeAttributeView" class="fn__none custom-attr"></div>
        <div data-type="custom" class="fn__none custom-attr">
           ${customHTML}
           <div class="b3-label">
               <button data-action="addCustom" class="b3-button b3-button--cancel">
                   <svg><use xlink:href="#iconAdd"></use></svg>${window.sourceflow.languages.addAttr}
               </button>
           </div>
        </div>
    </div>
</div>`,
        destroyCallback() {
            focusByRange(range);
            if (protyle) {
                hideElements(["select"], protyle);
            } else {
                ghostProtyle.destroy();
            }
        }
    });
    dialog.element.setAttribute("data-key", Constants.DIALOG_ATTR);
    (dialog.element.querySelector('.b3-text-field[data-name="bookmark"]') as HTMLInputElement).value = attrs.bookmark || "";
    (dialog.element.querySelector('.b3-text-field[data-name="name"]') as HTMLInputElement).value = attrs.name || "";
    (dialog.element.querySelector('.b3-text-field[data-name="alias"]') as HTMLInputElement).value = attrs.alias || "";
    (dialog.element.querySelector('.b3-text-field[data-name="memo"]') as HTMLInputElement).value = attrs.memo || "";
    dialog.element.querySelectorAll('.custom-attr[data-type="custom"] textarea.b3-text-field').forEach((item: HTMLTextAreaElement) => {
        item.value = attrs[item.dataset.name];
    });
    dialog.element.addEventListener("click", (event) => {
        let target = event.target as HTMLElement;
        const eventDetail = (event as Event & {detail?: unknown}).detail;
        if (typeof eventDetail === "string") {
            target = dialog.element.querySelector(`.item--full[data-type="${eventDetail}"]`);
        }
        while (target !== dialog.element) {
            const type = target.dataset.action;
            if (target.classList.contains("item--full")) {
                target.parentElement.querySelector(".item--focus").classList.remove("item--focus");
                target.classList.add("item--focus");
                dialog.element.querySelectorAll(".custom-attr").forEach((item: HTMLElement) => {
                    if (item.dataset.type === target.dataset.type) {
                        if (item.dataset.type === "NodeAttributeView" && item.innerHTML === "") {
                            renderAVAttribute(item, attrs.id, protyle || ghostProtyle.protyle);
                        }
                        item.classList.remove("fn__none");
                    } else {
                        item.classList.add("fn__none");
                    }
                });
            } else if (type === "remove") {
                fetchPost("/api/attr/setBlockAttrs", {
                    id: attrs.id,
                    attrs: {["custom-" + target.previousElementSibling.textContent]: ""}
                });
                target.parentElement.parentElement.remove();
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "bookmark") {
                fetchPost("/api/attr/getBookmarkLabels", {}, (response) => {
                    window.sourceflow.menus.menu.remove();
                    if (response.data.length === 0) {
                        window.sourceflow.menus.menu.append(new MenuItem({
                            id: "emptyContent",
                            iconHTML: "",
                            label: window.sourceflow.languages.emptyContent,
                            type: "readonly",
                        }).element);
                    } else {
                        response.data.forEach((item: string) => {
                            window.sourceflow.menus.menu.append(new MenuItem({
                                label: item,
                                click() {
                                    const bookmarkInputElement = target.parentElement.parentElement.querySelector("input") as HTMLInputElement;
                                    bookmarkInputElement.value = item;
                                    bookmarkInputElement.dispatchEvent(new CustomEvent("change"));
                                }
                            }).element);
                        });
                    }
                    window.sourceflow.menus.menu.element.classList.add("b3-menu--list");
                    window.sourceflow.menus.menu.popup({x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY + 16, w: 16});
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "addCustom") {
                const addDialog = new Dialog({
                    title: window.sourceflow.languages.attrName,
                    content: `<div class="b3-dialog__content"><input spellcheck="false" class="b3-text-field fn__block" value=""></div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.confirm}</button>
</div>`,
                    width: isMobile() ? "92vw" : "520px",
                });
                addDialog.element.setAttribute("data-key", Constants.DIALOG_SETCUSTOMATTR);
                const inputElement = addDialog.element.querySelector("input") as HTMLInputElement;
                const btnsElement = addDialog.element.querySelectorAll(".b3-button");
                addDialog.bindInput(inputElement, () => {
                    (btnsElement[1] as HTMLButtonElement).click();
                });
                inputElement.focus();
                inputElement.select();
                btnsElement[0].addEventListener("click", () => {
                    addDialog.destroy();
                });
                btnsElement[1].addEventListener("click", () => {
                    const value = inputElement.value.toLowerCase();
                    if (!isValidCustomAttrName(value)) {
                        showMessage(window.sourceflow.languages._kernel[25]);
                        return false;
                    }
                    let existElement: HTMLElement | false;
                    Array.from(dialog.element.querySelectorAll('.custom-attr[data-type="custom"] .b3-label .fn__flex-1')).find((labelItem: HTMLElement) => {
                        if (labelItem.textContent === value) {
                            existElement = hasClosestByClassName(labelItem, "b3-label");
                            return true;
                        }
                    });
                    if (existElement) {
                        showMessage(window.sourceflow.languages.hasAttrName.replace("${x}", value));
                    } else {
                        target.parentElement.insertAdjacentHTML("beforebegin", `<div class="b3-label b3-label--noborder">
    <div class="fn__flex">
        <span class="fn__flex-1">${value}</span>
        <span data-action="remove" class="block__icon block__icon--show"><svg><use xlink:href="#iconMin"></use></svg></span>
    </div>
    <div class="fn__hr"></div>
    <textarea style="resize: vertical" spellcheck="false" data-name="custom-${value}" class="b3-text-field fn__block" rows="1" placeholder="${window.sourceflow.languages.attrValue1}"></textarea>
</div>`);
                        const newInputElement = target.parentElement.previousElementSibling.querySelector(".b3-text-field") as HTMLInputElement;
                        newInputElement.focus();
                        bindAttrInput(newInputElement, attrs.id);
                        addDialog.destroy();
                    }
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            }
            target = target.parentElement;
        }
    });
    dialog.element.querySelectorAll(".b3-text-field").forEach((item: HTMLInputElement) => {
        if (focusName !== "av" && focusName !== "custom" && focusName === item.getAttribute("data-name")) {
            item.focus();
        }
        bindAttrInput(item, attrs.id);
    });
    if (focusName === "av") {
        dialog.element.dispatchEvent(new CustomEvent("click", {detail: "NodeAttributeView"}));
        (document.activeElement as HTMLElement)?.blur();
    } else if (focusName === "custom") {
        dialog.element.dispatchEvent(new CustomEvent("click", {detail: "custom"}));
    }
};

export const openAttr = (nodeElement: Element, focusName = "bookmark", protyle: IProtyle) => {
    if (nodeElement.getAttribute("data-type") === "NodeThematicBreak") {
        return;
    }
    const id = nodeElement.getAttribute("data-node-id");
    fetchPost("/api/attr/getBlockAttrs", {id}, (response) => {
        openFileAttr(response.data, focusName, protyle);
    });
};
