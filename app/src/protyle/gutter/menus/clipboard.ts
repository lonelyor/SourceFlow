import {MenuItem} from "../../../menus/Menu";
import {copySubMenu} from "../../../menus/commonMenuItem";
import {
    copyPlainText,
    writeText
} from "../../util/compatibility";
import {removeBlock} from "../../wysiwyg/remove";
import {focusBlock, focusByRange, getEditorRange} from "../../util/selection";
import {
    isNotEditBlock
} from "../../wysiwyg/getBlock";
import {duplicateBlock} from "../../wysiwyg/commonHotkey";
import {movePathTo} from "../../../util/pathName";
import {hintMoveBlock} from "../../hint/extend";
import {duplicateCompletely} from "../../render/av/action";
import {getPlainText} from "../../util/paste";
import {addEditorToDatabase} from "../../render/av/addToDatabase";

import {createCopyTextRefMenu} from "../actions";

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
