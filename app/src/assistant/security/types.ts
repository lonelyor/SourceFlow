export type TSecurityMode = "default" | "autoReview" | "fullAccess";
export type TSecurityRisk = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";
export type TSecurityDecision = "allow" | "confirm" | "deny";
export type TSecurityCapability = "read" | "write" | "execute" | "create" | "deleteBlock" | "deleteNote" | "move";

export interface ISecurityRule {
    type: "notebook" | "folder" | "note" | "tag" | "assetType" | "toolType";
    id: string;
    name?: string;
}

export interface ISecurityCapabilities {
    read: boolean;
    write: boolean;
    execute: boolean;
    create: boolean;
    deleteBlock: boolean;
    deleteNote: boolean;
    move: boolean;
}

export interface ISecurityConfig {
    defaultMode: TSecurityMode;
    blacklist: ISecurityRule[];
    whitelist: ISecurityRule[];
    capabilities: ISecurityCapabilities;
    batchThreshold: number;
}

export interface ISecurityPermissionResult {
    decision: TSecurityDecision;
    reason?: string;
    escalatable?: boolean;
    affectedItems?: Array<{id: string; title?: string; path?: string; risk: string}>;
}
