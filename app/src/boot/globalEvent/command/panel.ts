import {Dialog} from "../../../dialog";
import {App} from "../../../index";
import {upDownHint} from "../../../util/upDownHint";
import {updateHotkeyTip} from "../../../protyle/util/compatibility";
import {isMobile} from "../../../util/functions";
import {Constants} from "../../../constants";
import {Editor} from "../../../editor";
/// #if MOBILE
import {getCurrentEditor} from "../../../mobile/editor";
import {popSearch} from "../../../mobile/menu/search";
/// #else
import {getActiveTab, getDockByType} from "../../../layout/tabUtil";
import {Custom} from "../../../layout/dock/Custom";
import {getAllModels} from "../../../layout/getAll";
import {Files} from "../../../layout/dock/Files";
import {Search} from "../../../search";
import {openSearch} from "../../../search/spread";
/// #endif
import {addEditorToDatabase, addFilesToDatabase} from "../../../protyle/render/av/addToDatabase";
import {hasClosestBlock, hasClosestByClassName, hasTopClosestByTag} from "../../../protyle/util/hasClosest";
import {onlyProtyleCommand} from "./protyle";
import {globalCommand} from "./global";
import {getDisplayName, getNotebookName, getTopPaths, movePathTo, moveToPath, pathPosix} from "../../../util/pathName";
import {hintMoveBlock} from "../../../protyle/hint/extend";
import {fetchSyncPost} from "../../../util/fetch";
import {focusByRange} from "../../../protyle/util/selection";
import {assistantText} from "../../../assistant/constants";

const escapeHTML = (text: string) => (text || "").replace(/[&<>"']/g, (match) => {
    switch (match) {
        case "&":
            return "&amp;";
        case "<":
            return "&lt;";
        case ">":
            return "&gt;";
        case "\"":
            return "&quot;";
        default:
            return "&#39;";
    }
});

const normalizeCommandText = (text: string) => (text || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\s·•:：/|\\\-—–_()[\]{}]+/g, "")
    .trim();

const getWorkbenchItemTypeLabel = (type: string) => {
    switch (type) {
        case "doc":
            return window.sourceflow.languages.doc;
        case "task":
            return window.sourceflow.languages.taskCapture;
        case "event":
            return window.sourceflow.languages.eventCapture;
        case "project":
            return window.sourceflow.languages.projectCapture;
        case "attachment":
            return window.sourceflow.languages.attachmentCapture;
        case "url":
            return window.sourceflow.languages.urlImport;
        default:
            return window.sourceflow.languages.quickCapture;
    }
};

const hasMeaningfulWorkbenchTitle = (title: string) => {
    const value = (title || "").trim();
    if (!value) {
        return false;
    }
    const untitledValues = new Set([
        window.sourceflow.languages.untitled,
        window.sourceflow.languages._kernel?.[16],
        window.sourceflow.languages._kernel?.[105],
    ].filter(Boolean));
    return !untitledValues.has(value) && !!normalizeCommandText(value);
};

const looksLikeURL = (text: string) => /^https?:\/\//i.test(text.trim());

type IWorkbenchPresetSummary = {
    name: string,
    activeTab: string,
};

type IWorkbenchBuiltinViewNoteSummary = {
    key: "list" | "table" | "board" | "timeline" | "skill",
    label: string,
};

type IWorkbenchQuickItemSummary = {
    id: string,
    title: string,
    type: string,
    entityKind?: "doc" | "block",
    hasBoundView?: boolean,
    project?: string,
    notebook?: string,
};

const loadWorkbenchCommandData = async (): Promise<{
    dashboards: IWorkbenchPresetSummary[],
    templates: IWorkbenchPresetSummary[],
    builtinTemplates: IWorkbenchBuiltinViewNoteSummary[],
    items: IWorkbenchQuickItemSummary[],
}> => {
    const {getWorkbenchBuiltinViewNoteOptions, getWorkbenchDashboardPresets, getWorkbenchQuickItems, getWorkbenchViewTemplates} = await import("../../../workbench/dialog");
    return {
        dashboards: getWorkbenchDashboardPresets().map((item) => ({
            name: item.name,
            activeTab: item.activeTab,
        })).filter((item) => hasMeaningfulWorkbenchTitle(item.name)),
        templates: getWorkbenchViewTemplates().map((item) => ({
            name: item.name,
            activeTab: item.activeTab,
        })).filter((item) => hasMeaningfulWorkbenchTitle(item.name)),
        builtinTemplates: getWorkbenchBuiltinViewNoteOptions().map((item) => ({
            key: item.key,
            label: item.label,
        })),
        items: (await getWorkbenchQuickItems(80)).map((item) => ({
            id: item.id,
            title: item.title,
            type: item.type,
            entityKind: item.entityKind,
            hasBoundView: item.hasBoundView,
            project: item.project,
            notebook: item.notebook,
        })).filter((item) => hasMeaningfulWorkbenchTitle(item.title)),
    };
};

