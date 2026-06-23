export const genOptions = (data: string[] | { label: string, name: string }[], key: string) => {
    let html = "";
    data.forEach((item: string | { label: string, name: string }) => {
        if (typeof item === "string") {
            html += `<option value="${item}" ${key === item ? "selected" : ""}>${item}</option>`;
        } else {
            html += `<option value="${item.name}" ${key === item.name ? "selected" : ""}>${item.label}</option>`;
        }
    });
    return html;
};

export const genLangOptions = (data: { label: string, name: string }[], key: string) => {
    const labels: Record<string, string> = {
        zh_CN: "中文",
        en_US: "English",
    };
    const preferred = ["zh_CN", "en_US"];
    const filtered = preferred
        .map((name) => data.find((item) => item.name === name) || {name, label: labels[name]})
        .filter((item) => !!item?.name);
    let html = "";
    filtered.forEach((item: { label: string, name: string }) => {
        const label = labels[item.name] || item.label || item.name;
        html += `<option value="${item.name}" ${key === item.name ? "selected" : ""}>${label}</option>`;
    });
    return html;
};

