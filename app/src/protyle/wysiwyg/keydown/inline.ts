import {fetchPost} from "../../../util/fetch";

export const getContentByInlineHTML = (range: Range, cb: (content: string) => void) => {
    let html = "";
    Array.from(range.cloneContents().childNodes).forEach((item: HTMLElement) => {
        if (item.nodeType === 3) {
            html += item.textContent;
        } else {
            html += item.outerHTML;
        }
    });
    fetchPost("/api/block/getDOMText", {dom: html}, (response) => {
        cb(response.data);
    });
};
