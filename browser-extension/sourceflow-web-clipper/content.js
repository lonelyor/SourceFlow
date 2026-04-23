const CONTENT_CANDIDATE_SELECTORS = [
    "article",
    "main",
    "[role='main']",
    ".article",
    ".article-content",
    ".article-body",
    ".post",
    ".post-content",
    ".post-body",
    ".entry-content",
    ".entry-body",
    ".content",
    ".markdown-body",
    ".rich-text",
    ".doc-content",
];
const NOISE_SELECTOR = [
    "script",
    "style",
    "noscript",
    "template",
    "canvas",
    "svg",
    "form",
    "button",
    "input",
    "select",
    "textarea",
    "label",
    "dialog",
    "nav",
    "aside",
    "footer",
    ".ads",
    ".advertisement",
    ".share",
    ".social",
    ".toolbar",
    ".sidebar",
    ".cookie",
    ".newsletter",
    ".recommend",
    ".related",
    ".comments",
    ".comment",
];
const NOISE_NAME_PATTERN = /(comment|footer|header|breadcrumb|nav|sidebar|share|social|toolbar|banner|cookie|advert|promo|recommend|related|subscribe|signup|login|register|modal|popup|drawer|float|sticky|pager|pagination)/i;
const EMBEDDED_MEDIA_TEXT = "嵌入内容";
const ALLOWED_ATTRS = new Set(["href", "src", "poster", "srcset", "alt", "title", "colspan", "rowspan", "start", "datetime", "open"]);
const CODE_LANGUAGE_PATTERN = /\b(language|lang)-[a-z0-9_+-]+\b/i;
const LAZY_URL_ATTRS = ["src", "data-src", "data-original", "data-url", "data-lazy-src", "data-actualsrc", "data-fallback-src"];
const LAZY_SRCSET_ATTRS = ["srcset", "data-srcset", "data-lazy-srcset"];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "extract-page") {
        return;
    }

    try {
        const payload = extractPage(message.clipType || "full");
        sendResponse(payload);
    } catch (error) {
        sendResponse({
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return true;
});

function extractPage(clipType) {
    const effectiveClipType = clipType === "part" && hasSelection() ? "part" : "full";
    const snapshotDocument = effectiveClipType === "part"
        ? buildSelectionSnapshotDocument()
        : buildReadableSnapshotDocument();
    absolutizeResources(snapshotDocument.documentElement);
    const assetURLs = collectAssetURLs(snapshotDocument.documentElement);

    return {
        dom: snapshotDocument.documentElement.outerHTML,
        assetURLs,
        effectiveClipType,
        url: location.href,
        title: pickPageTitle(),
    };
}

function hasSelection() {
    const selection = window.getSelection();
    return !!selection && selection.rangeCount > 0 && !selection.isCollapsed;
}

function pickPageTitle() {
    const h1 = document.querySelector("h1");
    const heading = normalizeText(h1?.textContent || "");
    if (heading && heading.length >= 4) {
        return heading;
    }
    const ogTitle = document.querySelector("meta[property='og:title'], meta[name='twitter:title']");
    const metaTitle = normalizeText(ogTitle?.getAttribute("content") || "");
    if (metaTitle && metaTitle.length >= 4) {
        return metaTitle;
    }
    return normalizeText(document.title || "") || "网页导入";
}

function createSnapshotDocument(titleText) {
    const html = document.implementation.createHTMLDocument(titleText || "SourceFlow Capture");
    html.head.innerHTML = `
        <meta charset="utf-8">
        <base href="${escapeAttribute(location.href)}">
        <title>${escapeHTML(titleText || "SourceFlow Capture")}</title>
    `;
    return html;
}

function buildSelectionSnapshotDocument() {
    const html = createSnapshotDocument(pickPageTitle());
    const article = html.createElement("article");
    article.setAttribute("data-sourceflow-capture", "selection");

    const selection = window.getSelection();
    for (let i = 0; i < selection.rangeCount; i += 1) {
        const range = selection.getRangeAt(i);
        const wrapper = html.createElement("section");
        wrapper.appendChild(range.cloneContents());
        article.appendChild(wrapper);
    }

    cleanSnapshotRoot(article);
    html.body.appendChild(article);
    return html;
}

function buildReadableSnapshotDocument() {
    const html = createSnapshotDocument(pickPageTitle());
    const article = html.createElement("article");
    article.setAttribute("data-sourceflow-capture", "full");

    let sourceRoot = selectReadableRoot();
    if (!sourceRoot) {
        sourceRoot = document.body || document.documentElement;
    }

    const clonedRoot = sourceRoot.cloneNode(true);
    cleanSnapshotRoot(clonedRoot);

    if (clonedRoot.childNodes.length === 0 && document.body && sourceRoot !== document.body) {
        const fallbackRoot = document.body.cloneNode(true);
        cleanSnapshotRoot(fallbackRoot);
        appendSnapshotContent(article, fallbackRoot);
    } else {
        appendSnapshotContent(article, clonedRoot);
    }

    html.body.appendChild(article);
    return html;
}

function appendSnapshotContent(container, root) {
    if (root.tagName === "BODY") {
        while (root.firstChild) {
            container.appendChild(root.firstChild);
        }
        return;
    }
    container.appendChild(root);
}

function selectReadableRoot() {
    const seen = new Set();
    const candidates = [];

    document.querySelectorAll(CONTENT_CANDIDATE_SELECTORS.join(",")).forEach((element) => {
        if (seen.has(element)) {
            return;
        }
        seen.add(element);
        candidates.push(element);
    });

    for (const child of Array.from(document.body?.children || [])) {
        if (!(child instanceof HTMLElement) || seen.has(child)) {
            continue;
        }
        seen.add(child);
        candidates.push(child);
    }

    let bestElement = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
        const score = scoreReadableCandidate(candidate);
        if (score > bestScore) {
            bestScore = score;
            bestElement = candidate;
        }
    }

    return bestScore >= 120 ? bestElement : null;
}

