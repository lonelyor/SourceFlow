import {copySubMenu, exportMd, movePathToMenu, openFileAttr, renameMenu,} from "./commonMenuItem";
/// #if !BROWSER
import {FileFilter, ipcRenderer} from "electron";
import * as path from "path";
/// #endif
import {MenuItem} from "./Menu";
import {getDisplayName, getNotebookName, getTopPaths, pathPosix, useShell} from "../util/pathName";
import {hideMessage, showMessage} from "../dialog/message";
import {fetchPost, fetchSyncPost} from "../util/fetch";
import {onGetnotebookconf} from "./onGetnotebookconf";
/// #if !MOBILE
import {openSearch} from "../search/spread";
/// #else
import {closePanel} from "../mobile/util/closePanel";
import {popSearch} from "../mobile/menu/search";
/// #endif
import {Constants} from "../constants";
import {newFile} from "../util/newFile";
import {hasClosestByTag, hasTopClosestByTag} from "../protyle/util/hasClosest";
import {deleteFiles} from "../editor/deleteFile";
import {getDockByType} from "../layout/tabUtil";
import {Files} from "../layout/dock/Files";
import {openCardByData} from "../card/openCard";
import {viewCards} from "../card/viewCards";
import {App} from "../index";
import {openDocHistory} from "../history/doc";
import {openEditorTab} from "./util";
import {makeCard} from "../card/makeCard";
import {transaction} from "../protyle/wysiwyg/transaction";
import {emitOpenMenu} from "../plugin/EventBus";
import {openByMobile} from "../protyle/util/compatibility";
import {addFilesToDatabase} from "../protyle/render/av/addToDatabase";
import {buildWorkbenchViewNoteMenu} from "../workbench/viewNoteMenu";
import {runFolderAIReview} from "../assistant/folderReview";
import type {IMentionSource} from "../assistant/mentions/types";
import {ASSISTANT_AT_AI_LABEL} from "../assistant/constants";

const loadHomepageModule = () => import("../homepage");

const getDocTreeAISourceType = (liElement: Element): IMentionSource["type"] => {
    const childCount = parseInt(liElement.getAttribute("data-count") || "0", 10);
    return childCount > 0 ? "folder" : "note";
};

const openDocTreeAIDock = (options: {
    notebookId: string;
    pathString: string;
    rootID: string;
    name: string;
    type: IMentionSource["type"];
}) => {
    const title = options.name || getNotebookName(options.notebookId) || "AI";
    const hPath = options.pathString && options.pathString !== "/"
        ? pathPosix().join(getNotebookName(options.notebookId), getDisplayName(options.pathString, false, true))
        : getNotebookName(options.notebookId);
    const source: IMentionSource = {
        id: options.rootID,
        type: options.type,
        title,
        notebook: options.notebookId,
        path: options.pathString,
        hPath,
        included: true,
    };
    void import("../assistant/ai/AIDockInstance").then(({openAssistantAIDock}) => {
        openAssistantAIDock({
            message: `@${title} `,
            includeCurrentNote: false,
            sources: [source],
        });
    });
};

const getSiblingFileItems = (liElement: HTMLElement) => {
    return Array.from(liElement.parentElement.children).filter((item): item is HTMLElement => {
        return item instanceof HTMLElement && item.tagName === "LI" && item.hasAttribute("data-path");
    });
};

const moveFileTreeSort = (liElement: HTMLElement, notebookId: string, direction: "up" | "down") => {
    const siblingItems = getSiblingFileItems(liElement);
    const currentIndex = siblingItems.indexOf(liElement);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblingItems.length) {
        return;
    }
    const orderedItems = [...siblingItems];
    orderedItems[currentIndex] = siblingItems[targetIndex];
    orderedItems[targetIndex] = liElement;
    const paths = orderedItems.map((item) => item.getAttribute("data-path"));
    fetchPost("/api/filetree/changeSort", {
        paths,
        notebook: notebookId
    }, () => {
        const targetElement = siblingItems[targetIndex];
        const nextULElement = liElement.nextElementSibling?.tagName === "UL" ? liElement.nextElementSibling : undefined;
        if (direction === "up") {
            targetElement.before(liElement);
        } else if (targetElement.nextElementSibling?.tagName === "UL") {
            targetElement.nextElementSibling.after(liElement);
        } else {
            targetElement.after(liElement);
        }
        if (nextULElement) {
            liElement.after(nextULElement);
        }
    });
};

