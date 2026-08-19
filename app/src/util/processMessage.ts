/// #if !MOBILE
import {exportLayout} from "../layout/util";
/// #endif
import {hideMessage, showMessage} from "../dialog/message";
import {setStorageVal} from "../protyle/util/compatibility";
import {Constants} from "../constants";
import {isBrowser} from "./functions";

export const processMessage = (response: IWebSocketData) => {
    if ("msg" === response.cmd) {
        showMessage(response.msg, response.data.closeTimeout, response.code === 0 ? "info" : "error", response.data.id);
        return false;
    }
    if ("cmsg" === response.cmd) {
        hideMessage(response.data.id);
        return false;
    }
    if ("cprogress" === response.cmd) {
        const progressElement = document.getElementById("progress");
        if (progressElement) {
            progressElement.remove();
        }
        return false;
    }
    if ("reloadui" === response.cmd) {
        if (response.data?.resetScroll) {
            window.sourceflow.storage[Constants.LOCAL_FILEPOSITION] = {};
            setStorageVal(Constants.LOCAL_FILEPOSITION, window.sourceflow.storage[Constants.LOCAL_FILEPOSITION], () => {
                /// #if MOBILE
                window.location.reload();
                /// #else
                exportLayout({
                    cb() {
                        window.location.reload();
                    },
                    errorExit: false,
                });
                /// #endif
            });
        } else {
            /// #if MOBILE
            window.location.reload();
            /// #else
            exportLayout({
                cb() {
                    window.location.reload();
                },
                errorExit: false,
            });
            /// #endif
        }
        return false;
    }
    if ("closepublishpage" === response.cmd) {
        handlePublishServiceClosed(response.msg);
        return false;
    }

    // 小于 0 为提示：-2 提示；-1 报错，大于 0 的错误需处理，等于 0 的为正常操作
    if (response.code < 0) {
        showMessage(response.msg, response.data ? (response.data.closeTimeout || 0) : 0, response.code === -1 ? "error" : "info");
        return false;
    }

    return response;
};

export const handlePublishServiceClosed = (msg: string) => {
    if (isBrowser()) {
        sessionStorage.setItem("sourceflowPublishServiceClosed", msg || "");
        window.location.reload();
    }
};

export const checkPublishServiceClosed = (): boolean => {
    if (isBrowser()) {
        const publishServiceClosedMsg = sessionStorage.getItem("sourceflowPublishServiceClosed");
        if (publishServiceClosedMsg) {
            sessionStorage.removeItem("sourceflowPublishServiceClosed");
            document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh">${publishServiceClosedMsg}</div>`;
            return true;
        }
    }
    return false;
};
