// 附件（asset）@ 引用的展示与元数据 helper（plans/20260915-附件引用与OCR来源设计.md §2.1 第一期）。
// 附件来源本期只投喂元数据，不投喂像素；图标区分图片/文档复用仓库内置 svg sprite。

const ASSET_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif", ".ico"];

export const isImageAssetName = (name?: string): boolean => {
    const normalized = `${name || ""}`.toLowerCase();
    return ASSET_IMAGE_EXTENSIONS.some((ext) => normalized.endsWith(ext));
};

// 图片用 #iconImage，其余附件用 #iconFile；宽高内联声明，避免依赖新增 SCSS 规则。
export const renderAssetTypeIcon = (name?: string): string => {
    const iconId = isImageAssetName(name) ? "iconImage" : "iconFile";
    return `<svg width="14" height="14" data-asset-icon="${iconId}"><use xlink:href="#${iconId}"></use></svg>`;
};