const initMultiMenu = (selectItemElements: NodeListOf<Element>, app: App) => {
    window.sourceflow.menus.menu.element.setAttribute("data-from", Constants.MENU_FROM_DOC_TREE_MORE_ITEMS);
    const fileItemElement = Array.from(selectItemElements).find(item => {
        if (item.getAttribute("data-type") === "navigation-file") {
            return true;
        }
    });
    if (!fileItemElement) {
        return window.sourceflow.menus.menu;
    }
    const blockIDs: string[] = [];
    selectItemElements.forEach(item => {
        const id = item.getAttribute("data-node-id");
        if (id) {
            blockIDs.push(id);
        }
    });

    if (blockIDs.length > 0) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "copy",
            label: window.sourceflow.languages.copy,
            type: "submenu",
            icon: "iconCopy",
            submenu: copySubMenu(blockIDs).concat([{
                id: "duplicate",
                iconHTML: "",
                label: window.sourceflow.languages.duplicate,
                accelerator: window.sourceflow.config.keymap.editor.general.duplicate.custom,
                click() {
                    blockIDs.forEach((id) => {
                        fetchPost("/api/filetree/duplicateDoc", {
                            id
                        });
                    });
                }
            }])
        }).element);
    }

    window.sourceflow.menus.menu.append(movePathToMenu(getTopPaths(
        Array.from(selectItemElements)
    )));

    if (blockIDs.length > 0) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "addToDatabase",
            label: window.sourceflow.languages.addToDatabase,
            accelerator: window.sourceflow.config.keymap.general.addToDatabase.custom,
            icon: "iconDatabase",
            click: () => {
                addFilesToDatabase(Array.from(selectItemElements));
            }
        }).element);
    }
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "delete",
        icon: "iconTrashcan",
        label: window.sourceflow.languages.delete,
        accelerator: "⌦",
        click: () => {
            deleteFiles(Array.from(selectItemElements));
        }
    }).element);

    if (blockIDs.length === 0) {
        return window.sourceflow.menus.menu;
    }
    window.sourceflow.menus.menu.append(new MenuItem({id: "separator_1", type: "separator"}).element);
    if (!window.sourceflow.config.readonly) {
        const riffCardMenu = [{
            id: "quickMakeCard",
            iconHTML: "",
            accelerator: window.sourceflow.config.keymap.editor.general.quickMakeCard.custom,
            label: window.sourceflow.languages.quickMakeCard,
            click: () => {
                transaction(undefined, [{
                    action: "addFlashcards",
                    deckID: Constants.QUICK_DECK_ID,
                    blockIDs,
                }]);
            }
        }, {
            id: "removeCard",
            iconHTML: "",
            label: window.sourceflow.languages.removeCard,
            click: () => {
                transaction(undefined, [{
                    action: "removeFlashcards",
                    deckID: Constants.QUICK_DECK_ID,
                    blockIDs,
                }]);
            }
        }];
        if (window.sourceflow.config.flashcard.deck) {
            riffCardMenu.push({
                id: "addToDeck",
                iconHTML: "",
                label: window.sourceflow.languages.addToDeck,
                click: () => {
                    makeCard(app, blockIDs);
                }
            });
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "riffCard",
            label: window.sourceflow.languages.riffCard,
            icon: "iconRiffCard",
            submenu: riffCardMenu,
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_2", type: "separator"}).element);
    }
    openEditorTab(app, blockIDs);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "export",
        label: window.sourceflow.languages.export,
        type: "submenu",
        icon: "iconUpload",
        submenu: [{
            id: "exportSourceFlowZip",
            label: "SourceFlow .sf.zip",
            icon: "iconUpload",
            click: () => {
                const msgId = showMessage(window.sourceflow.languages.exporting, -1);
                fetchPost("/api/export/exportSYs", {
                    ids: blockIDs,
                }, response => {
                    hideMessage(msgId);
                    openByMobile(response.data.zip);
                });
            }
        }, {
            id: "exportMarkdown",
            label: "Markdown .zip",
            icon: "iconMarkdown",
            click: () => {
                const msgId = showMessage(window.sourceflow.languages.exporting, -1);
                fetchPost("/api/export/exportMds", {
                    ids: blockIDs,
                }, response => {
                    hideMessage(msgId);
                    openByMobile(response.data.zip);
                });
            }
        }]
    }).element);
    if (app.plugins) {
        emitOpenMenu({
            plugins: app.plugins,
            type: "open-menu-doctree",
            detail: {
                elements: selectItemElements,
                type: "docs"
            },
            separatorPosition: "top",
        });
    }
    return window.sourceflow.menus.menu;
};

