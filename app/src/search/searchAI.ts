import {getAllModels} from "../layout/getAll";
/// #if !BROWSER
import * as path from "path";
/// #endif
import {Constants} from "../constants";
import {escapeAriaLabel, escapeGreat, escapeHtml} from "../util/escape";
import {fetchPost} from "../util/fetch";
import {openFile, openFileById} from "../editor/util";
import {showMessage} from "../dialog/message";
import {reloadProtyle} from "../protyle/util/reload";
import {MenuItem} from "../menus/Menu";
import {getDisplayName, getNotebookIcon, getNotebookName, movePathTo, pathPosix, useShell} from "../util/pathName";
import {Protyle} from "../protyle";
import {onGet} from "../protyle/util/onGet";
import {addLoading} from "../protyle/ui/initUI";
import {getIconByType} from "../editor/getIcon";
import {unicode2Emoji} from "../emoji";
import {hasClosestBlock, hasClosestByClassName, hasClosestByTag} from "../protyle/util/hasClosest";
import {isIPad, isNotCtrl, setStorageVal, updateHotkeyTip, writeText} from "../protyle/util/compatibility";
import {newFileByName} from "../util/newFile";
import {
    filterMenu,
    getKeyByLiElement,
    initCriteriaMenu,
    moreMenu,
    queryMenu,
    replaceFilterMenu,
    saveCriterion
} from "./menu";
import {App} from "../index";
import {
    assetFilterMenu,
    assetInputEvent,
    assetMethodMenu,
    assetMoreMenu,
    openSearchAsset,
    renderNextAssetMark,
    renderPreview,
} from "./assets";
import {resize} from "../protyle/util/resize";
import {addClearButton} from "../util/addClearButton";
import {checkFold} from "../util/noRelyPCFunction";
import {getUnRefList, openSearchUnRef, unRefMoreMenu} from "./unRef";
import {getDefaultType} from "./getDefault";
import {isSupportCSSHL, searchMarkRender} from "../protyle/render/searchMarkRender";
import {saveKeyList, toggleAssetHistory, toggleReplaceHistory, toggleSearchHistory} from "./toggleHistory";
import {highlightById} from "../util/highlightById";
import {getSelectionOffset} from "../protyle/util/selection";
import {electronUndo} from "../protyle/undo";
import {getContenteditableElement} from "../protyle/wysiwyg/getBlock";
import {clearSearchRequestCache, fullTextSearchBlocksCached, getRecentUpdatedBlocksCached} from "./cache";
import {assistantText} from "../assistant/constants";
import {escapeAttr as escapeAssistantAttr, escapeHTML as escapeAssistantHTML, truncateText} from "../assistant/common/dom";
import {ensureAssistantFeatureAvailable, reportAssistantRuntimeError, runAssistantFeature} from "../assistant/runtime";

type IAssistantSearchSource = import("../assistant/search/ask").IAssistantSearchSource;

const loadAssistantNoteModule = () => import("../assistant/common/note");
const loadAssistantInboxModule = () => import("../assistant/inbox/store");
const loadAssistantSearchModule = () => import("../assistant/search/ask");
const loadAssistantAIDockModule = () => import("../assistant/ai/AIDock");

type TSearchAIState = {
    query: string;
    answer: string;
    sessionId: string;
    sources: IAssistantSearchSource[];
    loading: boolean;
};

type TSearchElementWithAI = HTMLElement & {
    assistantAISearchState?: TSearchAIState | null;
};

const SEARCH_AI_SOURCE_LIMIT = 8;

const setSearchAIState = (element: Element, state: TSearchAIState | null) => {
    (element as TSearchElementWithAI).assistantAISearchState = state;
};

const getSearchAIState = (element: Element) => {
    return (element as TSearchElementWithAI).assistantAISearchState || null;
};

const setSearchAIIconState = (element: Element, active: boolean, loading = false) => {
    const buttonElement = element.querySelector("#searchAskAI");
    const iconElement = buttonElement?.firstElementChild as SVGElement;
    if (!buttonElement || !iconElement) {
        return;
    }
    if (active) {
        iconElement.classList.add("ft__primary");
    } else {
        iconElement.classList.remove("ft__primary");
    }
    if (loading) {
        iconElement.classList.add("fn__rotate");
        buttonElement.setAttribute("disabled", "disabled");
    } else {
        iconElement.classList.remove("fn__rotate");
        buttonElement.removeAttribute("disabled");
    }
};

const resetSearchAI = (element: Element) => {
    setSearchAIState(element, null);
    element.removeAttribute("data-search-ai-token");
    const panelElement = element.querySelector("#searchAIAnswer");
    if (panelElement) {
        panelElement.classList.add("fn__none");
        panelElement.innerHTML = "";
    }
    setSearchAIIconState(element, false, false);
};

const collectSearchAISources = (blocks: IBlock[]) => {
    const flattened: IAssistantSearchSource[] = [];
    blocks.forEach((item) => {
        const title = `${getNotebookName(item.box)}${getDisplayName(item.hPath, false)}`;
        if (item.children?.length) {
            item.children.forEach((childItem) => {
                flattened.push({
                    id: childItem.id,
                    rootID: childItem.rootID,
                    title,
                    path: title,
                    content: `${childItem.content || ""}`.replace(/\s+/g, " ").trim(),
                });
            });
            return;
        }
        flattened.push({
            id: item.id,
            rootID: item.rootID,
            title,
            path: title,
            content: `${item.content || ""}`.replace(/\s+/g, " ").trim(),
        });
    });
    const unique: IAssistantSearchSource[] = [];
    const seen = new Set<string>();
    flattened.forEach((item) => {
        if (!item.id || !item.content || seen.has(item.id)) {
            return;
        }
        seen.add(item.id);
        unique.push(item);
    });
    return unique.slice(0, SEARCH_AI_SOURCE_LIMIT);
};

