const EMPTY_EMOJI_CONF: IEmoji[] = [{
    id: "__bootstrap__",
    title: "",
    title_zh_cn: "",
    title_ja_jp: "",
    items: [],
}];

let emojiConfLoaded = false;
let emojiConfPromise: Promise<IEmoji[]> | undefined;

const cloneEmptyEmojiConf = () => EMPTY_EMOJI_CONF.map((item) => ({
    ...item,
    items: [...item.items],
}));

const normalizeEmojiConf = (emojis?: IEmoji[]) => {
    if (Array.isArray(emojis) && emojis.length > 0) {
        return emojis;
    }
    return cloneEmptyEmojiConf();
};

export const setInitialEmojiConf = () => {
    if (!Array.isArray(window.sourceflow.emojis) || window.sourceflow.emojis.length === 0) {
        window.sourceflow.emojis = cloneEmptyEmojiConf();
    }
};

const fetchEmojiConf = async () => {
    try {
        const response = await fetch("/api/system/getEmojiConf", {
            method: "POST",
        });
        if (!response.ok) {
            throw new Error(`emoji conf request failed: ${response.status}`);
        }
        const data = await response.json();
        return normalizeEmojiConf(data.data as IEmoji[]);
    } catch (error) {
        console.warn("load emoji conf failed", error);
        return normalizeEmojiConf(window.sourceflow.emojis);
    }
};

export const ensureEmojiConfLoaded = () => {
    setInitialEmojiConf();
    if (emojiConfLoaded) {
        return Promise.resolve(window.sourceflow.emojis);
    }
    if (!emojiConfPromise) {
        emojiConfPromise = fetchEmojiConf().then(async (emojis) => {
            const {applyEmojiConf} = await import("./index");
            applyEmojiConf(emojis);
            emojiConfLoaded = true;
            return window.sourceflow.emojis;
        }).finally(() => {
            emojiConfPromise = undefined;
        });
    }
    return emojiConfPromise;
};

export const deferEmojiConfLoad = () => {
    const runner = () => {
        void ensureEmojiConfLoaded();
    };
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => runner(), {timeout: 1500});
        return;
    }
    window.setTimeout(runner, 0);
};
