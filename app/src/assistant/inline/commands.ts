import {Dialog} from "../../dialog";
import {showMessage} from "../../dialog/message";
import {assistantText, buildAssistantNoteContextForSkill} from "../constants";
import {escapeAttr, escapeHTML, truncateText} from "../common/dom";
import {getNoteContextFromProtyle} from "../common/note";
import {getAssistantAIDefaultProfile, streamAssistantAI} from "../ai/api";
import {buildAssistantPatchFromSkillResult} from "../patch/build";
import {openAssistantPatchReviewDialog} from "../patch/dialog";
import {createAssistantGhostDraft} from "../ghost/draft";
import type {IAssistantSkillContext, IAssistantSkillDefinition} from "../skills/types";
import {
    buildAssistantInlineRoundKey,
    claimAssistantInlineRound,
    normalizeAssistantInlineInstruction,
    readAssistantInlineRecentInstructions,
    rememberAssistantInlineInstruction,
} from "./state";

interface IAssistantInlineCommandOptions {
    protyle: IProtyle;
    range?: Range | null;
    fallbackSelectionText?: string;
}

const inlineDefinition: IAssistantSkillDefinition = {
    id: "selection-rewrite",
    placement: "selection",
    label: assistantText("内联指令", "Inline Instruction"),
    shortLabel: assistantText("内联指令", "Inline"),
    description: assistantText("按自然语言指令改写当前选区。", "Rewrite the current selection with a natural-language instruction."),
    output: "plain-text",
    action: "replace-selection",
    requiresNote: true,
    requiresSelection: true,
    buildMessage: () => "",
};

const resolveInlineContext = async (options: IAssistantInlineCommandOptions): Promise<IAssistantSkillContext | null> => {
    const range = options.range?.cloneRange() || (getSelection().rangeCount > 0 ? getSelection().getRangeAt(0).cloneRange() : null);
    const note = await getNoteContextFromProtyle(options.protyle, range, options.fallbackSelectionText || "");
    if (!note) {
        return null;
    }
    const selectedText = `${note.selectedText || options.fallbackSelectionText || range?.toString() || ""}`.trim();
    return {
        note,
        protyle: options.protyle,
        range,
        hasSelection: !!selectedText,
        selectedText,
    };
};

const buildInlineInstructionMessage = (instruction: string, context: IAssistantSkillContext) => {
    return assistantText(
        `请严格按下面的自然语言指令改写选中文本。保持事实不变，除非指令明确要求补充；直接输出改写后的文本，不要解释。\n\n指令：${instruction}\n\n选中文本：\n\`\`\`text\n${context.selectedText.trim()}\n\`\`\``,
        `Rewrite the selected text strictly according to this natural-language instruction. Preserve facts unless the instruction explicitly asks for additions. Return only the rewritten text with no explanation.\n\nInstruction: ${instruction}\n\nSelected text:\n\`\`\`text\n${context.selectedText.trim()}\n\`\`\``
    );
};

