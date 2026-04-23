import {ICurrentNoteContext} from "../common/note";

export type TAssistantSkillId =
    | "selection-summarize"
    | "selection-keypoints"
    | "selection-qa"
    | "selection-rewrite"
    | "selection-translate"
    | "selection-task"
    | "selection-reminder"
    | "selection-table"
    | "selection-mermaid"
    | "selection-mind-elixir"
    | "note-create"
    | "note-continue-writing"
    | "note-summarize"
    | "note-outline"
    | "note-qa"
    | "note-flashcards"
    | "note-task"
    | "note-reminder"
    | "note-polish"
    | "note-links"
    | "note-health"
    | "note-extract-tasks"
    | "note-create-project"
    | "ask-ai";

export type TAssistantSkillPlacement = "selection" | "note";

export type TAssistantSkillOutput = "plain-text" | "markdown";

export type TAssistantSkillAction =
    | "replace-selection"
    | "insert-below"
    | "insert-mind-elixir"
    | "append-note"
    | "capture-task"
    | "capture-event"
    | "chat";

export type TAssistantSkillResultMode = "review" | "auto-apply";

export interface IAssistantSkillContext {
    note: ICurrentNoteContext | null;
    protyle?: IProtyle;
    range?: Range | null;
    hasSelection: boolean;
    selectedText: string;
}

export interface IAssistantSkillParams {
    targetLanguage?: string;
}

export interface IAssistantSkillDefinition {
    id: TAssistantSkillId;
    placement: TAssistantSkillPlacement;
    label: string;
    shortLabel: string;
    description: string;
    output: TAssistantSkillOutput;
    action: TAssistantSkillAction;
    requiresNote?: boolean;
    requiresSelection?: boolean;
    allowTools?: boolean;
    resultMode?: TAssistantSkillResultMode;
    buildMessage: (context: IAssistantSkillContext, params: IAssistantSkillParams) => string;
}
