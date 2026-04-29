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
import type {SingleMenuContext} from "./shared";

export const appendClipboardSection = (context: SingleMenuContext) => {
    const {protyle, nodeElement, id, type} = context;
        const copyMenu = (copySubMenu([id], true, nodeElement) as IMenu[]).concat([{
            id: "copyPlainText",
            iconHTML: "",
            label: window.sourceflow.languages.copyPlainText,
            accelerator: window.sourceflow.config.keymap.editor.general.copyPlainText.custom,
            click() {
                copyPlainText(getPlainText(nodeElement as HTMLElement).trimEnd());
                focusBlock(nodeElement);
            }
        }, {
            id: type === "NodeAttributeView" ? "copyMirror" : "copy",
            iconHTML: "",
            label: type === "NodeAttributeView" ? window.sourceflow.languages.copyMirror : window.sourceflow.languages.copy,
            accelerator: "⌘C",
            click() {
                if (isNotEditBlock(nodeElement)) {
                    focusBlock(nodeElement);
                } else {
                    focusByRange(getEditorRange(nodeElement));
                }
                document.execCommand("copy");
            }
        }]);
        const copyTextRefMenu = createCopyTextRefMenu([nodeElement]);
        if (copyTextRefMenu) {
            copyMenu.splice(7, 0, copyTextRefMenu);
        }
        if (type === "NodeAttributeView") {
            copyMenu.splice(6, 0, {
                iconHTML: "",
                label: window.sourceflow.languages.copyAVID,
                click() {
                    writeText(nodeElement.getAttribute("data-av-id"));
                }
            });
            if (!protyle.disabled) {
                copyMenu.push({
                    id: "duplicateMirror",
                    iconHTML: "",
                    label: window.sourceflow.languages.duplicateMirror,
                    accelerator: window.sourceflow.config.keymap.editor.general.duplicate.custom,
                    click() {
                        duplicateBlock([nodeElement], protyle);
                    }
                });
                copyMenu.push({
                    id: "duplicateCompletely",
                    iconHTML: "",
                    label: window.sourceflow.languages.duplicateCompletely,
                    accelerator: window.sourceflow.config.keymap.editor.general.duplicateCompletely.custom,
                    click() {
                        duplicateCompletely(protyle, nodeElement as HTMLElement);
                    }
                });
            }
        } else if (!protyle.disabled) {
            copyMenu.push({
                id: "duplicate",
                iconHTML: "",
                label: window.sourceflow.languages.duplicate,
                accelerator: window.sourceflow.config.keymap.editor.general.duplicate.custom,
                click() {
                    duplicateBlock([nodeElement], protyle);
                }
            });
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "copy",
            icon: "iconCopy",
            label: window.sourceflow.languages.copy,
            type: "submenu",
            submenu: copyMenu
        }).element);
        if (!protyle.disabled) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "cut",
                icon: "iconCut",
                label: window.sourceflow.languages.cut,
                accelerator: "⌘X",
                click: () => {
                    focusBlock(nodeElement);
                    document.execCommand("cut");
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "move",
                icon: "iconMove",
                label: window.sourceflow.languages.move,
                accelerator: window.sourceflow.config.keymap.general.move.custom,
                click: () => {
                    movePathTo({
                        cb: (toPath) => {
                            hintMoveBlock(toPath[0], [nodeElement], protyle);
                        },
                        flashcard: false,
                    });
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "addToDatabase",
                icon: "iconDatabase",
                label: window.sourceflow.languages.addToDatabase,
                accelerator: window.sourceflow.config.keymap.general.addToDatabase.custom,
                click: () => {
                    addEditorToDatabase(protyle, getEditorRange(nodeElement));
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "delete",
                icon: "iconTrashcan",
                label: window.sourceflow.languages.delete,
                accelerator: "⌫",
                click: () => {
                    protyle.breadcrumb?.hide();
                    removeBlock(protyle, nodeElement, getEditorRange(nodeElement), "Backspace");
                }
            }).element);
        }
};
