import {assistantText} from "../constants";
import type {ICurrentNoteContext} from "./note";
import type {IMentionSource} from "../mentions/types";

export const buildMentionSourceFromNoteContext = (context: ICurrentNoteContext | null, preferSelection = true): IMentionSource | null => {
    if (!context?.rootID) {
        return null;
    }
    const selectedText = `${context.selectedText || ""}`.trim();
    if (preferSelection && selectedText && context.currentBlockID) {
        return {
            id: context.currentBlockID,
            type: "selection",
            title: `${context.title || assistantText("当前笔记", "Current note")} · ${assistantText("选区", "Selection")}`,
            notebook: context.notebook,
            path: context.path,
            hPath: context.path,
            included: true,
            summary: selectedText,
        };
    }
    return {
        id: context.rootID,
        type: "note",
        title: context.title || assistantText("当前笔记", "Current note"),
        notebook: context.notebook,
        path: context.path,
        hPath: context.path,
        included: true,
    };
};

export const buildMentionSourcesFromNoteContext = (context: ICurrentNoteContext | null, preferSelection = true) => {
    const source = buildMentionSourceFromNoteContext(context, preferSelection);
    return source ? [source] : [];
};
