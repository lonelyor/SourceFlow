import {fetchPost} from "../util/fetch";
import {Dialog} from "../dialog";
import {highlightRender} from "../protyle/render/highlightRender";
import {isMobile} from "../util/functions";
import {Constants} from "../constants";

export const openChangelog = () => {
    fetchPost("/api/system/getChangelog", {}, (response) => {
        if (!response.data.show) {
            return;
        }
        const changelogTitle = window.sourceflow.languages.whatsNewInSourceFlow || "What's New in SourceFlow";
        const dialog = new Dialog({
            title: `✨ ${changelogTitle} v${window.sourceflow.config.system.kernelVersion}`,
            width: isMobile() ? "92vw" : "768px",
            height: isMobile() ? "80vh" : "70vh",
            content: `<div style="overflow:auto;" class="b3-dialog__content b3-typography b3-typography--default">${response.data.html}</div>`
        });
        dialog.element.setAttribute("data-key", Constants.DIALOG_CHANGELOG);
        highlightRender(dialog.element);
    });
};

export const deferOpenChangelog = () => {
    const run = () => openChangelog();
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => run(), {timeout: 2000});
        return;
    }
    window.setTimeout(run, 800);
};
