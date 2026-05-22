import {fetchSyncPost} from "../../util/fetch";
import {writeText} from "../../protyle/util/compatibility";
import {focusBlock} from "../../protyle/util/selection";
import {copyTextByType} from "../../protyle/toolbar/util";

export const copySubMenu = (ids: string[], accelerator = true, focusElement?: Element, stdMarkdownId?: string) => {
    const menuItems = [{
        id: "copyBlockRef",
        iconHTML: "",
        accelerator: accelerator ? window.sourceflow.config.keymap.editor.general.copyBlockRef.custom : undefined,
        label: window.sourceflow.languages.copyBlockRef,
        click: () => {
            copyTextByType(ids, "ref");
            if (focusElement) {
                focusBlock(focusElement);
            }
        }
    }, {
        id: "copyBlockEmbed",
        iconHTML: "",
        label: window.sourceflow.languages.copyBlockEmbed,
        accelerator: accelerator ? window.sourceflow.config.keymap.editor.general.copyBlockEmbed.custom : undefined,
        click: () => {
            copyTextByType(ids, "blockEmbed");
            if (focusElement) {
                focusBlock(focusElement);
            }
        }
    }, {
        id: "copyProtocol",
        iconHTML: "",
        label: window.sourceflow.languages.copyProtocol,
        accelerator: accelerator ? window.sourceflow.config.keymap.editor.general.copyProtocol.custom : undefined,
        click: () => {
            copyTextByType(ids, "protocol");
            if (focusElement) {
                focusBlock(focusElement);
            }
        }
    }, {
        id: "copyProtocolInMd",
        iconHTML: "",
        label: window.sourceflow.languages.copyProtocolInMd,
        accelerator: accelerator ? window.sourceflow.config.keymap.editor.general.copyProtocolInMd.custom : undefined,
        click: () => {
            copyTextByType(ids, "protocolMd");
            if (focusElement) {
                focusBlock(focusElement);
            }
        }
    }, {
        id: "copyBlockLocationLink",
        iconHTML: "",
        label: window.sourceflow.languages.copyBlockLocationLink,
        click: () => {
            copyTextByType(ids, "locationProtocolMd");
            if (focusElement) {
                focusBlock(focusElement);
            }
        }
    },
        /// #if BROWSER
        {
            id: "copyWebURL",
            iconHTML: "",
            label: window.sourceflow.languages.copyWebURL,
            click: () => {
                copyTextByType(ids, "webURL");
                if (focusElement) {
                    focusBlock(focusElement);
                }
            }
        },
        /// #endif
        {
            id: "copyHPath",
            iconHTML: "",
            label: window.sourceflow.languages.copyHPath,
            accelerator: accelerator ? window.sourceflow.config.keymap.editor.general.copyHPath.custom : undefined,
            click: () => {
                copyTextByType(ids, "hPath");
                if (focusElement) {
                    focusBlock(focusElement);
                }
            }
        }, {
            id: "copyID",
            iconHTML: "",
            label: window.sourceflow.languages.copyID,
            accelerator: accelerator ? window.sourceflow.config.keymap.editor.general.copyID.custom : undefined,
            click: () => {
                copyTextByType(ids, "id");
                if (focusElement) {
                    focusBlock(focusElement);
                }
            }
        }];

    if (stdMarkdownId) {
        menuItems.push({
            id: "copyMarkdown",
            iconHTML: "",
            label: window.sourceflow.languages.copyMarkdown,
            accelerator: undefined,
            click: async () => {
                const response = await fetchSyncPost("/api/export/exportMdContent", {
                    id: stdMarkdownId,
                    refMode: 3,
                    embedMode: 1,
                    yfm: false,
                    fillCSSVar: false,
                    adjustHeadingLevel: false
                });
                const text = response.data.content;
                writeText(text);
                if (focusElement) {
                    focusBlock(focusElement);
                }
            }
        });
    }

    return menuItems;
};
