import {setInlineStyle} from "../../util/assets";
import {buildPDFWorkerHTML} from "./pdfWorkerHTML";
import {getExportRuntimeLoaderJS, getExportSafetyJS, getIconScript, getPluginStyle} from "./runtimeAssets";
import {getSnippetCSS, sanitizeExportHTMLContent} from "./shared";
import {getExportThemeStyleTag} from "./theme";

export const buildPDFWorkerExportHTML = async (options: {
    data: IWebSocketData;
    pdfConfig: {
        pageSize: string;
        pdfOptions: IObject;
    };
}) => {
    const servePath = `${window.location.protocol}//${window.location.host}/`;
    return buildPDFWorkerHTML({
        data: options.data,
        servePath,
        themeStyle: getExportThemeStyleTag(servePath, window.sourceflow.config.appearance.themeLight),
        inlineStyle: await setInlineStyle(false, servePath),
        pluginStyle: await getPluginStyle(),
        snippetCSS: getSnippetCSS(),
        exportHTMLContent: sanitizeExportHTMLContent(options.data.data.content),
        iconScript: getIconScript(servePath),
        runtimeLoaderJS: getExportRuntimeLoaderJS(servePath),
        safetyJS: getExportSafetyJS(),
        pdfConfig: options.pdfConfig,
    });
};
