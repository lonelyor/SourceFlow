export type TAssistantInputRole = string;

export interface IAssistantInputFocusSnapshot {
    role: TAssistantInputRole;
    selectionStart: number;
    selectionEnd: number;
    selectionDirection: "forward" | "backward" | "none";
    scrollTop: number;
}

const isTextInput = (element: Element | null): element is HTMLInputElement | HTMLTextAreaElement => {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
};

const findTextInputByRole = (container: HTMLElement, role: TAssistantInputRole) => {
    const inputs = container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[data-role], textarea[data-role]");
    for (const input of Array.from(inputs)) {
        if (input.getAttribute("data-role") === role) {
            return input;
        }
    }
    return null;
};

export const isEventInsideContainer = (container: HTMLElement, event?: Event) => {
    const target = event?.target;
    if (target instanceof Node && container.contains(target)) {
        return true;
    }
    const activeElement = document.activeElement;
    return activeElement instanceof Node && container.contains(activeElement);
};

export const captureInputFocus = (
    container: HTMLElement,
    restorableRoles: readonly TAssistantInputRole[],
): IAssistantInputFocusSnapshot | null => {
    const activeElement = document.activeElement;
    if (!isTextInput(activeElement) || !container.contains(activeElement)) {
        return null;
    }
    const role = activeElement.getAttribute("data-role") || "";
    if (!restorableRoles.includes(role)) {
        return null;
    }
    const length = activeElement.value.length;
    return {
        role,
        selectionStart: activeElement.selectionStart ?? length,
        selectionEnd: activeElement.selectionEnd ?? length,
        selectionDirection: activeElement.selectionDirection || "none",
        scrollTop: activeElement.scrollTop,
    };
};

export const restoreInputFocus = (container: HTMLElement, snapshot: IAssistantInputFocusSnapshot | null) => {
    if (!snapshot) {
        return;
    }
    window.requestAnimationFrame(() => {
        const input = findTextInputByRole(container, snapshot.role);
        if (!isTextInput(input) || input.disabled) {
            return;
        }
        const length = input.value.length;
        const start = Math.min(snapshot.selectionStart, length);
        const end = Math.min(snapshot.selectionEnd, length);
        input.focus();
        input.setSelectionRange(start, end, snapshot.selectionDirection);
        input.scrollTop = snapshot.scrollTop;
    });
};
