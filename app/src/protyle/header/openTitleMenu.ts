import {fetchPost, fetchSyncPost} from "../../util/fetch";
import {MenuItem} from "../../menus/Menu";
import {copySubMenu, exportMd, movePathToMenu, openFileAttr} from "../../menus/commonMenuItem";
import {deleteFile} from "../../editor/deleteFile";
import {updateHotkeyTip} from "../util/compatibility";
import {App} from "../../index";
/// #if !MOBILE
import {openBacklink, openGraph, openOutline} from "../../layout/dock/util";
import * as path from "path";
/// #else
import {openMobileFileById} from "../../mobile/editor";
/// #endif
import {Constants} from "../../constants";
import {openCardByData} from "../../card/openCard";
import {viewCards} from "../../card/viewCards";
import {getDisplayName, getNotebookName, pathPosix, useShell} from "../../util/pathName";
import {makeCard, quickMakeCard} from "../../card/makeCard";
import {emitOpenMenu} from "../../plugin/EventBus";
import * as dayjs from "dayjs";
import {hideTooltip} from "../../dialog/tooltip";
import {showMessage} from "../../dialog/message";
import {popSearch} from "../../mobile/menu/search";
import {openSearch} from "../../search/spread";
import {openDocHistory} from "../../history/doc";
import {openNewWindowById} from "../../window/openNewWindow";
import {transferBlockRef} from "../../menus/block";
import {addEditorToDatabase} from "../render/av/addToDatabase";
import {openFileById} from "../../editor/util";
import {hasTopClosestByClassName} from "../util/hasClosest";
import {assistantText} from "../../assistant/constants";
import {runAssistantFeature} from "../../assistant/runtime";

const loadWorkbenchDialogModule = () => import("../../workbench/dialog");
const loadAssistantAIDockModule = () => import("../../assistant/ai/AIDock");
const loadAssistantResultsDockModule = () => import("../../assistant/results/ResultsDock");
const loadAssistantSkillModule = () => import("../../assistant/skills/execute");
const loadAssistantStudioModule = () => import("../../assistant/studio/sourceFlow");
const loadHomepageModule = () => import("../../homepage");

const runTitleMenuAssistantAI = (options: {
    message?: string,
    includeCurrentNote?: boolean,
    append?: boolean,
    pinCurrentNote?: boolean,
    clearTarget?: boolean,
    sessionId?: string,
}) => {
    runAssistantFeature("title-menu:assistant-ai", loadAssistantAIDockModule, ({openAssistantAIDock}) => {
        openAssistantAIDock(options);
    });
};

const runTitleMenuAssistantSkill = (skillId: string, protyle: IProtyle) => {
    runAssistantFeature(`title-menu:${skillId}`, loadAssistantSkillModule, ({runAssistantSkill}) => {
        runAssistantSkill({
            skillId: skillId as never,
            protyle,
        });
    });
};

const openTitleMenuAssistantInbox = (app: App) => {
    runAssistantFeature("title-menu:assistant-inbox", () => import("../../assistant/inbox/store"), ({openAssistantInbox}) => {
        openAssistantInbox(app);
    });
};

const openTitleMenuAssistantResults = () => {
    runAssistantFeature("title-menu:assistant-results", loadAssistantResultsDockModule, ({openAssistantResultsDock}) => {
        openAssistantResultsDock();
    });
};

const openTitleMenuAssistantStudio = (app: App) => {
    runAssistantFeature("title-menu:assistant-studio", loadAssistantStudioModule, ({openAssistantSourceStudio}) => {
        openAssistantSourceStudio(app);
    });
};

