import {MenuItem} from "./Menu";
import {Dialog} from "../dialog";
import {isMobile} from "../util/functions";
import {fetchPost} from "../util/fetch";
import {Constants} from "../constants";

export const transferBlockRef = (id: string) => {
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "transferBlockRef",
        label: window.sourceflow.languages.transferBlockRef,
        icon: "iconScrollHoriz",
        click() {
            const renameDialog = new Dialog({
                title: window.sourceflow.languages.transferBlockRef,
                content: `<div class="b3-dialog__content">
    <input class="b3-text-field fn__block" placeholder="${window.sourceflow.languages.targetBlockID}">
    <div class="b3-label__text">${window.sourceflow.languages.transferBlockRefTip}</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.confirm}</button>
</div>`,
                width: isMobile() ? "92vw" : "520px",
            });
            renameDialog.element.setAttribute("data-key", Constants.DIALOG_TRANSFERBLOCKREF);
            const inputElement = renameDialog.element.querySelector("input") as HTMLInputElement;
            const btnsElement = renameDialog.element.querySelectorAll(".b3-button");
            renameDialog.bindInput(inputElement, () => {
                (btnsElement[1] as HTMLButtonElement).click();
            });
            inputElement.focus();
            btnsElement[0].addEventListener("click", () => {
                renameDialog.destroy();
            });
            btnsElement[1].addEventListener("click", () => {
                fetchPost("/api/block/transferBlockRef", {
                    fromID: id,
                    toID: inputElement.value,
                });
                renameDialog.destroy();
            });
        }
    }).element);
};
