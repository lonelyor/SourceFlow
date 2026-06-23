type TZenModeExitHandler = () => void;

const ZEN_MODE_EXIT_BUTTON_ID = "sourceflowZenModeExit";

let currentExitHandler: TZenModeExitHandler | null = null;

const getZenModeExitLabel = () => {
    const languages = window.sourceflow?.languages || {};
    if (languages.zModeExit) {
        return languages.zModeExit;
    }
    const lang = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase();
    return lang.startsWith("zh") ? "退出 Z 模式" : "Exit Z Mode";
};

const handleZenModeExitClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    currentExitHandler?.();
};

export const showZenModeExitButton = (handler: TZenModeExitHandler) => {
    currentExitHandler = handler;
    let button = document.getElementById(ZEN_MODE_EXIT_BUTTON_ID) as HTMLButtonElement | null;
    if (!button) {
        button = document.createElement("button");
        button.id = ZEN_MODE_EXIT_BUTTON_ID;
        button.type = "button";
        button.className = "sourceflow-zen-exit ariaLabel";
        button.innerHTML = '<svg><use xlink:href="#iconCloseRound"></use></svg><span data-role="label"></span>';
        button.addEventListener("click", handleZenModeExitClick);
        document.body.appendChild(button);
    }
    const label = getZenModeExitLabel();
    button.setAttribute("aria-label", label);
    const labelElement = button.querySelector('[data-role="label"]');
    if (labelElement) {
        labelElement.textContent = label;
    }
    button.classList.remove("fn__none");
};

export const hideZenModeExitButton = () => {
    currentExitHandler = null;
    const button = document.getElementById(ZEN_MODE_EXIT_BUTTON_ID);
    button?.remove();
};