const buildQuickAddHTML = (query: string) => {
    const text = query.trim();
    if (!text) {
        return "";
    }
    const items: Array<{ command: string, label: string, meta: string }> = [
        {
            command: `workbenchQuery:${encodeURIComponent(text)}`,
            label: `${window.sourceflow.languages.workbenchQuery} · ${text}`,
            meta: window.sourceflow.languages.workbench,
        },
        {
            command: `globalSearchText:${encodeURIComponent(text)}`,
            label: `${window.sourceflow.languages.globalSearch} · ${text}`,
            meta: window.sourceflow.languages.search,
        },
    ];
    if (looksLikeURL(text)) {
        items.unshift({
            command: `captureDraft:${encodeURIComponent(`url:${text}`)}`,
            label: `${window.sourceflow.languages.urlImport} · ${text}`,
            meta: window.sourceflow.languages.urlImport,
        });
    }
    return items.map((item) => `<li class="b3-list-item" data-dynamic-command="true" data-command="${item.command}">
    <span class="b3-list-item__text">${escapeHTML(item.label)}</span>
    <span class="b3-list-item__meta${isMobile() ? " fn__none" : ""}">${escapeHTML(item.meta)}</span>
</li>`).join("");
};

const normalizeCommandDisplay = (rawLabel: string, rawMeta = "") => {
    let label = (rawLabel || "").trim();
    let meta = (rawMeta || "").trim();
    const knownPrefixes = new Set([
        window.sourceflow.languages.workbench,
        window.sourceflow.languages.urlImport,
        window.sourceflow.languages.captureCenter,
        window.sourceflow.languages.help,
        window.sourceflow.languages.plugin,
        window.sourceflow.languages.backup,
        window.sourceflow.languages.search,
    ].filter(Boolean));
    for (const separator of [" · ", "·", ": ", "：", "/"]) {
        const index = label.indexOf(separator);
        if (index < 1) {
            continue;
        }
        const prefix = label.slice(0, index).trim();
        const rest = label.slice(index + separator.length).trim();
        if (!rest) {
            continue;
        }
        if (knownPrefixes.has(prefix) || prefix === meta || (!!meta && meta.includes(prefix))) {
            label = rest;
            if (prefix && !meta.includes(prefix)) {
                meta = meta ? `${prefix} · ${meta}` : prefix;
            }
            break;
        }
    }
    return {label, meta};
};

const renderCommandItem = (command: string, label: string, meta = "") => {
    const normalized = normalizeCommandDisplay(label, meta);
    if (!normalizeCommandText(normalized.label)) {
        return "";
    }
    return `<li class="b3-list-item" data-command="${command}">
    <span class="b3-list-item__text">${escapeHTML(normalized.label)}</span>
    <span class="b3-list-item__meta${isMobile() ? " fn__none" : ""}">${escapeHTML(normalized.meta)}</span>
</li>`;
};

