import {
    copyPlainText,
    isMac,
    isNotCtrl,
    isOnlyMeta,
    updateHotkeyTip,
    writeText
} from "../../protyle/util/compatibility";
import {matchAuxiliaryHotKey, matchHotKey} from "../../protyle/util/hotKey";
import {
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByClassName,
    hasTopClosestByTag,
} from "../../protyle/util/hasClosest";
import {newFile} from "../../util/newFile";
import {Constants} from "../../constants";
import {openSetting} from "../../config";
import {getInstanceById, saveLayout} from "../../layout/util";
import {getActiveTab, getDockByType, switchTabByIndex} from "../../layout/tabUtil";
import {Tab} from "../../layout/Tab";
import {Editor} from "../../editor";
import {setEditMode} from "../../protyle/util/setEditMode";
import {rename} from "../../editor/rename";
import {Files} from "../../layout/dock/Files";
import {newDailyNote} from "../../util/mount";
import {hideElements} from "../../protyle/ui/hideElements";
import {fetchPost} from "../../util/fetch";
import {goBack, goForward} from "../../util/backForward";
import {getDisplayName, getNotebookName} from "../../util/pathName";
import {openFileById} from "../../editor/util";
import {getAllDocks, getAllModels, getAllTabs} from "../../layout/getAll";
import {focusBlock, focusByOffset, focusByRange, getSelectionOffset} from "../../protyle/util/selection";
import {initFileMenu, initNavigationMenu} from "../../menus/navigation";
import {bindMenuKeydown} from "../../menus/Menu";
import {Dialog} from "../../dialog";
import {unicode2Emoji} from "../../emoji";
import {deleteFiles} from "../../editor/deleteFile";
import {escapeHtml} from "../../util/escape";
import {syncGuide} from "../../sync/syncGuide";
import {duplicateBlock, getStartEndElement, goEnd, goHome} from "../../protyle/wysiwyg/commonHotkey";
import {getNextFileLi, getPreviousFileLi} from "../../protyle/wysiwyg/getBlock";
import {Backlink} from "../../layout/dock/Backlink";
/// #if !BROWSER
import {setZoom} from "../../layout/topBar";
import {ipcRenderer} from "electron";
/// #endif
import {openHistory} from "../../history/history";
import {openCard, openCardByData} from "../../card/openCard";
import {lockScreen} from "../../dialog/processSystem";
import {isWindow} from "../../util/functions";
import {reloadProtyle} from "../../protyle/util/reload";
import {fullscreen} from "../../protyle/breadcrumb/action";
import {openRecentDocs} from "../../business/openRecentDocs";
import {App} from "../../index";
import {openBacklink, openGraph, openOutline, toggleDockBar} from "../../layout/dock/util";
import {workspaceMenu} from "../../menus/workspace";
import {resize} from "../../protyle/util/resize";
import {Search} from "../../search";
import {Custom} from "../../layout/dock/Custom";
import {transaction} from "../../protyle/wysiwyg/transaction";
import {quickMakeCard} from "../../card/makeCard";
import {getContentByInlineHTML} from "../../protyle/wysiwyg/keydown";
import {searchKeydown} from "./searchKeydown";
import {historyKeydown} from "../../history/keydown";
import {zoomOut} from "../../menus/protyle";
import {getPlainText} from "../../protyle/util/paste";
import {filterHotkey} from "./commonHotkey";
import {setReadOnly} from "../../config/util/setReadOnly";
import {copyPNGByLink} from "../../menus/util";
import {globalCommand} from "./command/global";
import {duplicateCompletely} from "../../protyle/render/av/action";
import {copyTextByType} from "../../protyle/toolbar/util";
import {onlyProtyleCommand} from "./command/protyle";
import {cancelDrag} from "./dragover";
import {bindAVPanelKeydown} from "../../protyle/render/av/keydown";
import {exitZenMode, isZenModeActive} from "../../editor/zenMode";
import {isTitleEmptyAttr} from "../../util/attrCompat";
import {runExecByCommand} from "./keydownWindow";

