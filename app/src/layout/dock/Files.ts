import {escapeAriaLabel, escapeGreat, escapeHtml} from "../../util/escape";
import {Tab} from "../Tab";
import {Model} from "../Model";
import {setPanelFocus} from "../util";
import {getDockByType} from "../tabUtil";
import {Constants} from "../../constants";
import {getDisplayName, pathPosix, setNoteBook} from "../../util/pathName";
import {getNewFilePath, newFile} from "../../util/newFile";
import {initFileMenu, initNavigationMenu, sortMenu} from "../../menus/navigation";
import {MenuItem} from "../../menus/Menu";
import {
    getPublishAccessLevel,
    getPublishAccessOptionByLevel,
    openPublishAccessDialog
} from "../../protyle/util/publishAccess";
import {fetchPost, fetchSyncPost} from "../../util/fetch";
import {openEmojiPanel, unicode2Emoji} from "../../emoji";
import {mountHelp, newNotebook} from "../../util/mount";
import {isNotCtrl, isOnlyMeta, setStorageVal, updateHotkeyAfterTip} from "../../protyle/util/compatibility";
import {openFileById} from "../../editor/util";
import {
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByTag
} from "../../protyle/util/hasClosest";
import {isTouchDevice} from "../../util/functions";
import {App} from "../../index";
import {refreshFileTree} from "../../dialog/processSystem";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif
import {hideTooltip, showTooltip} from "../../dialog/tooltip";
import {selectOpenTab} from "./util";
import {buildWorkbenchViewNoteMenu} from "../../workbench/viewNoteMenu";
import {applyFileTreeAppearanceToPanel} from "../../appearance/fileTreeAppearance";
import {
    clearFileTreeDropClasses,
    getFileTreeNotebookElement,
    getFileTreeMoveDropLabel,
    isFileTreePathInside,
    resolveFileTreeMoveDropElement,
    setFileTreeDragExpandState,
    setFileTreeDropLabel
} from "./fileTreeDrag";
import {
    genFileTreeDocCountHTML,
    genFileTreeTotalCountHTML,
    refreshFileTreeTotalCount,
    syncFileTreeDocCountElement
} from "./fileTreeCounts";

export class Files extends Model {
    public element: HTMLElement;
    public parent: Tab;
    public closeElement: HTMLElement;
    public lastSelectedElement: Element = null;
    private actionsElement: HTMLElement;

