import {Constants} from "../../constants";
import {escapeAriaLabel, escapeHtml} from "../../util/escape";
import {fetchPost} from "../../util/fetch";

const totalCountSelector = '[data-type="file-tree-total-count"]';

const formatCount = (count: number) => count.toLocaleString();

const replaceCount = (template: string, count: number) => {
    return template.replace("${x}", formatCount(count)).replace("x", formatCount(count));
};

export const genFileTreeDocCountHTML = (count: number) => {
    if (count <= 0) {
        return "";
    }
    const label = replaceCount(
        window.sourceflow.languages.fileTreeDocCountLabel || "Contains ${x} child docs",
        count,
    );
    return `<span class="file-tree__doc-count ariaLabel" data-position="parentE" aria-label="${escapeAriaLabel(label)}">${formatCount(count)}</span>`;
};

export const syncFileTreeDocCountElement = (itemElement: Element, count: number) => {
    itemElement.querySelector(".file-tree__doc-count")?.remove();
    const countHTML = genFileTreeDocCountHTML(count);
    if (!countHTML) {
        return;
    }
    const refCountElement = itemElement.querySelector(".counter");
    if (refCountElement) {
        refCountElement.insertAdjacentHTML("beforebegin", countHTML);
        return;
    }
    itemElement.insertAdjacentHTML("beforeend", countHTML);
};

export const genFileTreeTotalCountHTML = () => {
    const label = window.sourceflow.languages.fileTreeTotalCountLabel || "Total docs";
    const prefix = window.sourceflow.languages.fileTreeTotalCountPrefix || "Docs";
    return `<span class="file-tree__total-count ariaLabel" data-position="south" aria-label="${escapeAriaLabel(label)}">
    <span class="file-tree__total-count-label">${escapeHtml(prefix)}</span>
    <span data-type="file-tree-total-count">0</span>
</span>`;
};

const setTotalCount = (actionsElement: HTMLElement, count: number) => {
    const countElement = actionsElement.querySelector<HTMLElement>(totalCountSelector);
    if (countElement) {
        countElement.textContent = formatCount(count);
    }
};

export const refreshFileTreeTotalCount = (actionsElement: HTMLElement) => {
    if (window.sourceflow.config.appearance.fileTreeTotalCount === false) {
        setTotalCount(actionsElement, 0);
        return;
    }

    const countElement = actionsElement.querySelector<HTMLElement>(totalCountSelector);
    if (!countElement) {
        return;
    }

    const notebooks = (window.sourceflow.notebooks || []).filter((notebook) => !notebook.closed);
    if (notebooks.length === 0) {
        setTotalCount(actionsElement, 0);
        return;
    }

    const requestId = `${Date.now()}-${Math.random()}`;
    actionsElement.dataset.fileTreeTotalCountRequest = requestId;
    let pending = notebooks.length;
    let total = 0;

    notebooks.forEach((notebook) => {
        fetchPost("/api/filetree/listDocTree", {
            notebook: notebook.id,
            path: "/",
            countOnly: true,
            app: Constants.SOURCEFLOW_APPID,
        }, (response) => {
            if (actionsElement.dataset.fileTreeTotalCountRequest !== requestId) {
                return;
            }
            const count = Number(response?.data?.count);
            if (!Number.isNaN(count) && count > 0) {
                total += count;
            }
            pending--;
            if (pending === 0) {
                setTotalCount(actionsElement, total);
            }
        });
    });
};

export const refreshAllFileTreeTotalCounts = () => {
    document.querySelectorAll<HTMLElement>(".sf__file .block__icons").forEach((actionsElement) => {
        refreshFileTreeTotalCount(actionsElement);
    });
};
