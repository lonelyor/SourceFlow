import {fetchSyncPost} from "../../util/fetch";
import {hasClosestBlock} from "../../protyle/util/hasClosest";
import {invalidateAssistantNoteContextCache} from "../common/note";

interface IReplaceSelectionOptions {
    protyle: IProtyle;
    range?: Range | null;
    selectedText: string;
}

const countTextOccurrences = (text: string, needle: string) => {
    if (!needle) {
        return 0;
    }
    let count = 0;
    let index = text.indexOf(needle);
    while (index > -1) {
        count += 1;
        index = text.indexOf(needle, index + needle.length);
    }
    return count;
};

export const replaceCurrentSelection = async (options: IReplaceSelectionOptions, translation: string) => {
    const selection = getSelection();
    const range = options.range || (selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null);
    if (!range) {
        return false;
    }
    const block = hasClosestBlock(range.startContainer) as HTMLElement | null;
    const blockID = block?.getAttribute("data-node-id") || "";
    if (!blockID || !options.selectedText || !translation) {
        return false;
    }
    const blockResponse = await fetchSyncPost("/api/block/getBlockInfo", {id: blockID});
    if (blockResponse.code !== 0) {
        return false;
    }
    const blockMarkdown = `${blockResponse.data?.root?.content || blockResponse.data?.content || ""}`;
    if (!blockMarkdown) {
        return false;
    }
    const before = options.selectedText;
    if (countTextOccurrences(blockMarkdown, before) !== 1) {
        return false;
    }
    const response = await fetchSyncPost("/api/block/updateBlock", {
        id: blockID,
        data: blockMarkdown.replace(before, translation),
        dataType: "markdown",
    });
    if (response.code === 0) {
        invalidateAssistantNoteContextCache(blockID);
    }
    return response.code === 0;
};
