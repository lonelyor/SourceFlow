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

type TDeferredExecByCommandOptions = {
    command: string,
    app?: App,
    previousRange?: Range,
    protyle?: IProtyle,
    fileLiElements?: Element[]
};

import {editKeydown} from "./keydownEdit";
import {fileTreeKeydown} from "./keydownFileTree";
import {panelTreeKeydown} from "./keydownPanelTree";

const loadCommandPanelModule = () => import("./command/panel");

const runCommandPanel = (app: App) => {
    void loadCommandPanelModule().then(({commandPanel}) => {
        commandPanel(app);
    });
};

export const runExecByCommand = (options: TDeferredExecByCommandOptions) => {
    void loadCommandPanelModule().then(({execByCommand}) => {
        execByCommand(options);
    });
};

const switchDialogEvent = (app: App, event: MouseEvent) => {
    event.preventDefault();
    let target = event.target as HTMLElement;
    while (target !== switchDialog.element) {
        if (target.classList.contains("b3-list-item")) {
            const currentType = target.getAttribute("data-type");
            if (currentType) {
                if (currentType === "riffCard") {
                    openCard(app);
                } else {
                    getDockByType(currentType).toggleModel(currentType, true);
                }
            } else {
                const currentId = target.getAttribute("data-id");
                getAllTabs().find(item => {
                    if (item.id === currentId) {
                        item.parent.switchTab(item.headElement);
                        item.parent.showHeading();
                        return true;
                    }
                });
            }
            switchDialog.destroy();
            switchDialog = undefined;
            break;
        }
        target = target.parentElement;
    }
};

const dialogArrow = (app: App, element: HTMLElement, event: KeyboardEvent) => {
    let currentLiElement = element.querySelector(".b3-list-item--focus");
    if (currentLiElement) {
        currentLiElement.classList.remove("b3-list-item--focus");
        if (event.key === "ArrowUp") {
            if (currentLiElement.previousElementSibling) {
                currentLiElement.previousElementSibling.classList.add("b3-list-item--focus");
            } else {
                currentLiElement.parentElement.lastElementChild.classList.add("b3-list-item--focus");
            }
        } else if (event.key === "ArrowDown") {
            if (currentLiElement.nextElementSibling) {
                currentLiElement.nextElementSibling.classList.add("b3-list-item--focus");
            } else {
                currentLiElement.parentElement.firstElementChild.classList.add("b3-list-item--focus");
            }
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            const sideElement = currentLiElement.parentElement.previousElementSibling || currentLiElement.parentElement.nextElementSibling;
            if (sideElement) {
                const tempLiElement = sideElement.querySelector(`[data-index="${currentLiElement.getAttribute("data-index")}"]`) || sideElement.lastElementChild;
                if (tempLiElement) {
                    tempLiElement.classList.add("b3-list-item--focus");
                } else {
                    currentLiElement.classList.add("b3-list-item--focus");
                }
            } else {
                currentLiElement.classList.add("b3-list-item--focus");
            }
        } else if (event.key === "Enter") {
            const currentType = currentLiElement.getAttribute("data-type");
            if (currentType) {
                if (currentType === "riffCard") {
                    openCard(app);
                } else {
                    getDockByType(currentType).toggleModel(currentType, true);
                }
            } else {
                openFileById({
                    app,
                    id: currentLiElement.getAttribute("data-node-id"),
                    action: [Constants.CB_GET_FOCUS, Constants.CB_GET_SCROLL]
                });
            }
            hideElements(["dialog"]);
            return;
        }
        currentLiElement = element.querySelector(".b3-list-item--focus");
        const rootId = currentLiElement.getAttribute("data-node-id");
        const pathElement = element.querySelector(".switch-doc__path");
        if (rootId) {
            fetchPost("/api/filetree/getFullHPathByID", {
                id: rootId
            }, (response) => {
                pathElement.innerHTML = escapeHtml(response.data);
            });
        } else {
            pathElement.innerHTML = currentLiElement.querySelector(".b3-list-item__text").innerHTML;
        }
        const currentRect = currentLiElement.getBoundingClientRect();
        const currentParentRect = currentLiElement.parentElement.getBoundingClientRect();
        if (currentRect.top < currentParentRect.top) {
            currentLiElement.scrollIntoView(true);
        } else if (currentRect.bottom > currentParentRect.bottom) {
            currentLiElement.scrollIntoView(false);
        }
    }
};

