import {assistantText} from "../constants";
import type {IAssistantSkillContext, IAssistantSkillDefinition} from "../skills/types";
import type {IAssistantEditPatch, IAssistantPatchOperation, TAssistantPatchRisk, TAssistantPatchTarget} from "./types";

const patchableSkillActions = new Set(["replace-selection", "insert-below", "append-note"]);

const createAssistantPatchID = (prefix: string) => {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const isAssistantPatchableSkill = (definition: IAssistantSkillDefinition) => {
    return patchableSkillActions.has(definition.action);
};

const resolvePatchRisk = (definition: IAssistantSkillDefinition): TAssistantPatchRisk => {
    if (definition.action === "replace-selection") {
        return "L3";
    }
    return "L2";
};

const resolvePatchTarget = (definition: IAssistantSkillDefinition): TAssistantPatchTarget => {
    if (definition.action === "replace-selection") {
        return "selection";
    }
    if (definition.action === "append-note") {
        return "note";
    }
    return "block";
};

const buildPatchSummary = (definition: IAssistantSkillDefinition, result: string) => {
    const firstLine = `${result || ""}`.trim().split(/\r?\n/).find((line) => line.trim()) || "";
    const suffix = firstLine ? `：${firstLine.slice(0, 80)}` : "";
    return `${definition.shortLabel}${suffix}`;
};

export const buildAssistantPatchFromSkillResult = (
    definition: IAssistantSkillDefinition,
    context: IAssistantSkillContext,
    result: string,
): IAssistantEditPatch | null => {
    const after = `${result || ""}`.trim();
    if (!after || !context.note || !isAssistantPatchableSkill(definition)) {
        return null;
    }

    const operation: IAssistantPatchOperation = {
        id: createAssistantPatchID("op"),
        type: "insert-after-block",
        targetId: context.note.currentBlockID || context.note.rootID,
        targetLabel: context.note.currentBlockID && context.note.currentBlockID !== context.note.rootID
            ? assistantText("当前块", "Current block")
            : assistantText("当前笔记末尾", "End of current note"),
        after,
        reason: definition.description,
        status: "pending",
    };
    if (definition.action === "replace-selection") {
        operation.type = "replace-selection";
        operation.targetId = context.note.currentBlockID || context.note.rootID;
        operation.targetLabel = assistantText("当前选区", "Current selection");
        operation.before = context.selectedText || context.note.selectedText || "";
    } else if (definition.action === "append-note") {
        operation.type = "append-note";
        operation.targetId = context.note.rootID;
        operation.targetLabel = context.note.title || assistantText("当前笔记", "Current note");
    }

    return {
        id: createAssistantPatchID("patch"),
        skillId: definition.id,
        source: "skill",
        target: resolvePatchTarget(definition),
        risk: resolvePatchRisk(definition),
        summary: buildPatchSummary(definition, after),
        operations: [operation],
        createdAt: Date.now(),
    };
};
