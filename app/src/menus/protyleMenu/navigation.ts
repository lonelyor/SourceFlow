import {
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByClassName,
    isInEmbedBlock
} from "../../protyle/util/hasClosest";
import {MenuItem} from "../Menu";
import {focusBlock, focusByRange, focusByWbr, getEditorRange, selectAll,} from "../../protyle/util/selection";
import {
    deleteColumn,
    deleteRow,
    getColIndex,
    insertColumn,
    insertRow,
    insertRowAbove,
    moveColumnToLeft,
    moveColumnToRight,
    moveRowToDown,
    moveRowToUp,
    setTableAlign,
    updateTableTitle
} from "../../protyle/util/table";
import {mathRender} from "../../protyle/render/mathRender";
import {transaction, updateTransaction} from "../../protyle/wysiwyg/transaction";
import {openMenu} from "../commonMenuItem";
import {fetchPost, fetchSyncPost} from "../../util/fetch";
import {Constants} from "../../constants";
import {copyPlainText, readClipboard, setStorageVal, updateHotkeyTip, writeText} from "../../protyle/util/compatibility";
import {preventScroll} from "../../protyle/scroll/preventScroll";
import {onGet} from "../../protyle/util/onGet";
import {getAllModels} from "../../layout/getAll";
import {getPlainText, paste, pasteAsImage, pasteAsPlainText, pasteAsSmartTable, pasteEscaped, pastePreserveLayout} from "../../protyle/util/paste";
/// #if !MOBILE
import {openFileById, updateBacklinkGraph} from "../../editor/util";
import {openGlobalSearch} from "../../search/util";
import {openNewWindowById} from "../../window/openNewWindow";
/// #endif
import {getSearch, isMobile} from "../../util/functions";
import {removeFoldHeading} from "../../protyle/util/heading";
import {lineNumberRender} from "../../protyle/render/highlightRender";
import * as dayjs from "dayjs";
import {blockRender} from "../../protyle/render/blockRender";
import {renameAsset} from "../../editor/rename";
import {electronUndo} from "../../protyle/undo";
import {pushBack} from "../../mobile/util/MobileBackFoward";
import {copyPNGByLink, exportAsset, writeAssetToClipboard} from "../util";
import {removeInlineType} from "../../protyle/toolbar/util";
import {alignImgCenter, alignImgLeft} from "../../protyle/wysiwyg/commonHotkey";
import {checkFold, renameTag} from "../../util/noRelyPCFunction";
import {hideElements} from "../../protyle/ui/hideElements";
import {emitOpenMenu} from "../../plugin/EventBus";
import {openMobileFileById} from "../../mobile/editor";
import {openBacklink, openGraph} from "../../layout/dock/util";
import {renderAssetsPreview} from "../../asset/renderAssets";
import {upDownHint} from "../../util/upDownHint";
import {hintRenderAssets} from "../../protyle/hint/extend";
import {Menu} from "../../plugin/Menu";
import {getFirstBlock} from "../../protyle/wysiwyg/getBlock";
import {getIdFromSYProtocol, isSYProtocol} from "../../util/pathName";
import {popSearch} from "../../mobile/menu/search";
import {showMessage} from "../../dialog/message";
import {img3115} from "../../boot/compatibleVersion";
import {hideTooltip} from "../../dialog/tooltip";
import {clearSelect} from "../../protyle/util/clear";
import {scrollCenter} from "../../util/highlightById";
import {base64ToURL} from "../../util/image";
import {uploadFiles} from "../../protyle/upload";
import {reloadProtyle} from "../../protyle/util/reload";
import {appendAssistantContextActions} from "../../assistant/skills/contextActions";
import {net2LocalAssets} from "../../protyle/breadcrumb/action";


export const enterBack = (protyle: IProtyle, id: string) => {
    if (!protyle.block.showAll) {
        const ids = protyle.path.split("/");
        if (ids.length > 2) {
            /// #if MOBILE
            openMobileFileById(protyle.app, ids[ids.length - 2], [Constants.CB_GET_FOCUS, Constants.CB_GET_SCROLL]);
            /// #else
            openFileById({
                app: protyle.app,
                id: ids[ids.length - 2],
                action: [Constants.CB_GET_FOCUS, Constants.CB_GET_SCROLL]
            });
            /// #endif
        }
    } else {
        zoomOut({protyle, id: protyle.block.parent2ID, focusId: id});
    }
};

