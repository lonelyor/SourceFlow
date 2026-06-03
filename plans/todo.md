# SourceFlow 当前任务队列

更新日期：2026-06-02

## 本轮

- [x] 输出工作台稳定化与 AI 原生笔记安全设计文档：确认工作台和 AI 独立开发、默认固定侧边栏、工作台空白修复方向、AI 权限/黑白名单/批量阈值/硬禁止/绕过检测。
- [x] 工作台稳定化：默认固定侧边栏入口，修复工作台打开过程空白，补 loading、错误页、重试入口、失败查询显式错误和目标测试。

- [x] 第二轮笔记安全稳定性修复阶段 1：`.sf` 安全写入、读路径不自动搬移疑似损坏笔记、坏 IAL id 安全降级。
- [x] 第二轮笔记安全稳定性修复阶段 2：事务 large insert/delete 错误传播与失败回滚。
- [x] 第二轮笔记安全稳定性修复阶段 3：`listDocTree` 路径边界与文档搜索 SQL 参数化。
- [x] 第二轮笔记安全稳定性修复阶段 4：导入 notebook 校验、上传/zip 展开资源限制。
- [x] 第二轮笔记安全稳定性修复阶段 5：事务等待超时诊断与最终验证。

- [x] 最近一周功能稳定性审计：聚焦编辑器结构提示/块标、AI patch 写入、语义搜索、文档树/右键菜单与模板/样式入口。
- [x] 修复笔记树 parsed cache 状态污染：`LoadTree` 不再复用可变 `*parse.Tree` 指针，缓存命中也返回独立实例。
- [x] 修复 AI patch apply 根文档保护缺口：`delete-block` / `replace-block` 禁止删除或整体替换笔记根文档，无法确认目标时失败关闭。
- [x] 系统性修复 v0.1.6 重建索引后笔记空白：只读渲染路径使用 AST detached 副本，禁止污染源 tree。
- [x] 新增空树覆盖保护：已有非空笔记文件不得被空 AST 写入覆盖。
- [x] P1 稳定性加固：恢复文档读取前事务队列等待，移除 HPath 短期缓存和 Lute 对象池，参数化批量子块 SQL 查询。
- [x] 路径安全加固：笔记本文件操作统一约束在笔记本根目录内，拒绝越界路径和根目录移动/删除。
- [x] AI 写入安全加固：patch apply 限定当前笔记范围、实时校验原文、写入外部 Markdown 时重新生成块 ID。
- [x] Embedding/语义搜索安全加固：API Key 不回显、空密码保留已有密钥、搜索 limit 封顶、删除笔记清理向量。
- [x] 新增回归测试：`LoadTree` 缓存独立实例、raw bytes 缓存拷贝、空树拒绝覆盖已有文档、`CloneNode` 不污染源节点、外部 Markdown ID 重建、路径越界拒绝、Embedding 密钥保护、向量删除持久化。
- [x] 前端 lint 阻断项清零：修复 `no-empty-object-type`、`prefer-const`、`no-control-regex` 和 `no-unsafe-function-type` error；`pnpm --dir app run lint` 已通过，大量 unused warning 作为历史基线后续分模块清理。

- [x] 历史记录：块编号从内联徽章改为左侧边距绝对定位（已在 `2180981` 因稳定性问题移除，不作为当前可用功能）。
- [x] 历史记录：新增 `alwaysShowGutter` 配置（已在 `2180981` 因稳定性问题移除，不作为当前可用功能）。
- [x] 编辑器标题层级提示测试覆盖（Go 后端 + TS hideElements 逻辑 + SCSS 审计 + i18n + 搜索索引）。
- [x] 代码审计：无关键回归，低风险项已处理（长编号溢出保护），RTL 和 null-safety 为低优先级后续项。

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
- [x] AI 产品级阶段 6：实现真正 Agent 执行器，支持任务逐项执行、暂停、恢复、取消、失败重试和 patch 审阅。
  - [x] Agent 执行器基础：逐项执行、超时、暂停/取消检查、失败记录、retry 计数和 review 状态。
  - [x] Agent UI 创建/启动真实批量任务、任务项 patch 审阅入口和失败重试入口。
- [x] AI 产品级阶段 7：AI 操作历史产品化，补齐持久审计与更多低风险回滚。
- [x] AI 产品级阶段 8：建立 fake provider 端到端验证和 GUI 冒烟清单。
  - [x] GUI 冒烟清单纳入 `plans/20260527-AI助手GUI冒烟清单.md`。
  - [x] 后端 fake provider 支持配置、模型列表、普通回复、流式和工具 patch 预览。
  - [x] fake provider 覆盖测试通过。
- [x] 语义搜索基础设施（Stage 6 MVP）：后端 Embedding 服务 + 向量存储 + API 路由 + 搜索面板语义搜索按钮 + AI 设置 Embedding 配置 UI。
- [x] v0.1.5 发布：更新版本号/发布说明、重新编译 Windows x64 安装包与便携包、创建新的 GitHub Release。

