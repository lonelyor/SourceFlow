import {MenuItem} from "../../../menus/Menu";
import {getEditorRange} from "../../util/selection";
import {hideElements} from "../../ui/hideElements";
import {fetchPost} from "../../../util/fetch";
import {getPlainText} from "../../util/paste";
import {AIActions} from "../../../ai/actions";
import {appendAssistantContextActions} from "../../../assistant/skills/contextActions";

import {createTurnsIntoMenu, createTurnsIntoOneMenu, createTurnsOneIntoMenu} from "../actions";

import type {SingleMenuContext} from "./shared";

export const appendTurnIntoSection = (context: SingleMenuContext) => {
    const {protyle, nodeElement, id, type, subType} = context;
    const turnIntoSubmenu: IMenu[] = [];
        if (type === "NodeParagraph" && !protyle.disabled) {
            turnIntoSubmenu.push(createTurnsIntoOneMenu({
                menuId: "list",
                icon: "iconList",
                label: window.sourceflow.languages.list,
                accelerator: window.sourceflow.config.keymap.editor.insert.list.custom,
                protyle,
                selectsElement: [nodeElement],
                type: "Blocks2ULs"
            }));
            turnIntoSubmenu.push(createTurnsIntoOneMenu({
                menuId: "orderedList",
                icon: "iconOrderedList",
                label: window.sourceflow.languages["ordered-list"],
                accelerator: window.sourceflow.config.keymap.editor.insert["ordered-list"].custom,
                protyle,
                selectsElement: [nodeElement],
                type: "Blocks2OLs"
            }));
            turnIntoSubmenu.push(createTurnsIntoOneMenu({
                menuId: "check",
                icon: "iconCheck",
                label: window.sourceflow.languages.check,
                accelerator: window.sourceflow.config.keymap.editor.insert.check.custom,
                protyle,
                selectsElement: [nodeElement],
                type: "Blocks2TLs"
            }));
            turnIntoSubmenu.push(createTurnsIntoOneMenu({
                menuId: "quote",
                icon: "iconQuote",
                label: window.sourceflow.languages.quote,
                accelerator: window.sourceflow.config.keymap.editor.insert.quote.custom,
                protyle,
                selectsElement: [nodeElement],
                type: "Blocks2Blockquote"
            }));
            turnIntoSubmenu.push(createTurnsIntoOneMenu({
                menuId: "callout",
                icon: "iconCallout",
                label: window.sourceflow.languages.callout,
                protyle,
                selectsElement: [nodeElement],
                type: "Blocks2Callout"
            }));
            turnIntoSubmenu.push(createTurnsIntoMenu({
                menuId: "heading1",
                icon: "iconH1",
                label: window.sourceflow.languages.heading1,
                accelerator: window.sourceflow.config.keymap.editor.heading.heading1.custom,
                protyle,
                selectsElement: [nodeElement],
                level: 1,
                type: "Blocks2Hs",
            }));
            turnIntoSubmenu.push(createTurnsIntoMenu({
                menuId: "heading2",
                icon: "iconH2",
                label: window.sourceflow.languages.heading2,
                accelerator: window.sourceflow.config.keymap.editor.heading.heading2.custom,
                protyle,
                selectsElement: [nodeElement],
                level: 2,
                type: "Blocks2Hs",
            }));
            turnIntoSubmenu.push(createTurnsIntoMenu({
                menuId: "heading3",
                icon: "iconH3",
                label: window.sourceflow.languages.heading3,
                accelerator: window.sourceflow.config.keymap.editor.heading.heading3.custom,
                protyle,
                selectsElement: [nodeElement],
                level: 3,
                type: "Blocks2Hs",
            }));
            turnIntoSubmenu.push(createTurnsIntoMenu({
                menuId: "heading4",
                icon: "iconH4",
                label: window.sourceflow.languages.heading4,
                accelerator: window.sourceflow.config.keymap.editor.heading.heading4.custom,
                protyle,
                selectsElement: [nodeElement],
                level: 4,
                type: "Blocks2Hs",
            }));
            turnIntoSubmenu.push(createTurnsIntoMenu({
                menuId: "heading5",
                icon: "iconH5",
                label: window.sourceflow.languages.heading5,
                accelerator: window.sourceflow.config.keymap.editor.heading.heading5.custom,
                protyle,
                selectsElement: [nodeElement],
                level: 5,
                type: "Blocks2Hs",
            }));
            turnIntoSubmenu.push(createTurnsIntoMenu({
                menuId: "heading6",
                icon: "iconH6",
                label: window.sourceflow.languages.heading6,
                accelerator: window.sourceflow.config.keymap.editor.heading.heading6.custom,
                protyle,
                selectsElement: [nodeElement],
                level: 6,
                type: "Blocks2Hs",
            }));
        } else if (type === "NodeHeading" && !protyle.disabled) {
            turnIntoSubmenu.push(createTurnsIntoMenu({
                menuId: "paragraph",
                icon: "iconParagraph",
                label: window.sourceflow.languages.paragraph,
                accelerator: window.sourceflow.config.keymap.editor.heading.paragraph.custom,
                protyle,
                selectsElement: [nodeElement],
                type: "Blocks2Ps",
            }));
            turnIntoSubmenu.push(createTurnsIntoOneMenu({
                menuId: "quote",
                icon: "iconQuote",
                label: window.sourceflow.languages.quote,
                accelerator: window.sourceflow.config.keymap.editor.insert.quote.custom,
                protyle,
                selectsElement: [nodeElement],
                type: "Blocks2Blockquote"
            }));
            turnIntoSubmenu.push(createTurnsIntoOneMenu({
                menuId: "callout",
                icon: "iconCallout",
                label: window.sourceflow.languages.callout,
                protyle,
                selectsElement: [nodeElement],
                type: "Blocks2Callout"
            }));
            if (subType !== "h1") {
                turnIntoSubmenu.push(createTurnsIntoMenu({
                    menuId: "heading1",
                    icon: "iconH1",
                    label: window.sourceflow.languages.heading1,
                    accelerator: window.sourceflow.config.keymap.editor.heading.heading1.custom,
                    protyle,
                    selectsElement: [nodeElement],
                    level: 1,
                    type: "Blocks2Hs",
                }));
            }
            if (subType !== "h2") {
                turnIntoSubmenu.push(createTurnsIntoMenu({
                    menuId: "heading2",
                    icon: "iconH2",
                    label: window.sourceflow.languages.heading2,
                    accelerator: window.sourceflow.config.keymap.editor.heading.heading2.custom,
                    protyle,
                    selectsElement: [nodeElement],
                    level: 2,
                    type: "Blocks2Hs",
                }));
            }
            if (subType !== "h3") {
                turnIntoSubmenu.push(createTurnsIntoMenu({
                    menuId: "heading3",
                    icon: "iconH3",
                    label: window.sourceflow.languages.heading3,
                    accelerator: window.sourceflow.config.keymap.editor.heading.heading3.custom,
                    protyle,
                    selectsElement: [nodeElement],
                    level: 3,
                    type: "Blocks2Hs",
                }));
            }
            if (subType !== "h4") {
                turnIntoSubmenu.push(createTurnsIntoMenu({
                    menuId: "heading4",
                    icon: "iconH4",
                    label: window.sourceflow.languages.heading4,
                    accelerator: window.sourceflow.config.keymap.editor.heading.heading4.custom,
                    protyle,
                    selectsElement: [nodeElement],
                    level: 4,
                    type: "Blocks2Hs",
                }));
            }
            if (subType !== "h5") {
                turnIntoSubmenu.push(createTurnsIntoMenu({
                    menuId: "heading5",
                    icon: "iconH5",
                    label: window.sourceflow.languages.heading5,
                    accelerator: window.sourceflow.config.keymap.editor.heading.heading5.custom,
                    protyle,
                    selectsElement: [nodeElement],
                    level: 5,
                    type: "Blocks2Hs",
                }));
            }
            if (subType !== "h6") {
                turnIntoSubmenu.push(createTurnsIntoMenu({
                    menuId: "heading6",
                    icon: "iconH6",
                    label: window.sourceflow.languages.heading6,
                    accelerator: window.sourceflow.config.keymap.editor.heading.heading6.custom,
                    protyle,
                    selectsElement: [nodeElement],
                    level: 6,
                    type: "Blocks2Hs",
                }));
            }
        } else if (type === "NodeList" && !protyle.disabled) {
            turnIntoSubmenu.push(createTurnsOneIntoMenu({
                menuId: "paragraph",
                id,
                icon: "iconParagraph",
                label: window.sourceflow.languages.paragraph,
                accelerator: window.sourceflow.config.keymap.editor.heading.paragraph.custom,
                protyle,
                nodeElement,
                type: "CancelList"
            }));
            turnIntoSubmenu.push(createTurnsIntoOneMenu({
                menuId: "quote",
                icon: "iconQuote",
                label: window.sourceflow.languages.quote,
                accelerator: window.sourceflow.config.keymap.editor.insert.quote.custom,
                protyle,
                selectsElement: [nodeElement],
                type: "Blocks2Blockquote"
            }));
            turnIntoSubmenu.push(createTurnsIntoOneMenu({
                menuId: "callout",
                icon: "iconCallout",
                label: window.sourceflow.languages.callout,
                protyle,
                selectsElement: [nodeElement],
                type: "Blocks2Callout"
            }));
            if (nodeElement.getAttribute("data-subtype") === "o") {
                turnIntoSubmenu.push(createTurnsOneIntoMenu({
                    menuId: "list",
                    id,
                    icon: "iconList",
                    label: window.sourceflow.languages.list,
                    accelerator: window.sourceflow.config.keymap.editor.insert.list.custom,
                    protyle,
                    nodeElement,
                    type: "OL2UL"
                }));
                turnIntoSubmenu.push(createTurnsOneIntoMenu({
                    menuId: "check",
                    id,
                    icon: "iconCheck",
                    label: window.sourceflow.languages.check,
                    accelerator: window.sourceflow.config.keymap.editor.insert.check.custom,
                    protyle,
                    nodeElement,
                    type: "UL2TL"
                }));
            } else if (nodeElement.getAttribute("data-subtype") === "t") {
                turnIntoSubmenu.push(createTurnsOneIntoMenu({
                    menuId: "list",
                    id,
                    icon: "iconList",
                    label: window.sourceflow.languages.list,
                    accelerator: window.sourceflow.config.keymap.editor.insert.list.custom,
                    protyle,
                    nodeElement,
                    type: "TL2UL"
                }));
                turnIntoSubmenu.push(createTurnsOneIntoMenu({
                    menuId: "orderedList",
                    id,
                    icon: "iconOrderedList",
                    label: window.sourceflow.languages["ordered-list"],
                    accelerator: window.sourceflow.config.keymap.editor.insert["ordered-list"].custom,
                    protyle,
                    nodeElement,
                    type: "TL2OL"
                }));
            } else {
                turnIntoSubmenu.push(createTurnsOneIntoMenu({
                    menuId: "orderedList",
                    id,
                    icon: "iconOrderedList",
                    label: window.sourceflow.languages["ordered-list"],
                    accelerator: window.sourceflow.config.keymap.editor.insert["ordered-list"].custom,
                    protyle,
                    nodeElement,
                    type: "UL2OL"
                }));
                turnIntoSubmenu.push(createTurnsOneIntoMenu({
                    menuId: "check",
                    id,
                    icon: "iconCheck",
                    label: window.sourceflow.languages.check,
                    accelerator: window.sourceflow.config.keymap.editor.insert.check.custom,
                    protyle,
                    nodeElement,
                    type: "OL2TL"
                }));
            }
        } else if (type === "NodeBlockquote" && !protyle.disabled) {
            turnIntoSubmenu.push(createTurnsOneIntoMenu({
                menuId: "paragraph",
                id,
                icon: "iconParagraph",
                label: window.sourceflow.languages.paragraph,
                accelerator: window.sourceflow.config.keymap.editor.heading.paragraph.custom,
                protyle,
                nodeElement,
                type: "CancelBlockquote"
            }));
            turnIntoSubmenu.push(createTurnsOneIntoMenu({
                id,
                icon: "iconCallout",
                label: window.sourceflow.languages.callout,
                protyle,
                nodeElement,
                type: "Blockquote2Callout"
            }));
        } else if (type === "NodeCallout" && !protyle.disabled) {
            turnIntoSubmenu.push(createTurnsOneIntoMenu({
                menuId: "paragraph",
                id,
                icon: "iconParagraph",
                label: window.sourceflow.languages.paragraph,
                accelerator: window.sourceflow.config.keymap.editor.heading.paragraph.custom,
                protyle,
                nodeElement,
                type: "CancelCallout"
            }));
            turnIntoSubmenu.push(createTurnsOneIntoMenu({
                id,
                icon: "iconQuote",
                label: window.sourceflow.languages.quote,
                protyle,
                nodeElement,
                type: "Callout2Blockquote"
            }));
        }
        if (turnIntoSubmenu.length > 0 && !protyle.disabled) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "turnInto",
                icon: "iconRefresh",
                label: window.sourceflow.languages.turnInto,
                type: "submenu",
                submenu: turnIntoSubmenu
            }).element);
        }
        if (!protyle.disabled && !nodeElement.classList.contains("hr")) {
            if (id !== protyle.block.rootID) {
                const isHiddenBlock = nodeElement.getAttribute("custom-hidden") === "true";
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "toggleHiddenBlock",
                    icon: isHiddenBlock ? "iconEye" : "iconEyeoff",
                    label: isHiddenBlock ? (window.sourceflow.config.lang === "zh_CN" ? "显示隐藏块" : "Reveal block") : (window.sourceflow.config.lang === "zh_CN" ? "隐藏块" : "Hide block"),
                    click() {
                        if (isHiddenBlock) {
                            nodeElement.removeAttribute("custom-hidden");
                        } else {
                            nodeElement.setAttribute("custom-hidden", "true");
                        }
                        fetchPost("/api/attr/setBlockAttrs", {
                            id,
                            attrs: {"custom-hidden": isHiddenBlock ? "" : "true"}
                        });
                        window.sourceflow.menus.menu.remove();
                    }
                }).element);
            }
            appendAssistantContextActions({
                protyle,
                range: getEditorRange(nodeElement),
                fallbackSelectionText: getPlainText(nodeElement as HTMLElement).trim(),
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
                    AIActions([nodeElement], protyle);
                }
            }).element);
        }

};