function scoreReadableCandidate(element) {
    if (!(element instanceof HTMLElement)) {
        return -Infinity;
    }
    if (!isElementVisible(element)) {
        return -Infinity;
    }
    if (isNoiseContainer(element)) {
        return -Infinity;
    }

    const text = normalizeText(element.innerText || "");
    const textLength = text.length;
    const paragraphCount = element.querySelectorAll("p").length;
    const headingCount = element.querySelectorAll("h1, h2, h3, h4, h5, h6").length;
    const imageCount = element.querySelectorAll("img, picture").length;
    const codeCount = element.querySelectorAll("pre, code").length;
    const linkTextLength = Array.from(element.querySelectorAll("a")).reduce((sum, link) => {
        return sum + normalizeText(link.innerText || "").length;
    }, 0);
    const linkDensity = textLength > 0 ? linkTextLength / textLength : 1;
    const depthPenalty = getDomDepth(element) * 4;
    const tagBonus = element.tagName === "ARTICLE"
        ? 520
        : element.tagName === "MAIN"
            ? 360
            : element.getAttribute("role") === "main"
                ? 280
                : 0;
    const score = textLength
        + paragraphCount * 60
        + headingCount * 32
        + imageCount * 24
        + codeCount * 42
        + tagBonus
        - Math.round(linkDensity * 900)
        - depthPenalty;

    if (textLength < 120 && imageCount === 0 && codeCount === 0) {
        return -Infinity;
    }
    return score;
}

function isElementVisible(element) {
    if (element.hidden || element.getAttribute("aria-hidden") === "true") {
        return false;
    }
    const style = window.getComputedStyle(element);
    if (!style || style.display === "none" || style.visibility === "hidden") {
        return false;
    }
    return true;
}

function isNoiseContainer(element) {
    const name = `${element.id || ""} ${element.className || ""}`.trim();
    return !!name && NOISE_NAME_PATTERN.test(name);
}

function getDomDepth(element) {
    let depth = 0;
    let current = element;
    while (current?.parentElement) {
        depth += 1;
        current = current.parentElement;
    }
    return depth;
}

function cleanSnapshotRoot(root) {
    root.querySelectorAll(NOISE_SELECTOR.join(",")).forEach((element) => element.remove());

    for (const element of Array.from(root.querySelectorAll("*"))) {
        if (shouldDropElement(element)) {
            element.remove();
            continue;
        }
        normalizeMediaElement(element);
        sanitizeElementAttributes(element);
    }

    removeEmptyElements(root);
}

function shouldDropElement(element) {
    if (element.hidden || element.getAttribute("aria-hidden") === "true") {
        return true;
    }
    const style = (element.getAttribute("style") || "").toLowerCase();
    if (style.includes("display:none") || style.includes("visibility:hidden")) {
        return true;
    }
    return isNoiseContainer(element);
}

