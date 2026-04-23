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

export const openGlobalSearch = (app: App, text: string, replace: boolean, searchData?: Config.IUILayoutTabSearchConfig) => {
    text = text.trim();
    const searchModel = getAllModels().search.find((item) => {
        item.parent.parent.switchTab(item.parent.headElement);
        item.updateSearch(text, replace);
        return true;
    });
    if (searchModel) {
        return;
    }
    const localData = window.sourceflow.storage[Constants.LOCAL_SEARCHDATA];
    openFile({
        app,
        searchData: {
            k: text,
            r: "",
            hasReplace: false,
            method: searchData ? searchData.method : localData.method,
            hPath: "",
            idPath: [],
            group: localData.group,
            sort: localData.sort,
            types: Object.assign({}, localData.types),
            replaceTypes: Object.assign({}, localData.replaceTypes),
            removed: localData.removed,
            page: 1
        },
        position: (!window.sourceflow.config.fileTree.noSplitScreenWhenOpenTab && (window.sourceflow.layout.centerLayout.children.length > 1 || window.innerWidth > 1024)) ? "right" : undefined
    });
};

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

const focusSearchResultById = (element: Element, edit: Protyle, config: Config.IUILayoutTabSearchConfig, id: string) => {
    const currentFocusElement = element.querySelector("#searchList .b3-list-item--focus");
    currentFocusElement?.classList.remove("b3-list-item--focus");
    const listItemElement = element.querySelector(`#searchList [data-type="search-item"][data-node-id="${id}"]`) as HTMLElement;
    if (listItemElement) {
        listItemElement.classList.add("b3-list-item--focus");
        listItemElement.scrollIntoView({block: "nearest"});
    }
    getArticle({
        edit,
        id,
        config,
        value: (element.querySelector("#searchInput") as HTMLInputElement).value,
    });
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

// closeCB 不存在为页签搜索
export const genSearch = (app: App, config: Config.IUILayoutTabSearchConfig, element: HTMLElement, closeCB?: () => void) => {
    let includeChild = true;
    let enableIncludeChild = false;
    config.idPath.forEach(item => {
        if (item.endsWith(".sf")) {
            includeChild = false;
        }
        if (item.split("/").length > 1) {
            enableIncludeChild = true;
        }
    });
    const data = window.sourceflow.storage[Constants.LOCAL_SEARCHKEYS];
    const unRefLocal = window.sourceflow.storage[Constants.LOCAL_SEARCHUNREF];
    element.innerHTML = `<div class="fn__flex-column" style="height: 100%;${closeCB ? "border-radius: var(--b3-border-radius-b);overflow: hidden;" : ""}">
    <div class="block__icons" style="overflow: auto">
        <span data-position="9south" data-type="previous" class="block__icon block__icon--show ariaLabel" disabled="disabled" aria-label="${window.sourceflow.languages.previousLabel}"><svg><use xlink:href='#iconLeft'></use></svg></span>
        <span class="fn__space"></span>
        <span data-position="9south" data-type="next" class="block__icon block__icon--show ariaLabel" disabled="disabled" aria-label="${window.sourceflow.languages.nextLabel}"><svg><use xlink:href='#iconRight'></use></svg></span>
        <span class="fn__space"></span>
        <span id="searchResult" class="fn__flex-shrink ft__selectnone"></span>
        <span class="fn__space"></span>
        <span class="fn__flex-1${closeCB ? " resize__move" : ""}" style="min-height: 100%"></span>
        <span id="searchPathInput" data-position="9south" class="search__path ft__on-surface fn__flex-center ft__smaller fn__ellipsis ariaLabel" aria-label="${escapeAriaLabel(config.hPath)}">
            ${escapeHtml(config.hPath)}
            <svg class="search__rmpath${config.hPath ? "" : " fn__none"}"><use xlink:href="#iconCloseRound"></use></svg>
        </span>
        <span class="fn__space"></span>
        <span data-position="9south" id="searchInclude" ${enableIncludeChild ? "" : "disabled"} aria-label="${window.sourceflow.languages.includeChildDoc}" class="block__icon block__icon--show ariaLabel">
            <svg${includeChild ? ' class="ft__primary"' : ""}><use xlink:href="#iconInclude"></use></svg>
        </span>
        <span class="fn__space"></span>
        <span id="searchPath" aria-label="${window.sourceflow.languages.specifyPath}" class="block__icon block__icon--show ariaLabel" data-position="9south">
            <svg><use xlink:href="#iconFolder"></use></svg>
        </span>
        <span class="fn__space"></span>
        <span id="searchMore" aria-label="${window.sourceflow.languages.more}" class="block__icon block__icon--show ariaLabel" data-position="9south">
            <svg><use xlink:href="#iconMore"></use></svg>
        </span>
        <span class="${closeCB ? "" : "fn__none "}fn__space"></span>
        <span id="searchOpen" aria-label="${window.sourceflow.languages.openInNewTab}" class="${closeCB ? "" : "fn__none "}block__icon block__icon--show ariaLabel" data-position="9south">
            <svg><use xlink:href="#iconLayoutRight"></use></svg>
        </span>
        <span class="fn__space"></span>
        <span id="searchUnRef" aria-label="${window.sourceflow.languages.listInvalidRefBlocks}" class="block__icon block__icon--show ariaLabel" data-position="9south">
            <svg><use xlink:href="#iconLinkOff"></use></svg>
        </span>
        <span class="fn__space"></span>
        <span id="searchAsset" aria-label="${window.sourceflow.languages.searchAssetContent}" class="block__icon block__icon--show ariaLabel" data-position="9south">
            <svg><use xlink:href="#iconExact"></use></svg>
        </span>
    </div>
    <div class="b3-form__icon search__header">
        <div style="position: relative" class="fn__flex-1">
            <span class="search__history-icon ariaLabel" id="searchHistoryBtn" aria-label="${updateHotkeyTip("⌥↓")}">
                <svg data-menu="true" class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
                <svg class="search__arrowdown"><use xlink:href="#iconDown"></use></svg>
            </span>
            <input id="searchInput" class="b3-text-field b3-text-field--text" placeholder="${window.sourceflow.languages.showRecentUpdatedBlocks}" autocomplete="off" autocorrect="off" spellcheck="false">
        </div>
        <div class="block__icons">
            <span id="searchFilter" aria-label="${window.sourceflow.languages.searchType}" class="block__icon ariaLabel" data-position="9south">
                <svg><use xlink:href="#iconFilter"></use></svg>
            </span> 
            <span class="fn__space"></span>
            ${genQueryHTML(config.method, "searchSyntaxCheck")}
            <span class="fn__space"></span>
            <span id="searchReplace" aria-label="${window.sourceflow.languages.replace}" class="block__icon ariaLabel" data-position="9south">
                <svg><use xlink:href="#iconReplace"></use></svg>
            </span>
            <span class="fn__space"></span>
            <span id="searchRefresh" aria-label="${window.sourceflow.languages.refresh}" class="block__icon ariaLabel" data-position="9south">
                <svg><use xlink:href="#iconRefresh"></use></svg>
            </span>
            <span class="fn__space"></span>
            <span id="searchAskAI" aria-label="${assistantText("问 AI", "Ask AI")}" class="block__icon ariaLabel" data-position="9south">
                <svg><use xlink:href="#iconSparkles"></use></svg>
            </span>
            <div class="fn__flex${config.group === 0 ? " fn__none" : ""}">
                <span class="fn__space"></span>
                <span id="searchExpand" class="block__icon block__icon--show ariaLabel" data-position="9south" aria-label="${window.sourceflow.languages.expand}">
                    <svg><use xlink:href="#iconExpand"></use></svg>
                </span>
                <span class="fn__space"></span>
                <span id="searchCollapse" class="block__icon block__icon--show ariaLabel" data-position="9south" aria-label="${window.sourceflow.languages.collapse}">
                    <svg><use xlink:href="#iconContract"></use></svg>
                </span>
            </div>
        </div>
    </div>
    <div class="b3-form__icon search__header${config.hasReplace ? "" : " fn__none"}">
        <div class="fn__flex-1" style="position: relative">
            <span class="search__history-icon ariaLabel" id="replaceHistoryBtn" aria-label="${updateHotkeyTip("⌥↓")}">
                <svg data-menu="true" class="b3-form__icon-icon"><use xlink:href="#iconReplace"></use></svg>
                <svg class="search__arrowdown"><use xlink:href="#iconDown"></use></svg>
            </span>
            <input id="replaceInput" class="b3-text-field b3-text-field--text">
        </div>
        <div class="fn__space"></div>
        <svg class="fn__rotate fn__none svg" style="padding: 0 8px;align-self: center;margin-right: 8px"><use xlink:href="#iconRefresh"></use></svg>
        <span id="replaceFilter" aria-label="${window.sourceflow.languages.replaceType}" class="block__icon ariaLabel fn__flex-center" data-position="9south">
            <svg><use xlink:href="#iconFilter"></use></svg>
        </span>
        <span class="fn__space"></span>
        <button id="replaceAllBtn" class="b3-button b3-button--small b3-button--outline fn__flex-center">${window.sourceflow.languages.replaceAll}</button>
        <div class="fn__space"></div>
        <button id="replaceBtn" class="b3-button b3-button--small b3-button--outline fn__flex-center">↵ ${window.sourceflow.languages.replace}</button>
        <div class="fn__space"></div>
    </div>
    <div id="criteria" class="search__header"></div>
    <div id="searchAIAnswer" class="search__ai fn__none"></div>
    <div class="search__layout${(closeCB ? data.layout === 1 : data.layoutTab === 1) ? " search__layout--row" : ""}">
        <div id="searchList" class="fn__flex-1 search__list b3-list b3-list--background"></div>
        <div class="search__drag"></div>
        <div id="searchPreview" class="fn__flex-1 search__preview"></div>
    </div>
    <div class="search__tip${closeCB ? "" : " fn__none"}">
        <kbd>↑/↓/PageUp/PageDown</kbd> ${window.sourceflow.languages.searchTip1}
        <kbd>${updateHotkeyTip(window.sourceflow.config.keymap.general.newFile.custom)}</kbd> ${window.sourceflow.languages.new}
        <kbd>${window.sourceflow.languages.enterKey}/${window.sourceflow.languages.doubleClick}</kbd> ${window.sourceflow.languages.searchTip2}
        <kbd>${window.sourceflow.languages.click}</kbd> ${window.sourceflow.languages.searchTip3}
        <kbd>${updateHotkeyTip(window.sourceflow.config.keymap.editor.general.insertRight.custom)}/${updateHotkeyTip("⌥" + window.sourceflow.languages.click)}</kbd> ${window.sourceflow.languages.searchTip4}
        <kbd>Esc</kbd> ${window.sourceflow.languages.searchTip5}
    </div>
</div>
<div class="fn__flex-column fn__none" id="searchAssets" style="height: 100%;${closeCB ? "border-radius: var(--b3-border-radius-b);overflow: hidden;" : ""}"></div>
<div class="fn__flex-column fn__none" id="searchUnRefPanel" style="height: 100%;${closeCB ? "border-radius: var(--b3-border-radius-b);overflow: hidden;" : ""}">
    <div class="block__icons">
        <span data-type="unRefPrevious" class="block__icon block__icon--show ariaLabel" data-position="9south" disabled="disabled" aria-label="${window.sourceflow.languages.previousLabel}"><svg><use xlink:href='#iconLeft'></use></svg></span>
        <span class="fn__space"></span>
        <span data-type="unRefNext" class="block__icon block__icon--show ariaLabel" data-position="9south" disabled="disabled" aria-label="${window.sourceflow.languages.nextLabel}"><svg><use xlink:href='#iconRight'></use></svg></span>
        <span class="fn__space"></span>
        <span id="searchUnRefResult" class="ft__selectnone"></span>
        <span class="fn__flex-1${closeCB ? " resize__move" : ""}" style="min-height: 100%"></span>
        <span class="fn__space"></span>
        <span id="unRefMore" aria-label="${window.sourceflow.languages.more}" class="block__icon block__icon--show ariaLabel" data-position="9south">
            <svg><use xlink:href="#iconMore"></use></svg>
        </span>
        <span class="fn__space"></span>
        <span id="searchUnRefClose" aria-label="${!closeCB ? window.sourceflow.languages.stickSearch : window.sourceflow.languages.globalSearch}" class="block__icon block__icon--show ariaLabel" data-position="9south">
            <svg><use xlink:href="#iconBack"></use></svg>
        </span>
    </div>
    <div class="search__layout${unRefLocal.layout === 1 ? " search__layout--row" : ""}">
        <div id="searchUnRefList" class="fn__flex-1 search__list b3-list b3-list--background"></div>
        <div class="search__drag"></div>
        <div id="searchUnRefPreview" class="fn__flex-1 search__preview"></div>
    </div>
    <div class="search__tip${closeCB ? "" : " fn__none"}">
        <kbd>↑/↓/PageUp/PageDown</kbd> ${window.sourceflow.languages.searchTip1}
        <kbd>${window.sourceflow.languages.enterKey}/${window.sourceflow.languages.doubleClick}</kbd> ${window.sourceflow.languages.searchTip2}
        <kbd>${updateHotkeyTip(window.sourceflow.config.keymap.editor.general.insertRight.custom)}/${updateHotkeyTip("⌥" + window.sourceflow.languages.click)}</kbd> ${window.sourceflow.languages.searchTip4}
        <kbd>Esc</kbd> ${window.sourceflow.languages.searchTip5}
    </div>
</div>
<div class="fn__loading fn__loading--top"><img width="120px" src="/stage/loading-pure.svg"></div>`;

    const criteriaData: Config.IUILayoutTabSearchConfig[] = [];
    initCriteriaMenu(element.querySelector("#criteria"), criteriaData, config);
    const searchPanelElement = element.querySelector("#searchList");
    const searchInputElement = element.querySelector("#searchInput") as HTMLInputElement;
    const replaceInputElement = element.querySelector("#replaceInput") as HTMLInputElement;

    const edit = new Protyle(app, element.querySelector("#searchPreview") as HTMLElement, {
        blockId: "",
        render: {
            background: true,
            gutter: true,
            breadcrumbDocName: true,
            title: true
        },
    });
    edit.resize();
    const unRefEdit = new Protyle(app, element.querySelector("#searchUnRefPreview") as HTMLElement, {
        blockId: "",
        render: {
            gutter: true,
            breadcrumbDocName: true,
            title: true
        },
    });
    unRefEdit.resize();
    if (closeCB) {
        if (data.layout === 1) {
            if (data.col) {
                edit.protyle.element.style.width = data.col;
                edit.protyle.element.classList.remove("fn__flex-1");
            }
        } else {
            if (data.row) {
                edit.protyle.element.classList.remove("fn__flex-1");
                edit.protyle.element.style.height = data.row;
            }
        }
    } else {
        if (data.layoutTab === 1) {
            if (data.colTab) {
                edit.protyle.element.style.width = data.colTab;
                edit.protyle.element.classList.remove("fn__flex-1");
            }
        } else {
            if (data.rowTab) {
                edit.protyle.element.classList.remove("fn__flex-1");
                edit.protyle.element.style.height = data.rowTab;
            }
        }
    }
    let clickTimeout: number;
    let lastClickTime = new Date().getTime();

    searchInputElement.value = config.k || "";
    replaceInputElement.value = config.r || "";
    searchInputElement.select();

    const dragElement = element.querySelector(".search__drag");
    dragElement.addEventListener("mousedown", (event: MouseEvent) => {
        const documentSelf = document;
        const nextElement = dragElement.nextElementSibling as HTMLElement;
        const previousElement = dragElement.previousElementSibling as HTMLElement;
        const direction = window.sourceflow.storage[Constants.LOCAL_SEARCHKEYS][closeCB ? "layout" : "layoutTab"] === 1 ? "lr" : "tb";
        const x = event[direction === "lr" ? "clientX" : "clientY"];
        const previousSize = direction === "lr" ? previousElement.clientWidth : previousElement.clientHeight;
        const nextSize = direction === "lr" ? nextElement.clientWidth : nextElement.clientHeight;

        nextElement.classList.remove("fn__flex-1");
        nextElement.style[direction === "lr" ? "width" : "height"] = nextSize + "px";
        element.style.userSelect = "none";
        documentSelf.onmousemove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            moveEvent.stopPropagation();
            const previousNowSize = (previousSize + (moveEvent[direction === "lr" ? "clientX" : "clientY"] - x));
            const nextNowSize = (nextSize - (moveEvent[direction === "lr" ? "clientX" : "clientY"] - x));
            if (previousNowSize < 120 || nextNowSize < 120) {
                return;
            }
            nextElement.style[direction === "lr" ? "width" : "height"] = nextNowSize + "px";
        };

        documentSelf.onmouseup = () => {
            element.style.userSelect = "";
            documentSelf.onmousemove = null;
            documentSelf.onmouseup = null;
            documentSelf.ondragstart = null;
            documentSelf.onselectstart = null;
            documentSelf.onselect = null;
            window.sourceflow.storage[Constants.LOCAL_SEARCHKEYS][direction === "lr" ? (closeCB ? "col" : "colTab") : (closeCB ? "row" : "rowTab")] = nextElement[direction === "lr" ? "clientWidth" : "clientHeight"] + "px";
            setStorageVal(Constants.LOCAL_SEARCHKEYS, window.sourceflow.storage[Constants.LOCAL_SEARCHKEYS]);
            if (direction === "lr") {
                resize(edit.protyle);
            }
        };
    });
    dragElement.addEventListener("dblclick", () => {
        edit.protyle.element.style[localSearch.layout === 1 ? "width" : "height"] = "";
        edit.protyle.element.classList.add("fn__flex-1");
        const direction = window.sourceflow.storage[Constants.LOCAL_SEARCHKEYS][closeCB ? "layout" : "layoutTab"] === 1 ? "lr" : "tb";
        window.sourceflow.storage[Constants.LOCAL_SEARCHKEYS][direction === "lr" ? (closeCB ? "col" : "colTab") : (closeCB ? "row" : "rowTab")] = "";
        setStorageVal(Constants.LOCAL_SEARCHKEYS, window.sourceflow.storage[Constants.LOCAL_SEARCHKEYS]);
        if (direction === "lr") {
            resize(edit.protyle);
        }
    });
    const localSearch = window.sourceflow.storage[Constants.LOCAL_SEARCHASSET] as ISearchAssetOption;
    const assetsElement = element.querySelector("#searchAssets") as HTMLElement;
    const unRefPanelElement = element.querySelector("#searchUnRefPanel") as HTMLElement;
    element.addEventListener("click", (event: MouseEvent) => {
        let target = event.target as HTMLElement;
        const searchPathInputElement = element.querySelector("#searchPathInput");
        while (target && target !== element) {
            const type = target.getAttribute("data-type");
            if (type === "removeCriterion") {
                config = updateConfig(element, {
                    removed: true,
                    sort: 0,
                    group: 0,
                    hasReplace: false,
                    method: 0,
                    hPath: "",
                    idPath: [],
                    k: "",
                    r: "",
                    page: 1,
                    types: getDefaultType(),
                    replaceTypes: Object.assign({}, Constants.SOURCEFLOW_DEFAULT_REPLACETYPES),
                }, config, edit, true);
                element.querySelector(".b3-chip--current")?.classList.remove("b3-chip--current");
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "saveCriterion") {
                saveCriterion(config, criteriaData, element);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "next") {
                if (!target.getAttribute("disabled")) {
                    if (config.page < parseInt(target.parentElement.querySelector("#searchResult").getAttribute("data-pagecount"))) {
                        config.page++;
                        inputEvent(element, config, edit);
                    }
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "previous") {
                if (!target.getAttribute("disabled")) {
                    if (config.page > 1) {
                        config.page--;
                        inputEvent(element, config, edit);
                    }
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.classList.contains("b3-chip") && type === "set-criteria") {
                config.removed = false;
                target.parentElement.querySelector(".b3-chip--current")?.classList.remove("b3-chip--current");
                target.classList.add("b3-chip--current");
                criteriaData.find(item => {
                    if (item.name === target.innerText.trim()) {
                        config = updateConfig(element, item, config, edit);
                        return true;
                    }
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.classList.contains("b3-chip__close") && type === "remove-criteria") {
                const name = target.parentElement.textContent;
                fetchPost("/api/storage/removeCriterion", {name});
                criteriaData.find((item, index) => {
                    if (item.name === name) {
                        criteriaData.splice(index, 1);
                        return true;
                    }
                });
                if (target.parentElement.classList.contains("b3-chip--current")) {
                    config = updateConfig(element, {
                        removed: true,
                        sort: 0,
                        group: 0,
                        hasReplace: false,
                        method: 0,
                        hPath: "",
                        idPath: [],
                        k: "",
                        r: "",
                        page: 1,
                        types: getDefaultType(),
                        replaceTypes: Object.assign({}, Constants.SOURCEFLOW_DEFAULT_REPLACETYPES),
                    }, config, edit, true);
                }
                target.parentElement.remove();
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.classList.contains("search__rmpath")) {
                config.idPath = [];
                config.hPath = "";
                config.page = 1;
                searchPathInputElement.textContent = "";
                searchPathInputElement.setAttribute("aria-label", "");
                inputEvent(element, config, edit, true);
                const includeElement = element.querySelector("#searchInclude");
                includeElement.firstElementChild.classList.add("ft__primary");
                includeElement.setAttribute("disabled", "disabled");
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchExpand") {
                Array.from(searchPanelElement.children).forEach(item => {
                    if (item.classList.contains("b3-list-item")) {
                        item.querySelector(".b3-list-item__arrow").classList.add("b3-list-item__arrow--open");
                        item.nextElementSibling.classList.remove("fn__none");
                    }
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchCollapse") {
                Array.from(searchPanelElement.children).forEach(item => {
                    if (item.classList.contains("b3-list-item")) {
                        item.querySelector(".b3-list-item__arrow").classList.remove("b3-list-item__arrow--open");
                        item.nextElementSibling.classList.add("fn__none");
                    }
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchPath") {
                movePathTo({
                    cb: (toPath, toNotebook) => {
                        fetchPost("/api/filetree/getHPathsByPaths", {paths: toPath}, (response) => {
                            config.idPath = [];
                            const hPathList: string[] = [];
                            let enableIncludeChild = false;
                            toPath.forEach((item, index) => {
                                if (item === "/") {
                                    config.idPath.push(toNotebook[index]);
                                    hPathList.push(getNotebookName(toNotebook[index]));
                                } else {
                                    enableIncludeChild = true;
                                    config.idPath.push(pathPosix().join(toNotebook[index], item.replace(".sf", "")));
                                }
                            });
                            if (response.data) {
                                hPathList.push(...response.data);
                            }
                            config.hPath = hPathList.join(" ");
                            config.page = 1;
                            searchPathInputElement.innerHTML = `${escapeGreat(config.hPath)}<svg class="search__rmpath"><use xlink:href="#iconCloseRound"></use></svg>`;
                            searchPathInputElement.setAttribute("aria-label", escapeHtml(config.hPath));
                            const includeElement = element.querySelector("#searchInclude");
                            includeElement.firstElementChild.classList.add("ft__primary");
                            if (enableIncludeChild) {
                                includeElement.removeAttribute("disabled");
                            } else {
                                includeElement.setAttribute("disabled", "disabled");
                            }
                            inputEvent(element, config, edit, true);
                        });
                    },
                    title: window.sourceflow.languages.specifyPath,
                    flashcard: false
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchInclude") {
                event.stopPropagation();
                event.preventDefault();
                if (target.hasAttribute("disabled")) {
                    return;
                }
                const svgElement = target.firstElementChild;
                svgElement.classList.toggle("ft__primary");
                if (!svgElement.classList.contains("ft__primary")) {
                    config.idPath.forEach((item, index) => {
                        if (!item.endsWith(".sf") && item.split("/").length > 1) {
                            config.idPath[index] = item + ".sf";
                        }
                    });
                } else {
                    config.idPath.forEach((item, index) => {
                        if (item.endsWith(".sf")) {
                            config.idPath[index] = item.replace(".sf", "");
                        }
                    });
                }
                config.page = 1;
                inputEvent(element, config, edit, true);
                break;
            } else if (target.id === "searchReplace") {
                // ctrl+P 不需要保存
                config.hasReplace = !config.hasReplace;
                element.querySelectorAll(".search__header")[1].classList.toggle("fn__none");
                element.querySelector("#criteria .b3-chip--current")?.classList.remove("b3-chip--current");
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchUnRef") {
                openSearchUnRef(unRefPanelElement, unRefEdit);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "unRefMore") {
                unRefMoreMenu(target, unRefPanelElement, unRefEdit);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchUnRefClose") {
                window.sourceflow.menus.menu.remove();
                unRefPanelElement.classList.add("fn__none");
                assetsElement.previousElementSibling.classList.remove("fn__none");
                searchInputElement.select();
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "unRefPrevious") {
                if (!target.getAttribute("disabled")) {
                    let currentPage = parseInt(unRefPanelElement.querySelector("#searchUnRefResult").textContent);
                    if (currentPage > 1) {
                        currentPage--;
                        getUnRefList(unRefPanelElement, unRefEdit, currentPage);
                    }
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "unRefNext") {
                if (!target.getAttribute("disabled")) {
                    let currentPage = parseInt(unRefPanelElement.querySelector("#searchUnRefResult").textContent);
                    if (currentPage < parseInt(unRefPanelElement.querySelector("#searchUnRefResult").textContent.split("/")[1])) {
                        currentPage++;
                        getUnRefList(unRefPanelElement, unRefEdit, currentPage);
                    }
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchAsset") {
                openSearchAsset(assetsElement, !closeCB);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchAssetClose") {
                window.sourceflow.menus.menu.remove();
                assetsElement.classList.add("fn__none");
                assetsElement.previousElementSibling.classList.remove("fn__none");
                searchInputElement.select();
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchOpen") {
                config.k = searchInputElement.value;
                config.r = replaceInputElement.value;
                openFile({
                    app,
                    searchData: config,
                    position: (!window.sourceflow.config.fileTree.noSplitScreenWhenOpenTab && (window.sourceflow.layout.centerLayout.children.length > 1 || window.innerWidth > 1024)) ? "right" : undefined
                });
                if (closeCB) {
                    closeCB();
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchAskAI") {
                void runSearchAI(app, element, config);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchRefresh") {
                clearSearchRequestCache();
                inputEvent(element, config, edit);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchMore") {
                moreMenu(config, criteriaData, element, () => {
                    config.page = 1;
                    inputEvent(element, config, edit, true);
                }, () => {
                    config = updateConfig(element, {
                        removed: true,
                        sort: 0,
                        group: 0,
                        hasReplace: false,
                        method: 0,
                        hPath: "",
                        idPath: [],
                        k: "",
                        r: "",
                        page: 1,
                        types: getDefaultType(),
                        replaceTypes: Object.assign({}, Constants.SOURCEFLOW_DEFAULT_REPLACETYPES),
                    }, config, edit, true);
                    element.querySelector("#criteria .b3-chip--current")?.classList.remove("b3-chip--current");
                }, () => {
                    const localData = window.sourceflow.storage[Constants.LOCAL_SEARCHKEYS];
                    const isPopover = hasClosestByClassName(element, "b3-dialog__container");
                    window.sourceflow.menus.menu.append(new MenuItem({
                        iconHTML: "",
                        label: window.sourceflow.languages.layout,
                        type: "submenu",
                        submenu: [{
                            iconHTML: "",
                            label: window.sourceflow.languages.topBottomLayout,
                            current: isPopover ? localData.layout === 0 : localData.layoutTab === 0,
                            click() {
                                element.querySelector(".search__layout").classList.remove("search__layout--row");
                                edit.protyle.element.style.width = "";
                                if ((isPopover && localData.row) || (!isPopover && localData.rowTab)) {
                                    edit.protyle.element.style.height = isPopover ? localData.row : localData.rowTab;
                                    edit.protyle.element.classList.remove("fn__flex-1");
                                } else {
                                    edit.protyle.element.classList.add("fn__flex-1");
                                }
                                resize(edit.protyle);
                                if (isPopover) {
                                    localData.layout = 0;
                                } else {
                                    localData.layoutTab = 0;
                                }
                                setStorageVal(Constants.LOCAL_SEARCHKEYS, window.sourceflow.storage[Constants.LOCAL_SEARCHKEYS]);
                            }
                        }, {
                            iconHTML: "",
                            label: window.sourceflow.languages.leftRightLayout,
                            current: isPopover ? localData.layout === 1 : localData.layoutTab === 1,
                            click() {
                                element.querySelector(".search__layout").classList.add("search__layout--row");
                                edit.protyle.element.style.height = "";
                                if ((isPopover && localData.col) || (!isPopover && localData.colTab)) {
                                    edit.protyle.element.style.width = isPopover ? localData.col : localData.colTab;
                                    edit.protyle.element.classList.remove("fn__flex-1");
                                } else {
                                    edit.protyle.element.classList.add("fn__flex-1");
                                }
                                resize(edit.protyle);
                                if (isPopover) {
                                    localData.layout = 1;
                                } else {
                                    localData.layoutTab = 1;
                                }
                                setStorageVal(Constants.LOCAL_SEARCHKEYS, window.sourceflow.storage[Constants.LOCAL_SEARCHKEYS]);
                            }
                        }]
                    }).element);
                });
                const rect = target.getBoundingClientRect();
                window.sourceflow.menus.menu.popup({x: rect.right, y: rect.bottom, isLeft: true});
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchFilter") {
                window.sourceflow.menus.menu.remove();
                filterMenu(config, () => {
                    config.page = 1;
                    inputEvent(element, config, edit, true);
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "replaceFilter") {
                window.sourceflow.menus.menu.remove();
                replaceFilterMenu(config);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "assetPrevious") {
                if (!target.getAttribute("disabled")) {
                    let currentPage = parseInt(assetsElement.querySelector("#searchAssetResult .fn__flex-center").textContent.split("/")[0]);
                    if (currentPage > 1) {
                        currentPage--;
                        assetInputEvent(assetsElement, localSearch, currentPage);
                    }
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "assetNext") {
                if (!target.getAttribute("disabled")) {
                    let currentPage = parseInt(assetsElement.querySelector("#searchAssetResult .fn__flex-center").textContent.split("/")[0]);
                    if (currentPage < parseInt(assetsElement.querySelector("#searchAssetResult .fn__flex-center").textContent.split("/")[1])) {
                        currentPage++;
                        assetInputEvent(assetsElement, localSearch, currentPage);
                    }
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "assetMore") {
                assetMoreMenu(target, assetsElement, () => {
                    assetInputEvent(assetsElement);
                    setStorageVal(Constants.LOCAL_SEARCHASSET, localSearch);
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "assetFilter") {
                assetFilterMenu(assetsElement);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "assetSyntaxCheck") {
                assetMethodMenu(target, () => {
                    element.querySelector("#assetSyntaxCheck").outerHTML = genQueryHTML(localSearch.method, "assetSyntaxCheck");
                    assetInputEvent(assetsElement, localSearch);
                    setStorageVal(Constants.LOCAL_SEARCHASSET, localSearch);
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchSyntaxCheck") {
                queryMenu(config, () => {
                    element.querySelector("#searchSyntaxCheck").outerHTML = genQueryHTML(config.method, "searchSyntaxCheck");
                    config.page = 1;
                    inputEvent(element, config, edit, true);
                    window.sourceflow.storage[Constants.LOCAL_SEARCHDATA] = JSON.parse(JSON.stringify(config));
                    setStorageVal(Constants.LOCAL_SEARCHDATA, window.sourceflow.storage[Constants.LOCAL_SEARCHDATA]);
                });
                const rect = target.getBoundingClientRect();
                window.sourceflow.menus.menu.popup({x: rect.right, y: rect.bottom, isLeft: true});
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "searchHistoryBtn") {
                toggleSearchHistory(element, config, edit);
                event.stopPropagation();
                event.preventDefault();
                return;
            } else if (target.id === "assetHistoryBtn") {
                toggleAssetHistory(assetsElement);
                event.stopPropagation();
                event.preventDefault();
                return;
            } else if (target.id === "replaceHistoryBtn") {
                toggleReplaceHistory(element.querySelector("#replaceInput"));
                event.stopPropagation();
                event.preventDefault();
                return;
            } else if (target.id === "replaceAllBtn") {
                replace(element, config, edit, true);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "assetRefresh") {
                assetInputEvent(assetsElement);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.id === "replaceBtn") {
                replace(element, config, edit, false);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "search-ai-source") {
                const nodeId = target.getAttribute("data-node-id");
                if (nodeId) {
                    focusSearchResultById(element, edit, config, nodeId);
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "search-ai-copy") {
                const aiState = getSearchAIState(element);
                if (aiState?.answer) {
                    writeText(aiState.answer);
                    showMessage(assistantText("AI 搜索答案已复制", "AI search answer copied"));
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "search-ai-insert") {
                const aiState = getSearchAIState(element);
                if (aiState?.answer) {
                    runAssistantFeature("search:insert-answer", loadAssistantNoteModule, ({appendMarkdownToCurrentNote}) => {
                        void appendMarkdownToCurrentNote(aiState.answer).then((inserted) => {
                            if (inserted) {
                                showMessage(assistantText("AI 搜索答案已插入当前笔记", "AI search answer inserted into the current note"));
                            }
                        }).catch((error) => {
                            reportAssistantRuntimeError("search:insert-answer", error);
                        });
                    });
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "search-ai-inbox") {
                const aiState = getSearchAIState(element);
                if (aiState?.answer) {
                    runAssistantFeature("search:save-inbox", loadAssistantInboxModule, ({saveAssistantInboxItem}) => {
                        void saveAssistantInboxItem({
                            app,
                            title: `${assistantText("AI 搜索", "AI Search")} · ${aiState.query}`,
                            content: aiState.answer,
                            kind: "search",
                            query: aiState.query,
                            goal: assistantText("搜索问题回答", "Search answer"),
                            nextStep: assistantText("在 AI 收件箱中继续核对来源并决定是否写回笔记。", "Review the sources in AI Inbox and decide whether to write the answer back to a note."),
                        }).catch((error) => {
                            reportAssistantRuntimeError("search:save-inbox", error);
                        });
                    });
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "search-ai-chat") {
                const aiState = getSearchAIState(element);
                if (aiState?.sessionId) {
                    runAssistantFeature("search:open-chat", loadAssistantAIDockModule, ({openAssistantAIDock}) => {
                        openAssistantAIDock({sessionId: aiState.sessionId});
                    });
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "search-ai-clear") {
                resetSearchAI(element);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.classList.contains("b3-list-item__toggle")) {
                target.parentElement.nextElementSibling.classList.toggle("fn__none");
                target.firstElementChild.classList.toggle("b3-list-item__arrow--open");
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.classList.contains("b3-list-item")) {
                const searchAssetInputElement = element.querySelector("#searchAssetInput") as HTMLInputElement;
                if (type === "search-new") {
                    if (config.method == 0) {
                        newFileByName(app, searchInputElement.value);
                    }
                } else if (type === "search-item") {
                    const searchType = target.dataset.id ? "asset" : (unRefPanelElement.classList.contains("fn__none") ? "doc" : "unRef");
                    let isClick = event.detail === 1;
                    let isDblClick = event.detail === 2;
                    /// #if BROWSER
                    if (isIPad()) { // 需要进行 ipad 判断 https://github.com/lonelyor/SourceFlow/issues/12704
                        const newDate = new Date().getTime();
                        isClick = newDate - lastClickTime > Constants.TIMEOUT_DBLCLICK;
                        isDblClick = !isClick;
                        lastClickTime = newDate;
                    }
                    /// #endif
                    if (isClick) {
                        clickTimeout = window.setTimeout(() => {
                            if (searchType === "asset") {
                                if (!target.classList.contains("b3-list-item--focus")) {
                                    assetsElement.querySelector(".b3-list-item--focus").classList.remove("b3-list-item--focus");
                                    target.classList.add("b3-list-item--focus");
                                    renderPreview(element.querySelector("#searchAssetPreview"), target.dataset.id, searchAssetInputElement.value, window.sourceflow.storage[Constants.LOCAL_SEARCHASSET].method);
                                    searchAssetInputElement.focus();
                                } else if (target.classList.contains("b3-list-item--focus")) {
                                    renderNextAssetMark(element.querySelector("#searchAssetPreview"));
                                    searchAssetInputElement.focus();
                                }
                            } else {
                                if (event.altKey) {
                                    openSearchEditor({
                                        rootId: target.getAttribute("data-root-id"),
                                        protyle: edit.protyle,
                                        id: target.getAttribute("data-node-id"),
                                        cb: closeCB,
                                        openPosition: "right",
                                    });
                                } else if (!target.classList.contains("b3-list-item--focus")) {
                                    (searchType === "doc" ? searchPanelElement : unRefPanelElement).querySelector(".b3-list-item--focus").classList.remove("b3-list-item--focus");
                                    target.classList.add("b3-list-item--focus");
                                    getArticle({
                                        edit: searchType === "doc" ? edit : unRefEdit,
                                        id: target.getAttribute("data-node-id"),
                                        config: searchType === "doc" ? config : null,
                                        value: searchType === "doc" ? searchInputElement.value : null,
                                    });
                                    searchInputElement.focus();
                                } else if (searchType === "doc" && target.classList.contains("b3-list-item--focus")) {
                                    renderNextSearchMark({
                                        edit,
                                        id: target.getAttribute("data-node-id"),
                                        target,
                                    });
                                    searchInputElement.focus();
                                }
                            }
                        }, Constants.TIMEOUT_DBLCLICK);
                    } else if (isDblClick && isNotCtrl(event)) {
                        clearTimeout(clickTimeout);
                        if (searchType === "asset") {
                            /// #if !BROWSER
                            useShell("showItemInFolder", path.join(window.sourceflow.config.system.dataDir, target.lastElementChild.getAttribute("aria-label")));
                            /// #endif
                        } else {
                            openSearchEditor({
                                rootId: target.getAttribute("data-root-id"),
                                protyle: edit.protyle,
                                id: target.getAttribute("data-node-id"),
                                cb: closeCB
                            });
                        }
                    }
                    window.sourceflow.menus.menu.remove();
                } else if (target.querySelector(".b3-list-item__toggle")) {
                    target.nextElementSibling.classList.toggle("fn__none");
                    target.firstElementChild.firstElementChild.classList.toggle("b3-list-item__arrow--open");
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            }
            target = target.parentElement;
        }
    }, false);

    searchInputElement.addEventListener("compositionend", (event: InputEvent) => {
        config.page = 1;
        if (event.isComposing) {
            return;
        }
        inputEvent(element, config, edit, true);
    });
    searchInputElement.addEventListener("input", (event: InputEvent) => {
        config.page = 1;
        if (event.isComposing) {
            return;
        }
        inputEvent(element, config, edit, true);
    });
    searchInputElement.addEventListener("blur", () => {
        if (config.removed) {
            config.k = searchInputElement.value;
            window.sourceflow.storage[Constants.LOCAL_SEARCHDATA] = JSON.parse(JSON.stringify(config));
            setStorageVal(Constants.LOCAL_SEARCHDATA, window.sourceflow.storage[Constants.LOCAL_SEARCHDATA]);
        }
        saveKeyList("keys", searchInputElement.value);
    });
    searchInputElement.addEventListener("keydown", (event) => {
        electronUndo(event);
    });
    replaceInputElement.addEventListener("keydown", (event) => {
        electronUndo(event);
    });
    addClearButton({
        inputElement: searchInputElement,
        right: 8,
        height: searchInputElement.clientHeight,
        clearCB() {
            config.page = 1;
            inputEvent(element, config, edit);
        }
    });
    addClearButton({
        right: 8,
        inputElement: replaceInputElement,
        height: searchInputElement.clientHeight,
    });
    inputEvent(element, config, edit);
    return {edit, unRefEdit};
};

export const openSearchEditor = (options: {
    protyle: IProtyle,
    openPosition?: string,
    id: string,
    rootId: string,
    cb: () => void
}) => {
    let currentRange = (options.rootId === options.protyle.block.rootID && options.id === options.protyle.block.id) ?
        options.protyle.highlight.ranges[options.protyle.highlight.rangeIndex] : null;
    if (options.protyle.block.scroll) {
        currentRange = null;
    }
    if (currentRange) {
        const rangeBlockElement = hasClosestBlock(currentRange.startContainer);
        if (rangeBlockElement) {
            options.id = rangeBlockElement.getAttribute("data-node-id");
            const offset = getSelectionOffset(getContenteditableElement(rangeBlockElement) || rangeBlockElement,
                null, options.protyle.highlight.ranges[options.protyle.highlight.rangeIndex]);
            const scrollAttr: IScrollAttr = {
                rootId: options.protyle.block.rootID,
                focusId: options.id,
                focusStart: offset.start,
                focusEnd: offset.end,
                zoomInId: options.protyle.block.showAll ? options.protyle.block.id : undefined,
                scrollTop: options.protyle.contentElement.scrollTop,
            };
            window.sourceflow.storage[Constants.LOCAL_FILEPOSITION][options.protyle.block.rootID] = scrollAttr;
            if (offset.start === offset.end) {
                currentRange = null;
            }
        }
    }
    checkFold(options.id, (zoomIn) => {
        openFileById({
            app: options.protyle.app,
            id: options.id,
            action: currentRange ?
                (zoomIn ? [Constants.CB_GET_FOCUS, Constants.CB_GET_ALL, Constants.CB_GET_SCROLL, Constants.CB_GET_SEARCH] : [Constants.CB_GET_FOCUS, Constants.CB_GET_CONTEXT, Constants.CB_GET_SCROLL, Constants.CB_GET_SEARCH]) :
                (zoomIn ? [Constants.CB_GET_FOCUS, Constants.CB_GET_ALL, Constants.CB_GET_HL] : [Constants.CB_GET_FOCUS, Constants.CB_GET_CONTEXT, Constants.CB_GET_HL]),
            zoomIn,
            position: options.openPosition,
            scrollPosition: "center"
        });
        if (options.cb) {
            options.cb();
        }
    });
};

export const genQueryHTML = (method: number, id: string) => {
    let methodTip = "";
    let methodIcon = "";
    switch (method) {
        case 0:
            methodTip = window.sourceflow.languages.keyword;
            methodIcon = "Exact";
            break;
        case 1:
            methodTip = window.sourceflow.languages.querySyntax;
            methodIcon = "Quote";
            break;
        case 2:
            methodTip = "SQL";
            methodIcon = "Database";
            break;
        case 3:
            methodTip = window.sourceflow.languages.regex;
            methodIcon = "Regex";
            break;
    }
    return `<span id="${id}" aria-label="${window.sourceflow.languages.searchMethod} ${methodTip}" class="block__icon ariaLabel" data-position="9south">
    <svg><use xlink:href="#icon${methodIcon}"></use></svg>
</span>`;
};

export const updateConfig = (element: Element, item: Config.IUILayoutTabSearchConfig, config: Config.IUILayoutTabSearchConfig,
                             edit: Protyle, clear = false) => {
    const dialogElement = hasClosestByClassName(element, "b3-dialog--open");
    if (dialogElement && dialogElement.getAttribute("data-key") === Constants.DIALOG_SEARCH) {
        // https://github.com/lonelyor/SourceFlow/issues/6828
        item.hPath = config.hPath;
        item.idPath = [...config.idPath];
    }
    if (config.hasReplace !== item.hasReplace) {
        const replaceHeaderElement = element.querySelectorAll(".search__header")[1];
        if (item.hasReplace) {
            replaceHeaderElement.classList.remove("fn__none");
        } else {
            replaceHeaderElement.classList.add("fn__none");
        }
    }
    const searchPathInputElement = element.querySelector("#searchPathInput");
    if (item.hPath) {
        searchPathInputElement.innerHTML = `${escapeGreat(item.hPath)}<svg class="search__rmpath"><use xlink:href="#iconCloseRound"></use></svg>`;
        searchPathInputElement.setAttribute("aria-label", escapeHtml(item.hPath));
    } else {
        searchPathInputElement.innerHTML = "";
        searchPathInputElement.setAttribute("aria-label", "");
    }
    if (config.group !== item.group) {
        if (item.group === 0) {
            element.querySelector("#searchExpand").parentElement.classList.add("fn__none");
        } else {
            element.querySelector("#searchExpand").parentElement.classList.remove("fn__none");
        }
    }
    let includeChild = true;
    let enableIncludeChild = false;
    item.idPath.forEach(pathItem => {
        if (pathItem.endsWith(".sf")) {
            includeChild = false;
        }
        if (pathItem.split("/").length > 1) {
            enableIncludeChild = true;
        }
    });
    const searchIncludeElement = element.querySelector("#searchInclude");
    if (includeChild) {
        searchIncludeElement.firstElementChild.classList.add("ft__primary");
    } else {
        searchIncludeElement.firstElementChild.classList.remove("ft__primary");
    }
    if (enableIncludeChild) {
        searchIncludeElement.removeAttribute("disabled");
    } else {
        searchIncludeElement.setAttribute("disabled", "disabled");
    }
    if (item.k || clear) {
        (element.querySelector("#searchInput") as HTMLInputElement).value = item.k;
    }
    (element.querySelector("#replaceInput") as HTMLInputElement).value = item.r;
    element.querySelector("#searchSyntaxCheck").outerHTML = genQueryHTML(item.method, "searchSyntaxCheck");
    config = JSON.parse(JSON.stringify(item));
    window.sourceflow.storage[Constants.LOCAL_SEARCHDATA] = JSON.parse(JSON.stringify(item));
    setStorageVal(Constants.LOCAL_SEARCHDATA, window.sourceflow.storage[Constants.LOCAL_SEARCHDATA]);
    inputEvent(element, config, edit);
    window.sourceflow.menus.menu.remove();
    return config;
};

const scrollToCurrent = (contentElement: HTMLElement, currentRange: Range, contentRect: DOMRect) => {
    contentElement.scrollTop = contentElement.scrollTop + currentRange.getBoundingClientRect().top - contentRect.top - contentRect.height / 2;
    const tableElement = hasClosestByClassName(currentRange.startContainer, "table");
    if (tableElement) {
        const cellElement = hasClosestByTag(currentRange.startContainer, "TD") || hasClosestByTag(currentRange.startContainer, "TH");
        if (cellElement) {
            tableElement.firstElementChild.scrollLeft = cellElement.offsetLeft;
            if (tableElement.getAttribute("custom-pinthead") === "true") {
                contentElement.scrollTop = contentElement.scrollTop + tableElement.getBoundingClientRect().top - contentRect.top;
                tableElement.querySelector("table").scrollTop = cellElement.offsetTop;
            }
        }
    }
};

const renderNextSearchMark = (options: {
    id: string,
    edit: Protyle,
    target: Element,
}) => {
    const contentRect = options.edit.protyle.contentElement.getBoundingClientRect();
    if (isSupportCSSHL()) {
        options.edit.protyle.highlight.markHL.clear();
        options.edit.protyle.highlight.mark.clear();
        options.edit.protyle.highlight.rangeIndex++;
        if (options.edit.protyle.highlight.rangeIndex >= options.edit.protyle.highlight.ranges.length) {
            options.edit.protyle.highlight.rangeIndex = 0;
        }
        let currentRange: Range;
        options.edit.protyle.highlight.ranges.forEach((item, index) => {
            if (options.edit.protyle.highlight.rangeIndex === index) {
                options.edit.protyle.highlight.markHL.add(item);
                currentRange = item;
            } else {
                options.edit.protyle.highlight.mark.add(item);
            }
        });
        if (currentRange) {
            if (!currentRange.toString()) {
                highlightById(options.edit.protyle, options.id, "center");
            } else {
                scrollToCurrent(options.edit.protyle.contentElement, currentRange, contentRect);
            }
        }
        return;
    }
    let matchElement;
    const allMatchElements = Array.from(options.edit.protyle.wysiwyg.element.querySelectorAll('span[data-type~="search-mark"]'));
    allMatchElements.find((item, itemIndex) => {
        if (item.classList.contains("search-mark--hl")) {
            item.classList.remove("search-mark--hl");
            matchElement = allMatchElements[itemIndex + 1];
            return;
        }
    });
    if (!matchElement) {
        matchElement = allMatchElements[0];
    }
    if (matchElement) {
        matchElement.classList.add("search-mark--hl");
        options.edit.protyle.contentElement.scrollTop = options.edit.protyle.contentElement.scrollTop + matchElement.getBoundingClientRect().top - contentRect.top - contentRect.height / 2;
    }
};

let articleId: string;

export const getArticle = (options: {
    id: string,
    config?: Config.IUILayoutTabSearchConfig,
    edit: Protyle
    value?: string,
}) => {
    articleId = options.id;
    checkFold(options.id, (zoomIn) => {
        if (articleId !== options.id) {
            return;
        }
        options.edit.protyle.scroll.lastScrollTop = 0;
        addLoading(options.edit.protyle);
        fetchPost("/api/block/getDocInfo", {
            id: options.id,
        }, (response) => {
            if (articleId !== options.id) {
                return;
            }
            fetchPost("/api/filetree/getDoc", {
                id: options.id,
                query: options.value || null,
                queryMethod: options.config?.method || null,
                queryTypes: options.config?.types || null,
                mode: zoomIn ? 0 : 3,
                size: zoomIn ? Constants.SIZE_GET_MAX : window.sourceflow.config.editor.dynamicLoadBlocks,
                zoom: zoomIn,
                highlight: !isSupportCSSHL(),
            }, getResponse => {
                if (articleId !== options.id) {
                    return;
                }
                options.edit.protyle.query = {
                    key: options.value || null,
                    method: options.config?.method || null,
                    types: options.config?.types || null,
                };
                //
                if (options.edit.protyle.options.render.title) {
                    options.edit.protyle.wysiwyg.renderCustom(response.data.ial);
                }
                onGet({
                    updateReadonly: true,
                    data: getResponse,
                    protyle: options.edit.protyle,
                    action: zoomIn ? [Constants.CB_GET_ALL, Constants.CB_GET_HTML] : [Constants.CB_GET_HTML],
                    afterCB() {
                        const contentRect = options.edit.protyle.contentElement.getBoundingClientRect();
                        if (isSupportCSSHL()) {
                            let observer: ResizeObserver;
                            searchMarkRender(options.edit.protyle, getResponse.data.keywords, options.id, () => {
                                const highlightKeys = () => {
                                    const currentRange = options.edit.protyle.highlight.ranges[options.edit.protyle.highlight.rangeIndex];
                                    if (options.edit.protyle.highlight.ranges.length > 0 && currentRange) {
                                        if (!currentRange.toString()) {
                                            highlightById(options.edit.protyle, options.id, "center");
                                        } else {
                                            scrollToCurrent(options.edit.protyle.contentElement, currentRange, contentRect);
                                        }
                                    } else {
                                        highlightById(options.edit.protyle, options.id, "center");
                                    }
                                };
                                if (observer) {
                                    observer.disconnect();
                                }
                                highlightKeys();
                                observer = new ResizeObserver(() => {
                                    highlightKeys();
                                });
                                observer.observe(options.edit.protyle.wysiwyg.element);
                                setTimeout(() => {
                                    observer.disconnect();
                                }, Constants.TIMEOUT_COUNT);
                            });
                        } else {
                            const matchElements = options.edit.protyle.wysiwyg.element.querySelectorAll('span[data-type~="search-mark"]');
                            if (matchElements.length === 0) {
                                return;
                            }
                            matchElements[0].classList.add("search-mark--hl");
                            options.edit.protyle.contentElement.scrollTop = options.edit.protyle.contentElement.scrollTop + matchElements[0].getBoundingClientRect().top - contentRect.top - contentRect.height / 2;
                        }
                    }
                });
                // 只能放在 onGet 后，否则 title 不会更新 https://github.com/lonelyor/SourceFlow/issues/16739
                if (options.edit.protyle.options.render.title) {
                    options.edit.protyle.title.render(options.edit.protyle, response);
                }
            });
        });
    });
};

export const replace = (element: Element, config: Config.IUILayoutTabSearchConfig, edit: Protyle, isAll: boolean) => {
    if (config.method === 2) {
        showMessage(window.sourceflow.languages._kernel[132]);
        return;
    }
    const searchPanelElement = element.querySelector("#searchList");
    const replaceInputElement = element.querySelector("#replaceInput") as HTMLInputElement;
    const searchInputElement = element.querySelector("#searchInput") as HTMLInputElement;

    const loadElement = element.querySelector("svg.fn__rotate");
    if (!loadElement.classList.contains("fn__none")) {
        return;
    }
    saveKeyList("replaceKeys", replaceInputElement.value);
    const currentList: HTMLElement = searchPanelElement.querySelector(".b3-list-item--focus");
    if (!currentList || currentList.dataset.type === "search-new") {
        return;
    }
    loadElement.classList.remove("fn__none");
    const currentId = currentList.getAttribute("data-node-id");
    fetchPost("/api/search/findReplace", {
        k: config.method === 0 || config.method === 1 ? getKeyByLiElement(currentList) : searchInputElement.value,
        r: replaceInputElement.value,
        method: config.method,
        types: config.types,
        paths: config.idPath || [],
        groupBy: config.group,
        orderBy: config.sort,
        page: config.page,
        ids: isAll ? [] : [currentId],
        replaceTypes: config.replaceTypes
    }, (response) => {
        loadElement.classList.add("fn__none");
        if (response.code === 1) {
            showMessage(response.msg);
            return;
        }
        if (isAll) {
            inputEvent(element, config, edit, false);
            return;
        }
        const rootId = currentList.getAttribute("data-root-id");
        getAllModels().editor.forEach(item => {
            if (rootId === item.editor.protyle.block.rootID) {
                reloadProtyle(item.editor.protyle, false);
            }
        });
        let newId = currentList.getAttribute("data-node-id");
        if (currentList.nextElementSibling) {
            newId = currentList.nextElementSibling.getAttribute("data-node-id");
        } else if (currentList.previousElementSibling) {
            newId = currentList.previousElementSibling.getAttribute("data-node-id");
        }
        if (config.group === 1 && !newId) {
            const nextDocElement = currentList.parentElement.nextElementSibling || currentList.parentElement.previousElementSibling.previousElementSibling?.previousElementSibling;
            if (nextDocElement) {
                newId = nextDocElement.nextElementSibling.firstElementChild.getAttribute("data-node-id");
            }
        }
        inputEvent(element, config, edit, false, {
            currentId,
            newId
        });
    });
};

export const inputEvent = (element: Element, config: Config.IUILayoutTabSearchConfig,
                           edit: Protyle, rmCurrentCriteria = false,
                           focusId?: {
                               currentId?: string,
                               newId?: string
                           }) => {
    let inputTimeout = parseInt(element.getAttribute("data-timeout") || "0");
    clearTimeout(inputTimeout);
    inputTimeout = window.setTimeout(() => {
        resetSearchAI(element);
        const requestToken = Date.now().toString();
        element.setAttribute("data-search-token", requestToken);
        if (rmCurrentCriteria) {
            element.querySelector("#criteria .b3-chip--current")?.classList.remove("b3-chip--current");
        }
        const loadingElement = element.querySelector(".fn__loading--top");
        loadingElement.classList.remove("fn__none");
        const searchInputElement = element.querySelector("#searchInput") as HTMLInputElement;
        config.query = searchInputElement.value;
        element.querySelector("#searchList").scrollTo(0, 0);
        const previousElement = element.querySelector('[data-type="previous"]');
        const nextElement = element.querySelector('[data-type="next"]');
        edit.protyle?.app.plugins.forEach(item => {
            item.eventBus.emit("input-search", {
                protyle: edit,
                config,
                searchElement: searchInputElement,
            });
        });
        const searchResultElement = element.querySelector("#searchResult");
        if (config.query === "" && (!config.idPath || config.idPath.length === 0)) {
            getRecentUpdatedBlocksCached().then((response) => {
                if (element.getAttribute("data-search-token") !== requestToken) {
                    return;
                }
                onSearch(response.data, edit, element, config);
                loadingElement.classList.add("fn__none");
                searchResultElement.innerHTML = "";
                previousElement.setAttribute("disabled", "true");
                nextElement.setAttribute("disabled", "true");
            });
        } else {
            if (config.page > 1) {
                previousElement.removeAttribute("disabled");
            } else {
                previousElement.setAttribute("disabled", "disabled");
            }
            fullTextSearchBlocksCached(config).then((response) => {
                if (element.getAttribute("data-search-token") !== requestToken) {
                    return;
                }
                if (!config.page) {
                    config.page = 1;
                }
                if (config.page < response.data.pageCount) {
                    nextElement.removeAttribute("disabled");
                } else {
                    nextElement.setAttribute("disabled", "disabled");
                }
                onSearch(response.data.blocks, edit, element, config, focusId);
                let text = window.sourceflow.languages.findInDoc.replace("${x}", response.data.matchedRootCount).replace("${y}", response.data.matchedBlockCount);
                if (response.data.docMode) {
                    text = window.sourceflow.languages.matchDoc.replace("${x}", response.data.matchedRootCount);
                }
                searchResultElement.innerHTML = `${config.page}/${response.data.pageCount || 1}<span class="fn__space"></span>
<span class="ft__on-surface">${text}</span>`;
                loadingElement.classList.add("fn__none");
                searchResultElement.setAttribute("data-pagecount", response.data.pageCount || 1);
            });
        }
    }, Constants.TIMEOUT_INPUT);
    element.setAttribute("data-timeout", inputTimeout.toString());
};

export const getAttr = (block: IBlock) => {
    let attrHTML = "";
    if (block.name) {
        attrHTML += `<span class="b3-list-item__meta fn__flex" style="max-width: 30%"><svg class="b3-list-item__hinticon"><use xlink:href="#iconN"></use></svg><span class="b3-list-item__hinttext">${block.name}</span></span>`;
    }
    if (block.alias) {
        attrHTML += `<span class="b3-list-item__meta fn__flex" style="max-width: 30%"><svg class="b3-list-item__hinticon"><use xlink:href="#iconA"></use></svg><span class="b3-list-item__hinttext">${block.alias}</span></span>`;
    }
    if (block.memo) {
        attrHTML += `<span class="b3-list-item__meta fn__flex" style="max-width: 30%"><svg class="b3-list-item__hinticon"><use xlink:href="#iconM"></use></svg><span class="b3-list-item__hinttext">${block.memo}</span></span>`;
    }
    return attrHTML;
};

const onSearch = (data: IBlock[], edit: Protyle, element: Element, config: Config.IUILayoutTabSearchConfig,
                  focusId?: {
                      currentId?: string,
                      newId?: string
                  }) => {
    let resultHTML = "";
    let currentData;
    let newData;
    data.forEach((item) => {
        const title = getNotebookName(item.box) + getDisplayName(item.hPath, false);
        let countHTML = "";
        if (item.children) {
            resultHTML += `<div class="b3-list-item">
<span class="b3-list-item__toggle b3-list-item__toggle--hl">
    <svg class="b3-list-item__arrow b3-list-item__arrow--open"><use xlink:href="#iconRight"></use></svg>
</span>
${unicode2Emoji(getNotebookIcon(item.box) || window.sourceflow.storage[Constants.LOCAL_IMAGES].note, "b3-list-item__graphic", true)}
<span class="b3-list-item__text ariaLabel" style="color: var(--b3-theme-on-surface)" aria-label="${escapeAriaLabel(title)}">${escapeGreat(title)}</span>
</div><div>`;
            item.children.forEach((childItem) => {
                if (focusId) {
                    if (childItem.id === focusId.currentId) {
                        currentData = childItem;
                    }
                    if (childItem.id === focusId.newId) {
                        newData = childItem;
                    }
                }
                if (childItem.refCount) {
                    countHTML = `<span class="popover__block counter b3-tooltips b3-tooltips__w" aria-label="${window.sourceflow.languages.ref}">${childItem.refCount}</span>`;
                }
                resultHTML += `<div style="padding-left: 36px" data-type="search-item" class="b3-list-item" data-node-id="${childItem.id}" data-root-id="${childItem.rootID}">
<svg class="b3-list-item__graphic popover__block" data-id="${childItem.id}"><use xlink:href="#${getIconByType(childItem.type)}"></use></svg>
${unicode2Emoji(childItem.ial.icon, "b3-list-item__graphic", true)}
<span class="b3-list-item__text">${childItem.content}</span>
${getAttr(childItem)}
${childItem.tag ? `<span class="b3-list-item__meta b3-list-item__meta--ellipsis">${childItem.tag.replace(/#/g, "")}</span>` : ""}
${countHTML}
</div>`;
            });
            resultHTML += "</div>";
        } else {
            if (focusId) {
                if (item.id === focusId.currentId) {
                    currentData = item;
                }
                if (item.id === focusId.newId) {
                    newData = item;
                }
            }
            if (item.refCount) {
                countHTML = `<span class="popover__block counter b3-tooltips b3-tooltips__w" aria-label="${window.sourceflow.languages.ref}">${item.refCount}</span>`;
            }
            resultHTML += `<div data-type="search-item" class="b3-list-item" data-node-id="${item.id}" data-root-id="${item.rootID}">
<svg class="b3-list-item__graphic popover__block" data-id="${item.id}"><use xlink:href="#${getIconByType(item.type)}"></use></svg>
${unicode2Emoji(item.ial.icon, "b3-list-item__graphic", true)}
<span class="b3-list-item__text">${item.content}</span>
${getAttr(item)}
${item.tag ? `<span class="b3-list-item__meta b3-list-item__meta--ellipsis">${item.tag.replace(/#/g, "")}</span>` : ""}
<span class="b3-list-item__meta b3-list-item__meta--ellipsis ariaLabel" aria-label="${escapeAriaLabel(title)}">${escapeGreat(title)}</span>
${countHTML}
</div>`;
        }
    });
    if (!currentData) {
        currentData = newData;
    }
    if (!currentData && data.length > 0) {
        if (data[0].children) {
            currentData = data[0].children[0];
        } else {
            currentData = data[0];
        }
    }
    if (currentData) {
        edit.protyle.element.classList.remove("fn__none");
        element.querySelector(".search__drag").classList.remove("fn__none");
        getArticle({
            edit,
            id: currentData.id,
            config,
            value: (element.querySelector("#searchInput") as HTMLInputElement).value,
        });
    } else {
        edit.protyle.element.classList.add("fn__none");
        element.querySelector(".search__drag").classList.add("fn__none");
    }
    element.querySelector("#searchList").innerHTML = resultHTML || (
        config.method === 0 ? `<div class="b3-list-item b3-list-item--focus" data-type="search-new">
    <svg class="b3-list-item__graphic"><use xlink:href="#iconFile"></use></svg>
    <span class="b3-list-item__text">
        ${window.sourceflow.languages.newFile} <mark>${escapeHtml((element.querySelector("#searchInput") as HTMLInputElement).value)}</mark>
    </span>
    <kbd class="b3-list-item__meta">${window.sourceflow.languages.enterNew}</kbd>
</div>
<div class="search__empty">
    ${window.sourceflow.languages.enterNewTip}
</div>` : `<div class="b3-list-item b3-list-item--focus" data-type="search-new">
    <span class="b3-list-item__text">
        ${window.sourceflow.languages.emptyContent}
    </span>
</div>`);
    if (currentData) {
        const currentList = element.querySelector(`[data-node-id="${currentData.id}"]`) as HTMLElement;
        if (currentList) {
            currentList.classList.add("b3-list-item--focus");
            if (!currentList.previousElementSibling && currentList.parentElement.previousElementSibling) {
                currentList.parentElement.previousElementSibling.scrollIntoView();
            } else {
                currentList.scrollIntoView();
            }
        }
    }
};
