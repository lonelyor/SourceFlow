import {cloneSandboxData, createProtectedCallable, createSandboxProxyObject} from "./runtime";

type TFacadeElement = ReturnType<typeof createElementFacade>;

const FACADE_TARGET_SYMBOL = Symbol("sourceflowSandboxFacadeTarget");

const blockElementWrite = (label: string, property: string) => {
    throw new Error(`[${label}] cannot write ${property}`);
};

const unwrapElementArgument = (value: unknown) => {
    if (value && typeof value === "object" && FACADE_TARGET_SYMBOL in (value as Record<PropertyKey, unknown>)) {
        return (value as Record<PropertyKey, unknown>)[FACADE_TARGET_SYMBOL];
    }
    return value;
};

const elementFacadeCache = new WeakMap<Element, TFacadeElement>();
const classListFacadeCache = new WeakMap<DOMTokenList, unknown>();
const styleFacadeCache = new WeakMap<CSSStyleDeclaration, unknown>();
const datasetFacadeCache = new WeakMap<DOMStringMap, unknown>();
const eventFacadeCache = new WeakMap<Event, unknown>();
const listenerFacadeCache = new WeakMap<EventTarget, WeakMap<Function, Map<string, EventListener>>>();

const createArrayFacade = <T>(items: T[]) => {
    const values = items.slice();
    return createSandboxProxyObject("SandboxArray", {
        getters: {
            length: () => values.length,
            at: () => createProtectedCallable((index: number) => values[index] ?? undefined, "SandboxArray.at"),
            forEach: () => createProtectedCallable((callback: (value: T, index: number, array: T[]) => void) => {
                values.forEach((item, index) => callback(item, index, values as T[]));
            }, "SandboxArray.forEach"),
            map: () => createProtectedCallable((callback: (value: T, index: number, array: T[]) => unknown) => {
                return values.map((item, index) => callback(item, index, values as T[]));
            }, "SandboxArray.map"),
            find: () => createProtectedCallable((callback: (value: T, index: number, array: T[]) => boolean) => {
                return values.find((item, index) => callback(item, index, values as T[]));
            }, "SandboxArray.find"),
            filter: () => createProtectedCallable((callback: (value: T, index: number, array: T[]) => boolean) => {
                return values.filter((item, index) => callback(item, index, values as T[]));
            }, "SandboxArray.filter"),
            toArray: () => createProtectedCallable(() => values.slice(), "SandboxArray.toArray"),
            [Symbol.iterator]: () => createProtectedCallable(function* () {
                for (const item of values) {
                    yield item;
                }
            }, "SandboxArray.iterator"),
        },
        keys: ["length", "at", "forEach", "map", "find", "filter", "toArray", Symbol.iterator],
    });
};

const createDatasetFacade = (dataset: DOMStringMap) => {
    if (datasetFacadeCache.has(dataset)) {
        return datasetFacadeCache.get(dataset);
    }
    const facade = createSandboxProxyObject("SandboxDataset", {
        getters: new Proxy(Object.create(null), {
            get(_target, property: string) {
                if (typeof property !== "string") {
                    return undefined;
                }
                return () => dataset[property];
            },
        }),
        setters: new Proxy(Object.create(null), {
            get(_target, property: string) {
                if (typeof property !== "string") {
                    return undefined;
                }
                return (value: unknown) => {
                    dataset[property] = value == null ? "" : `${value}`;
                };
            },
        }),
    });
    datasetFacadeCache.set(dataset, facade);
    return facade;
};

