import {
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByClassName,
    hasClosestByTag,
    hasTopClosestByClassName,
    isInEmbedBlock
} from "../../protyle/util/hasClosest";
import {MenuItem} from "../Menu";
import {focusBlock, focusByRange, focusByWbr, getEditorRange, selectAll,} from "../../protyle/util/selection";
import {
    deleteColumn,
    deleteRow,
    getColIndex,
    insertColumn,
    insertRow,
    insertRowAbove,
    moveColumnToLeft,
    moveColumnToRight,
    moveRowToDown,
    moveRowToUp,
    setTableAlign,
    updateTableTitle
} from "../../protyle/util/table";
import {mathRender} from "../../protyle/render/mathRender";
import {transaction, updateTransaction} from "../../protyle/wysiwyg/transaction";
import {openMenu} from "../commonMenuItem";
import {fetchPost, fetchSyncPost} from "../../util/fetch";
import {Constants} from "../../constants";
import {copyPlainText, readClipboard, setStorageVal, updateHotkeyTip, writeText} from "../../protyle/util/compatibility";
import {preventScroll} from "../../protyle/scroll/preventScroll";
import {onGet} from "../../protyle/util/onGet";
import {getAllModels} from "../../layout/getAll";
import {getPlainText, paste, pasteAsImage, pasteAsPlainText, pasteAsSmartTable, pasteEscaped, pastePreserveLayout} from "../../protyle/util/paste";
/// #if !MOBILE
import {openFileById, updateBacklinkGraph} from "../../editor/util";
import {openGlobalSearch} from "../../search/util";
import {openNewWindowById} from "../../window/openNewWindow";
/// #endif
import {getSearch, isMobile} from "../../util/functions";
import {removeFoldHeading} from "../../protyle/util/heading";
import {lineNumberRender} from "../../protyle/render/highlightRender";
import * as dayjs from "dayjs";
import {blockRender} from "../../protyle/render/blockRender";
import {renameAsset} from "../../editor/rename";
import {electronUndo} from "../../protyle/undo";
import {pushBack} from "../../mobile/util/MobileBackFoward";
import {copyPNGByLink, exportAsset, writeAssetToClipboard} from "../util";
import {removeInlineType} from "../../protyle/toolbar/util";
import {alignImgCenter, alignImgLeft} from "../../protyle/wysiwyg/commonHotkey";
import {checkFold, renameTag} from "../../util/noRelyPCFunction";
import {hideElements} from "../../protyle/ui/hideElements";
import {emitOpenMenu} from "../../plugin/EventBus";
import {openMobileFileById} from "../../mobile/editor";
import {openBacklink, openGraph} from "../../layout/dock/util";
import {renderAssetsPreview} from "../../asset/renderAssets";
import {upDownHint} from "../../util/upDownHint";
import {hintRenderAssets} from "../../protyle/hint/extend";
import {Menu} from "../../plugin/Menu";
import {getFirstBlock} from "../../protyle/wysiwyg/getBlock";
import {getIdFromSYProtocol, isSYProtocol} from "../../util/pathName";
import {popSearch} from "../../mobile/menu/search";
import {showMessage} from "../../dialog/message";
import {img3115} from "../../boot/compatibleVersion";
import {hideTooltip} from "../../dialog/tooltip";
import {clearSelect} from "../../protyle/util/clear";
import {scrollCenter} from "../../util/highlightById";
import {base64ToURL} from "../../util/image";
import {importLocalAttachments, uploadFiles} from "../../protyle/upload";
import {reloadProtyle} from "../../protyle/util/reload";
import {appendAssistantContextActions} from "../../assistant/skills/contextActions";
import {net2LocalAssets} from "../../protyle/breadcrumb/action";
import {tableMenu} from "./table";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif


const loadWorkbenchDialogModule = () => import("../../workbench/dialog");
const hiddenInlineText = (zh: string, en: string) => window.sourceflow.config.lang === "zh_CN" ? zh : en;