export const fileTreeKeydown = (app: App, event: KeyboardEvent) => {
    const dockFile = getDockByType("file");
    if (!dockFile) {
        return false;
    }
    const files = dockFile.data.file as Files;
    if (typeof dockFile.data.file === "boolean") {
        return true;
    }

    if (matchHotKey(window.sourceflow.config.keymap.general.selectOpen1.custom, event)) {
        event.preventDefault();
        globalCommand("selectOpen1", app);
        return;
    }

    if (!files.element.parentElement.classList.contains("layout__tab--active")) {
        return false;
    }

    let matchCommand = false;
    app.plugins.find(item => {
        item.commands.find(command => {
            if (command.fileTreeCallback && matchHotKey(command.customHotkey, event)) {
                matchCommand = true;
                command.fileTreeCallback(files);
                return true;
            }
        });
        if (matchCommand) {
            return true;
        }
    });
    if (matchCommand) {
        return true;
    }

    const liElements = Array.from(files.element.querySelectorAll(".b3-list-item--focus"));
    if (liElements.length === 0) {
        if (event.key.startsWith("Arrow") && isNotCtrl(event)) {
            const liElement = files.element.querySelector(".b3-list-item");
            if (liElement) {
                liElement.classList.add("b3-list-item--focus");
                files.lastSelectedElement = liElement;
            }
            event.preventDefault();
        }
        return false;
    }
    const topULElement = hasTopClosestByTag(liElements[0], "UL");
    if (!topULElement) {
        return false;
    }
    const notebookId = topULElement.getAttribute("data-url");
    const pathString = liElements[0].getAttribute("data-path");
    const isFile = liElements[0].getAttribute("data-type") === "navigation-file";
    const ids: string[] = [];
    liElements.forEach(item => {
        if (item.getAttribute("data-type") === "navigation-file") {
            ids.push(item.getAttribute("data-node-id"));
        }
    });

    if (matchHotKey(window.sourceflow.config.keymap.editor.general.spaceRepetition.custom, event) && !window.sourceflow.config.readonly) {
        if (isFile) {
            const id = liElements[0].getAttribute("data-node-id");
            fetchPost("/api/riff/getTreeRiffDueCards", {rootID: id}, (response) => {
                openCardByData(app, response.data, "doc", id, getDisplayName(liElements[0].getAttribute("data-name"), false, true));
            });
        } else {
            fetchPost("/api/riff/getNotebookRiffDueCards", {notebook: notebookId}, (response) => {
                openCardByData(app, response.data, "notebook", notebookId, getNotebookName(notebookId));
            });
        }
        event.preventDefault();
        return true;
    }

    if (matchHotKey(window.sourceflow.config.keymap.editor.general.quickMakeCard.custom, event)) {
        if (ids.length > 0) {
            transaction(undefined, [{
                action: "addFlashcards",
                deckID: Constants.QUICK_DECK_ID,
                blockIDs: ids,
            }]);
        }
        event.preventDefault();
        return true;
    }

    if (matchHotKey(window.sourceflow.config.keymap.general.addToDatabase.custom, event)) {
        runExecByCommand({
            command: "addToDatabase",
            app,
            fileLiElements: liElements
        });
        event.preventDefault();
        return true;
    }

    if (matchHotKey(window.sourceflow.config.keymap.editor.general.rename.custom, event)) {
        window.sourceflow.menus.menu.remove();
        if (isFile) {
            fetchPost("/api/block/getDocInfo", {
                id: liElements[0].getAttribute("data-node-id")
            }, (response) => {
                rename({
                    notebookId,
                    path: pathString,
                    name: response.data.ial.title,
                    empty: isTitleEmptyAttr(response.data.ial),
                    type: "file",
                });
            });
        } else {
            rename({
                notebookId,
                path: pathString,
                name: getNotebookName(notebookId),
                type: "notebook",
            });
        }
        event.preventDefault();
        return true;
    }

    if (matchHotKey("⌘/", event)) {
        const liRect = liElements[0].getBoundingClientRect();
        if (isFile) {
            initFileMenu(app, notebookId, pathString, liElements[0]).popup({
                x: liRect.right - 15,
                y: liRect.top + 15
            });
        } else {
            initNavigationMenu(app, liElements[0] as HTMLElement).popup({x: liRect.right - 15, y: liRect.top + 15});
        }
        return true;
    }

    if (!event.repeat && matchHotKey(window.sourceflow.config.keymap.editor.general.duplicate.custom, event)) {
        event.preventDefault();
        event.stopPropagation();
        ids.forEach(item => {
            fetchPost("/api/filetree/duplicateDoc", {
                id: item,
            });
        });
        return true;
    }

    if (!event.repeat && matchHotKey(window.sourceflow.config.keymap.editor.general.copyBlockRef.custom, event)) {
        event.preventDefault();
        event.stopPropagation();
        copyTextByType(ids, "ref");
        return true;
    }

    if (!event.repeat && matchHotKey(window.sourceflow.config.keymap.editor.general.copyBlockEmbed.custom, event)) {
        event.preventDefault();
        event.stopPropagation();
        copyTextByType(ids, "blockEmbed");
        return true;
    }

    if (!event.repeat && matchHotKey(window.sourceflow.config.keymap.editor.general.copyProtocol.custom, event)) {
        event.preventDefault();
        event.stopPropagation();
        copyTextByType(ids, "protocol");
        return true;
    }

    if (!event.repeat && matchHotKey(window.sourceflow.config.keymap.editor.general.copyProtocolInMd.custom, event)) {
        event.preventDefault();
        event.stopPropagation();
        copyTextByType(ids, "protocolMd");
        return true;
    }
    if (!event.repeat && matchHotKey(window.sourceflow.config.keymap.editor.general.copyHPath.custom, event)) {
        event.preventDefault();
        event.stopPropagation();
        copyTextByType(ids, "hPath");
        return true;
    }
    if (!event.repeat && matchHotKey(window.sourceflow.config.keymap.editor.general.copyID.custom, event)) {
        event.preventDefault();
        event.stopPropagation();
        copyTextByType(ids, "id");
        return true;
    }

    if (isFile && matchHotKey(window.sourceflow.config.keymap.general.move.custom, event)) {
        window.sourceflow.menus.menu.remove();
        runExecByCommand({
            command: "move",
            app,
            fileLiElements: liElements
        });
        event.preventDefault();
        return true;
    }

    if (isFile && matchHotKey(window.sourceflow.config.keymap.editor.general.insertRight.custom, event)) {
        window.sourceflow.menus.menu.remove();
        openFileById({
            app,
            id: liElements[0].getAttribute("data-node-id"),
            action: [Constants.CB_GET_FOCUS],
            position: "right",
        });
        event.preventDefault();
        return true;
    }

    if (matchHotKey(window.sourceflow.config.keymap.general.replace.custom, event)) {
        window.sourceflow.menus.menu.remove();
        runExecByCommand({
            command: "replace",
            app,
            fileLiElements: liElements,
        });
        event.preventDefault();
        return true;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.search.custom, event)) {
        window.sourceflow.menus.menu.remove();
        runExecByCommand({
            command: "search",
            app,
            fileLiElements: liElements,
        });
        event.preventDefault();
        return true;
    }
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA"].includes(target.tagName) ||
        hasClosestByAttribute(target, "contenteditable", null) ||
        hasClosestByClassName(target, "protyle", true)) {
        return false;
    }
    if (event.shiftKey) {
        if (event.key === "ArrowUp") {
            const startEndElement = getStartEndElement(liElements);
            let previousElement: Element;
            if (startEndElement.startElement.getBoundingClientRect().top >= startEndElement.endElement.getBoundingClientRect().top) {
                previousElement = getPreviousFileLi(startEndElement.endElement) as Element;
                if (previousElement) {
                    previousElement.classList.add("b3-list-item--focus");
                    previousElement.setAttribute("select-end", "true");
                    startEndElement.endElement.removeAttribute("select-end");
                }
            } else {
                startEndElement.endElement.classList.remove("b3-list-item--focus");
                startEndElement.endElement.removeAttribute("select-end");
                previousElement = getPreviousFileLi(startEndElement.endElement) as Element;
                if (previousElement) {
                    previousElement.setAttribute("select-end", "true");
                }
            }
            if (previousElement) {
                const previousRect = previousElement.getBoundingClientRect();
                const fileRect = files.element.getBoundingClientRect();
                if (previousRect.top < fileRect.top || previousRect.bottom > fileRect.bottom) {
                    previousElement.scrollIntoView(previousRect.top < fileRect.top);
                }
            }
        } else if (event.key === "ArrowDown") {
            const startEndElement = getStartEndElement(liElements);
            let nextElement: Element;
            if (startEndElement.startElement.getBoundingClientRect().top <= startEndElement.endElement.getBoundingClientRect().top) {
                nextElement = getNextFileLi(startEndElement.endElement) as Element;
                if (nextElement) {
                    nextElement.classList.add("b3-list-item--focus");
                    nextElement.setAttribute("select-end", "true");
                    startEndElement.endElement.removeAttribute("select-end");
                }
            } else {
                startEndElement.endElement.classList.remove("b3-list-item--focus");
                startEndElement.endElement.removeAttribute("select-end");
                nextElement = getNextFileLi(startEndElement.endElement) as Element;
                if (nextElement) {
                    nextElement.setAttribute("select-end", "true");
                }
            }
            if (nextElement) {
                const nextRect = nextElement.getBoundingClientRect();
                const fileRect = files.element.getBoundingClientRect();
                if (nextRect.top < fileRect.top || nextRect.bottom > fileRect.bottom) {
                    nextElement.scrollIntoView(nextRect.top < fileRect.top);
                }
            }
        }
        return;
    } else if (isNotCtrl(event)) {
        files.element.querySelector('[select-end="true"]')?.removeAttribute("select-end");
        files.element.querySelector('[select-start="true"]')?.removeAttribute("select-start");
        if ((event.key === "ArrowRight" && !liElements[0].querySelector(".b3-list-item__arrow--open") && !liElements[0].querySelector(".b3-list-item__toggle").classList.contains("fn__hidden")) ||
            (event.key === "ArrowLeft" && liElements[0].querySelector(".b3-list-item__arrow--open"))) {
            files.getLeaf(liElements[0], notebookId);
            liElements.forEach((item, index) => {
                if (index !== 0) {
                    item.classList.remove("b3-list-item--focus");
                }
            });
            event.preventDefault();
            return true;
        }
        if (event.key === "ArrowLeft") {
            let parentElement = liElements[0].parentElement.previousElementSibling;
            if (parentElement) {
                if (parentElement.tagName !== "LI") {
                    parentElement = files.element.querySelector(".b3-list-item");
                }
                liElements.forEach((item) => {
                    item.classList.remove("b3-list-item--focus");
                });
                parentElement.classList.add("b3-list-item--focus");
                files.lastSelectedElement = parentElement;
                const parentRect = parentElement.getBoundingClientRect();
                const fileRect = files.element.getBoundingClientRect();
                if (parentRect.top < fileRect.top || parentRect.bottom > fileRect.bottom) {
                    parentElement.scrollIntoView(parentRect.top < fileRect.top);
                }
            }
            event.preventDefault();
            return true;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowRight") {
            let nextElement = liElements[0];
            while (nextElement) {
                if (nextElement.nextElementSibling) {
                    if (nextElement.nextElementSibling.tagName === "UL") {
                        nextElement = nextElement.nextElementSibling.firstElementChild;
                    } else {
                        nextElement = nextElement.nextElementSibling;
                    }
                    break;
                } else {
                    if (nextElement.parentElement.classList.contains("fn__flex-1")) {
                        break;
                    } else {
                        nextElement = nextElement.parentElement;
                    }
                }
            }
            if (nextElement.classList.contains("b3-list-item")) {
                liElements.forEach((item) => {
                    item.classList.remove("b3-list-item--focus");
                });
                nextElement.classList.add("b3-list-item--focus");
                files.lastSelectedElement = nextElement;
                const nextRect = nextElement.getBoundingClientRect();
                const fileRect = files.element.getBoundingClientRect();
                if (nextRect.top < fileRect.top || nextRect.bottom > fileRect.bottom) {
                    nextElement.scrollIntoView(nextRect.top < fileRect.top);
                }
            }
            event.preventDefault();
            return true;
        }
        if (event.key === "ArrowUp") {
            let previousElement = liElements[0];
            while (previousElement) {
                if (previousElement.previousElementSibling) {
                    if (previousElement.previousElementSibling.tagName === "LI") {
                        previousElement = previousElement.previousElementSibling;
                    } else {
                        const liElements = previousElement.previousElementSibling.querySelectorAll(".b3-list-item");
                        previousElement = liElements[liElements.length - 1];
                    }
                    break;
                } else {
                    if (previousElement.parentElement.classList.contains("fn__flex-1")) {
                        break;
                    } else {
                        previousElement = previousElement.parentElement;
                    }
                }
            }
            if (previousElement.classList.contains("b3-list-item")) {
                liElements.forEach((item) => {
                    item.classList.remove("b3-list-item--focus");
                });
                previousElement.classList.add("b3-list-item--focus");
                files.lastSelectedElement = previousElement;
                const previousRect = previousElement.getBoundingClientRect();
                const fileRect = files.element.getBoundingClientRect();
                if (previousRect.top < fileRect.top || previousRect.bottom > fileRect.bottom) {
                    previousElement.scrollIntoView(previousRect.top < fileRect.top);
                }
            }
            event.preventDefault();
            return true;
        }
    }
    if (event.key === "Delete" || (event.key === "Backspace" && isMac())) {
        window.sourceflow.menus.menu.remove();
        if (document.querySelector(`.b3-dialog--open[data-key="${Constants.DIALOG_CONFIRM}"]`)) {
            return;
        }
        deleteFiles(liElements);
        return true;
    }
    if (event.key === "Enter") {
        window.sourceflow.menus.menu.remove();
        liElements.forEach(item => {
            if (item.getAttribute("data-type") === "navigation-file") {
                openFileById({app, id: item.getAttribute("data-node-id"), action: [Constants.CB_GET_FOCUS]});
            } else {
                const itemTopULElement = hasTopClosestByTag(item, "UL");
                if (itemTopULElement) {
                    files.getLeaf(item, itemTopULElement.getAttribute("data-url"));
                }
            }
        });
        return true;
    }
};
