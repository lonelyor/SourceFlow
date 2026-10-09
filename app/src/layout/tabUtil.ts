import {Tab} from "./Tab";
import {getInstanceById, newModelByInitData, saveLayout} from "./util";
import {getAllModels, getAllTabs} from "./getAll";
import {hideAllElements, hideElements} from "../protyle/ui/hideElements";
import {pdfResize} from "../asset/renderAssets";
import {App} from "../index";
import {Model} from "./Model";
import {Editor} from "../editor";
import {Asset} from "../asset";
import {Graph} from "./dock/Graph";
import {Files} from "./dock/Files";
import {Outline} from "./dock/Outline";
import {Backlink} from "./dock/Backlink";
import {Bookmark} from "./dock/Bookmark";
import {Tag} from "./dock/Tag";
import {Search} from "../search";
import {Custom} from "./dock/Custom";
import {newCardModel} from "../card/newCardTab";
import {fetchPost} from "../util/fetch";
import {Constants} from "../constants";

export const getActiveTab = (wndActive = true) => {
    const activeTabElement = document.querySelector(".layout__wnd--active .item--focus");
    let tab;
    if (activeTabElement) {
        tab = getInstanceById(activeTabElement.getAttribute("data-id")) as Tab;
    }
    if (!tab && !wndActive) {
        getAllTabs().find(item => {
            if (item.headElement?.classList.contains("item--focus")) {
                tab = item;
            }
        });
    }
    return tab;
};

export const switchTabByIndex = (index: number) => {
    const activeDockIcoElement = document.querySelector(".dock .dock__item--activefocus");
    if (activeDockIcoElement) {
        let indexElement = activeDockIcoElement.parentElement.children[index];
        if (index === -1) {
            // 最后一个
            indexElement = activeDockIcoElement.parentElement.lastElementChild;
            if (!indexElement.getAttribute("data-type")) {
                indexElement = indexElement.previousElementSibling;
            }
        } else if (index === -2) {
            // 上一个
            indexElement = activeDockIcoElement.previousElementSibling;
            if (!indexElement) {
                indexElement = activeDockIcoElement.parentElement.lastElementChild;
                if (indexElement.classList.contains("dock__item--pin")) {
                    indexElement = indexElement.previousElementSibling;
                }
            }
        } else if (index === -3) {
            // 下一个
            indexElement = activeDockIcoElement.nextElementSibling;
            if (!indexElement || indexElement.classList.contains("dock__item--pin")) {
                indexElement = activeDockIcoElement.parentElement.firstElementChild;
            }
        }
        const type = indexElement?.getAttribute("data-type") as TDock;
        if (type) {
            getDockByType(type)?.toggleModel(type, true, false);
        }
        return;
    }
    const tab = getActiveTab(false);
    if (tab) {
        let indexElement = tab.parent.headersElement.children[index];
        if (index === -1) {
            // 最后一个
            indexElement = tab.parent.headersElement.lastElementChild;
        } else if (index === -2) {
            // 上一个
            indexElement = tab.headElement.previousElementSibling;
            if (!indexElement) {
                indexElement = tab.headElement.parentElement.lastElementChild;
            }
        } else if (index === -3) {
            // 下一个
            indexElement = tab.headElement.nextElementSibling;
            if (!indexElement) {
                indexElement = tab.headElement.parentElement.firstElementChild;
            }
        }
        if (indexElement) {
            tab.parent.switchTab(indexElement as HTMLElement, true);
            tab.parent.showHeading();
        }
    }
};

