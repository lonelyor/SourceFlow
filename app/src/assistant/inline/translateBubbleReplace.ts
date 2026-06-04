import {hasClosestBlock} from "../../protyle/util/hasClosest";
import {assistantText} from "../constants";
import type {ICurrentNoteContext} from "../common/note";
import {createAssistantPatchID} from "../patch/build";
import {openAssistantPatchReviewDialog} from "../patch/dialog";
import type {IAssistantSkillContext} from "../skills/types";
import type {IAssistantEditPatch} from "../patch/types";

interface IReplaceSelectionOptions {
    protyle: IProtyle;
    note: ICurrentNoteContext;
    range?: Range | null;
    selectedText: string;
}

export const replaceCurrentSelection = async (options: IReplaceSelectionOptions, translation: string) => {
    const selection = getSelection();
    const range = options.range || (selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null);
    const block = range ? hasClosestBlock(range.startContainer) as HTMLElement | null : null;
    const blockID = block?.getAttribute("data-node-id") || options.note.currentBlockID || "";
    const before = `${options.selectedText || options.note.selectedText || ""}`.trim();
    const after = `${translation || ""}`.trim();
    if (!blockID || !before || !after) {
        return false;
    }
    const context: IAssistantSkillContext = {
        note: options.note,
        protyle: options.protyle,
        range,
        hasSelection: true,
        selectedText: before,
    };
    const patch: IAssistantEditPatch = {
        id: createAssistantPatchID("patch"),
        skillId: "selection-translate",
        source: "skill",
        target: "selection",
        risk: "L3",
        summary: assistantText("翻译选区替换", "Translate selection replacement"),
        operations: [{
            id: createAssistantPatchID("op"),
            type: "replace-selection",
            targetId: blockID,
            targetLabel: assistantText("当前选区", "Current selection"),
            before,
            after,
            reason: assistantText("用 AI 翻译结果替换当前选区。", "Replace the current selection with the AI translation."),
            status: "pending",
        }],
        createdAt: Date.now(),
    };
    openAssistantPatchReviewDialog({
        patch,
        context,
        title: assistantText("翻译选中内容", "Translate Selection"),
    });
    return true;
};