const createClassListFacade = (classList: DOMTokenList) => {
    if (classListFacadeCache.has(classList)) {
        return classListFacadeCache.get(classList);
    }
    const facade = createSandboxProxyObject("SandboxClassList", {
        getters: {
            length: () => classList.length,
            value: () => classList.value,
            contains: () => createProtectedCallable((token: string) => classList.contains(token), "SandboxClassList.contains"),
            add: () => createProtectedCallable((...tokens: string[]) => {
                classList.add(...tokens.map((item) => `${item}`));
            }, "SandboxClassList.add"),
            remove: () => createProtectedCallable((...tokens: string[]) => {
                classList.remove(...tokens.map((item) => `${item}`));
            }, "SandboxClassList.remove"),
            toggle: () => createProtectedCallable((token: string, force?: boolean) => classList.toggle(`${token}`, force), "SandboxClassList.toggle"),
            item: () => createProtectedCallable((index: number) => classList.item(index), "SandboxClassList.item"),
            toString: () => createProtectedCallable(() => classList.value, "SandboxClassList.toString"),
        },
        keys: ["length", "value", "contains", "add", "remove", "toggle", "item", "toString"],
    });
    classListFacadeCache.set(classList, facade);
    return facade;
};

const createStyleFacade = (style: CSSStyleDeclaration) => {
    if (styleFacadeCache.has(style)) {
        return styleFacadeCache.get(style);
    }
    const facade = createSandboxProxyObject("SandboxStyle", {
        getters: new Proxy({
            cssText: () => style.cssText,
            getPropertyValue: () => createProtectedCallable((name: string) => style.getPropertyValue(name), "SandboxStyle.getPropertyValue"),
            setProperty: () => createProtectedCallable((name: string, value: string, priority = "") => {
                style.setProperty(name, value, priority);
            }, "SandboxStyle.setProperty"),
            removeProperty: () => createProtectedCallable((name: string) => style.removeProperty(name), "SandboxStyle.removeProperty"),
        }, {
            get(target, property: string) {
                if (property in target) {
                    return target[property as keyof typeof target];
                }
                if (typeof property !== "string") {
                    return undefined;
                }
                return () => (style as unknown as Record<string, unknown>)[property];
            },
        }) as Record<string, () => unknown>,
        setters: new Proxy({
            cssText: (value: unknown) => {
                style.cssText = value == null ? "" : `${value}`;
            },
        }, {
            get(target, property: string) {
                if (property in target) {
                    return target[property as keyof typeof target];
                }
                if (typeof property !== "string") {
                    return undefined;
                }
                return (value: unknown) => {
                    (style as unknown as Record<string, unknown>)[property] = value == null ? "" : `${value}`;
                };
            },
        }) as Record<string, (value: unknown) => void>,
    });
    styleFacadeCache.set(style, facade);
    return facade;
};

const createEventFacade = (event: Event, currentTarget?: Element) => {
    if (eventFacadeCache.has(event)) {
        return eventFacadeCache.get(event);
    }
    const getTargetFacade = (target: EventTarget | null) => {
        if (target instanceof Element) {
            return createElementFacade(target);
        }
        return null;
    };
    const facade = createSandboxProxyObject("SandboxEvent", {
        getters: {
            type: () => event.type,
            detail: () => cloneSandboxData((event as CustomEvent).detail),
            key: () => (event as KeyboardEvent).key,
            code: () => (event as KeyboardEvent).code,
            button: () => (event as MouseEvent).button,
            buttons: () => (event as MouseEvent).buttons,
            clientX: () => (event as MouseEvent).clientX,
            clientY: () => (event as MouseEvent).clientY,
            pageX: () => (event as MouseEvent).pageX,
            pageY: () => (event as MouseEvent).pageY,
            deltaX: () => (event as WheelEvent).deltaX,
            deltaY: () => (event as WheelEvent).deltaY,
            deltaMode: () => (event as WheelEvent).deltaMode,
            defaultPrevented: () => event.defaultPrevented,
            ctrlKey: () => (event as KeyboardEvent).ctrlKey,
            shiftKey: () => (event as KeyboardEvent).shiftKey,
            altKey: () => (event as KeyboardEvent).altKey,
            metaKey: () => (event as KeyboardEvent).metaKey,
            target: () => getTargetFacade(event.target),
            currentTarget: () => currentTarget ? createElementFacade(currentTarget) : getTargetFacade(event.currentTarget),
            preventDefault: () => createProtectedCallable(() => event.preventDefault(), "SandboxEvent.preventDefault"),
            stopPropagation: () => createProtectedCallable(() => event.stopPropagation(), "SandboxEvent.stopPropagation"),
            stopImmediatePropagation: () => createProtectedCallable(() => event.stopImmediatePropagation(), "SandboxEvent.stopImmediatePropagation"),
        },
        keys: ["type", "detail", "key", "code", "button", "buttons", "clientX", "clientY", "pageX", "pageY", "deltaX", "deltaY", "deltaMode", "defaultPrevented", "ctrlKey", "shiftKey", "altKey", "metaKey", "target", "currentTarget", "preventDefault", "stopPropagation", "stopImmediatePropagation"],
    });
    eventFacadeCache.set(event, facade);
    return facade;
};

