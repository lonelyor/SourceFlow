import {
    hasClosestBlock,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByClassName,
    isInAVBlock,
    isInEmbedBlock
} from "../../util/hasClosest";
import {getIconByType} from "../../../editor/getIcon";
import {enterBack, iframeMenu, setFold, tableMenu, videoMenu, zoomOut} from "../../../menus/protyle";
import {MenuItem} from "../../../menus/Menu";
import {copySubMenu, openAttr, openFileAttr} from "../../../menus/commonMenuItem";
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
} from "../../util/compatibility";
import {
    transaction,
    turnsIntoOneTransaction,
    turnsIntoTransaction,
    turnsOneInto,
    updateBatchTransaction,
    updateTransaction
} from "../../wysiwyg/transaction";
import {removeBlock} from "../../wysiwyg/remove";
import {focusBlock, focusByRange, getEditorRange} from "../../util/selection";
import {hideElements} from "../../ui/hideElements";
import {highlightRender} from "../../render/highlightRender";
import {blockRender} from "../../render/blockRender";
import {getContenteditableElement, getParentBlock, getTopAloneElement, isNotEditBlock} from "../../wysiwyg/getBlock";
import * as dayjs from "dayjs";
import {fetchPost} from "../../../util/fetch";
import {cancelSB, genEmptyElement, getLangByType, insertEmptyBlock, jumpToParent,} from "../../../block/util";
import {countBlockWord} from "../../../layout/status";
import {Constants} from "../../../constants";
import {mathRender} from "../../render/mathRender";
import {duplicateBlock} from "../../wysiwyg/commonHotkey";
import {movePathTo, useShell} from "../../../util/pathName";
import {hintMoveBlock} from "../../hint/extend";
import {makeCard, quickMakeCard} from "../../../card/makeCard";
import {transferBlockRef} from "../../../menus/block";
import {isMobile} from "../../../util/functions";
import {AIActions} from "../../../ai/actions";
import {activeBlur, renderTextMenu, showKeyboardToolbarUtil} from "../../../mobile/util/keyboardToolbar";
import {hideTooltip} from "../../../dialog/tooltip";
import {appearanceMenu} from "../../toolbar/Font";
import {setPosition} from "../../../util/setPosition";
import {emitOpenMenu} from "../../../plugin/EventBus";
import {insertAttrViewBlockAnimation, updateHeader} from "../../render/av/row";
import {avContextmenu, duplicateCompletely} from "../../render/av/action";
import {getPlainText} from "../../util/paste";
import {addEditorToDatabase} from "../../render/av/addToDatabase";
import {processClonePHElement} from "../../render/util";
/// #if !MOBILE
import {openFileById} from "../../../editor/util";
import * as path from "path";
/// #endif
/// #if MOBILE
import {openMobileFileById} from "../../../mobile/editor";
/// #endif
import {hideMessage, showMessage} from "../../../dialog/message";
import {checkFold} from "../../../util/noRelyPCFunction";
import {clearSelect} from "../../util/clear";
import {chartRender} from "../../render/chartRender";
import {appendAssistantContextActions} from "../../../assistant/skills/contextActions";
import {canRunCodeBlock, runCodeBlock} from "../../codeRun";

import {appendAlignMenu, appendHeightMenu, appendWidthMenu, createCopyTextRefMenu, createHeadingTransformMenu, createTurnsIntoMenu, createTurnsIntoOneMenu, createTurnsOneIntoMenu, isMatchNode, showMobileAppearance} from "../actions";

import {renderMultipleMenu} from "./multiple";
import type {PrepareSingleMenuResult} from "./shared";

export const prepareSingleMenuContext = (gutterElement: HTMLElement, protyle: IProtyle, buttonElement: Element): PrepareSingleMenuResult => {
    if (!buttonElement) {
        return {kind: "skip"};
    }
    hideElements(["util", "toolbar", "hint"], protyle);
    window.sourceflow.menus.menu.remove();
    if (isMobile()) {
        activeBlur();
    }
    const id = buttonElement.getAttribute("data-node-id") || "";
    const selectsElement = protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select");
    if (selectsElement.length > 1) {
        window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_BLOCK_MULTI);
        const match = Array.from(selectsElement).find(item => id === item.getAttribute("data-node-id"));
        if (match) {
            renderMultipleMenu(protyle, Array.from(selectsElement));
            return {kind: "menu"};
        }
    } else {
        window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_BLOCK_SINGLE);
    }

    let nodeElement: Element | undefined;
    if (buttonElement.tagName === "BUTTON") {
        Array.from(protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${id}"]`)).find(item => {
            if (!isInEmbedBlock(item) && isMatchNode(gutterElement, item)) {
                nodeElement = item;
                return true;
            }
            return false;
        });
    } else {
        nodeElement = buttonElement;
    }
    if (!nodeElement) {
        return {kind: "skip"};
    }
    hideElements(["select"], protyle);
    nodeElement.classList.add("protyle-wysiwyg--select");
    countBlockWord([id], protyle.block.rootID);
    return {
        kind: "context",
        context: {
            protyle,
            nodeElement: nodeElement as HTMLElement,
            id,
            type: nodeElement.getAttribute("data-type") || "",
            subType: nodeElement.getAttribute("data-subtype") || "",
        },
    };
};
