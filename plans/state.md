# SourceFlow 当前状态

更新日期：2026-05-22

## 已确认

- 用户确认文档树拖拽应先做移动功能增强，让任意排序模式下都能拖拽移动；排序后续作为独立逻辑与移动拆分。
- 当前文档树拖拽实现中，移动和自定义排序共用 `dragover/drop` 手势，常见目录空白区、子列表末尾等移动落点不够完整。
- 本轮按两阶段推进：阶段一增强拖拽移动可用性，并让普通文档树拖拽只走移动；阶段二再设计排序独立入口。
- 阶段一代码已新增文件树拖拽辅助模块，普通文档拖拽落点解析覆盖目标项、根节点、展开列表空白区和列表末尾。
- 阶段一普通文档拖拽已停止触发 `changeSort` / `changeSortNotebook`，排序能力保留为后续独立设计项。
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

## 风险

- 阶段一需要修改文件树拖拽交互，必须保持现有 `/api/filetree/moveDocs` 安全边界，不自动改变用户排序配置。
- `pnpm --dir app run typecheck:app` 当前会被既有 `app/src/protyle/wysiwyg/editorEvents.ts` 模块守卫拦截；本轮使用直接 `tsc --noEmit` 验证文件树改动。
- 当前工作区存在大量非 AI 助手改动和未跟踪文件；发布脚本会从当前工作区导出公开仓库快照，正式发布前必须确认导出范围不包含未授权内容。
- GitHub Release 发布需要有效 token，默认从 `.release.local.env` 或环境变量读取；不得在日志或文档中输出 token 内容。
