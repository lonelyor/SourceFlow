export type FileTreeDensity = "compact" | "default" | "loose";

const fileTreeDensityClasses = [
    "file-tree--density-compact",
    "file-tree--density-default",
    "file-tree--density-loose",
];

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

export const getFileTreeAppearanceTexts = () => ({
    title: window.sourceflow.languages.fileTreeAppearance || "Doc tree appearance",
    detail: window.sourceflow.languages.fileTreeAppearanceTip || "",
    guides: window.sourceflow.languages.fileTreeGuides || "Show hierarchy guides",
    guidesTip: window.sourceflow.languages.fileTreeGuidesTip || "",
    density: window.sourceflow.languages.fileTreeDensity || "Row density",
    densityTip: window.sourceflow.languages.fileTreeDensityTip || "",
});

export const applyFileTreeAppearanceToPanel = (
    panelElement: HTMLElement,
    appearanceData: Partial<Config.IAppearance> = window.sourceflow.config.appearance,
) => {
    if (!panelElement.classList.contains("sf__file")) {
        return;
    }
    const density = normalizeFileTreeDensity(appearanceData.fileTreeDensity);
    panelElement.classList.toggle("file-tree--guides", !!appearanceData.fileTreeGuides);
    panelElement.classList.remove(...fileTreeDensityClasses);
    panelElement.classList.add(`file-tree--density-${density}`);
};

export const applyFileTreeAppearance = (
    appearanceData: Partial<Config.IAppearance> = window.sourceflow.config.appearance,
) => {
    document.querySelectorAll<HTMLElement>(".sf__file").forEach((panelElement) => {
        applyFileTreeAppearanceToPanel(panelElement, appearanceData);
    });
};
