import {IWorkbenchItem, WorkbenchAttr} from "./constants";
import {
    IWorkbenchRule,
    getState,
    splitWorkbenchTags,
} from "./dialogShared";

export const matchWorkbenchRule = (rule: IWorkbenchRule, item: Partial<IWorkbenchItem>) => {
    if (rule.enabled === false) {
        return false;
    }
    if (rule.matchKind !== "*" && (item.entityKind || "doc") !== rule.matchKind) {
        return false;
    }
    if (rule.matchType !== "*" && item.type !== rule.matchType) {
        return false;
    }
    if (rule.inbox && `${!!item.inbox}` !== rule.inbox) {
        return false;
    }
    if (rule.titleIncludes && !(item.title || "").toLowerCase().includes(rule.titleIncludes.toLowerCase())) {
        return false;
    }
    if (rule.notebookIncludes && !(item.notebook || "").toLowerCase().includes(rule.notebookIncludes.toLowerCase())) {
        return false;
    }
    if (rule.projectIncludes && !(item.project || "").toLowerCase().includes(rule.projectIncludes.toLowerCase())) {
        return false;
    }
    if (rule.tagIncludes) {
        const tags = (item.tags || []).map((tag) => `${tag}`.toLowerCase());
        if (!tags.some((tag) => tag.includes(rule.tagIncludes.toLowerCase()))) {
            return false;
        }
    }
    return true;
};

export const applyWorkbenchRulesToAttrs = (item: Partial<IWorkbenchItem>, attrs: Record<string, string | null>) => {
    const state = getState();
    if (!state.rules.length) {
        return attrs;
    }
    const nextAttrs = {...attrs};
    const currentType = `${nextAttrs[WorkbenchAttr.type] || item.type || "note"}`.trim() as IWorkbenchItem["type"];
    const currentProject = `${nextAttrs[WorkbenchAttr.project] || item.project || ""}`.trim();
    const currentTags = splitWorkbenchTags(`${nextAttrs.tags || (item.tags || []).join(",")}`);
    const currentInbox = `${nextAttrs[WorkbenchAttr.inbox] == null ? `${!!item.inbox}` : nextAttrs[WorkbenchAttr.inbox]}`;
    const candidate: Partial<IWorkbenchItem> = {
        ...item,
        type: currentType,
        project: currentProject,
        tags: currentTags,
        inbox: currentInbox === "true",
    };
    state.rules.forEach((rule) => {
        if (!matchWorkbenchRule(rule, candidate)) {
            return;
        }
        Object.entries(rule.actions || {}).forEach(([key, value]) => {
            if (value == null || `${value}`.trim() === "") {
                return;
            }
            if (nextAttrs[key] != null && `${nextAttrs[key]}`.trim() !== "") {
                return;
            }
            nextAttrs[key] = `${value}`.trim();
        });
    });
    return nextAttrs;
};

export const getWorkbenchConversionAttrs = (targetType: IWorkbenchItem["type"]) => {
    const attrs: Record<string, string | null> = {
        [WorkbenchAttr.type]: targetType,
        [WorkbenchAttr.inbox]: "false",
    };
    switch (targetType) {
        case "task":
            attrs[WorkbenchAttr.status] = "todo";
            attrs[WorkbenchAttr.eventTime] = "";
            attrs[WorkbenchAttr.location] = "";
            break;
        case "event":
            attrs[WorkbenchAttr.status] = "scheduled";
            attrs[WorkbenchAttr.dueDate] = "";
            break;
        case "project":
            attrs[WorkbenchAttr.status] = "active";
            attrs[WorkbenchAttr.dueDate] = "";
            attrs[WorkbenchAttr.eventTime] = "";
            attrs[WorkbenchAttr.location] = "";
            break;
        default:
            attrs[WorkbenchAttr.status] = "open";
    }
    return attrs;
};
