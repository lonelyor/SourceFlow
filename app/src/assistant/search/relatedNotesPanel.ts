import {Constants} from "../../constants";
import {App} from "../../index";
import {Custom} from "../../layout/dock/Custom";
import {getDockByType} from "../../layout/tabUtil";
import {fetchSyncPost} from "../../util/fetch";
import {openFileById} from "../../editor/util";
import {openSettingTab} from "../../config";
import {assistantText} from "../constants";
import {escapeAttr, escapeHTML, panelEmptyHTML, truncateText} from "../common/dom";
import {getActiveEditorProtyle, getAssistantNoteContextByRootID} from "../common/note";

// assistant/constants.ts is owned by other parallel workstreams, so the dock
// identity for this panel lives here. BuiltinAssistantPlugin.ts mirrors the
// same literals at registration time; scripts/testRelatedNotesPanel.js keeps
// the two in sync.
export const ASSISTANT_RELATED_DOCK_KEY = "related";
export const ASSISTANT_RELATED_DOCK_TYPE = `syassistant${ASSISTANT_RELATED_DOCK_KEY}`;
// Default width aligned with the results dock (assistantDockSizes.results).
export const ASSISTANT_RELATED_DOCK_SIZE = {width: 320, height: 0};
export const assistantRelatedDockTitle = () => assistantText("相关笔记", "Related Notes");

interface IRelatedNoteItem {
    rootID: string;
    title: string;
    hPath: string;
    updatedAt: number;
    id?: string;
}

interface IRelatedSearchResponse {
    results: IRelatedNoteItem[];
    count: number;
}

type TRelatedPanelState = "no-note" | "loading" | "ready" | "empty" | "unconfigured" | "error";

const RELATED_NOTES_QUERY_LIMIT = 12;
// Query budget: current note title + first heading/paragraph excerpt, <= 200 runes total.
const RELATED_NOTES_QUERY_MAX_RUNES = 200;
const RELATED_NOTES_TITLE_MAX_RUNES = 100;
const RELATED_NOTES_SUMMARY_RUNES = 40;
// Debounce for current-note switches before re-querying.
const RELATED_NOTES_SWITCH_DEBOUNCE_MS = 500;
const RELATED_NOTES_EXCERPT_CACHE_MAX = 128;

const excerptCache = new Map<string, string>();

const truncateByRunes = (value: string, limit: number) => {
    const runes = Array.from(`${value || ""}`.trim());
    if (runes.length <= limit) {
        return runes.join("");
    }
    return runes.slice(0, Math.max(limit, 1)).join("").trim();
};

// First usable heading/paragraph line of a note, with markdown noise stripped.
const extractNoteExcerptLine = (markdown: string, skipTitle = "") => {
    const lines = `${markdown || ""}`.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
        if (/^```/.test(line)) {
            continue;
        }
        const text = line
            .replace(/^#{1,6}\s*/, "")
            .replace(/[*_`~]+/g, "")
            .replace(/\s+/g, " ")
            .trim();
        if (!text) {
            continue;
        }
        if (skipTitle && text === skipTitle) {
            continue;
        }
        return text;
    }
    return "";
};

export const buildRelatedNotesQuery = (title: string, markdown: string) => {
    const noteTitle = truncateByRunes(`${title || ""}`.replace(/\s+/g, " ").trim(), RELATED_NOTES_TITLE_MAX_RUNES);
    const excerpt = extractNoteExcerptLine(markdown, noteTitle);
    const remaining = Math.max(RELATED_NOTES_QUERY_MAX_RUNES - Array.from(noteTitle).length, 24);
    return [noteTitle, truncateByRunes(excerpt, remaining)].filter(Boolean).join(" ").trim();
};

// Drop the current note itself from the semantic search results.
export const filterRelatedResults = (results: IRelatedNoteItem[], currentRootID: string) => {
    const normalized = `${currentRootID || ""}`.trim();
    return (results || [])
        .map((item) => ({...item, rootID: item.rootID || item.id || ""}))
        .filter((item) => item.rootID && item.rootID !== normalized);
};

export const isEmbeddingNotEnabledMessage = (msg: string) => {
    const normalized = `${msg || ""}`.toLowerCase();
    return normalized.includes("embedding is not enabled") ||
        (normalized.includes("embedding") && normalized.includes("not enabled"));
};

const fetchNoteExcerpt = async (rootID: string): Promise<string> => {
    const cached = excerptCache.get(rootID);
    if (cached !== undefined) {
        return cached;
    }
    let excerpt = "";
    try {
        const response = await fetchSyncPost("/api/block/getBlockKramdown", {id: rootID});
        if (response.code === 0) {
            const markdown = `${response.data?.kramdown || (typeof response.data === "string" ? response.data : "")}`;
            excerpt = truncateByRunes(extractNoteExcerptLine(markdown), RELATED_NOTES_SUMMARY_RUNES);
        }
    } catch (_) {
        excerpt = "";
    }
    if (excerptCache.size >= RELATED_NOTES_EXCERPT_CACHE_MAX) {
        excerptCache.clear();
    }
    excerptCache.set(rootID, excerpt);
    return excerpt;
};

