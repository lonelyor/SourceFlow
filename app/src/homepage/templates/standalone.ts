import {IHomepageTemplateBundle} from "../types";

export const extractStandaloneHomepageHTML = (content: string): IHomepageTemplateBundle => {
    const cssBlocks: string[] = [];
    const scriptBlocks: string[] = [];
    let html = `${content || ""}`.trim();
    html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css: string) => {
        cssBlocks.push(css);
        return "";
    });
    html = html.replace(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, (_, script: string) => {
        scriptBlocks.push(script);
        return "";
    });
    const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
        html = bodyMatch[1];
    }
    html = html
        .replace(/<!doctype[^>]*>/gi, "")
        .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "")
        .trim();
    return {
        html,
        css: cssBlocks.join("\n"),
        script: scriptBlocks.join("\n"),
        config: "{}",
    };
};