    constructor(options: { tab: Tab, app: App }) {
        super({
            app: options.app,
            type: "filetree",
            id: options.tab.id,
            msgCallback(data) {
                if (data) {
                    switch (data.cmd) {
                        case "reloadDocInfo":
                            this.updateDocInfo(data);
                            break;
                        case "moveDoc":
                            this.onMove(data);
                            break;
                        case "reloadFiletree":
                            setNoteBook(() => {
                                this.init(false);
                            });
                            break;
                        case "mount":
                            this.onMount(data);
                            options.app.plugins.forEach((item) => {
                                item.eventBus.emit("opened-notebook", data);
                            });
                            break;
                        case "createnotebook":
                            setNoteBook((notebooks) => {
                                let previousId: string;
                                notebooks.find(item => {
                                    if (!item.closed) {
                                        if (item.id === data.data.box.id) {
                                            if (previousId) {
                                                this.element.querySelector(`.b3-list[data-url="${previousId}"]`).insertAdjacentHTML("afterend", this.genNotebook(data.data.box));
                                            } else {
                                                this.element.insertAdjacentHTML("afterbegin", this.genNotebook(data.data.box));
                                            }
                                            return true;
                                        }
                                        previousId = item.id;
                                    }
                                });
                                this.refreshTotalCount();
                            });
                            break;
                        case "closeBox":
                        case "removeBox":
                            this.onRemove(data);
                            options.app.plugins.forEach((item) => {
                                item.eventBus.emit("closed-notebook", data);
                            });
                            break;
                        case "removeDoc":
                            this.onRemove(data);
                            break;
                        case "create":
                            if (data.data.listDocTree) {
                                this.selectItem(data.data.box.id, data.data.path);
                                this.refreshTotalCount();
                            } else {
                                this.updateItemArrow(data.data.box.id, data.data.path);
                            }
                            break;
                        case "createdailynote":
                        case "heading2doc":
                        case "li2doc":
                            this.selectItem(data.data.box.id, data.data.path);
                            this.refreshTotalCount();
                            break;
                        case "renamenotebook":
                            this.element.querySelector(`[data-url="${data.data.box}"] .b3-list-item__text`).innerHTML = escapeHtml(data.data.name);
                            break;
                        case "rename":
                            this.onRename(data.data);
                            break;
                    }
                }
            },
        });
        options.tab.panelElement.classList.add("fn__flex-column", "file-tree", "sf__file", "dockPanel");
        applyFileTreeAppearanceToPanel(options.tab.panelElement);
        options.tab.panelElement.innerHTML = `<div class="block__icons">
    <div class="block__logo">
        <svg class="block__logoicon"><use xlink:href="#iconFiles"></use></svg>${window.sourceflow.languages.fileTree}
    </div>
    <span class="fn__flex-1 fn__space"></span>
    ${genFileTreeTotalCountHTML()}
    <span class="fn__space"></span>
    <span data-type="focus" class="block__icon b3-tooltips b3-tooltips__sw" aria-label="${window.sourceflow.languages.selectOpen1}${updateHotkeyAfterTip(window.sourceflow.config.keymap.general.selectOpen1.custom)}"><svg><use xlink:href='#iconFocus'></use></svg></span>
    <span class="fn__space"></span>
    <span data-type="collapse" class="block__icon b3-tooltips b3-tooltips__sw" aria-label="${window.sourceflow.languages.collapse}${updateHotkeyAfterTip(window.sourceflow.config.keymap.editor.general.collapse.custom)}">
        <svg><use xlink:href="#iconContract"></use></svg>
    </span>
    <div class="fn__space${window.sourceflow.config.readonly ? " fn__none" : ""}"></div>
    <div data-type="more" class="b3-tooltips b3-tooltips__sw block__icon${window.sourceflow.config.readonly ? " fn__none" : ""}" aria-label="${window.sourceflow.languages.more}">
        <svg><use xlink:href="#iconMore"></use></svg>
    </div>
    <span class="fn__space"></span>
    <span data-type="min" class="block__icon b3-tooltips b3-tooltips__sw" aria-label="${window.sourceflow.languages.min}${updateHotkeyAfterTip(window.sourceflow.config.keymap.general.closeTab.custom)}"><svg><use xlink:href='#iconMin'></use></svg></span>
</div>
<div class="fn__flex-1" style="padding-top: 2px;"></div>
<ul class="b3-list fn__flex-column" style="min-height: auto;height:30px;transition: height  .2s cubic-bezier(0, 0, .2, 1) 0ms">
    <li class="b3-list-item" data-type="toggle">
        <span class="b3-list-item__toggle">
            <svg class="b3-list-item__arrow"><use xlink:href="#iconRight"></use></svg>
        </span>
        <span class="b3-list-item__text">${window.sourceflow.languages.closeNotebook}</span>
        <span class="counter" style="cursor: auto"></span>
    </li>
    <ul class="fn__none fn__flex-1"></ul>
</ul>`;
        this.actionsElement = options.tab.panelElement.firstElementChild as HTMLElement;
        this.element = this.actionsElement.nextElementSibling as HTMLElement;
        this.closeElement = options.tab.panelElement.lastElementChild as HTMLElement;
        this.closeElement.addEventListener("click", (event) => {
            setPanelFocus(this.element.parentElement);
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.closeElement)) {
                const type = target.getAttribute("data-type");
                if (target.classList.contains("b3-list-item__icon")) {
                    event.preventDefault();
                    event.stopPropagation();
                    const rect = target.getBoundingClientRect();
                    openEmojiPanel(target.parentElement.getAttribute("data-url"), "notebook", {
                        x: rect.left,
                        y: rect.bottom,
                        h: rect.height,
                        w: rect.width,
                    }, undefined, target.querySelector("img"));
                    break;
                } else if (type === "toggle") {
                    const svgElement = target.querySelector("svg");
                    if (svgElement.classList.contains("b3-list-item__arrow--open")) {
                        this.closeElement.style.height = "30px";
                        svgElement.classList.remove("b3-list-item__arrow--open");
                        this.closeElement.lastElementChild.classList.add("fn__none");
                    } else {
                        this.closeElement.style.height = "40%";
                        svgElement.classList.add("b3-list-item__arrow--open");
                        this.closeElement.lastElementChild.classList.remove("fn__none");
                    }
                    window.sourceflow.menus.menu.remove();
                    event.stopPropagation();
                    event.preventDefault();
                    break;
                } else if (type === "open") {
                    fetchPost("/api/notebook/openNotebook", {
                        notebook: target.getAttribute("data-url")
                    });
                    window.sourceflow.menus.menu.remove();
                    event.stopPropagation();
                    event.preventDefault();
                    break;
                }
                target = target.parentElement;
            }
        });
        // 为了快捷键的 dispatch
        this.actionsElement.querySelector('[data-type="collapse"]').addEventListener("click", () => {
            Array.from(this.element.children).forEach(item => {
                const liElement = item.firstElementChild;
                const toggleElement = liElement.querySelector(".b3-list-item__arrow");
                if (toggleElement.classList.contains("b3-list-item__arrow--open")) {
                    toggleElement.classList.remove("b3-list-item__arrow--open");
                    liElement.nextElementSibling.remove();
                }
            });
            window.sourceflow.storage[Constants.LOCAL_FILESPATHS] = [];
            setStorageVal(Constants.LOCAL_FILESPATHS, []);
        });
        this.actionsElement.addEventListener("click", (event: MouseEvent & { target: HTMLElement }) => {
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.actionsElement)) {
                const type = target.getAttribute("data-type");
                if (type === "min") {
                    getDockByType("file").toggleModel("file", false, true);
                    event.preventDefault();
                    event.stopPropagation();
                    window.sourceflow.menus.menu.remove();
                    break;
                } else if (type === "focus") {
                    selectOpenTab();
                    event.preventDefault();
                    break;
                } else if (type === "more") {
                    this.initMoreMenu().popup({x: event.clientX, y: event.clientY});
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                }
                target = target.parentElement;
            }
            setPanelFocus(this.element.parentElement);
        });
        this.element.addEventListener("mousedown", (event) => {
            // 点击鼠标滚轮关闭
            if (event.button !== 1 || !window.sourceflow.config.fileTree.openFilesUseCurrentTab) {
                return;
            }
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.element)) {
                if (target.tagName === "LI" && !target.getAttribute("data-opening")) {
                    target.setAttribute("data-opening", "true");
                    openFileById({
                        app: options.app,
                        removeCurrentTab: false,
                        id: target.getAttribute("data-node-id"),
                        action: [Constants.CB_GET_FOCUS, Constants.CB_GET_SCROLL],
                        afterOpen() {
                            target.removeAttribute("data-opening");
                        }
                    });
                    event.stopPropagation();
                    event.preventDefault();
                    break;
                }
                target = target.parentElement;
            }
        });
        this.element.addEventListener("click", (event) => {
            let target = event.target as HTMLElement;
            const ulElement = hasTopClosestByTag(target, "UL");
            let needFocus = true;
            if (ulElement) {
                const notebookId = ulElement.getAttribute("data-url");
                while (target && !target.isEqualNode(this.element)) {
                    if (isNotCtrl(event) && target.classList.contains("b3-list-item__icon") && window.sourceflow.config.system.container !== "ios") {
                        event.preventDefault();
                        event.stopPropagation();
                        const rect = target.getBoundingClientRect();
                        if (target.parentElement.getAttribute("data-type") === "navigation-file") {
                            openEmojiPanel(target.parentElement.getAttribute("data-node-id"), "doc", {
                                x: rect.left,
                                y: rect.bottom,
                                h: rect.height,
                                w: rect.width,
                            }, undefined, target.querySelector("img"));
                        } else {
                            openEmojiPanel(target.parentElement.parentElement.getAttribute("data-url"), "notebook", {
                                x: rect.left,
                                y: rect.bottom,
                                h: rect.height,
                                w: rect.width,
                            }, undefined, target.querySelector("img"));
                        }
                        break;
                    } else if (isNotCtrl(event) && target.classList.contains("b3-list-item__toggle")) {
                        this.getLeaf(target.parentElement, notebookId);
                        event.preventDefault();
                        event.stopPropagation();
                        window.sourceflow.menus.menu.remove();
                        break;
                    } else if (target.classList.contains("b3-list-item__switch")) {
                        event.preventDefault();
                        event.stopPropagation();
                        const rect = target.getBoundingClientRect();
                        openPublishAccessDialog(target.parentElement.getAttribute("data-node-id") ||
                            target.parentElement.parentElement.getAttribute("data-url"), {
                            x: rect.left,
                            y: rect.bottom,
                            h: rect.height,
                            w: rect.width,
                        }, (access) => {
                            target.innerHTML = access.iconHTML;
                            fetchPost("/api/filetree/setPublishAccess", {
                                id: access.id,
                                visible: access.visible,
                                password: access.password,
                                disable: access.disable,
                            });
                        });
                        break;
                    } else if (isNotCtrl(event) && target.classList.contains("b3-list-item__action")) {
                        const type = target.getAttribute("data-type");
                        const pathString = target.parentElement.getAttribute("data-path");
                        if (!window.sourceflow.config.readonly) {
                            if (type === "new") {
                                newFile({
                                    app: options.app,
                                    notebookId,
                                    currentPath: pathString,
                                    useSavePath: false,
                                    listDocTree: true,
                                });
                            } else if (type === "more-root") {
                                initNavigationMenu(options.app, target.parentElement).popup({
                                    x: event.clientX,
                                    y: event.clientY
                                });
                            } else if (type === "addLocal") {
                                fetchPost("/api/filetree/moveLocalShorthands", {
                                    "notebook": notebookId
                                });
                                this.element.querySelectorAll('[data-type="addLocal"]').forEach(item => {
                                    item.remove();
                                });
                            }
                        }
                        if (type === "more-file") {
                            initFileMenu(options.app, notebookId, pathString, target.parentElement).popup({
                                x: event.clientX,
                                y: event.clientY
                            });
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        break;
                    } else if (target.tagName === "LI") {
                        if (isOnlyMeta(event) && !event.altKey && !event.shiftKey) {
                            target.classList.toggle("b3-list-item--focus");
                            this.lastSelectedElement = target;
                        } else if (event.shiftKey && !event.altKey && isNotCtrl(event)) {
                            // Shift+click 多选文档
                            if (!document.contains(this.lastSelectedElement)) {
                                this.lastSelectedElement = null;
                            }
                            if (!this.lastSelectedElement) {
                                this.lastSelectedElement = this.element.querySelector(".b3-list-item--focus");
                            }
                            if (!this.lastSelectedElement) {
                                this.lastSelectedElement = target.parentElement.firstElementChild;
                            }
                            this.element.querySelectorAll(".b3-list-item--focus").forEach(item => {
                                item.classList.remove("b3-list-item--focus");
                            });

                            // 获取所有文档项
                            const allFiles = Array.from(this.element.querySelectorAll("li.b3-list-item"));

                            // 获取起始和结束索引
                            const startIndex = allFiles.indexOf(this.lastSelectedElement);
                            const endIndex = allFiles.indexOf(target);

                            // 确定选择范围
                            const start = Math.min(startIndex, endIndex);
                            const end = Math.max(startIndex, endIndex);

                            // 添加新选择
                            for (let i = start; i <= end; i++) {
                                (allFiles[i] as HTMLElement).classList.add("b3-list-item--focus");
                            }
                        } else {
                            this.lastSelectedElement = target;
                            this.setCurrent(target, false);
                            if (target.getAttribute("data-type") === "navigation-file") {
                                // 更新最后点击的文档项
                                needFocus = false;
                                if (target.getAttribute("data-opening")) {
                                    return;
                                }
                                target.setAttribute("data-opening", "true");
                                if (event.altKey && isNotCtrl(event) && !event.shiftKey) {
                                    openFileById({
                                        app: options.app,
                                        id: target.getAttribute("data-node-id"),
                                        position: "right",
                                        action: [Constants.CB_GET_FOCUS, Constants.CB_GET_SCROLL],
                                        afterOpen() {
                                            target.removeAttribute("data-opening");
                                        }
                                    });
                                } else if (!event.altKey && isOnlyMeta(event) && event.shiftKey) {
                                    openFileById({
                                        app: options.app,
                                        id: target.getAttribute("data-node-id"),
                                        position: "bottom",
                                        action: [Constants.CB_GET_FOCUS, Constants.CB_GET_SCROLL],
                                        afterOpen() {
                                            target.removeAttribute("data-opening");
                                        }
                                    });
                                } else if (window.sourceflow.config.fileTree.openFilesUseCurrentTab &&
                                    event.altKey && isOnlyMeta(event) && !event.shiftKey) {
                                    openFileById({
                                        app: options.app,
                                        removeCurrentTab: false,
                                        id: target.getAttribute("data-node-id"),
                                        action: [Constants.CB_GET_FOCUS, Constants.CB_GET_SCROLL],
                                        afterOpen() {
                                            target.removeAttribute("data-opening");
                                        }
                                    });
                                } else {
                                    openFileById({
                                        app: options.app,
                                        id: target.getAttribute("data-node-id"),
                                        action: [Constants.CB_GET_FOCUS, Constants.CB_GET_SCROLL],
                                        afterOpen() {
                                            target.removeAttribute("data-opening");
                                        }
                                    });
                                }
                            } else if (target.getAttribute("data-type") === "navigation-root") {
                                this.getLeaf(target, notebookId);
                            }
                        }
                        this.element.querySelector('[select-end="true"]')?.removeAttribute("select-end");
                        this.element.querySelector('[select-start="true"]')?.removeAttribute("select-start");
                        window.sourceflow.menus.menu.remove();
                        event.stopPropagation();
                        event.preventDefault();
                        break;
                    }
                    target = target.parentElement;
                }
            }
            if (needFocus) {
                setPanelFocus(this.element.parentElement);
            }
        });
        let dragExpandTimer = 0;
        let dragExpandElement: HTMLElement;
        const clearDragExpandTimer = () => {
            if (dragExpandTimer) {
                window.clearTimeout(dragExpandTimer);
                dragExpandTimer = 0;
            }
            if (dragExpandElement) {
                setFileTreeDragExpandState(dragExpandElement, false);
            }
            dragExpandElement = undefined;
        };
        this.element.addEventListener("dragstart", (event: DragEvent & { target: HTMLElement }) => {
            if (isTouchDevice()) {
                event.stopPropagation();
                event.preventDefault();
                return;
            }
            window.getSelection().removeAllRanges();
            hideTooltip();
            const liElement = hasClosestByTag(event.target, "LI");
            if (liElement) {
                this.parent.panelElement.classList.add("sf__file--disablehover");
                let selectElements: Element[] = Array.from(this.element.querySelectorAll(".b3-list-item--focus"));
                if (!liElement.classList.contains("b3-list-item--focus")) {
                    selectElements.forEach((item) => {
                        item.classList.remove("b3-list-item--focus");
                    });
                    liElement.classList.add("b3-list-item--focus");
                    selectElements = [liElement];
                }
                let ids = "";
                const ghostElement = document.createElement("ul");
                selectElements.forEach((item: HTMLElement, index) => {
                    ghostElement.append(item.cloneNode(true));
                    item.style.opacity = "0.38";
                    const itemNodeId = item.dataset.nodeId ||
                        item.dataset.path; // 拖拽笔记本时值不能为空，否则 drop 就不会继续排序
                    if (itemNodeId) {
                        ids += itemNodeId;
                        if (index < selectElements.length - 1) {
                            ids += ",";
                        }
                    }
                });
                ghostElement.setAttribute("style", `width: 219px;position: fixed;top:-${selectElements.length * 30}px`);
                ghostElement.setAttribute("class", "b3-list b3-list--background");
                document.body.append(ghostElement);
                event.dataTransfer.setDragImage(ghostElement, 16, 16);
                event.dataTransfer.setData(Constants.SOURCEFLOW_DROP_FILE, ids);
                event.dataTransfer.dropEffect = "move";
                window.sourceflow.dragElement = document.createElement("div");
                window.sourceflow.dragElement.innerText = ids;
                setTimeout(() => {
                    ghostElement.remove();
                });
            }
        });
        this.element.addEventListener("dragend", (event) => {
            this.parent.panelElement.classList.remove("sf__file--disablehover");
            this.element.querySelectorAll('.b3-list-item[style*="opacity: 0.38;"]').forEach((item: HTMLElement, index) => {
                item.style.opacity = "";
                // https://github.com/lonelyor/SourceFlow/issues/11587
                if (index === 0 && hasClosestByClassName(document.elementFromPoint(event.clientX, event.clientY), "sf__file")) {
                    const ariaLabelElement = item.querySelector(".ariaLabel");
                    if (ariaLabelElement) {
                        showTooltip(ariaLabelElement.getAttribute("aria-label"), ariaLabelElement);
                    }
                }
            });
            window.sourceflow.dragElement = undefined;
            clearFileTreeDropClasses(this.element);
            clearDragExpandTimer();
            /// #if !BROWSER
            ipcRenderer.send(Constants.SOURCEFLOW_SEND_WINDOWS, {cmd: "resetTabsStyle", data: "rmDragStyle"});
            /// #else
            document.querySelectorAll(".layout-tab-bars--drag").forEach(item => {
                item.classList.remove("layout-tab-bars--drag");
            });
            /// #endif
        });
        const dragOverLastObj: {
            element: HTMLElement,
            positionY: number,
            rafId: number,
        } = {
            element: null,
            positionY: null,
            rafId: null,
        };
        const queueDragExpand = (liElement: HTMLElement) => {
            const targetType = liElement.getAttribute("data-type");
            if (!["navigation-root", "navigation-file"].includes(targetType)) {
                clearDragExpandTimer();
                return;
            }
            const toggleElement = liElement.querySelector(".b3-list-item__toggle");
            const arrowElement = liElement.querySelector(".b3-list-item__arrow");
            if (!toggleElement || !arrowElement || toggleElement.classList.contains("fn__hidden") ||
                arrowElement.classList.contains("b3-list-item__arrow--open")) {
                clearDragExpandTimer();
                return;
            }
            if (dragExpandElement === liElement && dragExpandTimer) {
                return;
            }
            clearDragExpandTimer();
            dragExpandElement = liElement;
            setFileTreeDragExpandState(liElement, true);
            dragExpandTimer = window.setTimeout(() => {
                const notebookElement = getFileTreeNotebookElement(liElement);
                if (notebookElement && document.contains(liElement) && liElement.classList.contains("dragover")) {
                    this.getLeaf(liElement, notebookElement.getAttribute("data-url"), true);
                }
                clearDragExpandTimer();
            }, 650);
        };
        const hasMovableFileSelection = () => {
            return Array.from(this.element.querySelectorAll(".b3-list-item--focus")).some((item: HTMLElement) => {
                return item.getAttribute("data-type") === "navigation-file";
            });
        };
        this.element.addEventListener("dragover", (event: DragEvent & { target: HTMLElement }) => {
            if (window.sourceflow.config.readonly || !window.sourceflow.dragElement || event.dataTransfer.types.includes(Constants.SOURCEFLOW_DROP_TAB)) {
                event.preventDefault();
                return;
            }
            if (dragOverLastObj.rafId) {
                event.preventDefault();
                return;
            }
            let gutterType = "";
            for (const item of event.dataTransfer.items) {
                if (item.type.startsWith(Constants.SOURCEFLOW_DROP_GUTTER)) {
                    gutterType = item.type;
                }
            }
            dragOverLastObj.rafId = requestAnimationFrame(() => {
                dragOverLastObj.rafId = null;
                let liElement = event.target.closest("li") as HTMLElement;
                if (!liElement) {
                    liElement = document.elementFromPoint(event.clientX, event.clientY - 1)?.closest("li");
                }
                if (gutterType) {
                    if (!liElement) {
                        dragOverLastObj.element = null;
                        event.preventDefault();
                        return;
                    }
                    const targetType = liElement.getAttribute("data-type");
                    if (dragOverLastObj.element !== liElement) {
                        dragOverLastObj.element?.classList.remove("dragover", "dragover__bottom", "dragover__top");
                        const gutterTypes = gutterType.replace(Constants.SOURCEFLOW_DROP_GUTTER, "").split(Constants.ZWSP);
                        if (!["nodelistitem", "nodeheading"].includes(gutterTypes[0])) {
                            event.preventDefault();
                            return;
                        }
                    }
                    if (dragOverLastObj.element && dragOverLastObj.element === liElement && dragOverLastObj.positionY !== event.clientY) {
                        const notebookElement = getFileTreeNotebookElement(liElement);
                        if (!notebookElement) {
                            event.preventDefault();
                            return;
                        }
                        const notebookSort = notebookElement.getAttribute("data-sortmode");
                        if (targetType !== "navigation-root" &&
                            (notebookSort === "6" || (window.sourceflow.config.fileTree.sort === 6 && notebookSort === "15"))) {
                            const nodeRect = liElement.getBoundingClientRect();
                            const dragHeight = nodeRect.height * .2;
                            if (event.clientY > nodeRect.bottom - dragHeight) {
                                liElement.classList.remove("dragover");
                                liElement.classList.add("dragover__bottom");
                            } else if (event.clientY < nodeRect.top + dragHeight) {
                                liElement.classList.remove("dragover");
                                liElement.classList.add("dragover__top");
                            } else {
                                liElement.classList.remove("dragover__top", "dragover__bottom");
                            }
                        }
                        if (!liElement.classList.contains("dragover__top") && !liElement.classList.contains("dragover__bottom")) {
                            liElement.classList.add("dragover");
                        }
                    }
                    if (dragOverLastObj.element !== liElement) {
                        dragOverLastObj.element = liElement;
                    }
                    dragOverLastObj.positionY = event.clientY;
                    event.preventDefault();
                    return;
                }

                liElement = resolveFileTreeMoveDropElement(this.element, event);
                if (!liElement || !["navigation-root", "navigation-file"].includes(liElement.getAttribute("data-type")) ||
                    liElement.classList.contains("b3-list-item--focus") || !hasMovableFileSelection()) {
                    clearFileTreeDropClasses(this.element);
                    clearDragExpandTimer();
                    dragOverLastObj.element = null;
                    event.dataTransfer.dropEffect = "none";
                    event.preventDefault();
                    return;
                }
                const toPath = liElement.getAttribute("data-path");
                const isInvalidTarget = Array.from(this.element.querySelectorAll(".b3-list-item--focus")).some((item: HTMLElement) => {
                    return item.getAttribute("data-type") === "navigation-file" &&
                        isFileTreePathInside(toPath, item.getAttribute("data-path"));
                });
                if (isInvalidTarget) {
                    clearFileTreeDropClasses(this.element);
                    clearDragExpandTimer();
                    dragOverLastObj.element = null;
                    event.dataTransfer.dropEffect = "none";
                    event.preventDefault();
                    return;
                }
                if (dragOverLastObj.element !== liElement) {
                    clearFileTreeDropClasses(this.element);
                    liElement.classList.add("dragover");
                    setFileTreeDropLabel(liElement, getFileTreeMoveDropLabel(liElement));
                    dragOverLastObj.element = liElement;
                }
                queueDragExpand(liElement);
                dragOverLastObj.positionY = event.clientY;
                event.dataTransfer.dropEffect = "move";
                event.preventDefault();
            });
            event.preventDefault();
        });
        let counter = 0;
        this.element.addEventListener("dragleave", () => {
            counter--;
            if (counter === 0) {
                clearFileTreeDropClasses(this.element);
                clearDragExpandTimer();
            }
        });
        this.element.addEventListener("dragenter", (event) => {
            event.preventDefault();
            counter++;
        });
        this.element.addEventListener("drop", (event: DragEvent & { target: HTMLElement }) => {
            counter = 0;
            clearDragExpandTimer();
            const newElement = this.element.querySelector(".dragover, .dragover__bottom, .dragover__top") as HTMLElement;
            if (!newElement) {
                return;
            }
            const notebookElement = getFileTreeNotebookElement(newElement);
            if (!notebookElement) {
                return;
            }
            const toURL = notebookElement.getAttribute("data-url");
            const toPath = newElement.getAttribute("data-path");
            let gutterType = "";
            for (const item of event.dataTransfer.items) {
                if (item.type.startsWith(Constants.SOURCEFLOW_DROP_GUTTER)) {
                    gutterType = item.type;
                }
            }
            // 块标拖拽
            if (gutterType) {
                const gutterTypes = gutterType.replace(Constants.SOURCEFLOW_DROP_GUTTER, "").split(Constants.ZWSP);
                if (["nodelistitem", "nodeheading"].includes(gutterTypes[0])) {
                    const toDocOptions: {
                        targetNoteBook: string;
                        pushMode: number;
                        srcHeadingID?: string;
                        srcListItemID?: string;
                        targetPath?: string;
                        previousPath?: string;
                    } = {
                        targetNoteBook: toURL,
                        pushMode: 0,
                    };
                    if (newElement.classList.contains("dragover")) {
                        toDocOptions.targetPath = toPath;
                    } else if (newElement.classList.contains("dragover__bottom")) {
                        toDocOptions.previousPath = toPath;
                    } else if (newElement.classList.contains("dragover__top")) {
                        if (newElement.previousElementSibling) {
                            toDocOptions.previousPath = newElement.previousElementSibling.getAttribute("data-path");
                        } else {
                            toDocOptions.targetPath = newElement.parentElement.previousElementSibling.getAttribute("data-path");
                        }
                    }
                    if (gutterTypes[0] === "nodeheading") {
                        toDocOptions.srcHeadingID = gutterTypes[2].split(",")[0];
                        fetchPost("/api/filetree/heading2Doc", toDocOptions);
                    } else {
                        toDocOptions.srcListItemID = gutterTypes[2].split(",")[0];
                        fetchPost("/api/filetree/li2Doc", toDocOptions);
                    }
                }
                clearFileTreeDropClasses(this.element);
                window.sourceflow.dragElement = undefined;
                return;
            }
            window.sourceflow.dragElement = undefined;
            if (!event.dataTransfer.getData(Constants.SOURCEFLOW_DROP_FILE)) {
                clearFileTreeDropClasses(this.element);
                return;
            }
            const fromPaths: string[] = [];
            this.element.querySelectorAll(".b3-list-item--focus").forEach((item: HTMLElement) => {
                if (item.getAttribute("data-type") !== "navigation-file") {
                    return;
                }
                const dataPath = item.getAttribute("data-path");
                const parentDir = pathPosix().dirname(dataPath);
                const parentPath = parentDir === "/" ? "/" : parentDir + ".sf";
                if (toPath === parentPath) {
                    return;
                }
                const isChild = fromPaths.find(itemPath => {
                    if (dataPath.startsWith(itemPath.replace(".sf", ""))) {
                        return true;
                    }
                });
                if (!isChild && !isFileTreePathInside(toPath, dataPath)) {
                    fromPaths.push(dataPath);
                }
            });
            if (fromPaths.length > 0) {
                fetchPost("/api/filetree/moveDocs", {
                    toNotebook: toURL,
                    fromPaths,
                    toPath,
                });
            }
            clearFileTreeDropClasses(this.element);
        });
        this.init();
        if (window.sourceflow.config.openHelp) {
            // 需等待链接建立，不能放在 ongetconfig 中
            mountHelp();
        }
    }

    private updateDocInfo(data: IWebSocketData) {
        const liElement = this.element.querySelector(`li[data-node-id="${data.data.rootID}"]`);
        if (liElement) {
            liElement.setAttribute("data-count", data.data.subFileCount);
            syncFileTreeDocCountElement(liElement, data.data.subFileCount);
            liElement.querySelector(".ariaLabel")?.setAttribute("aria-label", this.genDocAriaLabel(data.data, escapeGreat));
            if (data.data.subFileCount === 0) {
                liElement.querySelector(".b3-list-item__toggle")?.classList.add("fn__hidden");
            } else {
                liElement.querySelector(".b3-list-item__toggle")?.classList.remove("fn__hidden");
            }
        }
    }

    private updateItemArrow(notebookId: string, filePath: string) {
        const treeElement = this.element.querySelector(`[data-url="${notebookId}"]`);
        if (!treeElement) {
            this.refreshTotalCount();
            return;
        }
        let currentPath = filePath;
        let liElement;
        while (!liElement) {
            liElement = treeElement.querySelector(`[data-path="${currentPath}"]`);
            if (!liElement) {
                const dirname = pathPosix().dirname(currentPath);
                if (dirname === "/") {
                    if (treeElement.firstElementChild.querySelector(".b3-list-item__arrow--open")) {
                        this.getLeaf(treeElement.firstElementChild, notebookId, true);
                    }
                    break;
                } else {
                    currentPath = dirname + ".sf";
                }
            } else {
                const hiddenElement = liElement.querySelector(".fn__hidden");
                if (hiddenElement) {
                    hiddenElement.classList.remove("fn__hidden");
                } else {
                    this.getLeaf(liElement, notebookId, true);
                }
                break;
            }
        }
        this.refreshTotalCount();
    }

    private genNotebook(item: INotebook) {
        const editingPublishAccess = this.element.classList.contains("file-tree__publish-access--active");
        const emojiHTML = `<span class="b3-list-item__icon b3-tooltips b3-tooltips__e${editingPublishAccess ? " fn__none" : ""}" aria-label="${window.sourceflow.languages.changeIcon}">${unicode2Emoji(item.icon || window.sourceflow.storage[Constants.LOCAL_IMAGES].note)}</span>`;
        const switchHTML = `<span class="b3-list-item__switch b3-tooltips b3-tooltips__e${editingPublishAccess ? "" : " fn__none"}" aria-label="${window.sourceflow.languages.publishAccess}">${getPublishAccessOptionByLevel("public").iconHTML}</span>`;
        if (item.closed) {
            return `<li data-url="${item.id}" class="b3-list-item b3-list-item--hide-action">
    <span class="b3-list-item__toggle fn__hidden">
        <svg class="b3-list-item__arrow"><use xlink:href="#iconRight"></use></svg>
    </span>
    ${emojiHTML}
    ${switchHTML}
    <span class="b3-list-item__text" style="cursor: default;">${escapeHtml(item.name)}</span>
    <span data-type="open" data-url="${item.id}" class="b3-list-item__action b3-tooltips b3-tooltips__w${(window.sourceflow.config.readonly) ? " fn__none" : ""}" aria-label="${window.sourceflow.languages.openBy}">
        <svg><use xlink:href="#iconOpen"></use></svg>
    </span>
</li>`;
        } else {
            return `<ul class="b3-list b3-list--background" data-url="${item.id}" data-sort="${item.sort}" data-sortmode="${item.sortMode}">
<li class="b3-list-item b3-list-item--hide-action" ${window.sourceflow.config.fileTree.sort === 6 ? 'draggable="true"' : ""}
style="--file-toggle-width:22px"
data-type="navigation-root" data-path="/">
    <span class="b3-list-item__toggle b3-list-item__toggle--hl">
        <svg class="b3-list-item__arrow"><use xlink:href="#iconRight"></use></svg>
    </span>
    ${emojiHTML}
    ${switchHTML}
    <span class="b3-list-item__text ariaLabel" data-position="parentE">${escapeHtml(item.name)}</span>
    <span data-type="more-root" class="b3-list-item__action b3-tooltips b3-tooltips__w${(window.sourceflow.config.readonly) ? " fn__none" : ""}" aria-label="${window.sourceflow.languages.more}">
        <svg><use xlink:href="#iconMore"></use></svg>
    </span>
    <span data-type="new" class="b3-list-item__action b3-tooltips b3-tooltips__w${(window.sourceflow.config.readonly) ? " fn__none" : ""}" aria-label="${window.sourceflow.languages.newSubDoc}">
        <svg><use xlink:href="#iconAdd"></use></svg>
    </span>
</li></ul>`;
        }
    }

    public init(init = true) {
        let html = "";
        let closeHtml = "";
        let closeCounter = 0;
        const scrollTop = this.element.scrollTop;
        window.sourceflow.notebooks.forEach((item) => {
            if (item.closed) {
                closeCounter++;
                closeHtml += this.genNotebook(item);
            } else {
                html += this.genNotebook(item);
            }
        });
        this.element.innerHTML = html;
        this.closeElement.lastElementChild.innerHTML = closeHtml;
        const counterElement = this.closeElement.querySelector(".counter");
        counterElement.textContent = closeCounter.toString();
        if (closeCounter) {
            this.closeElement.classList.remove("fn__none");
        } else {
            this.closeElement.classList.add("fn__none");
        }
        window.sourceflow.storage[Constants.LOCAL_FILESPATHS].forEach(async (item: IFilesPath) => {
            for (const openPath of item.openPaths) {
                await this.selectItem(item.notebookId, openPath, undefined, false, false);
            }
            this.element.scrollTop = scrollTop;
        });
        this.refreshPublishAccessSwitch();
        this.refreshTotalCount();
        if (!init) {
            return;
        }
        const svgElement = this.closeElement.querySelector("svg");
        if (html !== "") {
            this.closeElement.style.height = "30px";
            svgElement.classList.remove("b3-list-item__arrow--open");
            this.closeElement.lastElementChild.classList.add("fn__none");
        } else {
            this.closeElement.style.height = "40%";
            svgElement.classList.add("b3-list-item__arrow--open");
            this.closeElement.lastElementChild.classList.remove("fn__none");
        }
    }

    private refreshTotalCount() {
        refreshFileTreeTotalCount(this.actionsElement);
    }

    private onRemove(data: IWebSocketData) {
        // "doc2heading" 后删除文件或挂载帮助文档前的 unmount
        if (data.cmd === "closeBox" || data.cmd === "removeBox") {
            setNoteBook((notebooks) => {
                const targetElement = this.element.querySelector(`ul[data-url="${data.data.box}"] li[data-path="${"/"}"]`);
                if (targetElement) {
                    targetElement.parentElement.remove();
                    if (data.cmd === "closeBox") {
                        let closeHTML = "";
                        notebooks.find(item => {
                            if (item.closed) {
                                closeHTML += this.genNotebook(item);
                            }
                        });
                        this.closeElement.lastElementChild.innerHTML = closeHTML;
                        const counterElement = this.closeElement.querySelector(".counter");
                        counterElement.textContent = (parseInt(counterElement.textContent) + 1).toString();
                        this.closeElement.classList.remove("fn__none");
                    }
                }
                this.refreshTotalCount();
            });
            if (data.cmd === "removeBox") {
                const removeElement = this.closeElement.querySelector(`li[data-url="${data.data.box}"]`);
                if (removeElement) {
                    removeElement.remove();
                    const counterElement = this.closeElement.querySelector(".counter");
                    counterElement.textContent = (parseInt(counterElement.textContent) - 1).toString();
                    if (counterElement.textContent === "0") {
                        this.closeElement.classList.add("fn__none");
                    }
                }
            }
            return;
        }
        data.data.ids.forEach((item: string) => {
            const targetElement = this.element.querySelector(`li.b3-list-item[data-node-id="${item}"]`);
            if (targetElement) {
                // 子节点展开则删除
                if (targetElement.nextElementSibling?.tagName === "UL") {
                    targetElement.nextElementSibling.remove();
                }
                // 移除当前节点
                const parentElement = targetElement.parentElement.previousElementSibling as HTMLElement;
                if (targetElement.parentElement.childElementCount === 1) {
                    if (parentElement) {
                        const iconElement = parentElement.querySelector("svg");
                        iconElement.classList.remove("b3-list-item__arrow--open");
                        if (parentElement.dataset.type !== "navigation-root") {
                            iconElement.parentElement.classList.add("fn__hidden");
                        }
                        const emojiElement = iconElement.parentElement.nextElementSibling;
                        if (emojiElement.innerHTML === unicode2Emoji(window.sourceflow.storage[Constants.LOCAL_IMAGES].folder)) {
                            emojiElement.innerHTML = unicode2Emoji(window.sourceflow.storage[Constants.LOCAL_IMAGES].file);
                        }
                    }
                    targetElement.parentElement.remove();
                } else {
                    targetElement.remove();
                }
            }
        });
        this.refreshTotalCount();
    }

    private onMount(data: { data: { box: INotebook, existed?: boolean }, callback?: string }) {
        if (data.data.existed) {
            return;
        }
        const liElement = this.closeElement.querySelector(`li[data-url="${data.data.box.id}"]`) as HTMLElement;
        if (liElement) {
            const counterElement = this.closeElement.querySelector(".counter");
            counterElement.textContent = (parseInt(counterElement.textContent) - 1).toString();
            if (counterElement.textContent === "0") {
                this.closeElement.classList.add("fn__none");
            }
            liElement.remove();
        }
        setNoteBook((notebooks: INotebook[]) => {
            const html = this.genNotebook(data.data.box);
            if (this.element.childElementCount === 0) {
                this.element.innerHTML = html;
            } else {
                let previousId;
                notebooks.find((item, index) => {
                    if (item.id === data.data.box.id) {
                        while (index > 0) {
                            if (!notebooks[index - 1].closed) {
                                previousId = notebooks[index - 1].id;
                                break;
                            } else {
                                index--;
                            }
                        }
                        return true;
                    }
                });
                if (previousId) {
                    this.element.querySelector(`[data-url="${previousId}"]`).insertAdjacentHTML("afterend", html);
                } else {
                    this.element.insertAdjacentHTML("afterbegin", html);
                }
            }
            this.refreshTotalCount();
        });
    }

    public onRename(data: { path: string, title: string, box: string }) {
        const fileItemElement = this.element.querySelector(`ul[data-url="${data.box}"] li[data-path="${data.path}"]`);
        if (!fileItemElement) {
            return;
        }
        fileItemElement.setAttribute("data-name", Lute.EscapeHTMLStr(data.title));
        fileItemElement.querySelector(".b3-list-item__text").innerHTML = escapeHtml(data.title);
    }

    private onMove(response: IWebSocketData) {
        const sourceElement = this.element.querySelector(`ul[data-url="${response.data.fromNotebook}"] li[data-path="${response.data.fromPath}"]`) as HTMLElement;
        if (sourceElement) {
            if (sourceElement.nextElementSibling && sourceElement.nextElementSibling.tagName === "UL") {
                sourceElement.nextElementSibling.remove();
            }
            if (sourceElement.parentElement.childElementCount === 1) {
                if (sourceElement.parentElement.previousElementSibling) {
                    const parentLiElement = sourceElement.parentElement.previousElementSibling;
                    if (parentLiElement.getAttribute("data-type") !== "navigation-root") {
                        parentLiElement.querySelector(".b3-list-item__toggle").classList.add("fn__hidden");
                    }
                    parentLiElement.querySelector(".b3-list-item__arrow").classList.remove("b3-list-item__arrow--open");
                    const emojiElement = parentLiElement.querySelector(".b3-list-item__icon");
                    if (emojiElement.innerHTML === unicode2Emoji(window.sourceflow.storage[Constants.LOCAL_IMAGES].folder)) {
                        emojiElement.innerHTML = unicode2Emoji(window.sourceflow.storage[Constants.LOCAL_IMAGES].file);
                    }
                }
                sourceElement.parentElement.remove();
            } else {
                sourceElement.remove();
            }
        } else {
            const parentElement = this.element.querySelector(`ul[data-url="${response.data.fromNotebook}"] li[data-path="${pathPosix().dirname(response.data.fromPath)}.sf"]`) as HTMLElement;
            if (parentElement && parentElement.getAttribute("data-count") === "1") {
                parentElement.querySelector(".b3-list-item__toggle").classList.add("fn__hidden");
                parentElement.querySelector(".b3-list-item__arrow").classList.remove("b3-list-item__arrow--open");
            }
        }
        const newElement = this.element.querySelector(`[data-url="${response.data.toNotebook}"] li[data-path="${response.data.toPath}"]`) as HTMLElement;
        // 更新移动到的新文件夹
        if (newElement) {
            newElement.querySelector(".b3-list-item__toggle").classList.remove("fn__hidden");
            const emojiElement = newElement.querySelector(".b3-list-item__icon");
            if (emojiElement.innerHTML === unicode2Emoji(window.sourceflow.storage[Constants.LOCAL_IMAGES].file)) {
                emojiElement.innerHTML = unicode2Emoji(window.sourceflow.storage[Constants.LOCAL_IMAGES].folder);
            }
            const arrowElement = newElement.querySelector(".b3-list-item__arrow");
            if (arrowElement.classList.contains("b3-list-item__arrow--open") && response.callback !== Constants.CB_MOVE_NOLIST) {
                this.getLeaf(newElement, response.data.toNotebook, true);
            }
        }
    }

    private onLsHTML(data: { files: IFile[], box: string, path: string }, scrollTop?: number) {
        if (data.files.length === 0) {
            return;
        }
        const liElement = this.element.querySelector(`ul[data-url="${data.box}"] li[data-path="${data.path}"]`);
        if (!liElement) {
            return;
        }
        let fileHTML = "";
        data.files.forEach((item: IFile) => {
            fileHTML += this.genFileHTML(item);
        });
        let nextElement = liElement.nextElementSibling;
        if (nextElement && nextElement.tagName === "UL") {
            // 文件展开时，刷新
            const tempElement = document.createElement("template");
            tempElement.innerHTML = fileHTML;
            // 保持文件夹展开状态
            nextElement.querySelectorAll(":scope > .b3-list-item > .b3-list-item__toggle> .b3-list-item__arrow--open").forEach(item => {
                const openLiElement = hasClosestByClassName(item, "b3-list-item");
                if (openLiElement) {
                    const tempOpenLiElement = tempElement.content.querySelector(`.b3-list-item[data-node-id="${openLiElement.getAttribute("data-node-id")}"]`);
                    tempOpenLiElement.after(openLiElement.nextElementSibling);
                    tempOpenLiElement.querySelector(".b3-list-item__arrow").classList.add("b3-list-item__arrow--open");
                }
            });
            nextElement.innerHTML = tempElement.innerHTML;
            if (typeof scrollTop === "number") {
                this.element.scroll({top: scrollTop, behavior: "smooth"});
            }
            this.refreshPublishAccessSwitch();
            return;
        }
        liElement.querySelector(".b3-list-item__arrow").classList.add("b3-list-item__arrow--open");
        liElement.insertAdjacentHTML("afterend", `<ul class="file-tree__sliderDown">${fileHTML}</ul>`);
        nextElement = liElement.nextElementSibling;
        setTimeout(() => {
            nextElement.setAttribute("style", `top: -1px;position: relative;height:${nextElement.childElementCount * (liElement.clientHeight + 1) - 1}px;`);
            setTimeout(() => {
                this.element.querySelectorAll(".file-tree__sliderDown").forEach(item => {
                    item.classList.remove("file-tree__sliderDown");
                    item.removeAttribute("style");
                });
                if (typeof scrollTop === "number") {
                    this.element.scroll({top: scrollTop, behavior: "smooth"});
                }
            }, 120);
        }, 2);
        this.refreshPublishAccessSwitch();
    }

    private async onLsSelect(data: {
        files: IFile[],
        box: string,
        path: string
    }, filePath: string, setStorage: boolean, isSetCurrent: boolean) {
        let fileHTML = "";
        data.files.forEach((item: IFile) => {
            fileHTML += this.genFileHTML(item);
        });
        if (fileHTML === "") {
            return;
        }
        const liElement = this.element.querySelector(`ul[data-url="${data.box}"] li[data-path="${data.path}"]`);
        if (!liElement) {
            return;
        }
        if (liElement.nextElementSibling && liElement.nextElementSibling.tagName === "UL") {
            // 文件展开时，刷新
            liElement.nextElementSibling.remove();
        }
        const arrowElement = liElement.querySelector(".b3-list-item__arrow");
        arrowElement.classList.add("b3-list-item__arrow--open");
        arrowElement.parentElement.classList.remove("fn__hidden");
        const emojiElement = liElement.querySelector(".b3-list-item__icon");
        if (emojiElement.textContent === unicode2Emoji(window.sourceflow.storage[Constants.LOCAL_IMAGES].file)) {
            emojiElement.textContent = unicode2Emoji(window.sourceflow.storage[Constants.LOCAL_IMAGES].folder);
        }
        liElement.insertAdjacentHTML("afterend", `<ul>${fileHTML}</ul>`);
        let newLiElement;
        for (let i = 0; i < data.files.length; i++) {
            const item = data.files[i];
            if (filePath === item.path) {
                newLiElement = await this.selectItem(data.box, filePath, undefined, setStorage, isSetCurrent);
            } else if (filePath.startsWith(item.path.replace(".sf", ""))) {
                const response = await fetchSyncPost("/api/filetree/listDocsByPath", {
                    notebook: data.box,
                    path: item.path,
                    app: Constants.SOURCEFLOW_APPID,
                });
                newLiElement = await this.selectItem(response.data.box, filePath, response.data, setStorage, isSetCurrent);
            }
        }
        if (isSetCurrent) {
            this.setCurrent(newLiElement);
        }
        return newLiElement;
    }

    public setCurrent(target: HTMLElement, isScroll = true) {
        if (!target) {
            return;
        }
        this.element.querySelectorAll("li.b3-list-item--focus").forEach((liItem) => {
            liItem.classList.remove("b3-list-item--focus");
        });
        this.element.querySelectorAll("li.file-tree__item--current").forEach((liItem) => {
            liItem.classList.remove("file-tree__item--current");
        });
        target.classList.add("b3-list-item--focus");
        target.classList.add("file-tree__item--current");

        if (isScroll) {
            const elementRect = this.element.getBoundingClientRect();
            this.element.scrollTop = this.element.scrollTop + (target.getBoundingClientRect().top - (elementRect.top + elementRect.height / 2));
        }
    }

    public getLeaf(liElement: Element, notebookId: string, focusUpdate = false) {
        const toggleElement = liElement.querySelector(".b3-list-item__arrow");
        if (toggleElement.classList.contains("b3-list-item__arrow--open") && !focusUpdate) {
            toggleElement.classList.remove("b3-list-item__arrow--open");
            liElement.nextElementSibling?.remove();
            this.getOpenPaths();
            return;
        }
        fetchPost("/api/filetree/listDocsByPath", {
            notebook: notebookId,
            path: liElement.getAttribute("data-path"),
            app: Constants.SOURCEFLOW_APPID,
        }, response => {
            if (response.data.path === "/" && response.data.files.length === 0) {
                newFile({
                    app: this.app,
                    notebookId,
                    currentPath: "/",
                    useSavePath: false,
                    listDocTree: true,
                });
                return;
            }
            this.onLsHTML(response.data);
            this.getOpenPaths();
        });
    }

    public async selectItem(notebookId: string, filePath: string, data?: {
        files: IFile[],
        box: string,
        path: string
    }, setStorage = true, isSetCurrent = true) {
        const treeElement = this.element.querySelector(`[data-url="${notebookId}"]`);
        if (!treeElement) {
            // 有文件树和编辑器的布局初始化时，文件树还未挂载
            return;
        }
        let currentPath = filePath;
        let liElement: HTMLElement;
        while (!liElement) {
            liElement = treeElement.querySelector(`[data-path="${currentPath}"]`);
            if (!liElement) {
                const dirname = pathPosix().dirname(currentPath);
                if (dirname === "/") {
                    currentPath = dirname;
                } else {
                    currentPath = dirname + ".sf";
                }
            }
        }

        if (liElement.getAttribute("data-path") === filePath) {
            if (setStorage) {
                this.getOpenPaths();
            }
            if (isSetCurrent) {
                this.setCurrent(liElement);
            }
            return liElement;
        }

        if (data && data.path === currentPath) {
            liElement = await this.onLsSelect(data, filePath, setStorage, isSetCurrent);
        } else {
            const response = await fetchSyncPost("/api/filetree/listDocsByPath", {
                notebook: notebookId,
                path: currentPath,
                app: Constants.SOURCEFLOW_APPID,
            });
            liElement = await this.onLsSelect(response.data, filePath, setStorage, isSetCurrent);
        }
        this.refreshPublishAccessSwitch();
        return liElement;
    }

    private getOpenPaths() {
        const filesPaths: IFilesPath[] = [];
        this.element.querySelectorAll(".b3-list[data-url]").forEach((item: HTMLElement) => {
            const notebookPaths: IFilesPath = {
                notebookId: item.getAttribute("data-url"),
                openPaths: []
            };
            item.querySelectorAll(".b3-list-item__arrow--open").forEach((openItem) => {
                const liElement = hasClosestByTag(openItem, "LI");
                if (liElement) {
                    notebookPaths.openPaths.push(liElement.getAttribute("data-path"));
                }
            });
            if (notebookPaths.openPaths.length > 0) {
                for (let i = 0; i < notebookPaths.openPaths.length; i++) {
                    for (let j = i + 1; j < notebookPaths.openPaths.length; j++) {
                        if (notebookPaths.openPaths[j].startsWith(notebookPaths.openPaths[i].replace(".sf", ""))) {
                            notebookPaths.openPaths.splice(i, 1);
                            j--;
                        }
                    }
                }
                notebookPaths.openPaths.forEach((openPath, index) => {
                    const nextPath = this.element.querySelector(`[data-url="${notebookPaths.notebookId}"] li[data-path="${openPath}"]`)?.nextElementSibling?.firstElementChild?.getAttribute("data-path");
                    if (nextPath) {
                        notebookPaths.openPaths[index] = nextPath;
                    }
                });
                filesPaths.push(notebookPaths);
            }
        });
        window.sourceflow.storage[Constants.LOCAL_FILESPATHS] = filesPaths;
        setStorageVal(Constants.LOCAL_FILESPATHS, filesPaths);
    }

    private genDocAriaLabel(item: IFile, escapeMethod: (text: string) => string) {
        return `${escapeMethod(getDisplayName(item.name, true, true))} <small class='ft__on-surface'>${item.hSize}</small>${item.bookmark ? "<br>" + window.sourceflow.languages.bookmark + " " + escapeMethod(item.bookmark) : ""}${item.name1 ? "<br>" + window.sourceflow.languages.name + " " + escapeMethod(item.name1) : ""}${item.alias ? "<br>" + window.sourceflow.languages.alias + " " + escapeMethod(item.alias) : ""}${item.memo ? "<br>" + window.sourceflow.languages.memo + " " + escapeMethod(item.memo) : ""}${item.subFileCount !== 0 ? window.sourceflow.languages.includeSubFile.replace("x", item.subFileCount) : ""}<br>${window.sourceflow.languages.modifiedAt} ${item.hMtime}<br>${window.sourceflow.languages.createdAt} ${item.hCtime}`;
    }

    private genFileHTML(item: IFile) {
        let countHTML = "";
        if (item.count && item.count > 0) {
            countHTML = `<span class="popover__block counter b3-tooltips b3-tooltips__nw" aria-label="${window.sourceflow.languages.ref}">${item.count}</span>`;
        }
        const ariaLabel = this.genDocAriaLabel(item, escapeAriaLabel);
        const paddingLeft = (item.path.split("/").length - 1) * 18;
        const editingPublishAccess = this.element.classList.contains("file-tree__publish-access--active");
        const docCountHTML = genFileTreeDocCountHTML(item.subFileCount);
        return `<li data-node-id="${item.id}" data-name="${Lute.EscapeHTMLStr(item.name)}" draggable="true" data-count="${item.subFileCount}"
data-type="navigation-file"
style="--file-toggle-width:${paddingLeft + 18}px"
class="b3-list-item b3-list-item--hide-action" data-path="${item.path}">
    <span style="padding-left: ${paddingLeft}px" class="b3-list-item__toggle b3-list-item__toggle--hl${item.subFileCount === 0 ? " fn__hidden" : ""}">
        <svg class="b3-list-item__arrow"><use xlink:href="#iconRight"></use></svg>
    </span>
    <span class="b3-list-item__icon b3-tooltips b3-tooltips__n popover__block${editingPublishAccess ? " fn__none" : ""}" data-id="${item.id}" aria-label="${window.sourceflow.languages.changeIcon}">${unicode2Emoji(item.icon || (item.subFileCount === 0 ? window.sourceflow.storage[Constants.LOCAL_IMAGES].file : window.sourceflow.storage[Constants.LOCAL_IMAGES].folder))}</span>
    <span class="b3-list-item__switch b3-tooltips b3-tooltips__n${editingPublishAccess ? "" : " fn__none"}" aria-label="${window.sourceflow.languages.publishAccess}">${getPublishAccessOptionByLevel("public").iconHTML}</span>
    <span class="b3-list-item__text ariaLabel" data-position="parentE"
aria-label="${ariaLabel}">${getDisplayName(item.name, true, true)}</span>
    <span data-type="more-file" class="b3-list-item__action b3-tooltips b3-tooltips__nw" aria-label="${window.sourceflow.languages.more}">
        <svg><use xlink:href="#iconMore"></use></svg>
    </span>
    <span data-type="new" class="b3-list-item__action b3-tooltips b3-tooltips__nw${window.sourceflow.config.readonly ? " fn__none" : ""}" aria-label="${window.sourceflow.languages.newSubDoc}">
        <svg><use xlink:href="#iconAdd"></use></svg>
    </span>
    ${docCountHTML}
    ${countHTML}
</li>`;
    }

    private initMoreMenu() {
        window.sourceflow.menus.menu.remove();
        if (!window.sourceflow.config.readonly) {
            const target = getNewFilePath(false);
            window.sourceflow.menus.menu.append(new MenuItem({
                icon: "iconFilesRoot",
                label: window.sourceflow.languages.newNotebook,
                click: () => {
                    newNotebook();
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "workbenchCreateViewNote",
                label: window.sourceflow.languages.workbenchCreateViewNote,
                icon: "iconLayout",
                type: "submenu",
                submenu: buildWorkbenchViewNoteMenu(this.app, {
                    notebookId: target.notebookId,
                    pathString: target.currentPath || "/",
                }),
            }).element);
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            icon: "iconRefresh",
            label: window.sourceflow.languages.rebuildIndex,
            click: () => {
                if (!this.element.getAttribute("disabled")) {
                    this.element.setAttribute("disabled", "disabled");
                    refreshFileTree(() => {
                        this.element.removeAttribute("disabled");
                        this.init(false);
                    });
                }
            }
        }).element);
        if (!window.sourceflow.config.readonly) {
            const subMenu = sortMenu("notebooks", window.sourceflow.config.fileTree.sort, (sort: number) => {
                window.sourceflow.config.fileTree.sort = sort;
                fetchPost("/api/setting/setFiletree", {
                    sort: window.sourceflow.config.fileTree.sort,
                    alwaysSelectOpenedFile: window.sourceflow.config.fileTree.alwaysSelectOpenedFile,
                    refCreateSavePath: window.sourceflow.config.fileTree.refCreateSavePath,
                    docCreateSavePath: window.sourceflow.config.fileTree.docCreateSavePath,
                    openFilesUseCurrentTab: window.sourceflow.config.fileTree.openFilesUseCurrentTab,
                    maxListCount: window.sourceflow.config.fileTree.maxListCount,
                }, () => {
                    setNoteBook(() => {
                        this.init(false);
                    });
                });
            });
            window.sourceflow.menus.menu.append(new MenuItem({
                icon: "iconSort",
                label: window.sourceflow.languages.sort,
                type: "submenu",
                submenu: subMenu,
            }).element);
        }
        if (!window.sourceflow.config.readonly && window.sourceflow.config.publish.enable) {
            window.sourceflow.menus.menu.append(new MenuItem({
                icon: "iconEye",
                label: window.sourceflow.languages.publishAccess,
                checked: this.element.classList.contains("file-tree__publish-access--active"),
                click: () => {
                    this.element.classList.toggle("file-tree__publish-access--active");
                    const editingPublishAccess = this.element.classList.contains("file-tree__publish-access--active");
                    this.element.querySelectorAll(".b3-list-item__icon").forEach(item => {
                        item.classList.toggle("fn__none", editingPublishAccess);
                        item.nextElementSibling.classList.toggle("fn__none", !editingPublishAccess);
                    });
                }
            }).element);
        }
        return window.sourceflow.menus.menu;
    }

    private refreshPublishAccessSwitch() {
        if (window.sourceflow.config.readonly || window.sourceflow.isPublish ||
            !this.element.classList.contains("file-tree__publish-access--active")) {
            return;
        }
        const ids: string[] = [];
        this.element.querySelectorAll("[data-url]").forEach((element: HTMLElement) => ids.push(element.getAttribute("data-url")));
        this.element.querySelectorAll("[data-node-id]").forEach((element: HTMLElement) => ids.push(element.getAttribute("data-node-id")));
        fetchPost("/api/filetree/getPublishAccess", {
            ids
        }, response => {
            response.data.publishAccess.forEach((item: IPublishAccessItem) => {
                const element = this.element.querySelector(`[data-url="${item.id}"] .b3-list-item__switch`) || this.element.querySelector(`[data-node-id="${item.id}"] .b3-list-item__switch`);
                if (element) {
                    element.innerHTML = getPublishAccessOptionByLevel(getPublishAccessLevel(item.visible, item.password, item.disable)).iconHTML;
                }
            });
        });
    }
}
