export type TAssistantPatchSource = "skill" | "dock" | "agent" | "automation" | "tool";

export type TAssistantPatchTarget = "selection" | "block" | "note" | "notebook" | "workspace";

export type TAssistantPatchRisk = "L1" | "L2" | "L3" | "L4";

export type TAssistantPatchOperationType =
    | "insert-after-block"
    | "replace-selection"
    | "replace-block"
    | "append-note"
    | "create-note"
    | "create-child-note"
    | "move-note"
    | "rename-note"
    | "set-attrs"
    | "delete-block";

export type TAssistantPatchOperationStatus = "pending" | "accepted" | "rejected";

export interface IAssistantPatchOperation {
    id: string;
    type: TAssistantPatchOperationType;
    targetId?: string;
    targetLabel?: string;
    before?: string;
    after?: string;
    attrs?: Record<string, string | null>;
    reason?: string;
    status?: TAssistantPatchOperationStatus;
    appliedTargetId?: string;
}

export interface IAssistantEditPatch {
    id: string;
    skillId?: string;
    toolId?: string;
    source: TAssistantPatchSource;
    target: TAssistantPatchTarget;
    risk: TAssistantPatchRisk;
    summary: string;
    operations: IAssistantPatchOperation[];
    createdAt: number;
}
