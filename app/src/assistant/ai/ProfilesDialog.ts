import {Dialog} from "../../dialog";
import {assistantText} from "../constants";
import {AssistantAIProfilesPanel} from "./ProfilesPanel";

interface IOpenProfilesDialogOptions {
    selectedId?: string;
    onSaved?: () => void;
}

export const openAssistantAIProfilesDialog = (options: IOpenProfilesDialogOptions = {}) => {
    const dialog = new Dialog({
        title: assistantText("AI 配置", "AI Profiles"),
        content: `<div class="assistant-profiles__body"></div>`,
        width: "860px",
        height: "66vh",
        containerClassName: "assistant-profiles-dialog assistant-profiles-dialog--compact",
    });
    const body = dialog.element.querySelector(".assistant-profiles__body") as HTMLElement;
    const panel = new AssistantAIProfilesPanel(body, {
        compact: true,
        selectedId: options.selectedId,
        onSaved: () => {
            options.onSaved?.();
        },
    });
    const oldDestroy = dialog.destroy.bind(dialog);
    dialog.destroy = () => {
        panel.destroy();
        oldDestroy();
    };
    return dialog;
};
