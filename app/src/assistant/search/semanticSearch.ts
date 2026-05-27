import {Constants} from "../../constants";
import {fetchPost} from "../../util/fetch";
import {openFileById} from "../../editor/util";
import {assistantText} from "../constants";
import {escapeHTML, escapeAttr, truncateText} from "../common/dom";
import {showMessage} from "../../dialog/message";
import {App} from "../../index";

interface ISemanticSearchResult {
    rootID: string;
    title: string;
    hPath: string;
    updatedAt: number;
}

interface ISemanticSearchResponse {
    results: ISemanticSearchResult[];
    count: number;
}

const SEMANTIC_SEARCH_PANEL_ID = "semanticSearchPanel";

const renderSemanticSearchResults = (
    results: ISemanticSearchResult[],
    container: HTMLElement,
    app: App,
) => {
    if (results.length === 0) {
        container.innerHTML = `<div class="b3-list__empty">${escapeHTML(assistantText("没有找到语义相关的笔记", "No semantically similar notes found"))}</div>`;
        return;
    }
    container.innerHTML = results.map((item, index) => {
        const title = item.title || item.rootID;
        const path = item.hPath || "";
        return `<button type="button" class="b3-list-item b3-list-item--two" data-type="semantic-result" data-root-id="${escapeAttr(item.rootID)}">
    <div class="b3-list-item__first">
        <span class="b3-list-item__text">${escapeHTML(truncateText(title, 80))}</span>
    </div>
    <span class="fn__flex-1"></span>
    <span class="b3-list-item__meta">${escapeHTML(truncateText(path, 60))}</span>
</button>`;
    }).join("");

    container.querySelectorAll('[data-type="semantic-result"]').forEach((btn) => {
        btn.addEventListener("click", () => {
            const rootID = (btn as HTMLElement).getAttribute("data-root-id") || "";
            if (rootID) {
                openFileById({
                    app,
                    id: rootID,
                    action: [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS],
                });
            }
        });
    });
};

export const openSemanticSearchPanel = (app: App, parentElement: HTMLElement) => {
    let panel = parentElement.querySelector(`#${SEMANTIC_SEARCH_PANEL_ID}`) as HTMLElement;
    if (!panel) {
        panel = document.createElement("div");
        panel.id = SEMANTIC_SEARCH_PANEL_ID;
        panel.className = "fn__flex-column";
        panel.style.height = "100%";
        panel.innerHTML = `<div class="b3-form__icon search__header">
    <div class="fn__flex-1" style="position:relative">
        <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
        <input class="b3-text-field b3-text-field--text" id="semanticSearchInput" placeholder="${escapeAttr(assistantText("输入自然语言搜索...", "Enter natural language query..."))}" autocomplete="off" spellcheck="false">
    </div>
    <span class="fn__space"></span>
    <span id="semanticSearchLoading" class="fn__none fn__rotate svg" style="padding:0 8px;align-self:center"><use xlink:href="#iconRefresh"></use></span>
</div>
<div id="semanticSearchResults" class="fn__flex-1 search__list b3-list b3-list--background" style="overflow:auto"></div>`;
        parentElement.appendChild(panel);

        const input = panel.querySelector("#semanticSearchInput") as HTMLInputElement;
        const resultsContainer = panel.querySelector("#semanticSearchResults") as HTMLElement;
        const loading = panel.querySelector("#semanticSearchLoading") as HTMLElement;

        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        const doSearch = () => {
            const query = input.value.trim();
            if (!query) {
                resultsContainer.innerHTML = `<div class="b3-list__empty">${escapeHTML(assistantText("输入自然语言描述进行语义搜索", "Enter a natural language query for semantic search"))}</div>`;
                return;
            }
            loading.classList.remove("fn__none");
            resultsContainer.innerHTML = `<div class="b3-list__empty">${escapeHTML(assistantText("搜索中...", "Searching..."))}</div>`;

            fetchPost("/api/assistant/embedding/search", {query, limit: 16}, (response: { code: number; msg?: string; data?: ISemanticSearchResponse }) => {
                loading.classList.add("fn__none");
                if (response.code !== 0) {
                    resultsContainer.innerHTML = `<div class="b3-list__empty">${escapeHTML(response.msg || assistantText("搜索失败", "Search failed"))}</div>`;
                    return;
                }
                const results = response.data?.results || [];
                renderSemanticSearchResults(results, resultsContainer, app);
            });
        };

        input.addEventListener("input", () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(doSearch, 600);
        });

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }
                doSearch();
            }
        });
    }

    const mainSearch = parentElement.querySelector('[style*="height: 100%"]:not(#' + SEMANTIC_SEARCH_PANEL_ID + ")") as HTMLElement;
    if (mainSearch) {
        mainSearch.classList.add("fn__none");
    }
    panel.classList.remove("fn__none");

    const input = panel.querySelector("#semanticSearchInput") as HTMLInputElement;
    input?.focus();
};

export const closeSemanticSearchPanel = (parentElement: HTMLElement) => {
    const panel = parentElement.querySelector(`#${SEMANTIC_SEARCH_PANEL_ID}`) as HTMLElement;
    if (panel) {
        panel.classList.add("fn__none");
    }
    const mainSearch = parentElement.querySelector(".fn__flex-column[style]") as HTMLElement;
    if (mainSearch && mainSearch.id !== SEMANTIC_SEARCH_PANEL_ID) {
        mainSearch.classList.remove("fn__none");
    }
};
