const appearanceText = (zh: string, en: string) => {
    const lang = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase();
    return lang.startsWith("zh") ? zh : en;
};

export const DEFAULT_CODE_BLOCK_SKIN = "default";

const codeBlockSkinValues = new Set(["default", "mac", "iterm2", "minimal"]);

export const normalizeCodeBlockSkin = (value: string) => {
    const normalized = `${value || ""}`.trim().toLowerCase();
    return codeBlockSkinValues.has(normalized) ? normalized : DEFAULT_CODE_BLOCK_SKIN;
};

export const getCodeBlockSkinOptions = () => ([
    {name: "default", label: appearanceText("默认", "Default")},
    {name: "mac", label: "Mac"},
    {name: "iterm2", label: "iTerm2"},
    {name: "minimal", label: appearanceText("极简", "Minimal")},
]);

export const getCodeBlockSkinSettingTexts = () => ({
    title: appearanceText("代码块皮肤（Mac / iTerm2 / 极简）", "Code Block Skin (Mac / iTerm2 / Minimal)"),
    detail: appearanceText("这里复用现有代码块外观设置，只增加容器皮肤。语法高亮配色仍由代码块主题控制；皮肤只负责窗口圆点、标题栏、边框和终端质感。", "This reuses the existing code block appearance system and only adds container skins. Syntax highlighting colors still come from the code block theme, while the skin controls the window dots, title bar, borders, and terminal feel."),
    light: appearanceText("明亮模式皮肤", "Light mode skin"),
    dark: appearanceText("暗黑模式皮肤", "Dark mode skin"),
});

export const getActiveCodeBlockSkin = (appearanceData: Partial<Config.IAppearance> = window.sourceflow.config.appearance) => {
    const mode = Number(appearanceData?.mode);
    return normalizeCodeBlockSkin(mode === 1 ? appearanceData?.codeBlockSkinDark : appearanceData?.codeBlockSkinLight);
};
