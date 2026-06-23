import {isMobile} from "../util/functions";
import {Dialog} from "./index";
import {Constants} from "../constants";

export const confirmDialog = (title: string, text: string,
                              confirm?: (dialog?: Dialog) => void,
                              cancelOrIsDelete?: ((dialog: Dialog) => void) | boolean,
                              isDelete = false) => {
    const cancel = typeof cancelOrIsDelete === "function" ? cancelOrIsDelete : undefined;
    const isDeleteAction = typeof cancelOrIsDelete === "boolean" ? cancelOrIsDelete : isDelete;
    if (!text && !title) {
        confirm();
        return;
    }
    const dialog = new Dialog({
        title,
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword">${text}</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" id="cancelDialogConfirmBtn">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button ${isDeleteAction ? "b3-button--remove" : "b3-button--text"}" id="confirmDialogConfirmBtn">${window.sourceflow.languages[isDeleteAction ? "delete" : "confirm"]}</button>
</div>`,
        width: isMobile() ? "92vw" : "520px",
    });

    dialog.element.addEventListener("click", (event) => {
        let target = event.target as HTMLElement;
        const isDispatch = typeof event.detail === "string";
        while (target && target !== dialog.element || isDispatch) {
            if (target.id === "cancelDialogConfirmBtn" || (isDispatch && event.detail=== "Escape")) {
                if (cancel) {
                    cancel(dialog);
                }
                dialog.destroy();
                break;
            } else if (target.id === "confirmDialogConfirmBtn" || (isDispatch && event.detail=== "Enter")) {
                if (confirm) {
                    confirm(dialog);
                }
                dialog.destroy();
                break;
            }
            target = target.parentElement;
        }
    });
    dialog.element.setAttribute("data-key", Constants.DIALOG_CONFIRM);
};
