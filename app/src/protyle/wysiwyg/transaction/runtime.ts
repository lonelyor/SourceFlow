import {fetchPost, fetchSyncPost} from "../../../util/fetch";
import {focusBlock, focusByWbr, focusSideBlock, getEditorRange} from "../../util/selection";
import {getContenteditableElement, getFirstBlock, getTopAloneElement} from "../getBlock";
import {Constants} from "../../../constants";
import {blockRender} from "../../render/blockRender";
import {processRender} from "../../util/processCode";
import {highlightRender} from "../../render/highlightRender";
import {hasClosestBlock, hasClosestByAttribute, hasTopClosestByAttribute, isInEmbedBlock} from "../../util/hasClosest";
import {setFold, zoomOut} from "../../../menus/protyle";
import {disabledProtyle, enableProtyle, onGet} from "../../util/onGet";
/// #if !MOBILE
import {getAllModels} from "../../../layout/getAll";
/// #endif
import {avRender, refreshAV} from "../../render/av/render";
import {removeFoldHeading} from "../../util/heading";
import {cancelSB, genEmptyElement, genSBElement} from "../../../block/util";
import {hideElements} from "../../ui/hideElements";
import {reloadProtyle} from "../../util/reload";
import {countBlockWord} from "../../../layout/status";
import {resize} from "../../util/resize";
import {processClonePHElement} from "../../render/util";
import {scrollCenter} from "../../../util/highlightById";
import {getFullWidthAttr, getReadonlyAttr, isAVStaticTextAttr} from "../../../util/attrCompat";


export const removeTopElement = (updateElement: Element, protyle: IProtyle) => {
    // 移动到其他文档中，该块需移除
    // TODO 文档没有打开时，需要通过后台获取 getTopAloneElement
    const topAloneElement = getTopAloneElement(updateElement);
    const doOperations: IOperation[] = [];
    if (topAloneElement !== updateElement) {
        updateElement.remove();
        doOperations.push({
            action: "delete",
            id: topAloneElement.getAttribute("data-node-id")
        });
    }
    topAloneElement.remove();
    if (protyle.wysiwyg.element.childElementCount === 0) {
        if (protyle.block.rootID === protyle.block.id) {
            const newId = Lute.NewNodeID();
            const newElement = genEmptyElement(false, false, newId);
            doOperations.push({
                action: "insert",
                data: newElement.outerHTML,
                id: newId,
                parentID: protyle.block.parentID
            });
            protyle.wysiwyg.element.innerHTML = newElement.outerHTML;
        } else {
            zoomOut({
                protyle,
                id: protyle.block.rootID,
                isPushBack: false,
                focusId: protyle.block.id,
            });
        }
    }
    if (doOperations.length > 0) {
        transaction(protyle, doOperations, []);
    }
};

