import {Constants} from "../constants";

export const ASSISTANT_PLUGIN_NAME = "syassistant";
export const ASSISTANT_AI_DOCK_KEY = "ai";
export const ASSISTANT_RESULTS_DOCK_KEY = "results";
export const ASSISTANT_TERMINAL_DOCK_KEY = "terminal";
export const ASSISTANT_AI_DOCK_TYPE = `${ASSISTANT_PLUGIN_NAME}${ASSISTANT_AI_DOCK_KEY}`;
export const ASSISTANT_RESULTS_DOCK_TYPE = `${ASSISTANT_PLUGIN_NAME}${ASSISTANT_RESULTS_DOCK_KEY}`;
export const ASSISTANT_TERMINAL_DOCK_TYPE = `${ASSISTANT_PLUGIN_NAME}${ASSISTANT_TERMINAL_DOCK_KEY}`;
export const ASSISTANT_AT_AI_LABEL = "@AI";

export const assistantText = (zh: string, en: string) => {
    const lang = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase();
    return lang.startsWith("zh") ? zh : en;
};

export const ASSISTANT_ANALYZE_PROMPT = assistantText(
    "请基于完整对话生成一份适合保存到 SourceFlow 的 Markdown 分析。要求：1. 概括背景、目标和最终结论；2. 提炼关键决策、命令、代码块和配置项；3. 列出待办、风险和后续建议；4. 保持结构清晰，可直接归档。",
    "Generate a Markdown analysis for the full conversation that is suitable for saving into SourceFlow. Summarize the background, goal, conclusion, important commands, code blocks, config changes, follow-up tasks, and risks in a clean structure."
);

interface IAssistantNoteContextInput {
    title: string;
    path: string;
    markdown: string;
    currentBlockID?: string;
    currentBlockMarkdown?: string;
    selectedText?: string;
    outlineMarkdown?: string;
    styleSummary?: string;
    surroundingBlocks?: Array<{
        id: string;
        type: string;
        markdown: string;
        position: "previous" | "current" | "next";
    }>;
}

const assistantSelectionSkillIds = new Set([
    "selection-summarize",
    "selection-keypoints",
    "selection-qa",
    "selection-rewrite",
    "selection-translate",
    "selection-mermaid",
    "selection-table",
    "selection-mind-elixir",
]);

const assistantSummarySkillIds = new Set([
    "note-create",
    "note-summarize",
    "note-outline",
    "note-qa",
    "note-flashcards",
    "note-health",
    "note-translate-mixed",
    "note-translate-replace",
]);

const limitAssistantText = (value: string, limit: number) => {
    const text = `${value || ""}`.trim();
    if (limit < 1) {
        return text;
    }
    const runes = Array.from(text);
    if (runes.length <= limit) {
        return text;
    }
    return `${runes.slice(0, limit).join("").trim()}\n\n[truncated]`;
};

export const buildAssistantMarkdownExcerpt = (markdown: string, fullLimit = 4000, headLimit = 2000, tailLimit = 500) => {
    const text = `${markdown || ""}`.trim();
    const runes = Array.from(text);
    if (runes.length <= fullLimit) {
        return text;
    }
    const head = runes.slice(0, headLimit).join("").trim();
    const tail = runes.slice(Math.max(runes.length - tailLimit, 0)).join("").trim();
    return `${head}\n\n...\n\n${tail}`;
};

export const buildAssistantNoteContext = (context: IAssistantNoteContextInput) => {
    const sections = buildAssistantContextHeader(context);
    if (`${context.selectedText || ""}`.trim()) {
        sections.push(assistantText("当前选中文本如下，请优先围绕它工作：", "The following text is currently selected. Prioritize it when relevant."));
        sections.push("```text");
        sections.push(`${context.selectedText}`.trim());
        sections.push("```");
    }
    if (`${context.currentBlockMarkdown || ""}`.trim()) {
        sections.push(assistantText("以下是当前块内容，请在需要细粒度编辑时优先参考：", "Below is the current block content. Prefer it for fine-grained editing when relevant."));
        sections.push("```markdown");
        sections.push(limitAssistantText(`${context.currentBlockMarkdown}`.trim(), 3000));
        sections.push("```");
    }
    sections.push(assistantText("以下是当前文档内容，请在回答时结合这些内容。", "Below is the current note content. Use it as context when answering."));
    sections.push("```markdown");
    sections.push(limitAssistantText(context.markdown, 20000));
    sections.push("```");
    return sections.join("\n\n");
};

const buildAssistantContextHeader = (context: IAssistantNoteContextInput) => {
    const sections = [
        assistantText("你正在协助编辑 SourceFlow 中的当前文档。", "You are helping edit the current note in SourceFlow."),
        `${assistantText("文档标题", "Document title")}: ${context.title}`,
        `${assistantText("文档路径", "Document path")}: ${context.path}`,
    ];
    if (`${context.currentBlockID || ""}`.trim()) {
        sections.push(`${assistantText("当前块 ID", "Current block ID")}: ${context.currentBlockID}`);
    }
    if (`${context.styleSummary || ""}`.trim()) {
        sections.push(`${context.styleSummary}`.trim());
    }
    return sections;
};

