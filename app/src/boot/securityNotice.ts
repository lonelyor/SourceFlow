import {Dialog} from "../dialog";
import {isMobile} from "../util/functions";
import {Constants} from "../constants";
import {setStorageVal} from "../protyle/util/compatibility";

const isChineseUI = () => {
    return window.sourceflow.config.lang === "zh_CN";
};

const SECURITY_FIRST_NOTICE_SECONDS = 10;

export const showFirstLaunchSecurityNotice = () => {
    const acknowledged = window.sourceflow.storage[Constants.LOCAL_SECURITY_FIRST_ACK];
    if (acknowledged) {
        return;
    }

    const zhTitle = "安全须知";
    const enTitle = "Security Notice";

    const zhContent = `
<div class="b3-dialog__content" style="padding: 24px 32px;">
    <div style="font-size: 16px; font-weight: bold; margin-bottom: 16px;">请务必阅读以下安全提示：</div>

    <div style="margin-bottom: 14px; padding: 12px; border-radius: 6px; background: var(--b3-theme-surface);">
        <div style="font-weight: bold; margin-bottom: 6px;">笔记数据存放</div>
        <div style="color: var(--b3-theme-on-surface);">
            笔记数据为本地加密存储，请勿将工作空间目录放置于同步网盘（如 OneDrive、iCloud、Dropbox、百度网盘等）中。
        </div>
        <div style="color: var(--b3-theme-error); font-weight: bold; margin-top: 6px;">
            同步网盘会导致文件冲突、数据损坏、内容丢失，且不可恢复！
        </div>
    </div>

    <div style="margin-bottom: 14px; padding: 12px; border-radius: 6px; background: var(--b3-theme-surface);">
        <div style="font-weight: bold; margin-bottom: 6px;">数据仓库密钥</div>
        <div style="color: var(--b3-theme-on-surface);">
            数据仓库密钥是加密和恢复数据的唯一凭证。丢失密钥意味着所有加密快照将永久无法恢复。
        </div>
        <div style="color: var(--b3-theme-error); font-weight: bold; margin-top: 6px;">
            密钥丢失后无法找回，所有加密备份数据将永久丢失！请务必将密钥独立备份到安全位置！
        </div>
    </div>

    <div style="margin-bottom: 14px; padding: 12px; border-radius: 6px; background: var(--b3-theme-surface);">
        <div style="font-weight: bold; margin-bottom: 6px;">备份建议</div>
        <div style="color: var(--b3-theme-on-surface);">
            建议使用本应用内置的快照备份功能进行数据备份，而非依赖外部同步工具。密钥请单独保存到密码管理器或纸质备份。
        </div>
        <div style="color: var(--b3-theme-error); font-weight: bold; margin-top: 6px;">
            不要将密钥和笔记数据存放在同一位置，否则一旦该位置出现问题将同时丢失数据和密钥！
        </div>
    </div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--text" id="securityFirstAckBtn" disabled style="opacity: 0.4;">
        我已知晓（<span id="securityCountdown">${SECURITY_FIRST_NOTICE_SECONDS}</span>s）
    </button>
</div>`;

    const enContent = `
<div class="b3-dialog__content" style="padding: 24px 32px;">
    <div style="font-size: 16px; font-weight: bold; margin-bottom: 16px;">Please read the following security notice carefully:</div>

    <div style="margin-bottom: 14px; padding: 12px; border-radius: 6px; background: var(--b3-theme-surface);">
        <div style="font-weight: bold; margin-bottom: 6px;">Note Data Storage</div>
        <div style="color: var(--b3-theme-on-surface);">
            Note data is stored locally with encryption. Do NOT place the workspace directory inside sync cloud drives (e.g. OneDrive, iCloud, Dropbox, Google Drive, etc.).
        </div>
        <div style="color: var(--b3-theme-error); font-weight: bold; margin-top: 6px;">
            Sync cloud drives will cause file conflicts, data corruption, and irreversible content loss!
        </div>
    </div>

    <div style="margin-bottom: 14px; padding: 12px; border-radius: 6px; background: var(--b3-theme-surface);">
        <div style="font-weight: bold; margin-bottom: 6px;">Data Repository Key</div>
        <div style="color: var(--b3-theme-on-surface);">
            The data repository key is the sole credential for encrypting and restoring your data. Losing the key means all encrypted snapshots become permanently unrecoverable.
        </div>
        <div style="color: var(--b3-theme-error); font-weight: bold; margin-top: 6px;">
            Lost keys cannot be recovered. All encrypted backup data will be permanently lost! Back up your key to a safe, independent location!
        </div>
    </div>

    <div style="margin-bottom: 14px; padding: 12px; border-radius: 6px; background: var(--b3-theme-surface);">
        <div style="font-weight: bold; margin-bottom: 6px;">Backup Recommendations</div>
        <div style="color: var(--b3-theme-on-surface);">
            Use the built-in snapshot backup feature for data backup instead of external sync tools. Save your key separately in a password manager or on paper.
        </div>
        <div style="color: var(--b3-theme-error); font-weight: bold; margin-top: 6px;">
            Do NOT store the key and note data in the same location. If that location fails, you lose both data and key simultaneously!
        </div>
    </div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--text" id="securityFirstAckBtn" disabled style="opacity: 0.4;">
        I Understand (<span id="securityCountdown">${SECURITY_FIRST_NOTICE_SECONDS}</span>s)
    </button>
</div>`;

    const dialog = new Dialog({
        title: isChineseUI() ? zhTitle : enTitle,
        content: isChineseUI() ? zhContent : enContent,
        width: isMobile() ? "92vw" : "560px",
        disableClose: true,
        hideCloseIcon: true,
    });
    dialog.element.setAttribute("data-key", Constants.DIALOG_SECURITY_NOTICE);

    let remaining = SECURITY_FIRST_NOTICE_SECONDS;
    const btnElement = dialog.element.querySelector("#securityFirstAckBtn") as HTMLButtonElement;
    const countdownElement = dialog.element.querySelector("#securityCountdown");

    const timer = window.setInterval(() => {
        remaining--;
        if (countdownElement) {
            countdownElement.textContent = remaining.toString();
        }
        if (remaining <= 0) {
            window.clearInterval(timer);
            if (btnElement) {
                btnElement.disabled = false;
                btnElement.style.opacity = "1";
                btnElement.textContent = isChineseUI() ? "我已知晓" : "I Understand";
            }
        }
    }, 1000);

    btnElement?.addEventListener("click", () => {
        if (btnElement.disabled) {
            return;
        }
        window.sourceflow.storage[Constants.LOCAL_SECURITY_FIRST_ACK] = true;
        setStorageVal(Constants.LOCAL_SECURITY_FIRST_ACK, true);
        dialog.destroy();
    });
};

