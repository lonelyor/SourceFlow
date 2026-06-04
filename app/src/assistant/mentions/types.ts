export type TMentionItemType = "note" | "folder" | "asset" | "selection";

export interface IMentionSearchResult {
    id: string;
    type: TMentionItemType;
    title: string;
    subtitle?: string;
    notebook?: string;
    path?: string;
    icon?: string;
    hPath?: string;
}

export interface IMentionSource {
    id: string;
    type: TMentionItemType;
    title: string;
    notebook?: string;
    path?: string;
    hPath?: string;
    included: boolean;
    summary?: string;
    children?: IMentionSource[];
    expanded?: boolean;
}

export interface IContextPackItem {
    type: TMentionItemType;
    id: string;
    notebook?: string;
    path?: string;
    content?: string;
}

export interface IContextPackEntry {
    type: TMentionItemType;
    id: string;
    title: string;
    notebook?: string;
    path?: string;
    hPath?: string;
    summary?: string;
    children?: IContextPackEntry[];
}

export interface IContextPackDroppedItem {
    type: TMentionItemType;
    id?: string;
    title?: string;
    reason: string;
}

export interface IContextPackResponse {
    items: IContextPackEntry[];
    dropped?: IContextPackDroppedItem[];
    truncated?: boolean;
    maxChars?: number;
}
