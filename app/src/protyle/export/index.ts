import {hideMessage, showMessage} from "../../dialog/message";
import {Constants} from "../../constants";
/// #if !BROWSER
import {ipcRenderer} from "electron";
import * as fs from "fs";
import * as path from "path";
import {afterExport} from "./util";
/// #endif
import {confirmDialog} from "../../dialog/confirmDialog";
import {setInlineStyle} from "../../util/assets";
import {fetchPost} from "../../util/fetch";
import {Dialog} from "../../dialog";
import {replaceLocalPath} from "../../editor/rename";
import {getScreenWidth, isInMobileApp, setStorageVal} from "../util/compatibility";
import {buildPDFPreviewHTML} from "./pdfPreviewHTML";
import {getExportRuntimeLoaderJS, getExportSafetyJS, getIconScript, getPluginStyle} from "./runtimeAssets";
import {escapeHTMLAttribute, getSnippetCSS, getSnippetJS, sanitizeExportHTMLContent} from "./shared";
import {buildStaticExportHTML} from "./staticHTML";
import {getExportThemeStyleTag} from "./theme";

export const saveExport = (option: IExportOptions) => {
    /// #if BROWSER
    if (["html", "htmlmd"].includes(option.type)) {
        const msgId = showMessage(window.sourceflow.languages.exporting, -1);
        // 浏览器环境：先调用 API 生成资源文件，再在前端生成完整的 HTML
        const url = option.type === "htmlmd" ? "/api/export/exportMdHTML" : "/api/export/exportHTML";
        fetchPost(url, {
            id: option.id,
            pdf: false,
            removeAssets: false,
            merge: true,
            savePath: ""
        }, async exportResponse => {
            const html = await onExport(exportResponse, undefined, "", option);
            fetchPost("/api/export/exportBrowserHTML", {
                folder: exportResponse.data.folder,
                html: html,
                name: exportResponse.data.name
            }, zipResponse => {
                hideMessage(msgId);
                if (zipResponse.code === -1) {
                    showMessage(window.sourceflow.languages._kernel[14].replace("%s", zipResponse.msg), 0, "error");
                    return;
                }
                window.open(zipResponse.data.zip);
                showMessage(window.sourceflow.languages.exported);
            });
        });
        return;
    }
    /// #else
    if (option.type === "pdf") {
        if (window.sourceflow.config.appearance.mode === 1) {
            confirmDialog(window.sourceflow.languages.pdfTip, window.sourceflow.languages.pdfConfirm, () => {
                renderPDF(option.id);
            });
        } else {
            renderPDF(option.id);
        }
    } else if (option.type === "word") {
        const localData = window.sourceflow.storage[Constants.LOCAL_EXPORTWORD];
        const wordDialog = new Dialog({
            title: "Word " + window.sourceflow.languages.config,
            content: `<div class="b3-dialog__content">
    <label class="fn__flex b3-label">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.removeAssetsFolder}
        </div>
        <span class="fn__space"></span>
        <input id="removeAssets" class="b3-switch" type="checkbox" ${localData.removeAssets ? "checked" : ""}>
    </label>
    <label class="fn__flex b3-label">
        <div class="fn__flex-1">
            ${window.sourceflow.languages.mergeSubdocs}
        </div>
        <span class="fn__space"></span>
        <input id="mergeSubdocs" class="b3-switch" type="checkbox" ${localData.mergeSubdocs ? "checked" : ""}>
    </label>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.confirm}</button>
</div>`,
            width: "520px",
        });
        wordDialog.element.setAttribute("data-key", Constants.DIALOG_EXPORTWORD);
        const btnsElement = wordDialog.element.querySelectorAll(".b3-button");
        btnsElement[0].addEventListener("click", () => {
            wordDialog.destroy();
        });
        btnsElement[1].addEventListener("click", () => {
            const removeAssets = (wordDialog.element.querySelector("#removeAssets") as HTMLInputElement).checked;
            const mergeSubdocs = (wordDialog.element.querySelector("#mergeSubdocs") as HTMLInputElement).checked;
            window.sourceflow.storage[Constants.LOCAL_EXPORTWORD] = {removeAssets, mergeSubdocs};
            setStorageVal(Constants.LOCAL_EXPORTWORD, window.sourceflow.storage[Constants.LOCAL_EXPORTWORD]);
            getExportPath(option, removeAssets, mergeSubdocs);
            wordDialog.destroy();
        });
    } else {
        getExportPath(option, false, true);
    }
    /// #endif
};

