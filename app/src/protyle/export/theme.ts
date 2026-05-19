import {Constants} from "../../constants";
import {escapeHTMLAttribute} from "./shared";

const isDefaultExportTheme = () => {
    return (window.sourceflow.config.appearance.mode === 1 && window.sourceflow.config.appearance.themeDark === "midnight") ||
        (window.sourceflow.config.appearance.mode === 0 && window.sourceflow.config.appearance.themeLight === "daylight");
};

export const getExportThemeStyleTag = (servePath: string, themeName: string) => {
    if (isDefaultExportTheme()) {
        return "";
    }
    return `<link rel="stylesheet" type="text/css" id="themeStyle" href="${escapeHTMLAttribute(`${servePath}appearance/themes/${themeName}/theme.css?${Constants.SOURCEFLOW_VERSION}`)}"/>`;
};
