interface IAddColSpec {
    id: string;
    icon: string;
    type: TAVCol;
    name: string;
}

export const getBuiltinAddColSpecs = (): IAddColSpec[] => {
    return [
        {id: "text", icon: "iconAlignLeft", type: "text", name: window.sourceflow.languages.text},
        {id: "number", icon: "iconNumber", type: "number", name: window.sourceflow.languages.number},
        {id: "select", icon: "iconListItem", type: "select", name: window.sourceflow.languages.select},
        {id: "multiSelect", icon: "iconList", type: "mSelect", name: window.sourceflow.languages.multiSelect},
        {id: "date", icon: "iconCalendar", type: "date", name: window.sourceflow.languages.date},
        {id: "assets", icon: "iconImage", type: "mAsset", name: window.sourceflow.languages.assets},
        {id: "checkbox", icon: "iconCheck", type: "checkbox", name: window.sourceflow.languages.checkbox},
        {id: "link", icon: "iconLink", type: "url", name: window.sourceflow.languages.link},
        {id: "email", icon: "iconEmail", type: "email", name: window.sourceflow.languages.email},
        {id: "phone", icon: "iconPhone", type: "phone", name: window.sourceflow.languages.phone},
        {id: "template", icon: "iconMath", type: "template", name: window.sourceflow.languages.template},
        {id: "relation", icon: "iconOpen", type: "relation", name: window.sourceflow.languages.relation},
        {id: "rollup", icon: "iconSearch", type: "rollup", name: window.sourceflow.languages.rollup},
        {id: "lineNumber", icon: "iconOrderedList", type: "lineNumber", name: window.sourceflow.languages.lineNumber},
        {id: "createdTime", icon: "iconClock", type: "created", name: window.sourceflow.languages.createdTime},
        {id: "updatedTime", icon: "iconClock", type: "updated", name: window.sourceflow.languages.updatedTime},
    ];
};