const insertBlockTemplate = (protyle: IProtyle, nodeElement: Element, markdown: string) => {
    const id = nodeElement.getAttribute("data-node-id") || "";
    const tempId = Lute.NewNodeID();
    const dom = protyle.lute.Md2BlockDOM(markdown);
    const doOperations: IOperation[] = [{action: "insert", data: dom, id: tempId, previousID: id}];
    const undoOperations: IOperation[] = [{action: "delete", id: tempId}];
    nodeElement.insertAdjacentHTML("afterend", dom);
    const newElement = nodeElement.nextElementSibling;
    if (newElement) {
        newElement.setAttribute("data-node-id", tempId);
    }
    transaction(protyle, doOperations, undoOperations);
    focusBlock(protyle.element);
    hideElements(["toolbar"], protyle);
};
const isHiddenInlineElement = (element?: HTMLElement | null) => element?.getAttribute("data-inline-hidden") === "true";
/// #if !BROWSER
const openImportAttachmentDialog = async (protyle: IProtyle, properties: string[], copyAsAsset: boolean) => {
    const localPath = await ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
        cmd: "showOpenDialog",
        defaultPath: window.sourceflow.config.system.homeDir,
        properties,
    });
    if (localPath.filePaths.length === 0) {
        return;
    }
    importLocalAttachments(protyle, localPath.filePaths, copyAsAsset);
    window.sourceflow.menus.menu.remove();
};
/// #endif

const revealHiddenInlineElement = (protyle: IProtyle, nodeElement: Element, inlineElement: HTMLElement, oldHTML: string) => {
    inlineElement.style.filter = "";
    inlineElement.style.opacity = "";
    inlineElement.style.userSelect = "";
    inlineElement.style.pointerEvents = "";
    inlineElement.removeAttribute("data-inline-hidden");
    if (!inlineElement.getAttribute("style")) {
        inlineElement.removeAttribute("style");
    }
    nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
    updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
};

const hideCurrentSelectionInline = (protyle: IProtyle, nodeElement: Element, oldHTML: string) => {
    const currentRange = getEditorRange(nodeElement);
    if (currentRange.toString() === "") {
        return;
    }
    protyle.toolbar.range = currentRange;
    protyle.toolbar.setInlineMark(protyle, "text", "range", {type: "style5", color: ""});
    nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
    updateTransaction(protyle, nodeElement.getAttribute("data-node-id"), nodeElement.outerHTML, oldHTML);
};

