import {App} from "../../index";
import {openSettingTab} from "../../config";
import {Custom} from "../../layout/dock/Custom";
import {getDockByType} from "../../layout/tabUtil";
import {confirmDialog} from "../../dialog/confirmDialog";
import {showMessage} from "../../dialog/message";
import {assistantText, ASSISTANT_AI_DOCK_TYPE, ASSISTANT_ANALYZE_PROMPT, buildAssistantNoteContext} from "../constants";
import {escapeAttr, escapeHTML, formatDateTime, nl2br, panelEmptyHTML, providerDisplayName, truncateText} from "../common/dom";
import {
    appendMarkdownToCurrentNote,
    formatTranscriptMarkdown,
    getAssistantNoteContextByRootID,
    getCurrentNoteContext,
    IAssistantNoteCandidate,
    saveMarkdownAsAssistantNote,
    searchAssistantNoteCandidates,
} from "../common/note";
import {
    analyzeAssistantAISession,
    clearAllAssistantAISessions,
    clearAssistantAISession,
    createAssistantAISession,
    deleteAssistantAISession,
    getAssistantAISessionMessages,
    IAssistantAIInputAttachment,
    IAssistantAIMessage,
    IAssistantAIProfile,
    IAssistantAIProviderType,
    IAssistantAISession,
    IAssistantAIToolAudit,
    IAssistantAIToolDefinition,
    IAssistantAIToolPolicy,
    listAssistantAIProfiles,
    listAssistantAIProviders,
    listAssistantAISessions,
    listAssistantAIToolAudits,
    getAssistantAIToolCatalog,
    confirmAssistantAITool,
    editAssistantAIMessageStream,
    renameAssistantAISession,
    saveAssistantAIProfile,
    streamAssistantAI,
} from "./api";
import {writeText} from "../../protyle/util/compatibility";

export type TAssistantAIMessageItem = IAssistantAIMessage & {
    localPending?: boolean;
    localError?: boolean;
};

export type TAssistantAIFloatingPanel = "" | "target" | "context" | "audit" | "profiles" | "tools" | "session";

export const assistantAIToolReadScopeOptions = [
    {value: "current-note", label: assistantText("当前笔记", "Current note")},
    {value: "current-notebook", label: assistantText("当前笔记本", "Current notebook")},
    {value: "workspace", label: assistantText("整个工作区", "Workspace")},
];

export const assistantAIToolWriteScopeOptions = [
    {value: "current-note", label: assistantText("仅当前笔记", "Current note only")},
    {value: "current-notebook", label: assistantText("当前笔记本", "Current notebook")},
    {value: "workspace", label: assistantText("整个工作区", "Workspace")},
];

export const assistantAIToolTraceOptions = [
    {value: "audit-only", label: assistantText("仅内部审计", "Audit only")},
    {value: "markdown", label: assistantText("正文留痕 + 审计", "Markdown trace + audit")},
];

export const assistantAIToolRiskOrder = ["L1", "L2", "L3", "L4"];
export const assistantAIComposerAttachmentLimit = 6;
export const assistantAIComposerAttachmentMaxBytes = 8 * 1024 * 1024;
export const assistantAIMessageCollapseCharLimit = 220;
export const assistantAIMessageCollapseLineLimit = 6;

export const renderSelectOptions = (options: Array<{value: string, label: string}>, selected: string) => {
    return options.map((item) => `<option value="${escapeAttr(item.value)}"${item.value === selected ? " selected" : ""}>${escapeHTML(item.label)}</option>`).join("");
};

export const readAssistantAIImageFile = (file: File) => {
    return new Promise<IAssistantAIInputAttachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataURL = `${reader.result || ""}`;
            const commaIndex = dataURL.indexOf(",");
            resolve({
                id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: file.name || "image",
                mimeType: file.type || "image/png",
                data: commaIndex > -1 ? dataURL.slice(commaIndex + 1) : dataURL,
            });
        };
        reader.onerror = () => {
            reject(reader.error || new Error(assistantText("读取图片失败", "Failed to read the image")));
        };
        reader.readAsDataURL(file);
    });
};

export const getAssistantAIAttachmentDataURL = (attachment: IAssistantAIInputAttachment) => {
    return `data:${attachment.mimeType};base64,${attachment.data}`;
};

export const getImageFilesFromDataTransfer = (dataTransfer: DataTransfer | null | undefined) => {
    if (!dataTransfer?.files?.length) {
        return [] as File[];
    }
    return Array.from(dataTransfer.files).filter((file) => file.type.startsWith("image/"));
};

export const getStringSetting = (settings: Record<string, unknown> | undefined, key: string, fallback: string) => {
    const raw = settings?.[key];
    const value = `${raw ?? ""}`.trim();
    return value || fallback;
};

export const cloneToolModes = (settings?: Record<string, unknown>) => {
    const raw = settings?.toolModes;
    if (!raw || typeof raw !== "object") {
        return {};
    }
    return {...(raw as Record<string, string>)};
};

export const cloneProfileToolSettings = (settings?: Record<string, unknown>) => {
    return {
        ...settings,
        toolReadScope: getStringSetting(settings, "toolReadScope", "workspace"),
        toolWriteScope: getStringSetting(settings, "toolWriteScope", "current-notebook"),
        toolTraceMode: getStringSetting(settings, "toolTraceMode", "audit-only"),
        toolModes: cloneToolModes(settings),
    };
};

export const getToolRiskLabel = (risk: string) => {
    switch (risk) {
        case "L1":
            return assistantText("L1 只读", "L1 Read only");
        case "L2":
            return assistantText("L2 低风险写入", "L2 Low-risk write");
        case "L3":
            return assistantText("L3 中风险写入", "L3 Medium-risk write");
        case "L4":
            return assistantText("L4 高风险操作", "L4 High-risk action");
        default:
            return risk;
    }
};

export const getToolTargetLabel = (target: string) => {
    switch (target) {
        case "current-note":
            return assistantText("当前笔记", "Current note");
        case "current-notebook":
            return assistantText("当前笔记本", "Current notebook");
        case "workspace":
            return assistantText("工作区", "Workspace");
        default:
            return target;
    }
};
