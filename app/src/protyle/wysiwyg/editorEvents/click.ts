import {enableLuteMarkdownSyntax, getTextStar, paste, restoreLuteMarkdownSyntax} from "../../util/paste";
import {
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByClassName,
    isInEmbedBlock,
} from "../../util/hasClosest";
import {
    focusBlock,
    focusByRange,
    focusByWbr,
    focusSideBlock,
    getEditorRange,
    getSelectionOffset,
    setFirstNodeRange,
    setInsertWbrHTML,
    setLastNodeRange,
} from "../../util/selection";
import {Constants} from "../../../constants";
import {isMobile} from "../../../util/functions";
import {previewDocImage} from "../../preview/image";
import {
    contentMenu,
    enterBack,
    fileAnnotationRefMenu,
    imgMenu,
    inlineMathMenu,
    linkMenu,
    refMenu,
    setFold,
    tagMenu,
    zoomOut
} from "../../../menus/protyle";
import * as dayjs from "dayjs";
import {dropEvent} from "../../util/editorCommonEvent";
import {input} from "../input";
import {
    getContenteditableElement,
    getNextBlock,
    getTopAloneElement,
    hasNextSibling,
    hasPreviousSibling,
    isEndOfBlock,
    isNotEditBlock
} from "../getBlock";
import {transaction, updateTransaction} from "../transaction";
import {hideElements} from "../../ui/hideElements";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif
import {getEnableHTML, removeEmbed} from "../removeEmbed";
import {keydown} from "../keydown";
import {openMobileFileById} from "../../../mobile/editor";
import {removeBlock} from "../remove";
import {highlightRender} from "../../render/highlightRender";
import {openAttr} from "../../../menus/commonMenuItem";
import {blockRender} from "../../render/blockRender";
import {getIdFromSYProtocol, isSYProtocol} from "../../../util/pathName";
/// #if !MOBILE
import {getAllModels} from "../../../layout/getAll";
import {pushBack} from "../../../util/backForward";
import {openFileById} from "../../../editor/util";
import {openGlobalSearch} from "../../../search/util";
/// #else
import {popSearch} from "../../../mobile/menu/search";
/// #endif
import {BlockPanel} from "../../../block/Panel";
import {appendSourceFlowClipboardHTMLComment, copyPlainText, isInIOS, isMac, isOnlyMeta, readClipboard} from "../../util/compatibility";
import {MenuItem} from "../../../menus/Menu";
import {fetchPost, fetchSyncPost} from "../../../util/fetch";
import {onGet} from "../../util/onGet";
import {clearTableCell, isIncludeCell, setTableAlign, updateTableTitle} from "../../util/table";
import {countBlockWord, countSelectWord} from "../../../layout/status";
import {showMessage} from "../../../dialog/message";
import {getBacklinkHeadingMore, loadBreadcrumb} from "../renderBacklink";
import {removeSearchMark} from "../../toolbar/util";
import {activeBlur} from "../../../mobile/util/keyboardToolbar";
import {commonClick} from "../commonClick";
import {avClick, avContextmenu, updateAVName} from "../../render/av/action";
import {selectRow, stickyRow} from "../../render/av/row";
import {showColMenu} from "../../render/av/col";
import {openViewMenu} from "../../render/av/view";
import {checkFold} from "../../../util/noRelyPCFunction";
import {
    addDragFill,
    dragFillCellsValue,
    genCellValueByElement,
    getCellText,
    getPositionByCellElement,
    getTypeByCellElement,
    updateCellsValue
} from "../../render/av/cell";
import {openEmojiPanel, unicode2Emoji} from "../../../emoji";
import {openLink} from "../../../editor/openLink";
import {mathRender} from "../../render/mathRender";
import {editAssetItem} from "../../render/av/asset";
import {img3115} from "../../../boot/compatibleVersion";
import {globalClickHideMenu} from "../../../boot/globalEvent/click";
import {hideTooltip} from "../../../dialog/tooltip";
import {openGalleryItemMenu} from "../../render/av/gallery/util";
import {clearSelect} from "../../util/clear";
import {chartRender} from "../../render/chartRender";
import {reloadProtyle} from "../../util/reload";
import {updateCalloutType} from "../callout";
import {nbsp2space, removeZWJ} from "../../util/normalizeText";
import {getAVViewAttr, getFullWidthAttr} from "../../../util/attrCompat";

