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
import {getSearchAIState, renderSearchAIPanel, resetSearchAI, runSearchAI} from "./searchAI";
import {focusSearchResultById, getArticle, inputEvent, openSearchEditor, renderNextSearchMark, replace} from "./searchResults";

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
