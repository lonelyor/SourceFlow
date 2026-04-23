import {Constants} from "../constants";

export const ASSISTANT_PLUGIN_NAME = "syassistant";
export const ASSISTANT_AI_DOCK_KEY = "ai";
export const ASSISTANT_RESULTS_DOCK_KEY = "results";
export const ASSISTANT_TERMINAL_DOCK_KEY = "terminal";
export const ASSISTANT_AI_DOCK_TYPE = `${ASSISTANT_PLUGIN_NAME}${ASSISTANT_AI_DOCK_KEY}`;
export const ASSISTANT_RESULTS_DOCK_TYPE = `${ASSISTANT_PLUGIN_NAME}${ASSISTANT_RESULTS_DOCK_KEY}`;
export const ASSISTANT_TERMINAL_DOCK_TYPE = `${ASSISTANT_PLUGIN_NAME}${ASSISTANT_TERMINAL_DOCK_KEY}`;

export const assistantText = (zh: string, en: string) => {
    const lang = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase();
    return lang.startsWith("zh") ? zh : en;
};

export const ASSISTANT_ANALYZE_PROMPT = assistantText(
    "请基于完整对话生成一份适合保存到 SourceFlow 的 Markdown 分析。要求：1. 概括背景、目标和最终结论；2. 提炼关键决策、命令、代码块和配置项；3. 列出待办、风险和后续建议；4. 保持结构清晰，可直接归档。",
    "Generate a Markdown analysis for the full conversation that is suitable for saving into SourceFlow. Summarize the background, goal, conclusion, important commands, code blocks, config changes, follow-up tasks, and risks in a clean structure."
);

export const buildAssistantNoteContext = (context: {
    title: string,
    path: string,
    markdown: string,
    currentBlockID?: string,
    currentBlockMarkdown?: string,
    selectedText?: string,
}) => {
    const sections = [
        assistantText("你正在协助编辑 SourceFlow 中的当前文档。", "You are helping edit the current note in SourceFlow."),
        `${assistantText("文档标题", "Document title")}: ${context.title}`,
        `${assistantText("文档路径", "Document path")}: ${context.path}`,
    ];
    if (`${context.currentBlockID || ""}`.trim()) {
        sections.push(`${assistantText("当前块 ID", "Current block ID")}: ${context.currentBlockID}`);
    }
    if (`${context.selectedText || ""}`.trim()) {
        sections.push(assistantText("当前选中文本如下，请优先围绕它工作：", "The following text is currently selected. Prioritize it when relevant."));
        sections.push("```text");
        sections.push(`${context.selectedText}`.trim());
        sections.push("```");
    }
    if (`${context.currentBlockMarkdown || ""}`.trim()) {
        sections.push(assistantText("以下是当前块内容，请在需要细粒度编辑时优先参考：", "Below is the current block content. Prefer it for fine-grained editing when relevant."));
        sections.push("```markdown");
        sections.push(`${context.currentBlockMarkdown}`.trim());
        sections.push("```");
    }
    sections.push(assistantText("以下是当前文档内容，请在回答时结合这些内容。", "Below is the current note content. Use it as context when answering."));
    sections.push("```markdown");
    sections.push(context.markdown);
    sections.push("```");
    return sections.join("\n\n");
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
