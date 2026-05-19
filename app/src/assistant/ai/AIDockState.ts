import {openSettingTab} from "../../config";
import {confirmDialog} from "../../dialog/confirmDialog";
import {showMessage} from "../../dialog/message";
import {assistantText} from "../constants";
import {
    getAssistantNoteContextByRootID,
    getCurrentNoteContext,
    searchAssistantNoteCandidates,
} from "../common/note";
import {
    clearAllAssistantAISessions,
    clearAssistantAISession,
    createAssistantAISession,
    deleteAssistantAISession,
    getAssistantAISessionMessages,
    getAssistantAIToolCatalog,
    IAssistantAIProfile,
    IAssistantAISession,
    IAssistantAIToolDefinition,
    listAssistantAIProfiles,
    listAssistantAIProviders,
    listAssistantAISessions,
    listAssistantAIToolAudits,
    renameAssistantAISession,
    saveAssistantAIProfile,
} from "./api";
import type {IAssistantAIDockRuntime, IAssistantAINotePreview, TAssistantAIToolPolicyPreset} from "./AIDockContract";
import {cloneProfileToolSettings, cloneToolModes} from "./AIDockShared";

export const resolveAIDockMessageContext = async (ctx: IAssistantAIDockRuntime): Promise<IAssistantAINotePreview | null> => {
    if (!ctx.includeCurrentNote) {
        return null;
    }
    if (ctx.pinnedNotePreview?.rootID) {
        const refreshed = await getAssistantNoteContextByRootID(ctx.pinnedNotePreview.rootID);
        if (refreshed) {
            ctx.pinnedNotePreview = refreshed;
            return refreshed;
        }
        return ctx.pinnedNotePreview;
    }
    const current = await getCurrentNoteContext();
    if (current) {
        ctx.currentNotePreview = current;
    }
    return current;
};

export const pinAIDockCurrentNoteAsTarget = async (ctx: IAssistantAIDockRuntime) => {
    const current = await getCurrentNoteContext() || ctx.currentNotePreview;
    if (!current) {
        showMessage(assistantText("当前没有可固定的活动笔记", "No active note is available to pin"), 3000, "error");
        return;
    }
    ctx.includeCurrentNote = true;
    ctx.currentNotePreview = current;
    ctx.pinnedNotePreview = current;
    ctx.noteSearchKeyword = "";
    ctx.noteSearchResults = [];
    ctx.noteSearchLoading = false;
    ctx.activePanel = "";
    ctx.render();
};

export const resetAIDockTargetSelection = (ctx: IAssistantAIDockRuntime, includeCurrentNote: boolean) => {
    ctx.includeCurrentNote = includeCurrentNote;
    ctx.pinnedNotePreview = null;
    ctx.noteSearchKeyword = "";
    ctx.noteSearchResults = [];
    ctx.noteSearchLoading = false;
};

export const followAIDockCurrentNote = async (ctx: IAssistantAIDockRuntime) => {
    ctx.resetTargetSelection(true);
    ctx.activePanel = "";
    await ctx.refreshContextPreview();
};

export const clearAIDockTargetNote = (ctx: IAssistantAIDockRuntime) => {
    ctx.resetTargetSelection(false);
    ctx.activePanel = "";
    ctx.render();
};

export const toggleAIDockFloatingPanel = (ctx: IAssistantAIDockRuntime, panel: IAssistantAIDockRuntime["activePanel"]) => {
    ctx.sessionsCollapsed = true;
    ctx.activePanel = ctx.activePanel === panel ? "" : panel;
    ctx.render();
};

export const getSelectedAIDockProfileToolSettings = (ctx: IAssistantAIDockRuntime, profile = ctx.getSelectedProfile()) => {
    return cloneProfileToolSettings(profile?.settings as Record<string, unknown> | undefined);
};

export const getAIDockDefaultToolMode = (_ctx: IAssistantAIDockRuntime, tool: IAssistantAIToolDefinition) => {
    if (tool.category === "read" || tool.risk === "L1") {
        return "auto";
    }
    return "confirm";
};

