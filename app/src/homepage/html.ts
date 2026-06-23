export const escapeHTML = (text: string) => `${text || ""}`.replace(/[&<>"']/g, (match) => {
    switch (match) {
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
