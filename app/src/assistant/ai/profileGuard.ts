import {openSettingTab} from "../../config";
import {confirmDialog} from "../../dialog/confirmDialog";
import {App} from "../../index";
import {assistantText} from "../constants";
import {getAssistantAIDefaultProfile, IAssistantAIProfile} from "./api";

/**
 * Resolve the default AI profile, or — when none is configured yet — guide the
 * user to set one up instead of leaving them at a dead-end error toast (I1).
 *
 * Returns the profile when ready, or null after offering to open AI settings.
 * Used by every in-note AI entry point (skills, inline command, block menu,
 * slash menu) so the first-run experience is consistent and never a dead end.
 */
export const ensureAssistantAIProfileOrGuide = async (app?: App): Promise<IAssistantAIProfile | null> => {
    const profile = await getAssistantAIDefaultProfile();
    if (profile) {
        return profile;
    }
    confirmDialog(
        assistantText("还没有 AI 配置", "No AI profile yet"),
        assistantText("请先配置至少一个 AI 模型，再使用 AI 功能。是否现在去配置？", "Configure at least one AI profile before using AI features. Open settings now?"),
        () => openSettingTab(app, "AI"),
    );
    return null;
};
