export interface IHomepageState {
    templatePath: string;
    sourceType: THomepageSourceType;
    noteId: string;
}

export interface IHomepageTemplateBundle {
    html: string;
    css: string;
    script: string;
    config: string;
}

export type THomepageTemplateMode = "bundle" | "html" | "markdown";
export type THomepageSourceType = "template" | "note";
