import {escapeAttr, escapeHTML} from "../common/dom";
import {assistantText} from "../constants";
import type {TSecurityMode} from "./types";

const modeLabels: Record<TSecurityMode, {icon: string; label: string; labelEn: string; desc: string; descEn: string}> = {
    default: {
        icon: "🟢",
        label: "默认权限",
        labelEn: "Default",
        desc: "只读+建议",
        descEn: "Read-only & suggestions",
    },
    autoReview: {
        icon: "🟡",
        label: "自动审查",
        labelEn: "Auto Review",
        desc: "低风险快速确认",
        descEn: "Low-risk quick confirm",
    },
    fullAccess: {
        icon: "🔴",
        label: "完全访问",
        labelEn: "Full Access",
        desc: "读写执行",
        descEn: "Read, write, execute",
    },
};

export const renderSecurityModeSwitcher = (currentMode: TSecurityMode): string => {
    const current = modeLabels[currentMode] || modeLabels.default;
    const label = assistantText(`${current.icon} ${current.label}`, `${current.icon} ${current.labelEn}`);
    const hint = assistantText("点击切换权限模式", "Click to switch permission mode");
    return `<button type="button" class="assistant-ai__security-mode" data-action="toggle-security-mode" aria-label="${escapeAttr(hint)}" title="${escapeAttr(hint)}">
    ${escapeHTML(label)}
</button>`;
};

export const renderSecurityModeDropdown = (currentMode: TSecurityMode, visible: boolean): string => {
    if (!visible) return "";
    return `<div class="assistant-ai__security-dropdown" data-role="security-dropdown">
    ${(["default", "autoReview", "fullAccess"] as TSecurityMode[]).map((mode) => {
        const m = modeLabels[mode];
        const isActive = mode === currentMode;
        return `<div class="assistant-ai__security-option${isActive ? " assistant-ai__security-option--active" : ""}" data-action="set-security-mode" data-mode="${mode}">
            <span class="assistant-ai__security-option-icon">${m.icon}</span>
            <span class="assistant-ai__security-option-text">
                <span class="assistant-ai__security-option-label">${escapeHTML(assistantText(m.label, m.labelEn))}</span>
                <span class="assistant-ai__security-option-desc">${escapeHTML(assistantText(m.desc, m.descEn))}</span>
            </span>
        </div>`;
    }).join("")}
</div>`;
};

export const renderEscalationDialog = (options: {
    currentMode: TSecurityMode;
    risk: string;
    target: string;
    visible: boolean;
    allowUpgrade?: boolean;
}): string => {
    if (!options.visible) return "";
    return `<div class="assistant-ai__escalation-overlay" data-role="escalation-overlay">
    <div class="assistant-ai__escalation-dialog">
        <div class="assistant-ai__escalation-title">${escapeHTML(assistantText("需要写入权限", "Write permission required"))}</div>
        <div class="assistant-ai__escalation-info">
            <div class="assistant-ai__escalation-row">
                <span class="assistant-ai__escalation-label">${escapeHTML(assistantText("当前模式", "Current mode"))}</span>
                <span>${escapeHTML(assistantText(modeLabels[options.currentMode].label, modeLabels[options.currentMode].labelEn))}</span>
            </div>
            <div class="assistant-ai__escalation-row">
                <span class="assistant-ai__escalation-label">${escapeHTML(assistantText("请求操作", "Requested"))}</span>
                <span>${escapeHTML(options.risk)}</span>
            </div>
            <div class="assistant-ai__escalation-row">
                <span class="assistant-ai__escalation-label">${escapeHTML(assistantText("目标", "Target"))}</span>
                <span>${escapeHTML(options.target)}</span>
            </div>
        </div>
        <div class="assistant-ai__escalation-actions">
            <button type="button" class="b3-button b3-button--outline" data-action="escalation-allow-once">${escapeHTML(assistantText("本次允许", "Allow once"))}</button>
            ${options.allowUpgrade === false ? "" : `<button type="button" class="b3-button b3-button--outline" data-action="escalation-upgrade-auto">${escapeHTML(assistantText("提升为自动审查", "Upgrade to Auto Review"))}</button>`}
            <button type="button" class="b3-button b3-button--outline" data-action="escalation-reject">${escapeHTML(assistantText("拒绝", "Reject"))}</button>
        </div>
    </div>
</div>`;
};
