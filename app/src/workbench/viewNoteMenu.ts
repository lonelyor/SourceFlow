import {App} from "../index";
import {getDisplayName, pathPosix} from "../util/pathName";

const loadWorkbenchDialogModule = () => import("./dialog");

const getCapturePathPrefix = (pathString = "/", useParentPath = false) => {
    if (!pathString || pathString === "/") {
        return "/";
    }
    const targetPath = useParentPath ? pathPosix().dirname(pathString) : pathString;
    const displayPath = getDisplayName(targetPath, false, true);
    return displayPath || "/";
};

export const buildWorkbenchViewNoteMenu = (app: App, options: {
    notebookId?: string;
    pathString?: string;
    useParentPath?: boolean;
} = {}): IMenu[] => {
    const pathPrefix = getCapturePathPrefix(options.pathString, options.useParentPath);
    return [{
        id: "workbenchViewNoteList",
        icon: "iconList",
        label: window.sourceflow.languages.workbenchViewList,
        click: () => {
            void loadWorkbenchDialogModule().then(({openWorkbenchBuiltinViewNote}) => {
                openWorkbenchBuiltinViewNote(app, "list", {
                    notebook: options.notebookId,
                    pathPrefix,
                });
            });
        }
    }, {
        id: "workbenchViewNoteTable",
        icon: "iconTable",
        label: window.sourceflow.languages.workbenchViewTable,
        click: () => {
            void loadWorkbenchDialogModule().then(({openWorkbenchBuiltinViewNote}) => {
                openWorkbenchBuiltinViewNote(app, "table", {
                    notebook: options.notebookId,
                    pathPrefix,
                });
            });
        }
    }, {
        id: "workbenchViewNoteBoard",
        icon: "iconBoard",
        label: window.sourceflow.languages.workbenchViewBoard,
        click: () => {
            void loadWorkbenchDialogModule().then(({openWorkbenchBuiltinViewNote}) => {
                openWorkbenchBuiltinViewNote(app, "board", {
                    notebook: options.notebookId,
                    pathPrefix,
                });
            });
        }
    }, {
        id: "workbenchViewNoteTimeline",
        icon: "iconCalendar",
        label: window.sourceflow.languages.workbenchViewTimeline,
        click: () => {
            void loadWorkbenchDialogModule().then(({openWorkbenchBuiltinViewNote}) => {
                openWorkbenchBuiltinViewNote(app, "timeline", {
                    notebook: options.notebookId,
                    pathPrefix,
                });
            });
        }
    }, {
        id: "workbenchViewNoteSkill",
        icon: "iconSparkles",
        label: window.sourceflow.config.lang === "zh_CN" ? "技能笔记" : "Skill Note",
        click: () => {
            void loadWorkbenchDialogModule().then(({openWorkbenchBuiltinViewNote}) => {
                openWorkbenchBuiltinViewNote(app, "skill", {
                    notebook: options.notebookId,
                    pathPrefix,
                });
            });
        }
    }];
};
