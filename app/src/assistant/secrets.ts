export type TAssistantAPIKeyAction = "keep" | "replace" | "clear";

export const ASSISTANT_SECRET_MASK = "******";

export const getAssistantSecretInputValue = (hasSecret?: boolean) => {
    return hasSecret ? ASSISTANT_SECRET_MASK : "";
};

export const getAssistantSecretPayload = (hasSecret: boolean, inputValue: string) => {
    const value = `${inputValue || ""}`;
    if (hasSecret && value === ASSISTANT_SECRET_MASK) {
        return {apiKey: "", apiKeyAction: "keep" as TAssistantAPIKeyAction};
    }
    const trimmed = value.trim();
    if (trimmed) {
        return {apiKey: trimmed, apiKeyAction: "replace" as TAssistantAPIKeyAction};
    }
    return {apiKey: "", apiKeyAction: "clear" as TAssistantAPIKeyAction};
};

export const getAssistantSecretPayloadFromInput = (hasSecret: boolean, input: HTMLInputElement | null) => {
    const value = input?.value || "";
    if (hasSecret && input?.dataset.secretDirty !== "true" && value === ASSISTANT_SECRET_MASK) {
        return getAssistantSecretPayload(hasSecret, ASSISTANT_SECRET_MASK);
    }
    return getAssistantSecretPayload(hasSecret, value);
};

export const clearAssistantSecretMaskBeforeEdit = (input: HTMLInputElement) => {
    if (input.dataset.secretMasked !== "true" || input.value !== ASSISTANT_SECRET_MASK) {
        return false;
    }
    input.value = "";
    input.dataset.secretDirty = "true";
    input.dataset.secretMasked = "false";
    return true;
};

export const normalizeAssistantSecretInputAfterEdit = (input: HTMLInputElement) => {
    if (input.dataset.secretMasked === "true" && input.value !== ASSISTANT_SECRET_MASK) {
        input.value = input.value.replace(ASSISTANT_SECRET_MASK, "");
        input.dataset.secretDirty = "true";
        input.dataset.secretMasked = "false";
    } else if (input.value !== ASSISTANT_SECRET_MASK) {
        input.dataset.secretDirty = "true";
    }
    return input.value;
};

export const shouldClearAssistantSecretMaskForKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
        return false;
    }
    return event.key.length === 1 || event.key === "Backspace" || event.key === "Delete";
};