export const initNavigationMenu = (app: App, liElement: HTMLElement) => {
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_DOC_TREE_MORE);
    const fileElement = hasClosestByTag(liElement, "DIV");
    if (!fileElement) {
        return window.sourceflow.menus.menu;
    }
    if (!liElement.classList.contains("b3-list-item--focus")) {
        fileElement.querySelectorAll(".b3-list-item--focus").forEach(item => {
            item.classList.remove("b3-list-item--focus");
            item.removeAttribute("select-end");
            item.removeAttribute("select-start");
        });
        liElement.classList.add("b3-list-item--focus");
    }
    const selectItemElements = fileElement.querySelectorAll(".b3-list-item--focus");
    if (selectItemElements.length > 1) {
        return initMultiMenu(selectItemElements, app);
    }
    window.sourceflow.menus.menu.element.setAttribute("data-from", Constants.MENU_FROM_DOC_TREE_MORE_NOTEBOOK);
    const notebookId = liElement.parentElement.getAttribute("data-url");
    const navigationPath = liElement.getAttribute("data-path") || "/";
    const name = getNotebookName(notebookId);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "assistantAtAI",
        icon: "iconAI",
        label: ASSISTANT_AT_AI_LABEL,
        click: () => {
            openDocTreeAIDock({
                notebookId,
                pathString: navigationPath,
                rootID: notebookId,
                name,
                type: "folder",
            });
        }
    }).element);
    if (!window.sourceflow.config.readonly) {
        const lang = window.sourceflow.config.lang;
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "newSubDoc",
            icon: "iconFile",
            label: lang === "zh_CN" ? "新建子文档" : "New Sub Doc",
            click: () => {
                newFile({
                    app,
                    notebookId,
                    currentPath: navigationPath,
                    useSavePath: false,
                    listDocTree: true,
                });
            }
        }).element);
        const templateMenuItem = new MenuItem({
            id: "newFromTemplate",
            icon: "iconImage",
            label: lang === "zh_CN" ? "从模板新建" : "New from Template",
            type: "submenu",
            submenu: [{
                id: "template-placeholder",
                iconHTML: "",
                label: lang === "zh_CN" ? "加载中..." : "Loading...",
                type: "readonly",
            }],
        });
        window.sourceflow.menus.menu.append(templateMenuItem.element);
        void import("../config/templatePicker").then(({fillTemplateSubMenu}) => {
            fillTemplateSubMenu((markdown) => {
                newFile({
                    app,
                    notebookId,
                    currentPath: navigationPath,
                    useSavePath: false,
                    listDocTree: true,
                    markdown,
                });
            });
        });
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_new", type: "separator"}).element);
        window.sourceflow.menus.menu.append(renameMenu({
            path: "/",
            notebookId,
            name,
            type: "notebook"
        }));
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "config",
            label: window.sourceflow.languages.config,
            icon: "iconSettings",
            click: () => {
                fetchPost("/api/notebook/getNotebookConf", {
                    notebook: notebookId
                }, (data) => {
                    onGetnotebookconf(data.data);
                });
            }
        }).element);
        const subMenu = sortMenu("notebook", parseInt(liElement.parentElement.getAttribute("data-sortmode")), (sort) => {
            fetchPost("/api/notebook/setNotebookConf", {
                notebook: notebookId,
                conf: {
                    sortMode: sort
                }
            }, () => {
                liElement.parentElement.setAttribute("data-sortmode", sort.toString());
                let files;
                /// #if MOBILE
                files = window.sourceflow.mobile.docks.file;
                /// #else
                files = (getDockByType("file").data["file"] as Files);
                /// #endif
                const toggleElement = liElement.querySelector(".b3-list-item__arrow--open");
                if (toggleElement) {
                    toggleElement.classList.remove("b3-list-item__arrow--open");
                    liElement.nextElementSibling?.remove();
                    files.getLeaf(liElement, notebookId);
                }
            });
            return true;
        });
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "sort",
            icon: "iconSort",
            label: window.sourceflow.languages.sort,
            type: "submenu",
            submenu: subMenu,
        }).element);
    }
    if (!window.sourceflow.config.readonly) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "riffCard",
            label: window.sourceflow.languages.riffCard,
            type: "submenu",
            icon: "iconRiffCard",
            submenu: [{
                id: "spaceRepetition",
                iconHTML: "",
                label: window.sourceflow.languages.spaceRepetition,
                accelerator: window.sourceflow.config.keymap.editor.general.spaceRepetition.custom,
                click: () => {
                    fetchPost("/api/riff/getNotebookRiffDueCards", {notebook: notebookId}, (response) => {
                        openCardByData(app, response.data, "notebook", notebookId, name);
                    });
                    /// #if MOBILE
                    closePanel();
                    /// #endif
                }
            }, {
                id: "manage",
                iconHTML: "",
                label: window.sourceflow.languages.manage,
                click: () => {
                    viewCards(app, notebookId, name, "Notebook");
                    /// #if MOBILE
                    closePanel();
                    /// #endif
                }
            }],
        }).element);
    }
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "search",
        label: window.sourceflow.languages.search,
        accelerator: window.sourceflow.config.keymap.general.search.custom,
        icon: "iconSearch",
        click() {
            /// #if MOBILE
            popSearch(app, {
                hasReplace: false,
                hPath: getNotebookName(notebookId),
                idPath: [notebookId],
                page: 1,
            });
            /// #else
            openSearch({
                app,
                hotkey: Constants.DIALOG_SEARCH,
                notebookId,
            });
            /// #endif
        }
    }).element);
    if (!window.sourceflow.config.readonly) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "replace",
            label: window.sourceflow.languages.replace,
            accelerator: window.sourceflow.config.keymap.general.replace.custom,
            icon: "iconReplace",
            click() {
                /// #if MOBILE
                popSearch(app, {
                    hasReplace: true,
                    hPath: getNotebookName(notebookId),
                    idPath: [notebookId],
                    page: 1,
                });
                /// #else
                openSearch({
                    app,
                    hotkey: Constants.DIALOG_REPLACE,
                    notebookId,
                });
                /// #endif
            }
        }).element);
    }
    if (!window.sourceflow.config.readonly) {
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_1", type: "separator"}).element);
        if (!Object.values(Constants.HELP_PATH).includes(notebookId)) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "close",
                label: window.sourceflow.languages.close,
                icon: "iconClose",
                click: () => {
                    fetchPost("/api/notebook/closeNotebook", {
                        notebook: notebookId
                    });
                }
            }).element);
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "workbenchCreateViewNote",
            label: window.sourceflow.languages.workbenchCreateViewNote,
            icon: "iconLayout",
            type: "submenu",
            submenu: buildWorkbenchViewNoteMenu(app, {
                notebookId,
                pathString: navigationPath,
            }),
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "folderAIReview",
            label: window.sourceflow.config.lang === "zh_CN" ? "AI 自动化复盘" : "AI Review",
            icon: "iconSparkles",
            click: () => {
                void runFolderAIReview(app, {
                    notebookId,
                    pathString: navigationPath,
                    name,
                });
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "delete",
            icon: "iconTrashcan",
            label: window.sourceflow.languages.delete,
            accelerator: "⌦",
            click: () => {
                deleteFiles(Array.from(fileElement.querySelectorAll(".b3-list-item--focus")));
            }
        }).element);
    }
    window.sourceflow.menus.menu.append(new MenuItem({id: "separator_2", type: "separator"}).element);
    /// #if !BROWSER
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "showInFolder",
        icon: "iconFolder",
        label: window.sourceflow.languages.showInFolder,
        click: () => {
            useShell("openPath", path.join(window.sourceflow.config.system.dataDir, notebookId));
        }
    }).element);
    /// #endif
    genImportMenu(notebookId, "/");

    window.sourceflow.menus.menu.append(new MenuItem({
        id: "export",
        label: window.sourceflow.languages.export,
        type: "submenu",
        icon: "iconUpload",
        submenu: [{
            id: "exportSourceFlowZip",
            label: "SourceFlow .sf.zip",
            icon: "iconUpload",
            click: () => {
                const msgId = showMessage(window.sourceflow.languages.exporting, -1);
                fetchPost("/api/export/exportNotebookSY", {
                    id: notebookId,
                }, response => {
                    hideMessage(msgId);
                    openByMobile(response.data.zip);
                });
            }
        }, {
            id: "exportMarkdown",
            label: "Markdown .zip",
            icon: "iconMarkdown",
            click: () => {
                const msgId = showMessage(window.sourceflow.languages.exporting, -1);
                fetchPost("/api/export/exportNotebookMd", {
                    notebook: notebookId
                }, response => {
                    hideMessage(msgId);
                    openByMobile(response.data.zip);
                });
            }
        }]
    }).element);
    if (app.plugins) {
        emitOpenMenu({
            plugins: app.plugins,
            type: "open-menu-doctree",
            detail: {
                elements: selectItemElements,
                type: "notebook"
            },
            separatorPosition: "top",
        });
    }
    return window.sourceflow.menus.menu;
};

