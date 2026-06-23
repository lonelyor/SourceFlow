const escapeInlineScriptJSON = (json: string) => {
    return json
        .replace(/</g, "\\u003C")
        .replace(/>/g, "\\u003E")
        .replace(/&/g, "\\u0026")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
};

export const serializeInlineScriptValue = (value: unknown) => {
    return escapeInlineScriptJSON(JSON.stringify(value));
};

export const getExportRuntimeState = (mode: number) => {
    return {
        config: {
            appearance: {
                mode,
                codeBlockThemeDark: window.sourceflow.config.appearance.codeBlockThemeDark,
                codeBlockThemeLight: window.sourceflow.config.appearance.codeBlockThemeLight,
                codeBlockSkinDark: window.sourceflow.config.appearance.codeBlockSkinDark,
                codeBlockSkinLight: window.sourceflow.config.appearance.codeBlockSkinLight,
            },
            editor: {
                allowSVGScriptTip: false,
                allowHTMLBLockScript: false,
                codeLineWrap: true,
                displayBookmarkIcon: window.sourceflow.config.editor.displayBookmarkIcon,
                fontSize: window.sourceflow.config.editor.fontSize,
                codeLigatures: window.sourceflow.config.editor.codeLigatures,
                plantUMLServePath: window.sourceflow.config.editor.plantUMLServePath,
                codeSyntaxHighlightLineNum: window.sourceflow.config.editor.codeSyntaxHighlightLineNum,
                katexMacros: window.sourceflow.config.editor.katexMacros,
            },
        },
        languages: {
            copy: window.sourceflow.languages.copy,
            edit: window.sourceflow.languages.edit,
            more: window.sourceflow.languages.more,
            refresh: window.sourceflow.languages.refresh,
            update: window.sourceflow.languages.update,
            htmlBlockError: window.sourceflow.languages.htmlBlockError,
        },
    };
};

export const buildExportSourceflowBootstrapJS = (mode: number) => {
    return `
    window.sourceflow = ${serializeInlineScriptValue(getExportRuntimeState(mode))};
    document.documentElement.setAttribute("data-code-block-skin", window.sourceflow.config.appearance.mode === 1 ? window.sourceflow.config.appearance.codeBlockSkinDark : window.sourceflow.config.appearance.codeBlockSkinLight);
`;
};
