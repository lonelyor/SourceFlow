import {MenuItem} from "../../menus/Menu";
import {showMessage} from "../../dialog/message";
import {assistantText} from "../constants";
import {escapeAttr, escapeHTML} from "../common/dom";
import {getNoteContextFromProtyle} from "../common/note";
import {buildMentionSourcesFromNoteContext} from "../common/source";
import {runAssistantFeature} from "../runtime";

const loadAssistantSkillModule = () => import("./execute");
const loadAssistantInlineModule = () => import("../inline/commands");
const loadAssistantAIDockModule = () => import("../ai/AIDock");

interface IAppendAssistantContextActionsOptions {
    protyle: IProtyle;
    range?: Range | null;
    fallbackSelectionText?: string;
    includeOptimizeTypography?: boolean;
    onOptimizeTypography?: () => void;
}

export const appendAssistantContextActions = (options: IAppendAssistantContextActionsOptions) => {
    const selectionText = `${options.fallbackSelectionText || options.range?.toString() || ""}`.trim();
    const hasSelection = !!selectionText;
    if (!options.protyle && !hasSelection && !options.includeOptimizeTypography) {
        return false;
    }
    const renderSection = (title: string, buttonsHTML: string) => {
        if (!buttonsHTML) {
            return "";
        }
        return `<div class="assistant-context-actions__section">
    <div class="assistant-context-actions__title">${escapeHTML(title)}</div>
    <div class="assistant-context-actions__row">${buttonsHTML}</div>
</div>`;
    };
    const noteButtonItems: Array<{skillId?: string; action?: string; label: string}> = [
        {skillId: "ask-ai", label: assistantText("问 AI", "Ask AI")},
        {action: "add-to-current-chat", label: assistantText("加入当前对话", "Add to Chat")},
        {action: "start-new-chat", label: assistantText("开启新对话", "New Chat")},
        {skillId: "note-create", label: assistantText("创作", "Create")},
        {skillId: "note-continue-writing", label: assistantText("续写", "Continue")},
        {skillId: "note-summarize", label: assistantText("总结", "Summarize")},
        {skillId: "note-polish", label: assistantText("润色", "Polish")},
        {skillId: "note-outline", label: assistantText("提纲", "Outline")},
        {skillId: "note-qa", label: assistantText("问答", "Q&A")},
        {skillId: "note-translate-mixed", label: assistantText("全文翻译", "Full Translate")},
        {skillId: "note-batch-instruct", label: assistantText("批量指令", "Batch")},
    ];
    const noteButtons = noteButtonItems.map((item) => `<button class="assistant-context-actions__button" type="button"${item.skillId ? ` data-skill-id="${escapeAttr(item.skillId)}"` : ""}${item.action ? ` data-action="${escapeAttr(item.action)}"` : ""}>${escapeHTML(item.label)}</button>`).join("");
    const selectionButtons = hasSelection ? [
        {skillId: "", action: "inline-instruction", label: assistantText("内联指令", "Inline")},
        {skillId: "selection-summarize", label: assistantText("总结为笔记", "Summarize")},
        {skillId: "selection-keypoints", label: assistantText("提取要点", "Key Points")},
        {skillId: "selection-qa", label: assistantText("生成问答", "Generate Q&A")},
        {skillId: "selection-rewrite", label: assistantText("改写表达", "Rewrite")},
        {skillId: "selection-translate", label: assistantText("翻译选中", "Translate")},
        {skillId: "selection-to-chart", label: assistantText("生成图表", "Chart")},
    ].map((item) => `<button class="assistant-context-actions__button" type="button"${item.skillId ? ` data-skill-id="${escapeAttr(item.skillId)}"` : ""}${item.action ? ` data-action="${escapeAttr(item.action)}"` : ""}>${escapeHTML(item.label)}</button>`).join("") : "";
    const optimizeButton = options.includeOptimizeTypography
        ? `<button class="assistant-context-actions__button" type="button" data-action="optimize">${escapeHTML(window.sourceflow.languages.optimizeTypography)}</button>`
        : "";
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "assistantContextActions",
        iconHTML: "",
        type: "empty",
        label: `<div class="assistant-context-actions">
    ${renderSection(assistantText("AI 笔记动作", "AI Note Actions"), noteButtons)}
    ${renderSection(assistantText("AI 选区动作", "AI Selection Actions"), `${selectionButtons}${optimizeButton}`)}
</div>`,
        bind(element) {
            element.addEventListener("click", (event) => {
                let target = event.target as HTMLElement;
                while (target && !target.isEqualNode(element)) {
                    const action = target.getAttribute("data-action");
                    const skillId = target.getAttribute("data-skill-id");
                    if (action === "optimize" && options.onOptimizeTypography) {
                        options.onOptimizeTypography();
                        window.sourceflow.menus.menu.remove();
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                    if (action === "inline-instruction") {
                        runAssistantFeature("context-actions:inline-instruction", loadAssistantInlineModule, ({openAssistantInlineCommandPanel}) => {
                            openAssistantInlineCommandPanel({
                                protyle: options.protyle,
                                range: options.range,
                                fallbackSelectionText: options.fallbackSelectionText,
                            });
                        });
                        window.sourceflow.menus.menu.remove();
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                    if (action === "add-to-current-chat" || action === "start-new-chat") {
                        void getNoteContextFromProtyle(options.protyle, options.range, options.fallbackSelectionText || "").then((note) => {
                            const sources = buildMentionSourcesFromNoteContext(note);
                            runAssistantFeature(`context-actions:${action}`, loadAssistantAIDockModule, ({openAssistantAIDock}) => {
                                openAssistantAIDock({
                                    includeCurrentNote: false,
                                    mode: "chat",
                                    newSession: action === "start-new-chat",
                                    sources,
                                });
                            });
                        }).catch((error) => {
                            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
                        });
                        window.sourceflow.menus.menu.remove();
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                    if (skillId) {
                        runAssistantFeature(`context-actions:${skillId}`, loadAssistantSkillModule, ({runAssistantSkill}) => {
                            return runAssistantSkill({
                                skillId: skillId as never,
                                protyle: options.protyle,
                                range: options.range,
                                fallbackSelectionText: options.fallbackSelectionText,
                            });
                        });
                        window.sourceflow.menus.menu.remove();
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                    target = target.parentElement;
                }
            });
        },
    }).element);
    window.sourceflow.menus.menu.append(new MenuItem({
        id: "assistantContextActionsSeparator",
        type: "separator",
    }).element);
    return true;
};
