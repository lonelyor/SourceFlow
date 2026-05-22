# SourceFlow 架构与设计摘要

更新日期：2026-05-22

## AI 助手

- AI 助手前端 Dock 以 `AIDockRuntime` / `AIDockInstance` 作为外部入口，原有大文件逻辑拆分到控制器、状态、消息、事件和渲染模块。
- `AIDockContract.ts` 定义 Dock runtime 需要的状态和方法，是模块之间的类型边界。
- 消息发送、编辑重发、图片附件、工具确认、会话分析和插入最新回答集中在 `AIDockMessage.ts`。
- 会话、模型、目标笔记、工具策略和审计刷新集中在 `AIDockState.ts`。
- DOM 事件绑定和动作路由集中在 `AIDockEvents.ts`，渲染输出保持在 `AIDockRender*` 模块。

## 发布约束

- 发布版本号由 `app/package.json`、`kernel/util/working.go` 和 Windows Appx manifest 共同约束，编译前必须保持一致。
- 发布说明存放在 `app/changelogs/v<version>/`，中文版作为默认 GitHub Release 正文。
- `发布.py` 只消费 `编译.py` 已生成并验证的产物，不在发布阶段重新编译。

## 文档树拖拽

- 文档树拖拽增强分两阶段推进：先增强移动可用性，再拆分排序交互。
- 阶段一不改变既有排序语义，不自动切换自定义排序；拖拽移动必须在任意排序模式下可用。
- 阶段一移动落点包括目标文档、笔记本根节点、已展开目录空白区和子列表末尾；落点语义统一为“移动到该目录或文档下”。
- 拖拽移动继续使用现有 `/api/filetree/moveDocs` 后端接口，并保留只读模式禁用、父文档禁止移动到自身子树、无效落点不提交等安全边界。
- 既有自定义排序拖拽能力暂时保留，避免破坏旧交互；后续阶段二再将排序改为独立入口，不与普通移动拖拽混用。