export const saveSelectedAIDockProfileSettings = async (
    ctx: IAssistantAIDockRuntime,
    mutator: (settings: Record<string, unknown>, profile: IAssistantAIProfile) => void,
) => {
    const profile = ctx.getSelectedProfile();
    if (!profile || ctx.savingProfile) {
        return;
    }
    const settings = ctx.getSelectedProfileToolSettings(profile);
    mutator(settings, profile);
    ctx.savingProfile = true;
    ctx.render();
    try {
        const saved = await saveAssistantAIProfile({
            ...profile,
            settings,
        });
        ctx.profiles = ctx.profiles.map((item) => item.id === saved.id ? saved : item);
        ctx.selectedProfileId = saved.id;
        await ctx.refreshToolCatalog(saved.id);
    } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    } finally {
        ctx.savingProfile = false;
        ctx.render();
    }
};

export const updateAIDockToolPolicyField = async (ctx: IAssistantAIDockRuntime, field: string, value: string) => {
    await ctx.saveSelectedProfileSettings((settings) => {
        settings[field] = value;
    });
};

export const toggleAIDockToolEnabled = async (ctx: IAssistantAIDockRuntime, toolId: string, enabled: boolean) => {
    const tool = ctx.toolCatalog.find((item) => item.id === toolId);
    if (!tool) {
        return;
    }
    await ctx.saveSelectedProfileSettings((settings) => {
        const toolModes = cloneToolModes(settings);
        toolModes[toolId] = enabled
            ? (toolModes[toolId] && toolModes[toolId] !== "deny" ? toolModes[toolId] : ctx.getDefaultToolMode(tool))
            : "deny";
        settings.toolModes = toolModes;
    });
};

export const applyAIDockToolPolicyPreset = async (ctx: IAssistantAIDockRuntime, mode: TAssistantAIToolPolicyPreset) => {
    await ctx.saveSelectedProfileSettings((settings) => {
        const toolModes: Record<string, string> = {};
        ctx.toolCatalog.forEach((tool) => {
            if (mode === "readonly") {
                toolModes[tool.id] = tool.category === "read" ? "auto" : "deny";
                return;
            }
            if (mode === "confirm-write") {
                toolModes[tool.id] = tool.category === "read" ? "auto" : "confirm";
                return;
            }
            toolModes[tool.id] = ctx.getDefaultToolMode(tool);
            if (tool.risk === "L2") {
                toolModes[tool.id] = "confirm";
            } else if (tool.risk === "L3" || tool.risk === "L4") {
                toolModes[tool.id] = "deny";
            }
        });
        settings.toolModes = toolModes;
    });
};

export const switchAIDockProfile = async (ctx: IAssistantAIDockRuntime, profileId: string) => {
    if (!profileId) {
        return;
    }
    if (profileId === ctx.selectedProfileId) {
        ctx.activePanel = "";
        ctx.render();
        ctx.focusComposer();
        return;
    }
    ctx.selectedProfileId = profileId;
    ctx.selectedSessionId = "";
    ctx.messages = [];
    ctx.activePanel = "";
    await ctx.refreshToolCatalog(profileId);
    void ctx.refreshAudits();
    ctx.render();
    ctx.focusComposer();
};

export const searchAIDockTargetNotes = async (ctx: IAssistantAIDockRuntime, keyword: string) => {
    const normalizedKeyword = `${keyword || ""}`.trim();
    const currentSeq = ++ctx.noteSearchSeq;
    if (!normalizedKeyword) {
        ctx.noteSearchLoading = false;
        ctx.noteSearchResults = [];
        ctx.render();
        return;
    }
    ctx.noteSearchLoading = true;
    ctx.render();
    try {
        const results = await searchAssistantNoteCandidates(normalizedKeyword, 12);
        if (currentSeq !== ctx.noteSearchSeq) {
            return;
        }
        ctx.noteSearchResults = results;
    } catch (error) {
        if (currentSeq !== ctx.noteSearchSeq) {
            return;
        }
        ctx.noteSearchResults = [];
    } finally {
        if (currentSeq === ctx.noteSearchSeq) {
            ctx.noteSearchLoading = false;
            ctx.render();
        }
    }
};

export const selectAIDockTargetNote = async (ctx: IAssistantAIDockRuntime, rootID: string) => {
    const note = await getAssistantNoteContextByRootID(rootID);
    if (!note) {
        showMessage(assistantText("读取目标笔记失败，请重试", "Failed to read the target note"), 3000, "error");
        return;
    }
    ctx.includeCurrentNote = true;
    ctx.pinnedNotePreview = note;
    ctx.noteSearchKeyword = "";
    ctx.noteSearchResults = [];
    ctx.noteSearchLoading = false;
    ctx.activePanel = "";
    ctx.render();
};

