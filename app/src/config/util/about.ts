import {Dialog} from "../../dialog";
import {isMobile} from "../../util/functions";
import {fetchPost} from "../../util/fetch";
import {Constants} from "../../constants";

export const setAccessAuthCode = () => {
    const dialog = new Dialog({
        title: window.sourceflow.languages.about5,
        content: `<div class="b3-dialog__content">
    <input class="b3-text-field fn__block" placeholder="${window.sourceflow.languages.about5}" value="${window.sourceflow.config.accessAuthCode}">
    <div class="b3-label__text">${window.sourceflow.languages.about6}</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.confirm}</button>
</div>`,
        width: isMobile() ? "92vw" : "520px",
    });
    const inputElement = dialog.element.querySelector("input") as HTMLInputElement;
    const btnsElement = dialog.element.querySelectorAll(".b3-button");
    dialog.element.setAttribute("data-key", Constants.DIALOG_ACCESSAUTHCODE);
    dialog.bindInput(inputElement, () => {
        (btnsElement[1] as HTMLButtonElement).click();
    });
    inputElement.select();
    btnsElement[0].addEventListener("click", () => {
        dialog.destroy();
    });
    btnsElement[1].addEventListener("click", () => {
        fetchPost("/api/system/setAccessAuthCode", {accessAuthCode: inputElement.value});
    });
};

export const getCloudURL = (key: string) => {
    const origin = "https://github.com/lonelyor/SourceFlow";
    if (!key || "" === key) {
        return origin;
    }
    return `${origin}/${key.replace(/^\/+/, "")}`;
};

export const getIndexURL = (key: string) => {
    const origin = "https://github.com/lonelyor/SourceFlow";
    if (!key || "" === key) {
        return origin;
    }
    return `${origin}/${key.replace(/^\/+/, "")}`;
};