export const initFileMenu = (app: App, notebookId: string, pathString: string, liElement: Element) => {
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_DOC_TREE_MORE);
    const fileElement = hasClosestByTag(liElement, "DIV");
    if (!fileElement) {
        return window.sourceflow.menus.menu;
    }
    if (!liElement.classList.contains("b3-list-item--focus")) {
        fileElement.querySelectorAll(".b3-list-item--focus").forEach(item => {
            item.classList.remove("b3-list-item--focus");
            item.removeAttribute("select-end");
            item.removeAttribute("select-start");
        });
        liElement.classList.add("b3-list-item--focus");
    }
    const selectItemElements = fileElement.querySelectorAll(".b3-list-item--focus");
    if (selectItemElements.length > 1) {
        return initMultiMenu(selectItemElements, app);
    }
    const id = liElement.getAttribute("data-node-id");
    let name = liElement.getAttribute("data-name");
    name = getDisplayName(name, false, true);
    const fileLiElement = liElement as HTMLElement;
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "assistantAtAI",
        icon: "iconAI",
        label: ASSISTANT_AT_AI_LABEL,
        click: () => {
            openDocTreeAIDock({
                notebookId,
                pathString,
                rootID: id,
                name,
                type: getDocTreeAISourceType(liElement),
            });
        }
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({id: "separator_assistant_ai", type: "separator"}).element);
    if (!window.sourceflow.config.readonly) {
        const topElement = hasTopClosestByTag(liElement, "UL");
        if (window.sourceflow.config.fileTree.sort === 6 || (topElement && topElement.dataset.sortmode === "6")) {
            const siblingItems = getSiblingFileItems(fileLiElement);
            const currentSortIndex = siblingItems.indexOf(fileLiElement);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "moveToUp",
                icon: "iconUp",
                label: window.sourceflow.languages.moveToUp,
                disabled: currentSortIndex <= 0,
                click: () => {
                    moveFileTreeSort(fileLiElement, notebookId, "up");
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "moveToDown",
                icon: "iconDown",
                label: window.sourceflow.languages.moveToDown,
                disabled: currentSortIndex < 0 || currentSortIndex >= siblingItems.length - 1,
                click: () => {
                    moveFileTreeSort(fileLiElement, notebookId, "down");
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_sort_move", type: "separator"}).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "newDocAbove",
                icon: "iconBefore",
                label: window.sourceflow.languages.newDocAbove,
                click: () => {
                    const paths: string[] = [];
                    Array.from(liElement.parentElement.children).forEach((item) => {
                        if (item.tagName === "LI") {
                            if (item === liElement) {
                                paths.push(undefined);
                            }
                            paths.push(item.getAttribute("data-path"));
                        }
                    });
                    newFile({
                        app,
                        notebookId,
                        currentPath: pathPosix().dirname(pathString),
                        paths,
                        useSavePath: false,
                        listDocTree: true,
                    });
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "newDocBelow",
                icon: "iconAfter",
                label: window.sourceflow.languages.newDocBelow,
                click: () => {
                    const paths: string[] = [];
                    Array.from(liElement.parentElement.children).forEach((item) => {
                        if (item.tagName === "LI") {
                            paths.push(item.getAttribute("data-path"));
                            if (item === liElement) {
                                paths.push(undefined);
                            }
                        }
                    });
                    newFile({
                        app,
                        notebookId,
                        currentPath: pathPosix().dirname(pathString),
                        paths,
                        useSavePath: false,
                        listDocTree: true,
                    });
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_1", type: "separator"}).element);
        }
        const lang = window.sourceflow.config.lang;
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "newSubDoc",
            icon: "iconFile",
            label: lang === "zh_CN" ? "新建子文档" : "New Sub Doc",
            click: () => {
                newFile({
                    app,
                    notebookId,
                    currentPath: pathString,
                    useSavePath: false,
                    listDocTree: true,
                });
            }
        }).element);
        const templateMenuItem = new MenuItem({
            id: "newFromTemplate",
            icon: "iconImage",
            label: lang === "zh_CN" ? "从模板新建" : "New from Template",
            type: "submenu",
            submenu: [{
                id: "template-placeholder",
                iconHTML: "",
                label: lang === "zh_CN" ? "加载中..." : "Loading...",
                type: "readonly",
            }],
        });
        window.sourceflow.menus.menu.append(templateMenuItem.element);
        void import("../config/templatePicker").then(({fillTemplateSubMenu}) => {
            fillTemplateSubMenu((markdown) => {
                newFile({
                    app,
                    notebookId,
                    currentPath: pathString,
                    useSavePath: false,
                    listDocTree: true,
                    markdown,
                });
            });
        });
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_new_subdoc", type: "separator"}).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "copy",
            label: window.sourceflow.languages.copy,
            type: "submenu",
            icon: "iconCopy",
            submenu: (copySubMenu([id]) as IMenu[]).concat([{
                id: "duplicate",
                iconHTML: "",
                label: window.sourceflow.languages.duplicate,
                accelerator: window.sourceflow.config.keymap.editor.general.duplicate.custom,
                click() {
                    fetchPost("/api/filetree/duplicateDoc", {
                        id
                    });
                }
            }])
        }).element);
        window.sourceflow.menus.menu.append(movePathToMenu(getTopPaths(
            Array.from(fileElement.querySelectorAll(".b3-list-item--focus"))
        )));
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "addToDatabase",
            label: window.sourceflow.languages.addToDatabase,
            accelerator: window.sourceflow.config.keymap.general.addToDatabase.custom,
            icon: "iconDatabase",
            click: () => {
                addFilesToDatabase([liElement]);
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "delete",
            icon: "iconTrashcan",
            label: window.sourceflow.languages.delete,
            accelerator: "⌦",
            click: () => {
                deleteFiles(Array.from(fileElement.querySelectorAll(".b3-list-item--focus")));
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_2", type: "separator"}).element);
        window.sourceflow.menus.menu.append(renameMenu({
            path: pathString,
            notebookId,
            name,
            type: "file",
            docId: id,
        }));
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "attr",
            label: window.sourceflow.languages.attr,
            icon: "iconAttr",
            click() {
                fetchPost("/api/block/getDocInfo", {
                    id
                }, (response) => {
                    openFileAttr(response.data.ial);
                });
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "setAsHomepage",
            label: window.sourceflow.config.lang === "zh_CN" ? "设为主页" : "Set as Homepage",
            icon: "iconLayout",
            click: () => {
                void loadHomepageModule().then(({setHomepageSourceToNote, openHomepageTab}) => {
                    setHomepageSourceToNote(id);
                    showMessage(window.sourceflow.config.lang === "zh_CN" ? "已设为主页" : "Set as homepage");
                    /// #if !MOBILE
                    openHomepageTab(app);
                    /// #endif
                });
            }
        }).element);
        if (!window.sourceflow.config.readonly) {
            const riffCardMenu = [{
                id: "spaceRepetition",
                iconHTML: "",
                label: window.sourceflow.languages.spaceRepetition,
                accelerator: window.sourceflow.config.keymap.editor.general.spaceRepetition.custom,
                click: () => {
                    fetchPost("/api/riff/getTreeRiffDueCards", {rootID: id}, (response) => {
                        openCardByData(app, response.data, "doc", id, name);
                    });
                    /// #if MOBILE
                    closePanel();
                    /// #endif
                }
            }, {
                id: "manage",
                iconHTML: "",
                label: window.sourceflow.languages.manage,
                click: () => {
                    fetchPost("/api/filetree/getHPathByID", {
                        id
                    }, (response) => {
                        viewCards(app, id, pathPosix().join(getNotebookName(notebookId), response.data), "Tree");
                    });
                    /// #if MOBILE
                    closePanel();
                    /// #endif
                }
            }, {
                id: "quickMakeCard",
                iconHTML: "",
                accelerator: window.sourceflow.config.keymap.editor.general.quickMakeCard.custom,
                label: window.sourceflow.languages.quickMakeCard,
                click: () => {
                    transaction(undefined, [{
                        action: "addFlashcards",
                        deckID: Constants.QUICK_DECK_ID,
                        blockIDs: [id]
                    }]);
                }
            }, {
                id: "removeCard",
                iconHTML: "",
                label: window.sourceflow.languages.removeCard,
                click: () => {
                    transaction(undefined, [{
                        action: "removeFlashcards",
                        deckID: Constants.QUICK_DECK_ID,
                        blockIDs: [id]
                    }]);
                }
            }];
            if (window.sourceflow.config.flashcard.deck) {
                riffCardMenu.push({
                    id: "addToDeck",
                    iconHTML: "",
                    label: window.sourceflow.languages.addToDeck,
                    click: () => {
                        makeCard(app, [id]);
                    }
                });
            }
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "riffCard",
                label: window.sourceflow.languages.riffCard,
                type: "submenu",
                icon: "iconRiffCard",
                submenu: riffCardMenu,
            }).element);
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "search",
            label: window.sourceflow.languages.search,
            icon: "iconSearch",
            accelerator: window.sourceflow.config.keymap.general.search.custom,
            async click() {
                const searchPath = getDisplayName(pathString, false, true);
                /// #if MOBILE
                const response = await fetchSyncPost("/api/filetree/getHPathByPath", {
                    notebook: notebookId,
                    path: searchPath + ".sf"
                });
                popSearch(app, {
                    hasReplace: false,
                    hPath: pathPosix().join(getNotebookName(notebookId), response.data),
                    idPath: [pathPosix().join(notebookId, searchPath)],
                    page: 1,
                });
                /// #else
                openSearch({
                    app,
                    hotkey: Constants.DIALOG_SEARCH,
                    notebookId,
                    searchPath
                });
                /// #endif
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "replace",
            label: window.sourceflow.languages.replace,
            accelerator: window.sourceflow.config.keymap.general.replace.custom,
            icon: "iconReplace",
            async click() {
                const searchPath = getDisplayName(pathString, false, true);
                /// #if MOBILE
                const response = await fetchSyncPost("/api/filetree/getHPathByPath", {
                    notebook: notebookId,
                    path: searchPath + ".sf"
                });
                popSearch(app, {
                    hasReplace: true,
                    hPath: pathPosix().join(getNotebookName(notebookId), response.data),
                    idPath: [pathPosix().join(notebookId, searchPath)],
                    page: 1,
                });
                /// #else
                openSearch({
                    app,
                    hotkey: Constants.DIALOG_REPLACE,
                    notebookId,
                    searchPath
                });
                /// #endif
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "workbenchCreateViewNote",
            label: window.sourceflow.languages.workbenchCreateViewNote,
            icon: "iconLayout",
            type: "submenu",
            submenu: buildWorkbenchViewNoteMenu(app, {
                notebookId,
                pathString,
                useParentPath: true,
            }),
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "folderAIReview",
            label: window.sourceflow.config.lang === "zh_CN" ? "AI 自动化复盘" : "AI Review",
            icon: "iconSparkles",
            click: () => {
                void runFolderAIReview(app, {
                    notebookId,
                    pathString,
                    rootID: id,
                    name,
                });
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_3", type: "separator"}).element);
    }
    openEditorTab(app, [id], notebookId, pathString);
    if (!window.sourceflow.config.readonly) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "fileHistory",
            label: window.sourceflow.languages.fileHistory,
            icon: "iconHistory",
            click() {
                openDocHistory({app, id, notebookId, pathString: name});
            }
        }).element);
    }
    genImportMenu(notebookId, pathString);
    window.sourceflow.menus.menu.append(exportMd(id));
    if (app.plugins) {
        emitOpenMenu({
            plugins: app.plugins,
            type: "open-menu-doctree",
            detail: {
                elements: selectItemElements,
                type: "doc"
            },
            separatorPosition: "top",
        });
    }
    window.sourceflow.menus.menu.element.setAttribute("data-from", Constants.MENU_FROM_DOC_TREE_MORE_DOC);
    return window.sourceflow.menus.menu;
};