// 用于执行操作，外加处理当前编辑器中块引用、嵌入块的更新
const promiseTransaction = () => {
    if (window.sourceflow.transactions.length === 0) {
        return;
    }
    const protyle = window.sourceflow.transactions[0].protyle;
    const doOperations = window.sourceflow.transactions[0].doOperations;
    const undoOperations = window.sourceflow.transactions[0].undoOperations;
    fetchPost("/api/transactions", {
        session: protyle.id,
        app: Constants.SOURCEFLOW_APPID,
        transactions: [{
            doOperations,
            undoOperations
        }]
    }, (response) => {
        window.sourceflow.transactions.splice(0, 1);
        if (window.sourceflow.transactions.length === 0) {
            countBlockWord([], protyle.block.rootID, true);
        } else {
            promiseTransaction();
        }
        /// #if MOBILE
        if (window.sourceflow.config.repo.key && window.sourceflow.config.sync.enabled) {
            document.getElementById("toolbarSync").classList.remove("fn__none");
        }
        /// #endif
        let range: Range;
        if (getSelection().rangeCount > 0) {
            range = getSelection().getRangeAt(0);
        }
        response.data[0].doOperations.forEach((operation: IOperation) => {
            if (operation.action === "unfoldHeading" || operation.action === "foldHeading") {
                processFold(operation, protyle);
                return;
            }
            if (operation.action === "update") {
                if (protyle.options.backlinkData) {
                    // 反链中有多个相同块的情况
                    Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`)).forEach(item => {
                        if (!isInEmbedBlock(item)) {
                            if (range && (item === range.startContainer || item.contains(range.startContainer))) {
                                // 正在编辑的块不能进行更新
                            } else {
                                item.outerHTML = operation.data.replace("<wbr>", "");
                            }
                        }
                    });
                    processRender(protyle.wysiwyg.element);
                    highlightRender(protyle.wysiwyg.element);
                    avRender(protyle.wysiwyg.element, protyle);
                    blockRender(protyle, protyle.wysiwyg.element);
                }
                // 当前编辑器中更新嵌入块
                updateEmbed(protyle, operation);
                return;
            }
            if (operation.action === "delete" || operation.action === "append") {
                if (protyle.options.backlinkData) {
                    Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`)).forEach(item => {
                        if (!isInEmbedBlock(item) && !item.contains(range.startContainer)) {
                            item.remove();
                        }
                    });
                }
                // 更新嵌入块
                protyle.wysiwyg.element.querySelectorAll('[data-type="NodeBlockQueryEmbed"]').forEach((item) => {
                    if (item.querySelector(`[data-node-id="${operation.id}"]`)) {
                        item.removeAttribute("data-render");
                        blockRender(protyle, item);
                    }
                });
                hideElements(["gutter"], protyle);
                return;
            }
            if (operation.action === "move") {
                if (protyle.options.backlinkData) {
                    const updateElements: Element[] = [];
                    Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`)).forEach(item => {
                        if (!isInEmbedBlock(item)) {
                            const topElement = hasTopClosestByAttribute(item, "data-node-id", null);
                            if (topElement && !topElement.contains(range.startContainer)) {
                                // 当前操作块不再进行操作，否则光标丢失 https://github.com/lonelyor/SourceFlow/issues/13946
                                updateElements.push(item);
                            }
                        }
                    });
                    let hasFind = false;
                    if (operation.previousID && updateElements.length > 0) {
                        Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.previousID}"]`)).forEach(item => {
                            if (!isInEmbedBlock(item) && !item.nextElementSibling.contains(range.startContainer)) {
                                item.after(processClonePHElement(updateElements[0].cloneNode(true) as Element));
                                hasFind = true;
                            }
                        });
                    } else if (updateElements.length > 0) {
                        Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.parentID}"]`)).forEach(item => {
                            if (!isInEmbedBlock(item) && !getFirstBlock(item).contains(range.startContainer)) {
                                const cloneElement = processClonePHElement(updateElements[0].cloneNode(true) as Element);
                                // 列表特殊处理
                                if (item.firstElementChild?.classList.contains("protyle-action")) {
                                    item.firstElementChild.after(cloneElement);
                                } else if (item.classList.contains("callout")) {
                                    item.querySelector(".callout-content").prepend(cloneElement);
                                } else {
                                    item.prepend(cloneElement);
                                }
                                hasFind = true;
                            }
                        });
                    }
                    updateElements.forEach(item => {
                        if (hasFind) {
                            item.remove();
                        } else if (!hasFind && item.parentElement) {
                            removeTopElement(item, protyle);
                        }
                    });
                }
                // 更新嵌入块
                protyle.wysiwyg.element.querySelectorAll('[data-type="NodeBlockQueryEmbed"]').forEach((item) => {
                    if (item.querySelector(`[data-node-id="${operation.id}"],[data-node-id="${operation.parentID}"],[data-node-id="${operation.previousID}"]`)) {
                        item.removeAttribute("data-render");
                        blockRender(protyle, item);
                    }
                });
                return;
            }
            if (operation.action === "insert") {
                // insert
                if (protyle.options.backlinkData) {
                    const cursorElements: Element[] = [];
                    if (operation.previousID) {
                        Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.previousID}"]`)).forEach(item => {
                            if (item.nextElementSibling?.getAttribute("data-node-id") !== operation.id &&
                                !item.contains(range.startContainer) && // 当前操作块不再进行操作
                                !hasClosestByAttribute(item, "data-node-id", operation.id) && // 段落转列表会在段落后插入新列表
                                !isInEmbedBlock(item)) {
                                item.insertAdjacentHTML("afterend", operation.data);
                                cursorElements.push(item.nextElementSibling);
                            }
                        });
                    } else {
                        Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.parentID}"]`)).forEach(item => {
                            if (!isInEmbedBlock(item) && !item.contains(range.startContainer)) {
                                // 列表特殊处理
                                if (item.firstElementChild && item.firstElementChild.classList.contains("protyle-action") &&
                                    item.firstElementChild.nextElementSibling?.getAttribute("data-node-id") !== operation.id) {
                                    item.firstElementChild.insertAdjacentHTML("afterend", operation.data);
                                    cursorElements.push(item.firstElementChild.nextElementSibling);
                                } else if (item.classList.contains("callout") &&
                                    item.querySelector("[data-node-id]")?.getAttribute("data-node-id") !== operation.id) {
                                    item.querySelector(".callout-content").insertAdjacentHTML("afterbegin", operation.data);
                                    cursorElements.push(item.querySelector("[data-node-id]"));
                                } else if (item.firstElementChild.getAttribute("data-node-id") !== operation.id) {
                                    item.insertAdjacentHTML("afterbegin", operation.data);
                                    cursorElements.push(item.firstElementChild);
                                }
                            }
                        });
                    }
                    // https://github.com/lonelyor/SourceFlow/issues/4420
                    protyle.wysiwyg.element.querySelectorAll('[data-type="NodeHeading"]').forEach(item => {
                        if (item.lastElementChild.getAttribute("spin") === "1") {
                            item.lastElementChild.remove();
                        }
                    });
                    cursorElements.forEach(item => {
                        processRender(item);
                        highlightRender(item);
                        avRender(item, protyle);
                        blockRender(protyle, item);
                        const wbrElement = item.querySelector("wbr");
                        if (wbrElement) {
                            wbrElement.remove();
                        }
                    });
                }
                // 不更新嵌入块：在快速删除时重新渲染嵌入块会导致滚动条产生滚动从而触发 getDoc 请求，此时删除的块还没有写库，会把已删除的块 append 到文档底部，最终导致查询块失败、光标丢失
                // protyle.wysiwyg.element.querySelectorAll('[data-type="NodeBlockQueryEmbed"]').forEach((item) => {
                //     if (item.getAttribute("data-node-id") === operation.id) {
                //         item.removeAttribute("data-render");
                //         blockRender(protyle, item);
                //     }
                // });
                protyle.wysiwyg.element.querySelectorAll("[parent-heading]").forEach(item => {
                    item.remove();
                });
            }
        });

        // 删除仅有的折叠标题后展开内容为空
        if (protyle.wysiwyg.element.childElementCount === 0 &&
            // 聚焦时不需要新增块，否则会导致 https://github.com/lonelyor/SourceFlow/issues/12326 第一点
            !protyle.block.showAll) {
            const newID = Lute.NewNodeID();
            const emptyElement = genEmptyElement(false, true, newID);
            protyle.wysiwyg.element.insertAdjacentElement("afterbegin", emptyElement);
            transaction(protyle, [{
                action: "insert",
                data: emptyElement.outerHTML,
                id: newID,
                parentID: protyle.block.parentID
            }]);
            // 不能撤销，否则就无限循环了
            focusByWbr(emptyElement, range);
        }
    });
};

