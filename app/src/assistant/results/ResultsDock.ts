import {App} from "../../index";
import {Custom} from "../../layout/dock/Custom";
import {getDockByType} from "../../layout/tabUtil";
import {fetchSyncPost} from "../../util/fetch";
import {assistantText, ASSISTANT_RESULTS_DOCK_TYPE} from "../constants";
import {appendMarkdownToCurrentNote} from "../common/note";
import {escapeAttr, escapeHTML, formatDateTime, panelEmptyHTML, truncateText} from "../common/dom";
import {ASSISTANT_INBOX_TAG, openAssistantInbox} from "../inbox/store";
import {runAssistantFeature} from "../runtime";
import {IWorkbenchItem} from "../../workbench/constants";
import {Constants} from "../../constants";
import {openFileById} from "../../editor/util";
import {showMessage} from "../../dialog/message";

type TAssistantResultCategory = "all" | "summary" | "outline" | "qa" | "flashcards" | "other";

interface IAssistantResultCard {
    item: IWorkbenchItem;
    category: TAssistantResultCategory;
    kind: string;
}

const loadAssistantSkillModule = () => import("../skills/execute");
const loadAssistantStudioModule = () => import("../studio/sourceFlow");

const pickAssistantSourceFiles = () => {
    return new Promise<File[]>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.className = "fn__none";
        document.body.appendChild(input);
        input.addEventListener("change", () => {
            const files = input.files ? Array.from(input.files) : [];
            input.remove();
            resolve(files);
        }, {once: true});
        input.click();
    });
};

const getResultCategory = (kind: string): TAssistantResultCategory => {
    switch (kind) {
        case "note-summarize":
        case "selection-summarize":
        case "source-summary":
            return "summary";
        case "note-outline":
        case "selection-keypoints":
        case "source-outline":
            return "outline";
        case "note-qa":
        case "selection-qa":
        case "source-qa":
            return "qa";
        case "note-flashcards":
        case "source-flashcards":
            return "flashcards";
        default:
            return "other";
    }
};

const getResultCategoryLabel = (category: TAssistantResultCategory) => {
    switch (category) {
        case "all":
            return assistantText("全部", "All");
        case "summary":
            return assistantText("摘要", "Summary");
        case "outline":
            return assistantText("提纲", "Outline");
        case "qa":
            return assistantText("问答", "Q&A");
        case "flashcards":
            return assistantText("卡片", "Flashcards");
        default:
            return assistantText("其他", "Other");
    }
};

const getQuickSkillLabel = (skillId: string) => {
    switch (skillId) {
        case "note-summarize":
            return assistantText("生成摘要", "Generate Summary");
        case "note-outline":
            return assistantText("生成提纲", "Generate Outline");
        case "note-qa":
            return assistantText("生成问答", "Generate Q&A");
        case "note-flashcards":
            return assistantText("生成卡片", "Generate Flashcards");
        default:
            return skillId;
    }
};

const getItemKind = (item: IWorkbenchItem) => {
    const tag = (item.tags || []).find((value) => value.startsWith("assistant-") && !["assistant-ai", "assistant-inbox"].includes(value));
    return tag ? tag.replace("assistant-", "") : "";
};

class AssistantResultsDock {
    private readonly app: App;
    private readonly custom: Custom;
    private readonly element: HTMLElement;
    private items: IAssistantResultCard[] = [];
    private filter: TAssistantResultCategory = "all";
    private loading = false;
    private readonly handleExternalRefresh = () => {
        void this.refresh(false);
    };

    constructor(custom: Custom, app: App) {
        this.app = app;
        this.custom = custom;
        this.element = custom.element as HTMLElement;
        this.element.classList.add("assistant-dock", "assistant-dock--results", "fn__flex-column");
        this.bindEvents();
        window.addEventListener("assistant-inbox-updated", this.handleExternalRefresh);
        void this.refresh(true);
    }

    public destroy() {
        window.removeEventListener("assistant-inbox-updated", this.handleExternalRefresh);
        this.element.innerHTML = "";
    }

    public resize() {
        // no-op
    }

    public update() {
        void this.refresh(false);
    }

    public open(filter?: TAssistantResultCategory) {
        if (filter) {
            this.filter = filter;
        }
        this.render();
    }