const getSearchFilterSummary = (config: Config.IUILayoutTabSearchConfig) => {
    const filters: string[] = [];
    if (config.hPath) {
        filters.push(`${assistantText("路径", "Path")}: ${config.hPath}`);
    }
    const enabledTypes = Object.entries(config.types || {}).filter(([, enabled]) => enabled).map(([key]) => key);
    if (enabledTypes.length > 0 && enabledTypes.length < Object.keys(config.types || {}).length) {
        filters.push(`${assistantText("块类型", "Block types")}: ${enabledTypes.join(", ")}`);
    }
    return filters;
};

const renderSearchAIAnswer = (answer: string) => {
    return escapeAssistantHTML(answer).replace(/\n/g, "<br>");
};

const renderSearchAIPanel = (element: Element) => {
    const panelElement = element.querySelector("#searchAIAnswer");
    if (!panelElement) {
        return;
    }
    const state = getSearchAIState(element);
    if (!state) {
        panelElement.classList.add("fn__none");
        panelElement.innerHTML = "";
        setSearchAIIconState(element, false, false);
        return;
    }
    panelElement.classList.remove("fn__none");
    setSearchAIIconState(element, true, state.loading);
    if (state.loading) {
        panelElement.innerHTML = `<div class="search__ai-card search__ai-card--loading">
    <div class="search__ai-title">${escapeAssistantHTML(assistantText("AI 搜索", "AI Search"))}</div>
    <div class="search__ai-subtitle">${escapeAssistantHTML(assistantText("正在基于当前搜索结果生成答案...", "Generating an answer from the current search results..."))}</div>
</div>`;
        return;
    }
    panelElement.innerHTML = `<div class="search__ai-card">
    <div class="search__ai-head">
        <div class="fn__flex-1">
            <div class="search__ai-title">${escapeAssistantHTML(assistantText("AI 搜索答案", "AI Search Answer"))}</div>
            <div class="search__ai-subtitle">${escapeAssistantHTML(`${truncateText(state.query, 80)} · ${assistantText("来源", "Sources")} ${state.sources.length}`)}</div>
        </div>
        <div class="search__ai-actions">
            <button type="button" class="b3-button b3-button--outline" data-type="search-ai-copy">${assistantText("复制", "Copy")}</button>
            <button type="button" class="b3-button b3-button--outline" data-type="search-ai-insert">${assistantText("插入当前笔记", "Insert into note")}</button>
            <button type="button" class="b3-button b3-button--outline" data-type="search-ai-inbox">${assistantText("收进收件箱", "Save to inbox")}</button>
            <button type="button" class="b3-button b3-button--outline" data-type="search-ai-chat">${assistantText("继续聊天", "Continue in chat")}</button>
            <button type="button" class="b3-button b3-button--outline" data-type="search-ai-clear">${window.sourceflow.languages.close}</button>
        </div>
    </div>
    <div class="search__ai-body">${renderSearchAIAnswer(state.answer)}</div>
    ${state.sources.length ? `<div class="search__ai-sources">${state.sources.map((item, index) => `
        <button type="button" class="search__ai-source" data-type="search-ai-source" data-node-id="${escapeAssistantAttr(item.id)}" aria-label="${escapeAriaLabel(item.path)}">
            <span class="search__ai-source-index">${index + 1}</span>
            <span class="search__ai-source-label">${escapeAssistantHTML(truncateText(item.title, 56))}</span>
        </button>`).join("")}</div>` : ""}
</div>`;
};


const runSearchAI = async (app: App, element: Element, config: Config.IUILayoutTabSearchConfig) => {
    if (!ensureAssistantFeatureAvailable()) {
        return;
    }
    const searchInputElement = element.querySelector("#searchInput") as HTMLInputElement;
    const query = `${searchInputElement?.value || ""}`.trim();
    if (!query) {
        showMessage(assistantText("请先输入要搜索的问题", "Enter a question to search first"), 3000, "error");
        return;
    }
    const requestToken = Date.now().toString();
    element.setAttribute("data-search-ai-token", requestToken);
    setSearchAIState(element, {
        query,
        answer: "",
        sessionId: "",
        sources: [],
        loading: true,
    });
    renderSearchAIPanel(element);
    try {
        const response = await fullTextSearchBlocksCached({
            ...config,
            query,
            k: query,
            page: 1,
        });
        if (element.getAttribute("data-search-ai-token") !== requestToken) {
            return;
        }
        const sources = collectSearchAISources(response.data?.blocks || []);
        if (sources.length === 0) {
            resetSearchAI(element);
            showMessage(assistantText("当前搜索结果不足，先调整关键词再问 AI", "The current search results are too sparse. Refine the query before asking AI."), 4000, "error");
            return;
        }
        const {runAssistantWorkspaceSearch} = await loadAssistantSearchModule();
        const result = await runAssistantWorkspaceSearch({
            query,
            filters: getSearchFilterSummary(config),
            sources,
        });
        if (element.getAttribute("data-search-ai-token") !== requestToken) {
            return;
        }
        setSearchAIState(element, {
            query,
            answer: result.answer,
            sessionId: result.sessionId,
            sources,
            loading: false,
        });
        renderSearchAIPanel(element);
    } catch (error) {
        if (element.getAttribute("data-search-ai-token") !== requestToken) {
            return;
        }
        resetSearchAI(element);
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    }
};

export {getSearchAIState, renderSearchAIPanel, resetSearchAI, runSearchAI};