function normalizeMediaElement(element) {
    const tagName = element.tagName;
    if (tagName === "IMG") {
        const src = pickBestURLFromAttributes(element, LAZY_URL_ATTRS);
        if (src && !isIgnoredURL(src)) {
            element.setAttribute("src", src);
        }
        const srcset = pickBestURLFromAttributes(element, LAZY_SRCSET_ATTRS);
        if (srcset) {
            element.setAttribute("srcset", srcset);
        }
        return;
    }

    if (tagName === "PICTURE") {
        const img = element.querySelector("img");
        if (!img) {
            return;
        }
        const pictureSrc = pickBestURLFromAttributes(img, LAZY_URL_ATTRS)
            || pickBestURLFromAttributes(element.querySelector("source"), LAZY_URL_ATTRS);
        if (pictureSrc && !isIgnoredURL(pictureSrc)) {
            img.setAttribute("src", pictureSrc);
        }
        const pictureSrcset = pickBestURLFromAttributes(img, LAZY_SRCSET_ATTRS)
            || pickBestURLFromAttributes(element.querySelector("source"), LAZY_SRCSET_ATTRS);
        if (pictureSrcset) {
            img.setAttribute("srcset", pictureSrcset);
        }
        return;
    }

    if (tagName === "IFRAME" || tagName === "VIDEO" || tagName === "AUDIO") {
        const src = pickBestURLFromAttributes(element, ["src", "data-src", "poster"])
            || pickBestURLFromAttributes(element.querySelector("source"), ["src", "data-src"]);
        if (!src || isIgnoredURL(src)) {
            element.remove();
            return;
        }
        const paragraph = element.ownerDocument.createElement("p");
        const link = element.ownerDocument.createElement("a");
        link.setAttribute("href", src);
        link.textContent = element.getAttribute("title") || EMBEDDED_MEDIA_TEXT;
        paragraph.appendChild(link);
        element.replaceWith(paragraph);
        return;
    }

    if (tagName === "SOURCE") {
        element.remove();
    }
}

function pickBestURLFromAttributes(element, attributes) {
    if (!element) {
        return "";
    }
    for (const attribute of attributes) {
        const value = element.getAttribute(attribute);
        if (value && !isIgnoredURL(value)) {
            return value.trim();
        }
    }
    return "";
}

function sanitizeElementAttributes(element) {
    for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        if (name === "class" && shouldPreserveCodeClass(element, attribute.value)) {
            continue;
        }
        if (!ALLOWED_ATTRS.has(name)) {
            element.removeAttribute(attribute.name);
        }
    }
}

function shouldPreserveCodeClass(element, value) {
    if (!value) {
        return false;
    }
    if (element.tagName !== "CODE" && element.tagName !== "PRE") {
        return false;
    }
    return CODE_LANGUAGE_PATTERN.test(value);
}

function removeEmptyElements(root) {
    const preserveTags = new Set(["IMG", "BR", "HR", "TD", "TH", "VIDEO", "AUDIO"]);
    const elements = Array.from(root.querySelectorAll("*")).reverse();
    for (const element of elements) {
        if (preserveTags.has(element.tagName)) {
            continue;
        }
        if (element.children.length > 0) {
            continue;
        }
        if (normalizeText(element.textContent || "") !== "") {
            continue;
        }
        element.remove();
    }
}

function absolutizeResources(root) {
    const nodes = root.querySelectorAll("[src], [href], [poster], [srcset]");
    for (const node of nodes) {
        for (const attributeName of ["src", "href", "poster"]) {
            const value = node.getAttribute(attributeName);
            if (!value || isIgnoredURL(value)) {
                continue;
            }
            try {
                node.setAttribute(attributeName, new URL(value, location.href).href);
            } catch (_error) {
                // Ignore invalid URLs.
            }
        }

        const srcset = node.getAttribute("srcset");
        if (!srcset) {
            continue;
        }
        const absoluteSrcset = srcset.split(",").map((item) => {
            const [url, descriptor] = item.trim().split(/\s+/, 2);
            if (!url || isIgnoredURL(url)) {
                return item.trim();
            }
            try {
                const absoluteURL = new URL(url, location.href).href;
                return descriptor ? `${absoluteURL} ${descriptor}` : absoluteURL;
            } catch (_error) {
                return item.trim();
            }
        }).join(", ");
        node.setAttribute("srcset", absoluteSrcset);
    }
}

function collectAssetURLs(root) {
    const urls = new Set();
    root.querySelectorAll("[src], [poster], [srcset]").forEach((node) => {
        for (const attributeName of ["src", "poster"]) {
            const value = node.getAttribute(attributeName);
            if (value && !isIgnoredURL(value)) {
                urls.add(value);
            }
        }
        const srcset = node.getAttribute("srcset");
        if (!srcset) {
            return;
        }
        srcset.split(",").forEach((item) => {
            const [url] = item.trim().split(/\s+/, 1);
            if (url && !isIgnoredURL(url)) {
                urls.add(url);
            }
        });
    });
    return Array.from(urls);
}

function normalizeText(value) {
    return String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function isIgnoredURL(value) {
    return /^data:|^blob:|^javascript:/i.test(value);
}

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
    return escapeHTML(value);
}
