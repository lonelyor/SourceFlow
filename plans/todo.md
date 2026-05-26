# SourceFlow 当前任务队列

更新日期：2026-05-26

## 本轮

- [x] 易用性增强阶段一~三（文档树导航、正文定位、整理提示）。
- [x] 文档树数量显示 + 编辑器结构提示 + 文档树外观增强。
- [x] 文档树拖拽移动增强 + 自定义排序右键菜单。
- [x] v0.1.3 发布（编译 + 发布 + GitHub Release）。
- [x] AI 助手代码评审改造（P0/P1 全部修复：原生 function calling + Anthropic/Gemini streaming + SQL 注入 + HTTP 池化 + 深拷贝）。
- [x] AI 助手供应商预设扩展 + 连通测试 + 模型列表 API。
- [x] AI 产品级阶段 1：修复验证红灯与 ProfilesPanel 配置闭环。
- [x] AI 助手体验优化总方案定稿：AI 原生笔记代理层 + patch/diff + ghost draft + 工具事务化 + 批量 Agent 路线。
- [x] AI 助手体验优化阶段 1：上下文引擎与 Prompt 修复，覆盖 skill-aware 上下文、选区不发全文、续写窗口、风格感知。
- [x] AI 助手体验优化阶段 2：Patch/Diff 审阅模型，写入型 skill 先生成可审阅修改，再接受提交。
- [x] AI 助手体验优化阶段 3：Ghost Draft 编辑器内体验，流式阶段只显示临时预览，接受后正式写入。
- [x] AI 助手体验优化阶段 4：内联指令与连续编辑，支持 Ctrl+I、Ctrl+J、最近指令和最多 3 轮调整。
- [x] AI 产品级阶段 2：Tool 确认改为真正 patch review，Dock 工具写入支持逐项接受/拒绝。
- [x] AI 产品级阶段 3：补齐 patch apply operations，至少覆盖 create-note、create-child-note、delete-block、rename-note、set-attrs。
- [x] AI 产品级阶段 4：重做选区替换可靠性，避免重复文本误替换。
- [x] AI 产品级阶段 5：打磨 ghost draft 和 inline 连续编辑体验。
- [x] 文档树空白区域右键更多菜单与新建笔记入口。
- [ ] AI 产品级阶段 6：实现真正 Agent 执行器，支持任务逐项执行、暂停、恢复、取消、失败重试和 patch 审阅。
  - [x] Agent 执行器基础：逐项执行、超时、暂停/取消检查、失败记录、retry 计数和 review 状态。
  - [ ] Agent UI 创建/启动真实批量任务、任务项 patch 审阅入口和失败重试入口。
- [ ] AI 产品级阶段 7：AI 操作历史产品化，补齐持久审计与更多低风险回滚。
- [ ] AI 产品级阶段 8：建立 fake provider 端到端验证和 GUI 冒烟清单。

## 后续

- [ ] 发布后 24 小时内按 `docs/OPERATIONS.md` 检查启动、便携包、插件集市、同步诊断和崩溃日志。
