import {fetchPost} from "../../util/fetch";

export const setReadOnly = (readOnly: boolean) => {
    window.sourceflow.config.editor.readOnly = readOnly;
    fetchPost("/api/setting/setEditor", window.sourceflow.config.editor);
};