let switchDialog: Dialog;
export const windowKeyDown = (app: App, event: KeyboardEvent) => {
    if (filterHotkey(event, app)) {
        return;
    }
    if (switchDialog &&
        (matchAuxiliaryHotKey(window.sourceflow.config.keymap.general.goToEditTabNext.custom, event) ||
            matchAuxiliaryHotKey(window.sourceflow.config.keymap.general.goToEditTabPrev.custom, event))
        && event.key.startsWith("Arrow")) {
        dialogArrow(app, switchDialog.element, event);
        return;
    }

    if (searchKeydown(app, event)) {
        event.preventDefault();
        event.stopPropagation();
        return;
    }

    const isTabWindow = isWindow();
    if (matchHotKey(window.sourceflow.config.keymap.general.goToEditTabNext.custom, event) ||
        matchHotKey(window.sourceflow.config.keymap.general.goToEditTabPrev.custom, event)) {
        if (switchDialog && switchDialog.element.parentElement) {
            return;
        }
        let tabHtml = "";
        let currentTabElement = document.querySelector(".layout__wnd--active ul.layout-tab-bar > .item--focus");
        if (!currentTabElement) {
            currentTabElement = document.querySelector("ul.layout-tab-bar > .item--focus");
        }
        if (currentTabElement) {
            const currentId = currentTabElement.getAttribute("data-id");
            getAllTabs().sort((itemA, itemB) => {
                return itemA.headElement.getAttribute("data-activetime") > itemB.headElement.getAttribute("data-activetime") ? -1 : 1;
            }).forEach((item, index) => {
                let icon = `<svg class="b3-list-item__graphic"><use xlink:href="#${item.icon}"></use></svg>`;
                let rootId = "";
                const initData = item.headElement.getAttribute("data-initdata");
                if (item.model instanceof Editor) {
                    rootId = ` data-node-id="${item.model.editor.protyle.block.rootID}"`;
                    icon = unicode2Emoji(item.docIcon || window.sourceflow.storage[Constants.LOCAL_IMAGES].file, "b3-list-item__graphic", true);
                } else if (initData) {
                    const initDataObj = JSON.parse(initData);
                    if (initDataObj.instance === "Editor") {
                        rootId = ` data-node-id="${initDataObj.rootId}"`;
                        icon = unicode2Emoji(item.docIcon || window.sourceflow.storage[Constants.LOCAL_IMAGES].file, "b3-list-item__graphic", true);
                    }
                }
                tabHtml += `<li data-index="${index}" data-id="${item.id}"${rootId} class="b3-list-item${currentId === item.id ? " b3-list-item--focus" : ""}"${currentId === item.id ? ' data-original="true"' : ""}>${icon}<span class="b3-list-item__text">${escapeHtml(item.title)}</span></li>`;
            });
        }
        let dockHtml = "";
        if (!isTabWindow) {
            dockHtml = `<ul class="b3-list b3-list--background" style="overflow: auto;width: 200px;">
<li data-type="riffCard" data-index="0" class="b3-list-item${!tabHtml ? " b3-list-item--focus" : ""}">
    <svg class="b3-list-item__graphic"><use xlink:href="#iconRiffCard"></use></svg>
    <span class="b3-list-item__text">${window.sourceflow.languages.riffCard}</span>
    <span class="b3-list-item__meta">${updateHotkeyTip(window.sourceflow.config.keymap.general.riffCard.custom)}</span>
</li>`;
            getAllDocks().forEach((item, index) => {
                dockHtml += `<li data-type="${item.type}" data-index="${index + 1}" class="b3-list-item">
    <svg class="b3-list-item__graphic"><use xlink:href="#${item.icon}"></use></svg>
    <span class="b3-list-item__text">${item.title}</span>
    <span class="b3-list-item__meta">${updateHotkeyTip(item.hotkey || "")}</span>
</li>`;
            });
            dockHtml = dockHtml + "</ul>";
        }
        hideElements(["dialog"]);
        switchDialog = new Dialog({
            positionId: Constants.DIALOG_SWITCHTAB,
            title: window.sourceflow.languages.switchTab,
            content: `<div class="fn__flex-column switch-doc">
    <input style="opacity: 0;height: 0.1px;box-sizing: border-box;margin: 0;padding: 0;border: 0;">
    <div class="fn__flex" style="overflow:auto;">${dockHtml}
        <ul${!isTabWindow ? "" : ' style="border-left:0"'} class="b3-list b3-list--background fn__flex-1">${tabHtml}</ul>
    </div>
    <div class="switch-doc__path"></div>
</div>`,
        });
        switchDialog.element.setAttribute("data-key", Constants.DIALOG_SWITCHTAB);
        // 需移走光标，否则编辑器会继续监听并执行按键操作
        switchDialog.element.querySelector("input").focus();
        if (isMac()) {
            switchDialog.element.addEventListener("contextmenu", (event) => {
                switchDialogEvent(app, event);
            });
        }
        switchDialog.element.addEventListener("click", (event) => {
            switchDialogEvent(app, event);
        });
        return;
    }

    if (isNotCtrl(event) && !event.shiftKey && !event.altKey &&
        (event.key.startsWith("Arrow") || event.key === "Enter")) {
        const openRecentDocsDialog = window.sourceflow.dialogs.find(item => {
            if (item.element.getAttribute("data-key") === Constants.DIALOG_RECENTDOCS) {
                return true;
            }
        });
        if (openRecentDocsDialog) {
            event.preventDefault();
            dialogArrow(app, openRecentDocsDialog.element, event);
            return;
        }
    }

    if (matchHotKey(window.sourceflow.config.keymap.general.recentDocs.custom, event)) {
        openRecentDocs();
        event.preventDefault();
        return;
    }

    if (bindMenuKeydown(event)) {
        event.preventDefault();
        return;
    }

    if (bindAVPanelKeydown(event)) {
        event.preventDefault();
        return;
    }

    if (["Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) {
        let matchDialog: Dialog;
        // 需找到最顶层的，因此不能用 find
        window.sourceflow.dialogs.forEach(item => {
            if ([Constants.DIALOG_VIEWCARDS, Constants.DIALOG_HISTORYCOMPARE].includes(item.element.getAttribute("data-key"))) {
                matchDialog = item;
            }
        });
        if (matchDialog) {
            if (matchDialog.element.getAttribute("data-key") === Constants.DIALOG_VIEWCARDS) {
                matchDialog.element.dispatchEvent(new CustomEvent("click", {detail: event.key.toLowerCase()}));
            } else if (matchDialog.element.getAttribute("data-key") === Constants.DIALOG_HISTORYCOMPARE) {
                historyKeydown(event, matchDialog);
            }
            event.preventDefault();
            return;
        }
    }

    const target = event.target as HTMLElement;
    /// #if !BROWSER
    if (matchHotKey("⌘=", event) && !hasClosestByClassName(target, "pdf__outer")) {
        setZoom("zoomIn");
        event.preventDefault();
        return;
    }
    if (matchHotKey("⌘0", event)) {
        setZoom("restore");
        event.preventDefault();
        return;
    }
    if (matchHotKey("⌘-", event) && !hasClosestByClassName(target, "pdf__outer")) {
        setZoom("zoomOut");
        event.preventDefault();
        return;
    }
    /// #endif

    if (!isTabWindow && matchHotKey(window.sourceflow.config.keymap.general.syncNow.custom, event)) {
        event.preventDefault();
        syncGuide(app);
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.commandPanel.custom, event)) {
        event.preventDefault();
        runCommandPanel(app);
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.editReadonly.custom, event)) {
        event.preventDefault();
        setReadOnly(!window.sourceflow.config.editor.readOnly);
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.lockScreen.custom, event)) {
        lockScreen(app);
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.dataHistory.custom, event)) {
        openHistory(app);
        event.preventDefault();
        return;
    }
    if (!isTabWindow && matchHotKey(window.sourceflow.config.keymap.general.toggleDock.custom, event)) {
        toggleDockBar(document.querySelector("#barDock use"));
        event.preventDefault();
        return;
    }
    if (!isTabWindow && !window.sourceflow.config.readonly && matchHotKey(window.sourceflow.config.keymap.general.config.custom, event)) {
        openSetting(app);
        event.preventDefault();
        return;
    }
    if (matchHotKey("⌘A", event) && !["INPUT", "TEXTAREA"].includes(target.tagName)) {
        event.preventDefault();
        return;
    }
    const matchDock = getAllDocks().find(item => {
        if (matchHotKey(item.hotkey, event)) {
            getDockByType(item.type).toggleModel(item.type);
            event.preventDefault();
            return true;
        }
    });
    if (matchDock) {
        return;
    }
    if (!isTabWindow && matchHotKey(window.sourceflow.config.keymap.general.riffCard.custom, event)) {
        openCard(app);
        if (document.activeElement) {
            (document.activeElement as HTMLElement).blur();
        }
        event.preventDefault();
        return;
    }
    if (!isTabWindow && matchHotKey(window.sourceflow.config.keymap.general.dailyNote.custom, event)) {
        newDailyNote(app);
        event.stopPropagation();
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.newFile.custom, event)) {
        newFile({
            app,
            useSavePath: true
        });
        event.preventDefault();
        return;
    }
    // https://github.com/lonelyor/SourceFlow/issues/8913#issuecomment-1679720605
    const confirmDialogElement = document.querySelector('.b3-dialog--open[data-key="dialog-confirm"]');
    if (confirmDialogElement) {
        if (event.key === "Enter") {
            confirmDialogElement.dispatchEvent(new CustomEvent("click", {detail: event.key}));
            event.preventDefault();
            return;
        } else if (event.key === "Escape") {
            confirmDialogElement.dispatchEvent(new CustomEvent("click", {detail: event.key}));
            event.preventDefault();
            return;
        }
    }

    if (event.key === "Escape" && !event.isComposing) {
        if (exitZenMode()) {
            event.preventDefault();
            return;
        }
        cancelDrag();
        const imgPreviewElement = document.querySelector(".protyle-img");
        if (imgPreviewElement) {
            imgPreviewElement.remove();
            return;
        }

        if (!window.sourceflow.menus.menu.element.classList.contains("fn__none")) {
            if (window.sourceflow.dialogs.length > 0 &&
                window.sourceflow.menus.menu.element.style.zIndex < (window.sourceflow.dialogs[0].element.querySelector(".b3-dialog") as HTMLElement).style.zIndex) {
                // 窗口高于菜单时，先关闭窗口，如 av 修改列 icon 时
            } else {
                window.sourceflow.menus.menu.remove(true);
                return;
            }
        }

        // 需放在 menus 后，否则资源列中添加资源会先关闭菜单
        // 需放在 dialog 前，否则属性面板中修改日期会先关闭 dialog，只剩修改界面
        const avElement = document.querySelector(".av__panel");
        if (avElement) {
            const selectCellElement = document.querySelector(".av__cell--select");
            if (selectCellElement) {
                focusBlock(hasClosestBlock(selectCellElement) as HTMLElement);
            }
            avElement.remove();
            return;
        }

        // 闪卡长按 Esc 光标定位到闪卡按钮上 https://github.com/lonelyor/SourceFlow/issues/12989
        // https://github.com/lonelyor/SourceFlow/issues/14730
        if (event.repeat && document.activeElement && hasClosestByClassName(document.activeElement, "card__action")) {
            return;
        }

        if (window.sourceflow.dialogs.length > 0) {
            window.sourceflow.dialogs[window.sourceflow.dialogs.length - 1].destroy();
            return;
        }

        // remove blockpopover
        const maxEditLevels: { [key: string]: number } = {oid: 0};
        window.sourceflow.blockPanels.forEach((item) => {
            if ((item.targetElement || typeof item.x === "number") && item.element.getAttribute("data-pin") === "true") {
                const level = parseInt(item.element.getAttribute("data-level"));
                const oid = item.element.getAttribute("data-oid");
                if (maxEditLevels[oid]) {
                    if (level > maxEditLevels[oid]) {
                        maxEditLevels[oid] = level;
                    }
                } else {
                    maxEditLevels[oid] = 1;
                }
            }
        });
        let destroyBlock = false;
        for (let i = 0; i < window.sourceflow.blockPanels.length; i++) {
            const item = window.sourceflow.blockPanels[i];
            if ((item.targetElement || typeof item.x === "number") && item.element.getAttribute("data-pin") === "false") {
                item.destroy();
                destroyBlock = true;
                i--;
            }
        }
        if (destroyBlock) {
            return;
        }

        // 光标在文档树等面板中，按 Esc 回到编辑器中 https://github.com/lonelyor/SourceFlow/issues/4289
        if (getSelection().rangeCount > 0) {
            const range = getSelection().getRangeAt(0);
            if (hasClosestByClassName(range.startContainer, "protyle-content", true)) {
                focusByRange(range);
                return;
            }
        }
        const lastBackStack = window.sourceflow.backStack[window.sourceflow.backStack.length - 1];
        if (lastBackStack && lastBackStack.protyle.toolbar.range) {
            focusByRange(lastBackStack.protyle.toolbar.range);
        } else {
            const editor = getAllModels().editor[0];
            if (editor) {
                focusBlock(editor.editor.protyle.wysiwyg.element.firstElementChild);
            }
        }
        event.preventDefault();
        return;
    }

    if (!isTabWindow && matchHotKey(window.sourceflow.config.keymap.general.mainMenu.custom, event)) {
        workspaceMenu(app, document.querySelector("#barWorkspace").getBoundingClientRect());
        event.preventDefault();
        return;
    }

    if (matchHotKey(window.sourceflow.config.keymap.general.goForward.custom, event)) {
        goForward(app);
        event.preventDefault();
        return;
    }

    if (matchHotKey(window.sourceflow.config.keymap.general.goBack.custom, event)) {
        goBack(app);
        event.preventDefault();
        return;
    }

    // close tab
    if (matchHotKey(window.sourceflow.config.keymap.general.closeTab.custom, event) && !event.repeat) {
        runExecByCommand({
            command: "closeTab"
        });
        event.preventDefault();
        return;
    }

    if (matchHotKey(window.sourceflow.config.keymap.general.recentClosed.custom, event)) {
        runExecByCommand({
            command: "recentClosed",
            app
        });
        event.preventDefault();
        return;
    }

    if (matchHotKey(window.sourceflow.config.keymap.general.goToTab1.custom, event) && !event.repeat) {
        switchTabByIndex(0);
        event.preventDefault();
        return;
    }

    if (matchHotKey(window.sourceflow.config.keymap.general.goToTab2.custom, event) && !event.repeat) {
        switchTabByIndex(1);
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.goToTab3.custom, event) && !event.repeat) {
        switchTabByIndex(2);
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.goToTab4.custom, event) && !event.repeat) {
        switchTabByIndex(3);
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.goToTab5.custom, event) && !event.repeat) {
        switchTabByIndex(4);
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.goToTab6.custom, event) && !event.repeat) {
        switchTabByIndex(5);
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.goToTab7.custom, event) && !event.repeat) {
        switchTabByIndex(6);
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.goToTab8.custom, event) && !event.repeat) {
        switchTabByIndex(7);
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.goToTab9.custom, event) && !event.repeat) {
        switchTabByIndex(-1);
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.goToTabNext.custom, event) && !event.repeat) {
        switchTabByIndex(-3);
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.goToTabPrev.custom, event) && !event.repeat) {
        switchTabByIndex(-2);
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.closeOthers.custom, event) && !event.repeat) {
        runExecByCommand({
            command: "closeOthers"
        });
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.closeAll.custom, event) && !event.repeat) {
        runExecByCommand({
            command: "closeAll"
        });
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.closeUnmodified.custom, event) && !event.repeat) {
        runExecByCommand({
            command: "closeUnmodified"
        });
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.closeLeft.custom, event) && !event.repeat) {
        runExecByCommand({
            command: "closeLeft"
        });
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.closeRight.custom, event) && !event.repeat) {
        runExecByCommand({
            command: "closeRight"
        });
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.splitLR.custom, event) && !event.repeat) {
        event.preventDefault();
        globalCommand("splitLR", app);
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.splitMoveR.custom, event) && !event.repeat) {
        event.preventDefault();
        globalCommand("splitMoveR", app);
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.splitTB.custom, event) && !event.repeat) {
        event.preventDefault();
        globalCommand("splitTB", app);
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.tabToWindow.custom, event) && !event.repeat) {
        event.preventDefault();
        globalCommand("tabToWindow", app);
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.splitMoveB.custom, event) && !event.repeat) {
        event.preventDefault();
        globalCommand("splitMoveB", app);
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.stickSearch.custom, event)) {
        globalCommand("stickSearch", app);
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.unsplit.custom, event) && !event.repeat) {
        event.preventDefault();
        globalCommand("unsplit", app);
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.unsplitAll.custom, event) && !event.repeat) {
        event.preventDefault();
        globalCommand("unsplitAll", app);
        return;
    }
    if (editKeydown(app, event)) {
        return;
    }

    // 文件树的操作
    if (!isTabWindow && fileTreeKeydown(app, event)) {
        return;
    }

    // 面板的操作
    if (!isTabWindow && panelTreeKeydown(app, event)) {
        return;
    }

    let matchCommand = false;
    app.plugins.find(item => {
        item.commands.find(command => {
            if (command.callback &&
                !command.fileTreeCallback && !command.editorCallback && !command.dockCallback && !command.globalCallback
                && matchHotKey(command.customHotkey, event)) {
                matchCommand = true;
                command.callback();
                return true;
            }
        });
        if (matchCommand) {
            return true;
        }
    });
    if (matchCommand) {
        event.stopPropagation();
        event.preventDefault();
        return true;
    }

    if (matchHotKey(window.sourceflow.config.keymap.general.replace.custom, event)) {
        runExecByCommand({
            command: "replace",
            app,
        });
        event.preventDefault();
        return;
    }
    if (matchHotKey(window.sourceflow.config.keymap.general.globalSearch.custom, event)) {
        runExecByCommand({
            command: "globalSearch",
            app,
        });
        event.preventDefault();
        return;
    }
    if (!hasClosestByClassName(target, "pdf__outer") && matchHotKey(window.sourceflow.config.keymap.general.search.custom, event)) {
        runExecByCommand({
            command: "search",
            app,
        });
        event.preventDefault();
        return;
    }
    // https://github.com/lonelyor/SourceFlow/issues/445
    if (matchHotKey("⌘S", event)) {
        event.preventDefault();
        return true;
    }
};

export const sendGlobalShortcut = (app: App) => {
    /// #if !BROWSER
    const hotkeys = [window.sourceflow.config.keymap.general.toggleWin.custom];
    app.plugins.forEach(plugin => {
        plugin.commands.forEach(command => {
            if (command.globalCallback) {
                hotkeys.push(command.customHotkey);
            }
        });
    });
    ipcRenderer.send(Constants.SOURCEFLOW_HOTKEY, {
        languages: window.sourceflow.languages["_trayMenu"],
        hotkeys
    });
    /// #endif
};


export const sendUnregisterGlobalShortcut = (app: App) => {
    /// #if !BROWSER
    ipcRenderer.send(Constants.SOURCEFLOW_CMD, {
        cmd: "unregisterGlobalShortcut",
        accelerator: window.sourceflow.config.keymap.general.toggleWin.custom
    });
    app.plugins.forEach(plugin => {
        plugin.commands.forEach(command => {
            if (command.globalCallback) {
                ipcRenderer.send(Constants.SOURCEFLOW_CMD, {
                    cmd: "unregisterGlobalShortcut",
                    accelerator: command.customHotkey
                });
            }
        });
    });
    /// #endif
};