const appendAssistantOutlineSection = (sections: string[], context: IAssistantNoteContextInput, fallbackLimit = 24) => {
    const outline = `${context.outlineMarkdown || ""}`.trim();
    if (outline) {
        sections.push(assistantText("当前文档大纲：", "Current note outline:"));
        sections.push("```text");
        sections.push(outline.split(/\r?\n/).slice(0, fallbackLimit).join("\n"));
        sections.push("```");
    }
};

const appendAssistantSelectedTextSection = (sections: string[], context: IAssistantNoteContextInput) => {
    const selectedText = `${context.selectedText || ""}`.trim();
    if (!selectedText) {
        return;
    }
    sections.push(assistantText("当前选中文本如下，只围绕这段内容处理：", "The current selection is below. Work only on this selected content."));
    sections.push("```text");
    sections.push(selectedText);
    sections.push("```");
};

const appendAssistantCurrentBlockSection = (sections: string[], context: IAssistantNoteContextInput) => {
    const currentBlock = `${context.currentBlockMarkdown || ""}`.trim();
    if (!currentBlock) {
        return;
    }
    sections.push(assistantText("当前块上下文：", "Current block context:"));
    sections.push("```markdown");
    sections.push(limitAssistantText(currentBlock, 1600));
    sections.push("```");
};

const appendAssistantCursorWindowSection = (sections: string[], context: IAssistantNoteContextInput) => {
    const blocks = (context.surroundingBlocks || []).filter((item) => `${item.markdown || ""}`.trim());
    if (!blocks.length) {
        appendAssistantCurrentBlockSection(sections, context);
        return;
    }
    sections.push(assistantText("当前光标附近内容如下，请只沿着这里自然续写：", "Nearby content around the cursor is below. Continue naturally from this location only."));
    blocks.forEach((block) => {
        const label = block.position === "current"
            ? assistantText("当前块", "Current block")
            : (block.position === "previous" ? assistantText("前文块", "Previous block") : assistantText("后文块", "Next block"));
        sections.push(`${label}: ${block.id}${block.type ? ` (${block.type})` : ""}`);
        sections.push("```markdown");
        sections.push(limitAssistantText(block.markdown, block.position === "current" ? 1600 : 900));
        sections.push("```");
    });
};

const appendAssistantDocumentExcerptSection = (sections: string[], context: IAssistantNoteContextInput, mode: "summary" | "full" | "links") => {
    const markdown = `${context.markdown || ""}`.trim();
    if (!markdown) {
        return;
    }
    if (mode === "links") {
        sections.push(assistantText("当前文档开头片段：", "Opening excerpt of the current note:"));
        sections.push("```markdown");
        sections.push(limitAssistantText(markdown, 1000));
        sections.push("```");
        return;
    }
    sections.push(mode === "full"
        ? assistantText("当前文档全文如下：", "Full current note content:")
        : assistantText("当前文档摘要窗口如下：", "Current note excerpt window:"));
    sections.push("```markdown");
    sections.push(mode === "full" ? limitAssistantText(markdown, 20000) : buildAssistantMarkdownExcerpt(markdown));
    sections.push("```");
};

export const buildAssistantNoteContextForSkill = (context: IAssistantNoteContextInput, skillId: string) => {
    const sections = buildAssistantContextHeader(context);
    if (assistantSelectionSkillIds.has(skillId)) {
        appendAssistantSelectedTextSection(sections, context);
        appendAssistantCurrentBlockSection(sections, context);
        return sections.join("\n\n");
    }
    if (skillId === "note-continue-writing") {
        appendAssistantOutlineSection(sections, context, 18);
        appendAssistantCursorWindowSection(sections, context);
        return sections.join("\n\n");
    }
    if (skillId === "note-polish") {
        appendAssistantOutlineSection(sections, context);
        appendAssistantDocumentExcerptSection(sections, context, "full");
        return sections.join("\n\n");
    }
    if (skillId === "note-links") {
        appendAssistantOutlineSection(sections, context);
        appendAssistantDocumentExcerptSection(sections, context, "links");
        return sections.join("\n\n");
    }
    if (assistantSummarySkillIds.has(skillId)) {
        appendAssistantOutlineSection(sections, context);
        appendAssistantDocumentExcerptSection(sections, context, "summary");
        return sections.join("\n\n");
    }
    return buildAssistantNoteContext(context);
};

export const getAssistantDockTitles = () => ({
    ai: assistantText("AI 助手", "AI Assistant"),
    results: assistantText("AI 成果", "AI Results"),
    terminal: assistantText("终端", "Terminal"),
    settings: window.sourceflow?.languages?.config || assistantText("设置", "Settings"),
    plugin: window.sourceflow?.languages?.plugin || assistantText("插件", "Plugins"),
    analyze: assistantText("分析并保存", "Analyze & Save"),
    transcript: assistantText("保存对话", "Save Transcript"),
    insertReply: assistantText("插入回复", "Insert Reply"),
});

export const assistantDockSizes = {
    ai: {width: 300, height: 0},
    results: {width: 320, height: 0},
    terminal: {width: 360, height: 0},
};

export const assistantDockPosition = {
    ai: "RightTop" as const,
    results: "RightTop" as const,
    terminal: "RightBottom" as const,
};

export const getAssistantWebSocketURL = (id: string) => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/ws?app=${Constants.SOURCEFLOW_APPID}&id=${encodeURIComponent(id)}&type=main`;
};