class AssistantRelatedNotesPanel {
    private readonly app: App;
    private readonly custom: Custom;
    private readonly element: HTMLElement;
    private state: TRelatedPanelState = "no-note";
    private items: IRelatedNoteItem[] = [];
    private currentRootID = "";
    private queryToken = 0;
    private switchTimer = 0;

    private readonly handleEditorActivity = () => {
        const rootID = getActiveEditorProtyle()?.block?.rootID || "";
        if (!rootID || rootID === this.currentRootID) {
            return;
        }
        if (this.switchTimer) {
            window.clearTimeout(this.switchTimer);
        }
        this.switchTimer = window.setTimeout(() => {
            this.switchTimer = 0;
            if (!this.isVisible()) {
                return;
            }
            void this.refresh(false);
        }, RELATED_NOTES_SWITCH_DEBOUNCE_MS);
    };

    constructor(custom: Custom, app: App) {
        this.app = app;
        this.custom = custom;
        this.element = custom.element as HTMLElement;
        this.element.classList.add("assistant-dock", "assistant-dock--related", "fn__flex-column");
        this.bindEvents();
        this.bindActivityEvents();
        this.render();
        void this.refresh(false);
    }

    public destroy() {
        this.queryToken++;
        this.unbindActivityEvents();
        if (this.switchTimer) {
            window.clearTimeout(this.switchTimer);
            this.switchTimer = 0;
        }
        this.element.innerHTML = "";
    }

    public resize() {
        // no-op
    }

    public update() {
        void this.refresh(false);
    }

    public open() {
        void this.refresh(false);
    }