export const runAssistantInlineInstruction = async (options: IAssistantInlineCommandOptions, instructionText: string) => {
    const instruction = normalizeAssistantInlineInstruction(instructionText);
    if (!instruction) {
        showMessage(assistantText("请输入内联指令", "Enter an inline instruction"), 4000, "error");
        return false;
    }
    const context = await resolveInlineContext(options);
    if (!context?.note) {
        showMessage(assistantText("请先打开一个笔记", "Open a note first"), 4000, "error");
        return false;
    }
    if (!context.hasSelection) {
        showMessage(assistantText("请先选中要处理的内容", "Select the content to edit first"), 4000, "error");
        return false;
    }
    const roundKey = buildAssistantInlineRoundKey(context.note.rootID, context.note.currentBlockID || "", context.selectedText);
    const round = claimAssistantInlineRound(roundKey);
    if (!round.ok) {
        showMessage(assistantText("当前选区已连续调整 3 轮，请先接受或重新选择内容。", "This selection has already been refined 3 times. Accept it or select content again."), 5000, "error");
        return false;
    }
    const profile = await getAssistantAIDefaultProfile();
    if (!profile) {
        showMessage(assistantText("请先配置至少一个 AI 模型", "Configure at least one AI profile first"), 5000, "error");
        return false;
    }
    rememberAssistantInlineInstruction(instruction);
    const ghostDraft = createAssistantGhostDraft(inlineDefinition, context);
    try {
        let partialReply = "";
        const result = await streamAssistantAI({
            profileId: profile.id,
            mode: "chat",
            title: truncateText(`${assistantText("内联指令", "Inline")} ${context.note.title || ""}`, 72),
            message: buildInlineInstructionMessage(instruction, context),
            system: buildAssistantNoteContextForSkill(context.note, "selection-rewrite"),
            enableTools: false,
            context: context.note,
        }, {
            onDelta: (delta) => {
                partialReply += delta;
                ghostDraft?.update(partialReply);
            },
        });
        if (ghostDraft?.isCanceled()) {
            showMessage(assistantText("AI 临时草稿已取消", "AI ghost draft canceled"));
            return false;
        }
        const reply = [...result.messages].reverse().find((item) => item.role === "assistant")?.content?.trim() || "";
        if (!reply) {
            ghostDraft?.destroy();
            showMessage(assistantText("AI 没有返回可用结果", "The AI did not return a usable result"), 4000, "error");
            return false;
        }
        const patch = buildAssistantPatchFromSkillResult(inlineDefinition, context, reply);
        if (!patch) {
            ghostDraft?.destroy();
            showMessage(assistantText("没有生成可审阅修改", "No reviewable edit was generated"), 4000, "error");
            return false;
        }
        ghostDraft?.markReviewing();
        openAssistantPatchReviewDialog({
            patch,
            context,
            title: assistantText("内联指令修改", "Inline Edit"),
            subtitle: `${context.note.title || assistantText("当前笔记", "Current note")} · ${instruction}`,
            sessionId: result.session.id,
            onContinue: () => openAssistantInlineCommandPanel({
                ...options,
                fallbackSelectionText: context.selectedText,
            }),
        });
        ghostDraft?.destroy();
        return true;
    } catch (error) {
        ghostDraft?.destroy();
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        return false;
    }
};

export const openAssistantInlineCommandPanel = (options: IAssistantInlineCommandOptions) => {
    const recent = readAssistantInlineRecentInstructions();
    const dialog = new Dialog({
        title: assistantText("内联指令", "Inline Instruction"),
        width: "520px",
        height: "320px",
        content: `<div class="assistant-inline fn__flex-column">
    <textarea class="b3-text-field assistant-inline__input" data-role="assistant-inline-input" placeholder="${escapeAttr(assistantText("例如：更简洁、翻译成英文、改成列表、加一个例子", "For example: make it shorter, translate to English, turn into a list, add an example"))}"></textarea>
    ${recent.length ? `<div class="assistant-inline__recent">${recent.map((item) => `<button type="button" class="assistant-inline__recent-item" data-instruction="${escapeAttr(item)}">${escapeHTML(item)}</button>`).join("")}</div>` : ""}
    <div class="assistant-inline__actions">
        <button type="button" class="b3-button b3-button--outline" data-action="close">${escapeHTML(window.sourceflow.languages.close)}</button>
        <button type="button" class="b3-button b3-button--text" data-action="run-inline">${escapeHTML(assistantText("生成修改", "Generate edit"))}</button>
    </div>
</div>`,
    });
    const input = dialog.element.querySelector("[data-role='assistant-inline-input']") as HTMLTextAreaElement;
    const run = async () => {
        const instruction = input.value;
        dialog.destroy();
        await runAssistantInlineInstruction(options, instruction);
    };
    dialog.element.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        const recentInstruction = target.getAttribute("data-instruction");
        if (recentInstruction) {
            input.value = recentInstruction;
            input.focus();
            event.preventDefault();
            return;
        }
        const action = target.getAttribute("data-action");
        if (action === "run-inline") {
            void run();
            event.preventDefault();
            return;
        }
        if (action === "close") {
            dialog.destroy();
            event.preventDefault();
        }
    });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            void run();
        }
        if (event.key === "Escape") {
            event.preventDefault();
            dialog.destroy();
        }
    });
    window.setTimeout(() => input.focus(), 32);
    return true;
};