export const genImportMenu = (notebookId: string, pathString: string) => {
    if (window.sourceflow.config.readonly) {
        return;
    }
    const reloadDocTree = () => {
        let files;
        /// #if MOBILE
        files = window.sourceflow.mobile.docks.file;
        /// #else
        files = (getDockByType("file").data["file"] as Files);
        /// #endif
        const liElement = files.element.querySelector(`[data-path="${pathString}"]`);
        liElement.querySelector(".b3-list-item__toggle").classList.remove("fn__hidden");
        files.getLeaf(liElement, notebookId, true);
        window.sourceflow.menus.menu.remove();
    };
    /// #if !BROWSER
    const importstdmd = (label: string, isDoc?: boolean) => {
        return {
            id: isDoc ? "importMarkdownDoc" : "importMarkdownFolder",
            icon: isDoc ? "iconMarkdown" : "iconFolder",
            label,
            click: async () => {
                let filters: FileFilter[] = [];
                if (isDoc) {
                    filters = [{name: "Markdown", extensions: ["md", "markdown"]}];
                }
                const localPath = await ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
                    cmd: "showOpenDialog",
                    defaultPath: window.sourceflow.config.system.homeDir,
                    filters,
                    properties: [isDoc ? "openFile" : "openDirectory"],
                });
                if (localPath.filePaths.length === 0) {
                    return;
                }
                fetchPost("/api/import/importStdMd", {
                    notebook: notebookId,
                    localPath: localPath.filePaths[0],
                    toPath: pathString,
                }, () => {
                    reloadDocTree();
                });
            }
        };
    };
    /// #endif
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "import",
        icon: "iconDownload",
        label: window.sourceflow.languages.import,
        submenu: [
            {
                id: "importSourceFlowZip",
                icon: "iconDownload",
                label: 'SourceFlow .sf.zip<input class="b3-form__upload" type="file" accept="application/zip">',
                bind: (element) => {
                    element.querySelector(".b3-form__upload").addEventListener("change", (event: InputEvent & {
                        target: HTMLInputElement
                    }) => {
                        const formData = new FormData();
                        formData.append("file", event.target.files[0]);
                        formData.append("notebook", notebookId);
                        formData.append("toPath", pathString);
                        fetchPost("/api/import/importSY", formData, () => {
                            reloadDocTree();
                        });
                    });
                }
            },
            {
                id: "importMarkdownZip",
                icon: "iconMarkdown",
                label: 'Markdown .zip<input class="b3-form__upload" type="file" accept="application/zip">',
                bind: (element) => {
                    element.querySelector(".b3-form__upload").addEventListener("change", (event: InputEvent & {
                        target: HTMLInputElement
                    }) => {
                        const formData = new FormData();
                        formData.append("file", event.target.files[0]);
                        formData.append("notebook", notebookId);
                        formData.append("toPath", pathString);
                        fetchPost("/api/import/importZipMd", formData, () => {
                            reloadDocTree();
                        });
                    });
                }
            },
            /// #if !BROWSER
            importstdmd("Markdown " + window.sourceflow.languages.doc, true),
            importstdmd("Markdown " + window.sourceflow.languages.folder)
            /// #endif
        ],
    }).element);
};

