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


export const renderMultipleMenu = (protyle: IProtyle, selectsElement: Element[]) => {
        let isList = false;
        let isContinue = false;
        selectsElement.find((item, index) => {
            if (item.classList.contains("li")) {
                isList = true;
                return true;
            }
            if (item.nextElementSibling && selectsElement[index + 1] &&
                item.nextElementSibling === selectsElement[index + 1]) {
                isContinue = true;
            } else if (index !== selectsElement.length - 1) {
                isContinue = false;
                return true;
            }
        });
        if (!isList && !protyle.disabled) {
            const turnIntoSubmenu: IMenu[] = [];
            if (isContinue) {
                turnIntoSubmenu.push(createTurnsIntoOneMenu({
                    menuId: "list",
                    icon: "iconList",
                    label: window.sourceflow.languages.list,
                    protyle,
                    accelerator: window.sourceflow.config.keymap.editor.insert.list.custom,
                    selectsElement,
                    type: "Blocks2ULs"
                }));
                turnIntoSubmenu.push(createTurnsIntoOneMenu({
                    menuId: "orderedList",
                    icon: "iconOrderedList",
                    label: window.sourceflow.languages["ordered-list"],
                    accelerator: window.sourceflow.config.keymap.editor.insert["ordered-list"].custom,
                    protyle,
                    selectsElement,
                    type: "Blocks2OLs"
                }));
                turnIntoSubmenu.push(createTurnsIntoOneMenu({
                    menuId: "check",
                    icon: "iconCheck",
                    label: window.sourceflow.languages.check,
                    accelerator: window.sourceflow.config.keymap.editor.insert.check.custom,
                    protyle,
                    selectsElement,
                    type: "Blocks2TLs"
                }));
                turnIntoSubmenu.push(createTurnsIntoOneMenu({
                    menuId: "quote",
                    icon: "iconQuote",
                    label: window.sourceflow.languages.quote,
                    accelerator: window.sourceflow.config.keymap.editor.insert.quote.custom,
                    protyle,
                    selectsElement,
                    type: "Blocks2Blockquote"
                }));
                turnIntoSubmenu.push(createTurnsIntoOneMenu({
                    menuId: "callout",
                    icon: "iconCallout",
                    label: window.sourceflow.languages.callout,
                    protyle,
                    selectsElement,
                    type: "Blocks2Callout"
                }));
            }
            turnIntoSubmenu.push(createTurnsIntoMenu({
                menuId: "paragraph",
                icon: "iconParagraph",
                label: window.sourceflow.languages.paragraph,
                accelerator: window.sourceflow.config.keymap.editor.heading.paragraph.custom,
                protyle,
                selectsElement,
                type: "Blocks2Ps",
                isContinue
            }));
            turnIntoSubmenu.push(createTurnsIntoMenu({
                menuId: "heading1",
                icon: "iconH1",
                label: window.sourceflow.languages.heading1,
                accelerator: window.sourceflow.config.keymap.editor.heading.heading1.custom,
                protyle,
                selectsElement,
                level: 1,
                type: "Blocks2Hs",
                isContinue
            }));
            turnIntoSubmenu.push(createTurnsIntoMenu({
                menuId: "heading2",
                icon: "iconH2",
                label: window.sourceflow.languages.heading2,
                accelerator: window.sourceflow.config.keymap.editor.heading.heading2.custom,
                protyle,
                selectsElement,
                level: 2,
                type: "Blocks2Hs",
                isContinue
            }));
            turnIntoSubmenu.push(createTurnsIntoMenu({
                menuId: "heading3",
                icon: "iconH3",
                label: window.sourceflow.languages.heading3,
                accelerator: window.sourceflow.config.keymap.editor.heading.heading3.custom,
                protyle,
                selectsElement,
                level: 3,
                type: "Blocks2Hs",
                isContinue
            }));
            turnIntoSubmenu.push(createTurnsIntoMenu({
                menuId: "heading4",
                icon: "iconH4",
                label: window.sourceflow.languages.heading4,
                accelerator: window.sourceflow.config.keymap.editor.heading.heading4.custom,
                protyle,
                selectsElement,
                level: 4,
                type: "Blocks2Hs",
                isContinue
            }));
            turnIntoSubmenu.push(createTurnsIntoMenu({
                menuId: "heading5",
                icon: "iconH5",
                label: window.sourceflow.languages.heading5,
                accelerator: window.sourceflow.config.keymap.editor.heading.heading5.custom,
                protyle,
                selectsElement,
                level: 5,
                type: "Blocks2Hs",
                isContinue
            }));
            turnIntoSubmenu.push(createTurnsIntoMenu({
                menuId: "heading6",
                icon: "iconH6",
                label: window.sourceflow.languages.heading6,
                accelerator: window.sourceflow.config.keymap.editor.heading.heading6.custom,
                protyle,
                selectsElement,
                level: 6,
                type: "Blocks2Hs",
                isContinue
            }));
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "turnInto",
                icon: "iconRefresh",
                label: window.sourceflow.languages.turnInto,
                type: "submenu",
                submenu: turnIntoSubmenu
            }).element);
            if (isContinue && !(selectsElement[0].parentElement.classList.contains("sb") &&
                selectsElement.length + 1 === selectsElement[0].parentElement.childElementCount)) {
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "mergeSuperBlock",
                    icon: "iconSuper",
                    label: window.sourceflow.languages.merge + " " + window.sourceflow.languages.superBlock,
                    type: "submenu",
                    submenu: [createTurnsIntoOneMenu({
                        menuId: "hLayout",
                        label: window.sourceflow.languages.hLayout,
                        accelerator: window.sourceflow.config.keymap.editor.general.hLayout.custom,
                        icon: "iconSplitLR",
                        protyle,
                        selectsElement,
                        type: "BlocksMergeSuperBlock",
                        level: "col"
                    }), createTurnsIntoOneMenu({
                        menuId: "vLayout",
                        label: window.sourceflow.languages.vLayout,
                        accelerator: window.sourceflow.config.keymap.editor.general.vLayout.custom,
                        icon: "iconSplitTB",
                        protyle,
                        selectsElement,
                        type: "BlocksMergeSuperBlock",
                        level: "row"
                    })]
                }).element);
            }
        }
        if (!protyle.disabled) {
            appendAssistantContextActions({
                protyle,
                range: getEditorRange(selectsElement[0]),
                fallbackSelectionText: selectsElement.map((item: HTMLElement) => getPlainText(item).trim()).filter(Boolean).join("\n\n"),
                includeOptimizeTypography: true,
                onOptimizeTypography: () => {
                    hideElements(["toolbar"], protyle);
                    fetchPost("/api/format/autoSpace", {
                        id: protyle.block.rootID
                    });
                }
            });
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "ai",
                icon: "iconSparkles",
                label: window.sourceflow.languages.ai,
                accelerator: window.sourceflow.config.keymap.editor.general.ai.custom,
                click() {
                    AIActions(selectsElement, protyle);
                }
            }).element);
        }
        const copyMenu: IMenu[] = (copySubMenu(Array.from(selectsElement).map(item => item.getAttribute("data-node-id")), true, selectsElement[0]) as IMenu[]).concat([{
            id: "copyPlainText",
            iconHTML: "",
            label: window.sourceflow.languages.copyPlainText,
            accelerator: window.sourceflow.config.keymap.editor.general.copyPlainText.custom,
            click() {
                let html = "";
                selectsElement.forEach((item: HTMLElement) => {
                    html += getPlainText(item) + "\n";
                });
                copyPlainText(html.trimEnd());
                focusBlock(selectsElement[0]);
            }
        }, {
            id: "copy",
            iconHTML: "",
            label: window.sourceflow.languages.copy,
            accelerator: "⌘C",
            click() {
                if (isNotEditBlock(selectsElement[0])) {
                    focusBlock(selectsElement[0]);
                } else {
                    focusByRange(getEditorRange(selectsElement[0]));
                }
                document.execCommand("copy");
            }
        }]);
        const copyTextRefMenu = createCopyTextRefMenu(selectsElement);
        if (copyTextRefMenu) {
            copyMenu.splice(7, 0, copyTextRefMenu);
        }
        if (!protyle.disabled) {
            copyMenu.push({
                id: "duplicate",
                iconHTML: "",
                label: window.sourceflow.languages.duplicate,
                accelerator: window.sourceflow.config.keymap.editor.general.duplicate.custom,
                click() {
                    duplicateBlock(selectsElement, protyle);
                }
            });
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "copy",
            label: window.sourceflow.languages.copy,
            icon: "iconCopy",
            type: "submenu",
            submenu: copyMenu,
        }).element);
        if (!protyle.disabled) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "cut",
                label: window.sourceflow.languages.cut,
                accelerator: "⌘X",
                icon: "iconCut",
                click: () => {
                    focusBlock(selectsElement[0]);
                    document.execCommand("cut");
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "move",
                label: window.sourceflow.languages.move,
                accelerator: window.sourceflow.config.keymap.general.move.custom,
                icon: "iconMove",
                click: () => {
                    movePathTo({
                        cb: (toPath) => {
                            hintMoveBlock(toPath[0], selectsElement, protyle);
                        },
                        flashcard: false
                    });
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "addToDatabase",
                label: window.sourceflow.languages.addToDatabase,
                accelerator: window.sourceflow.config.keymap.general.addToDatabase.custom,
                icon: "iconDatabase",
                click: () => {
                    addEditorToDatabase(protyle, getEditorRange(selectsElement[0]));
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "delete",
                label: window.sourceflow.languages.delete,
                icon: "iconTrashcan",
                accelerator: "⌫",
                click: () => {
                    protyle.breadcrumb?.hide();
                    removeBlock(protyle, selectsElement[0], getEditorRange(selectsElement[0]), "Backspace");
                }
            }).element);

            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_appearance", type: "separator"}).element);
            const appearanceElement = new MenuItem({
                id: "appearance",
                label: window.sourceflow.languages.appearance,
                icon: "iconFont",
                accelerator: window.sourceflow.config.keymap.editor.insert.appearance.custom,
                click: () => {
                    /// #if MOBILE
                    showMobileAppearance(protyle);
                    /// #else
                    protyle.toolbar.element.classList.add("fn__none");
                    protyle.toolbar.subElement.innerHTML = "";
                    protyle.toolbar.subElement.style.width = "";
                    protyle.toolbar.subElement.style.padding = "";
                    protyle.toolbar.subElement.append(appearanceMenu(protyle, selectsElement));
                    protyle.toolbar.subElement.style.zIndex = (++window.sourceflow.zIndex).toString();
                    protyle.toolbar.subElement.classList.remove("fn__none");
                    protyle.toolbar.subElementCloseCB = undefined;
                    const position = selectsElement[0].getBoundingClientRect();
                    setPosition(protyle.toolbar.subElement, position.left, position.top);
                    /// #endif
                }
            }).element;
            window.sourceflow.menus.menu.append(appearanceElement);
            if (!isMobile()) {
                appearanceElement.lastElementChild.classList.add("b3-menu__submenu--row");
            }
            appendAlignMenu(selectsElement, protyle);
            appendWidthMenu(selectsElement, protyle);
            // appendHeightMenu(selectsElement, protyle);
        }
        if (!window.sourceflow.config.readonly) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "separator_quickMakeCard",
                type: "separator"
            }).element);
            const allCardsMade = !selectsElement.some(item => !item.hasAttribute(Constants.CUSTOM_RIFF_DECKS) && item.getAttribute("data-type") !== "NodeThematicBreak");
            window.sourceflow.menus.menu.append(new MenuItem({
                id: allCardsMade ? "removeCard" : "quickMakeCard",
                label: allCardsMade ? window.sourceflow.languages.removeCard : window.sourceflow.languages.quickMakeCard,
                accelerator: window.sourceflow.config.keymap.editor.general.quickMakeCard.custom,
                icon: "iconRiffCard",
                click() {
                    quickMakeCard(protyle, selectsElement);
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "addToDeck",
                label: window.sourceflow.languages.addToDeck,
                icon: "iconRiffCard",
                ignore: !window.sourceflow.config.flashcard.deck,
                click() {
                    const ids: string[] = [];
                    selectsElement.forEach(item => {
                        if (item.getAttribute("data-type") === "NodeThematicBreak") {
                            return;
                        }
                        ids.push(item.getAttribute("data-node-id"));
                    });
                    makeCard(protyle.app, ids);
                }
            }).element);
        }

        if (protyle?.app?.plugins) {
            emitOpenMenu({
                plugins: protyle.app.plugins,
                type: "click-blockicon",
                detail: {
                    protyle,
                    blockElements: selectsElement,
                },
                separatorPosition: "top",
            });
        }

        return window.sourceflow.menus.menu;
    }