export const zoomOut = (options: {
    protyle: IProtyle,
    id: string,
    focusId?: string,
    isPushBack?: boolean,
    callback?: () => void,
    reload?: boolean
}) => {
    if (options.protyle.options.backlinkData) {
        return;
    }
    if (typeof options.isPushBack === "undefined") {
        options.isPushBack = true;
    }
    if (typeof options.reload === "undefined") {
        options.reload = false;
    }
    const blockPanelElement = hasClosestByClassName(options.protyle.element, "block__popover", true);
    if (blockPanelElement) {
        const pingElement = blockPanelElement.querySelector('[data-type="pin"]');
        if (pingElement && blockPanelElement.getAttribute("data-pin") !== "true") {
            pingElement.setAttribute("aria-label", window.sourceflow.languages.unpin);
            pingElement.querySelector("use").setAttribute("xlink:href", "#iconUnpin");
            blockPanelElement.setAttribute("data-pin", "true");
        }
    }
    const breadcrumbHLElement = options.protyle.breadcrumb?.element.querySelector(".protyle-breadcrumb__item--active");
    if (!options.reload && breadcrumbHLElement && breadcrumbHLElement.getAttribute("data-node-id") === options.id) {
        if (options.id === options.protyle.block.rootID) {
            return;
        }
        const focusElement = options.protyle.wysiwyg.element.querySelector(`[data-node-id="${options.focusId || options.id}"]`);
        if (focusElement) {
            focusBlock(focusElement);
            focusElement.scrollIntoView();
            return;
        }
    }
    if (window.sourceflow.mobile?.editor) {
        window.sourceflow.storage[Constants.LOCAL_DOCINFO] = {
            id: options.id,
        };
        setStorageVal(Constants.LOCAL_DOCINFO, window.sourceflow.storage[Constants.LOCAL_DOCINFO]);
        if (options.isPushBack) {
            pushBack();
        }
    }
    fetchPost("/api/filetree/getDoc", {
        id: options.id,
        size: options.id === options.protyle.block.rootID ? window.sourceflow.config.editor.dynamicLoadBlocks : Constants.SIZE_GET_MAX,
    }, async (getResponse) => {
        if (options.isPushBack) {
            onGet({
                data: getResponse,
                protyle: options.protyle,
                action: options.id === options.protyle.block.rootID ? [Constants.CB_GET_FOCUS, Constants.CB_GET_HTML] : [Constants.CB_GET_ALL, Constants.CB_GET_FOCUS, Constants.CB_GET_HTML],
                afterCB: options.callback,
            });
        } else {
            onGet({
                data: getResponse,
                protyle: options.protyle,
                action: options.id === options.protyle.block.rootID ? [Constants.CB_GET_FOCUS, Constants.CB_GET_HTML, Constants.CB_GET_UNUNDO] : [Constants.CB_GET_ALL, Constants.CB_GET_FOCUS, Constants.CB_GET_UNUNDO, Constants.CB_GET_HTML],
                afterCB: options.callback,
            });
        }
        // https://github.com/lonelyor/SourceFlow/issues/4874
        if (options.focusId) {
            let focusElement = options.protyle.wysiwyg.element.querySelector(`[data-node-id="${options.focusId}"]`);
            if (!focusElement) {
                const unfoldResponse = await fetchSyncPost("/api/block/getUnfoldedParentID", {id: options.focusId});
                options.focusId = unfoldResponse.data.parentID;
                focusElement = options.protyle.wysiwyg.element.querySelector(`[data-node-id="${unfoldResponse.data.parentID}"]`);
            }
            if (focusElement) {
                // 退出聚焦时可能遇到折叠块 https://github.com/lonelyor/SourceFlow/issues/10746
                let showElement = focusElement;
                while (showElement.getBoundingClientRect().height === 0) {
                    showElement = showElement.parentElement;
                }
                if (showElement.classList.contains("protyle-wysiwyg")) {
                    // 需要排除聚焦元素本身 https://github.com/lonelyor/SourceFlow/issues/10058#issuecomment-2029524211
                    showElement = focusElement.previousElementSibling || focusElement.nextElementSibling;
                } else {
                    showElement = getFirstBlock(showElement);
                }
                focusBlock(showElement);
                const resizeObserver = new ResizeObserver(() => {
                    scrollCenter(options.protyle, focusElement, "start");
                });
                resizeObserver.observe(options.protyle.wysiwyg.element);
                setTimeout(() => {
                    resizeObserver.disconnect();
                }, 1000 * 3);
            } else if (!options.focusId) {
                fetchPost("/api/filetree/getDoc", {
                    id: options.protyle.block.rootID,
                    size: window.sourceflow.config.editor.dynamicLoadBlocks,
                }, getFocusResponse => {
                    onGet({
                        data: getFocusResponse,
                        protyle: options.protyle,
                        action: options.isPushBack ? [Constants.CB_GET_FOCUS] : [Constants.CB_GET_FOCUS, Constants.CB_GET_UNUNDO],
                    });
                });
                return;
            } else if (options.id === options.protyle.block.rootID) { // 聚焦渲染后，该块是动态加载的，可能还没有渲染完整。
                fetchPost("/api/filetree/getDoc", {
                    id: options.focusId,
                    mode: 3,
                    size: window.sourceflow.config.editor.dynamicLoadBlocks,
                }, getFocusResponse => {
                    onGet({
                        data: getFocusResponse,
                        protyle: options.protyle,
                        action: options.isPushBack ? [Constants.CB_GET_FOCUS] : [Constants.CB_GET_FOCUS, Constants.CB_GET_UNUNDO],
                    });
                });
                return;
            }
        } else if (options.id !== options.protyle.block.rootID) {
            options.protyle.wysiwyg.element.classList.add("protyle-wysiwyg--animate");
            setTimeout(() => {
                options.protyle.wysiwyg.element.classList.remove("protyle-wysiwyg--animate");
            }, 365);
        }
        /// #if !MOBILE
        if (options.protyle.model) {
            const allModels = getAllModels();
            allModels.outline.forEach(item => {
                if (item.blockId === options.protyle.block.rootID) {
                    item.setCurrent(options.protyle.wysiwyg.element.querySelector(`[data-node-id="${options.focusId || options.id}"]`));
                }
            });
            updateBacklinkGraph(allModels, options.protyle);
        }
        /// #endif
    });
};