const getListenerWrapper = (target: EventTarget, handler: Function, type: string, element: Element) => {
    let targetMap = listenerFacadeCache.get(target);
    if (!targetMap) {
        targetMap = new WeakMap<Function, Map<string, EventListener>>();
        listenerFacadeCache.set(target, targetMap);
    }
    let handlerMap = targetMap.get(handler);
    if (!handlerMap) {
        handlerMap = new Map<string, EventListener>();
        targetMap.set(handler, handlerMap);
    }
    if (!handlerMap.has(type)) {
        handlerMap.set(type, (event: Event) => {
            handler.call(createElementFacade(element), createEventFacade(event, element));
        });
    }
    return handlerMap.get(type);
};

export const createElementFacade = (element: Element | null): any => {
    if (!element) {
        return null;
    }
    if (elementFacadeCache.has(element)) {
        return elementFacadeCache.get(element);
    }
    const htmlElement = element as HTMLElement;
    const facade = createSandboxProxyObject("SandboxElement", {
        getters: {
            [FACADE_TARGET_SYMBOL]: () => element,
            tagName: () => element.tagName,
            id: () => element.id,
            className: () => htmlElement.className,
            textContent: () => element.textContent,
            innerHTML: () => htmlElement.innerHTML,
            innerText: () => htmlElement.innerText,
            value: () => (htmlElement as HTMLInputElement).value,
            placeholder: () => (htmlElement as HTMLInputElement).placeholder,
            checked: () => (htmlElement as HTMLInputElement).checked,
            disabled: () => (htmlElement as HTMLInputElement).disabled,
            hidden: () => htmlElement.hidden,
            href: () => (htmlElement as HTMLAnchorElement).href,
            src: () => (htmlElement as HTMLImageElement).src,
            childElementCount: () => element.childElementCount,
            clientWidth: () => htmlElement.clientWidth,
            clientHeight: () => htmlElement.clientHeight,
            scrollWidth: () => htmlElement.scrollWidth,
            scrollHeight: () => htmlElement.scrollHeight,
            offsetWidth: () => htmlElement.offsetWidth,
            offsetHeight: () => htmlElement.offsetHeight,
            dataset: () => createDatasetFacade(htmlElement.dataset),
            classList: () => createClassListFacade(htmlElement.classList),
            style: () => createStyleFacade(htmlElement.style),
            firstElementChild: () => createElementFacade(element.firstElementChild),
            lastElementChild: () => createElementFacade(element.lastElementChild),
            nextElementSibling: () => createElementFacade(element.nextElementSibling),
            previousElementSibling: () => createElementFacade(element.previousElementSibling),
            querySelector: () => createProtectedCallable((selector: string) => createElementFacade(element.querySelector(selector)), "SandboxElement.querySelector"),
            querySelectorAll: () => createProtectedCallable((selector: string) => {
                return createArrayFacade(Array.from(element.querySelectorAll(selector)).map((item) => createElementFacade(item)));
            }, "SandboxElement.querySelectorAll"),
            getAttribute: () => createProtectedCallable((name: string) => element.getAttribute(name), "SandboxElement.getAttribute"),
            hasAttribute: () => createProtectedCallable((name: string) => element.hasAttribute(name), "SandboxElement.hasAttribute"),
            matches: () => createProtectedCallable((selector: string) => element.matches(selector), "SandboxElement.matches"),
            closest: () => createProtectedCallable((selector: string) => createElementFacade(element.closest(selector)), "SandboxElement.closest"),
            setAttribute: () => createProtectedCallable((name: string, value: unknown) => {
                element.setAttribute(name, value == null ? "" : `${value}`);
            }, "SandboxElement.setAttribute"),
            removeAttribute: () => createProtectedCallable((name: string) => {
                element.removeAttribute(name);
            }, "SandboxElement.removeAttribute"),
            toggleAttribute: () => createProtectedCallable((name: string, force?: boolean) => element.toggleAttribute(name, force), "SandboxElement.toggleAttribute"),
            insertAdjacentHTML: () => createProtectedCallable((position: InsertPosition, html: string) => {
                htmlElement.insertAdjacentHTML(position, html);
            }, "SandboxElement.insertAdjacentHTML"),
            insertAdjacentText: () => createProtectedCallable((position: InsertPosition, text: string) => {
                htmlElement.insertAdjacentText(position, text);
            }, "SandboxElement.insertAdjacentText"),
            replaceChildren: () => createProtectedCallable((...nodes: unknown[]) => {
                htmlElement.replaceChildren(...nodes.map((item) => unwrapElementArgument(item) as Node | string));
            }, "SandboxElement.replaceChildren"),
            append: () => createProtectedCallable((...nodes: unknown[]) => {
                htmlElement.append(...nodes.map((item) => unwrapElementArgument(item) as Node | string));
            }, "SandboxElement.append"),
            prepend: () => createProtectedCallable((...nodes: unknown[]) => {
                htmlElement.prepend(...nodes.map((item) => unwrapElementArgument(item) as Node | string));
            }, "SandboxElement.prepend"),
            remove: () => createProtectedCallable(() => {
                htmlElement.remove();
            }, "SandboxElement.remove"),
            focus: () => createProtectedCallable(() => htmlElement.focus(), "SandboxElement.focus"),
            blur: () => createProtectedCallable(() => htmlElement.blur(), "SandboxElement.blur"),
            click: () => createProtectedCallable(() => htmlElement.click(), "SandboxElement.click"),
            addEventListener: () => createProtectedCallable((type: string, handler: EventListener) => {
                if (typeof handler !== "function") {
                    return;
                }
                htmlElement.addEventListener(type, getListenerWrapper(htmlElement, handler, type, htmlElement));
            }, "SandboxElement.addEventListener"),
            removeEventListener: () => createProtectedCallable((type: string, handler: EventListener) => {
                if (typeof handler !== "function") {
                    return;
                }
                const wrapped = getListenerWrapper(htmlElement, handler, type, htmlElement);
                htmlElement.removeEventListener(type, wrapped);
            }, "SandboxElement.removeEventListener"),
        },
        setters: {
            className: (value: unknown) => {
                htmlElement.className = value == null ? "" : `${value}`;
            },
            textContent: (value: unknown) => {
                element.textContent = value == null ? "" : `${value}`;
            },
            innerHTML: (value: unknown) => {
                htmlElement.innerHTML = value == null ? "" : `${value}`;
            },
            innerText: (value: unknown) => {
                htmlElement.innerText = value == null ? "" : `${value}`;
            },
            value: (value: unknown) => {
                (htmlElement as HTMLInputElement).value = value == null ? "" : `${value}`;
            },
            placeholder: (value: unknown) => {
                (htmlElement as HTMLInputElement).placeholder = value == null ? "" : `${value}`;
            },
            checked: (value: unknown) => {
                (htmlElement as HTMLInputElement).checked = !!value;
            },
            disabled: (value: unknown) => {
                (htmlElement as HTMLInputElement).disabled = !!value;
            },
            hidden: (value: unknown) => {
                htmlElement.hidden = !!value;
            },
        },
    });
    elementFacadeCache.set(element, facade);
    return facade;
};

export const createContainerFacade = (container: HTMLElement) => {
    return createElementFacade(container);
};

export const assertContainerFacadeWrite = (label: string, property: string) => {
    return blockElementWrite(label, property);
};
