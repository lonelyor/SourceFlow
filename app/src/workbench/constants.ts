export type TWorkbenchType = "doc" | "note" | "url" | "task" | "event" | "project" | "attachment";
export type TWorkbenchTab = "inbox" | "library" | "task" | "calendar" | "project" | "review";

export const WorkbenchAttr = {
    type: "custom-workbench-type",
    status: "custom-workbench-status",
    inbox: "custom-workbench-inbox",
    project: "custom-workbench-project",
    dueDate: "custom-workbench-due-date",
    eventTime: "custom-workbench-event-time",
    location: "custom-workbench-location",
    sourceURL: "custom-workbench-source-url",
    capturedAt: "custom-workbench-captured-at",
    title: "custom-workbench-title",
    goal: "custom-workbench-goal",
    nextStep: "custom-workbench-next-step",
};

export interface IWorkbenchItem {
    id: string;
    entityKind?: "doc" | "block";
    rootID?: string;
    parentID?: string;
    box: string;
    notebook: string;
    path: string;
    hPath: string;
    title: string;
    preview: string;
    type: TWorkbenchType;
    status: string;
    project: string;
    dueDate: string;
    eventTime: string;
    location: string;
    sourceURL: string;
    capturedAt: string;
    goal: string;
    nextStep: string;
    tags: string[];
    inbox: boolean;
    created: string;
    updated: string;
    createdAt: number;
    updatedAt: number;
    dueAt: number;
    eventAt: number;
    capturedTs: number;
    refCount: number;
    assetCount: number;
    subFileCount: number;
    hasBoundView: boolean;
}
