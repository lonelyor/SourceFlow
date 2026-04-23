import {assistantText} from "../constants";
import {IAssistantSkillDefinition, TAssistantSkillId, TAssistantSkillPlacement} from "./types";

const selectionSourceText = (selectedText: string) => {
    return `\`\`\`text
${selectedText.trim()}
\`\`\``;
};

const registry: Record<TAssistantSkillId, IAssistantSkillDefinition> = {
    "selection-summarize": {
        id: "selection-summarize",
        placement: "selection",
        label: assistantText("总结选中内容", "Summarize Selection"),
        shortLabel: assistantText("总结", "Summarize"),
        description: assistantText("把选中内容压缩成更清晰的表达。", "Condense the current selection into a clearer summary."),
        output: "plain-text",
        action: "replace-selection",
        resultMode: "auto-apply",
        requiresNote: true,
        requiresSelection: true,
        buildMessage: (context) => assistantText(
            `请只基于下面的选中文本，输出一段精炼总结。直接给出结果，不要标题、不要解释、不要引号。\n\n${selectionSourceText(context.selectedText)}`,
            `Summarize the following selected text into a concise paragraph. Return only the result with no title, quotes, or explanation.\n\n${selectionSourceText(context.selectedText)}`
        ),
    },
    "selection-keypoints": {
        id: "selection-keypoints",
        placement: "selection",
        label: assistantText("提取选中要点", "Extract Key Points"),
        shortLabel: assistantText("要点", "Key Points"),
        description: assistantText("把选中内容整理成清晰要点。", "Turn the selected content into a concise set of key points."),
        output: "markdown",
        action: "insert-below",
        resultMode: "auto-apply",
        requiresNote: true,
        requiresSelection: true,
        buildMessage: (context) => assistantText(
            `请从下面的选中文本中提取 3-7 条最重要的要点，并输出 Markdown 无序列表。每条要点尽量短，保留事实与结论，不要解释。\n\n${selectionSourceText(context.selectedText)}`,
            `Extract the 3-7 most important takeaways from the selected text below and return them as a Markdown bullet list. Keep each point short and concrete, with no extra explanation.\n\n${selectionSourceText(context.selectedText)}`
        ),
    },
    "selection-qa": {
        id: "selection-qa",
        placement: "selection",
        label: assistantText("基于选中内容生成问答", "Generate Q&A from Selection"),
        shortLabel: assistantText("问答", "Q&A"),
        description: assistantText("把选中内容整理成可复习的问答。", "Turn the selection into reviewable Q&A pairs."),
        output: "markdown",
        action: "insert-below",
        resultMode: "auto-apply",
        requiresNote: true,
        requiresSelection: true,
        buildMessage: (context) => assistantText(
            `请基于下面的选中文本生成 3-5 组 Markdown 问答，适合复习。直接输出结果，不要解释。格式要求：\n## 问答\n1. 问：...\n   答：...\n\n${selectionSourceText(context.selectedText)}`,
            `Generate 3-5 Markdown Q&A pairs from the selected text below for review. Return only the result with no explanation. Use this format:\n## Q&A\n1. Q: ...\n   A: ...\n\n${selectionSourceText(context.selectedText)}`
        ),
    },
    "selection-rewrite": {
        id: "selection-rewrite",
        placement: "selection",
        label: assistantText("改写选中内容", "Rewrite Selection"),
        shortLabel: assistantText("改写", "Rewrite"),
        description: assistantText("保留原意，让表达更顺。", "Keep the meaning but improve the wording."),
        output: "plain-text",
        action: "replace-selection",
        resultMode: "auto-apply",
        requiresNote: true,
        requiresSelection: true,
        buildMessage: (context) => assistantText(
            `请改写下面的选中文本，保留原意，但让表达更清晰、自然、精炼。直接输出改写结果，不要解释。\n\n${selectionSourceText(context.selectedText)}`,
            `Rewrite the selected text below while preserving its meaning, making it clearer, more natural, and more concise. Return only the rewritten text.\n\n${selectionSourceText(context.selectedText)}`
        ),
    },
    "selection-translate": {
        id: "selection-translate",
        placement: "selection",
        label: assistantText("翻译选中内容", "Translate Selection"),
        shortLabel: assistantText("翻译", "Translate"),
        description: assistantText("把选中内容翻译成目标语言。", "Translate the selection into a target language."),
        output: "plain-text",
        action: "replace-selection",
        resultMode: "auto-apply",
        requiresNote: true,
        requiresSelection: true,
        buildMessage: (context, params) => {
            const targetLanguage = `${params.targetLanguage || assistantText("中文", "English")}`.trim();
            return assistantText(
                `请把下面的选中文本翻译成${targetLanguage}。尽量保留原来的语气、列表和结构。直接输出译文，不要解释。\n\n${selectionSourceText(context.selectedText)}`,
            `Translate the selected text below into ${targetLanguage}. Preserve the original tone, list structure, and formatting as much as possible. Return only the translation.\n\n${selectionSourceText(context.selectedText)}`
        );
        },
    },
    "selection-task": {
        id: "selection-task",
        placement: "selection",
        label: assistantText("基于选中内容建任务", "Create Task from Selection"),
        shortLabel: assistantText("任务", "Task"),
        description: assistantText("把选中内容预填到任务收集里。", "Prefill a task capture from the current selection."),
        output: "markdown",
        action: "capture-task",
        requiresSelection: true,
        buildMessage: () => "",
    },
    "selection-reminder": {
        id: "selection-reminder",
        placement: "selection",
        label: assistantText("基于选中内容设提醒", "Create Reminder from Selection"),
        shortLabel: assistantText("提醒", "Reminder"),
        description: assistantText("把选中内容预填到事件/提醒里。", "Prefill an event/reminder capture from the current selection."),
        output: "markdown",
        action: "capture-event",
        requiresSelection: true,
        buildMessage: () => "",
    },
    "selection-mermaid": {
        id: "selection-mermaid",
        placement: "selection",
        label: assistantText("转成 Mermaid", "Convert to Mermaid"),
        shortLabel: assistantText("Mermaid", "Mermaid"),
        description: assistantText("把选中内容转成 Mermaid 图。", "Turn the selection into a Mermaid diagram."),
        output: "markdown",
        action: "insert-below",
        resultMode: "auto-apply",
        requiresNote: true,
        requiresSelection: true,
        buildMessage: (context) => assistantText(
            `请基于下面的选中文本生成一个最合适的 Mermaid 图。只输出一个完整的 Markdown fenced code block，代码块语言必须是 mermaid，不要任何额外解释。\n\n${selectionSourceText(context.selectedText)}`,
            `Generate the most suitable Mermaid diagram from the selected text below. Return only one complete fenced Markdown code block with language \`mermaid\`, and no extra explanation.\n\n${selectionSourceText(context.selectedText)}`
        ),
    },
    "selection-table": {
        id: "selection-table",
        placement: "selection",
        label: assistantText("转成表格", "Convert to Table"),
        shortLabel: assistantText("表格", "Table"),
        description: assistantText("把选中内容整理成 Markdown 表格。", "Turn the selection into a Markdown table."),
        output: "markdown",
        action: "insert-below",
        resultMode: "auto-apply",
        requiresNote: true,
        requiresSelection: true,
        buildMessage: (context) => assistantText(
            `请把下面的选中文本整理成最合适的 Markdown 表格。只输出表格本身，不要解释。如果信息不完整，请先合理补齐列名。\n\n${selectionSourceText(context.selectedText)}`,
            `Turn the selected text below into the most suitable Markdown table. Return only the table itself with no explanation. If needed, infer sensible column headers.\n\n${selectionSourceText(context.selectedText)}`
        ),
    },
    "selection-mind-elixir": {
        id: "selection-mind-elixir",
        placement: "selection",
        label: assistantText("转成思维导图", "Convert to Mind Map"),
        shortLabel: assistantText("脑图", "Mind Map"),
        description: assistantText("把选中内容转成可编辑的 Mind Elixir 思维导图。", "Turn the selection into an editable Mind Elixir mind map."),
        output: "markdown",
        action: "insert-mind-elixir",
        resultMode: "auto-apply",
        requiresNote: true,
        requiresSelection: true,
        buildMessage: (context) => assistantText(
            `请基于下面的选中文本生成一个适合 Mind Elixir 的思维导图 JSON。只输出一个 JSON 对象，不要 Markdown，不要解释。JSON 结构要求如下：\n{\n  "topic": "根节点标题",\n  "children": [\n    {"topic": "子节点", "children": [...]}\n  ]\n}\n要求：1. 必须只有一个根节点 2. topic 必须是简洁短语 3. children 可省略 4. 不要输出 id、style、summary 等额外字段，除非确有必要。\n\n${selectionSourceText(context.selectedText)}`,
            `Generate a Mind Elixir compatible mind map JSON from the selected text below. Return only one JSON object with no Markdown and no explanation. Use this structure:\n{\n  "topic": "Root topic",\n  "children": [\n    {"topic": "Child node", "children": [...]}\n  ]\n}\nRequirements: 1. exactly one root node 2. concise topic phrases 3. children may be omitted 4. do not include id, style, summary, or extra fields unless truly necessary.\n\n${selectionSourceText(context.selectedText)}`
        ),
    },
    "note-create": {
        id: "note-create",
        placement: "note",
        label: assistantText("围绕当前笔记创作", "Create from Current Note"),
        shortLabel: assistantText("创作", "Create"),
        description: assistantText("围绕当前笔记主题生成新的可直接使用内容。", "Create new ready-to-use content around the current note topic."),
        output: "markdown",
        action: "insert-below",
        resultMode: "auto-apply",
        requiresNote: true,
        buildMessage: () => assistantText(
            "请阅读当前笔记，围绕它的主题、语气和结构，创作一段可以直接追加到文末的新内容。要求：1. 不是简单复述原文；2. 内容要完整、有信息增量；3. 使用 Markdown；4. 直接输出结果，不要解释。",
            "Read the current note and create a new section that can be appended directly to the end. Requirements: 1. do not merely restate the original note 2. add meaningful new information 3. use Markdown 4. return only the result with no explanation."
        ),
    },
    "note-continue-writing": {
        id: "note-continue-writing",
        placement: "note",
        label: assistantText("续写当前笔记", "Continue Current Note"),
        shortLabel: assistantText("续写", "Continue"),
        description: assistantText("延续当前笔记的上下文继续写下去。", "Continue writing from the current note's existing context."),
        output: "markdown",
        action: "insert-below",
        resultMode: "auto-apply",
        requiresNote: true,
        buildMessage: () => assistantText(
            "请先阅读当前笔记，然后按照现有内容的主题、语气和组织方式继续续写。要求：1. 与现有上下文自然衔接；2. 优先补全未展开的论点、示例、步骤或结论；3. 使用 Markdown；4. 直接输出续写结果，不要解释。",
            "Read the current note first, then continue it in a way that matches the existing topic, tone, and structure. Requirements: 1. connect naturally to the current content 2. prioritize unfinished points, examples, steps, or conclusions 3. use Markdown 4. return only the continuation."
        ),
    },
    "note-summarize": {
        id: "note-summarize",
        placement: "note",
        label: assistantText("总结当前笔记", "Summarize Current Note"),
        shortLabel: assistantText("总结全文", "Summarize"),
        description: assistantText("提炼当前笔记的重点、结构和结论。", "Summarize the current note's key points, structure, and conclusions."),
        output: "markdown",
        action: "insert-below",
        resultMode: "auto-apply",
        requiresNote: true,
        buildMessage: () => assistantText(
            "请阅读当前笔记，输出一份结构清晰的 Markdown 总结。至少包含：主题概括、关键要点、待补充的信息、可执行下一步。",
            "Read the current note and produce a well-structured Markdown summary. Include at least: overall theme, key points, missing context, and actionable next steps."
        ),
    },
    "note-outline": {
        id: "note-outline",
        placement: "note",
        label: assistantText("生成当前笔记提纲", "Create Note Outline"),
        shortLabel: assistantText("提纲", "Outline"),
        description: assistantText("把当前笔记整理成更清晰的层级提纲。", "Reshape the current note into a clearer structured outline."),
        output: "markdown",
        action: "insert-below",
        resultMode: "auto-apply",
        requiresNote: true,
        buildMessage: () => assistantText(
            "请阅读当前笔记，输出一份结构化 Markdown 提纲。要求：1. 保留核心层级；2. 标题短而清楚；3. 使用列表或标题组织，不要额外解释。",
            "Read the current note and output a structured Markdown outline. Requirements: 1. preserve the core hierarchy 2. keep headings concise 3. organize with headings or lists and include no extra explanation."
        ),
    },
    "note-qa": {
        id: "note-qa",
        placement: "note",
        label: assistantText("生成当前笔记问答", "Create Note Q&A"),
        shortLabel: assistantText("问答", "Q&A"),
        description: assistantText("把当前笔记提炼成可复习的问答。", "Turn the current note into reviewable Q&A pairs."),
        output: "markdown",
        action: "insert-below",
        resultMode: "auto-apply",
        requiresNote: true,
        buildMessage: () => assistantText(
            "请阅读当前笔记并生成 4-8 组 Markdown 问答，适合复习和自测。直接输出结果，不要解释。格式要求：\n## 问答\n1. 问：...\n   答：...",
            "Read the current note and generate 4-8 Markdown Q&A pairs for review and self-testing. Return only the result with no explanation. Use this format:\n## Q&A\n1. Q: ...\n   A: ..."
        ),
    },
    "note-flashcards": {
        id: "note-flashcards",
        placement: "note",
        label: assistantText("生成复习卡片", "Create Flashcards"),
        shortLabel: assistantText("卡片", "Flashcards"),
        description: assistantText("把当前笔记整理成简洁复习卡片。", "Turn the current note into concise study flashcards."),
        output: "markdown",
        action: "insert-below",
        resultMode: "auto-apply",
        requiresNote: true,
        buildMessage: () => assistantText(
            "请阅读当前笔记并生成 5-10 张 Markdown 复习卡片。直接输出结果，不要解释。格式要求：\n## 复习卡片\n1. 正面：...\n   背面：...",
            "Read the current note and generate 5-10 Markdown study flashcards. Return only the result with no explanation. Use this format:\n## Flashcards\n1. Front: ...\n   Back: ..."
        ),
    },
    "note-task": {
        id: "note-task",
        placement: "note",
        label: assistantText("基于当前笔记建任务", "Create Task from Note"),
        shortLabel: assistantText("任务", "Task"),
        description: assistantText("把当前笔记预填到任务收集中。", "Prefill a task capture from the current note."),
        output: "markdown",
        action: "capture-task",
        requiresNote: true,
        buildMessage: () => "",
    },
    "note-reminder": {
        id: "note-reminder",
        placement: "note",
        label: assistantText("基于当前笔记设提醒", "Create Reminder from Note"),
        shortLabel: assistantText("提醒", "Reminder"),
        description: assistantText("把当前笔记预填到事件/提醒里。", "Prefill an event/reminder capture from the current note."),
        output: "markdown",
        action: "capture-event",
        requiresNote: true,
        buildMessage: () => "",
    },
    "note-polish": {
        id: "note-polish",
        placement: "note",
        label: assistantText("润色当前笔记", "Polish Current Note"),
        shortLabel: assistantText("润色", "Polish"),
        description: assistantText("从结构、表达和缺失信息上给出优化稿。", "Produce an improved version with better structure, wording, and missing context."),
        output: "markdown",
        action: "insert-below",
        requiresNote: true,
        buildMessage: () => assistantText(
            "请检查当前笔记的结构、表达、待办和缺失信息，并输出一份可直接采用的优化稿。结果请使用 Markdown，先给精简结论，再给建议改写版本。",
            "Review the current note for structure, wording, tasks, and missing context, then output a directly usable improved draft in Markdown. Start with a concise conclusion, then provide the suggested rewrite."
        ),
    },
    "note-links": {
        id: "note-links",
        placement: "note",
        label: assistantText("推荐关联笔记", "Suggest Links"),
        shortLabel: assistantText("建链", "Link"),
        description: assistantText("基于当前笔记推荐双链和相关主题。", "Recommend backlinks and related notes for the current note."),
        output: "markdown",
        action: "insert-below",
        requiresNote: true,
        allowTools: true,
        buildMessage: () => assistantText(
            "请围绕当前笔记生成可执行的关联笔记建议。必要时先调用搜索、读取笔记、读取反链等工具确认候选笔记真实存在，并优先返回已有笔记而不是泛泛主题。只输出一个 JSON 对象，不要 Markdown，不要解释。格式如下：\n{\n  \"summary\": \"一句话概括建议\",\n  \"suggestions\": [\n    {\n      \"rootID\": \"目标笔记 rootID\",\n      \"title\": \"目标笔记标题\",\n      \"path\": \"目标笔记路径\",\n      \"reason\": \"为什么要关联\",\n      \"currentNoteText\": \"写回当前笔记时要附带的简短说明\",\n      \"backlinkText\": \"写回目标笔记时要附带的简短说明\",\n      \"applyCurrent\": true,\n      \"applyBacklink\": true\n    }\n  ]\n}\n要求：1. suggestions 最多 6 条；2. 只能推荐真实存在的笔记；3. 不要推荐当前笔记自己；4. rootID 必须填写；5. currentNoteText 和 backlinkText 必须是可直接写入笔记的简短短语。",
            "Generate actionable related-note suggestions for the current note. Use search, note read, and backlink tools when needed to ensure every suggested note actually exists, and prefer existing notes over vague topics. Return only one JSON object with no Markdown and no explanation. Use this schema:\n{\n  \"summary\": \"one sentence summary\",\n  \"suggestions\": [\n    {\n      \"rootID\": \"target note rootID\",\n      \"title\": \"target note title\",\n      \"path\": \"target note path\",\n      \"reason\": \"why this connection matters\",\n      \"currentNoteText\": \"short phrase to write into the current note\",\n      \"backlinkText\": \"short phrase to write into the target note\",\n      \"applyCurrent\": true,\n      \"applyBacklink\": true\n    }\n  ]\n}\nRequirements: 1. at most 6 suggestions 2. only suggest notes that really exist 3. never suggest the current note itself 4. rootID is required 5. currentNoteText and backlinkText must be short phrases that can be written into notes directly."
        ),
    },
    "note-health": {
        id: "note-health",
        placement: "note",
        label: assistantText("检查当前笔记异常", "Check Note Health"),
        shortLabel: assistantText("体检", "Health"),
        description: assistantText("检查结构问题、资源异常和内容风险。", "Inspect structure issues, asset anomalies, and content risks."),
        output: "markdown",
        action: "insert-below",
        requiresNote: true,
        allowTools: true,
        buildMessage: () => assistantText(
            "请为当前笔记做一次体检。必要时调用工具检查附件、链接、资源和引用情况。输出 Markdown 报告，至少包含：结构问题、图片/附件风险、语法与表达问题、链接或引用异常、建议修复动作。",
            "Run a health check on the current note. Use tools when needed to inspect assets, links, resources, and references. Return a Markdown report covering at least: structure issues, image/asset risks, grammar/style problems, link/reference anomalies, and suggested fixes."
        ),
    },
    "note-extract-tasks": {
        id: "note-extract-tasks",
        placement: "note",
        label: assistantText("提取行动项", "Extract Tasks"),
        shortLabel: assistantText("行动项", "Tasks"),
        description: assistantText("从当前笔记里提炼待办并写入任务。", "Extract tasks from the current note and write them into workbench items."),
        output: "markdown",
        action: "chat",
        requiresNote: true,
        allowTools: true,
        buildMessage: () => assistantText(
            "请先阅读当前笔记，提取其中明确或隐含的待办事项。必要时先调用搜索或读取工具补充上下文，然后使用 create-workbench-item 创建任务，并在回答中简要说明已创建的任务。",
            "Read the current note, extract explicit or implied action items, use search or read tools when needed for context, then create tasks with create-workbench-item and briefly summarize what was created."
        ),
    },
    "note-create-project": {
        id: "note-create-project",
        placement: "note",
        label: assistantText("生成项目计划", "Create Project Plan"),
        shortLabel: assistantText("项目计划", "Project"),
        description: assistantText("把当前笔记整理成项目、任务和事件。", "Turn the current note into a project with tasks and events."),
        output: "markdown",
        action: "chat",
        requiresNote: true,
        allowTools: true,
        buildMessage: () => assistantText(
            "请先阅读当前笔记，判断是否适合整理为一个项目。如果适合，请先创建一个项目，再按需要创建若干任务或事件，并给出清晰的执行计划摘要。写入前先说明你的计划。",
            "Read the current note and decide whether it should become a project. If so, create a project, add tasks or events as needed, and provide a clear execution summary. Explain your plan before writing."
        ),
    },
    "ask-ai": {
        id: "ask-ai",
        placement: "selection",
        label: assistantText("继续在聊天中处理", "Continue in Chat"),
        shortLabel: assistantText("问 AI", "Ask AI"),
        description: assistantText("把当前上下文带进 AI 抽屉继续处理。", "Open the AI drawer with the current context."),
        output: "markdown",
        action: "chat",
        buildMessage: (context) => {
            if (context.selectedText) {
                return assistantText(
                    `请先围绕我当前选中的内容继续分析和处理：\n\n${selectionSourceText(context.selectedText)}`,
                    `Please continue working around the content I currently selected:\n\n${selectionSourceText(context.selectedText)}`
                );
            }
            return assistantText("请先阅读当前笔记，再继续协助我完成接下来的工作。", "Please read the current note first, then help me with the next steps.");
        },
    },
};

export const getAssistantSkillDefinition = (id: TAssistantSkillId) => registry[id];

export const listAssistantSkills = (placement?: TAssistantSkillPlacement) => {
    const items = Object.values(registry);
    if (!placement) {
        return items;
    }
    return items.filter((item) => item.placement === placement || item.id === "ask-ai");
};