export const commandPanel = async (app: App) => {
    const range = getSelection().rangeCount > 0 ? getSelection().getRangeAt(0) : undefined;
    const dialog = new Dialog({
        width: isMobile() ? "92vw" : "80vw",
        height: isMobile() ? "80vh" : "70vh",
        title: window.sourceflow.languages.commandPanel,
        content: `<div class="fn__flex-column">
    <div class="b3-form__icon search__header" style="border-top: 0;border-bottom: 1px solid var(--b3-theme-surface-lighter);">
        <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
        <input class="b3-text-field b3-text-field--text" style="padding-left: 32px !important;">
    </div>
    <ul class="b3-list b3-list--background search__list" id="commands"></ul>
    <div class="search__tip">
        <kbd>↑/↓</kbd> ${window.sourceflow.languages.searchTip1}
        <kbd>${window.sourceflow.languages.enterKey}/${window.sourceflow.languages.click}</kbd> ${window.sourceflow.languages.confirm}
        <kbd>Esc</kbd> ${window.sourceflow.languages.close}
    </div>
</div>`,
        destroyCallback() {
            if (range) {
                focusByRange(range);
            }
        },
    });
    dialog.element.setAttribute("data-key", Constants.DIALOG_COMMANDPANEL);
    const listElement = dialog.element.querySelector("#commands");
    const pruneEmptyCommandItems = () => {
        listElement.querySelectorAll(".b3-list-item").forEach((item) => {
            const text = (item.querySelector(".b3-list-item__text")?.textContent || "").trim();
            if (!normalizeCommandText(text)) {
                item.remove();
            }
        });
    };
    let html = "";
    Object.keys(window.sourceflow.config.keymap.general).forEach((key) => {
        let keys;
        /// #if MOBILE
        keys = ["addToDatabase", "fileTree", "outline", "bookmark", "tag", "dailyNote", "backlinks",
            "dataHistory", "editReadonly", "enter", "enterBack", "globalSearch", "lockScreen", "mainMenu", "move",
            "newFile", "recentDocs", "replace", "riffCard", "search", "selectOpen1", "syncNow"];
        /// #else
        keys = ["addToDatabase", "fileTree", "outline", "bookmark", "tag", "dailyNote", "backlinks",
            "graphView", "globalGraph", "closeAll", "closeLeft", "closeOthers", "closeRight", "closeTab",
            "closeUnmodified", "config", "dataHistory", "editReadonly", "enter", "enterBack", "globalSearch", "goBack",
            "goForward", "goToEditTabNext", "goToEditTabPrev", "goToTab1", "goToTab2", "goToTab3", "goToTab4",
            "goToTab5", "goToTab6", "goToTab7", "goToTab8", "goToTab9", "goToTabNext", "goToTabPrev", "lockScreen",
            "mainMenu", "move", "newFile", "recentDocs", "replace", "riffCard", "search", "selectOpen1", "syncNow",
            "splitLR", "splitMoveB", "splitMoveR", "splitTB", "tabToWindow", "stickSearch", "toggleDock", "unsplitAll",
            "unsplit", "recentClosed"];
        /// #if !BROWSER
        keys.push("toggleWin");
        /// #endif
        /// #endif
        if (keys.includes(key)) {
            html += renderCommandItem(key, window.sourceflow.languages[key], updateHotkeyTip(window.sourceflow.config.keymap.general[key].custom));
        }
    });
    Object.keys(window.sourceflow.config.keymap.editor.general).forEach((key) => {
        if (["switchReadonly", "switchAdjust"].includes(key)) {
            html += renderCommandItem(key, window.sourceflow.languages[key], updateHotkeyTip(window.sourceflow.config.keymap.editor.general[key].custom));
        }
    });
    [
        {command: "assistantAI", label: window.sourceflow.languages.aiAssistant, meta: "AI"},
        {command: "assistantTranslate", label: window.sourceflow.languages.aiTranslate, meta: "AI"},
        {command: "pomodoroTimer", label: assistantText("番茄闹钟", "Pomodoro Timer"), meta: assistantText("专注", "Focus")},
        {command: "assistantInbox", label: assistantText("AI 收件箱", "AI Inbox"), meta: "AI"},
        {command: "assistantResults", label: assistantText("成果侧栏", "Results Sidebar"), meta: "AI"},
        {command: "assistantStudio", label: assistantText("来源创作", "Source Studio"), meta: "AI"},
        {command: "assistantCurrentNote", label: window.sourceflow.languages.aiAskCurrentNote, meta: "AI"},
        {command: "assistantPinCurrentNote", label: window.sourceflow.languages.aiPinCurrentNoteTarget, meta: "AI"},
        {command: "assistantClearTargetNote", label: window.sourceflow.languages.aiClearTargetNote, meta: "AI"},
        {command: "assistantCurrentBlock", label: window.sourceflow.languages.aiAskCurrentBlock, meta: "AI"},
        {command: "assistantCurrentBlockContext", label: window.sourceflow.languages.aiAnalyzeCurrentBlockContext, meta: "AI"},
        {command: "assistantCurrentBlockReferences", label: window.sourceflow.languages.aiAnalyzeCurrentBlockReferences, meta: "AI"},
        {command: "assistantAssetsCurrentNote", label: window.sourceflow.languages.aiReadCurrentNoteAssets, meta: "AI"},
        {command: "assistantSummarizeCurrentNote", label: window.sourceflow.languages.aiSummarizeCurrentNote, meta: "AI"},
        {command: "assistantBacklinksCurrentNote", label: window.sourceflow.languages.aiAnalyzeCurrentNoteLinks, meta: "AI"},
        {command: "assistantOutlineCurrentNote", label: window.sourceflow.languages.aiAnalyzeCurrentNoteOutline, meta: "AI"},
        {command: "assistantHistoryCurrentNote", label: window.sourceflow.languages.aiAnalyzeCurrentNoteHistory, meta: "AI"},
        {command: "assistantRestorePoints", label: window.sourceflow.languages.aiAnalyzeRestorePoints, meta: "AI"},
        {command: "assistantPolishCurrentNote", label: window.sourceflow.languages.aiPolishCurrentNote, meta: "AI"},
        {command: "assistantSuggestLinksCurrentNote", label: assistantText("推荐关联笔记", "Suggest links for current note"), meta: "AI"},
        {command: "assistantHealthCurrentNote", label: assistantText("检查当前笔记异常", "Check current note health"), meta: "AI"},
        {command: "assistantRewriteSelection", label: assistantText("改写选中内容", "Rewrite selection"), meta: "AI"},
        {command: "assistantTranslateSelection", label: assistantText("翻译选中内容", "Translate selection"), meta: "AI"},
        {command: "assistantTaskSelection", label: assistantText("基于选中内容建任务", "Create task from selection"), meta: "AI"},
        {command: "assistantReminderSelection", label: assistantText("基于选中内容设提醒", "Create reminder from selection"), meta: "AI"},
        {command: "assistantMermaidSelection", label: assistantText("将选中内容转为 Mermaid", "Convert selection to Mermaid"), meta: "AI"},
        {command: "assistantTableSelection", label: assistantText("将选中内容转为表格", "Convert selection to table"), meta: "AI"},
        {command: "assistantMindElixirSelection", label: assistantText("将选中内容转为思维导图", "Convert selection to mind map"), meta: "AI"},
        {command: "assistantTaskCurrentNote", label: assistantText("基于当前笔记建任务", "Create task from current note"), meta: "AI"},
        {command: "assistantReminderCurrentNote", label: assistantText("基于当前笔记设提醒", "Create reminder from current note"), meta: "AI"},
        {command: "assistantCreateChildNoteCurrentNote", label: window.sourceflow.languages.aiCreateChildNoteCurrentNote, meta: "AI"},
        {command: "assistantContinueAfterCurrentBlock", label: window.sourceflow.languages.aiContinueAfterCurrentBlock, meta: "AI"},
        {command: "assistantExtractTasksCurrentNote", label: window.sourceflow.languages.aiExtractTasksCurrentNote, meta: "AI"},
        {command: "assistantCreateProjectCurrentNote", label: window.sourceflow.languages.aiCreateProjectCurrentNote, meta: "AI"},
        {command: "assistantSummarizeWorkbench", label: window.sourceflow.languages.aiSummarizeWorkbench, meta: "AI"},
        {command: "assistantPlanWorkbench", label: window.sourceflow.languages.aiPlanWorkbench, meta: "AI"},
        {command: "homepage", label: window.sourceflow.config.lang === "zh_CN" ? "主页" : "Home", meta: window.sourceflow.languages.sourceflowNote || "SourceFlow"},
        /// #if !MOBILE
        {command: "zenMode", label: window.sourceflow.languages.zMode, meta: window.sourceflow.languages.fullscreen},
        /// #endif
        {command: "workbenchInbox", label: window.sourceflow.languages.inbox, meta: window.sourceflow.languages.workbench},
        {command: "workbenchLibrary", label: window.sourceflow.languages.workbenchLibrary, meta: window.sourceflow.languages.workbench},
        {command: "workbenchSavedViews", label: window.sourceflow.languages.workbenchSavedViews, meta: window.sourceflow.languages.workbench},
        {command: "workbenchTasks", label: window.sourceflow.languages.taskCapture, meta: window.sourceflow.languages.workbench},
        {command: "workbenchCalendar", label: window.sourceflow.languages.calendar, meta: window.sourceflow.languages.workbench},
        {command: "workbenchProjects", label: window.sourceflow.languages.project, meta: window.sourceflow.languages.workbench},
        {command: "workbenchReview", label: window.sourceflow.languages.review, meta: window.sourceflow.languages.workbench},
        {command: "workbenchDraftReport", label: window.sourceflow.languages.workbenchDraftReport, meta: window.sourceflow.languages.workbench},
        {command: "workbenchDraftReview", label: window.sourceflow.languages.workbenchDraftReview, meta: window.sourceflow.languages.workbench},
        {command: "workbenchDraftDashboard", label: window.sourceflow.languages.workbenchDraftDashboard, meta: window.sourceflow.languages.workbench},
        {command: "workbenchCurrentMeta", label: window.sourceflow.languages.workbenchCurrentMeta, meta: window.sourceflow.languages.workbench},
        {command: "workbenchCurrentBlockMeta", label: window.sourceflow.languages.workbenchCurrentBlockMeta, meta: window.sourceflow.languages.workbench},
        {command: "workbenchCurrentTask", label: window.sourceflow.languages.workbenchCurrentTask, meta: window.sourceflow.languages.workbench},
        {command: "workbenchCurrentBlockTask", label: window.sourceflow.languages.workbenchCurrentBlockTask, meta: window.sourceflow.languages.workbench},
        {command: "workbenchCurrentEvent", label: window.sourceflow.languages.workbenchCurrentEvent, meta: window.sourceflow.languages.workbench},
        {command: "workbenchCurrentBlockEvent", label: window.sourceflow.languages.workbenchCurrentBlockEvent, meta: window.sourceflow.languages.workbench},
        {command: "workbenchCurrentProject", label: window.sourceflow.languages.workbenchCurrentProject, meta: window.sourceflow.languages.workbench},
        {command: "workbenchCurrentBlockProject", label: window.sourceflow.languages.workbenchCurrentBlockProject, meta: window.sourceflow.languages.workbench},
        {command: "workbenchOpenCurrentBoundView", label: window.sourceflow.languages.workbenchOpenCurrentBoundView, meta: window.sourceflow.languages.workbench},
        {command: "workbenchBindCurrentView", label: window.sourceflow.languages.workbenchBindCurrentView, meta: window.sourceflow.languages.workbench},
        {command: "workbenchInsertCurrentBoundView", label: window.sourceflow.languages.workbenchInsertCurrentBoundView, meta: window.sourceflow.languages.workbench},
        {command: "workbenchClearCurrentBoundView", label: window.sourceflow.languages.workbenchClearCurrentBoundView, meta: window.sourceflow.languages.workbench},
        {command: "workbenchCreateViewNote", label: window.sourceflow.languages.workbenchCreateViewNote, meta: window.sourceflow.languages.workbench},
        {command: "urlImport", label: window.sourceflow.languages.urlImport, meta: window.sourceflow.languages.urlImport},
    ].forEach((item) => {
        html += renderCommandItem(item.command, item.label, item.meta);
    });
    listElement.insertAdjacentHTML("beforeend", html);
    app.plugins.forEach(plugin => {
        plugin.commands.forEach(command => {
            const label = command.langText || plugin.i18n[command.langKey] || command.langKey;
            const meta = [plugin.displayName, updateHotkeyTip(command.customHotkey)].filter(Boolean).join(" · ");
            const itemHTML = renderCommandItem(command.langKey || label || plugin.name, label, meta);
            if (!itemHTML) {
                return;
            }
            const wrapper = document.createElement("div");
            wrapper.innerHTML = itemHTML;
            const liElement = wrapper.firstElementChild as HTMLLIElement;
            liElement.addEventListener("click", (event) => {
                if (command.callback) {
                    command.callback();
                } else if (command.globalCallback) {
                    command.globalCallback();
                }
                dialog.destroy();
                event.preventDefault();
                event.stopPropagation();
            });
            listElement.insertAdjacentElement("beforeend", liElement);
        });
    });
    pruneEmptyCommandItems();

    if (listElement.childElementCount === 0) {
        const liElement = document.createElement("li");
        liElement.classList.add("b3-list-item", "b3-list-item--focus");
        liElement.innerHTML = `<span class="b3-list-item__text" style="-webkit-line-clamp: inherit;">${window.sourceflow.languages._kernel[122]}</span>`;
        liElement.addEventListener("click", () => {
            dialog.destroy();
        });
        listElement.insertAdjacentElement("beforeend", liElement);
    } else {
        listElement.firstElementChild.classList.add("b3-list-item--focus");
    }

    const inputElement = dialog.element.querySelector(".b3-text-field") as HTMLInputElement;
    const ensureFocusElement = () => {
        const currentFocus = listElement.querySelector(".b3-list-item--focus");
        if (currentFocus && !(currentFocus as HTMLElement).classList.contains("fn__none")) {
            return;
        }
        currentFocus?.classList.remove("b3-list-item--focus");
        const firstVisible = Array.from(listElement.children).find((element) => !(element as HTMLElement).classList.contains("fn__none"));
        firstVisible?.classList.add("b3-list-item--focus");
    };
    const renderDynamicCommands = () => {
        listElement.querySelectorAll('[data-dynamic-command="true"]').forEach((item) => item.remove());
        const html = buildQuickAddHTML(inputElement.value);
        if (html) {
            listElement.insertAdjacentHTML("afterbegin", html);
        }
        ensureFocusElement();
    };
    const appendDeferredCommandEntries = async () => {
        let deferredHTML = "";
        try {
            const workbenchData = await loadWorkbenchCommandData();
            workbenchData.dashboards.forEach((item) => {
                deferredHTML += renderCommandItem(`workbenchDashboard:${encodeURIComponent(item.name)}`, item.name, `${window.sourceflow.languages.workbenchDashboard} · ${item.activeTab}`);
                deferredHTML += renderCommandItem(`workbenchDraftDashboardPreset:${encodeURIComponent(item.name)}`, item.name, `${window.sourceflow.languages.workbenchDraftDashboard} · ${item.activeTab}`);
            });
            workbenchData.builtinTemplates.forEach((item) => {
                deferredHTML += renderCommandItem(`workbenchBuiltinViewNote:${item.key}`, item.label, window.sourceflow.languages.workbenchCreateViewNote);
            });
            workbenchData.templates.forEach((item) => {
                deferredHTML += renderCommandItem(`workbenchViewTemplate:${encodeURIComponent(item.name)}`, item.name, `${window.sourceflow.languages.workbenchViewTemplate} · ${item.activeTab}`);
                deferredHTML += renderCommandItem(`workbenchCreateViewNote:${encodeURIComponent(item.name)}`, item.name, `${window.sourceflow.languages.workbenchCreateViewNote} · ${item.activeTab}`);
            });
            workbenchData.items.slice(0, 40).forEach((item) => {
                if (!hasMeaningfulWorkbenchTitle(item.title)) {
                    return;
                }
                const meta = [
                    item.entityKind === "block" ? window.sourceflow.languages.workbenchBlockItem : "",
                    getWorkbenchItemTypeLabel(item.type),
                    item.hasBoundView ? window.sourceflow.languages.workbenchHasView : "",
                    item.project,
                    item.notebook,
                ].filter(Boolean).join(" · ");
                deferredHTML += renderCommandItem(`workbenchItem:${encodeURIComponent(item.id)}`, item.title, meta);
                if (item.hasBoundView) {
                    deferredHTML += renderCommandItem(`workbenchOpenBoundView:${encodeURIComponent(item.id)}`, item.title, `${window.sourceflow.languages.workbenchOpenBoundView} · ${item.notebook || window.sourceflow.languages.workbenchSavedViews}`);
                }
            });
        } catch (e) {
            console.warn("load deferred command panel entries failed", e);
        }
        if (!deferredHTML) {
            return;
        }
        listElement.insertAdjacentHTML("beforeend", deferredHTML);
        pruneEmptyCommandItems();
        filterList(inputElement, listElement);
    };
    inputElement.focus();
    listElement.addEventListener("click", (event: KeyboardEvent) => {
        const liElement = hasClosestByClassName(event.target as HTMLElement, "b3-list-item");
        if (liElement) {
            const command = liElement.getAttribute("data-command");
            if (command) {
                execByCommand({command, app, previousRange: range});
                dialog.destroy();
                event.preventDefault();
                event.stopPropagation();
            }
        }
    });
    inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
        event.stopPropagation();
        if (event.isComposing) {
            return;
        }
        upDownHint(listElement, event);
        if (event.key === "Enter") {
            const currentElement = listElement.querySelector(".b3-list-item--focus");
            if (currentElement) {
                const command = currentElement.getAttribute("data-command");
                if (command) {
                    execByCommand({command, app, previousRange: range});
                } else {
                    currentElement.dispatchEvent(new CustomEvent("click"));
                }
            }
            dialog.destroy();
        } else if (event.key === "Escape") {
            dialog.destroy();
        }
    });
    inputElement.addEventListener("compositionend", () => {
        renderDynamicCommands();
        filterList(inputElement, listElement);
    });
    inputElement.addEventListener("input", (event: InputEvent) => {
        if (event.isComposing) {
            return;
        }
        event.stopPropagation();
        renderDynamicCommands();
        filterList(inputElement, listElement);
    });
    renderDynamicCommands();
    void appendDeferredCommandEntries();
};