export const showSecurityTip = () => {
    const neverRemind = window.sourceflow.storage[Constants.LOCAL_SECURITY_TIP_NEVER];
    if (neverRemind) {
        return;
    }

    const zhTip = "请确保数据仓库密钥已独立备份，且笔记数据未存放于同步网盘中。内置快照备份可存到云盘目录。";
    const enTip = "Ensure your data repo key is independently backed up and notes are not stored in sync cloud drives. Built-in snapshots can be saved to cloud directories.";
    const zhNeverRemind = "永久不提醒";
    const enNeverRemind = "Never remind again";

    const tipElement = document.createElement("div");
    tipElement.style.cssText = "position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:99999;max-width:520px;padding:12px 20px;border-radius:8px;background:var(--b3-theme-surface);box-shadow:0 4px 16px rgba(0,0,0,0.25);display:flex;align-items:center;gap:12px;font-size:14px;color:var(--b3-theme-on-surface);transition:opacity 0.3s;";
    tipElement.innerHTML = `
        <span style="flex:1;">${isChineseUI() ? zhTip : enTip}</span>
        <button id="securityTipClose" style="background:none;border:none;color:var(--b3-theme-on-surface);cursor:pointer;font-size:16px;padding:4px;">✕</button>
        <button id="securityTipNeverRemind" style="background:none;border:1px solid var(--b3-theme-on-surface-light);border-radius:4px;color:var(--b3-theme-on-surface-light);cursor:pointer;font-size:12px;padding:4px 8px;white-space:nowrap;">${isChineseUI() ? zhNeverRemind : enNeverRemind}</button>
    `;
    document.body.appendChild(tipElement);

    const fadeOut = () => {
        tipElement.style.opacity = "0";
        window.setTimeout(() => {
            tipElement.remove();
        }, 350);
    };

    const autoDismiss = window.setTimeout(fadeOut, 12000);

    tipElement.querySelector("#securityTipClose")?.addEventListener("click", () => {
        window.clearTimeout(autoDismiss);
        fadeOut();
    });

    tipElement.querySelector("#securityTipNeverRemind")?.addEventListener("click", () => {
        window.clearTimeout(autoDismiss);
        window.sourceflow.storage[Constants.LOCAL_SECURITY_TIP_NEVER] = true;
        setStorageVal(Constants.LOCAL_SECURITY_TIP_NEVER, true);
        fadeOut();
    });
};

export const deferSecurityNotice = () => {
    const run = () => {
        const firstAck = window.sourceflow.storage[Constants.LOCAL_SECURITY_FIRST_ACK];
        if (!firstAck) {
            showFirstLaunchSecurityNotice();
        } else {
            showSecurityTip();
        }
    };
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => run(), {timeout: 3000});
        return;
    }
    window.setTimeout(run, 1500);
};