export const refreshAIDock = async (ctx: IAssistantAIDockRuntime, loadMessages: boolean) => {
    ctx.loading = true;
    ctx.render();
    try {
        const [providers, profiles, sessions] = await Promise.all([
            listAssistantAIProviders(),
            listAssistantAIProfiles(),
            listAssistantAISessions(),
        ]);
        ctx.providers = providers;
        ctx.profiles = profiles;
        ctx.sessions = sessions;
        ctx.ensureSelection();
        await Promise.all([
            ctx.refreshToolCatalog(ctx.selectedProfileId),
            ctx.refreshAudits(),
        ]);
        if (loadMessages && ctx.selectedSessionId) {
            ctx.messages = await getAssistantAISessionMessages(ctx.selectedSessionId);
        } else if (!ctx.selectedSessionId) {
            ctx.messages = [];
        }
        ctx.syncEditingMessageState();
    } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    } finally {
        ctx.loading = false;
        ctx.render();
        ctx.scrollToBottom();
    }
};

export const ensureAIDockSelection = (ctx: IAssistantAIDockRuntime) => {
    if (!ctx.profiles.length) {
        ctx.selectedProfileId = "";
        ctx.selectedSessionId = "";
        return;
    }
    const defaultProfile = ctx.profiles.find((item) => item.isDefault) || ctx.profiles[0];
    if (!ctx.selectedProfileId || !ctx.profiles.find((item) => item.id === ctx.selectedProfileId)) {
        ctx.selectedProfileId = defaultProfile?.id || "";
    }
    if (ctx.selectedSessionId) {
        const session = ctx.sessions.find((item) => item.id === ctx.selectedSessionId);
        if (session) {
            ctx.selectedProfileId = session.profileId || ctx.selectedProfileId;
            return;
        }
    }
    ctx.selectedSessionId = ctx.sessions[0]?.id || "";
    if (ctx.selectedSessionId) {
        ctx.selectedProfileId = ctx.sessions[0].profileId || ctx.selectedProfileId;
    }
};

export const getSelectedAIDockSession = (ctx: IAssistantAIDockRuntime) => {
    return ctx.sessions.find((item) => item.id === ctx.selectedSessionId);
};

export const getSelectedAIDockProfile = (ctx: IAssistantAIDockRuntime) => {
    const session = ctx.getSelectedSession();
    if (session?.profileId) {
        return ctx.profiles.find((item) => item.id === session.profileId) || ctx.profiles.find((item) => item.id === ctx.selectedProfileId);
    }
    return ctx.profiles.find((item) => item.id === ctx.selectedProfileId) || ctx.profiles[0];
};

export const selectAIDockSession = async (ctx: IAssistantAIDockRuntime, sessionId: string) => {
    if (!sessionId) {
        return;
    }
    if (sessionId === ctx.selectedSessionId) {
        if (!ctx.sessionsCollapsed) {
            ctx.sessionsCollapsed = true;
            ctx.activePanel = "";
            ctx.render();
        }
        return;
    }
    ctx.clearEditingMessage(false);
    ctx.selectedSessionId = sessionId;
    ctx.sessionsCollapsed = true;
    ctx.activePanel = "";
    const session = ctx.getSelectedSession();
    if (session?.profileId) {
        ctx.selectedProfileId = session.profileId;
    }
    ctx.render();
    try {
        const [messages] = await Promise.all([
            getAssistantAISessionMessages(sessionId),
            ctx.refreshToolCatalog(ctx.selectedProfileId),
            ctx.refreshAudits(),
        ]);
        ctx.messages = messages;
        ctx.syncEditingMessageState();
    } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    }
    ctx.render();
    ctx.scrollToBottom();
};

export const refreshAIDockToolCatalog = async (ctx: IAssistantAIDockRuntime, profileId: string) => {
    if (!profileId && !ctx.profiles.length) {
        ctx.toolCatalog = [];
        ctx.toolPolicy = null;
        return;
    }
    try {
        const catalog = await getAssistantAIToolCatalog(profileId || ctx.profiles.find((item) => item.isDefault)?.id || ctx.profiles[0]?.id || "");
        ctx.toolCatalog = catalog.tools || [];
        ctx.toolPolicy = catalog.policy || null;
    } catch (error) {
        ctx.toolCatalog = [];
        ctx.toolPolicy = null;
    }
    ctx.render();
};