export const setFoldById = (data: {
    id: string,
    currentNodeID: string,
}, protyle: IProtyle) => {
    Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${data.id}"]`)).find((item: Element) => {
        if (!isInEmbedBlock(item)) {
            const operations = setFold(protyle, item, true, false, true, true);
            operations.doOperations[0].context = {
                focusId: data.currentNodeID,
            };
            transaction(protyle, operations.doOperations, operations.undoOperations);
            return true;
        }
    });
};

export const setFold = (protyle: IProtyle, nodeElement: Element, isOpen?: boolean,
                        isRemove?: boolean, addLoading = true, getOperations = false) => {
    if (nodeElement.getAttribute("data-type") === "NodeListItem" && nodeElement.childElementCount < 4 &&
        // 空列表项需要强制展开 https://github.com/lonelyor/SourceFlow/issues/12327
        !isOpen) {
        // 没有子列表的列表项不能被折叠。
        return {fold: -1};
    }
    if (nodeElement.getAttribute("data-type") === "NodeThematicBreak") {
        return {fold: -1};
    }
    const hasFold = nodeElement.getAttribute("fold") === "1";
    if (hasFold) {
        if (typeof isOpen === "boolean" && !isOpen) {
            return {fold: -1};
        }
        nodeElement.removeAttribute("fold");
        // https://github.com/lonelyor/SourceFlow/issues/4411
        nodeElement.querySelectorAll(".protyle-linenumber__rows").forEach((item: HTMLElement) => {
            lineNumberRender(item.parentElement);
        });
    } else {
        if (typeof isOpen === "boolean" && isOpen) {
            return {fold: -1};
        }
        nodeElement.setAttribute("fold", "1");
        // 在搜索结果列表中再次 focus 到尾部时，避免落到不可见块里。
        if (getSelection().rangeCount > 0) {
            const range = getSelection().getRangeAt(0);
            const blockElement = hasClosestBlock(range.startContainer);
            if (blockElement && blockElement.getBoundingClientRect().width === 0) {
                // https://github.com/lonelyor/SourceFlow/issues/5833
                focusBlock(nodeElement, undefined, false);
            }
        }
        clearSelect(["img", "av"], nodeElement);
        scrollCenter(protyle, nodeElement);
    }
    const id = nodeElement.getAttribute("data-node-id");
    const doOperations: IOperation[] = [];
    const undoOperations: IOperation[] = [];
    if (nodeElement.getAttribute("data-type") === "NodeHeading") {
        if (hasFold) {
            if (addLoading) {
                nodeElement.insertAdjacentHTML("beforeend", '<div spin="1" style="text-align: center"><img width="24px" height="24px" src="/stage/loading-pure.svg"></div>');
            }
            doOperations.push({
                action: "unfoldHeading",
                id,
                data: isRemove ? "remove" : undefined,
            });
            undoOperations.push({
                action: "foldHeading",
                id
            });
        } else {
            doOperations.push({
                action: "foldHeading",
                id
            });
            undoOperations.push({
                action: "unfoldHeading",
                id
            });
            removeFoldHeading(nodeElement);
        }
    } else {
        doOperations.push({
            action: "setAttrs",
            id,
            data: JSON.stringify({fold: hasFold ? "" : "1"})
        });
        undoOperations.push({
            action: "setAttrs",
            id,
            data: JSON.stringify({fold: hasFold ? "1" : ""})
        });
    }
    if (!getOperations) {
        transaction(protyle, doOperations, undoOperations);
    }
    // 折叠后，防止滚动时触发不必要的 get 请求 https://github.com/lonelyor/SourceFlow/issues/2248
    preventScroll(protyle);
    return {fold: !hasFold ? 1 : 0, undoOperations, doOperations};
};

