export type FileTreeDensity = "compact" | "default" | "loose";

export const DEFAULT_FILE_TREE_FONT_SIZE = 0;
export const MIN_FILE_TREE_FONT_SIZE = 10;
export const MAX_FILE_TREE_FONT_SIZE = 20;

const fileTreeDensityClasses = [
    "file-tree--density-compact",
    "file-tree--density-default",
    "file-tree--density-loose",
];
const fileTreeFontSizeCSSVar = "--sf-file-tree-font-size";

export const normalizeFileTreeDensity = (value?: string): FileTreeDensity => {
    if (value === "compact" || value === "loose") {
        return value;
    }
    return "default";
};

export const getFileTreeDensityOptions = () => [
    {name: "compact", label: window.sourceflow.languages.fileTreeDensityCompact || "Compact"},
    {name: "default", label: window.sourceflow.languages.fileTreeDensityDefault || "Default"},
    {name: "loose", label: window.sourceflow.languages.fileTreeDensityLoose || "Loose"},
];

export const normalizeFileTreeFontSize = (value?: number | string): number => {
    const parsedValue = typeof value === "number" ? value : parseInt(`${value || ""}`, 10);
    if (!Number.isFinite(parsedValue) || parsedValue <= DEFAULT_FILE_TREE_FONT_SIZE) {
        return DEFAULT_FILE_TREE_FONT_SIZE;
    }
    if (parsedValue < MIN_FILE_TREE_FONT_SIZE) {
        return MIN_FILE_TREE_FONT_SIZE;
    }
    if (parsedValue > MAX_FILE_TREE_FONT_SIZE) {
        return MAX_FILE_TREE_FONT_SIZE;
    }
    return parsedValue;
};

export const getFileTreeAppearanceTexts = () => ({
    title: window.sourceflow.languages.fileTreeAppearance || "Doc tree appearance",
    detail: window.sourceflow.languages.fileTreeAppearanceTip || "",
    guides: window.sourceflow.languages.fileTreeGuides || "Show hierarchy guides",
    guidesTip: window.sourceflow.languages.fileTreeGuidesTip || "",
    docCount: window.sourceflow.languages.fileTreeDocCount || "Show child doc counts",
    docCountTip: window.sourceflow.languages.fileTreeDocCountTip || "",
    totalCount: window.sourceflow.languages.fileTreeTotalCount || "Show total doc count",
    totalCountTip: window.sourceflow.languages.fileTreeTotalCountTip || "",
    density: window.sourceflow.languages.fileTreeDensity || "Row density",
    densityTip: window.sourceflow.languages.fileTreeDensityTip || "",
    fontSize: window.sourceflow.languages.fileTreeFontSize || "Doc tree font size",
    fontSizeTip: window.sourceflow.languages.fileTreeFontSizeTip || "",
    highlightColor: window.sourceflow.languages.fileTreeHighlightColor || "Active doc highlight",
    highlightColorTip: window.sourceflow.languages.fileTreeHighlightColorTip || "",
});

export const applyFileTreeHighlightColor = (hex: string) => {
    let styleEl = document.getElementById("sourceflowFileTreeHighlight") as HTMLStyleElement | null;
    if (!hex) {
        if (styleEl) {
            styleEl.remove();
        }
        return;
    }
    const css = `:root { --sf-file-tree-active-bg: ${hex}20; --sf-file-tree-active-border: ${hex}; }`;
    if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "sourceflowFileTreeHighlight";
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
};

export const applyFileTreeAppearanceToPanel = (
    panelElement: HTMLElement,
    appearanceData: Partial<Config.IAppearance> = window.sourceflow.config.appearance,
) => {
    if (!panelElement.classList.contains("sf__file")) {
        return;
    }
    const density = normalizeFileTreeDensity(appearanceData.fileTreeDensity);
    const fontSize = normalizeFileTreeFontSize(appearanceData.fileTreeFontSize);
    panelElement.classList.toggle("file-tree--guides", !!appearanceData.fileTreeGuides);
    panelElement.classList.toggle("file-tree--doc-count", !!appearanceData.fileTreeDocCount);
    panelElement.classList.toggle("file-tree--total-count", appearanceData.fileTreeTotalCount !== false);
    panelElement.classList.remove(...fileTreeDensityClasses);
    panelElement.classList.add(`file-tree--density-${density}`);
    if (fontSize > 0) {
        panelElement.style.setProperty(fileTreeFontSizeCSSVar, `${fontSize}px`);
    } else {
        panelElement.style.removeProperty(fileTreeFontSizeCSSVar);
    }
};

export const applyFileTreeAppearance = (
    appearanceData: Partial<Config.IAppearance> = window.sourceflow.config.appearance,
) => {
    document.querySelectorAll<HTMLElement>(".sf__file").forEach((panelElement) => {
        applyFileTreeAppearanceToPanel(panelElement, appearanceData);
    });
    applyFileTreeHighlightColor(appearanceData.fileTreeHighlightColor || "");
};
