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
            `请把选中文本压缩成更精炼的 1-3 句话。保留核心事实和结论，去掉冗余。直接输出结果，不要标题、不要解释、不要引号。\n\n${selectionSourceText(context.selectedText)}`,
            `Condense the selected text into 1-3 sharper sentences. Preserve the key facts and conclusions, remove redundancy, and return only the result with no title, quotes, or explanation.\n\n${selectionSourceText(context.selectedText)}`
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
            `从选中文本中提取 3-7 条核心要点。每条一行，保留事实与结论，去掉冗余。输出 Markdown 无序列表，不要解释。\n\n${selectionSourceText(context.selectedText)}`,
            `Extract 3-7 core takeaways from the selected text. Keep one point per line, preserve facts and conclusions, remove redundancy, and return a Markdown bullet list with no explanation.\n\n${selectionSourceText(context.selectedText)}`
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
            `基于选中文本生成 3-5 组问答对，用于复习。格式：\n## 问答\n1. 问：...\n   答：...\n直接输出，不要解释。\n\n${selectionSourceText(context.selectedText)}`,
            `Generate 3-5 Q&A pairs from the selected text for review. Use this format:\n## Q&A\n1. Q: ...\n   A: ...\nReturn only the result with no explanation.\n\n${selectionSourceText(context.selectedText)}`
        ),
    },
    "selection-rewrite": {
        id: "selection-rewrite",
        placement: "selection",
        label: assistantText("改写", "Rewrite"),
        shortLabel: assistantText("改写", "Rewrite"),
        description: assistantText("保留原意，让表达更顺。", "Keep the meaning but improve the wording."),
        output: "plain-text",
        action: "replace-selection",
        resultMode: "auto-apply",
        requiresNote: true,
        requiresSelection: true,
        buildMessage: (context) => assistantText(
            `请改写选中文本，让表达更清晰、自然、精炼。保持原意不变。直接输出改写结果，不要解释。\n\n${selectionSourceText(context.selectedText)}`,
            `Rewrite the selected text to make it clearer, more natural, and more concise while preserving the original meaning. Return only the rewritten text with no explanation.\n\n${selectionSourceText(context.selectedText)}`
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
                `将选中文本翻译成${targetLanguage}。保持原有语气、列表和结构。直接输出译文，不要解释。\n\n${selectionSourceText(context.selectedText)}`,
            `Translate the selected text into ${targetLanguage}. Preserve the original tone, lists, and structure. Return only the translation with no explanation.\n\n${selectionSourceText(context.selectedText)}`
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
            `将选中文本转换成最合适的 Mermaid 图。只输出一个完整的 \`\`\`mermaid 代码块，不要解释。\n\n${selectionSourceText(context.selectedText)}`,
            `Convert the selected text into the most suitable Mermaid diagram. Return only one complete \`\`\`mermaid code block with no explanation.\n\n${selectionSourceText(context.selectedText)}`
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
            `将选中文本整理成 Markdown 表格。合理推断列名，只输出表格，不要解释。\n\n${selectionSourceText(context.selectedText)}`,
            `Turn the selected text into a Markdown table. Infer sensible column headers, return only the table, and include no explanation.\n\n${selectionSourceText(context.selectedText)}`
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
            `将选中文本转换成 Mind Elixir 思维导图 JSON。只输出一个 JSON 对象，不要 Markdown，不要解释。结构：\n{"topic":"根节点","children":[{"topic":"子节点","children":[...]}]}\n要求：1. 一个根节点 2. topic 用简洁短语 3. 不要 id/style 等额外字段。\n\n${selectionSourceText(context.selectedText)}`,
            `Convert the selected text into Mind Elixir mind map JSON. Return only one JSON object with no Markdown and no explanation. Shape:\n{"topic":"Root","children":[{"topic":"Child","children":[...]}]}\nRequirements: 1. one root node 2. concise topic phrases 3. no id/style or extra fields.\n\n${selectionSourceText(context.selectedText)}`
        ),
    },
    "selection-to-chart": {
        id: "selection-to-chart",
        placement: "selection",
        label: assistantText("生成图表", "Generate Chart"),
        shortLabel: assistantText("图表", "Chart"),
        description: assistantText("把选中内容转换成最合适的图表。", "Convert the selection into the most suitable chart."),
        output: "markdown",
        action: "insert-below",
        resultMode: "auto-apply",
        requiresNote: true,
        requiresSelection: true,
        buildMessage: (context) => {
            const text = context.selectedText || "";
            return assistantText(
                `将以下内容转换成最合适的图表。如果数据适合柱状图/折线图/饼图，输出 ECharts option JSON（只输出 JSON，不要 markdown 代码块）；如果内容是流程/关系，输出 Mermaid 图表（用 \`\`\`mermaid 代码块）。直接输出结果，不要解释。\n\n${text}`,
                `Convert the following content into the most suitable chart. If the data fits a bar/line/pie chart, output an ECharts option JSON (JSON only, no markdown code block); if the content is a flowchart/relationship, output a Mermaid diagram (use a \`\`\`mermaid code block). Output the result directly with no explanation.\n\n${text}`
            );
        },
    },
    "note-batch-instruct": {
        id: "note-batch-instruct",
        placement: "note",
        label: assistantText("批量指令", "Batch"),
        shortLabel: assistantText("批量指令", "Batch"),
        description: assistantText("分析当前笔记并生成可批量执行的任务计划。", "Analyze the current note and generate a batch execution plan."),
        output: "markdown",
        action: "chat",
        requiresNote: true,
        allowTools: true,
        buildMessage: () => assistantText(
            "请分析当前笔记内容，并生成一个可以批量执行的任务计划。用户指令：整理当前笔记",
            "Analyze the current note content and generate a batch execution plan. User instruction: Organize current note"
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
            "请阅读当前笔记，在已有内容基础上创作新的 2-3 个自然段。要求：1. 补充原文未展开的论点、角度或实例；2. 不要复述已有内容；3. 保持与原文一致的语气和 Markdown 风格；4. 直接输出创作内容，不要标题、不要解释。",
            "Read the current note and create 2-3 new natural paragraphs based on it. Requirements: 1. expand undeveloped points, angles, or examples 2. do not restate existing content 3. keep the same tone and Markdown style 4. return only the new content with no title or explanation."
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
            "请阅读当前笔记的上下文，续写 1-2 个自然段。要求：1. 紧接当前内容自然衔接，不要重复已有内容；2. 只续写下一部分，不要写完整篇文章；3. 保持与原文一致的语气、术语和 Markdown 风格；4. 直接输出续写内容，不要标题、不要解释。",
            "Read the current note context and continue with 1-2 natural paragraphs. Requirements: 1. connect directly to the current content without repeating it 2. write only the next part, not a full article 3. keep the same tone, terms, and Markdown style 4. return only the continuation with no title or explanation."
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
            "请阅读当前笔记，输出结构化总结。要求：1. 先用 1-2 句话概括全文主题；2. 再列出 3-7 个核心要点；3. 标注缺失信息或待补充内容；4. 给出 1-3 条可执行的下一步建议；5. 直接输出 Markdown，不要解释。",
            "Read the current note and produce a structured summary. Requirements: 1. summarize the topic in 1-2 sentences 2. list 3-7 core points 3. note missing or incomplete information 4. give 1-3 actionable next steps 5. return Markdown only with no explanation."
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
            "请阅读当前笔记，生成结构化提纲。要求：1. 用 Markdown 标题和列表表达层级；2. 保留核心结构，每个标题/要点不超过 15 字；3. 直接输出，不要解释。",
            "Read the current note and generate a structured outline. Requirements: 1. express hierarchy with Markdown headings and lists 2. preserve the core structure 3. keep each heading/point within 15 words 4. return only the outline with no explanation."
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
            "请阅读当前笔记，生成 4-8 组问答对用于复习。格式：\n## 问答\n1. 问：...\n   答：...\n直接输出，不要解释。",
            "Read the current note and generate 4-8 Q&A pairs for review. Use this format:\n## Q&A\n1. Q: ...\n   A: ...\nReturn only the result with no explanation."
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
            "请阅读当前笔记，生成 5-10 张复习卡片。格式：\n## 复习卡片\n1. 正面：...\n   背面：...\n直接输出，不要解释。",
            "Read the current note and generate 5-10 study flashcards. Use this format:\n## Flashcards\n1. Front: ...\n   Back: ...\nReturn only the result with no explanation."
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
            "请逐段检查当前笔记，输出一份完整的润色版本。要求：1. 修正语法、错别字和不通顺的表达；2. 改善段落结构和信息流；3. 补充明显缺失的上下文；4. 保持原有语义不变，不要增加新观点；5. 先用一句话总结主要修改点，再输出完整润色稿；6. 使用 Markdown，直接输出结果。",
            "Review the current note paragraph by paragraph and produce a complete polished version. Requirements: 1. fix grammar, typos, and awkward wording 2. improve paragraph structure and information flow 3. add obviously missing context 4. preserve the original meaning and add no new claims 5. start with one sentence summarizing the main changes, then output the full polished draft 6. use Markdown and return only the result."
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
            "请为当前笔记做一次体检，并输出可审阅的修复补丁。必要时调用工具检查附件、链接、资源和引用情况。只输出一个 JSON 对象，不要 Markdown，不要解释。结构：{\"summary\":\"一句话体检结论\",\"target\":\"note\",\"operations\":[{\"type\":\"append-note\",\"targetId\":\"当前笔记 rootID\",\"after\":\"## AI 体检建议\\n...\",\"reason\":\"结构/重复/引用/附件/行动项/表达质量问题\"}]}。要求：1. operations 最多 6 条；2. 只能使用 append-note、insert-after-block、replace-block；3. 没有安全把握替换原文时使用 append-note 给出修复建议；4. replace-block 必须提供 targetId、before、after 和 reason；5. 不要编造不存在的块 ID。",
            "Run a health check on the current note and return a reviewable fix patch. Use tools when needed to inspect assets, links, resources, and references. Return exactly one JSON object with no Markdown and no explanation. Shape: {\"summary\":\"one-sentence health conclusion\",\"target\":\"note\",\"operations\":[{\"type\":\"append-note\",\"targetId\":\"current note rootID\",\"after\":\"## AI Health Suggestions\\n...\",\"reason\":\"structure/repetition/references/assets/action items/writing quality issue\"}]}. Requirements: 1. at most 6 operations 2. only use append-note, insert-after-block, or replace-block 3. use append-note when replacing original content is not clearly safe 4. replace-block must include targetId, before, after, and reason 5. do not invent block IDs."
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
    "note-translate-mixed": {
        id: "note-translate-mixed",
        placement: "note",
        label: assistantText("全文翻译（混合模式）", "Full-Text Translation (Mixed)"),
        shortLabel: assistantText("全文翻译", "Full Translate"),
        description: assistantText("保留原文主体，在关键术语后追加括号译文。", "Keep the original text and append translations in brackets after key terms."),
        output: "markdown",
        action: "append-note",
        requiresNote: true,
        buildMessage: (context, params) => {
            const targetLanguage = `${params.targetLanguage || assistantText("中文", "English")}`.trim();
            return assistantText(
                `请将以下笔记中的关键英文术语后追加括号${targetLanguage}译文，保留原文主体不变。保持 Markdown 格式。直接输出处理后的完整文本，不要解释。\n\n\`\`\`markdown\n${context.selectedText || context.note?.markdown || ""}\n\`\`\``,
                `Append ${targetLanguage} translations in brackets after key English terms in the note below. Keep the original text intact. Preserve Markdown formatting. Return only the processed text with no explanation.\n\n\`\`\`markdown\n${context.selectedText || context.note?.markdown || ""}\n\`\`\``
            );
        },
    },
    "note-translate-replace": {
        id: "note-translate-replace",
        placement: "note",
        label: assistantText("全文翻译（替换模式）", "Full-Text Translation (Replace)"),
        shortLabel: assistantText("全文替换翻译", "Full Replace"),
        description: assistantText("将整篇笔记翻译为目标语言。", "Translate the entire document into a target language."),
        output: "markdown",
        action: "append-note",
        requiresNote: true,
        buildMessage: (context, params) => {
            const targetLanguage = `${params.targetLanguage || assistantText("中文", "English")}`.trim();
            return assistantText(
                `请将以下笔记完整翻译为${targetLanguage}，保持 Markdown 格式。直接输出译文，不要解释。\n\n\`\`\`markdown\n${context.selectedText || context.note?.markdown || ""}\n\`\`\``,
                `Translate the note below entirely into ${targetLanguage}. Preserve Markdown formatting. Return only the translated text with no explanation.\n\n\`\`\`markdown\n${context.selectedText || context.note?.markdown || ""}\n\`\`\``
            );
        },
    },
    "note-auto-tag": {
        id: "note-auto-tag",
        placement: "note",
        label: assistantText("智能标签", "Smart Tags"),
        shortLabel: assistantText("智能标签", "Smart Tags"),
        description: assistantText("自动为笔记推荐 3-5 个标签。", "Auto-suggest 3-5 tags for the current note."),
        output: "markdown",
        action: "insert-below",
        resultMode: "auto-apply",
        requiresNote: true,
        allowTools: true,
        buildMessage: (context) => {
            const title = context.note?.title || "";
            const md = context.note?.markdown || "";
            const preview = md.length > 3000 ? md.substring(0, 3000) + "\n..." : md;
            return assistantText(
                `请阅读以下笔记内容，推荐 3-5 个标签。标签应简洁（2-6 字），能概括笔记主题、领域和用途。\n\n标题：${title}\n\n内容：\n${preview}\n\n请以 Markdown 无序列表输出标签，格式：\n- 标签1\n- 标签2\n- 标签3\n\n直接输出，不要解释。`,
                `Read the note below and suggest 3-5 tags. Tags should be concise (1-3 words), capturing the topic, domain, and purpose.\n\nTitle: ${title}\n\nContent:\n${preview}\n\nOutput tags as a Markdown bullet list:\n- Tag1\n- Tag2\n- Tag3\n\nReturn only the list with no explanation.`
            );
        },
    },
    "note-highlight-keypoints": {
        id: "note-highlight-keypoints",
        placement: "note",
        label: assistantText("重点高亮", "Key Highlights"),
        shortLabel: assistantText("重点高亮", "Key Highlights"),
        description: assistantText("区分重点、难点和易混淆内容并标注。", "Highlight key points, difficulties, and easily confused items."),
        output: "markdown",
        action: "insert-below",
        resultMode: "auto-apply",
        requiresNote: true,
        buildMessage: (context) => {
            const md = context.note?.markdown || "";
            const preview = md.length > 4000 ? md.substring(0, 4000) + "\n..." : md;
            return assistantText(
                `请阅读以下学习内容，区分重点、难点和易混淆内容，用不同标记标注后输出。\n\n标记规则：\n- 🟢 重点：核心概念、必须掌握的知识\n- 🟠 难点：理解困难、需要反复练习的内容\n- 🔴 易混淆：容易记错、容易搞混的知识点\n\n内容：\n${preview}\n\n请按分类输出，每项一行，格式：\n🟢 重点：...\n🟠 难点：...\n🔴 易混淆：...\n\n直接输出，不要解释。`,
                `Read the study material below and classify content into key points, difficulties, and easily confused items using distinct markers.\n\nMarkers:\n- 🟢 Key Point: core concepts, must-know knowledge\n- 🟠 Difficulty: hard to understand, needs repeated practice\n- 🔴 Confusable: easy to misremember or mix up\n\nContent:\n${preview}\n\nOutput by category, one item per line:\n🟢 Key Point: ...\n🟠 Difficulty: ...\n🔴 Confusable: ...\n\nReturn only the result with no explanation.`
            );
        },
    },
    "selection-desensitize": {
        id: "selection-desensitize",
        placement: "selection",
        label: assistantText("隐私脱敏", "Desensitize"),
        shortLabel: assistantText("隐私脱敏", "Desensitize"),
        description: assistantText("识别并替换选中文本中的敏感信息。", "Detect and replace sensitive information in the selected text."),
        output: "plain-text",
        action: "replace-selection",
        resultMode: "auto-apply",
        requiresNote: true,
        requiresSelection: true,
        buildMessage: (context) => {
            const text = context.selectedText || "";
            return assistantText(
                `请识别以下文本中的敏感信息（手机号、身份证号、邮箱、银行卡号、IP地址、公司内部项目名、真实人名等），并将其替换为脱敏标记（如 138****1234、z***@example.com、张* 等）。保持原文结构和语义不变。\n\n${text}\n\n直接输出脱敏后的文本，不要解释。`,
                `Detect sensitive information in the text below (phone numbers, ID numbers, emails, bank card numbers, IP addresses, internal project names, real names, etc.) and replace them with desensitized markers (e.g. 138****1234, z***@example.com, J**). Preserve the original structure and meaning.\n\n${text}\n\nReturn only the desensitized text with no explanation.`
            );
        },
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

// I8: skill menu grouping. Skills are categorized into a small set of stable
// groups so the in-note menu reads as labeled sections instead of a flat wall
// of 13–19 buttons. ask-ai is rendered separately (prominent chat entry).
export type TAssistantSkillGroup = "write" | "digest" | "convert" | "capture" | "agent";

export const assistantSkillGroupOrder: TAssistantSkillGroup[] = ["write", "digest", "convert", "capture", "agent"];

export const getAssistantSkillGroupLabel = (group: TAssistantSkillGroup) => {
    switch (group) {
        case "write": return assistantText("写作", "Writing");
        case "digest": return assistantText("总结与问答", "Summarize & Q&A");
        case "convert": return assistantText("转换", "Convert");
        case "capture": return assistantText("捕获", "Capture");
        case "agent": return assistantText("智能体", "Agent");
        default: return group;
    }
};

const assistantSkillGroupMap: Record<string, TAssistantSkillGroup> = {
    "note-create": "write",
    "note-continue-writing": "write",
    "selection-rewrite": "write",
    "note-polish": "write",
    "selection-summarize": "digest",
    "selection-keypoints": "digest",
    "selection-qa": "digest",
    "note-summarize": "digest",
    "note-outline": "digest",
    "note-qa": "digest",
    "note-flashcards": "digest",
    "note-highlight-keypoints": "digest",
    "selection-translate": "convert",
    "note-translate-mixed": "convert",
    "note-translate-replace": "convert",
    "selection-mermaid": "convert",
    "selection-table": "convert",
    "selection-mind-elixir": "convert",
    "selection-to-chart": "convert",
    "selection-desensitize": "convert",
    "selection-task": "capture",
    "selection-reminder": "capture",
    "note-task": "capture",
    "note-reminder": "capture",
    "note-batch-instruct": "agent",
    "note-links": "agent",
    "note-health": "agent",
    "note-extract-tasks": "agent",
    "note-create-project": "agent",
    "note-auto-tag": "agent",
};

export const getAssistantSkillGroup = (id: string): TAssistantSkillGroup => assistantSkillGroupMap[id] || "agent";
