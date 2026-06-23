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

import {deleteBlock, removeTopElement, removeUnfoldRepeatBlock, updateBlock, updateEmbed} from "./runtime";

export const onTransaction = (protyle: IProtyle, operation: IOperation, isUndo: boolean) => {
   if (protyle.wysiwyg.element.firstElementChild?.classList.contains("protyle-password")) {
       return;
   }
    const updateElements: Element[] = [];
    Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`)).forEach(item => {
        if (!isInEmbedBlock(item)) {
            updateElements.push(item);
        }
    });
    if (operation.action === "setAttrs") {
        protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`).forEach(item => {
            if (JSON.parse(operation.data).fold === "1") {
                item.setAttribute("fold", "1");
            } else {
                item.removeAttribute("fold");
            }
        });
        return;
    }
    if (operation.action === "unfoldHeading") {
        protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`).forEach(item => {
            item.removeAttribute("fold");
            // undo 会走 transaction
            if (isUndo) {
                return;
            }
            const embedElement = isInEmbedBlock(item);
            if (embedElement) {
                embedElement.removeAttribute("data-render");
                blockRender(protyle, embedElement);
                return;
            }
            if (operation.retData) { // undo 的时候没有 retData
                removeUnfoldRepeatBlock(operation.retData, protyle);
                item.insertAdjacentHTML("afterend", operation.retData);
            }
            if (operation.data === "remove") {
                item.remove();
            }
        });
        if (operation.retData) {
            if (protyle.disabled) {
                disabledProtyle(protyle);
            }
            processRender(protyle.wysiwyg.element);
            highlightRender(protyle.wysiwyg.element);
            avRender(protyle.wysiwyg.element, protyle);
            blockRender(protyle, protyle.wysiwyg.element);
        }
        return;
    }
    if (operation.action === "foldHeading") {
        protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`).forEach(item => {
            item.setAttribute("fold", "1");
            if (!operation.retData) {
                removeFoldHeading(item);
            }
        });
        // undo 会走 transaction
        if (isUndo) {
            return;
        }
        if (operation.retData) {
            operation.retData.forEach((item: string) => {
                let embedElement: HTMLElement | false;
                Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${item}"]`)).find(itemElement => {
                    embedElement = isInEmbedBlock(itemElement);
                    if (embedElement) {
                        return true;
                    }
                    itemElement.remove();
                });
                // 折叠嵌入块的父级
                if (embedElement) {
                    embedElement.removeAttribute("data-render");
                    blockRender(protyle, embedElement);
                }
            });
            if (protyle.wysiwyg.element.childElementCount === 0) {
                zoomOut({
                    protyle,
                    id: protyle.block.rootID,
                    isPushBack: false,
                    focusId: operation.id,
                });
            }
        }
        return;
    }
    if (operation.action === "delete") {
        if (updateElements.length > 0 || !isUndo) {
            deleteBlock(updateElements, operation.id, protyle, isUndo);
        } else if (isUndo) {
            zoomOut({
                protyle,
                id: protyle.block.rootID,
                isPushBack: false,
                focusId: operation.id,
                callback() {
                    Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`)).forEach(item => {
                        if (!isInEmbedBlock(item)) {
                            updateElements.push(item);
                        }
                    });
                    deleteBlock(updateElements, operation.id, protyle, isUndo);
                }
            });
        }
        return;
    }
    if (operation.action === "update") {
        // 缩放后仅更新局部 https://github.com/lonelyor/SourceFlow/issues/14326
        if (updateElements.length === 0) {
            const newUpdateElement = protyle.wysiwyg.element.querySelector("[data-node-id]");
            if (newUpdateElement) {
                const newUpdateId = newUpdateElement.getAttribute("data-node-id");
                const tempElement = document.createElement("template");
                tempElement.innerHTML = operation.data;
                const newTempElement = tempElement.content.querySelector(`[data-node-id="${newUpdateId}"]`);
                if (newTempElement) {
                    updateElements.push(newUpdateElement);
                    operation.data = newTempElement.outerHTML;
                    operation.id = newUpdateId;
                    // https://github.com/lonelyor/SourceFlow/issues/14326#issuecomment-2746140335
                    for (let i = 1; i < protyle.wysiwyg.element.childElementCount; i++) {
                        protyle.wysiwyg.element.childNodes[i].remove();
                        i--;
                    }
                }
            }
        }
        if (updateElements.length > 0) {
            updateBlock(updateElements, protyle, operation, isUndo);
        } else if (isUndo) {
            zoomOut({
                protyle,
                id: protyle.block.rootID,
                isPushBack: false,
                focusId: operation.id,
                callback() {
                    Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`)).forEach(item => {
                        if (!isInEmbedBlock(item)) {
                            updateElements.push(item);
                        }
                    });
                    updateBlock(updateElements, protyle, operation, isUndo);
                }
            });
        } else { // updateElements 没有包含嵌入块，在悬浮层编辑嵌入块时，嵌入块也需要更新
            // 更新 ws 嵌入块
            updateEmbed(protyle, operation);
        }
        return;
    }
    if (operation.action === "updateAttrs") { // 调用接口才推送
        const data = operation.data as any;
        const attrsResult: IObject = {};
        let bookmarkHTML = "";
        let nameHTML = "";
        let aliasHTML = "";
        let memoHTML = "";
        let avHTML = "";
        Object.keys(data.new).forEach(key => {
            attrsResult[key] = data.new[key];
            const escapeHTML = Lute.EscapeHTMLStr(data.new[key]);
            if (key === "bookmark") {
                bookmarkHTML = `<div class="protyle-attr--bookmark">${escapeHTML}</div>`;
            } else if (key === "name") {
                nameHTML = `<div class="protyle-attr--name"><svg><use xlink:href="#iconN"></use></svg>${escapeHTML}</div>`;
            } else if (key === "alias") {
                aliasHTML = `<div class="protyle-attr--alias"><svg><use xlink:href="#iconA"></use></svg>${escapeHTML}</div>`;
            } else if (key === "memo") {
                memoHTML = `<div class="protyle-attr--memo ariaLabel" aria-label="${escapeHTML}" data-position="north"><svg><use xlink:href="#iconM"></use></svg></div>`;
            } else if (key === "custom-avs" && data.new["av-names"]) {
                avHTML = `<div class="protyle-attr--av"><svg><use xlink:href="#iconDatabase"></use></svg>${data.new["av-names"]}</div>`;
            }
        });
        let nodeAttrHTML = bookmarkHTML + nameHTML + aliasHTML + memoHTML + avHTML;
        if (protyle.block.rootID === operation.id) {
            // 文档
            if (protyle.title) {
                if (data.new["custom-avs"] && !data.new["av-names"]) {
                    nodeAttrHTML += protyle.title.element.querySelector(".protyle-attr--av")?.outerHTML || "";
                }
                const refElement = protyle.title.element.querySelector(".protyle-attr--refcount");
                if (refElement) {
                    nodeAttrHTML += refElement.outerHTML;
                }
                if (data.new[Constants.CUSTOM_RIFF_DECKS] && data.new[Constants.CUSTOM_RIFF_DECKS] !== data.old[Constants.CUSTOM_RIFF_DECKS]) {
                    protyle.title.element.style.animation = "addCard 450ms linear";
                    protyle.title.element.setAttribute(Constants.CUSTOM_RIFF_DECKS, data.new[Constants.CUSTOM_RIFF_DECKS]);
                    setTimeout(() => {
                        protyle.title.element.style.animation = "";
                    }, 450);
                } else if (!data.new[Constants.CUSTOM_RIFF_DECKS]) {
                    protyle.title.element.removeAttribute(Constants.CUSTOM_RIFF_DECKS);
                }
                protyle.title.element.querySelector(".protyle-attr").innerHTML = nodeAttrHTML;
            }
            protyle.wysiwyg.renderCustom(attrsResult);
            if (getFullWidthAttr(data.new) !== getFullWidthAttr(data.old)) {
                resize(protyle);
            }
            if (getReadonlyAttr(data.new) !== getReadonlyAttr(data.old)) {
                let customReadOnly = getReadonlyAttr(data.new);
                if (!customReadOnly) {
                    customReadOnly = window.sourceflow.config.editor.readOnly ? "true" : "false";
                }
                if (customReadOnly === "true") {
                    disabledProtyle(protyle);
                } else {
                    enableProtyle(protyle);
                }
            }
            if (data.new.icon !== data.old.icon ||
                data.new["title-img"] !== data.old["title-img"] ||
                data.new.tags !== data.old.tags && protyle.background) {
                /// #if MOBILE
                protyle = window.sourceflow.mobile.editor.protyle;
                /// #endif
                protyle.background.ial.icon = data.new.icon;
                protyle.background.ial.tags = data.new.tags;
                protyle.background.ial["title-img"] = data.new["title-img"];
                protyle.background.render(protyle.background.ial, protyle.block.rootID);
                protyle.model?.parent.setDocIcon(data.new.icon);
            }
            return;
        }
        protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`).forEach((item: HTMLElement) => {
            if (item.getAttribute("data-type") === "NodeThematicBreak") {
                return;
            }
            Object.keys(data.old).forEach(key => {
                item.removeAttribute(key);
                if (key === "custom-avs") {
                    item.removeAttribute("av-names");
                }
            });
            if (data.new.style && data.new[Constants.CUSTOM_RIFF_DECKS] && data.new[Constants.CUSTOM_RIFF_DECKS] !== data.old[Constants.CUSTOM_RIFF_DECKS]) {
                data.new.style += ";animation:addCard 450ms linear";
            }
            Object.keys(data.new).forEach(key => {
                if ("id" === key) {
                    // 设置属性以后不应该给块元素添加 id 属性 No longer add the `id` attribute to block elements after setting the attribute https://github.com/lonelyor/SourceFlow/issues/15327
                    return;
                }

                item.setAttribute(key, data.new[key]);
                if (key === Constants.CUSTOM_RIFF_DECKS &&
                    data.new[Constants.CUSTOM_RIFF_DECKS] !== data.old[Constants.CUSTOM_RIFF_DECKS]) {
                    item.style.animation = "addCard 450ms linear";
                    setTimeout(() => {
                        if (item.parentElement) {
                            item.style.animation = "";
                        } else {
                            protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`).forEach((realItem: HTMLElement) => {
                                realItem.style.animation = "";
                            });
                        }
                    }, 450);
                }
            });
            if (data["data-av-type"]) {
                item.setAttribute("data-av-type", data["data-av-type"]);
            }
            const attrElements = item.querySelectorAll(".protyle-attr");
            const attrElement = attrElements[attrElements.length - 1];
            if (data.new["custom-avs"] && !data.new["av-names"]) {
                nodeAttrHTML += attrElement.querySelector(".protyle-attr--av")?.outerHTML || "";
            }
            const refElement = attrElement.querySelector(".protyle-attr--refcount");
            if (refElement) {
                nodeAttrHTML += refElement.outerHTML;
            }
            attrElement.innerHTML = nodeAttrHTML + Constants.ZWSP;
        });
        return;
    }
    if (operation.action === "move") {
        if (operation.context?.ignoreProcess === "true") {
            return;
        }
        /// #if !MOBILE
        if (updateElements.length === 0) {
            // 打开两个相同的文档 A、A1，从 A 拖拽块 B 到 A1，在后续 ws 处理中，无法获取到拖拽出去的 B
            getAllModels().editor.forEach(editor => {
                const updateCloneElement = editor.editor.protyle.wysiwyg.element.querySelector(`[data-node-id="${operation.id}"]`);
                if (updateCloneElement) {
                    updateElements.push(updateCloneElement.cloneNode(true) as Element);
                }
            });
        }
        if (updateElements.length === 0) {
            // 页签拖入浮窗 https://github.com/lonelyor/SourceFlow/issues/6647
            window.sourceflow.blockPanels.forEach((item) => {
                const updateCloneElement = item.element.querySelector(`[data-node-id="${operation.id}"]`);
                if (updateCloneElement) {
                    updateElements.push(updateCloneElement.cloneNode(true) as Element);
                }
            });
        }
        /// #endif
        // 折叠标题移动到横向超级块的第一个块上后撤销
        if (updateElements.length === 0) {
            const tempEl = document.createElement("div");
            tempEl.setAttribute("data-node-id", operation.id);
            updateElements.push(tempEl);
            fetchPost("/api/block/getBlockDOM", {
                id: operation.id,
            }, (response) => {
                document.querySelector(`[data-node-id="${operation.id}"]`).outerHTML = response.data.dom;
            });
        }
        let range;
        if (isUndo && getSelection().rangeCount > 0) {
            range = getSelection().getRangeAt(0);
            const rangeBlockElement = hasClosestBlock(range.startContainer);
            if (rangeBlockElement) {
                if (getContenteditableElement(rangeBlockElement)) {
                    range.insertNode(document.createElement("wbr"));
                } else {
                    getContenteditableElement(updateElements[0])?.insertAdjacentHTML("afterbegin", "<wbr>");
                }
            }
        }
        let hasFind = false;
        if (operation.previousID && updateElements.length > 0) {
            const previousElement = protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.previousID}"]`);
            if (previousElement.length === 0 && protyle.options.backlinkData && isUndo && getSelection().rangeCount > 0) {
                // 反链面板删除超级块中的最后一个段落块后撤销重做
                const blockElement = hasTopClosestByAttribute(range.startContainer, "data-node-id", null);
                if (blockElement) {
                    blockElement.before(processClonePHElement(updateElements[0].cloneNode(true) as Element));
                    hasFind = true;
                }
            } else {
                previousElement.forEach(item => {
                    if (!isInEmbedBlock(item)) {
                        item.after(processClonePHElement(updateElements[0].cloneNode(true) as Element));
                        hasFind = true;
                    }
                });
            }
        } else if (updateElements.length > 0) {
            const parentElement = protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.parentID}"]`);
            if (!protyle.options.backlinkData && operation.parentID === protyle.block.parentID && !protyle.block.showAll) {
                protyle.wysiwyg.element.prepend(processClonePHElement(updateElements[0].cloneNode(true) as Element));
                hasFind = true;
            } else if (parentElement.length === 0 && protyle.options.backlinkData && isUndo && getSelection().rangeCount > 0) {
                // 反链面板删除超级块中的段落块后撤销再重做 https://github.com/lonelyor/SourceFlow/issues/14496#issuecomment-2771372486
                const topBlockElement = hasTopClosestByAttribute(getSelection().getRangeAt(0).startContainer, "data-node-id", null);
                if (topBlockElement) {
                    topBlockElement.before(processClonePHElement(updateElements[0].cloneNode(true) as Element));
                    hasFind = true;
                }
            } else {
                parentElement.forEach(item => {
                    if (!isInEmbedBlock(item)) {
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
        }
        updateElements.forEach(item => {
            if (hasFind) {
                item.remove();
            } else if (!hasFind && item.parentElement) {
                removeTopElement(item, protyle);
            }
        });
        if (isUndo && range) {
            if (operation.data === "focus") {
                // 标记需要 focus，
                Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`)).find(item => {
                    if (!isInEmbedBlock(item)) {
                        focusBlock(item);
                        return true;
                    }
                });
                document.querySelectorAll("wbr").forEach(item => {
                    item.remove();
                });
            } else {
                focusByWbr(protyle.wysiwyg.element, range);
            }
        }
        // 更新 ws 嵌入块，undo 会在 transaction 中更新
        if (!isUndo) {
            protyle.wysiwyg.element.querySelectorAll('[data-type="NodeBlockQueryEmbed"]').forEach((item) => {
                if (item.querySelector(`[data-node-id="${operation.id}"],[data-node-id="${operation.parentID}"],[data-node-id="${operation.previousID}"]`)) {
                    item.removeAttribute("data-render");
                    blockRender(protyle, item);
                }
            });
        }
        return;
    }
    if (operation.action === "insert") {
        if (operation.context?.ignoreProcess === "true") {
            return;
        }
        const cursorElements = [];
        if (operation.previousID) {
            const previousElement = protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.previousID}"]`);
            if (previousElement.length === 0 && isUndo && protyle.wysiwyg.element.childElementCount === 0) {
                // https://github.com/lonelyor/SourceFlow/issues/15396 操作后撤销
                protyle.wysiwyg.element.innerHTML = operation.data;
                cursorElements.push(protyle.wysiwyg.element.firstElementChild);
            } else if (previousElement.length === 0 && protyle.options.backlinkData && isUndo && getSelection().rangeCount > 0) {
                // 反链面板删除超级块中的最后一个段落块后撤销
                const blockElement = hasClosestBlock(getSelection().getRangeAt(0).startContainer);
                if (blockElement) {
                    blockElement.insertAdjacentHTML("beforebegin", operation.data);
                    cursorElements.push(blockElement.previousElementSibling);
                }
            } else {
                previousElement.forEach(item => {
                    const embedElement = isInEmbedBlock(item);
                    if (embedElement) {
                        // https://github.com/lonelyor/SourceFlow/issues/5524
                        embedElement.removeAttribute("data-render");
                        blockRender(protyle, embedElement);
                    } else {
                        item.insertAdjacentHTML("afterend", operation.data);
                        cursorElements.push(item.nextElementSibling);
                    }
                });
            }
        } else if (operation.nextID) {
            Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.nextID}"]`)).forEach(item => {
                const embedElement = isInEmbedBlock(item);
                if (embedElement) {
                    // https://github.com/lonelyor/SourceFlow/issues/5524
                    embedElement.removeAttribute("data-render");
                    blockRender(protyle, embedElement);
                } else {
                    item.insertAdjacentHTML("beforebegin", operation.data);
                    cursorElements.push(item.previousElementSibling);
                }
            });
        } else {
            const parentElement = protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.parentID}"]`);
            if (!protyle.options.backlinkData && operation.parentID === protyle.block.parentID && !protyle.block.showAll) {
                protyle.wysiwyg.element.insertAdjacentHTML("afterbegin", operation.data);
                cursorElements.push(protyle.wysiwyg.element.firstElementChild);
            } else if (parentElement.length === 0 && protyle.options.backlinkData && isUndo && getSelection().rangeCount > 0) {
                // 反链面板删除超级块中的段落块后撤销
                const blockElement = hasClosestBlock(getSelection().getRangeAt(0).startContainer);
                if (blockElement) {
                    blockElement.insertAdjacentHTML("beforebegin", operation.data);
                    cursorElements.push(blockElement.previousElementSibling);
                }
            } else {
                parentElement.forEach(item => {
                    if (!isInEmbedBlock(item)) {
                        // 列表特殊处理
                        if (item.firstElementChild?.classList.contains("protyle-action")) {
                            item.firstElementChild.insertAdjacentHTML("afterend", operation.data);
                            cursorElements.push(item.firstElementChild.nextElementSibling);
                        } else if (item.classList.contains("callout")) {
                            item.querySelector(".callout-content").insertAdjacentHTML("afterbegin", operation.data);
                            cursorElements.push(item.querySelector("[data-node-id]"));
                        } else {
                            item.insertAdjacentHTML("afterbegin", operation.data);
                            cursorElements.push(item.firstElementChild);
                        }
                    }
                });
            }
        }
        // https://github.com/lonelyor/SourceFlow/issues/4420
        protyle.wysiwyg.element.querySelectorAll('[data-type="NodeHeading"]').forEach(item => {
            if (item.lastElementChild.getAttribute("spin") === "1") {
                item.lastElementChild.remove();
            }
        });
        if (cursorElements.length === 0) {
            return;
        }
        cursorElements.forEach(item => {
            // https://github.com/lonelyor/SourceFlow/issues/16554
            item.querySelector(".protyle-attr--av")?.remove();
            item.removeAttribute("custom-avs");
            item.getAttributeNames().forEach(attr => {
                if (isAVStaticTextAttr(attr)) {
                    item.removeAttribute(attr);
                }
            });
            processRender(item);
            highlightRender(item);
            avRender(item, protyle);
            blockRender(protyle, item);
            const wbrElement = item.querySelector("wbr");
            if (isUndo) {
                if (operation.context?.setRange === "true") {
                    const range = getEditorRange(item);
                    if (wbrElement) {
                        focusByWbr(item, range);
                    } else {
                        focusBlock(item);
                    }
                }
            } else if (wbrElement) {
                wbrElement.remove();
            }
        });
        protyle.wysiwyg.element.querySelectorAll("[parent-heading]").forEach(item => {
            item.remove();
        });
        return;
    }
    if (operation.action === "append") {
        // 目前只有移动块的时候会调用，反连面板就自己点击刷新处理。
        if (!protyle.options.backlinkData) {
            reloadProtyle(protyle, false);
        }
        return;
    }
    if (["addAttrViewCol", "updateAttrViewCol", "updateAttrViewColOptions",
        "updateAttrViewColOption", "updateAttrViewCell", "sortAttrViewRow", "sortAttrViewCol", "setAttrViewColHidden",
        "setAttrViewColWrap", "setAttrViewColWidth", "removeAttrViewColOption", "setAttrViewName", "setAttrViewFilters",
        "setAttrViewSorts", "setAttrViewColCalc", "removeAttrViewCol", "updateAttrViewColNumberFormat", "removeAttrViewBlock",
        "replaceAttrViewBlock", "updateAttrViewColTemplate", "setAttrViewColPin", "addAttrViewView", "setAttrViewColIcon",
        "removeAttrViewView", "setAttrViewViewName", "setAttrViewViewIcon", "duplicateAttrViewView", "sortAttrViewView",
        "updateAttrViewColRelation", "setAttrViewPageSize", "updateAttrViewColRollup", "sortAttrViewKey", "setAttrViewColDesc",
        "duplicateAttrViewKey", "setAttrViewViewDesc", "setAttrViewCoverFrom", "setAttrViewCoverFromAssetKeyID",
        "setAttrViewBlockView", "setAttrViewCardSize", "setAttrViewCardAspectRatio", "hideAttrViewName", "setAttrViewShowIcon",
        "setAttrViewWrapField", "setAttrViewGroup", "removeAttrViewGroup", "hideAttrViewGroup", "sortAttrViewGroup",
        "foldAttrViewGroup", "hideAttrViewAllGroups", "setAttrViewFitImage", "setAttrViewDisplayFieldName",
        "insertAttrViewBlock", "setAttrViewColDateFillSpecificTime", "setAttrViewFillColBackgroundColor", "setAttrViewUpdatedIncludeTime",
        "setAttrViewCreatedIncludeTime"].includes(operation.action)) {
        // 撤销 transaction 会进行推送，需使用推送来进行刷新最新数据 https://github.com/lonelyor/SourceFlow/issues/13607
        if (!isUndo) {
            refreshAV(protyle, operation);
        } else if (operation.action === "setAttrViewName") {
            // setAttrViewName 同文档不会推送，需手动刷新
            Array.from(protyle.wysiwyg.element.querySelectorAll(`.av[data-av-id="${operation.id}"]`)).forEach((item: HTMLElement) => {
                const titleElement = item.querySelector(".av__title") as HTMLElement;
                if (!titleElement) {
                    return;
                }
                titleElement.textContent = operation.data;
                titleElement.dataset.title = operation.data;
            });
        }
        return;
    }
    if (operation.action === "doUpdateUpdated") {
        updateElements.forEach(item => {
            item.setAttribute("updated", operation.data);
        });
        return;
    }
};