export const contentMenu = (protyle: IProtyle, nodeElement: Element) => {
    const range = getEditorRange(nodeElement);
    window.sourceflow.menus.menu.remove();
    window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_INLINE_CONTEXT);
    /// #if MOBILE
    protyle.toolbar.showContent(protyle, range, nodeElement);
    /// #else
    const oldHTML = nodeElement.outerHTML;
    const id = nodeElement.getAttribute("data-node-id");
    const captionElement = hasClosestByTag(range.startContainer, "CAPTION");
    if (range.toString() !== "" || (range.cloneContents().childNodes[0] as HTMLElement)?.classList?.contains("emoji")) {
        const hiddenStartElement = hasClosestByAttribute(range.startContainer, "data-inline-hidden", "true") as HTMLElement;
        const hiddenEndElement = hasClosestByAttribute(range.endContainer, "data-inline-hidden", "true") as HTMLElement;
        const canRevealHiddenSelection = hiddenStartElement && hiddenStartElement === hiddenEndElement;
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "copy",
            icon: "iconCopy",
            accelerator: "?C",
            label: window.sourceflow.languages.copy,
            click() {
                // range 需要重新获取。
                focusByRange(getEditorRange(nodeElement));
                document.execCommand("copy");
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "copyPlainText",
            label: window.sourceflow.languages.copyPlainText,
            accelerator: window.sourceflow.config.keymap.editor.general.copyPlainText.custom,
            click() {
                focusByRange(getEditorRange(nodeElement));
                copyPlainText(getSelection().getRangeAt(0).toString());
            }
        }).element);
        if (!protyle.disabled && !captionElement) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "toggleInlineHidden",
                icon: canRevealHiddenSelection ? "iconEye" : "iconEyeoff",
                label: canRevealHiddenSelection ? hiddenInlineText("显示选区隐藏内容", "Reveal selection") : hiddenInlineText("隐藏选区内容", "Hide selection"),
                click() {
                    if (canRevealHiddenSelection) {
                        revealHiddenInlineElement(protyle, nodeElement, hiddenStartElement, oldHTML);
                    } else {
                        hideCurrentSelectionInline(protyle, nodeElement, oldHTML);
                    }
                }
            }).element);
        }
        if (protyle.disabled || captionElement) {
            return;
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "cut",
            icon: "iconCut",
            accelerator: "?X",
            label: window.sourceflow.languages.cut,
            click() {
                focusByRange(getEditorRange(nodeElement));
                document.execCommand("cut");
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "delete",
            icon: "iconTrashcan",
            accelerator: "?",
            label: window.sourceflow.languages.delete,
            click() {
                const currentRange = getEditorRange(nodeElement);
                currentRange.insertNode(document.createElement("wbr"));
                currentRange.extractContents();
                focusByWbr(nodeElement, currentRange);
                focusByRange(currentRange);
                updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
            }
        }).element);
    } else {
        // https://github.com/lonelyor/SourceFlow/issues/9630
        const inlineElement = hasClosestByTag(range.startContainer, "SPAN");
        if (inlineElement) {
            const inlineTypes = protyle.toolbar.getCurrentType(range);
            if (isHiddenInlineElement(inlineElement)) {
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "revealHiddenInline",
                    icon: "iconEye",
                    label: hiddenInlineText("显示隐藏内容", "Reveal hidden content"),
                    click() {
                        revealHiddenInlineElement(protyle, nodeElement, inlineElement, oldHTML);
                    }
                }).element);
                window.sourceflow.menus.menu.append(new MenuItem({
                    type: "separator",
                }).element);
            }
            if (inlineTypes.includes("code") || inlineTypes.includes("kbd")) {
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "copy",
                    label: window.sourceflow.languages.copy,
                    icon: "iconCopy",
                    click() {
                        writeText(protyle.lute.BlockDOM2StdMd(inlineElement.outerHTML));
                    }
                }).element);
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "copyPlainText",
                    label: window.sourceflow.languages.copyPlainText,
                    click() {
                        copyPlainText(inlineElement.textContent);
                    }
                }).element);
                if (!protyle.disabled) {
                    const id = nodeElement.getAttribute("data-node-id");
                    window.sourceflow.menus.menu.append(new MenuItem({
                        id: "cut",
                        icon: "iconCut",
                        label: window.sourceflow.languages.cut,
                        click() {
                            writeText(protyle.lute.BlockDOM2StdMd(inlineElement.outerHTML));

                            inlineElement.insertAdjacentHTML("afterend", "<wbr>");
                            inlineElement.remove();
                            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                            updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                            focusByWbr(nodeElement, protyle.toolbar.range);
                        }
                    }).element);
                    window.sourceflow.menus.menu.append(new MenuItem({
                        id: "remove",
                        icon: "iconTrashcan",
                        label: window.sourceflow.languages.remove,
                        click() {
                            inlineElement.insertAdjacentHTML("afterend", "<wbr>");
                            inlineElement.remove();
                            nodeElement.setAttribute("updated", dayjs().format("YYYYMMDDHHmmss"));
                            updateTransaction(protyle, id, nodeElement.outerHTML, oldHTML);
                            focusByWbr(nodeElement, protyle.toolbar.range);
                        }
                    }).element);
                }
                window.sourceflow.menus.menu.append(new MenuItem({
                    type: "separator",
                }).element);
            }
        }
    }
    if (!protyle.disabled && !captionElement) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "paste",
            label: window.sourceflow.languages.paste,
            icon: "iconPaste",
            accelerator: "?V",
            async click() {
                focusByRange(getEditorRange(nodeElement));
                if (document.queryCommandSupported("paste")) {
                    document.execCommand("paste");
                } else {
                    try {
                        const text = await readClipboard();
                        paste(protyle, Object.assign(text, {target: nodeElement as HTMLElement}));
                    } catch (e) {
                        console.log(e);
                    }
                }
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "pasteAsPlainText",
            label: window.sourceflow.languages.pasteAsPlainText,
            accelerator: "??V",
            click() {
                focusByRange(getEditorRange(nodeElement));
                pasteAsPlainText(protyle);
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "pasteAsSmartTable",
            label: window.sourceflow.languages.pasteAsSmartTable,
            click() {
                focusByRange(getEditorRange(nodeElement));
                pasteAsSmartTable(protyle, nodeElement);
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "pastePreserveLayout",
            label: window.sourceflow.languages.pastePreserveLayout,
            click() {
                focusByRange(getEditorRange(nodeElement));
                pastePreserveLayout(protyle, nodeElement);
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "pasteAsImage",
            label: window.sourceflow.languages.pasteAsImage,
            click() {
                focusByRange(getEditorRange(nodeElement));
                pasteAsImage(protyle, nodeElement);
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "pasteEscaped",
            label: window.sourceflow.languages.pasteEscaped,
            click() {
                focusByRange(getEditorRange(nodeElement));
                pasteEscaped(protyle, nodeElement);
            }
        }).element);
    }
    if (!captionElement) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "selectAll",
            label: window.sourceflow.languages.selectAll,
            icon: "iconSelect",
            accelerator: "?A",
            click() {
                selectAll(protyle, nodeElement, range);
            }
        }).element);
    }
    const hasSelection = range && range.toString().trim().length > 0;
    if (!captionElement && !protyle.disabled && hasSelection) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "formatInline",
            icon: "iconFont",
            label: hiddenInlineText("行内格式", "Inline Format"),
            type: "submenu",
            submenu: [
                {id: "fmt-strong", icon: "iconBold", label: hiddenInlineText("粗体", "Bold"), accelerator: updateHotkeyTip(window.sourceflow.config.keymap.editor.insert.strong.custom), click: () => { protyle.toolbar.setInlineMark(protyle, "strong", "toolbar"); }},
                {id: "fmt-em", icon: "iconItalic", label: hiddenInlineText("斜体", "Italic"), accelerator: updateHotkeyTip(window.sourceflow.config.keymap.editor.insert.italic.custom), click: () => { protyle.toolbar.setInlineMark(protyle, "em", "toolbar"); }},
                {id: "fmt-u", icon: "iconUnderline", label: hiddenInlineText("下划线", "Underline"), click: () => { protyle.toolbar.setInlineMark(protyle, "u", "toolbar"); }},
                {id: "fmt-s", icon: "iconStrike", label: hiddenInlineText("删除线", "Strikethrough"), click: () => { protyle.toolbar.setInlineMark(protyle, "s", "toolbar"); }},
                {type: "separator"},
                {id: "fmt-code", icon: "iconInlineCode", label: hiddenInlineText("行内代码", "Inline Code"), accelerator: updateHotkeyTip(window.sourceflow.config.keymap.editor.insert.code.custom), click: () => { protyle.toolbar.setInlineMark(protyle, "code", "toolbar"); }},
                {id: "fmt-kbd", icon: "iconKeymap", label: hiddenInlineText("键盘按键", "Keyboard"), click: () => { protyle.toolbar.setInlineMark(protyle, "kbd", "toolbar"); }},
                {id: "fmt-mark", icon: "iconMark", label: hiddenInlineText("高亮", "Highlight"), click: () => { protyle.toolbar.setInlineMark(protyle, "mark", "toolbar"); }},
                {id: "fmt-sup", icon: "iconSup", label: hiddenInlineText("上标", "Superscript"), click: () => { protyle.toolbar.setInlineMark(protyle, "sup", "toolbar"); }},
                {id: "fmt-sub", icon: "iconSub", label: hiddenInlineText("下标", "Subscript"), click: () => { protyle.toolbar.setInlineMark(protyle, "sub", "toolbar"); }},
                {type: "separator"},
                {id: "fmt-clear", icon: "iconClear", label: hiddenInlineText("清除格式", "Clear Format"), click: () => { protyle.toolbar.setInlineMark(protyle, "clear", "toolbar"); }},
            ],
        }).element);
    }
    if (!captionElement && !protyle.disabled) {
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "insertBlock",
            icon: "iconAdd",
            label: hiddenInlineText("插入", "Insert"),
            type: "submenu",
            submenu: [
                {id: "ins-codeblock", icon: "iconCode", label: hiddenInlineText("代码块", "Code Block"), click: () => { insertBlockTemplate(protyle, nodeElement, "```javascript\n\n```"); }},
                {id: "ins-mathblock", icon: "iconMath", label: hiddenInlineText("数学公式", "Math Block"), click: () => { insertBlockTemplate(protyle, nodeElement, "$$\n\n$$"); }},
                {id: "ins-table", icon: "iconTable", label: hiddenInlineText("表格", "Table"), click: () => { insertBlockTemplate(protyle, nodeElement, "| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |"); }},
                {type: "separator"},
                {id: "ins-quote", icon: "iconQuote", label: hiddenInlineText("引用块", "Blockquote"), click: () => { insertBlockTemplate(protyle, nodeElement, "> "); }},
                {id: "ins-divider", icon: "iconLine", label: hiddenInlineText("分割线", "Divider"), click: () => { insertBlockTemplate(protyle, nodeElement, "---"); }},
                {id: "ins-heading", icon: "iconHead", label: hiddenInlineText("标题", "Heading"), type: "submenu", submenu: [
                    {label: "H1", click: () => { insertBlockTemplate(protyle, nodeElement, "# "); }},
                    {label: "H2", click: () => { insertBlockTemplate(protyle, nodeElement, "## "); }},
                    {label: "H3", click: () => { insertBlockTemplate(protyle, nodeElement, "### "); }},
                    {label: "H4", click: () => { insertBlockTemplate(protyle, nodeElement, "#### "); }},
                ]},
                {type: "separator"},
                {id: "ins-ulist", icon: "iconList", label: hiddenInlineText("无序列表", "Bullet List"), click: () => { insertBlockTemplate(protyle, nodeElement, "* "); }},
                {id: "ins-olist", icon: "iconOrderedList", label: hiddenInlineText("有序列表", "Ordered List"), click: () => { insertBlockTemplate(protyle, nodeElement, "1. "); }},
                {id: "ins-tlist", icon: "iconCheck", label: hiddenInlineText("任务列表", "Task List"), click: () => { insertBlockTemplate(protyle, nodeElement, "* [ ] "); }},
                {type: "separator"},
                {id: "ins-link", icon: "iconLink", label: hiddenInlineText("超链接", "Link"), click: () => { protyle.toolbar.setInlineMark(protyle, "a", "toolbar"); }},
                {id: "ins-tag", icon: "iconTags", label: hiddenInlineText("标签", "Tag"), click: () => { protyle.toolbar.setInlineMark(protyle, "tag", "toolbar"); }},
                {id: "ins-memo", icon: "iconM", label: hiddenInlineText("备注", "Memo"), click: () => { protyle.toolbar.setInlineMark(protyle, "inline-memo", "toolbar"); }},
                {id: "ins-ref", icon: "iconRef", label: hiddenInlineText("块引用", "Block Ref"), click: () => { protyle.toolbar.setInlineMark(protyle, "block-ref", "toolbar"); }},
                {id: "ins-imath", icon: "iconMath", label: hiddenInlineText("行内公式", "Inline Math"), click: () => { protyle.toolbar.setInlineMark(protyle, "inline-math", "toolbar"); }},
            ],
        }).element);
    }
    if (!captionElement) {
        appendAssistantContextActions({
            protyle,
            range: range?.cloneRange(),
            fallbackSelectionText: range?.toString().trim() || getPlainText(nodeElement as HTMLElement).trim(),
            includeOptimizeTypography: !protyle.disabled,
            onOptimizeTypography: () => {
                hideElements(["toolbar"], protyle);
                fetchPost("/api/format/autoSpace", {
                    id: protyle.block.rootID
                });
            }
        });
        if (!protyle.disabled) {
            let uploadHTML = '<input class="b3-form__upload" type="file" multiple="multiple"';
            if (protyle.options.upload.accept) {
                uploadHTML += ` accept="${protyle.options.upload.accept}">`;
            } else {
                uploadHTML += ">";
            }
            const uploadMenu = new MenuItem({
                id: "insertAsset",
                icon: "iconDownload",
                label: `${window.sourceflow.languages.insertAsset}${uploadHTML}`,
            }).element;
            uploadMenu.querySelector("input").addEventListener("change", (event: InputEvent & {
                target: HTMLInputElement
            }) => {
                if (event.target.files.length === 0) {
                    return;
                }
                uploadFiles(protyle, event.target.files, event.target);
                window.sourceflow.menus.menu.remove();
            });
            window.sourceflow.menus.menu.append(uploadMenu);
            /// #if !BROWSER
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "importAttachment",
                icon: "iconDownload",
                label: hiddenInlineText("导入附件", "Import attachment"),
                type: "submenu",
                submenu: [{
                    id: "importAttachmentFilesRelative",
                    icon: "iconFile",
                    label: hiddenInlineText("复制文件/压缩包到笔记", "Copy files or archives into note"),
                    click: () => {
                        openImportAttachmentDialog(protyle, ["openFile", "multiSelections"], true);
                    }
                }, {
                    id: "importAttachmentFoldersRelative",
                    icon: "iconFolder",
                    label: hiddenInlineText("复制文件夹到笔记", "Copy folders into note"),
                    click: () => {
                        openImportAttachmentDialog(protyle, ["openDirectory", "multiSelections"], true);
                    }
                }, {
                    type: "separator"
                }, {
                    id: "importAttachmentFilesAbsolute",
                    icon: "iconFile",
                    label: hiddenInlineText("引用文件/压缩包原位置", "Link files or archives by absolute path"),
                    click: () => {
                        openImportAttachmentDialog(protyle, ["openFile", "multiSelections"], false);
                    }
                }, {
                    id: "importAttachmentFoldersAbsolute",
                    icon: "iconFolder",
                    label: hiddenInlineText("引用文件夹原位置", "Link folders by absolute path"),
                    click: () => {
                        openImportAttachmentDialog(protyle, ["openDirectory", "multiSelections"], false);
                    }
                }]
            }).element);
            /// #endif
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "refresh",
            icon: "iconRefresh",
            accelerator: window.sourceflow.config.keymap.editor.general.refresh.custom,
            label: window.sourceflow.languages.refresh,
            click: () => {
                reloadProtyle(protyle, !isMobile());
            }
        }).element);
        if (!protyle.disabled) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "optimizeTypography",
                label: window.sourceflow.languages.optimizeTypography,
                accelerator: window.sourceflow.config.keymap.editor.general.optimizeTypography.custom,
                icon: "iconFormat",
                click: () => {
                    hideElements(["toolbar"], protyle);
                    fetchPost("/api/format/autoSpace", {
                        id: protyle.block.rootID
                    });
                }
            }).element);
        }
    }
    if (!protyle.disabled && !captionElement) {
        window.sourceflow.menus.menu.append(new MenuItem({
            type: "separator",
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "workbench",
            label: window.sourceflow.languages.workbench,
            icon: "iconLayout",
            type: "submenu",
            submenu: [{
                id: "workbenchCurrentBlockMeta",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchCurrentBlockMeta,
                click: () => {
                    void loadWorkbenchDialogModule().then(({openWorkbenchCurrentBlockMeta}) => openWorkbenchCurrentBlockMeta());
                }
            }, {
                id: "workbenchCurrentBlockTask",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchCurrentBlockTask,
                click: () => {
                    void loadWorkbenchDialogModule().then(({openWorkbenchCurrentBlockMeta}) => openWorkbenchCurrentBlockMeta("task"));
                }
            }, {
                id: "workbenchCurrentBlockEvent",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchCurrentBlockEvent,
                click: () => {
                    void loadWorkbenchDialogModule().then(({openWorkbenchCurrentBlockMeta}) => openWorkbenchCurrentBlockMeta("event"));
                }
            }, {
                id: "workbenchCurrentBlockProject",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchCurrentBlockProject,
                click: () => {
                    void loadWorkbenchDialogModule().then(({openWorkbenchCurrentBlockMeta}) => openWorkbenchCurrentBlockMeta("project"));
                }
            }],
        }).element);
    }
    if (nodeElement.classList.contains("table") && !protyle.disabled) {
        const cellElement = hasClosestByTag(range.startContainer, "TD") || hasClosestByTag(range.startContainer, "TH");
        if (cellElement) {
            const tableMenus = tableMenu(protyle, nodeElement, cellElement as HTMLTableCellElement, range);
            if (tableMenus.insertMenus.length > 0) {
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "separator_1",
                    type: "separator",
                }).element);
                tableMenus.insertMenus.forEach((menuItem) => {
                    window.sourceflow.menus.menu.append(new MenuItem(menuItem).element);
                });
            }
            if (tableMenus.removeMenus.length > 0) {
                window.sourceflow.menus.menu.append(new MenuItem({
                    id: "separator_2",
                    type: "separator",
                }).element);
                tableMenus.removeMenus.forEach((menuItem) => {
                    window.sourceflow.menus.menu.append(new MenuItem(menuItem).element);
                });
            }
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "separator_3",
                type: "separator",
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "more",
                type: "submenu",
                icon: "iconMore",
                label: window.sourceflow.languages.more,
                submenu: tableMenus.otherMenus.concat(tableMenus.other2Menus)
            }).element);
        }
    }
    /// #endif
    if (protyle?.app?.plugins) {
        emitOpenMenu({
            plugins: protyle.app.plugins,
            type: "open-menu-content",
            detail: {
                protyle,
                range,
                element: nodeElement,
            },
            separatorPosition: "top",
        });
    }
};
