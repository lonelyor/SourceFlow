import {assistantText} from "../constants";
import type {IAssistantSkillContext, IAssistantSkillDefinition} from "../skills/types";
import type {
    IAssistantEditPatch,
    IAssistantPatchOperation,
    TAssistantPatchOperationType,
    TAssistantPatchRisk,
    TAssistantPatchTarget
} from "./types";

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

const stripAssistantPatchFence = (value: string) => {
    const trimmed = `${value || ""}`.trim();
    const fenced = trimmed.match(/^```(?:json|assistant-patch)?\s*([\s\S]*?)\s*```$/i);
    if (fenced?.[1]) {
        return fenced[1].trim();
    }
    return trimmed;
};

const parseAssistantPatchEnvelope = (value: string) => {
    const normalized = stripAssistantPatchFence(value);
    const candidates = [normalized];
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start > -1 && end > start) {
        candidates.push(normalized.slice(start, end + 1));
    }
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object" && Array.isArray(parsed.operations)) {
                return parsed as Record<string, unknown>;
            }
        } catch (_error) {
            // Continue trying the next candidate.
        }
    }
    return null;
};

const allowedPatchOperationTypes = new Set<TAssistantPatchOperationType>([
    "insert-after-block",
    "replace-selection",
    "replace-block",
    "append-note",
    "create-note",
    "create-child-note",
    "move-note",
    "rename-note",
    "set-attrs",
    "delete-block",
]);

const normalizeAssistantPatchOperationType = (value: unknown): TAssistantPatchOperationType | null => {
    const type = `${value || ""}`.trim() as TAssistantPatchOperationType;
    return allowedPatchOperationTypes.has(type) ? type : null;
};

const buildStructuredAssistantPatch = (
    definition: IAssistantSkillDefinition,
    context: IAssistantSkillContext,
    result: string,
): IAssistantEditPatch | null => {
    const envelope = parseAssistantPatchEnvelope(result);
    if (!envelope || !context.note) {
        return null;
    }
    const operations = (envelope.operations as unknown[]).map((item, index) => {
        if (!item || typeof item !== "object") {
            return null;
        }
        const raw = item as Record<string, unknown>;
        const type = normalizeAssistantPatchOperationType(raw.type);
        const after = `${raw.after ?? raw.markdown ?? raw.content ?? raw.text ?? ""}`.trim();
        const before = `${raw.before ?? ""}`.trim();
        const attrs = raw.attrs && typeof raw.attrs === "object" && !Array.isArray(raw.attrs)
            ? raw.attrs as Record<string, string | null>
            : undefined;
        if (!type || (!after && type !== "delete-block" && type !== "set-attrs")) {
            return null;
        }
        if (type === "set-attrs" && (!attrs || !Object.keys(attrs).length)) {
            return null;
        }
        const defaultTarget = type === "append-note" || type === "create-child-note"
            ? context.note?.rootID
            : (context.note?.currentBlockID || context.note?.rootID);
        return {
            id: `${raw.id || createAssistantPatchID(`op-${index + 1}`)}`,
            type,
            targetId: `${raw.targetId || raw.id || defaultTarget || ""}`.trim(),
            targetLabel: `${raw.targetLabel || ""}`.trim(),
            before,
            after,
            attrs,
            reason: `${raw.reason || ""}`.trim(),
            status: "pending",
        } as IAssistantPatchOperation;
    }).filter(Boolean) as IAssistantPatchOperation[];
    if (!operations.length) {
        return null;
    }
    const risk = operations.some((operation) => operation.type === "replace-block" || operation.type === "delete-block")
        ? "L3"
        : "L2";
    return {
        id: `${envelope.id || createAssistantPatchID("patch")}`,
        skillId: definition.id,
        source: "skill",
        target: `${envelope.target || "note"}` as TAssistantPatchTarget,
        risk,
        summary: `${envelope.summary || buildPatchSummary(definition, result)}`.trim(),
        operations,
        createdAt: Date.now(),
    };
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
    const structuredPatch = buildStructuredAssistantPatch(definition, context, result);
    if (structuredPatch) {
        return structuredPatch;
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
