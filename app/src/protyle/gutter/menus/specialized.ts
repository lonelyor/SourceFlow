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

export const appendSpecializedSection = (context: SingleMenuContext) => {
    const {protyle, nodeElement, id, type, subType} = context;
        if (type === "NodeSuperBlock" && !protyle.disabled) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "separator_cancelSuperBlock",
                type: "separator"
            }).element);
            const isCol = nodeElement.getAttribute("data-sb-layout") === "col";
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "cancelSuperBlock",
                label: window.sourceflow.languages.cancel + " " + window.sourceflow.languages.superBlock,
                accelerator: window.sourceflow.config.keymap.editor.general[isCol ? "hLayout" : "vLayout"].custom,
                async click() {
                    const sbData = await cancelSB(protyle, nodeElement);
                    transaction(protyle, sbData.doOperations, sbData.undoOperations);
                    focusBlock(protyle.wysiwyg.element.querySelector(`[data-node-id="${sbData.previousId}"]`));
                    hideElements(["gutter"], protyle);
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "turnInto" + (isCol ? "VLayout" : "HLayout"),
                accelerator: window.sourceflow.config.keymap.editor.general[isCol ? "vLayout" : "hLayout"].custom,
                label: window.sourceflow.languages.turnInto + " " + window.sourceflow.languages[isCol ? "vLayout" : "hLayout"],
                click() {
                    const oldHTML = nodeElement.outerHTML;
                    if (isCol) {
                        nodeElement.setAttribute("data-sb-layout", "row");
                    } else {
                        nodeElement.setAttribute("data-sb-layout", "col");
                    }
                    nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                    updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                    focusByRange(protyle.toolbar.range);
                    hideElements(["gutter"], protyle);
                }
            }).element);
        } else if (type === "NodeCodeBlock" && !nodeElement.getAttribute("data-subtype")) {
            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_code", type: "separator"}).element);
            const linewrap = nodeElement.getAttribute("linewrap");
            const ligatures = nodeElement.getAttribute("ligatures");
            const linenumber = nodeElement.getAttribute("linenumber");

            window.sourceflow.menus.menu.append(new MenuItem({
                id: "code",
                type: "submenu",
                icon: "iconCode",
                label: window.sourceflow.languages.code,
                submenu: [{
                    id: "md31",
                    iconHTML: "",
                    ignore: protyle.disabled,
                    label: `<div class="fn__flex" style="margin-bottom: 4px"><span>${window.sourceflow.languages.md31}</span><span class="fn__space fn__flex-1"></span>
<input type="checkbox" class="b3-switch fn__flex-center"${linewrap === "true" ? " checked" : ((window.sourceflow.config.editor.codeLineWrap && linewrap !== "false") ? " checked" : "")}></div>`,
                    bind(element) {
                        element.addEventListener("click", (event: MouseEvent & { target: HTMLElement }) => {
                            const inputElement = element.querySelector("input");
                            if (event.target.tagName !== "INPUT") {
                                inputElement.checked = !inputElement.checked;
                            }
                            nodeElement.setAttribute("linewrap", inputElement.checked.toString());
                            nodeElement.querySelector(".hljs").removeAttribute("data-render");
                            highlightRender(nodeElement);
                            fetchPost("/api/attr/setBlockAttrs", {
                                id,
                                attrs: {linewrap: inputElement.checked.toString()}
                            });
                            window.sourceflow.menus.menu.remove();
                        });
                    }
                }, {
                    id: "md2",
                    iconHTML: "",
                    ignore: protyle.disabled,
                    label: `<div class="fn__flex" style="margin-bottom: 4px"><span>${window.sourceflow.languages.md2}</span><span class="fn__space fn__flex-1"></span>
<input type="checkbox" class="b3-switch fn__flex-center"${ligatures === "true" ? " checked" : ((window.sourceflow.config.editor.codeLigatures && ligatures !== "false") ? " checked" : "")}></div>`,
                    bind(element) {
                        element.addEventListener("click", (event: MouseEvent & { target: HTMLElement }) => {
                            const inputElement = element.querySelector("input");
                            if (event.target.tagName !== "INPUT") {
                                inputElement.checked = !inputElement.checked;
                            }
                            nodeElement.setAttribute("ligatures", inputElement.checked.toString());
                            nodeElement.querySelector(".hljs").removeAttribute("data-render");
                            highlightRender(nodeElement);
                            fetchPost("/api/attr/setBlockAttrs", {
                                id,
                                attrs: {ligatures: inputElement.checked.toString()}
                            });
                            window.sourceflow.menus.menu.remove();
                        });
                    }
                }, {
                    id: "md27",
                    iconHTML: "",
                    ignore: protyle.disabled,
                    label: `<div class="fn__flex" style="margin-bottom: 4px"><span>${window.sourceflow.languages.md27}</span><span class="fn__space fn__flex-1"></span>
<input type="checkbox" class="b3-switch fn__flex-center"${linenumber === "true" ? " checked" : ((window.sourceflow.config.editor.codeSyntaxHighlightLineNum && linenumber !== "false") ? " checked" : "")}></div>`,
                    bind(element) {
                        element.addEventListener("click", (event: MouseEvent & { target: HTMLElement }) => {
                            const inputElement = element.querySelector("input");
                            if (event.target.tagName !== "INPUT") {
                                inputElement.checked = !inputElement.checked;
                            }
                            nodeElement.setAttribute("linenumber", inputElement.checked.toString());
                            nodeElement.querySelector(".hljs").removeAttribute("data-render");
                            highlightRender(nodeElement);
                            fetchPost("/api/attr/setBlockAttrs", {
                                id,
                                attrs: {linenumber: inputElement.checked.toString()}
                            });
                            window.sourceflow.menus.menu.remove();
                        });
                    }
                }, {
                    id: "runCodeBlock",
                    iconHTML: "",
                    ignore: protyle.disabled || !canRunCodeBlock(),
                    label: window.sourceflow.config.lang === "zh_CN" ? "一键运行" : "Run code",
                    click() {
                        runCodeBlock(protyle, nodeElement as HTMLElement);
                    }
                }, {
                    id: "saveCodeBlockAsFile",
                    iconHTML: "",
                    label: window.sourceflow.languages.saveCodeBlockAsFile,
                    click() {
                        const msgId = showMessage(window.sourceflow.languages.exporting, -1);
                        fetchPost("/api/export/exportCodeBlock", {id}, (response) => {
                            hideMessage(msgId);
                            openByMobile(response.data.path);
                        });
                    }
                }]
            }).element);
        } else if (type === "NodeCodeBlock" && !protyle.disabled && ["echarts", "mindmap"].includes(nodeElement.getAttribute("data-subtype"))) {
            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_chart", type: "separator"}).element);
            const height = (nodeElement as HTMLElement).style.height;
            let html = nodeElement.outerHTML;
            const isMindmapBlock = nodeElement.getAttribute("data-subtype") === "mindmap";
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "chart",
                label: isMindmapBlock ? window.sourceflow.languages.mindmap : window.sourceflow.languages.chart,
                icon: "iconCode",
                submenu: [{
                    id: "height",
                    iconHTML: "",
                    type: "readonly",
                    label: `<div class="fn__flex"><input class="b3-text-field fn__flex-1" value="${height ? parseInt(height) : "420"}" step="1" min="148" style="margin: 4px 8px 4px 0" placeholder="${window.sourceflow.languages.height}"><span class="fn__flex-center">px</span></div>`,
                    bind: (element) => {
                        element.querySelector("input").addEventListener("change", (event) => {
                            const newHeight = ((event.target as HTMLInputElement).value || "420") + "px";
                            (nodeElement as HTMLElement).style.height = newHeight;
                            updateTransaction(protyle, id, nodeElement.outerHTML, html);
                            html = nodeElement.outerHTML;
                            event.stopPropagation();
                            const renderElement = nodeElement.querySelector('[contenteditable="false"]') as HTMLElement;
                            if (renderElement) {
                                renderElement.style.height = newHeight;
                                const chartInstance = window.echarts.getInstanceById(renderElement.getAttribute("_echarts_instance_"));
                                if (chartInstance) {
                                    chartInstance.resize();
                                }
                            }
                        });
                    }
                }, {
                    id: "update",
                    label: window.sourceflow.languages.update,
                    icon: "iconEdit",
                    click() {
                        protyle.toolbar.showRender(protyle, nodeElement);
                    }
                }]
            }).element);
        } else if (type === "NodeHTMLBlock" && !protyle.disabled && nodeElement.getAttribute("data-subtype") === "mind-elixir") {
            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_mind_elixir", type: "separator"}).element);
            const height = (nodeElement as HTMLElement).style.height;
            let html = nodeElement.outerHTML;
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "mindElixir",
                label: window.sourceflow.languages.mindmap,
                icon: "iconGraph",
                submenu: [{
                    id: "height",
                    iconHTML: "",
                    type: "readonly",
                    label: `<div class="fn__flex"><input class="b3-text-field fn__flex-1" value="${height ? parseInt(height) : "420"}" step="1" min="148" style="margin: 4px 8px 4px 0" placeholder="${window.sourceflow.languages.height}"><span class="fn__flex-center">px</span></div>`,
                    bind: (element) => {
                        element.querySelector("input").addEventListener("change", (event) => {
                            const newHeight = ((event.target as HTMLInputElement).value || "420") + "px";
                            (nodeElement as HTMLElement).style.height = newHeight;
                            updateTransaction(protyle, id, nodeElement.outerHTML, html);
                            html = nodeElement.outerHTML;
                            event.stopPropagation();
                            const renderElement = nodeElement.querySelector(".protyle-mindmap") as HTMLElement;
                            if (renderElement) {
                                renderElement.style.height = newHeight;
                            }
                            (nodeElement as HTMLElement & { sourceflowMindElixir?: { refresh: () => void, scaleFit: () => void } }).sourceflowMindElixir?.refresh();
                        });
                    }
                }, {
                    id: "focus",
                    label: window.sourceflow.languages.edit,
                    icon: "iconFocus",
                    click() {
                        protyle.toolbar.showRender(protyle, nodeElement);
                    }
                }]
            }).element);
        } else if (type === "NodeTable" && !protyle.disabled) {
            let range = getEditorRange(nodeElement);
            const tableElement = nodeElement.querySelector("table");
            if (!tableElement.contains(range.startContainer)) {
                range = getEditorRange(tableElement.querySelector("th"));
            }
            const cellElement = hasClosestByTag(range.startContainer, "TD") ||
                hasClosestByTag(range.startContainer, "TH") || nodeElement.querySelector("th, td");
            if (cellElement) {
                window.sourceflow.menus.menu.append(new MenuItem({id: "separator_table", type: "separator"}).element);
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "table",
                    type: "submenu",
                    icon: "iconTable",
                    label: window.sourceflow.languages.table,
                    submenu: tableMenu(protyle, nodeElement, cellElement as HTMLTableCellElement, range).menus as IMenu[]
                }).element);
            }
        } else if (type === "NodeAttributeView") {
            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_exportCSV", type: "separator"}).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "exportCSV",
                icon: "iconDatabase",
                label: window.sourceflow.languages.export + " CSV",
                click() {
                    fetchPost("/api/export/exportAttributeView", {
                        id: nodeElement.getAttribute("data-av-id"),
                        blockID: id,
                    }, response => {
                        openByMobile(response.data.zip);
                    });
                }
            }).element);
            /// #if !MOBILE
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "showDatabaseInFolder",
                icon: "iconFolder",
                label: window.sourceflow.languages.showInFolder,
                click() {
                    useShell("showItemInFolder", path.join(window.sourceflow.config.system.dataDir, "storage", "av", nodeElement.getAttribute("data-av-id")) + ".json");
                }
            }).element);
            /// #endif
        } else if ((type === "NodeVideo" || type === "NodeAudio") && !protyle.disabled) {
            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_VideoOrAudio", type: "separator"}).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: type === "NodeVideo" ? "assetVideo" : "assetAudio",
                type: "submenu",
                icon: type === "NodeVideo" ? "iconVideo" : "iconRecord",
                label: window.sourceflow.languages.assets,
                submenu: videoMenu(protyle, nodeElement, type)
            }).element);
        } else if (type === "NodeIFrame" && !protyle.disabled) {
            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_IFrame", type: "separator"}).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "assetIFrame",
                type: "submenu",
                icon: "iconLanguage",
                label: window.sourceflow.languages.assets,
                submenu: iframeMenu(protyle, nodeElement)
            }).element);
        } else if (type === "NodeHTMLBlock" && !protyle.disabled) {
            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_html", type: "separator"}).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "html",
                icon: "iconHTML5",
                label: "HTML",
                click() {
                    protyle.toolbar.showRender(protyle, nodeElement);
                }
            }).element);
        } else if (type === "NodeBlockQueryEmbed" && !protyle.disabled) {
            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_blockEmbed", type: "separator"}).element);
            const breadcrumb = nodeElement.getAttribute("breadcrumb");
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "blockEmbed",
                type: "submenu",
                icon: "iconSQL",
                label: window.sourceflow.languages.blockEmbed,
                submenu: [{
                    id: "refresh",
                    icon: "iconRefresh",
                    label: `${window.sourceflow.languages.refresh} SQL`,
                    click() {
                        nodeElement.removeAttribute("data-render");
                        blockRender(protyle, nodeElement);
                    }
                }, {
                    id: "update",
                    icon: "iconEdit",
                    label: `${window.sourceflow.languages.update} SQL`,
                    click() {
                        protyle.toolbar.showRender(protyle, nodeElement);
                    }
                }, {
                    type: "separator"
                }, {
                    id: "embedBlockBreadcrumb",
                    label: `<div class="fn__flex" style="margin-bottom: 4px"><span>${window.sourceflow.languages.embedBlockBreadcrumb}</span><span class="fn__space fn__flex-1"></span>
<input type="checkbox" class="b3-switch fn__flex-center"${breadcrumb === "true" ? " checked" : ((window.sourceflow.config.editor.embedBlockBreadcrumb && breadcrumb !== "false") ? " checked" : "")}></div>`,
                    bind(element) {
                        element.addEventListener("click", (event: MouseEvent & { target: HTMLElement }) => {
                            const inputElement = element.querySelector("input");
                            if (event.target.tagName !== "INPUT") {
                                inputElement.checked = !inputElement.checked;
                            }
                            nodeElement.setAttribute("breadcrumb", inputElement.checked.toString());
                            fetchPost("/api/attr/setBlockAttrs", {
                                id,
                                attrs: {breadcrumb: inputElement.checked.toString()}
                            });
                            nodeElement.removeAttribute("data-render");
                            blockRender(protyle, nodeElement);
                            window.sourceflow.menus.menu.remove();
                        });
                    }
                }, {
                    id: "headingEmbedMode",
                    label: window.sourceflow.languages.headingEmbedMode,
                    type: "submenu",
                    submenu: [{
                        id: "showHeadingWithBlocks",
                        label: window.sourceflow.languages.showHeadingWithBlocks,
                        iconHTML: "",
                        checked: nodeElement.getAttribute("custom-heading-mode") === "0",
                        click() {
                            nodeElement.setAttribute("custom-heading-mode", "0");
                            fetchPost("/api/attr/setBlockAttrs", {
                                id,
                                attrs: {"custom-heading-mode": "0"}
                            });
                            nodeElement.removeAttribute("data-render");
                            blockRender(protyle, nodeElement);
                        }
                    }, {
                        id: "showHeadingOnlyTitle",
                        label: window.sourceflow.languages.showHeadingOnlyTitle,
                        iconHTML: "",
                        checked: nodeElement.getAttribute("custom-heading-mode") === "1",
                        click() {
                            nodeElement.setAttribute("custom-heading-mode", "1");
                            fetchPost("/api/attr/setBlockAttrs", {
                                id,
                                attrs: {"custom-heading-mode": "1"}
                            });
                            nodeElement.removeAttribute("data-render");
                            blockRender(protyle, nodeElement);
                        }
                    }, {
                        id: "showHeadingOnlyBlocks",
                        label: window.sourceflow.languages.showHeadingOnlyBlocks,
                        iconHTML: "",
                        checked: nodeElement.getAttribute("custom-heading-mode") === "2",
                        click() {
                            nodeElement.setAttribute("custom-heading-mode", "2");
                            fetchPost("/api/attr/setBlockAttrs", {
                                id,
                                attrs: {"custom-heading-mode": "2"}
                            });
                            nodeElement.removeAttribute("data-render");
                            blockRender(protyle, nodeElement);
                        }
                    }, {
                        id: "default",
                        label: window.sourceflow.languages.default,
                        iconHTML: "",
                        checked: !nodeElement.getAttribute("custom-heading-mode"),
                        click() {
                            nodeElement.removeAttribute("custom-heading-mode");
                            fetchPost("/api/attr/setBlockAttrs", {
                                id,
                                attrs: {"custom-heading-mode": ""}
                            });
                            nodeElement.removeAttribute("data-render");
                            blockRender(protyle, nodeElement);
                        }
                    }]
                }]
            }).element);
        } else if (type === "NodeHeading" && !protyle.disabled) {
            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_1", type: "separator"}).element);
            const headingSubMenu = [];
            if (subType !== "h1") {
                headingSubMenu.push(createHeadingTransformMenu(protyle, id, 1));
            }
            if (subType !== "h2") {
                headingSubMenu.push(createHeadingTransformMenu(protyle, id, 2));
            }
            if (subType !== "h3") {
                headingSubMenu.push(createHeadingTransformMenu(protyle, id, 3));
            }
            if (subType !== "h4") {
                headingSubMenu.push(createHeadingTransformMenu(protyle, id, 4));
            }
            if (subType !== "h5") {
                headingSubMenu.push(createHeadingTransformMenu(protyle, id, 5));
            }
            if (subType !== "h6") {
                headingSubMenu.push(createHeadingTransformMenu(protyle, id, 6));
            }
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "tWithSubtitle",
                type: "submenu",
                icon: "iconRefresh",
                label: window.sourceflow.languages.tWithSubtitle,
                submenu: headingSubMenu
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "copyHeadings1",
                icon: "iconCopy",
                label: `${window.sourceflow.languages.copy} ${window.sourceflow.languages.headings1}`,
                click() {
                    fetchPost("/api/block/getHeadingChildrenDOM", {
                        id,
                        removeFoldAttr: nodeElement.getAttribute("fold") !== "1"
                    }, (response) => {
                        if (isInAndroid()) {
                            writeNativeSourceFlowHTMLClipboard("android", protyle.lute.BlockDOM2StdMd(response.data).trimEnd(), protyle.lute.BlockDOM2HTML(response.data).trimEnd(), response.data + Constants.ZWSP);
                        } else if (isInHarmony()) {
                            writeNativeSourceFlowHTMLClipboard("harmony", protyle.lute.BlockDOM2StdMd(response.data).trimEnd(), protyle.lute.BlockDOM2HTML(response.data).trimEnd(), response.data + Constants.ZWSP);
                        } else {
                            writeText(response.data + Constants.ZWSP);
                        }
                    });
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "cutHeadings1",
                icon: "iconCut",
                label: `${window.sourceflow.languages.cut} ${window.sourceflow.languages.headings1}`,
                click() {
                    fetchPost("/api/block/getHeadingChildrenDOM", {
                        id,
                        removeFoldAttr: nodeElement.getAttribute("fold") !== "1"
                    }, (response) => {
                        if (isInAndroid()) {
                            window.JSAndroid.writeHTMLClipboard(protyle.lute.BlockDOM2StdMd(response.data).trimEnd(), response.data + Constants.ZWSP);
                        } else if (isInHarmony()) {
                            window.JSHarmony.writeHTMLClipboard(protyle.lute.BlockDOM2StdMd(response.data).trimEnd(), response.data + Constants.ZWSP);
                        } else {
                            writeText(response.data + Constants.ZWSP);
                        }
                        fetchPost("/api/block/getHeadingDeleteTransaction", {
                            id,
                        }, (deleteResponse) => {
                            deleteResponse.data.doOperations.forEach((operation: IOperation) => {
                                protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`).forEach((itemElement: HTMLElement) => {
                                    itemElement.remove();
                                });
                            });
                            if (protyle.wysiwyg.element.childElementCount === 0) {
                                const newID = Lute.NewNodeID();
                                const emptyElement = genEmptyElement(false, false, newID);
                                protyle.wysiwyg.element.insertAdjacentElement("afterbegin", emptyElement);
                                deleteResponse.data.doOperations.push({
                                    action: "insert",
                                    data: emptyElement.outerHTML,
                                    id: newID,
                                    parentID: protyle.block.parentID
                                });
                                deleteResponse.data.undoOperations.push({
                                    action: "delete",
                                    id: newID,
                                });
                                focusBlock(emptyElement);
                            }
                            transaction(protyle, deleteResponse.data.doOperations, deleteResponse.data.undoOperations);
                        });
                    });
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "deleteHeadings1",
                icon: "iconTrashcan",
                label: `${window.sourceflow.languages.delete} ${window.sourceflow.languages.headings1}`,
                click() {
                    fetchPost("/api/block/getHeadingDeleteTransaction", {
                        id,
                    }, (response) => {
                        response.data.doOperations.forEach((operation: IOperation) => {
                            protyle.wysiwyg.element.querySelectorAll(`[data-node-id="${operation.id}"]`).forEach((itemElement: HTMLElement) => {
                                itemElement.remove();
                            });
                        });
                        if (protyle.wysiwyg.element.childElementCount === 0) {
                            const newID = Lute.NewNodeID();
                            const emptyElement = genEmptyElement(false, false, newID);
                            protyle.wysiwyg.element.insertAdjacentElement("afterbegin", emptyElement);
                            response.data.doOperations.push({
                                action: "insert",
                                data: emptyElement.outerHTML,
                                id: newID,
                                parentID: protyle.block.parentID
                            });
                            response.data.undoOperations.push({
                                action: "delete",
                                id: newID,
                            });
                            focusBlock(emptyElement);
                        }
                        transaction(protyle, response.data.doOperations, response.data.undoOperations);
                    });
                }
            }).element);
        }
};