let resizeTimeout: number;
export const resizeTabs = (isSaveLayout = true) => {
    clearTimeout(resizeTimeout);
    //  .layout .fn__flex-shrink {width .15s cubic-bezier(0, 0, .2, 1) 0ms} 时需要再次计算 padding
    // PDF 避免分屏多次调用后，页码跳转到1 https://github.com/lonelyor/SourceFlow/issues/5646
    resizeTimeout = window.setTimeout(() => {
        const models = getAllModels();
        models.editor.forEach((item) => {
            if (item.editor && item.editor.protyle &&
                item.element.parentElement && !item.element.classList.contains("fn__none")) {
                item.editor.resize();
            }
        });
        // https://github.com/lonelyor/SourceFlow/issues/6250
        models.backlink.forEach(item => {
            const mTreeElement = item.element.querySelector(".backlinkMList") as HTMLElement;
            if (mTreeElement.style.height && mTreeElement.style.height !== "0px" && item.element.clientHeight !== 0) {
                mTreeElement.style.height = (item.element.clientHeight - mTreeElement.previousElementSibling.clientHeight * 2) + "px";
            }
            item.editors.forEach(editorItem => {
                hideElements(["gutter"], editorItem.protyle);
                editorItem.resize();
            });
        });
        models.search.forEach(item => {
            if (item.element.querySelector("#searchUnRefPanel").classList.contains("fn__none")) {
                item.editors.edit.resize();
            } else {
                item.editors.unRefEdit.resize();
            }
        });
        models.custom.forEach(item => {
            if (item.resize) {
                item.resize();
            }
        });
        pdfResize();
        hideAllElements(["gutter"]);
        if (isSaveLayout) {
            saveLayout();
        }
    }, 200);
};

export const getDockByType = (type: TDock | string) => {
    if (!window.sourceflow.layout.leftDock) {
        return undefined;
    }
    if (window.sourceflow.layout.leftDock.data[type]) {
        return window.sourceflow.layout.leftDock;
    }
    if (window.sourceflow.layout.rightDock.data[type]) {
        return window.sourceflow.layout.rightDock;
    }
    if (window.sourceflow.layout.bottomDock.data[type]) {
        return window.sourceflow.layout.bottomDock;
    }
};

export const newCenterEmptyTab = (app: App) => {
    void app;
    return new Tab({
        callback(newTab: Tab) {
            newTab.panelElement.innerHTML = "";
        }
    });
};

export const copyTab = (app: App, tab: Tab) => {
    return new Tab({
        icon: tab.icon,
        docIcon: tab.docIcon,
        title: tab.title,
        callback(newTab: Tab) {
            let model: Model;
            if (tab.model instanceof Editor) {
                const newAction: TProtyleAction[] = [];
                // https://github.com/lonelyor/SourceFlow/issues/12132
                tab.model.editor.protyle.block.action.forEach(item => {
                    if (item !== Constants.CB_GET_APPEND && item !== Constants.CB_GET_BEFORE && item !== Constants.CB_GET_HTML) {
                        newAction.push(item);
                    }
                });
                model = new Editor({
                    app,
                    tab: newTab,
                    blockId: tab.model.editor.protyle.block.id,
                    rootId: tab.model.editor.protyle.block.rootID,
                    // https://github.com/lonelyor/SourceFlow/issues/12150
                    action: newAction,
                    afterInitProtyle(editor) {
                        // https://github.com/lonelyor/SourceFlow/issues/13851
                        if (tab.model instanceof Editor) {
                            const copyResizeTopElement = tab.model.editor.protyle.wysiwyg.element.querySelector("[data-resize-top]");
                            if (copyResizeTopElement) {
                                const newElement = editor.protyle.wysiwyg.element.querySelector(`[data-node-id="${copyResizeTopElement.getAttribute("data-node-id")}"]`);
                                if (newElement) {
                                    editor.protyle.observerLoad?.disconnect();
                                    newElement.scrollIntoView();
                                    editor.protyle.contentElement.scrollTop += parseInt(copyResizeTopElement.getAttribute("data-resize-top"));
                                }
                            }
                        }
                    }
                });
            } else if (tab.model instanceof Asset) {
                model = new Asset({
                    app,
                    tab: newTab,
                    path: tab.model.path
                });
            } else if (tab.model instanceof Graph) {
                model = new Graph({
                    app,
                    tab: newTab,
                    blockId: tab.model.blockId,
                    rootId: tab.model.rootId,
                    type: tab.model.type,
                });
            } else if (tab.model instanceof Files) {
                model = new Files({
                    app,
                    tab: newTab
                });
            } else if (tab.model instanceof Outline) {
                model = new Outline({
                    app,
                    tab: newTab,
                    blockId: tab.model.blockId,
                    type: tab.model.type,
                    isPreview: tab.model.isPreview
                });
            } else if (tab.model instanceof Backlink) {
                model = new Backlink({
                    app,
                    tab: newTab,
                    blockId: tab.model.blockId,
                    rootId: tab.model.rootId,
                    type: tab.model.type
                });
            } else if (tab.model instanceof Bookmark) {
                model = new Bookmark(app, newTab);
            } else if (tab.model instanceof Tag) {
                model = new Tag(app, newTab);
            } else if (tab.model instanceof Search) {
                model = new Search({
                    app,
                    tab: newTab,
                    config: tab.model.config
                });
            } else if (tab.model instanceof Custom) {
                const custom = tab.model as Custom;
                if (custom.type === "sourceflow-card") {
                    model = newCardModel({
                        app,
                        tab: newTab,
                        data: custom.data
                    });
                } else {
                    app.plugins.find(item => {
                        if (item.models[custom.type]) {
                            model = item.models[custom.type]({
                                tab: newTab,
                                data: custom.data
                            });
                            return true;
                        }
                    });
                }
            } else if (!tab.model && tab.headElement) {
                const initData = JSON.parse(tab.headElement.getAttribute("data-initdata") || "{}");
                if (initData) {
                    model = newModelByInitData(app, newTab, initData);
                }
            }
            newTab.addModel(model);
        }
    });
};

