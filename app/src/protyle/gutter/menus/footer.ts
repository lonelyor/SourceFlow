import {enterBack, setFold, zoomOut} from "../../../menus/protyle";
import {MenuItem} from "../../../menus/Menu";
import {openAttr} from "../../../menus/commonMenuItem";
import {
    updateHotkeyAfterTip,
    updateHotkeyTip
} from "../../util/compatibility";
import {focusBlock} from "../../util/selection";
import {hideElements} from "../../ui/hideElements";
import * as dayjs from "dayjs";
import {insertEmptyBlock, jumpToParent,} from "../../../block/util";
import {countBlockWord} from "../../../layout/status";
import {Constants} from "../../../constants";
import {makeCard, quickMakeCard} from "../../../card/makeCard";
import {transferBlockRef} from "../../../menus/block";
import {isMobile} from "../../../util/functions";
import {appearanceMenu} from "../../toolbar/Font";
import {setPosition} from "../../../util/setPosition";
import {emitOpenMenu} from "../../../plugin/EventBus";
/// #if !MOBILE
import {openFileById} from "../../../editor/util";
/// #endif
/// #if MOBILE
/// #endif
import {checkFold} from "../../../util/noRelyPCFunction";

import {appendAlignMenu, appendWidthMenu, showMobileAppearance} from "../actions";

import type {SingleMenuContext} from "./shared";

