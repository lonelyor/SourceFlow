import {fetchPost, fetchSyncPost} from "../util/fetch";
import {THomepageTemplateMode} from "./types";
import {normalizeTemplatePath} from "./state";

export const getHomepageTemplateMode = (templatePath: string): THomepageTemplateMode => {
    const normalized = normalizeTemplatePath(templatePath).toLowerCase();
    if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) {
        return "markdown";
    }
    if (normalized.endsWith(".html") || normalized.endsWith(".htm")) {
        return "html";
    }
    return "bundle";
};

export const readWorkspaceText = (pathString: string) => {
    return new Promise<string>((resolve) => {
        fetchPost("/api/file/getFile", {path: pathString}, (response) => {
            resolve(typeof response === "string" ? response : "");
        }, null, () => {
            resolve("");
        });
    });
};

export const writeWorkspaceText = async (pathString: string, content: string, mime = "text/plain") => {
    const fileName = pathString.split("/").pop() || "index.txt";
    const file = new File([new Blob([content], {type: mime})], fileName);
    const formData = new FormData();
    formData.append("path", pathString);
    formData.append("file", file);
    formData.append("isDir", "false");
    return fetchSyncPost("/api/file/putFile", formData);
};
