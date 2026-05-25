# SourceFlow 当前状态

更新日期：2026-05-25

## 已确认

- 用户确认文档树拖拽应先做移动功能增强，让任意排序模式下都能拖拽移动；排序后续作为独立逻辑与移动拆分。
- 当前文档树拖拽实现中，移动和自定义排序共用 `dragover/drop` 手势，常见目录空白区、子列表末尾等移动落点不够完整。
- 本轮按两阶段推进：阶段一增强拖拽移动可用性，并让普通文档树拖拽只走移动；阶段二再设计排序独立入口。
- 阶段一代码已新增文件树拖拽辅助模块，普通文档拖拽落点解析覆盖目标项、根节点、展开列表空白区和列表末尾。
- 阶段一普通文档拖拽已停止触发 `changeSort` / `changeSortNotebook`，排序能力保留为后续独立设计项。
- 阶段二已为自定义排序模式新增右键菜单“向上移 / 向下移”，排序通过菜单触发，不再依赖普通拖拽。
- 用户确认继续做文档树外观增强：拖拽落点提示更明确、层级引导线开关默认关、当前路径/选中/拖拽目标状态区分、可展开目标等待反馈、密度紧凑/默认/宽松且默认保持现状。
- 文档树外观增强已实现：设置页新增文档树外观配置，层级引导线默认关，密度默认 `default`，拖拽落点显示右侧提示，延迟展开显示“将展开”，当前打开项、选中项和拖拽目标使用不同视觉状态。
- 文档树外观增强已通过 `pnpm --dir app exec tsc -p tsconfig.json --noEmit --pretty false`、SCSS 编译、语言 JSON 校验，以及 Go 归一化/默认值目标测试。
- 为满足全量测试通过要求，已修复 `kernel/api/file.go` 与 `kernel/api/import.go` 中阻断 `go test ./api` 的既有日志格式串 vet 问题；修复仅调整日志调用格式，不改变业务语义。
- 用户提出笔记编辑页缺少行号和明确标题层级提示；本轮已确认按“顶层块编号 + 标题 H1-H6 常驻标识”实现，不做真实视觉换行号。
- 编辑器结构提示设计为显示增强：`displayHeadingLevel` 默认开启，`displayBlockLineNumber` 默认关闭，提示不写入文档内容。
- 编辑器结构提示已实现：设置页新增标题层级标识和块编号开关，Protyle 编辑区按配置挂载显示类，标题标识覆盖编辑区内可见标题，块编号仅编号顶层块。
- 编辑器结构提示已通过 TypeScript 编译、SCSS 编译、语言 JSON 语法校验、`go test ./conf` 和 `go test ./api`。
- 用户确认继续增强文档树外观：新增子文档数量开关和全部笔记总数开关。
- 本轮文档数量显示设计为外观增强，不改变文档移动、排序或数据语义；子文档数量默认关闭，顶部全部笔记总数默认开启。
- 文档树数量显示已实现：设置页新增两个开关，行尾子文档数量使用既有 `subFileCount`，顶部总数使用 `listDocTree` 的 `countOnly` 递归计数，避免返回整棵树。
- 文档树数量显示已通过 TypeScript 编译、SCSS 编译、语言 JSON 语法校验、`go test ./conf` 和 `go test ./api`。
- 用户确认按三阶段做易用性增强：阶段一文档树导航，阶段二正文定位，阶段三整理提示和块级链接；孤立文档暂不处理。
- 阶段一只使用已有低成本数据做文档树状态标识，先覆盖书签、子文档和引用数，不在本阶段扫描附件或任务。
- 易用性增强阶段一已实现：文档树新增快速过滤、当前路径条、最近编辑入口、常用文档轻量入口和行内状态标识；常用文档基于最近浏览记录，不新增频次统计数据结构。
- 阶段一已通过 TypeScript 编译、SCSS 编译、语言 JSON 语法校验、`git diff --check`、`kernel/api` 与 `kernel/conf` Go 测试；从仓库根目录执行 Go 测试会失败，因为 Go module 位于 `kernel/`。
- 易用性增强阶段二设计边界：复用现有大纲 `setCurrent`、编辑器滚动事件和标题折叠事务，只增加正文当前标题浮层、正文当前标题高亮、大纲滚动同步和折叠标题视觉提示。
- 易用性增强阶段二已实现：编辑器滚动时同步当前标题到大纲，正文显示 Sticky 当前标题条并高亮当前标题；大纲点击会触发正文定位高亮；折叠标题增加省略提示和弱边线，不改变折叠数据。
- 阶段二已通过 TypeScript 编译、SCSS 编译、`git diff --check`、`kernel/api` 与 `kernel/conf` Go 测试。
- 易用性增强阶段三设计边界：整理提示仅覆盖当前编辑器的空文档和同名文档；块级定位链接作为复制菜单增强；孤立文档不处理。
- 易用性增强阶段三已实现：当前编辑器显示空正文提示和同笔记本同名文档提示，复制菜单新增“复制块定位链接”，输出带可读路径/块文本的 Markdown `sf://blocks/` 链接。
- 阶段三已通过 TypeScript 编译、SCSS 编译、语言 JSON 语法校验、`git diff --check`、`kernel/api` 与 `kernel/conf` Go 测试。
- v0.1.3 已成功发布到 GitHub Release（4 资产：win 安装包、便携包、page-saver 插件、SHA256SUMS）。
- 源码已推送至 lonelyor/SourceFlow main 分支（commit 04c87cd）。
- AI 助手 provider 改造已完成到 OpenAI Compatible 原生 function calling、Anthropic streaming/tool_use、Gemini streaming/functionDeclarations，并新增阿里百炼 / Qwen provider 预设。
- 工具确认链路新增拒绝按钮（后端 RejectAssistantAITool API + 前端 reject-tool action + Rejected 状态渲染）。
- Gemini provider 原生 function calling 已支持（streaming + non-streaming）。
- Protyle 大文档性能优化：渲染调度器分帧执行，可视区域优先渲染，scroll/ResizeObserver debounce，仅处理可视 av 块。
- 前端行为测试已覆盖：enable-tools 切换、profile 切换、工具确认/拒绝、Enter 发送、Escape 取消编辑、编辑消息 action。
- 本次文档已同步 README、README_EN、测试文档、产品质量清单、回滚策略、v0.1.3 changelog 和 AI 助手阶段计划。
- `pnpm --dir app run test:ai-dock-runtime` 已通过。
- `python 编译.py` 已通过，生成并校验 Windows x64 安装包 `sourceflow-0.1.3-win.exe` 和便携包目录 `app/build/sourceflow-portable`。
- 用户已确认继续发布当前整个工作区快照，不再只限制在 AI 助手相关改动。
- AI 助手体验优化总方案已按用户确认方向更新：从“聊天助手”升级为 AI 原生笔记代理层，核心链路为精准上下文 → 计划/读工具 → patch/diff → ghost draft/审阅 → 正式事务提交 → 审计回滚。
- 后续开发分 6 阶段推进：上下文引擎与 Prompt 修复 → Patch/Diff 审阅模型 → Ghost Draft 编辑器内体验 → 内联指令与连续编辑 → 工具事务化与 AI 审笔记 → 批量 Agent、审计与自动化。
- AI 助手体验优化阶段 1 已实现：skill-aware 上下文、选区任务不发送全文、续写任务使用光标邻近块窗口、笔记风格摘要和核心 skill Prompt 收敛。
- 阶段 1 已通过 `pnpm --dir app run test:assistant-skill-context`、`pnpm --dir app exec tsc -p tsconfig.json --noEmit --pretty false` 和 `git diff --check`。
- AI 助手体验优化阶段 2 已实现：新增 patch/diff 协议模块，写入型 skill 默认生成可审阅 patch，支持接受全部、接受单项、拒绝单项、复制补丁和继续调整；工具确认卡可展示 patch 预览、目标和参数。
- 阶段 2 已通过 `pnpm --dir app run test:assistant-patch-review`、`pnpm --dir app exec tsc -p tsconfig.json --noEmit --pretty false` 和 `git diff --check`。
- AI 助手体验优化阶段 3 已实现：写入型 skill 流式输出时在编辑器外围显示 ghost draft，Esc 取消只清理临时 DOM；完成后进入 patch 审阅，真实写入仍需接受补丁。
- 阶段 3 已将 AI 替换选区路径从 `document.execCommand("insertText")` 改为 `/api/block/updateBlock` 正式块事务，并通过 ghost draft 脚本、patch 脚本、TypeScript、SCSS 编译和 `git diff --check`。
- AI 助手体验优化阶段 4 已实现：Protyle 编辑器支持 `Ctrl+I` 打开内联指令面板、`Ctrl+J` 触发当前位置续写；内联指令支持最近 5 条、同一选区最多 3 轮连续调整，并复用 ghost draft + patch 审阅链路。
- 阶段 4 已通过 `pnpm --dir app run test:assistant-inline-command`、ghost/patch 脚本、TypeScript、SCSS 编译和 `git diff --check`。
- AI 助手体验优化阶段 5 已实现：写工具支持 `dryRun` 预览语义，未确认写入默认返回 `previewPatch`；工具卡可展示 patch 预览，`note-health` 改为输出可审阅修复 patch。
- 阶段 5 已通过 `pnpm --dir app run test:assistant-patch-review`、`pnpm --dir app exec tsc -p tsconfig.json --noEmit --pretty false`、`go test -vet=off ./model -run TestAssistantAITool -count=1` 和 `git diff --check`；普通 `go test ./model` 仍被既有 vet 格式串问题阻断。
- AI 助手体验优化阶段 6 已实现：Dock 新增 Agent 与历史面板，前端提供批量 Agent 队列基础状态、暂停/恢复/取消、本地 AI 操作历史记录，以及低风险追加/插入写入的历史回滚入口。
- 阶段 6 已通过 `pnpm --dir app run test:assistant-agent-history`、patch/inline 脚本、TypeScript、SCSS 编译和 `git diff --check`。
- 前端 ProfilesPanel 适配已完成：连通测试按钮 + 模型列表下拉 + provider 切换自动填入，尚未提交。

## 风险

- 阶段一需要修改文件树拖拽交互，必须保持现有 `/api/filetree/moveDocs` 安全边界，不自动改变用户排序配置。
- `pnpm --dir app run typecheck:app` 当前会被既有 `app/src/protyle/wysiwyg/editorEvents.ts` 模块守卫拦截；本轮使用直接 `tsc --noEmit` 验证文件树改动。
- `go test ./api -count=1` 已通过。
- 当前工作区仍有未跟踪 `.kilo/`，本轮不纳入提交；正式发布前仍需确认导出范围不包含未授权内容。
- GitHub Release 发布需要有效 token，默认从 `.release.local.env` 或环境变量读取；不得在日志或文档中输出 token 内容。
- `go test ./model` 当前会被既有非本轮格式串 vet 问题拦截；AI 工具策略目标测试使用 `go test -vet=off ./model -run TestAssistantAITool -count=1` 验证。
