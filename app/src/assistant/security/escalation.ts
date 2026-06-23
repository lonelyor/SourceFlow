import {assistantText} from "../constants";
import {renderEscalationDialog} from "./modeSwitcher";
import type {TSecurityMode} from "./types";

export type TSecurityEscalationAction = "allow-once" | "upgrade-auto" | "reject";

export const requestSecurityEscalation = (options: {
    currentMode: TSecurityMode;
    risk: string;
    target: string;
    reason?: string;
    allowUpgrade?: boolean;
}): Promise<TSecurityEscalationAction> => {
    return new Promise((resolve) => {
        const host = document.createElement("div");
        host.innerHTML = renderEscalationDialog({
            currentMode: options.currentMode,
            risk: options.risk,
            target: options.reason
                ? `${options.target}\n${options.reason}`
                : options.target,
            visible: true,
            allowUpgrade: options.allowUpgrade !== false,
        });
        const cleanup = (action: TSecurityEscalationAction) => {
            host.remove();
            resolve(action);
        };
        host.addEventListener("click", (event) => {
            const target = event.target as HTMLElement;
            const action = target?.getAttribute("data-action");
            if (action === "escalation-allow-once") {
                cleanup("allow-once");
                return;
            }
            if (action === "escalation-upgrade-auto") {
                cleanup("upgrade-auto");
                return;
            }
            if (action === "escalation-reject" || target?.getAttribute("data-role") === "escalation-overlay") {
                cleanup("reject");
            }
        });
        host.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                cleanup("reject");
            }
        });
        document.body.appendChild(host);
        const dialog = host.querySelector(".assistant-ai__escalation-dialog") as HTMLElement | null;
        dialog?.setAttribute("tabindex", "-1");
        dialog?.focus();
        if (!dialog) {
            cleanup("reject");
        }
    });
};

export const securityEscalationRejectedMessage = () => assistantText("已拒绝本次 AI 操作", "Rejected this AI operation");
