export const assistantInlineRecentLimit = 5;
export const assistantInlineMaxRounds = 3;

const recentStorageKey = "sourceflow.assistant.inline.recent";
const roundCounts = new Map<string, number>();

export const normalizeAssistantInlineInstruction = (value: string) => {
    return `${value || ""}`.replace(/\s+/g, " ").trim();
};

export const pushAssistantInlineRecentInstruction = (items: string[], instruction: string) => {
    const normalized = normalizeAssistantInlineInstruction(instruction);
    if (!normalized) {
        return items.slice(0, assistantInlineRecentLimit);
    }
    return [normalized].concat(items.filter((item) => item !== normalized)).slice(0, assistantInlineRecentLimit);
};

export const readAssistantInlineRecentInstructions = () => {
    try {
        const raw = window.localStorage?.getItem(recentStorageKey) || "[]";
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.map((item) => normalizeAssistantInlineInstruction(`${item || ""}`)).filter(Boolean).slice(0, assistantInlineRecentLimit)
            : [];
    } catch (_error) {
        return [];
    }
};

export const writeAssistantInlineRecentInstructions = (items: string[]) => {
    try {
        window.localStorage?.setItem(recentStorageKey, JSON.stringify(items.slice(0, assistantInlineRecentLimit)));
    } catch (_error) {
        // Ignore storage failures; the command can still run.
    }
};

export const rememberAssistantInlineInstruction = (instruction: string) => {
    const next = pushAssistantInlineRecentInstruction(readAssistantInlineRecentInstructions(), instruction);
    writeAssistantInlineRecentInstructions(next);
    return next;
};

export const buildAssistantInlineRoundKey = (rootID: string, blockID: string, selectedText: string) => {
    const normalizedSelection = normalizeAssistantInlineInstruction(selectedText).slice(0, 120);
    return [rootID, blockID, normalizedSelection].filter(Boolean).join("::");
};

export const claimAssistantInlineRound = (key: string) => {
    if (!key) {
        return {ok: true, round: 1};
    }
    const current = roundCounts.get(key) || 0;
    if (current >= assistantInlineMaxRounds) {
        return {ok: false, round: current};
    }
    const next = current + 1;
    roundCounts.set(key, next);
    return {ok: true, round: next};
};

export const resetAssistantInlineRounds = (key?: string) => {
    if (key) {
        roundCounts.delete(key);
        return;
    }
    roundCounts.clear();
};
