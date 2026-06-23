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

export const editKeydown = (app: App, event: KeyboardEvent) => {
    let protyle: IProtyle;
    let range: Range;
    if (getSelection().rangeCount > 0) {
        range = getSelection().getRangeAt(0);
    }
    const activePanelElement = document.querySelector(".layout__tab--active");
    let isFileFocus = false;
    if (activePanelElement && activePanelElement.classList.contains("sf__file")) {
        isFileFocus = true;
    }
    if (range) {
        window.sourceflow.dialogs.find(item => {
            if (item.editors) {
                Object.keys(item.editors).find(key => {
                    if (item.editors[key].protyle.element.contains(range.startContainer)) {
                        protyle = item.editors[key].protyle;
                        // https://github.com/lonelyor/SourceFlow/issues/9384
                        isFileFocus = false;
                        return true;
                    }
                });
                if (protyle) {
                    return true;
                }
            }
        });
    }
    const activeTab = getActiveTab();
    if (!protyle && activeTab) {
        if (activeTab.model instanceof Editor) {
            protyle = activeTab.model.editor.protyle;
        } else if (activeTab.model instanceof Search) {
            if (activeTab.model.element.querySelector("#searchUnRefPanel").classList.contains("fn__none")) {
                protyle = activeTab.model.editors.edit.protyle;
            } else {
                protyle = activeTab.model.editors.unRefEdit.protyle;
            }
        } else if (activeTab.model instanceof Custom && activeTab.model.editors?.length > 0) {
            if (range) {
                activeTab.model.editors.find(item => {
                    if (item.protyle.element.contains(range.startContainer)) {
                        protyle = item.protyle;
                        return true;
                    }
                });
            }
        }
        if (!protyle) {
            return;
        }
    } else if (!protyle) {
        if (!protyle && range) {
            window.sourceflow.blockPanels.find(item => {
                item.editors.find(editorItem => {
                    if (editorItem.protyle.element.contains(range.startContainer)) {
                        protyle = editorItem.protyle;
                        return true;
                    }
                });
                if (protyle) {
                    return true;
                }
            });
        }
        const models = getAllModels();
        if (!protyle) {
            models.backlink.find(item => {
                if (item.element.classList.contains("layout__tab--active")) {
                    if (range) {
                        item.editors.find(editor => {
                            if (editor.protyle.element.contains(range.startContainer)) {
                                protyle = editor.protyle;
                                return true;
                            }
                        });
                    }
                    if (!protyle && item.editors.length > 0) {
                        protyle = item.editors[0].protyle;
                    }
                    return true;
                }
            });
        }
        if (!protyle) {
            models.editor.find(item => {
                if (item.parent.headElement.classList.contains("item--focus")) {
                    protyle = item.editor.protyle;
                    return true;
                }
            });
        }
        if (!protyle) {
            return false;
        }
    }
    if (!isFileFocus && matchHotKey(window.sourceflow.config.keymap.general.replace.custom, event)) {
        runExecByCommand({
            command: "replace",
            app,
            protyle,
            previousRange: range
        });
        event.preventDefault();
        return true;
    }
    if (!isFileFocus && matchHotKey(window.sourceflow.config.keymap.general.search.custom, event)) {
        runExecByCommand({
            command: "search",
            app,
            protyle,
            previousRange: range
        });
        event.preventDefault();
        return true;
    }
    if (!isFileFocus && matchHotKey(window.sourceflow.config.keymap.editor.general.quickMakeCard.custom, event) && !window.sourceflow.config.readonly) {
        if (protyle.title?.editElement.contains(range.startContainer)) {
            quickMakeCard(protyle, [protyle.title.element]);
        } else {
            const selectElement: Element[] = [];
            protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select").forEach(item => {
                selectElement.push(item);
            });
            if (selectElement.length === 0) {
                const nodeElement = hasClosestBlock(range.startContainer);
                if (nodeElement) {
                    selectElement.push(nodeElement);
                }
            }
            quickMakeCard(protyle, selectElement);
        }
        event.preventDefault();
        return true;
    }
    if (!isFileFocus && matchHotKey(window.sourceflow.config.keymap.general.addToDatabase.custom, event)) {
        runExecByCommand({
            command: "addToDatabase",
            app,
            protyle,
            previousRange: range
        });
        event.preventDefault();
        return true;
    }
    if (!isFileFocus && matchHotKey(window.sourceflow.config.keymap.editor.general.spaceRepetition.custom, event) && !window.sourceflow.config.readonly) {
        fetchPost("/api/riff/getTreeRiffDueCards", {rootID: protyle.block.rootID}, (response) => {
            openCardByData(app, response.data, "doc", protyle.block.rootID, protyle.title?.editElement.textContent || window.sourceflow.languages.untitled);
        });
        event.preventDefault();
        return true;
    }
    if (!isFileFocus && matchHotKey(window.sourceflow.config.keymap.general.move.custom, event)) {
        runExecByCommand({
            command: "move",
            app,
            protyle,
            previousRange: range
        });
        event.preventDefault();
        return true;
    }

    if (!isFileFocus && !event.repeat && !protyle.disabled &&
        matchHotKey(window.sourceflow.config.keymap.editor.general.duplicate.custom, event)) {
        event.preventDefault();
        event.stopPropagation();
        let selectsElement: HTMLElement[] = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
        if (selectsElement.length === 0) {
            const nodeElement = hasClosestBlock(range.startContainer);
            if (nodeElement) {
                selectsElement = [nodeElement];
            }
        }
        duplicateBlock(selectsElement, protyle);
        return true;
    }

    const target = event.target as HTMLElement;
    if (target.tagName !== "TABLE" && ["INPUT", "TEXTAREA"].includes(target.tagName)) {
        return false;
    }
    // ctrl+home 光标移动到顶
    if (!event.altKey && !event.shiftKey && isOnlyMeta(event) && event.key === "Home") {
        goHome(protyle);
        hideElements(["select"], protyle);
        event.stopPropagation();
        event.preventDefault();
        return;
    }
    // ctrl+end 光标移动到尾
    if (!event.altKey && !event.shiftKey && isOnlyMeta(event) && event.key === "End") {
        goEnd(protyle);
        hideElements(["select"], protyle);
        event.stopPropagation();
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.editor.general.exitFocus.custom, event)) {
        event.preventDefault();
        zoomOut({protyle, id: protyle.block.rootID, focusId: protyle.block.id});
        return true;
    }
    if (matchHotKey(window.sourceflow.config.keymap.editor.general.switchReadonly.custom, event)) {
        event.preventDefault();
        onlyProtyleCommand({
            protyle,
            command: "switchReadonly",
            previousRange: range,
        });
        return true;
    }
    if (matchHotKey(window.sourceflow.config.keymap.editor.general.switchAdjust.custom, event)) {
        event.preventDefault();
        onlyProtyleCommand({
            protyle,
            command: "switchAdjust",
            previousRange: range,
        });
        return true;
    }

    if (matchHotKey(window.sourceflow.config.keymap.editor.general.backlinks.custom, event)) {
        event.preventDefault();
        if (range) {
            const refElement = hasClosestByAttribute(range.startContainer, "data-type", "block-ref");
            if (refElement) {
                openBacklink({
                    app: protyle.app,
                    blockId: refElement.dataset.id,
                });
                return true;
            }
        }
        openBacklink({
            app: protyle.app,
            blockId: protyle.block.id,
            rootId: protyle.block.rootID,
            useBlockId: protyle.block.showAll,
            title: protyle.title ? (protyle.title.editElement.textContent || window.sourceflow.languages.untitled) : null,
        });
        return true;
    }
    if (matchHotKey(window.sourceflow.config.keymap.editor.general.graphView.custom, event)) {
        event.preventDefault();
        if (range) {
            const refElement = hasClosestByAttribute(range.startContainer, "data-type", "block-ref");
            if (refElement) {
                openGraph({
                    app: protyle.app,
                    blockId: refElement.dataset.id,
                });
                return true;
            }
        }
        openGraph({
            app: protyle.app,
            blockId: protyle.block.id,
            rootId: protyle.block.rootID,
            useBlockId: protyle.block.showAll,
            title: protyle.title ? (protyle.title.editElement.textContent || window.sourceflow.languages.untitled) : null,
        });
        return true;
    }
    if (matchHotKey(window.sourceflow.config.keymap.editor.general.outline.custom, event)) {
        event.preventDefault();
        const offset = getSelectionOffset(target);
        openOutline({
            app,
            rootId: protyle.block.rootID,
            title: protyle.options.render.title ? (protyle.title.editElement.textContent || window.sourceflow.languages.untitled) : "",
            isPreview: !protyle.preview.element.classList.contains("fn__none")
        });
        // switchWnd 后，range会被清空，需要重新设置
        focusByOffset(target, offset.start, offset.end);
        return true;
    }
    if (matchHotKey(window.sourceflow.config.keymap.editor.general.copyPlainText.custom, event)) {
        const nodeElement = hasClosestBlock(range.startContainer);
        if (!nodeElement) {
            return false;
        }
        if (range.toString() === "") {
            const selectsElement: HTMLElement[] = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
            let html = "";
            if (selectsElement.length === 0) {
                selectsElement.push(nodeElement);
            }
            selectsElement.forEach(item => {
                html += getPlainText(item) + "\n";
            });
            copyPlainText(html.trimEnd());
        } else {
            copyPlainText(range.toString());
        }
        event.preventDefault();
        return true;
    }
    if (matchHotKey(window.sourceflow.config.keymap.editor.general.duplicateCompletely.custom, event)) {
        const nodeElement = hasClosestBlock(range.startContainer);
        if (!nodeElement || !nodeElement.classList.contains("av")) {
            return false;
        }
        duplicateCompletely(protyle, nodeElement);
        event.preventDefault();
        return true;
    }
    if (matchHotKey(window.sourceflow.config.keymap.editor.general.refresh.custom, event)) {
        reloadProtyle(protyle, true);
        event.preventDefault();
        return true;
    }
    if (matchHotKey(window.sourceflow.config.keymap.editor.general.fullscreen.custom, event)) {
        if (isZenModeActive()) {
            exitZenMode();
        } else {
            fullscreen(protyle.element);
            resize(protyle);
        }
        event.preventDefault();
        return true;
    }
    if (matchHotKey(window.sourceflow.config.keymap.editor.general.preview.custom, event)) {
        setEditMode(protyle, "preview");
        saveLayout();
        event.preventDefault();
        return true;
    }
    if (matchHotKey(window.sourceflow.config.keymap.editor.general.wysiwyg.custom, event) && !protyle.options.backlinkData) {
        setEditMode(protyle, "wysiwyg");
        reloadProtyle(protyle, true);
        saveLayout();
        event.preventDefault();
        return true;
    }
    if (range && !isFileFocus && matchHotKey(window.sourceflow.config.keymap.editor.general.copyBlockRef.custom, event)) {
        event.preventDefault();
        event.stopPropagation();
        if (hasClosestByClassName(range.startContainer, "protyle-title")) {
            copyTextByType([protyle.block.rootID], "ref");
        } else {
            const nodeElement = hasClosestBlock(range.startContainer);
            if (!nodeElement) {
                return false;
            }
            const selectImgElement = nodeElement.querySelector(".img--select");
            if (selectImgElement) {
                copyPNGByLink(selectImgElement.querySelector("img").getAttribute("src"));
                return true;
            }
            const ids = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select")).map(item => item.getAttribute("data-node-id"));
            if (ids.length > 0) {
                copyTextByType(ids, "ref");
                return true;
            }
            if (range.toString() !== "") {
                getContentByInlineHTML(range, (content) => {
                    writeText(`((${nodeElement.getAttribute("data-node-id")} "${content.trim()}"))`);
                });
            } else {
                copyTextByType([nodeElement.getAttribute("data-node-id")], "ref");
            }
        }
        return true;
    }
    if (hasClosestByClassName(target, "protyle-title__input")) {
        return false;
    }
    // 没有光标时，无法撤销
    if (matchHotKey(window.sourceflow.config.keymap.editor.general.undo.custom, event)) {
        protyle.undo.undo(protyle);
        event.preventDefault();
        return true;
    }
    if (matchHotKey(window.sourceflow.config.keymap.editor.general.redo.custom, event)) {
        protyle.undo.redo(protyle);
        event.preventDefault();
        return true;
    }
    return false;
};