export const refreshAIDockAudits = async (ctx: IAssistantAIDockRuntime) => {
    try {
        ctx.audits = await listAssistantAIToolAudits({
            sessionId: ctx.selectedSessionId,
            profileId: ctx.selectedProfileId,
            limit: 8,
        });
    } catch (error) {
        ctx.audits = [];
    }
    ctx.render();
};

export const refreshAIDockContextPreview = async (ctx: IAssistantAIDockRuntime) => {
    if (!ctx.includeCurrentNote) {
        ctx.render();
        return;
    }
    try {
        ctx.currentNotePreview = await getCurrentNoteContext();
    } catch (error) {
        ctx.currentNotePreview = null;
    }
    ctx.render();
};

export const createAIDockSession = async (ctx: IAssistantAIDockRuntime) => {
    const profile = ctx.profiles.find((item) => item.id === ctx.selectedProfileId) || ctx.profiles[0];
    if (!profile) {
        showMessage(assistantText("请先配置至少一个 AI 提供商", "Configure at least one AI profile first"), 5000, "error");
        ctx.activePanel = "";
        ctx.sessionsCollapsed = true;
        ctx.render();
        openSettingTab(ctx.app, "AI");
        return;
    }
    try {
        const session = await createAssistantAISession(profile.id, "chat", "");
        ctx.activePanel = "";
        ctx.sessionsCollapsed = true;
        ctx.selectedSessionId = session.id;
        ctx.selectedProfileId = profile.id;
        ctx.clearEditingMessage(false);
        ctx.messages = [];
        await ctx.refresh(false);
    } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    }
};

export const renameCurrentAIDockSession = async (ctx: IAssistantAIDockRuntime) => {
    const session = ctx.getSelectedSession();
    if (!session) {
        return;
    }
    const nextTitle = window.prompt(assistantText("重命名会话", "Rename session"), session.title || "")?.trim();
    if (!nextTitle || nextTitle === session.title) {
        return;
    }
    try {
        await renameAssistantAISession(session.id, nextTitle);
        await ctx.refresh(false);
    } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
    }
};

export const clearCurrentAIDockSession = async (ctx: IAssistantAIDockRuntime) => {
    const session = ctx.getSelectedSession();
    if (!session) {
        return;
    }
    confirmDialog(
        window.sourceflow.languages.clearAll || assistantText("清空", "Clear"),
        assistantText("清空当前会话中的全部消息？", "Clear all messages in the current session?"),
        async () => {
            try {
                await clearAssistantAISession(session.id);
                ctx.clearEditingMessage(false);
                ctx.messages = [];
                await ctx.refresh(false);
            } catch (error) {
                showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            }
        },
        true,
    );
};

export const deleteCurrentAIDockSession = async (ctx: IAssistantAIDockRuntime) => {
    const session = ctx.getSelectedSession();
    if (!session) {
        return;
    }
    confirmDialog(
        window.sourceflow.languages.deleteOpConfirm || assistantText("删除", "Delete"),
        assistantText("删除当前会话及其全部消息？", "Delete the current session and all messages?"),
        async () => {
            try {
                await deleteAssistantAISession(session.id);
                ctx.selectedSessionId = "";
                ctx.clearEditingMessage(false);
                ctx.messages = [];
                await ctx.refresh(false);
            } catch (error) {
                showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            }
        },
        true,
    );
};

export const clearAllAIDockSessions = async (ctx: IAssistantAIDockRuntime) => {
    if (!ctx.sessions.length) {
        return;
    }
    confirmDialog(
        window.sourceflow.languages.clearAll || assistantText("全部清空", "Clear all"),
        assistantText("清空全部 AI 会话？这个操作不可撤销。", "Clear all AI sessions? This cannot be undone."),
        async () => {
            try {
                await clearAllAssistantAISessions();
                ctx.selectedSessionId = "";
                ctx.clearEditingMessage(false);
                ctx.messages = [];
                await ctx.refresh(false);
            } catch (error) {
                showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            }
        },
        true,
    );
};

export const upsertAIDockSession = (ctx: IAssistantAIDockRuntime, session: IAssistantAISession) => {
    const nextSessions = ctx.sessions.filter((item) => item.id !== session.id);
    nextSessions.unshift(session);
    ctx.sessions = nextSessions.sort((left, right) => (right.updatedAt || right.createdAt) - (left.updatedAt || left.createdAt));
};
