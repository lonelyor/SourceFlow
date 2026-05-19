import {parseStructuredDataObject} from "../util/structuredData";

export const parseHomepageTemplateConfig = (text: string) => {
    const content = `${text || ""}`.trim();
    if (!content) {
        return {};
    }
    return parseStructuredDataObject(content, "Homepage template config") as Record<string, any>;
};
