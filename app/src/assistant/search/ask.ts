import {chatAssistantAI, getAssistantAIDefaultProfile} from "../ai/api";
import {assistantText} from "../constants";
import {truncateText} from "../common/dom";

export interface IAssistantSearchSource {
    id: string;
    rootID: string;
    title: string;
    path: string;
    content: string;
}

interface IRunAssistantSearchOptions {
    query: string;
    filters?: string[];
    sources: IAssistantSearchSource[];
}

export interface IAssistantSearchAnswer {
    answer: string;
    sessionId: string;
}

const buildSearchPrompt = (options: IRunAssistantSearchOptions) => {
    const sourceText = options.sources.map((item, index) => {
        return [
            `[${index + 1}] ${item.title}`,
            `Path: ${item.path}`,
            "Snippet:",
            item.content,
        ].join("\n");
    }).join("\n\n");
    const filterText = options.filters?.length ? options.filters.map((item) => `- ${item}`).join("\n") : "";
    return assistantText(
        `你现在在回答笔记知识库搜索问题。请优先基于我给你的搜索结果回答，不要编造不存在的笔记或结论。如果现有结果不足以确定答案，请明确说“现有搜索结果不足以确定”，并说明还缺什么。\n\n问题：${options.query}\n\n${filterText ? `搜索范围：\n${filterText}\n\n` : ""}候选来源：\n${sourceText}\n\n请直接输出 Markdown 答案，先给结论，再补充关键依据，不要输出多余前言。`,
        `You are answering a question over a note workspace search. Prioritize the provided search results and do not invent notes or conclusions. If the current results are insufficient, explicitly say "The current search results are insufficient to determine that" and explain what is missing.\n\nQuestion: ${options.query}\n\n${filterText ? `Search scope:\n${filterText}\n\n` : ""}Candidate sources:\n${sourceText}\n\nReturn a Markdown answer with the conclusion first and the supporting evidence after it. Do not add extra preamble.`
    );
};

export const runAssistantWorkspaceSearch = async (options: IRunAssistantSearchOptions): Promise<IAssistantSearchAnswer> => {
    const profile = await getAssistantAIDefaultProfile();
    if (!profile) {
        throw new Error(assistantText("请先配置至少一个 AI 模型", "Configure at least one AI profile first"));
    }
    const result = await chatAssistantAI({
        profileId: profile.id,
        mode: "chat",
        title: truncateText(`${assistantText("AI 搜索", "AI Search")} ${options.query}`.trim(), 72) || assistantText("AI 搜索", "AI Search"),
        message: buildSearchPrompt(options),
        system: assistantText("你是笔记知识库助手，要基于检索结果作答，保持谨慎、直接、可核对。", "You are a note workspace assistant. Answer from retrieved results, stay careful, direct, and checkable."),
        enableTools: true,
    });
    const answer = [...result.messages].reverse().find((item) => item.role === "assistant")?.content?.trim() || "";
    if (!answer) {
        throw new Error(assistantText("AI 没有返回可用答案", "The AI did not return a usable answer"));
    }
    return {
        answer,
        sessionId: result.session.id,
    };
};
