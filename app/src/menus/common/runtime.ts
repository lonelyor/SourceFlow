import {showMessage} from "../../dialog/message";

const loadExportModule = () => import("../../protyle/export");

const loadExportUtilModule = () => import("../../protyle/export/util");

export const getActionErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
        return error.message;
    }
    return `${error || "Unknown error"}`;
};

export const showAsyncMenuActionError = (label: string, error: unknown) => {
    console.error(`${label} failed`, error);
    showMessage(`${label}: ${getActionErrorMessage(error)}`, 0, "error");
};

export const runAsyncMenuAction = (label: string, action: () => Promise<void>) => {
    void action().catch((error) => {
        showAsyncMenuActionError(label, error);
    });
};

export const saveExportAsync = async (option: IExportOptions) => {
    const {saveExport} = await loadExportModule();
    saveExport(option);
};

export const exportImageAsync = async (id: string) => {
    const {exportImage} = await loadExportUtilModule();
    exportImage(id);
};

export const buildMobilePDFExportHTML = async (response: IWebSocketData, id: string) => {
    const servePath = window.location.protocol + "//" + window.location.host + "/";
    const {onExport} = await loadExportModule();
    return onExport(response, undefined, servePath, {type: "pdf", id});
};