export const openTitleMenu = (protyle: IProtyle, position: IPosition, from: string) => {
    hideTooltip();
    if (!window.sourceflow.menus.menu.element.classList.contains("fn__none") &&
        window.sourceflow.menus.menu.element.getAttribute("data-name") === Constants.MENU_TITLE) {
        window.sourceflow.menus.menu.remove();
        return;
    }
    fetchPost("/api/block/getDocInfo", {
        id: protyle.block.rootID
    }, (response) => {
        window.sourceflow.menus.menu.remove();
        window.sourceflow.menus.menu.element.setAttribute("data-name", Constants.MENU_TITLE);
        const popoverElement = hasTopClosestByClassName(protyle.element, "block__popover", true);
        window.sourceflow.menus.menu.element.setAttribute("data-from", popoverElement ? popoverElement.dataset.level + "popover-" + from : "app-" + from);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "copy",
            label: window.sourceflow.languages.copy,
            icon: "iconCopy",
            type: "submenu",
            submenu: copySubMenu([protyle.block.rootID], true, undefined, protyle.block.showAll ? protyle.block.id : protyle.block.rootID)
        }).element);
        if (!protyle.disabled) {
            window.sourceflow.menus.menu.append(movePathToMenu([protyle.path]));
            const range = getSelection().rangeCount > 0 ? getSelection().getRangeAt(0) : undefined;
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "addToDatabase",
                label: window.sourceflow.languages.addToDatabase,
                accelerator: window.sourceflow.config.keymap.general.addToDatabase.custom,
                icon: "iconDatabase",
                click: () => {
                    addEditorToDatabase(protyle, range, "title");
                }
            }).element);
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "delete",
                icon: "iconTrashcan",
                label: window.sourceflow.languages.delete,
                click: () => {
                    deleteFile(protyle.notebookId, protyle.path);
                }
            }).element);
        }
        /// #if !MOBILE
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_1", type: "separator"}).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "outline",
            icon: "iconAlignCenter",
            label: window.sourceflow.languages.outline,
            accelerator: window.sourceflow.config.keymap.editor.general.outline.custom,
            click: () => {
                openOutline({
                    app: protyle.app,
                    rootId: protyle.block.rootID,
                    title: protyle.options.render.title ? (protyle.title.editElement.textContent || window.sourceflow.languages.untitled) : "",
                    isPreview: !protyle.preview.element.classList.contains("fn__none")
                });
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "backlinks",
            icon: "iconLink",
            label: window.sourceflow.languages.backlinks,
            accelerator: window.sourceflow.config.keymap.editor.general.backlinks.custom,
            click: () => {
                openBacklink({
                    app: protyle.app,
                    blockId: protyle.block.id,
                    rootId: protyle.block.rootID,
                    useBlockId: protyle.block.showAll,
                    title: protyle.title ? (protyle.title.editElement.textContent || window.sourceflow.languages.untitled) : null
                });
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "graphView",
            icon: "iconGraph",
            label: window.sourceflow.languages.graphView,
            accelerator: window.sourceflow.config.keymap.editor.general.graphView.custom,
            click: () => {
                openGraph({
                    app: protyle.app,
                    blockId: protyle.block.id,
                    rootId: protyle.block.rootID,
                    useBlockId: protyle.block.showAll,
                    title: protyle.title ? (protyle.title.editElement.textContent || window.sourceflow.languages.untitled) : null
                });
            }
        }).element);
        /// #endif
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_2", type: "separator"}).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "attr",
            label: window.sourceflow.languages.attr,
            icon: "iconAttr",
            accelerator: window.sourceflow.config.keymap.editor.general.attr.custom + "/" + updateHotkeyTip("⇧" + window.sourceflow.languages.click),
            click() {
                openFileAttr(response.data.ial, "bookmark", protyle);
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "setAsHomepage",
            label: window.sourceflow.config.lang === "zh_CN" ? "设为主页" : "Set as Homepage",
            icon: "iconLayout",
            click: () => {
                void loadHomepageModule().then(({setHomepageSourceToNote, openHomepageTab}) => {
                    setHomepageSourceToNote(protyle.block.rootID);
                    showMessage(window.sourceflow.config.lang === "zh_CN" ? "已设为主页" : "Set as homepage");
                    /// #if !MOBILE
                    openHomepageTab(protyle.app);
                    /// #endif
                });
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "workbench",
            label: window.sourceflow.languages.workbench,
            icon: "iconLayout",
            type: "submenu",
            submenu: [{
                id: "workbenchCurrentMeta",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchCurrentMeta,
                click: () => {
                    void loadWorkbenchDialogModule().then(({openWorkbenchCurrentMeta}) => openWorkbenchCurrentMeta());
                }
            }, {
                id: "workbenchCurrentTask",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchCurrentTask,
                click: () => {
                    void loadWorkbenchDialogModule().then(({openWorkbenchCurrentMeta}) => openWorkbenchCurrentMeta("task"));
                }
            }, {
                id: "workbenchCurrentEvent",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchCurrentEvent,
                click: () => {
                    void loadWorkbenchDialogModule().then(({openWorkbenchCurrentMeta}) => openWorkbenchCurrentMeta("event"));
                }
            }, {
                id: "workbenchCurrentProject",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchCurrentProject,
                click: () => {
                    void loadWorkbenchDialogModule().then(({openWorkbenchCurrentMeta}) => openWorkbenchCurrentMeta("project"));
                }
            }, {
                id: "workbenchBindCurrentView",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchBindCurrentView,
                click: () => {
                    void loadWorkbenchDialogModule().then(({bindCurrentWorkbenchView}) => bindCurrentWorkbenchView());
                }
            }, {
                id: "workbenchSavedViews",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchSavedViews,
                click: () => {
                    void loadWorkbenchDialogModule().then(({openWorkbenchSavedViews}) => openWorkbenchSavedViews(protyle.app));
                }
            }, {
                id: "workbenchOpenCurrentBoundView",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchOpenCurrentBoundView,
                click: () => {
                    void loadWorkbenchDialogModule().then(({openCurrentWorkbenchView}) => openCurrentWorkbenchView(protyle.app));
                }
            }, {
                id: "workbenchInsertCurrentBoundView",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchInsertCurrentBoundView,
                click: () => {
                    void loadWorkbenchDialogModule().then(({insertCurrentWorkbenchViewEmbed}) => insertCurrentWorkbenchViewEmbed());
                }
            }, {
                id: "workbenchClearCurrentBoundView",
                iconHTML: "",
                label: window.sourceflow.languages.workbenchClearCurrentBoundView,
                click: () => {
                    void loadWorkbenchDialogModule().then(({clearCurrentWorkbenchView}) => clearCurrentWorkbenchView());
                }
            }],
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "assistant",
            label: window.sourceflow.languages.ai || "AI",
            icon: "iconSparkles",
            type: "submenu",
            submenu: [{
                id: "assistantInbox",
                iconHTML: "",
                label: assistantText("AI 收件箱", "AI Inbox"),
                click: () => {
                    openTitleMenuAssistantInbox(protyle.app);
                }
            }, {
                id: "assistantResults",
                iconHTML: "",
                label: assistantText("成果侧栏", "Results Sidebar"),
                click: () => {
                    openTitleMenuAssistantResults();
                }
            }, {
                id: "assistantStudio",
                iconHTML: "",
                label: assistantText("来源创作", "Source Studio"),
                click: () => {
                    openTitleMenuAssistantStudio(protyle.app);
                }
            }, {
                id: "assistantCurrentNote",
                iconHTML: "",
                label: window.sourceflow.languages.aiAskCurrentNote,
                click: () => {
                    runTitleMenuAssistantAI({includeCurrentNote: true});
                }
            }, {
                id: "assistantPinCurrentNote",
                iconHTML: "",
                label: window.sourceflow.languages.aiPinCurrentNoteTarget,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: true,
                        pinCurrentNote: true,
                    });
                }
            }, {
                id: "assistantClearTargetNote",
                iconHTML: "",
                label: window.sourceflow.languages.aiClearTargetNote,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: false,
                        clearTarget: true,
                    });
                }
            }, {
                id: "assistantSummarizeCurrentNote",
                iconHTML: "",
                label: window.sourceflow.languages.aiSummarizeCurrentNote,
                click: () => {
                    runTitleMenuAssistantSkill("note-summarize", protyle);
                }
            }, {
                id: "assistantTaskCurrentNote",
                iconHTML: "",
                label: assistantText("基于当前笔记建任务", "Create task from current note"),
                click: () => {
                    runTitleMenuAssistantSkill("note-task", protyle);
                }
            }, {
                id: "assistantReminderCurrentNote",
                iconHTML: "",
                label: assistantText("基于当前笔记设提醒", "Create reminder from current note"),
                click: () => {
                    runTitleMenuAssistantSkill("note-reminder", protyle);
                }
            }, {
                id: "assistantCurrentBlock",
                iconHTML: "",
                label: window.sourceflow.languages.aiAskCurrentBlock,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: true,
                        message: "请先调用 get-current-block，围绕当前块或当前选中文本工作。必要时再调用 get-current-note、get-note-outline 或 get-note-backlinks 补充上下文，然后给出精确结论。",
                    });
                }
            }, {
                id: "assistantCurrentBlockContext",
                iconHTML: "",
                label: window.sourceflow.languages.aiAnalyzeCurrentBlockContext,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: true,
                        message: "请先调用 get-current-block-context，分析当前块的父块、前后块、直接子块和结构上下文。必要时再调用 get-block-references，判断它与其他块的连接关系，然后给出精确建议。",
                    });
                }
            }, {
                id: "assistantCurrentBlockReferences",
                iconHTML: "",
                label: window.sourceflow.languages.aiAnalyzeCurrentBlockReferences,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: true,
                        message: "请先调用 get-block-references，分析当前块的引用文本、被引用情况和相关块摘要。必要时再结合 get-current-block-context 解释这些引用关系在当前笔记中的作用。",
                    });
                }
            }, {
                id: "assistantAssetsCurrentNote",
                iconHTML: "",
                label: window.sourceflow.languages.aiReadCurrentNoteAssets,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: true,
                        message: "请先调用 list-note-assets，检查当前笔记的附件、图片和资源文件。对文本型附件请继续调用 read-note-asset-file 直接读取内容；对图片或二进制附件，请根据文件元信息说明其用途、格式和后续处理建议。不要使用 OCR。",
                    });
                }
            }, {
                id: "assistantBacklinksCurrentNote",
                iconHTML: "",
                label: window.sourceflow.languages.aiAnalyzeCurrentNoteLinks,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: true,
                        message: "请先调用 get-note-backlinks，分析当前笔记与已有笔记之间的引用关系、提及关系和知识连接。必要时再调用 read-note 读取关键笔记，然后给出结构化总结。",
                    });
                }
            }, {
                id: "assistantOutlineCurrentNote",
                iconHTML: "",
                label: window.sourceflow.languages.aiAnalyzeCurrentNoteOutline,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: true,
                        message: "请先调用 get-note-outline，分析当前笔记的大纲结构、层级组织和可优化之处；必要时再结合 get-current-block 或 get-current-note 给出更细的建议。",
                    });
                }
            }, {
                id: "assistantHistoryCurrentNote",
                iconHTML: "",
                label: window.sourceflow.languages.aiAnalyzeCurrentNoteHistory,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: true,
                        message: "请先调用 list-note-history，查看当前笔记的历史版本和变更时间点。必要时再结合 get-note-outline 或 get-note-backlinks，帮助我判断内容演进和恢复建议。",
                    });
                }
            }, {
                id: "assistantRestorePoints",
                iconHTML: "",
                label: window.sourceflow.languages.aiAnalyzeRestorePoints,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: true,
                        message: "请先调用 list-restore-points，检查当前可用的本地和远端恢复点、保护标签和快照保留情况，并给出最稳妥的恢复建议。",
                    });
                }
            }, {
                id: "assistantPolishCurrentNote",
                iconHTML: "",
                label: window.sourceflow.languages.aiPolishCurrentNote,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: true,
                        message: "请检查当前笔记的结构、表达、待办和缺失信息，并给出可直接执行的修改建议。",
                    });
                }
            }, {
                id: "assistantExtractTasksCurrentNote",
                iconHTML: "",
                label: window.sourceflow.languages.aiExtractTasksCurrentNote,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: true,
                        message: "请先阅读当前笔记，提取其中明确或隐含的待办事项。必要时先调用搜索或读取工具补充上下文，然后使用 create-workbench-item 创建任务，并在回答中简要说明已创建的任务。",
                    });
                }
            }, {
                id: "assistantCreateChildNoteCurrentNote",
                iconHTML: "",
                label: window.sourceflow.languages.aiCreateChildNoteCurrentNote,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: true,
                        message: "请先阅读当前笔记，判断是否需要拆分出一个新的子文档。如果适合，请先给出子文档标题和建议结构，再按需调用 create-child-note 创建当前笔记下的子文档。",
                    });
                }
            }, {
                id: "assistantContinueAfterCurrentBlock",
                iconHTML: "",
                label: window.sourceflow.languages.aiContinueAfterCurrentBlock,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: true,
                        message: "请先调用 get-current-block-context，围绕当前块理解上下文；如果适合补充、续写或插入后续内容，请直接生成完整正文，并调用 insert-after-block 把内容插入到当前块之后。不要只给计划；请把正文放在 markdown、content 或 text 字段中。",
                    });
                }
            }, {
                id: "assistantCreateProjectCurrentNote",
                iconHTML: "",
                label: window.sourceflow.languages.aiCreateProjectCurrentNote,
                click: () => {
                    runTitleMenuAssistantAI({
                        includeCurrentNote: true,
                        message: "请先阅读当前笔记，判断是否适合整理为一个项目。如果适合，请先创建一个项目，再按需要创建若干任务或事件，并给出清晰的执行计划摘要。写入前先说明你的计划。",
                    });
                }
            }],
        }).element);
        if (!window.sourceflow.config.readonly) {
            const isCardMade = !!response.data.ial[Constants.CUSTOM_RIFF_DECKS];
            const riffCardMenu: IMenu[] = [{
                id: "spaceRepetition",
                iconHTML: "",
                label: window.sourceflow.languages.spaceRepetition,
                accelerator: window.sourceflow.config.keymap.editor.general.spaceRepetition.custom,
                click: () => {
                    fetchPost("/api/riff/getTreeRiffDueCards", {rootID: protyle.block.rootID}, (response) => {
                        openCardByData(protyle.app, response.data, "doc", protyle.block.rootID, response.data.name);
                    });
                }
            }, {
                id: "manage",
                iconHTML: "",
                label: window.sourceflow.languages.manage,
                click: () => {
                    fetchPost("/api/filetree/getHPathByID", {
                        id: protyle.block.rootID
                    }, (response) => {
                        viewCards(protyle.app, protyle.block.rootID, pathPosix().join(getNotebookName(protyle.notebookId), (response.data)), "Tree");
                    });
                }
            }, {
                id: isCardMade ? "removeCard" : "quickMakeCard",
                iconHTML: "",
                label: isCardMade ? window.sourceflow.languages.removeCard : window.sourceflow.languages.quickMakeCard,
                accelerator: window.sourceflow.config.keymap.editor.general.quickMakeCard.custom,
                click: () => {
                    let titleElement = protyle.title?.element;
                    if (!titleElement) {
                        titleElement = document.createElement("div");
                        titleElement.setAttribute("data-node-id", protyle.block.rootID);
                        titleElement.setAttribute(Constants.CUSTOM_RIFF_DECKS, response.data.ial[Constants.CUSTOM_RIFF_DECKS]);
                    }
                    quickMakeCard(protyle, [titleElement]);
                }
            }];
            if (window.sourceflow.config.flashcard.deck) {
                riffCardMenu.push({
                    id: "addToDeck",
                    iconHTML: "",
                    label: window.sourceflow.languages.addToDeck,
                    click: () => {
                        makeCard(protyle.app, [protyle.block.rootID]);
                    }
                });
            }
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "riffCard",
                label: window.sourceflow.languages.riffCard,
                type: "submenu",
                icon: "iconRiffCard",
                submenu: riffCardMenu,
            }).element);
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "search",
            label: window.sourceflow.languages.search,
            icon: "iconSearch",
            accelerator: window.sourceflow.config.keymap.general.search.custom,
            async click() {
                const searchPath = getDisplayName(protyle.path, false, true);
                /// #if MOBILE
                const pathResponse = await fetchSyncPost("/api/filetree/getHPathByPath", {
                    notebook: protyle.notebookId,
                    path: searchPath + ".sf"
                });
                popSearch(protyle.app, {
                    hasReplace: false,
                    hPath: pathPosix().join(getNotebookName(protyle.notebookId), pathResponse.data),
                    idPath: [pathPosix().join(protyle.notebookId, searchPath)],
                    page: 1,
                });
                /// #else
                openSearch({
                    app: protyle.app,
                    hotkey: Constants.DIALOG_SEARCH,
                    notebookId: protyle.notebookId,
                    searchPath
                });
                /// #endif
            }
        }).element);
        if (!protyle.disabled) {
            transferBlockRef(protyle.block.rootID);
        }
        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_3", type: "separator"}).element);
        if (!protyle.model) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "openBy",
                label: window.sourceflow.languages.openBy,
                icon: "iconOpen",
                click() {
                    /// #if !MOBILE
                    openFileById({
                        app: protyle.app,
                        id: protyle.block.id,
                        action: protyle.block.rootID !== protyle.block.id ? [Constants.CB_GET_ALL, Constants.CB_GET_FOCUS] : [Constants.CB_GET_CONTEXT],
                    });
                    /// #else
                    openMobileFileById(protyle.app, protyle.block.id, protyle.block.rootID !== protyle.block.id ? [Constants.CB_GET_ALL] : [Constants.CB_GET_CONTEXT]);
                    /// #endif
                }
            }).element);
        }
        /// #if !BROWSER
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "openByNewWindow",
            label: window.sourceflow.languages.openByNewWindow,
            icon: "iconOpenWindow",
            click() {
                openNewWindowById(protyle.block.rootID);
            }
        }).element);
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "showInFolder",
            icon: "iconFolder",
            label: window.sourceflow.languages.showInFolder,
            click: () => {
                useShell("showItemInFolder", path.join(window.sourceflow.config.system.dataDir, protyle.notebookId, protyle.path));
            }
        }).element);
        /// #endif
        if (!protyle.disabled) {
            window.sourceflow.menus.menu.append(new MenuItem({
                id: "fileHistory",
                label: window.sourceflow.languages.fileHistory,
                icon: "iconHistory",
                click() {
                    openDocHistory({
                        app: protyle.app,
                        id: protyle.block.rootID,
                        notebookId: protyle.notebookId,
                        pathString: response.data.name
                    });
                }
            }).element);
        }
        window.sourceflow.menus.menu.append(exportMd(protyle.block.showAll ? protyle.block.id : protyle.block.rootID));

        window.sourceflow.menus.menu.append(new MenuItem({id: "separator_4", type: "separator"}).element);
        if (protyle?.app?.plugins) {
            emitOpenMenu({
                plugins: protyle.app.plugins,
                type: "click-editortitleicon",
                detail: {
                    protyle,
                    data: response.data,
                },
                separatorPosition: "bottom",
            });
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "updateAndCreatedAt",
            iconHTML: "",
            type: "readonly",
            // 不能换行，否则移动端间距过大
            label: `${window.sourceflow.languages.modifiedAt} ${dayjs(response.data.ial.updated).format("YYYY-MM-DD HH:mm:ss")}<br>${window.sourceflow.languages.createdAt} ${dayjs(response.data.ial.id.substr(0, 14)).format("YYYY-MM-DD HH:mm:ss")}`
        }).element);
        /// #if MOBILE
        window.sourceflow.menus.menu.fullscreen();
        /// #else
        window.sourceflow.menus.menu.popup(position);
        /// #endif
    });
};