export const updateEmbed = (protyle: IProtyle, operation: IOperation) => {
    let updatedEmbed = false;

    const updateHTML = (item: Element, html: string) => {
        const tempElement = document.createElement("template");
        tempElement.innerHTML = protyle.lute.SpinBlockDOM(html);
        tempElement.content.querySelectorAll('[contenteditable="true"]').forEach(editItem => {
            editItem.setAttribute("contenteditable", "false");
        });
        tempElement.content.querySelectorAll(".protyle-wysiwyg--select").forEach(selectItem => {
            selectItem.classList.remove("protyle-wysiwyg--select");
        });
        const wbrElement = tempElement.content.querySelector("wbr");
        if (wbrElement) {
            wbrElement.remove();
        }
        item.outerHTML = tempElement.innerHTML;
        updatedEmbed = true;
    };

    const allTempElement = document.createElement("template");
    allTempElement.innerHTML = operation.data;
    protyle.wysiwyg.element.querySelectorAll('[data-type="NodeBlockQueryEmbed"]').forEach((item) => {
        const matchElement = item.querySelectorAll(`[data-node-id="${operation.id}"]`);
        if (matchElement.length > 0) {
            matchElement.forEach(embedItem => {
                updateHTML(embedItem, operation.data);
            });
        } else {
            item.querySelectorAll(".protyle-wysiwyg__embed").forEach(embedBlockItem => {
                const newTempElement = allTempElement.content.querySelector(`[data-node-id="${embedBlockItem.getAttribute("data-id")}"]`);
                if (newTempElement && !isInEmbedBlock(newTempElement)) {
                    updateHTML(embedBlockItem.querySelector("[data-node-id]"), newTempElement.outerHTML);
                }
            });
        }
    });
    if (updatedEmbed) {
        processRender(protyle.wysiwyg.element);
        highlightRender(protyle.wysiwyg.element);
        avRender(protyle.wysiwyg.element, protyle);
    }
};