/// #if !BROWSER
const renderPDF = async (id: string) => {
    const localData = window.sourceflow.storage[Constants.LOCAL_EXPORTPDF];
    if (typeof localData.paged === "undefined") {
        localData.paged = true;
    }
    const servePathWithoutTrailingSlash = window.location.protocol + "//" + window.location.host;
    const servePath = servePathWithoutTrailingSlash + "/";
    const themeStyle = getExportThemeStyleTag(servePath, window.sourceflow.config.appearance.themeLight);
    const currentWindowId = await ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
        cmd: "getContentsId",
    });
    const html = buildPDFPreviewHTML({
        id,
        localData,
        servePath,
        servePathWithoutTrailingSlash,
        currentWindowId,
        themeStyle,
        inlineStyle: await setInlineStyle(false, servePath),
        pluginStyle: await getPluginStyle(),
        snippetCSS: getSnippetCSS(),
        snippetJS: getSnippetJS(false),
        iconScript: getIconScript(servePath),
        runtimeLoaderJS: getExportRuntimeLoaderJS(servePath),
        safetyJS: getExportSafetyJS(),
    });
    fetchPost("/api/export/exportTempContent", {content: html}, (response) => {
        ipcRenderer.send(Constants.SOURCEFLOW_EXPORT_NEWWINDOW, response.data.url);
    });
};

const getExportPath = (option: IExportOptions, removeAssets?: boolean, mergeSubdocs?: boolean) => {
    fetchPost("/api/block/getBlockInfo", {
        id: option.id
    }, async (response) => {
        if (response.code === 3) {
            showMessage(response.msg);
            return;
        }
        let exportType = "HTML (SourceFlow)";
        switch (option.type) {
            case "htmlmd":
                exportType = "HTML (Markdown)";
                break;
            case "word":
                exportType = "Word .docx";
                break;
            case "pdf":
                exportType = "PDF";
                break;
        }

        const result = await ipcRenderer.invoke(Constants.SOURCEFLOW_GET, {
            cmd: "showOpenDialog",
            title: window.sourceflow.languages.export + " " + exportType,
            properties: ["createDirectory", "openDirectory"],
        });
        if (!result.canceled) {
            const msgId = showMessage(window.sourceflow.languages.exporting, -1);
            let url = "/api/export/exportHTML";
            if (option.type === "htmlmd") {
                url = "/api/export/exportMdHTML";
            } else if (option.type === "word") {
                url = "/api/export/exportDocx";
            }
            let savePath = result.filePaths[0];
            if (option.type !== "word" && !savePath.endsWith(response.data.rootTitle)) {
                savePath = path.join(savePath, replaceLocalPath(response.data.rootTitle));
            }
            savePath = savePath.trim();
            fetchPost(url, {
                id: option.id,
                pdf: option.type === "pdf",
                removeAssets: removeAssets,
                merge: mergeSubdocs,
                savePath
            }, exportResponse => {
                if (option.type === "word") {
                    if (exportResponse.code === 1) {
                        hideMessage(msgId);
                        showMessage(exportResponse.msg, 0, "error");
                        return;
                    }
                    afterExport(exportResponse.data.path, msgId);
                } else {
                    onExport(exportResponse, savePath, "", option, msgId);
                }
            });
        }
    });
};
/// #endif

export const onExport = async (data: IWebSocketData, filePath: string, servePath: string, exportOption: IExportOptions, msgId?: string) => {
    let themeName = window.sourceflow.config.appearance.themeLight;
    let mode = 0;
    if (["html", "htmlmd"].includes(exportOption.type) && window.sourceflow.config.appearance.mode === 1) {
        themeName = window.sourceflow.config.appearance.themeDark;
        mode = 1;
    }
    const themeStyle = getExportThemeStyleTag(servePath, themeName);
    const screenWidth = getScreenWidth();
    const isInMobile = isInMobileApp();
    const mobileHtml = isInMobile ? {
        js: `document.body.style.minWidth = "${screenWidth}px";`,
        css: `@page { size: A4; margin: 10mm 0 10mm 0; background-color: var(--b3-theme-background); }
.protyle-wysiwyg {padding: 0; margin: 0;}`
    } : {js: "", css: ""};
    const exportHTMLContent = sanitizeExportHTMLContent(data.data.content);
    const html = buildStaticExportHTML({
        data,
        servePath,
        exportOption,
        themeName,
        mode,
        themeStyle,
        inlineStyle: await setInlineStyle(false, servePath),
        pluginStyle: await getPluginStyle(),
        snippetCSS: getSnippetCSS(),
        snippetJS: getSnippetJS(!["pdf", "word"].includes(exportOption.type)),
        mobileJS: mobileHtml.js,
        mobileCSS: mobileHtml.css,
        exportHTMLContent,
        iconScript: getIconScript(servePath),
        runtimeLoaderJS: getExportRuntimeLoaderJS(servePath),
        safetyJS: getExportSafetyJS(),
    });
    // 移动端导出 pdf、浏览器导出 HTML
    if (typeof filePath === "undefined") {
        return html;
    }
    /// #if !BROWSER
    const htmlPath = path.join(filePath, "index.html");
    fs.writeFileSync(htmlPath, html);
    afterExport(htmlPath, msgId);
    /// #endif
};
