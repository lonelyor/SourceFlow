import {fetchPost} from "../../util/fetch";
import {movePathTo, moveToPath, pathPosix} from "../../util/pathName";
import {rename} from "../../editor/rename";
import {isTitleEmptyAttr} from "../../util/attrCompat";
import {MenuItem} from "../Menu";

export const renameMenu = (options: {
    path: string
    notebookId: string
    name: string,
    type: "notebook" | "file"
    docId?: string | null
}) => {
    return new MenuItem({
        id: "rename",
        accelerator: window.sourceflow.config.keymap.editor.general.rename.custom,
        icon: "iconEdit",
        label: window.sourceflow.languages.rename,
        click: () => {
            if (options.type === "file" && options.docId) {
                fetchPost("/api/block/getDocInfo", {
                    id: options.docId
                }, (response) => {
                    rename({
                        ...options,
                        name: response.data.ial.title,
                        empty: isTitleEmptyAttr(response.data.ial),
                    });
                });
            } else {
                rename(options);
            }
        }
    }).element;
};

export const movePathToMenu = (paths: string[]) => {
    return new MenuItem({
        id: "move",
        label: window.sourceflow.languages.move,
        icon: "iconMove",
        accelerator: window.sourceflow.config.keymap.general.move.custom,
        click() {
            const rootIDs: string[] = [];
            paths.forEach(item => {
                rootIDs.push(pathPosix().basename(item).replace(".sf", ""));
            });
            movePathTo({
                cb: (toPath, toNotebook) => {
                    moveToPath(paths, toNotebook[0], toPath[0]);
                },
                paths,
                flashcard: false,
                rootIDs,
            });
        }
    }).element;
};