    private isVisible() {
        const rect = this.element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    private bindActivityEvents() {
        document.addEventListener("selectionchange", this.handleEditorActivity);
        document.addEventListener("click", this.handleEditorActivity, true);
        window.addEventListener("focus", this.handleEditorActivity);
    }

    private unbindActivityEvents() {
        document.removeEventListener("selectionchange", this.handleEditorActivity);
        document.removeEventListener("click", this.handleEditorActivity, true);
        window.removeEventListener("focus", this.handleEditorActivity);
    }

    private bindEvents() {
        this.element.addEventListener("click", (event: MouseEvent) => {
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.element)) {
                const action = target.getAttribute("data-action");
                if (action) {
                    this.handleAction(action, target);
                    event.preventDefault();
                    return;
                }
                target = target.parentElement;
            }
        });
    }

    private handleAction(action: string, target: HTMLElement) {
        if (action === "open-related") {
            const id = target.getAttribute("data-related-id") || "";
            if (id) {
                openFileById({
                    app: this.app,
                    id,
                    action: [Constants.CB_GET_SCROLL, Constants.CB_GET_FOCUS],
                });
            }
            return;
        }
        if (action === "open-ai-settings") {
            openSettingTab(this.app, "AI");
            return;
        }
        if (action === "retry") {
            void this.refresh(true);
        }
    }

    private async refresh(force = false) {
        const activeRootID = getActiveEditorProtyle()?.block?.rootID || "";
        if (!activeRootID) {
            if (this.currentRootID === "" && this.state === "no-note") {
                return;
            }
            this.currentRootID = "";
            this.items = [];
            this.state = "no-note";
            this.render();
            return;
        }
        if (!force && activeRootID === this.currentRootID &&
            (this.state === "ready" || this.state === "empty" || this.state === "unconfigured")) {
            return;
        }
        const token = ++this.queryToken;
        this.currentRootID = activeRootID;
        this.state = "loading";
        this.render();

        let title = "";
        let markdown = "";
        try {
            const context = await getAssistantNoteContextByRootID(activeRootID);
            if (token !== this.queryToken) {
                return;
            }
            title = context?.title || "";
            markdown = context?.markdown || "";
        } catch (_) {
            if (token !== this.queryToken) {
                return;
            }
            this.state = "error";
            this.render();
            return;
        }

        const query = buildRelatedNotesQuery(title, markdown);
        if (!query) {
            this.items = [];
            this.state = "empty";
            this.render();
            return;
        }

        let response: { code: number; msg?: string; data?: IRelatedSearchResponse };
        try {
            response = await fetchSyncPost("/api/assistant/embedding/search", {
                query,
                limit: RELATED_NOTES_QUERY_LIMIT,
            });
        } catch (_) {
            // Silent degrade: empty-like state with a retry entry, no toast.
            if (token !== this.queryToken) {
                return;
            }
            this.state = "error";
            this.render();
            return;
        }
        if (token !== this.queryToken) {
            return;
        }
        if (response.code !== 0) {
            this.state = isEmbeddingNotEnabledMessage(`${response.msg || ""}`) ? "unconfigured" : "error";
            this.render();
            return;
        }
        this.items = filterRelatedResults(response.data?.results || [], activeRootID);
        this.state = this.items.length > 0 ? "ready" : "empty";
        this.render();
        if (this.state === "ready") {
            void this.fillExcerpts(token);
        }
    }

    private async fillExcerpts(token: number) {
        const missing = this.items.filter((item) => !excerptCache.has(item.rootID));
        await Promise.all(missing.map((item) => fetchNoteExcerpt(item.rootID)));
        if (token !== this.queryToken || this.state !== "ready") {
            return;
        }
        this.applyExcerpts();
    }

    private applyExcerpts() {
        this.element.querySelectorAll<HTMLElement>(".assistant-related__item[data-related-id]").forEach((node) => {
            const id = node.getAttribute("data-related-id") || "";
            const excerpt = excerptCache.get(id);
            if (!excerpt) {
                return;
            }
            const summary = node.querySelector<HTMLElement>(".assistant-related__item-summary");
            if (summary) {
                summary.textContent = excerpt;
            }
        });
    }

    private renderItem(item: IRelatedNoteItem) {
        const title = item.title || item.hPath || item.rootID;
        const summary = excerptCache.get(item.rootID) || item.hPath || "";
        return `<button type="button" class="assistant-related__item" data-action="open-related" data-related-id="${escapeAttr(item.rootID)}">
    <span class="assistant-related__item-title">${escapeHTML(truncateText(title, 60))}</span>
    ${summary ? `<span class="assistant-related__item-summary">${escapeHTML(truncateText(summary, 80))}</span>` : ""}
</button>`;
    }

    private renderBody() {
        switch (this.state) {
            case "loading":
                return `<div class="assistant-related__skeleton">${[0, 1, 2, 3].map(() => `<div class="assistant-related__skeleton-item">
    <span class="assistant-related__skeleton-bar assistant-related__skeleton-bar--wide"></span>
    <span class="assistant-related__skeleton-bar assistant-related__skeleton-bar--narrow"></span>
</div>`).join("")}</div>`;
            case "ready":
                return this.items.map((item) => this.renderItem(item)).join("");
            case "unconfigured":
                return panelEmptyHTML(
                    assistantText("语义搜索未开启", "Semantic search is off"),
                    assistantText("在 AI 设置中开启 Embedding 并为笔记建立索引后，这里会自动展示与当前笔记相关的笔记。", "Enable embeddings in the AI settings and index your notes; related notes will show up here automatically."),
                    assistantText("去配置", "Configure"),
                    "open-ai-settings",
                );
            case "error":
                return panelEmptyHTML(
                    assistantText("暂时拿不到相关笔记", "Related notes are unavailable right now"),
                    assistantText("查询没有完成，稍后可以重试，不影响笔记使用。", "The query did not complete. You can retry later; notes are unaffected."),
                    assistantText("重试", "Retry"),
                    "retry",
                );
            case "empty":
                return panelEmptyHTML(
                    assistantText("没有找到相关笔记", "No related notes found"),
                    assistantText("当前笔记还没有语义相近的其他笔记，继续积累内容后这里会更丰富。", "No other notes are semantically close to this one yet. It gets richer as your content grows."),
                );
            default:
                return panelEmptyHTML(
                    assistantText("先打开一篇笔记", "Open a note first"),
                    assistantText("打开任意笔记后，这里会自动展示与它相关的其他笔记。", "Once a note is open, related notes show up here automatically."),
                );
        }
    }

    private render() {
        this.element.innerHTML = `<div class="assistant-dock__header">
    <div class="assistant-dock__header-main">
        <div class="assistant-dock__headline">
            <div class="assistant-dock__title">${escapeHTML(assistantRelatedDockTitle())}</div>
            <div class="assistant-dock__summary">${escapeHTML(assistantText("与当前笔记语义相关的其他笔记", "Notes semantically related to the current one"))}</div>
        </div>
    </div>
    <div class="assistant-dock__header-actions">
        <button class="assistant-dock__header-icon" type="button" data-action="retry" aria-label="${escapeAttr(window.sourceflow.languages.refresh)}">
            <svg><use xlink:href="#iconRefresh"></use></svg>
        </button>
    </div>
</div>
<div class="assistant-related__body">${this.renderBody()}</div>`;
    }
}

let relatedPanelInstance: AssistantRelatedNotesPanel | null = null;

export const mountAssistantRelatedDock = (custom: Custom, app: App) => {
    relatedPanelInstance = new AssistantRelatedNotesPanel(custom, app);
};

export const destroyAssistantRelatedDock = () => {
    relatedPanelInstance?.destroy();
    relatedPanelInstance = null;
};

export const resizeAssistantRelatedDock = () => {
    relatedPanelInstance?.resize();
};

export const updateAssistantRelatedDock = () => {
    relatedPanelInstance?.update();
};

export const openAssistantRelatedDock = () => {
    const dock = getDockByType(ASSISTANT_RELATED_DOCK_TYPE);
    if (!dock) {
        return false;
    }
    dock.toggleModel(ASSISTANT_RELATED_DOCK_TYPE, true);
    const tryOpen = (retries = 10) => {
        if (relatedPanelInstance) {
            relatedPanelInstance.open();
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