    private bindEvents() {
        this.element.addEventListener("click", (event: MouseEvent) => {
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.element)) {
                const filter = target.getAttribute("data-filter") as TAssistantResultCategory;
                if (filter) {
                    this.filter = filter;
                    this.render();
                    event.preventDefault();
                    return;
                }
                const action = target.getAttribute("data-action");
                if (action) {
                    void this.handleAction(action, target);
                    event.preventDefault();
                    return;
                }
                target = target.parentElement;
            }
        });
    }

    private async handleAction(action: string, target: HTMLElement) {
        if (action === "refresh") {
            await this.refresh(true);
            return;
        }
        if (action === "open-inbox") {
            await openAssistantInbox(this.app);
            return;
        }
        if (action === "open-note") {
            const id = target.getAttribute("data-id") || "";
            if (id) {
                openFileById({
                    app: this.app,
                    id,
                    action: [Constants.CB_GET_FOCUS],
                });
            }
            return;
        }
        if (action === "insert-ref") {
            const id = target.getAttribute("data-id") || "";
            const title = target.getAttribute("data-title") || assistantText("AI 成果", "AI Result");
            if (!id) {
                return;
            }
            const inserted = await appendMarkdownToCurrentNote(`- ((${id} '${`${title}`.replace(/'/g, " ")}'))`);
            if (inserted) {
                window.dispatchEvent(new CustomEvent("assistant-inbox-updated"));
            }
            return;
        }
        if (action === "open-studio") {
            const {openAssistantSourceStudio} = await loadAssistantStudioModule();
            openAssistantSourceStudio(this.app);
            return;
        }
        if (action === "upload-summary" || action === "upload-outline") {
            const {openAssistantSourceStudio} = await loadAssistantStudioModule();
            const files = await pickAssistantSourceFiles();
            if (!files.length) {
                return;
            }
            openAssistantSourceStudio(this.app, {
                goal: action === "upload-outline" ? "outline" : "summary",
                autoGenerateAfterUpload: true,
                initialFiles: files,
            });
            return;
        }
        if (action === "run-skill") {
            const skillId = target.getAttribute("data-skill-id") || "";
            if (!skillId) {
                return;
            }
            runAssistantFeature(`results:${skillId}`, loadAssistantSkillModule, ({runAssistantSkill}) => {
                return runAssistantSkill({
                    skillId: skillId as never,
                });
            });
        }
    }

    private async refresh(showLoading = false) {
        if (showLoading) {
            this.loading = true;
            this.render();
        }
        try {
            const response = await fetchSyncPost("/api/workbench/getWorkbenchItems", {limit: 512});
            const items = Array.isArray(response.data?.items) ? response.data.items : [];
            this.items = items
                .filter((item: IWorkbenchItem) => (item.tags || []).includes(ASSISTANT_INBOX_TAG))
                .map((item: IWorkbenchItem) => {
                    const kind = getItemKind(item);
                    return {
                        item,
                        kind,
                        category: getResultCategory(kind),
                    };
                })
                .sort((left: IAssistantResultCard, right: IAssistantResultCard) => (right.item.capturedTs || right.item.updatedAt || 0) - (left.item.capturedTs || left.item.updatedAt || 0));
        } catch (error) {
            this.items = [];
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        } finally {
            this.loading = false;
            this.render();
        }
    }

    private getVisibleItems() {
        if (this.filter === "all") {
            return this.items;
        }
        return this.items.filter((item) => item.category === this.filter);
    }

    private render() {
        const visibleItems = this.getVisibleItems();
        this.element.innerHTML = `<div class="assistant-dock__header">
    <div class="assistant-dock__header-main">
        <div class="assistant-dock__headline">
            <div class="assistant-dock__title">${escapeHTML(assistantText("AI 成果", "AI Results"))}</div>
            <div class="assistant-dock__summary">${escapeHTML(assistantText("摘要、提纲、问答和复习卡片集中在这里。", "Summaries, outlines, Q&A, and flashcards live here."))}</div>
        </div>
    </div>
    <div class="assistant-dock__header-actions">
        <button class="assistant-dock__header-icon" type="button" data-action="open-inbox" aria-label="${escapeAttr(assistantText("打开 AI 收件箱", "Open AI Inbox"))}">
            <svg><use xlink:href="#iconLayout"></use></svg>
        </button>
        <button class="assistant-dock__header-icon" type="button" data-action="refresh" aria-label="${escapeAttr(window.sourceflow.languages.refresh)}">
            <svg><use xlink:href="#iconRefresh"></use></svg>
        </button>
    </div>
</div>
<div class="assistant-results__quick">
    <button class="assistant-results__quick-action assistant-results__quick-action--primary" type="button" data-action="upload-summary">${escapeHTML(assistantText("上传并总结", "Upload & Summarize"))}</button>
    <button class="assistant-results__quick-action assistant-results__quick-action--primary" type="button" data-action="upload-outline">${escapeHTML(assistantText("上传并提纲", "Upload & Outline"))}</button>
    <button class="assistant-results__quick-action assistant-results__quick-action--primary" type="button" data-action="open-studio">${escapeHTML(assistantText("来源创作", "Source Studio"))}</button>
    ${["note-summarize", "note-outline", "note-qa", "note-flashcards"].map((skillId) => `<button class="assistant-results__quick-action" type="button" data-action="run-skill" data-skill-id="${escapeAttr(skillId)}">${escapeHTML(getQuickSkillLabel(skillId))}</button>`).join("")}
</div>
<div class="assistant-results__filters">
    ${(["all", "summary", "outline", "qa", "flashcards"] as TAssistantResultCategory[]).map((category) => `<button class="assistant-results__filter${this.filter === category ? " assistant-results__filter--active" : ""}" type="button" data-filter="${escapeAttr(category)}">${escapeHTML(getResultCategoryLabel(category))}</button>`).join("")}
</div>
<div class="assistant-results__body">${this.loading ? `<div class="assistant-results__loading">${escapeHTML(assistantText("正在加载成果...", "Loading results..."))}</div>` : (visibleItems.length > 0 ? visibleItems.map((item) => this.renderCard(item)).join("") : panelEmptyHTML(
            assistantText("还没有 AI 成果", "No AI results yet"),
            assistantText("可以直接上传文件/图片生成总结或提纲，也可以从当前笔记生成摘要、问答和复习卡片。", "Upload files/images to generate a summary or outline, or create summaries, Q&A, and flashcards from the current note.")
        ))}</div>`;
    }

    private renderCard(card: IAssistantResultCard) {
        const item = card.item;
        const preview = truncateText(`${item.preview || item.goal || item.nextStep || ""}`.replace(/\s+/g, " "), 120);
        return `<div class="assistant-results__card">
    <div class="assistant-results__card-head">
        <span class="b3-chip">${escapeHTML(getResultCategoryLabel(card.category))}</span>
        <span class="assistant-results__card-time">${escapeHTML(formatDateTime(item.capturedTs || item.updatedAt || 0))}</span>
    </div>
    <button class="assistant-results__card-title" type="button" data-action="open-note" data-id="${escapeAttr(item.id)}">${escapeHTML(item.title || assistantText("未命名成果", "Untitled result"))}</button>
    <div class="assistant-results__card-meta">${escapeHTML(item.goal || assistantText("AI 结果", "AI result"))}</div>
    ${preview ? `<div class="assistant-results__card-preview">${escapeHTML(preview)}</div>` : ""}
    <div class="assistant-results__card-actions">
        <button class="b3-button b3-button--outline" type="button" data-action="open-note" data-id="${escapeAttr(item.id)}">${escapeHTML(assistantText("打开", "Open"))}</button>
        <button class="b3-button b3-button--outline" type="button" data-action="insert-ref" data-id="${escapeAttr(item.id)}" data-title="${escapeAttr(item.title || assistantText("AI 成果", "AI Result"))}">${escapeHTML(assistantText("插入引用", "Insert ref"))}</button>
    </div>
</div>`;
    }
}

let resultsDockInstance: AssistantResultsDock | null = null;

export const mountAssistantResultsDock = (custom: Custom, app: App) => {
    resultsDockInstance = new AssistantResultsDock(custom, app);
};

export const destroyAssistantResultsDock = () => {
    resultsDockInstance?.destroy();
    resultsDockInstance = null;
};

export const resizeAssistantResultsDock = () => {
    resultsDockInstance?.resize();
};

export const updateAssistantResultsDock = () => {
    resultsDockInstance?.update();
};

export const openAssistantResultsDock = (filter?: TAssistantResultCategory) => {
    const dock = getDockByType(ASSISTANT_RESULTS_DOCK_TYPE);
    if (!dock) {
        showMessage(assistantText("AI 成果侧栏尚未初始化", "AI results sidebar is not ready"), 5000, "error");
        return false;
    }
    dock.toggleModel(ASSISTANT_RESULTS_DOCK_TYPE, true);
    const tryOpen = (retries = 10) => {
        if (resultsDockInstance) {
            resultsDockInstance.open(filter);
            return;
        }
        if (0 < retries) {
            window.setTimeout(() => {
                tryOpen(retries - 1);
            }, 60);
        }
    };
    tryOpen();
    return true;
};
