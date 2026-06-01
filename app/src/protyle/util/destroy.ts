import {hideElements} from "../ui/hideElements";
import {isSupportCSSHL} from "../render/searchMarkRender";
import {fetchPost} from "../../util/fetch";
import {Constants} from "../../constants";

export const flushTransactions = (protyle: IProtyle) => {
    if (!protyle || !window.sourceflow.transactions) {
        return;
    }
    const pending = window.sourceflow.transactions.filter(
        (t: { protyle: IProtyle }) => t.protyle && t.protyle.id === protyle.id
    );
    if (pending.length === 0) {
        return;
    }
    for (const tx of pending) {
        try {
            fetchPost("/api/transactions", {
                session: tx.protyle.id,
                app: Constants.SOURCEFLOW_APPID,
                transactions: [{
                    doOperations: tx.doOperations,
                    undoOperations: tx.undoOperations
                }]
            }, () => {
                const idx = window.sourceflow.transactions.indexOf(tx);
                if (idx > -1) {
                    window.sourceflow.transactions.splice(idx, 1);
                }
            });
        } catch (_e) {
            // keep in queue for retry
        }
    }
};

export const destroy = (protyle: IProtyle) => {
    if (!protyle) {
        return;
    }
    flushTransactions(protyle);
    hideElements(["util"], protyle);
    if (isSupportCSSHL()) {
        protyle.highlight.markHL.clear();
        protyle.highlight.mark.clear();
        protyle.highlight.ranges = [];
        protyle.highlight.rangeIndex = 0;
    }
    protyle.observer?.disconnect();
    protyle.observerLoad?.disconnect();
    protyle.element.classList.remove("protyle");
    protyle.element.removeAttribute("style");
    if (protyle.wysiwyg) {
        protyle.wysiwyg.lastHTMLs = {};
    }
    if (protyle.undo) {
        protyle.undo.clear();
    }
    try {
        protyle.ws.send("closews", {});
    } catch (e) {
        setTimeout(() => {
            protyle.ws.send("closews", {});
        }, 10240);
    }
    protyle.app.plugins.forEach(item => {
        item.eventBus.emit("destroy-protyle", {
            protyle,
        });
    });
};