export const sortMenu = (type: "notebooks" | "notebook", sortMode: number, clickEvent: (sort: number) => void) => {
    const sortMenu: IMenu[] = [{
        id: "fileNameASC",
        icon: sortMode === 0 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.fileNameASC,
        click: () => {
            clickEvent(0);
        }
    }, {
        id: "fileNameDESC",
        icon: sortMode === 1 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.fileNameDESC,
        click: () => {
            clickEvent(1);
        }
    }, {
        id: "fileNameNatASC",
        icon: sortMode === 4 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.fileNameNatASC,
        click: () => {
            clickEvent(4);
        }
    }, {
        id: "fileNameNatDESC",
        icon: sortMode === 5 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.fileNameNatDESC,
        click: () => {
            clickEvent(5);
        }
    }, {id: "separator_1", type: "separator"}, {
        id: "createdASC",
        icon: sortMode === 9 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.createdASC,
        click: () => {
            clickEvent(9);
        }
    }, {
        id: "createdDESC",
        icon: sortMode === 10 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.createdDESC,
        click: () => {
            clickEvent(10);
        }
    }, {
        id: "modifiedASC",
        icon: sortMode === 2 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.modifiedASC,
        click: () => {
            clickEvent(2);
        }
    }, {
        id: "modifiedDESC",
        icon: sortMode === 3 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.modifiedDESC,
        click: () => {
            clickEvent(3);
        }
    }, {id: "separator_2", type: "separator"}, {
        id: "refCountASC",
        icon: sortMode === 7 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.refCountASC,
        click: () => {
            clickEvent(7);
        }
    }, {
        id: "refCountDESC",
        icon: sortMode === 8 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.refCountDESC,
        click: () => {
            clickEvent(8);
        }
    }, {id: "separator_3", type: "separator"}, {
        id: "docSizeASC",
        icon: sortMode === 11 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.docSizeASC,
        click: () => {
            clickEvent(11);
        }
    }, {
        id: "docSizeDESC",
        icon: sortMode === 12 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.docSizeDESC,
        click: () => {
            clickEvent(12);
        }
    }, {id: "separator_4", type: "separator"}, {
        id: "subDocCountASC",
        icon: sortMode === 13 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.subDocCountASC,
        click: () => {
            clickEvent(13);
        }
    }, {
        id: "subDocCountDESC",
        icon: sortMode === 14 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.subDocCountDESC,
        click: () => {
            clickEvent(14);
        }
    }, {id: "separator_5", type: "separator"}, {
        id: "customSort",
        icon: sortMode === 6 ? "iconSelect" : undefined,
        label: window.sourceflow.languages.customSort,
        click: () => {
            clickEvent(6);
        }
    }];
    if (type === "notebook") {
        sortMenu.push({
            id: "sortByFiletree",
            icon: sortMode === 15 ? "iconSelect" : undefined,
            label: window.sourceflow.languages.sortByFiletree,
            click: () => {
                clickEvent(15);
            }
        });
    }
    return sortMenu;
};