export const deleteBlock = (updateElements: Element[], id: string, protyle: IProtyle, isUndo: boolean) => {
    if (isUndo && updateElements[0]) {
        focusSideBlock(updateElements[0]);
    }
    updateElements.forEach(item => {
        if (isUndo) {
            // https://github.com/lonelyor/SourceFlow/issues/13617
            item.remove();
        } else {
            // 需移除顶层，否则删除唯一的列表项后列表无法清除干净 https://github.com/lonelyor/SourceFlow/issues/12326 第一点
            const topElement = getTopAloneElement(item);
            if (topElement) {
                topElement.remove();
            }
        }
    });
    // 更新 ws 嵌入块
    protyle.wysiwyg.element.querySelectorAll('[data-type="NodeBlockQueryEmbed"]').forEach((item) => {
        if (item.querySelector(`[data-node-id="${id}"]`)) {
            item.removeAttribute("data-render");
            blockRender(protyle, item);
        }
    });
};

export const updateBlock = (updateElements: Element[], protyle: IProtyle, operation: IOperation, isUndo: boolean) => {
    updateElements.forEach(item => {
        // 图标撤销后无法渲染
        if (item.getAttribute("data-subtype") === "echarts") {
            item.outerHTML = protyle.lute.SpinBlockDOM(operation.data);
        } else {
            item.outerHTML = operation.data;
        }
    });
    Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`)).find(item => {
        if (!isInEmbedBlock(item)) {
            if (item.getAttribute("data-type") === "NodeBlockQueryEmbed") {
                item.removeAttribute("data-render");
            }
            updateElements[0] = item;
            return true;
        }
    });
    const wbrElement = updateElements[0].querySelector("wbr");
    if (isUndo) {
        const range = getEditorRange(updateElements[0]);
        if (wbrElement) {
            focusByWbr(updateElements[0], range);
        } else {
            focusBlock(updateElements[0]);
        }
    } else if (wbrElement) {
        wbrElement.remove();
    }
    processRender(updateElements.length === 1 ? updateElements[0] : protyle.wysiwyg.element);
    highlightRender(updateElements.length === 1 ? updateElements[0] : protyle.wysiwyg.element);
    avRender(updateElements.length === 1 ? updateElements[0] : protyle.wysiwyg.element, protyle);
    blockRender(protyle, updateElements.length === 1 ? updateElements[0] : protyle.wysiwyg.element);
    // 更新 ws 嵌入块
    updateEmbed(protyle, operation);
};

// 用于推送和撤销

export const removeUnfoldRepeatBlock = (html: string, protyle: IProtyle) => {
    const temp = document.createElement("template");
    temp.innerHTML = html;
    Array.from(temp.content.children).forEach(item => {
        protyle.wysiwyg.element.querySelector(`[data-node-id="${item.getAttribute("data-node-id")}"]`)?.remove();
    });
};


let transactionsTimeout: number;
export const transaction = (protyle: IProtyle, doOperations: IOperation[], undoOperations?: IOperation[]) => {
    if (doOperations.length === 0) {
        return;
    }
    if (!protyle) {
        // 文档树中点开属性->数据库后的变更操作 & 文档树添加到数据库
        fetchPost("/api/transactions", {
            session: Constants.SOURCEFLOW_APPID,
            app: Constants.SOURCEFLOW_APPID,
            transactions: [{
                doOperations
            }]
        });
        return;
    }

    const lastTransaction = window.sourceflow.transactions[window.sourceflow.transactions.length - 1];
    let needDebounce = false;
    const time = new Date().getTime();
    if (lastTransaction && lastTransaction.doOperations.length === 1 && lastTransaction.doOperations[0].action === "update" &&
        doOperations.length === 1 && doOperations[0].action === "update" &&
        lastTransaction.doOperations[0].id === doOperations[0].id &&
        protyle.transactionTime - time < Constants.TIMEOUT_INPUT) {
        needDebounce = true;
    }
    if (undoOperations) {
        if (window.sourceflow.config.fileTree.openFilesUseCurrentTab && protyle.model) {
            protyle.model.headElement.classList.remove("item--unupdate");
        }
        protyle.updated = true;
        if (needDebounce) {
            protyle.undo.replace(doOperations, protyle);
        } else {
            protyle.undo.add(doOperations, undoOperations, protyle);
        }
    }
    // 加速折叠 https://github.com/lonelyor/SourceFlow/issues/11828
    if ((doOperations.length === 1 && (
        doOperations[0].action === "unfoldHeading" || doOperations[0].action === "setAttrViewBlockView" ||
        (doOperations[0].action === "setAttrs" && doOperations[0].data.startsWith('{"fold":'))
    )) || (doOperations.length === 2 && doOperations[0].action === "insertAttrViewBlock")) {
        // 防止 needDebounce 为 true
        protyle.transactionTime = time + Constants.TIMEOUT_INPUT * 2;
        fetchPost("/api/transactions", {
            session: protyle.id,
            app: Constants.SOURCEFLOW_APPID,
            transactions: [{
                doOperations,
                undoOperations
            }]
        }, (response) => {
            response.data[0].doOperations.forEach((operation: IOperation) => {
                if (operation.action === "unfoldHeading" || operation.action === "foldHeading") {
                    processFold(operation, protyle);
                } else if (operation.action === "setAttrs") {
                    const gutterFoldElement = protyle.gutter.element.querySelector('[data-type="fold"]');
                    if (gutterFoldElement) {
                        gutterFoldElement.removeAttribute("disabled");
                    }
                    // 仅在 alt+click 箭头折叠时才会触发
                    protyle.wysiwyg.element.querySelectorAll('[data-type="NodeBlockQueryEmbed"]').forEach((item) => {
                        if (item.querySelector(`[data-node-id="${operation.id}"]`)) {
                            item.removeAttribute("data-render");
                            blockRender(protyle, item);
                        }
                    });
                }
            });
        });
        return;
    }
    window.clearTimeout(transactionsTimeout);
    if (needDebounce) {
        // 不能覆盖 undoOperations https://github.com/lonelyor/SourceFlow/issues/3727
        window.sourceflow.transactions[window.sourceflow.transactions.length - 1].protyle = protyle;
        window.sourceflow.transactions[window.sourceflow.transactions.length - 1].doOperations = doOperations;
    } else {
        window.sourceflow.transactions.push({
            protyle,
            doOperations,
            undoOperations
        });
    }
    protyle.transactionTime = time;
    transactionsTimeout = window.setTimeout(() => {
        promiseTransaction();
    }, Constants.TIMEOUT_INPUT * 2);

    // 插入块后会导致高度变化，从而产生再次定位 https://github.com/lonelyor/SourceFlow/issues/11798
    doOperations.find(item => {
        if (item.action === "insert") {
            protyle.observerLoad?.disconnect();
            return true;
        }
    });
};

const processFold = (operation: IOperation, protyle: IProtyle) => {
    if (operation.action === "unfoldHeading" || operation.action === "foldHeading") {
        const gutterFoldElement = protyle.gutter.element.querySelector('[data-type="fold"]');
        if (gutterFoldElement) {
            gutterFoldElement.removeAttribute("disabled");
        }
        if (operation.action === "unfoldHeading") {
            const scrollTop = protyle.contentElement.scrollTop;
            protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`).forEach(item => {
                const embedElement = isInEmbedBlock(item);
                if (embedElement) {
                    embedElement.removeAttribute("data-render");
                    blockRender(protyle, embedElement);
                    return;
                }
                if (!item.lastElementChild.classList.contains("protyle-attr")) {
                    item.lastElementChild.remove();
                }
                removeUnfoldRepeatBlock(operation.retData, protyle);
                item.insertAdjacentHTML("afterend", operation.retData);
                if (operation.data === "remove") {
                    // https://github.com/lonelyor/SourceFlow/issues/2188
                    const selection = getSelection();
                    if (selection.rangeCount > 0 && item.contains(selection.getRangeAt(0).startContainer)) {
                        focusBlock(item.nextElementSibling, undefined, true);
                    }
                    item.remove();
                }
            });
            if (protyle.disabled) {
                disabledProtyle(protyle);
            }
            processRender(protyle.wysiwyg.element);
            highlightRender(protyle.wysiwyg.element);
            avRender(protyle.wysiwyg.element, protyle);
            blockRender(protyle, protyle.wysiwyg.element);
            if (operation.context?.focusId) {
                const focusElement = protyle.wysiwyg.element.querySelector(`[data-node-id="${operation.context.focusId}"]`);
                focusBlock(focusElement);
                scrollCenter(protyle, focusElement);
            } else {
                protyle.contentElement.scrollTop = scrollTop;
                protyle.scroll.lastScrollTop = scrollTop;
            }
            return;
        }
        protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`).forEach(item => {
            const embedElement = isInEmbedBlock(item);
            if (embedElement) {
                embedElement.removeAttribute("data-render");
                blockRender(protyle, embedElement);
            }
        });
        // 折叠标题后未触发动态加载 https://github.com/lonelyor/SourceFlow/issues/4168
        if (protyle.wysiwyg.element.lastElementChild.getAttribute("data-eof") !== "2" &&
            !protyle.scroll.element.classList.contains("fn__none") &&
            protyle.contentElement.scrollHeight - protyle.contentElement.scrollTop < protyle.contentElement.clientHeight * 2    // https://github.com/lonelyor/SourceFlow/issues/7785
        ) {
            fetchPost("/api/filetree/getDoc", {
                id: protyle.wysiwyg.element.lastElementChild.getAttribute("data-node-id"),
                mode: 2,
                size: window.sourceflow.config.editor.dynamicLoadBlocks,
            }, getResponse => {
                onGet({
                    data: getResponse,
                    protyle,
                    action: [Constants.CB_GET_APPEND, Constants.CB_GET_UNCHANGEID],
                });
            });
        }
        return;
    }
};

export const updateTransaction = (protyle: IProtyle, id: string, newHTML: string, html: string) => {
    if (newHTML === html) {
        return;
    }
    transaction(protyle, [{
        id,
        data: newHTML,
        action: "update"
    }], [{
        id,
        data: html,
        action: "update"
    }]);
};

export const updateBatchTransaction = (nodeElements: Element[], protyle: IProtyle, cb: (e: HTMLElement) => void) => {
    const operations: IOperation[] = [];
    const undoOperations: IOperation[] = [];
    nodeElements.forEach((element) => {
        const id = element.getAttribute("data-node-id");
        element.classList.remove("protyle-wysiwyg--select");
        element.removeAttribute("select-start");
        element.removeAttribute("select-end");
        undoOperations.push({
            action: "update",
            id,
            data: element.outerHTML
        });
        cb(element as HTMLElement);
        operations.push({
            action: "update",
            id,
            data: element.outerHTML
        });
    });
    transaction(protyle, operations, undoOperations);
};