const filterList = (inputElement: HTMLInputElement, listElement: Element) => {
    const inputValue = inputElement.value.toLowerCase();
    listElement.querySelector(".b3-list-item--focus")?.classList.remove("b3-list-item--focus");
    let hasFocus = false;
    Array.from(listElement.children).forEach((element: HTMLElement) => {
        const elementValue = element.querySelector(".b3-list-item__text").textContent.toLowerCase();
        const command = element.dataset.command;
        if (inputValue.indexOf(elementValue) > -1 || elementValue.indexOf(inputValue) > -1 ||
            inputValue.indexOf(command) > -1 || command?.indexOf(inputValue) > -1) {
            if (!hasFocus) {
                element.classList.add("b3-list-item--focus");
            }
            hasFocus = true;
            element.classList.remove("fn__none");
        } else {
            element.classList.add("fn__none");
        }
    });
};

export const execByCommand = async (options: {
    command: string,
    app?: App,
    previousRange?: Range,
    protyle?: IProtyle,
    fileLiElements?: Element[]
}) => {
    if (globalCommand(options.command, options.app)) {
        return;
    }

    const isFileFocus = document.querySelector(".layout__tab--active")?.classList.contains("sf__file");

    let protyle = options.protyle;
    /// #if MOBILE
    if (!protyle) {
        protyle = getCurrentEditor().protyle;
        options.previousRange = protyle.toolbar.range;
    }
    /// #endif
    const range: Range = options.previousRange || (getSelection().rangeCount > 0 ? getSelection().getRangeAt(0) : document.createRange());
    let fileLiElements = options.fileLiElements;
    if (!isFileFocus && !protyle) {
        if (range) {
            window.sourceflow.dialogs.find(item => {
                if (item.editors) {
                    Object.keys(item.editors).find(key => {
                        if (item.editors[key].protyle.element.contains(range.startContainer)) {
                            protyle = item.editors[key].protyle;
                            return true;
                        }
                    });
                    if (protyle) {
                        return true;
                    }
                }
            });
        }
        /// #if !MOBILE
        const activeTab = getActiveTab();
        if (!protyle && activeTab) {
            if (activeTab.model instanceof Editor) {
                protyle = activeTab.model.editor.protyle;
            } else if (activeTab.model instanceof Search) {
                if (activeTab.model.element.querySelector("#searchUnRefPanel").classList.contains("fn__none")) {
                    protyle = activeTab.model.editors.edit.protyle;
                } else {
                    protyle = activeTab.model.editors.unRefEdit.protyle;
                }
            } else if (activeTab.model instanceof Custom && activeTab.model.editors?.length > 0) {
                if (range) {
                    activeTab.model.editors.find(item => {
                        if (item.protyle.element.contains(range.startContainer)) {
                            protyle = item.protyle;
                            return true;
                        }
                    });
                }
            }
        } else if (!protyle) {
            if (!protyle && range) {
                window.sourceflow.blockPanels.find(item => {
                    item.editors.find(editorItem => {
                        if (editorItem.protyle.element.contains(range.startContainer)) {
                            protyle = editorItem.protyle;
                            return true;
                        }
                    });
                    if (protyle) {
                        return true;
                    }
                });
            }
            const models = getAllModels();
            if (!protyle) {
                models.backlink.find(item => {
                    if (item.element.classList.contains("layout__tab--active")) {
                        if (range) {
                            item.editors.find(editor => {
                                if (editor.protyle.element.contains(range.startContainer)) {
                                    protyle = editor.protyle;
                                    return true;
                                }
                            });
                        }
                        if (!protyle && item.editors.length > 0) {
                            protyle = item.editors[0].protyle;
                        }
                        return true;
                    }
                });
            }
            if (!protyle) {
                models.editor.find(item => {
                    if (item.parent.headElement.classList.contains("item--focus")) {
                        protyle = item.editor.protyle;
                        return true;
                    }
                });
            }
        }
        /// #endif
    }

    // only protyle
    if (!isFileFocus && protyle && onlyProtyleCommand({
        command: options.command,
        previousRange: range,
        protyle
    })) {
        return;
    }

    if (isFileFocus && !fileLiElements) {
        /// #if MOBILE
        return false;
        /// #else
        const dockFile = getDockByType("file");
        if (!dockFile) {
            return false;
        }
        const files = dockFile.data.file as Files;
        fileLiElements = Array.from(files.element.querySelectorAll(".b3-list-item--focus"));
        /// #endif
    }

    // 全局命令，在没有 protyle 和文件树没聚焦的情况下执行
    if ((!protyle && !isFileFocus) ||
        (isFileFocus && (!fileLiElements || fileLiElements.length === 0)) ||
        (isMobile() && !document.getElementById("empty").classList.contains("fn__none"))) {
        if (options.command === "replace") {
            /// #if MOBILE
            popSearch(options.app, {hasReplace: true, page: 1});
            /// #else
            openSearch({
                app: options.app,
                hotkey: Constants.DIALOG_REPLACE,
                key: range.toString()
            });
            /// #endif
        } else if (options.command === "search") {
            /// #if MOBILE
            popSearch(options.app, {hasReplace: false, page: 1});
            /// #else
            openSearch({
                app: options.app,
                hotkey: Constants.DIALOG_SEARCH,
                key: range.toString()
            });
            /// #endif
        }
        return;
    }

    // protyle and file tree
    switch (options.command) {
        case "replace":
            if (!isFileFocus) {
                /// #if MOBILE
                const response = await fetchSyncPost("/api/filetree/getHPathByPath", {
                    notebook: protyle.notebookId,
                    path: protyle.path.endsWith(".sf") ? protyle.path : protyle.path + ".sf"
                });
                popSearch(options.app, {
                    page: 1,
                    hasReplace: true,
                    hPath: pathPosix().join(getNotebookName(protyle.notebookId), response.data),
                    idPath: [pathPosix().join(protyle.notebookId, protyle.path)]
                });
                /// #else
                openSearch({
                    app: options.app,
                    hotkey: Constants.DIALOG_REPLACE,
                    key: range.toString(),
                    notebookId: protyle.notebookId,
                    searchPath: protyle.path
                });
                /// #endif
            } else {
                /// #if !MOBILE
                const topULElement = hasTopClosestByTag(fileLiElements[0], "UL");
                if (!topULElement) {
                    return false;
                }
                const notebookId = topULElement.getAttribute("data-url");
                const pathString = fileLiElements[0].getAttribute("data-path");
                const isFile = fileLiElements[0].getAttribute("data-type") === "navigation-file";
                if (isFile) {
                    openSearch({
                        app: options.app,
                        hotkey: Constants.DIALOG_REPLACE,
                        notebookId: notebookId,
                        searchPath: getDisplayName(pathString, false, true)
                    });
                } else {
                    openSearch({
                        app: options.app,
                        hotkey: Constants.DIALOG_REPLACE,
                        notebookId: notebookId,
                    });
                }
                /// #endif
            }
            break;
        case "search":
            if (!isFileFocus) {
                /// #if MOBILE
                const response = await fetchSyncPost("/api/filetree/getHPathByPath", {
                    notebook: protyle.notebookId,
                    path: protyle.path.endsWith(".sf") ? protyle.path : protyle.path + ".sf"
                });
                popSearch(options.app, {
                    page: 1,
                    hasReplace: false,
                    hPath: pathPosix().join(getNotebookName(protyle.notebookId), response.data),
                    idPath: [pathPosix().join(protyle.notebookId, protyle.path)]
                });
                /// #else
                openSearch({
                    app: options.app,
                    hotkey: Constants.DIALOG_SEARCH,
                    key: range.toString(),
                    notebookId: protyle.notebookId,
                    searchPath: protyle.path
                });
                /// #endif
            } else {
                /// #if !MOBILE
                const topULElement = hasTopClosestByTag(fileLiElements[0], "UL");
                if (!topULElement) {
                    return false;
                }
                const notebookId = topULElement.getAttribute("data-url");
                const pathString = fileLiElements[0].getAttribute("data-path");
                const isFile = fileLiElements[0].getAttribute("data-type") === "navigation-file";
                if (isFile) {
                    openSearch({
                        app: options.app,
                        hotkey: Constants.DIALOG_SEARCH,
                        notebookId: notebookId,
                        searchPath: getDisplayName(pathString, false, true)
                    });
                } else {
                    openSearch({
                        app: options.app,
                        hotkey: Constants.DIALOG_SEARCH,
                        notebookId: notebookId,
                    });
                }
                /// #endif
            }
            break;
        case "addToDatabase":
            if (!isFileFocus) {
                addEditorToDatabase(protyle, range);
            } else {
                addFilesToDatabase(fileLiElements);
            }
            break;
        case "move":
            if (!isFileFocus) {
                const nodeElement = hasClosestBlock(range.startContainer);
                if (protyle.title?.editElement.contains(range.startContainer) || !nodeElement || window.sourceflow.menus.menu.element.getAttribute("data-name") === Constants.MENU_TITLE) {
                    movePathTo({
                        cb: (toPath, toNotebook) => {
                            moveToPath([protyle.path], toNotebook[0], toPath[0]);
                        },
                        paths: [protyle.path],
                        range,
                        flashcard: false,
                        rootIDs: [protyle.block.rootID]
                    });
                } else if (nodeElement && range && protyle.element.contains(range.startContainer)) {
                    let selectElements = Array.from(protyle.wysiwyg.element.querySelectorAll(".protyle-wysiwyg--select"));
                    if (selectElements.length === 0) {
                        selectElements = [nodeElement];
                    }
                    movePathTo({
                        cb: (toPath) => {
                            hintMoveBlock(toPath[0], selectElements, protyle);
                        },
                        flashcard: false,
                        rootIDs: [protyle.block.rootID]
                    });
                }
            } else {
                const paths = getTopPaths(fileLiElements);
                const rootIDs: string[] = [];
                fileLiElements.forEach(item => {
                    rootIDs.push(item.getAttribute("data-node-id"));
                });
                movePathTo({
                    cb: (toPath, toNotebook) => {
                        moveToPath(paths, toNotebook[0], toPath[0]);
                    },
                    paths,
                    rootIDs,
                    flashcard: false
                });
            }
            break;
    }
};