export const appendFooterSections = (context: SingleMenuContext) => {
    const {protyle, nodeElement, id, type} = context;
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_2", type: "separator"}).element);
        if (!protyle.options.backlinkData) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "enter",
                accelerator: `${window.sourceflow.config.keymap.general.enter.custom ? updateHotkeyTip(window.sourceflow.config.keymap.general.enter.custom) + "/" : ""}${updateHotkeyAfterTip("⌘" + window.sourceflow.languages.click)}`,
                label: window.sourceflow.languages.enter,
                click: () => {
                    zoomOut({protyle, id});
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "enterBack",
                accelerator: window.sourceflow.config.keymap.general.enterBack.custom,
                label: window.sourceflow.languages.enterBack,
                click: () => {
                    enterBack(protyle, id);
                }
            }).element);
        } else {
            /// #if !MOBILE
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "enter",
                accelerator: `${updateHotkeyTip(window.sourceflow.config.keymap.general.enter.custom)}/${updateHotkeyTip("⌘" + window.sourceflow.languages.click)}`,
                label: window.sourceflow.languages.openBy,
                click: () => {
                    checkFold(id, (zoomIn, action) => {
                        openFileById({
                            app: protyle.app,
                            id,
                            action,
                            zoomIn
                        });
                    });
                }
            }).element);
            /// #endif
        }
        if (!protyle.disabled) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "insertBefore",
                icon: "iconBefore",
                label: window.sourceflow.languages.insertBefore,
                accelerator: window.sourceflow.config.keymap.editor.general.insertBefore.custom,
                click() {
                    hideElements(["select"], protyle);
                    countBlockWord([], protyle.block.rootID);
                    insertEmptyBlock(protyle, "beforebegin", id);
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "insertAfter",
                icon: "iconAfter",
                label: window.sourceflow.languages.insertAfter,
                accelerator: window.sourceflow.config.keymap.editor.general.insertAfter.custom,
                click() {
                    hideElements(["select"], protyle);
                    countBlockWord([], protyle.block.rootID);
                    insertEmptyBlock(protyle, "afterend", id);
                }
            }).element);
            const countElement = nodeElement.lastElementChild.querySelector(".protyle-attr--refcount");
            if (countElement && countElement.textContent) {
                transferBlockRef(id);
            }
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "jumpTo",
            type: "submenu",
            label: window.sourceflow.languages.jumpTo,
            submenu: [{
                id: "jumpToParentPrev",
                iconHTML: "",
                label: window.sourceflow.languages.jumpToParentPrev,
                accelerator: window.sourceflow.config.keymap.editor.general.jumpToParentPrev.custom,
                click() {
                    hideElements(["select"], protyle);
                    jumpToParent(protyle, nodeElement, "previous");
                }
            }, {
                iconHTML: "",
                id: "jumpToParentNext",
                label: window.sourceflow.languages.jumpToParentNext,
                accelerator: window.sourceflow.config.keymap.editor.general.jumpToParentNext.custom,
                click() {
                    hideElements(["select"], protyle);
                    jumpToParent(protyle, nodeElement, "next");
                }
            }, {
                iconHTML: "",
                id: "jumpToParent",
                label: window.sourceflow.languages.jumpToParent,
                accelerator: window.sourceflow.config.keymap.editor.general.jumpToParent.custom,
                click() {
                    hideElements(["select"], protyle);
                    jumpToParent(protyle, nodeElement, "parent");
                }
            }]
        }).element);

        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_3", type: "separator"}).element);

        if (type !== "NodeThematicBreak") {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "fold",
                label: window.sourceflow.languages.fold,
                accelerator: `${updateHotkeyTip(window.sourceflow.config.keymap.editor.general.collapse.custom)}/${updateHotkeyTip("⌥" + window.sourceflow.languages.click)}`,
                click() {
                    setFold(protyle, nodeElement);
                    focusBlock(nodeElement);
                }
            }).element);
            if (!protyle.disabled) {
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "attr",
                    label: window.sourceflow.languages.attr,
                    icon: "iconAttr",
                    accelerator: window.sourceflow.config.keymap.editor.general.attr.custom + "/" + updateHotkeyTip("⇧" + window.sourceflow.languages.click),
                    click() {
                        openAttr(nodeElement, "bookmark", protyle);
                    }
                }).element);
            }
        }
        if (!protyle.disabled) {
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
                    protyle.toolbar.subElement.append(appearanceMenu(protyle, [nodeElement]));
                    protyle.toolbar.subElement.style.zIndex = (++window.sourceflow.zIndex).toString();
                    protyle.toolbar.subElement.classList.remove("fn__none");
                    protyle.toolbar.subElementCloseCB = undefined;
                    const position = nodeElement.getBoundingClientRect();
                    setPosition(protyle.toolbar.subElement, position.left, position.top);
                    /// #endif
                }
            }).element;
            window.sourceflow.menus.menu.append(appearanceElement);
            if (!isMobile()) {
                appearanceElement.lastElementChild.classList.add("b3-menu__submenu--row");
            }
            appendAlignMenu([nodeElement], protyle);
            appendWidthMenu([nodeElement], protyle);
            // appendHeightMenu([nodeElement], protyle);
        }
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_4", type: "separator"}).element);
        if (type !== "NodeThematicBreak" && !window.sourceflow.config.readonly) {
            const isCardMade = nodeElement.hasAttribute(Constants.CUSTOM_RIFF_DECKS);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: isCardMade ? "removeCard" : "quickMakeCard",
                icon: "iconRiffCard",
                label: isCardMade ? window.sourceflow.languages.removeCard : window.sourceflow.languages.quickMakeCard,
                accelerator: window.sourceflow.config.keymap.editor.general.quickMakeCard.custom,
                click() {
                    quickMakeCard(protyle, [nodeElement]);
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "addToDeck",
                label: window.sourceflow.languages.addToDeck,
                ignore: !window.sourceflow.config.flashcard.deck,
                icon: "iconRiffCard",
                click() {
                    makeCard(protyle.app, [id]);
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_5", type: "separator"}).element);
        }

        if (protyle?.app?.plugins) {
            emitOpenMenu({
                plugins: protyle.app.plugins,
                type: "click-blockicon",
                detail: {
                    protyle,
                    blockElements: [nodeElement]
                },
                separatorPosition: "bottom",
            });
        }

        let updateHTML = nodeElement.getAttribute("updated") || "";
        if (updateHTML) {
            updateHTML = `${window.sourceflow.languages.modifiedAt} ${dayjs(updateHTML).format("YYYY-MM-DD HH:mm:ss")}<br>`;
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "updateAndCreatedAt",
            iconHTML: "",
            type: "readonly",
            label: `${updateHTML}${window.sourceflow.languages.createdAt} ${dayjs(id.substr(0, 14)).format("YYYY-MM-DD HH:mm:ss")}`,
        }).element);
};