import {emojiToMd, escapeInline, setEmptyOutline} from "../helpers";
import type {WYSIWYGEditorEventState, WYSIWYGEventContext} from "../shared";

export const registerClickEvents = (wysiwyg: WYSIWYGEventContext, protyle: IProtyle, state: WYSIWYGEditorEventState) => {
        wysiwyg.element.addEventListener("dblclick", (event: MouseEvent & { target: HTMLElement }) => {
            if (event.target.tagName === "IMG" && !event.target.classList.contains("emoji")) {
                previewDocImage((event.target as HTMLElement).getAttribute("src"), protyle.block.rootID);
                return;
            }
        });
        state.mobileBlur = false;
        wysiwyg.element.addEventListener("click", (event: MouseEvent & { target: HTMLElement }) => {
            if (wysiwyg.preventClick) {
                wysiwyg.preventClick = false;
                return;
            }
            protyle.app.plugins.forEach(item => {
                item.eventBus.emit("click-editorcontent", {
                    protyle,
                    event
                });
            });
            const ctrlIsPressed = isOnlyMeta(event);
            const backlinkBreadcrumbItemElement = hasClosestByClassName(event.target, "protyle-breadcrumb__item");
            if (backlinkBreadcrumbItemElement) {
                const breadcrumbId = backlinkBreadcrumbItemElement.getAttribute("data-id");
                /// #if !MOBILE
                if (breadcrumbId) {
                    if (ctrlIsPressed && !event.shiftKey && !event.altKey) {
                        checkFold(breadcrumbId, (zoomIn) => {
                            openFileById({
                                app: protyle.app,
                                id: breadcrumbId,
                                action: zoomIn ? [Constants.CB_GET_FOCUS, Constants.CB_GET_ALL] : [Constants.CB_GET_FOCUS, Constants.CB_GET_CONTEXT],
                                zoomIn
                            });
                        });
                    } else {
                        loadBreadcrumb(protyle, backlinkBreadcrumbItemElement);
                    }
                } else {
                    // 引用标题时的更多加载
                    getBacklinkHeadingMore(backlinkBreadcrumbItemElement);
                }
                /// #else
                if (breadcrumbId) {
                    loadBreadcrumb(protyle, backlinkBreadcrumbItemElement);
                }
                /// #endif
                event.stopPropagation();
                return;
            }

            setEmptyOutline(protyle, event.target);
            const tableElement = hasClosestByClassName(event.target, "table");
            wysiwyg.element.querySelectorAll(".table").forEach(item => {
                if (item.tagName !== "DIV") {
                    return;
                }
                if (!tableElement || item !== tableElement) {
                    item.querySelector(".table__select").removeAttribute("style");
                }
                if (tableElement && tableElement === item && item.querySelector(".table__select").getAttribute("style")) {
                    // 防止合并单元格的菜单消失
                    event.stopPropagation();
                }
            });
            if (tableElement) {
                if (hasClosestByTag(event.target, "CAPTION")) {
                    updateTableTitle(protyle, tableElement);
                    return;
                }
            }
            // 面包屑定位，需至于前，否则 return 的元素就无法进行面包屑定位
            if (protyle.options.render.breadcrumb) {
                protyle.breadcrumb.render(protyle, false, hasClosestBlock(event.target));
            }
            const range = getEditorRange(wysiwyg.element);
            // https://github.com/lonelyor/SourceFlow/issues/12317
            if (range.startContainer.nodeType !== 3 &&
                (range.startContainer as Element).classList.contains("protyle-action") &&
                range.startContainer.parentElement.classList.contains("code-block")) {
                setFirstNodeRange(range.startContainer.parentElement.querySelector(".hljs").lastElementChild, range);
            }
            // 需放在嵌入块之前，否则嵌入块内的引用、链接、pdf 双链无法点击打开
            const aElement = hasClosestByAttribute(event.target, "data-type", "a") ||
                hasClosestByClassName(event.target, "av__celltext--url");   // 数据库中资源文件、链接、电话、邮箱单元格
            let aLink = aElement ? (aElement.getAttribute("data-href") || "") : "";
            if (aElement && !aLink && aElement.classList.contains("av__celltext--url")) {
                aLink = aElement.textContent.trim();
                if (aElement.dataset.type === "phone") {
                    aLink = "tel:" + aLink;
                } else if (aElement.dataset.type === "email") {
                    aLink = "mailto:" + aLink;
                } else if (aElement.classList.contains("b3-chip")) {
                    aLink = aElement.dataset.url;
                }
            }

            const blockRefElement = hasClosestByAttribute(event.target, "data-type", "block-ref");
            if (blockRefElement || isSYProtocol(aLink)) {
                event.stopPropagation();
                event.preventDefault();
                hideElements(["dialog", "toolbar"], protyle);
                if (range.toString() === "" || event.shiftKey) {
                    let refBlockId: string;
                    if (blockRefElement) {
                        refBlockId = blockRefElement.getAttribute("data-id");
                    } else if (aElement) {
                        refBlockId = getIdFromSYProtocol(aLink);
                    }
                    checkFold(refBlockId, (zoomIn, action, isRoot) => {
                        // 块引用跳转后需要短暂高亮目标块 https://github.com/lonelyor/SourceFlow/issues/11542
                        if (!isRoot) {
                            action.push(Constants.CB_GET_HL);
                        }
                        /// #if MOBILE
                        state.mobileBlur = true;
                        activeBlur();
                        openMobileFileById(protyle.app, refBlockId, zoomIn ? [Constants.CB_GET_ALL] : [Constants.CB_GET_HL, Constants.CB_GET_CONTEXT, Constants.CB_GET_ROOTSCROLL], "start");
                        /// #else
                        if (event.shiftKey) {
                            openFileById({
                                app: protyle.app,
                                id: refBlockId,
                                position: "bottom",
                                action,
                                zoomIn,
                                scrollPosition: "start"
                            });
                            window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));
                        } else if (event.altKey) {
                            openFileById({
                                app: protyle.app,
                                id: refBlockId,
                                position: "right",
                                action,
                                zoomIn,
                                scrollPosition: "start"
                            });
                        } else if (ctrlIsPressed) {
                            openFileById({
                                app: protyle.app,
                                id: refBlockId,
                                keepCursor: true,
                                action: zoomIn ? [Constants.CB_GET_HL, Constants.CB_GET_ALL] : [Constants.CB_GET_HL, Constants.CB_GET_CONTEXT, Constants.CB_GET_ROOTSCROLL],
                                zoomIn,
                                scrollPosition: "start"
                            });
                        } else {
                            openFileById({
                                app: protyle.app,
                                id: refBlockId,
                                action,
                                zoomIn,
                                scrollPosition: "start"
                            });
                        }
                        /// #endif
                    });
                    /// #if !MOBILE
                    if (protyle.model) {
                        // 打开双链需记录到后退中 https://github.com/lonelyor/SourceFlow/issues/801
                        let blockElement: HTMLElement | false;
                        if (blockRefElement) {
                            blockElement = hasClosestBlock(blockRefElement);
                        } else if (aElement) {
                            blockElement = hasClosestBlock(aElement);
                        }
                        if (blockElement) {
                            pushBack(protyle, getEditorRange(wysiwyg.element), blockElement);
                        }
                    }
                    /// #endif
                    return;
                }
            }
            /// #if MOBILE
            // https://github.com/lonelyor/SourceFlow/issues/10513
            const virtualRefElement = hasClosestByAttribute(event.target, "data-type", "virtual-block-ref");
            if (virtualRefElement && range.toString() === "") {
                event.stopPropagation();
                event.preventDefault();
                const blockElement = hasClosestBlock(virtualRefElement);
                if (blockElement) {
                    fetchPost("/api/block/getBlockDefIDsByRefText", {
                        anchor: virtualRefElement.textContent,
                        excludeIDs: [blockElement.getAttribute("data-node-id")]
                    }, (response) => {
                        checkFold(response.data.refDefs[0].refID, (zoomIn) => {
                            state.mobileBlur = true;
                            activeBlur();
                            openMobileFileById(protyle.app, response.data.refDefs[0].refID, zoomIn ? [Constants.CB_GET_ALL] : [Constants.CB_GET_HL, Constants.CB_GET_CONTEXT, Constants.CB_GET_ROOTSCROLL]);
                        });
                    });
                }
                return;
            }
            /// #endif

            const fileElement = hasClosestByAttribute(event.target, "data-type", "file-annotation-ref");
            if (fileElement && range.toString() === "") {
                event.stopPropagation();
                event.preventDefault();
                openLink(protyle, fileElement.getAttribute("data-id"), event, ctrlIsPressed);
                return;
            }

            if (aElement &&
                // https://github.com/lonelyor/SourceFlow/issues/11980
                (event.shiftKey || range.toString() === "") &&
                // 如果aLink 为空时，当 data-type="a inline-math" 可继续后续操作
                aLink) {
                event.stopPropagation();
                event.preventDefault();
                openLink(protyle, aLink, event, ctrlIsPressed);
                return;
            }

            if (aElement && aElement.classList.contains("av__celltext--url") && !aLink) {
                let index = 0;
                Array.from(aElement.parentElement.children).find((item, i) => {
                    if (item === aElement) {
                        index = i;
                        return true;
                    }
                });
                editAssetItem({
                    protyle,
                    cellElements: [aElement.parentElement],
                    blockElement: hasClosestBlock(aElement) as HTMLElement,
                    content: aElement.getAttribute("data-url"),
                    type: "file",
                    name: aElement.getAttribute("data-name"),
                    index,
                    rect: aElement.getBoundingClientRect()
                });
                return;
            }

            const tagElement = hasClosestByAttribute(event.target, "data-type", "tag");
            if (tagElement && !event.altKey && !event.shiftKey && range.toString() === "") {
                /// #if !MOBILE
                openGlobalSearch(protyle.app, `#${tagElement.textContent}#`, !ctrlIsPressed, {method: 0});
                hideElements(["dialog"]);
                /// #else
                popSearch(protyle.app, {
                    hasReplace: false,
                    method: 0,
                    hPath: "",
                    idPath: [],
                    k: `#${tagElement.textContent}#`,
                    r: "",
                    page: 1,
                });
                /// #endif
                return;
            }

            if (window.sourceflow.isPublish) {
                const passwordButtonElement = hasClosestByClassName(event.target, "protyle-password__button");
                if (passwordButtonElement) {
                    fetchPost("/api/filetree/authFilePublishAccess", {
                        id: passwordButtonElement.parentElement.parentElement.getAttribute("data-node-id"),
                        password: passwordButtonElement.parentElement.querySelector("input").value
                    }, (response) => {
                        if (response.msg) {
                            showMessage(response.msg);
                        } else {
                            reloadProtyle(protyle, true);
                            /// #if !MOBILE
                            getAllModels().outline.forEach(item => {
                                if (item.blockId === protyle.block.rootID) {
                                    fetchPost("/api/outline/getDocOutline", {
                                        id: item.blockId,
                                        preview: item.isPreview
                                    }, response => {
                                        item.update(response);
                                    });
                                }
                            });
                            /// #endif
                        }
                    });
                    event.stopPropagation();
                    return;
                }
            }

            const embedItemElement = hasClosestByClassName(event.target, "protyle-wysiwyg__embed");
            if (embedItemElement) {
                const embedId = embedItemElement.getAttribute("data-id");
                checkFold(embedId, (zoomIn, action) => {
                    /// #if MOBILE
                    state.mobileBlur = true;
                    activeBlur();
                    openMobileFileById(protyle.app, embedId, zoomIn ? [Constants.CB_GET_ALL] : [Constants.CB_GET_HL, Constants.CB_GET_CONTEXT, Constants.CB_GET_ROOTSCROLL]);
                    /// #else
                    if (event.shiftKey) {
                        openFileById({
                            app: protyle.app,
                            id: embedId,
                            position: "bottom",
                            action,
                            zoomIn
                        });
                    } else if (event.altKey) {
                        openFileById({
                            app: protyle.app,
                            id: embedId,
                            position: "right",
                            action,
                            zoomIn
                        });
                    } else if (ctrlIsPressed) {
                        openFileById({
                            app: protyle.app,
                            id: embedId,
                            action: zoomIn ? [Constants.CB_GET_HL, Constants.CB_GET_ALL] : [Constants.CB_GET_HL, Constants.CB_GET_CONTEXT],
                            zoomIn,
                            keepCursor: true,
                        });
                    } else if (!protyle.disabled) {
                        window.sourceflow.blockPanels.push(new BlockPanel({
                            app: protyle.app,
                            targetElement: embedItemElement,
                            isBacklink: false,
                            refDefs: [{refID: embedId}]
                        }));
                    }
                    /// #endif
                });
                // https://github.com/lonelyor/SourceFlow/issues/12585
                if (!ctrlIsPressed) {
                    event.stopPropagation();
                    return;
                }
            }

            if (commonClick(event, protyle)) {
                return;
            }

            if (hasTopClosestByClassName(event.target, "protyle-action__copy")) {
                return;
            }

            const editElement = hasClosestByClassName(event.target, "protyle-action__edit");
            if (editElement && !protyle.disabled) {
                protyle.toolbar.showRender(protyle, editElement.parentElement.parentElement);
                event.stopPropagation();
                event.preventDefault();
                return;
            }

            const menuElement = hasClosestByClassName(event.target, "protyle-action__menu");
            if (menuElement) {
                protyle.gutter.renderMenu(protyle, menuElement.parentElement.parentElement);
                /// #if MOBILE
                window.sourceflow.menus.menu.fullscreen();
                /// #else
                const rect = menuElement.getBoundingClientRect();
                window.sourceflow.menus.menu.popup({
                    x: rect.left,
                    y: rect.top,
                    isLeft: true
                });
                /// #endif
                event.stopPropagation();
                event.preventDefault();
                return;
            }

            const reloadElement = hasClosestByClassName(event.target, "protyle-action__reload");
            if (reloadElement) {
                const embedReloadElement = isInEmbedBlock(reloadElement);
                if (embedReloadElement) {
                    embedReloadElement.removeAttribute("data-render");
                    blockRender(protyle, embedReloadElement);
                } else {
                    const blockElement = hasClosestBlock(reloadElement);
                    if (blockElement && blockElement.getAttribute("data-subtype") === "echarts") {
                        blockElement.removeAttribute("data-render");
                        chartRender(blockElement);
                    }
                }
                event.stopPropagation();
                event.preventDefault();
                return;
            }

            const languageElement = hasClosestByClassName(event.target, "protyle-action__language");
            if (languageElement && !protyle.disabled && !ctrlIsPressed) {
                protyle.toolbar.showCodeLanguage(protyle, [languageElement]);
                event.stopPropagation();
                event.preventDefault();
                return;
            }

            // 需放在属性后，否则数学公式无法点击属性；需放在 action 后，否则嵌入块的的 action 无法打开；需放在嵌入块后，否则嵌入块中的数学公式会被打开
            const mathElement = hasClosestByAttribute(event.target, "data-subtype", "math");
            if (!event.shiftKey && !ctrlIsPressed && mathElement && !protyle.disabled) {
                protyle.toolbar.showRender(protyle, mathElement);
                event.stopPropagation();
                return;
            }

            const actionElement = hasClosestByClassName(event.target, "protyle-action");
            if (actionElement) {
                const type = actionElement.parentElement.parentElement.getAttribute("data-type");
                if (type === "img" && !protyle.disabled) {
                    imgMenu(protyle, range, actionElement.parentElement.parentElement, {
                        clientX: event.clientX + 4,
                        clientY: event.clientY
                    });
                    event.stopPropagation();
                    return;
                } else if (actionElement.parentElement.classList.contains("li")) {
                    const actionId = actionElement.parentElement.getAttribute("data-node-id");
                    if (event.altKey && !protyle.disabled) {
                        // 展开/折叠当前层级的所有列表项
                        if (actionElement.parentElement.parentElement.classList.contains("protyle-wysiwyg")) {
                            // 缩放列表项
                            setFold(protyle, actionElement.parentElement);
                        } else {
                            let hasFold = true;
                            const oldHTML = actionElement.parentElement.parentElement.outerHTML;
                            Array.from(actionElement.parentElement.parentElement.children).find((listItemElement) => {
                                if (listItemElement.classList.contains("li")) {
                                    if (listItemElement.getAttribute("fold") !== "1" && listItemElement.childElementCount > 3) {
                                        hasFold = false;
                                        return true;
                                    }
                                }
                            });
                            Array.from(actionElement.parentElement.parentElement.children).find((listItemElement) => {
                                if (listItemElement.classList.contains("li")) {
                                    if (hasFold) {
                                        listItemElement.removeAttribute("fold");
                                    } else if (listItemElement.childElementCount > 3) {
                                        listItemElement.setAttribute("fold", "1");
                                    }
                                }
                            });
                            updateTransaction(protyle, actionElement.parentElement.parentElement.getAttribute("data-node-id"), actionElement.parentElement.parentElement.outerHTML, oldHTML);
                        }
                        hideElements(["gutter"], protyle);
                    } else if (event.shiftKey && !protyle.disabled) {
                        openAttr(actionElement.parentElement, "bookmark", protyle);
                    } else if (ctrlIsPressed) {
                        zoomOut({protyle, id: actionId});
                    } else {
                        if (actionElement.classList.contains("protyle-action--task")) {
                            if (!protyle.disabled) {
                                const html = actionElement.parentElement.outerHTML;
                                if (actionElement.parentElement.classList.contains("protyle-task--done")) {
                                    actionElement.querySelector("use").setAttribute("xlink:href", "#iconUncheck");
                                    actionElement.parentElement.classList.remove("protyle-task--done");
                                } else {
                                    actionElement.querySelector("use").setAttribute("xlink:href", "#iconCheck");
                                    actionElement.parentElement.classList.add("protyle-task--done");
                                }
                                actionElement.parentElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                                updateTransaction(protyle, actionId, actionElement.parentElement.outerHTML, html);
                            }
                        } else if (window.sourceflow.config.editor.listItemDotNumberClickFocus) {
                            if (protyle.block.showAll && protyle.block.id === actionId) {
                                enterBack(protyle, actionId);
                            } else {
                                zoomOut({protyle, id: actionId});
                            }
                        }
                    }
                    event.stopPropagation();
                    return;
                }
            }

            const selectElement = hasClosestByClassName(event.target, "hr") ||
                hasClosestByClassName(event.target, "iframe");
            if (!event.shiftKey && !ctrlIsPressed && selectElement) {
                selectElement.classList.add("protyle-wysiwyg--select");
                globalClickHideMenu(event.target);
                event.stopPropagation();
                return;
            }

            const imgElement = hasTopClosestByClassName(event.target, "img");
            if (!event.shiftKey && !ctrlIsPressed && imgElement) {
                imgElement.classList.add("img--select");
                const nextSibling = hasNextSibling(imgElement);
                if (nextSibling) {
                    if (nextSibling.textContent.startsWith(Constants.ZWSP)) {
                        range.setStart(nextSibling, 1);
                    } else {
                        range.setStart(nextSibling, 0);
                    }
                    range.collapse(true);
                    focusByRange(range);
                    // 需等待 range 更新再次进行渲染
                    if (protyle.options.render.breadcrumb) {
                        protyle.breadcrumb.render(protyle);
                    }
                }
                return;
            }

            const calloutTitleElement = hasTopClosestByClassName(event.target, "callout-title");
            if (!protyle.disabled && !event.shiftKey && !ctrlIsPressed && calloutTitleElement) {
                updateCalloutType([hasClosestBlock(calloutTitleElement) as HTMLElement], protyle);
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const calloutIconElement = hasTopClosestByClassName(event.target, "callout-icon");
            if (!protyle.disabled && !event.shiftKey && !ctrlIsPressed && calloutIconElement) {
                const nodeElement = hasClosestBlock(calloutIconElement);
                if (nodeElement) {
                    const emojiRect = calloutIconElement.getBoundingClientRect();
                    openEmojiPanel("", "av", {
                        x: emojiRect.left,
                        y: emojiRect.bottom,
                        h: emojiRect.height,
                        w: emojiRect.width
                    }, (unicode) => {
                        const oldHTML = nodeElement.outerHTML;
                        let emojiHTML;
                        if (unicode.startsWith("api/icon/getDynamicIcon")) {
                            emojiHTML = `<img class="callout-img" src="${unicode}"/>`;
                        } else if (unicode.indexOf(".") > -1) {
                            emojiHTML = `<img class="callout-img" src="/emojis/${unicode}">`;
                        } else {
                            emojiHTML = unicode2Emoji(unicode);
                        }
                        if (unicode === "") {
                            const subType = nodeElement.getAttribute("data-subtype");
                            if (subType === "NOTE") {
                                emojiHTML = "✏️";
                            } else if (subType === "TIP") {
                                emojiHTML = "💡";
                            } else if (subType === "IMPORTANT") {
                                emojiHTML = "❗";
                            } else if (subType === "WARNING") {
                                emojiHTML = "⚠️";
                            } else if (subType === "CAUTION") {
                                emojiHTML = "🚨";
                            }
                        }
                        calloutIconElement.innerHTML = emojiHTML;
                        updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
                        focusBlock(nodeElement);
                    }, calloutIconElement.querySelector("img"));
                }
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            const emojiElement = hasTopClosestByClassName(event.target, "emoji");
            if (!protyle.disabled && !event.shiftKey && !ctrlIsPressed && emojiElement) {
                const nodeElement = hasClosestBlock(emojiElement);
                if (nodeElement) {
                    const emojiRect = emojiElement.getBoundingClientRect();
                    openEmojiPanel("", "av", {
                        x: emojiRect.left,
                        y: emojiRect.bottom,
                        h: emojiRect.height,
                        w: emojiRect.width
                    }, (unicode) => {
                        emojiElement.insertAdjacentHTML("afterend", "<wbr>");
                        const oldHTML = nodeElement.outerHTML;
                        let emojiHTML;
                        if (unicode.startsWith("api/icon/getDynamicIcon")) {
                            emojiHTML = `<img class="emoji" src="${unicode}"/>`;
                        } else if (unicode.indexOf(".") > -1) {
                            const emojiList = unicode.split(".");
                            emojiHTML = `<img alt="${emojiList[0]}" class="emoji" src="/emojis/${unicode}" title="${emojiList[0]}">`;
                        } else {
                            emojiHTML = unicode2Emoji(unicode);
                        }
                        emojiElement.outerHTML = emojiHTML;
                        hideElements(["dialog"]);
                        updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
                        focusByWbr(nodeElement, range);
                    }, emojiElement);
                }
                return;
            }

            if (avClick(protyle, event)) {
                return;
            }

            setTimeout(() => {
                // 选中后，在选中的文字上点击需等待 range 更新
                let newRange = getEditorRange(wysiwyg.element);
                // 点击两侧或间隙导致光标跳转到开头 https://github.com/lonelyor/SourceFlow/issues/16179
                if (hasClosestBlock(event.target) !== hasClosestBlock(newRange.startContainer) &&
                    wysiwyg.element.querySelector("[data-node-id]")?.contains(newRange.startContainer)) {
                    const rect = wysiwyg.element.getBoundingClientRect();
                    let rangeElement = document.elementFromPoint(rect.left + rect.width / 2, event.clientY);
                    if (rangeElement === wysiwyg.element) {
                        rangeElement = document.elementFromPoint(rect.left + rect.width / 2, event.clientY + 8);
                    }
                    let blockElement = hasClosestBlock(rangeElement);
                    if (blockElement) {
                        const embedElement = isInEmbedBlock(blockElement);
                        if (embedElement) {
                            blockElement = embedElement;
                        }
                        newRange = focusBlock(blockElement, undefined, event.clientX < rect.left + parseInt(wysiwyg.element.style.paddingLeft)) || newRange;
                        if (protyle.options.render.breadcrumb) {
                            protyle.breadcrumb.render(protyle, false, blockElement);
                        }
                    }
                }
                // https://github.com/lonelyor/SourceFlow/issues/10357
                const attrElement = hasClosestByClassName(newRange.endContainer, "protyle-attr");
                if (attrElement) {
                    newRange = setLastNodeRange(attrElement.previousElementSibling, newRange, false);
                }
                // https://github.com/lonelyor/SourceFlow/issues/14481
                const inlineMathElement = hasClosestByAttribute(newRange.startContainer, "data-type", "inline-math");
                if (inlineMathElement) {
                    newRange.setEndAfter(inlineMathElement);
                    newRange.collapse(false);
                    focusByRange(newRange);
                }
                /// #if !MOBILE
                if (newRange.toString().replace(Constants.ZWSP, "") !== "") {
                    protyle.toolbar.render(protyle, newRange);
                } else {
                    // https://github.com/lonelyor/SourceFlow/issues/9785
                    protyle.toolbar.range = newRange;
                }
                /// #endif
                if (!protyle.wysiwyg.element.querySelector(".protyle-wysiwyg--select")) {
                    countSelectWord(newRange, protyle.block.rootID);
                }
                if (getSelection().rangeCount === 0 && !state.mobileBlur) {
                    // https://github.com/lonelyor/SourceFlow/issues/14589
                    // https://github.com/lonelyor/SourceFlow/issues/14569
                    // https://github.com/lonelyor/SourceFlow/issues/5901
                    focusByRange(newRange);
                }
                /// #if !MOBILE
                pushBack(protyle, newRange);
                /// #endif
                state.mobileBlur = false;
            }, (isMobile() || isInIOS()) ? 520 : 0); // Android/iPad 双击慢了出不来

            protyle.hint.enableExtend = false;

            if (wysiwyg.element.querySelector(".protyle-wysiwyg--select") && range.toString() !== "") {
                // 选中块后，文字不能被选中。需在 shift click 之后，防止shift点击单个块出现文字选中
                range.collapse(false);
                focusByRange(range);
            }
        });
};