- [x] v0.1.6 发布：版本号同步、全量编译通过、GitHub Release 创建并上传 4 资产。
- [x] 文档树导航与外观微调：最近编辑/常用文档首次默认折叠，文档树字号支持 10-20px 自定义且默认保持主题字号。
- [x] 修复 Protyle Block DOM 被安全过滤剥离：正文加载和 SourceFlow 内部粘贴保留完整笔记标签与业务属性，新增回归并接入 `typecheck:app`，防止重新引入标签/属性空白名单清洗或整段解析重写。
- [x] v0.1.6 最新覆盖发布：补充 WSL Arch Linux x64 产物并与 Windows x64 资产一并发布，远程 Release 资产已验证。
- [x] 编译脚本增强：WSL `/mnt/*` 工作区构建 Linux 目标时自动转入 WSL 原生临时目录，避免 Windows/WSL 共用依赖导致 Linux 打包失败，并提供 `--no-wsl-native` 退回原地构建。
- [x] 双端打包验证修正：WSL Arch Linux `.deb` 打包缺少 `libcrypt.so.1` 时，临时解压 `libxcrypt-compat` 供 electron-builder fpm 使用，不要求修改系统环境。
- [x] 双端打包最终验证：Windows x64 安装包/便携包与 WSL Arch Linux x64 AppImage/deb/tar.gz/portable 均已完整打包通过。
- [x] v0.1.6 双端覆盖发布：远程 Release 已同步 Windows x64 与 Linux x64 全部 8 个资产。

## 后续（AI 原生笔记助手 v2，2026-06-02 定稿）

详细设计见 `plans/20260602-AI原生笔记助手架构设计.md`。

- [x] AI 原生笔记助手阶段 0：默认固定 AI 侧边栏入口，保证独立对话可用，空配置明确要求配置真实 AI 提供商/模型，多 AI profile 继续由既有配置和切换面板选择。
- [x] AI 原生笔记助手阶段 1：`@` 引用引擎 + 来源面板 + AI 回答来源标注
  - [x] 前端 `assistant/mentions/` — `@` 触发搜索、引用标签渲染、上下文构建
  - [x] 前端 `assistant/sources/` — 来源面板（勾选/排除/展开）、文件夹展开、token 估算
  - [x] Dock Composer 输入框支持 `@` 触发和 inline chip 渲染
  - [x] `sendAssistantMessage` 携带来源列表而非全文
  - [x] AI 回答标注来源（段落末尾 `[📄 笔记标题]` 标签，可点击跳转）
  - [x] 后端 `/api/assistant/context/buildContextPack` — 文件夹/批量笔记摘要生成
  - [x] 后端 `/api/assistant/context/search` — 面向 `@` 引用的轻量搜索（id+标题+摘要）
  - [x] 引用类型覆盖：笔记、选区、文件夹（摘要包+按需细读）、附件、搜索结果
  - [x] 验收：TypeScript 编译通过 + Go 测试通过 + `git diff --check` 通过
- [x] AI 原生笔记助手阶段 2：权限模式 + 黑白名单 + 安全内核
  - [x] Dock 顶部权限模式三态切换器（默认权限/自动审查/完全访问）
  - [x] 单次操作提权弹窗（本次允许/提升模式/拒绝）
  - [x] `kernel/model/assistant_security.go` — 安全内核四层检查
  - [x] 安全配置独立存储 `storage/ai_security.json`
  - [x] `/api/assistant/security/` — 权限配置 API（getConfig/setConfig/checkPermission）
  - [x] 前端 `assistant/security/` — 权限模式切换器 + 提权弹窗
  - [x] 所有工具调用前强制经过安全内核
  - [x] 验收：Go 测试通过 + TypeScript 编译通过 + git diff --check 通过
- [x] AI 原生笔记助手阶段 3：编辑器入口统一 + 来源感知回答
  - [x] Ctrl+I / Ctrl+J / 选区浮条走统一安全内核和 patch 审阅
  - [x] 编辑器右键菜单 AI 入口统一
  - [x] 文档树右键"AI 分析此文件夹"
  - [x] AI 回答来源引用标签渲染（`[📄 笔记标题]` → 可点击标签）
  - [x] 验收：TypeScript 编译通过 + Go 测试通过
- [x] AI 原生笔记助手阶段 4：Agent 增强 + 自动化基础
  - [x] Agent 批量任务支持 `@` 引用来源作为上下文
  - [x] Agent 任务系统 prompt 注入来源上下文和来源标注指令
  - [x] 验收：TypeScript 编译通过
- [x] AI 助手生产细节修复：历史会话单条删除、置顶/取消置顶，置顶状态持久化且重复置顶幂等；输入单独 `@` 不再请求后端空 query；文档树节点与空白菜单统一 `@AI` 来源入口；目标笔记未固定时跟随当前活动笔记；AI 设置页 Embedding/安全分区样式修复。
  - [x] 验收：`test:ai-dock-runtime`、`typecheck:app`、会话置顶 Go 回归、API 编译、`go build ./...` 与 `git diff --check` 通过。
- [ ] 发布后 24 小时内按 `docs/OPERATIONS.md` 检查启动、便携包、插件集市、同步诊断和崩溃日志。
