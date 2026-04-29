import {
    hasClosestBlock,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByClassName,
    isInAVBlock,
    isInEmbedBlock
} from "../util/hasClosest";
import {getIconByType} from "../../editor/getIcon";
import {enterBack, iframeMenu, setFold, tableMenu, videoMenu, zoomOut} from "../../menus/protyle";
import {MenuItem} from "../../menus/Menu";
import {copySubMenu, openAttr, openFileAttr} from "../../menus/commonMenuItem";
import {
    copyPlainText,
    isInAndroid,
    isInHarmony,
    isMac,
    isOnlyMeta,
    openByMobile,
    updateHotkeyAfterTip,
    updateHotkeyTip,
    writeNativeSourceFlowHTMLClipboard,
    writeText
} from "../util/compatibility";
import {
    transaction,
    turnsIntoOneTransaction,
    turnsIntoTransaction,
    turnsOneInto,
    updateBatchTransaction,
    updateTransaction
} from "../wysiwyg/transaction";
import {removeBlock} from "../wysiwyg/remove";
import {focusBlock, focusByRange, getEditorRange} from "../util/selection";
import {hideElements} from "../ui/hideElements";
import {highlightRender} from "../render/highlightRender";
import {blockRender} from "../render/blockRender";
import {getContenteditableElement, getParentBlock, getTopAloneElement, isNotEditBlock} from "../wysiwyg/getBlock";
import * as dayjs from "dayjs";
import {fetchPost} from "../../util/fetch";
import {cancelSB, genEmptyElement, getLangByType, insertEmptyBlock, jumpToParent,} from "../../block/util";
import {countBlockWord} from "../../layout/status";
import {Constants} from "../../constants";
import {mathRender} from "../render/mathRender";
import {duplicateBlock} from "../wysiwyg/commonHotkey";
import {movePathTo, useShell} from "../../util/pathName";
import {hintMoveBlock} from "../hint/extend";
import {makeCard, quickMakeCard} from "../../card/makeCard";
import {transferBlockRef} from "../../menus/block";
import {isMobile} from "../../util/functions";
import {AIActions} from "../../ai/actions";
import {activeBlur, renderTextMenu, showKeyboardToolbarUtil} from "../../mobile/util/keyboardToolbar";
import {hideTooltip} from "../../dialog/tooltip";
import {appearanceMenu} from "../toolbar/Font";
import {setPosition} from "../../util/setPosition";
import {emitOpenMenu} from "../../plugin/EventBus";
import {insertAttrViewBlockAnimation, updateHeader} from "../render/av/row";
import {avContextmenu, duplicateCompletely} from "../render/av/action";
import {getPlainText} from "../util/paste";
import {addEditorToDatabase} from "../render/av/addToDatabase";
import {processClonePHElement} from "../render/util";
/// #if !MOBILE
import {openFileById} from "../../editor/util";
import * as path from "path";
/// #endif
/// #if MOBILE
import {openMobileFileById} from "../../mobile/editor";
/// #endif
import {hideMessage, showMessage} from "../../dialog/message";
import {checkFold} from "../../util/noRelyPCFunction";
import {clearSelect} from "../util/clear";
import {chartRender} from "../render/chartRender";
import {appendAssistantContextActions} from "../../assistant/skills/contextActions";
import {canRunCodeBlock, runCodeBlock} from "../codeRun";


    export const renderGutter = (gutterElement: HTMLElement, gutterTip: string, protyle: IProtyle, element: Element, target?: Element) => {
        // https://github.com/lonelyor/SourceFlow/issues/4659
        if (protyle.title && protyle.title.element.getAttribute("data-render") !== "true") {
            return;
        }
        // 防止划选时触碰图标导致 hl 无法移除
        const selectElement = protyle.element.querySelector(".protyle-select");
        if (selectElement && !selectElement.classList.contains("fn__none")) {
            return;
        }
        let html = "";
        let nodeElement = element;
        let space = 0;
        let index = 0;
        let listItem;
        let hideParent = false;
        while (nodeElement) {
            let parentElement = hasClosestBlock(nodeElement.parentElement);
            if (!isInEmbedBlock(nodeElement)) {
                let type;
                if (!hideParent) {
                    type = nodeElement.getAttribute("data-type");
                }
                let dataNodeId = nodeElement.getAttribute("data-node-id");
                if (type === "NodeAttributeView" && target) {
                    const rowElement = hasClosestByClassName(target, "av__row");
                    if (rowElement && !rowElement.classList.contains("av__row--header") && rowElement.dataset.id) {
                        element = rowElement;
                        const bodyElement = hasClosestByClassName(rowElement, "av__body") as HTMLElement;
                        let iconAriaLabel = isMac() ? window.sourceflow.languages.rowTip : window.sourceflow.languages.rowTip.replace("⇧", "Shift+");
                        if (protyle.disabled) {
                            iconAriaLabel = window.sourceflow.languages.rowTip.substring(0, window.sourceflow.languages.rowTip.indexOf("<br"));
                        } else if (rowElement.querySelector('[data-dtype="block"]')?.getAttribute("data-detached") === "true") {
                            iconAriaLabel = window.sourceflow.languages.rowTip.substring(0, window.sourceflow.languages.rowTip.lastIndexOf("<br"));
                        }
                        html = `<button data-type="NodeAttributeViewRowMenu" data-node-id="${dataNodeId}" data-row-id="${rowElement.dataset.id}" data-group-id="${bodyElement.dataset.groupId || ""}" class="ariaLabel" data-position="parentW" aria-label="${iconAriaLabel}"><svg><use xlink:href="#iconDrag"></use></svg><span ${protyle.disabled ? "" : 'draggable="true" class="fn__grab"'}></span></button>`;
                        if (!protyle.disabled) {
                            html = `<button data-type="NodeAttributeViewRow" data-node-id="${dataNodeId}" data-row-id="${rowElement.dataset.id}" data-group-id="${bodyElement.dataset.groupId || ""}" class="ariaLabel" data-position="parentW" aria-label="${isMac() ? window.sourceflow.languages.addBelowAbove : window.sourceflow.languages.addBelowAbove.replace("⌥", "Alt+")}"><svg><use xlink:href="#iconAdd"></use></svg></button>${html}`;
                        }
                        break;
                    }
                }
                if (index === 0) {
                    // 不单独显示，要不然在块的间隔中，gutter 会跳来跳去的
                    if (["NodeBlockquote", "NodeList", "NodeCallout", "NodeSuperBlock"].includes(type)) {
                        if (target && type === "NodeCallout" && hasTopClosestByClassName(target, "callout-info")) {
                            // Callout 标题需显示
                        } else {
                            return;
                        }
                    }

                    let topElement = getTopAloneElement(nodeElement);
                    // 提示下方仅有单个列表
                    if (topElement.classList.contains("callout") && !nodeElement.classList.contains("callout") &&
                        getParentBlock(nodeElement) !== topElement) {
                        topElement = topElement.querySelector("[data-node-id]");
                    }
                    listItem = topElement.querySelector(".li") || topElement.querySelector(".list");
                    // 嵌入块中有列表时块标显示位置错误 https://github.com/lonelyor/SourceFlow/issues/6254
                    if (isInEmbedBlock(listItem) || isInAVBlock(listItem) || hasClosestByClassName(nodeElement, "callout")) {
                        listItem = undefined;
                    }
                    // 标题（除列表下的）、提示下的块必须显示
                    if (topElement !== nodeElement && type !== "NodeHeading" && !hasClosestByClassName(nodeElement, "callout")) {
                        nodeElement = topElement;
                        parentElement = hasClosestBlock(nodeElement.parentElement);
                        type = nodeElement.getAttribute("data-type");
                        dataNodeId = nodeElement.getAttribute("data-node-id");
                    }
                }
                // - > # 1 \n  > 2
                if (type === "NodeListItem" && index > 0) {
                    // 列表项内的块不显示块标
                    html = "";
                }
                index += 1;
                let currentGutterTip = gutterTip;
                if (protyle.disabled) {
                    currentGutterTip = currentGutterTip.split("<br>").splice(0, 2).join("<br>");
                }

                let popoverHTML = "";
                if (protyle.options.backlinkData) {
                    popoverHTML = `class="popover__block" data-id="${dataNodeId}"`;
                }
                const buttonHTML = `<button class="ariaLabel" data-position="parentW" aria-label="${currentGutterTip}" 
data-type="${type}" data-subtype="${nodeElement.getAttribute("data-subtype")}" data-node-id="${dataNodeId}">
    <svg><use xlink:href="#${getIconByType(type, nodeElement.getAttribute("data-subtype"))}"></use></svg>
    <span ${popoverHTML} ${protyle.disabled ? "" : 'draggable="true"'}></span>
</button>`;
                if (!hideParent) {
                    html = buttonHTML + html;
                }
                let foldHTML = "";
                if (type === "NodeListItem" && nodeElement.childElementCount > 3 || type === "NodeHeading") {
                    const fold = nodeElement.getAttribute("fold");
                    foldHTML = `<button class="ariaLabel" data-position="parentW" aria-label="${window.sourceflow.languages.fold}" 
data-type="fold" style="cursor:inherit;"><svg style="width: 10px${fold && fold === "1" ? "" : ";transform:rotate(90deg)"}"><use xlink:href="#iconPlay"></use></svg></button>`;
                }
                if (type === "NodeListItem" || type === "NodeList") {
                    listItem = nodeElement;
                    if (type === "NodeListItem" && nodeElement.childElementCount > 3) {
                        html = buttonHTML + foldHTML;
                    }
                }
                if (type === "NodeHeading") {
                    html = html + foldHTML;
                }
                if (["NodeBlockquote", "NodeCallout"].includes(type)) {
                    space += 8;
                }
                if ((nodeElement.previousElementSibling && nodeElement.previousElementSibling.getAttribute("data-node-id")) ||
                    nodeElement.parentElement.classList.contains("callout-content")) {
                    // 前一个块存在时，只显示到当前层级
                    hideParent = true;
                    // 由于折叠块的第二个子块在界面上不显示，因此移除块标 https://github.com/lonelyor/SourceFlow/issues/14304
                    if (parentElement && parentElement.getAttribute("fold") === "1") {
                        return;
                    }
                    // 列表项中的引述块中的第二个段落块块标和引述块左侧样式重叠
                    if (parentElement && ["NodeBlockquote", "NodeCallout"].includes(parentElement.getAttribute("data-type"))) {
                        space += 8;
                    }
                }
            }

            if (parentElement) {
                nodeElement = parentElement;
            } else {
                break;
            }
        }
        let match = true;
        const buttonsElement = gutterElement.querySelectorAll("button");
        if (buttonsElement.length !== html.split("</button>").length - 1) {
            match = false;
        } else {
            Array.from(buttonsElement).find(item => {
                const id = item.getAttribute("data-node-id");
                if (id && html.indexOf(id) === -1) {
                    match = false;
                    return true;
                }
                const rowId = item.getAttribute("data-row-id");
                if ((rowId && html.indexOf(rowId) === -1) || (!rowId && html.indexOf("NodeAttributeViewRowMenu") > -1)) {
                    match = false;
                    return true;
                }
            });
        }
        // 防止抖动 https://github.com/lonelyor/SourceFlow/issues/4166
        if (match && gutterElement.childElementCount > 0) {
            gutterElement.classList.remove("fn__none");
            return;
        }
        gutterElement.innerHTML = html;
        gutterElement.classList.remove("fn__none");
        gutterElement.style.width = "";
        const contentTop = protyle.contentElement.getBoundingClientRect().top;
        let rect = element.getBoundingClientRect();
        let marginHeight = 0;
        if (listItem && !window.sourceflow.config.editor.rtl && getComputedStyle(element).direction !== "rtl") {
            rect = listItem.firstElementChild.getBoundingClientRect();
            space = 0;
        } else if (nodeElement.getAttribute("data-type") === "NodeBlockQueryEmbed") {
            rect = nodeElement.getBoundingClientRect();
            space = 0;
        } else if (!element.classList.contains("av__row")) {
            if (rect.height < Math.floor(window.sourceflow.config.editor.fontSize * 1.625) + 8 ||
                (rect.height > Math.floor(window.sourceflow.config.editor.fontSize * 1.625) + 8 && rect.height < Math.floor(window.sourceflow.config.editor.fontSize * 1.625) * 2 + 8)) {
                marginHeight = (rect.height - gutterElement.clientHeight) / 2;
            } else if ((nodeElement.getAttribute("data-type") === "NodeAttributeView" || element.getAttribute("data-type") === "NodeAttributeView") &&
                contentTop < rect.top) {
                marginHeight = 8;
            }
        }
        gutterElement.style.top = `${Math.max(rect.top, contentTop) + marginHeight}px`;
        let left = rect.left - gutterElement.clientWidth - space;
        if ((nodeElement.getAttribute("data-type") === "NodeBlockQueryEmbed" && gutterElement.childElementCount === 1)) {
            // 嵌入块为列表时
            left = nodeElement.getBoundingClientRect().left - gutterElement.clientWidth - space;
        } else if (element.classList.contains("av__row")) {
            // 为数据库行
            left = nodeElement.getBoundingClientRect().left - gutterElement.clientWidth - space + parseInt(getComputedStyle(nodeElement).paddingLeft);
        }
        gutterElement.style.left = `${left}px`;
        if (left < gutterElement.parentElement.getBoundingClientRect().left) {
            gutterElement.style.width = "24px";
            // 需加 2，否则和折叠标题无法对齐
            gutterElement.style.left = `${rect.left - gutterElement.clientWidth - space / 2 + 3}px`;
            html = "";
            Array.from(gutterElement.children).reverse().forEach((item, index) => {
                if (index !== 0) {
                    (item.firstElementChild as HTMLElement).style.height = "14px";
                }
                html += item.outerHTML;
            });
            gutterElement.innerHTML = html;
        } else {
            gutterElement.querySelectorAll("svg").forEach(item => {
                item.style.height = "";
            });
        }
    }