const getRootID = (item: Tab) => {
    if (item.model instanceof Editor) {
        return item.model.editor.protyle.block.rootID;
    } else if (!item.model) {
        const initTab = item.headElement.getAttribute("data-initdata");
        if (initTab) {
            try {
                const initTabData = JSON.parse(initTab);
                if (initTabData && initTabData.instance === "Editor" && initTabData.rootId) {
                    return initTabData.rootId;
                }
            } catch (e) {
                console.warn("Failed to parse tab init data:", e);
            }
        }
    }
};

export const closeTabByType = (tab: Tab, type: "closeOthers" | "closeAll" | "other", tabs?: Tab[]) => {
    const rootIDs: string[] = [];
    if (type === "closeOthers") {
        for (let index = 0; index < tab.parent.children.length; index++) {
            const item = tab.parent.children[index];
            if (item.id !== tab.id && !item.headElement.classList.contains("item--pin")) {
                rootIDs.push(getRootID(item));
                item.parent.removeTab(item.id, true, false);
                index--;
            }
        }
    } else if (type === "closeAll") {
        for (let index = 0; index < tab.parent.children.length; index++) {
            const item = tab.parent.children[index];
            if (!item.headElement.classList.contains("item--pin")) {
                rootIDs.push(getRootID(item));
                item.parent.removeTab(item.id, true);
                index--;
            }
        }
    } else if (tabs.length > 0) {
        for (let index = 0; index < tabs.length; index++) {
            if (!tabs[index].headElement.classList.contains("item--pin")) {
                tabs[index].parent.removeTab(tabs[index].id);
            }
        }
    }
    // 批量更新文档关闭时间
    if (rootIDs.length > 0) {
        fetchPost("/api/storage/batchUpdateRecentDocCloseTime", {rootIDs});
    }
    if (tab.headElement.parentElement && !tab.headElement.parentElement.querySelector(".item--focus")) {
        tab.parent.switchTab(tab.headElement, true);
    } else if (tab.parent.children.length > 0) {
        tab.parent.switchTab(tab.parent.children[tab.parent.children.length - 1].headElement, true);
    }
};
