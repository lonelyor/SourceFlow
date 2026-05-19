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
import {resetSearchAI} from "./searchAI";

type IAssistantSearchSource = import("../assistant/search/ask").IAssistantSearchSource;

const loadAssistantNoteModule = () => import("../assistant/common/note");
const loadAssistantInboxModule = () => import("../assistant/inbox/store");
const loadAssistantSearchModule = () => import("../assistant/search/ask");
const loadAssistantAIDockModule = () => import("../assistant/ai/AIDock");

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

export {focusSearchResultById, renderNextSearchMark};

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

