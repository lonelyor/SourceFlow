export const getSnippetCSS = () => {
    let snippetCSS = "";
    document.querySelectorAll("style").forEach((item) => {
        if (item.id.startsWith("snippetCSS")) {
            snippetCSS += item.outerHTML;
        }
    });
    return snippetCSS;
};

export const getSnippetJS = (includeEditorRuntimeJS = false) => {
    if (!includeEditorRuntimeJS) {
        return "";
    }
    let snippetScript = "";
    document.querySelectorAll("script").forEach((item) => {
        if (item.id.startsWith("snippetJS")) {
            snippetScript += item.outerHTML;
        }
    });
    return snippetScript;
};

export const sanitizeExportExecutableElement = (root: ParentNode) => {
    root.querySelectorAll("script").forEach((item) => {
        item.remove();
    });
    root.querySelectorAll("*").forEach((item) => {
        Array.from(item.attributes).forEach((attr) => {
            const name = attr.name.toLowerCase();
            const value = attr.value.trim().toLowerCase();
            if (name.startsWith("on") ||
                ((name === "href" || name === "src" || name === "xlink:href") &&
                    (value.startsWith("javascript:") || value.startsWith("vbscript:"))) ||
                (name === "style" && (value.includes("expression(") || value.includes("url(javascript:") || value.includes("url(vbscript:")))) {
                item.removeAttribute(attr.name);
            }
        });
    });
};

export const sanitizeExportHTMLContent = (content: string) => {
    const template = document.createElement("template");
    template.innerHTML = content || "";
    sanitizeExportExecutableElement(template.content);
    return template.innerHTML;
};

export const escapeHTMLText = (value: string) => `${value || ""}`.replace(/[&<>]/g, (char) => {
    switch (char) {
        case "&":
            return "&amp;";
        case "<":
            return "&lt;";
        default:
            return "&gt;";
    }
});

export const escapeHTMLAttribute = (value: string) => `${value || ""}`.replace(/[&<>"']/g, (char) => {
    switch (char) {
        case "&":
            return "&amp;";
        case "<":
            return "&lt;";
        case ">":
            return "&gt;";
        case "\"":
            return "&quot;";
        default:
            return "&#39;";
    }
});
