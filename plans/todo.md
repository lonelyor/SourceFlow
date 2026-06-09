# SourceFlow 当前任务队列

更新日期：2026-06-08

## 本轮

- [x] 主页产品语义设计确认：主页收敛为普通笔记快捷入口，移除默认模板/自定义 HTML/Markdown 模板主页；主页笔记允许承载手动点击的本地路径快捷入口，禁止自动执行、任意命令、脚本、带参数执行和模板 JS 调本地能力。
- [x] 主页实现落地：状态只保存主页笔记 ID，左侧主页入口有有效绑定时直接打开普通笔记，无绑定或目标不可读时显示“尚未创建主页”，空态支持创建普通主页笔记并自动绑定。
- [x] 主页回归验证：更新主页模块测试和脚本运行时守卫，确认模板主页运行时不再作为主页路径，运行前端类型检查和目标回归。
- [x] 主页轻量增强第一阶段：优化空态操作文案，新增选择已有笔记为主页入口；新增笔记内快捷入口插入能力，支持本地文件、文件夹和网页链接，最终只写入普通链接，不新增自动打开、脚本、命令参数或模板运行时。

- [x] AI Dock 复用硬原则文档固化：`rules.md` 固定长期约束，`spec.md` 明确入口分类、允许的轻量内联例外和禁止新增第二套对话真相源。

- [x] AI 助手 Kilo 式 Dock 交互：不新增问答浮层，复用现有 AI Dock，同一来源面板、消息、权限和审计真相源，补齐 `ask/chat/agent` 模式状态。
- [x] AI 普通对话停止生成：Dock 发送和编辑重生成使用 `AbortController`，UI 提供停止入口，用户主动停止保留部分回答且不按失败处理。
- [x] `问 AI` 入口收敛：现有 `ask-ai` skill、右键/选区入口打开 AI Dock 并切到只读 `ask` 模式；`加入当前对话`/`开启新对话` 复用来源面板，不自动写入笔记。
- [x] AI 历史旧兼容删除与验证闸门收敛：前端历史不再读写 localStorage，不再走普通块/文件树回滚兜底；历史展示、撤回、取消撤回只依赖后端历史 API；把遗漏的专项稳定性脚本纳入 `typecheck:app`。
- [x] Attribute View 大文件纯拆分：按同包职责文件移动完整函数/类型/常量块，保持外部 API、事务语义、存储格式和运行行为不变。
- [x] AI 旧配置兼容删除：AI 助手不再从旧 `Conf.AI.OpenAI` 迁移或读取配置，删除旧 `/api/ai/chatGPT*` 和旧 AI 写作弹窗链路，入口统一走 Assistant Dock/skill 与 `ai_profiles`。
- [x] AI Dock 输入稳定性修复：修复聊天输入、目标笔记搜索、`@` 提及和来源创作笔记搜索过程中因 Dock 内部事件/异步搜索触发整块重绘导致输入框失焦的问题；保持现有对话、来源、目标跟随和搜索语义不变。
- [x] AI 输入稳定性护栏：抽出公共输入焦点恢复/事件边界 helper，补 `test:assistant-input-stability` 并接入 `typecheck:app`，固定 AI 输入区不丢焦点、不跳光标、不被全局上下文跟随误触发。
- [x] 产品级发布就绪门禁：新增静态发布就绪审计脚本和 `lint:check` 入口，检查版本一致、发布说明、plans 完成状态、关键回归接入和 lint 0 error，作为完全产品级前的自动化护栏。

- [x] 前端 lint warning 基线清理第一批：清理 10 个高集中 Protyle/Workbench 文件的 unused imports 和 2 个内部未用参数，warning 从 4994 降到 3908；全量 lint、目标 ESLint、`typecheck:app` 和 `git diff --check` 通过。

- [x] 全量前端 lint 阻断修复：ESLint flat config 忽略 `build-*/**` 等平台打包产物目录，`pnpm --dir app run lint` 已通过；剩余 unused warning 保持为历史基线。

- [x] AI 收件箱保存原子化：新增后端 `/api/assistant/inbox/create`，创建 AI 笔记和设置收件箱属性一次完成；属性失败时清理本次新建目标，已有同名笔记不会被误删；前端成功返回 ID 后才写保存审计。
- [x] 本轮 AI 收件箱原子保存验证：前端收件箱原子 API 回归、AI 历史回归、`typecheck:app`、变更文件范围 eslint、Go API 原子/属性目标测试、API 编译型测试、Go conf、两个编辑器结构提示回归和 `git diff --check` 通过；全量 lint 仍被既有打包产物阻断。

- [x] AI 写入可逆事务生产级设计：明确 AI 写入继续遵循 patch review，正式写入由后端 `/api/assistant/patch/apply` 生成审计记录，历史真相源迁移到 `storage/assistant_operation_history.json`，撤回/取消撤回通过后端最小快照和状态校验完成。
- [x] AI 写入可逆事务设计评审：确认旧“显式保存只存元数据”与取消撤回需求冲突，已按用户最新确认的可逆事务需求更新 spec/state/todo，设计评审通过。
- [x] AI 写入可逆事务代码落地：新增后端 AI 操作历史持久化、历史列表/撤回/取消撤回 API，扩展 patch apply 审计与最小快照，前端历史面板改为以后端历史为准。
- [x] AI 写入可逆事务代码评审与迭代：补齐 historyError 广播边界、安全内核检查、模块行数拆分和后端/前端目标回归，确保设计、文档和代码一致。
- [x] AI 写入可逆事务终审小修：历史面板状态/风险显示改为可读标签，旧本地历史只在可确认低风险回滚时展示撤回，取消撤回只对后端持久历史开放。

- [x] 编辑器跨块复制粘贴安全强化设计：明确文本选择和块选择分离，普通跨块文本选区不写 SourceFlow 内部 Block DOM MIME，inline 粘贴不得用单块事务处理跨块 selection；跨块 CV 必须自动归一化为多块文本事务或纯文本流事务，不向用户暴露失败提示。
- [x] 编辑器跨块复制粘贴无感安全闸落地：新增 selection scope helper，复制/剪切内部 MIME 写入条件收紧，`insertHTML()` 跨块 inline 粘贴改为同父级普通文本块多块事务，复杂结构自动折叠到起始安全落点，并补 `test:protyle-paste-selection-safety`。
- [x] 编辑器跨块复制粘贴代码评审与验证：覆盖普通跨块文本不写内部 MIME、内部 Block DOM MIME 在普通文本选区被丢弃、跨块 inline 粘贴先于 `range.deleteContents()` 分流、多块事务/复杂结构安全降级、无失败提示；目标测试、typecheck、结构提示回归、Go conf、变更文件范围 eslint 和 `git diff --check` 通过。
- [x] 细节审计追加修复：普通文本选区丢弃内部 Block DOM MIME 后，回退 `text/html` 会剥离 SourceFlow 剪贴板注释并重新走标准 HTML 清洗，代码粘贴识别后移到降级清洗之后；AI 操作历史撤回/取消撤回失败状态和错误原因可靠写回。
- [x] 本轮细节审计验证：粘贴安全回归、`typecheck:app`、变更文件范围 eslint、AI 操作历史 Go 目标测试、Go conf、两个编辑器结构提示回归和 `git diff --check` 通过；全量 lint 仍被既有打包产物阻断。

- [x] AI 助手再审计第一批低风险修复：发送/Agent 执行前解析 `@` 来源快照，保存和追加 AI Markdown 时开启 `sanitizeIDs`，修复 AI 新建笔记保存 ID 返回值误判，补齐语义搜索 loading/并发旧响应保护和结果面板刷新异常处理。
- [x] 本轮 AI 再审计验证：`test:assistant-source-save`、`test:ai-dock-runtime`、`test:assistant-agent-history`、`test:assistant-patch-review`、`typecheck:app`、变更文件范围 eslint、Go conf 测试、两个编辑器结构提示回归和 `git diff --check` 通过；全量 lint 仍被既有全仓 lint 基线阻断。

- [x] AI 大规模生产稳定性阶段 1：后端安全内核补齐第 4 层绕过检测第一批规则，目标范围不明确或累计影响数接近批量阈值的写风险操作必须进入人工确认。
- [x] 本阶段验证：AI 安全 Go 目标测试、patch review、Agent/history、`typecheck:app` 和 `git diff --check` 通过。

- [x] AI 大规模生产稳定性阶段 2：显式保存命令纳入现有 AI 操作历史审计，覆盖 Dock 对话记录、会话分析、成果箱和文件夹复盘报告；审计只记录元数据，不复制正文全文。
- [x] 本阶段验证：`test:assistant-agent-history`、`test:assistant-source-save`、`typecheck:app`、变更文件范围 eslint 和 `git diff --check` 通过。

- [x] AI 对话 `context deadline exceeded` 根因定位：后端 provider 层把 profile timeout 当作流式回答总耗时上限，导致长回复被主动取消；前端普通 Dock 对话没有固定总时长截断。
- [x] AI 流式超时修复：普通非流式请求保留总超时，流式请求改为无 provider 数据/无网络进展 idle 超时并在收到 chunk 后重置；聊天、流式聊天和编辑重发透传 Gin request context，前端取消会释放后端请求。
- [x] 本轮 AI 超时验证：新增 OpenAI-compatible SSE 回归，目标 Go 测试、API 编译型测试、前端 typecheck、AI Dock runtime 和 `git diff --check` 均通过。

- [x] v0.1.7 发布准备：同步 `app/package.json`、`kernel/util/working.go`、Windows Appx manifest、`CHANGELOG.md`、`app/changelogs/v0.1.7/` 与 plans，确认必须重新生成匹配 `0.1.7` 的发布产物。
- [x] v0.1.7 编译验证：`python 编译.py` 通过，生成并验证与版本号一致的 Windows x64 安装包和便携包。
- [x] v0.1.7 发布：`python 发布.py --version-bump none` 已创建 GitHub Release，远端 `main` 和 `v0.1.7^{}` 指向 `172bfbe`，4 个资产上传并校验完成。

- [x] 工作台 `null.length` 根因定位与修复：后端无标签条目的 `tags:null` 被前端当数组渲染，已在工作台数据入口归一化 `items/allItems[].tags` 为数组。
- [x] 本轮工作台 `null.length` 验证：`pnpm --dir app run test:workbench-stability`、`pnpm --dir app run typecheck:app` 通过。

- [x] 工作台易用性阶段 1：第一屏收敛为视图、搜索、快速筛选、选中项批量操作和结果区；复杂筛选与仪表盘、模板、排序、导出、AI 摘要、嵌入等低频入口折叠到渐进展开区。
- [x] 本轮工作台易用性验证：`pnpm --dir app run test:workbench-stability`、`pnpm --dir app run typecheck:app`、`git diff --check` 通过。

- [x] 退出同步 `tree not found` 提示优化：仅在退出同步失败详情命中本地笔记树索引缺失特征时，追加“设置 - 关于 - 重建索引”引导，避免网络/权限/密钥类失败误导用户。
- [x] 本轮退出提示验证：`go test -vet=off ./api -run TestShouldSuggestRebuildIndexForExitSync -count=1` 通过。

- [x] 工作台加载失败根因修复：主查询失败仍显示可重试错误页，关联块搜索和二段 scope 查询失败改为局部降级提示，不再拖垮主工作台；补齐工作台语言键并让同步请求错误更可读。
- [x] 本轮工作台修复验证：`test:workbench-stability`、`typecheck:app`、Go conf 测试、两个编辑器结构提示回归、变更文件范围 eslint 和 `git diff --check` 均通过；全量 lint 仍被既有打包产物阻断。

- [x] 构建/发布提速：`编译.py` 增加阶段耗时汇总，保留 installer 与 portable 串行打包，默认继续启用自动并行编译；`发布.py` 默认并行上传 GitHub Release 资产，并行计算 SHA256，Windows portable zip 支持 manifest 命中复用。
- [x] 本轮构建发布脚本验证：`python -m py_compile 编译.py 发布.py`、`python 发布.py --preview --skip-export --skip-release --skip-push --reuse-release-assets`、本地 mock 并行上传同步、`python 编译.py --stability-gate-only --jobs 4` 均通过。
- [x] 编译/发布优雅中断与输出美化：`编译.py` / `发布.py` 统一 Ctrl+C 取消控制，登记并清理活跃子进程，发布上传连接可主动关闭，并行任务停止提交未启动任务，取消统一返回 130 且不输出 Python traceback；输出补充 `[RUN]`、`[OK]`、`[FAIL]`、`[CANCEL]` 状态行。
- [x] 本轮中断验证：`python -m py_compile 编译.py 发布.py`、编译/发布本地中断 mock、`python 发布.py --preview --skip-export --skip-release --skip-push --reuse-release-assets`、本地 mock 并行上传同步、`python 编译.py --stability-gate-only --jobs 4` 均通过。

- [x] AI 写入路径生产级收敛：内联翻译替换、技能结果插入/替换/建链等 AI 改写已有笔记动作统一生成 patch，并通过 `/api/assistant/patch/apply` 安全入口提交。
- [x] 单次提权真实化：移除 patch apply 对客户端 `allowOnce` 布尔值的信任，改为后端签发、绑定目标/风险/能力/内容摘要、短期过期且消费一次的 escalation token。
- [x] AI Profile 真相源收敛：AI Profile 保存/删除不再反向同步旧 `Conf.AI.OpenAI`，AI 助手生产配置以 `ai_profiles` 为真相源。
- [x] 本轮验证：更新 patch review / AI 安全 / Profile 回归测试，运行前端目标测试、TypeScript、Go 目标测试和 `git diff --check`。

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
- [x] 按 `plans/rules.md` 完成 AI 安全/来源审计修复：安全配置归一化、`securityMode` 全链路透传、来源读权限检查、批量阈值会话累计、来源引用 ID metadata 与点击跳转、来源解析竞态和发送失败回滚。
- [x] 完成审计衍生边界修复：AI 安全测试隔离 `DataDir` 并清理运行时残留；Embedding/流式错误响应限制读取大小；向量索引按 rune 截断；SQL ID/hash 列表查询改用占位符 helper，搜索 box/path 过滤器做空值过滤和字面量转义。
- [x] 本轮验证：`go test -vet=off ./model -count=1`、`go test -vet=off ./sql -run Test -count=1`、`go test -vet=off ./api -count=1`、`pnpm --dir app run test:ai-dock-runtime`、`pnpm --dir app run typecheck:app`、`git diff --check`。
- [x] 四性审计第一批低风险修复：`putFile` 有界流式写入并释放上传句柄，`importData` 复用统一上传限制，失败写入临时文件自动清理，同步间隔输入做前后端归一化，Embedding 索引和语义搜索失败后恢复 UI 状态，patch review 测试补齐安全检查 mock。
- [x] 本批验证：`go test -vet=off ./model -count=1`、`go test -vet=off ./api -count=1`、`pnpm --dir app run typecheck:app`、`pnpm --dir app run test:ai-dock-runtime`、`pnpm --dir app run test:assistant-agent-history`、`pnpm --dir app run test:assistant-patch-review`、`git diff --check`。

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
- [x] AI 安全闭环补齐：以当前实现 `storage/ai_security.json` 为唯一存储真相源；白名单和能力开关由后端安全内核决策；patch review 接受前统一调用后端安全检查；单次提权弹窗已接入 patch/tool 操作流程；前端移除安全默认能力矩阵复制。2026-06-04 审计确认后端一次性 token 化仍需本轮补齐，不能再以客户端 `allowOnce` 布尔值作为生产完成标准。
  - [x] 验收：`test:ai-dock-runtime`、`typecheck:app`、AI 安全 Go 目标测试和 API 编译通过。
- [x] AI/Embedding 密钥保存语义显式化：后端响应只暴露 `hasAPIKey`，前端用掩码表示已有密钥，请求用 `apiKeyAction=keep|replace|clear` 区分保留、替换和清空，避免空字符串多义。
- [x] AI 助手生产级加固阶段 A：后端化 patch apply，前端接受 patch 不再直调普通块/文件树写接口。
- [x] AI 助手生产级加固阶段 B：写工具默认只返回 `previewPatch`，Dock 默认路径不执行真实写入。
- [x] AI 助手生产级加固阶段 C：来源上下文返回 dropped/errors，并加入全局预算；`@` 空 query 后端返回空结果。
- [x] 全局设计一致性终审小修：左侧活动栏"更多"按钮渲染到所有 rail 按钮之后，并补回归。
- [x] AI 助手生产级后续阶段设计：Agent 队列/历史迁移到后端 `storage/assistant_agent_tasks.json`，旧 `localStorage` 队列不做兼容迁移，执行前必须获取后端任务级 lease。
- [x] AI 助手生产级后续阶段落地：新增后端 Agent 队列 API/执行锁，前端 Agent 队列改以后端为真相源，并补目标回归。
- [x] 本阶段 Agent 验证：`go test -vet=off ./model -run TestAssistantAgent -count=1`、`go test -vet=off ./api -run '^$' -count=1`、`pnpm --dir app run test:assistant-agent-history`、`pnpm --dir app run typecheck:app`、变更文件范围 eslint 通过。
- [x] AI 助手后续审计项：保存复盘报告、保存到成果箱、保存聊天记录和保存分析结果已纳入现有 AI 操作历史审计；当前仍不纳入 AI 改写已有笔记的强制 patch 路径。
- [x] AI 安全后续审计项设计：第 4 层继续扩展跨请求组合低风险写入、直接底层 API 绕过和更完整的影响范围追踪，统一在后端安全内核判定。
- [x] AI 安全后续审计项落地：补齐第 4 层新增规则与回归验证。
- [x] 本阶段安全验证：`go test -vet=off ./model -run Test.*AISecurity -count=1`、`go test -vet=off ./model -run TestAssistantPatch -count=1`、`go test -vet=off ./model -run TestAssistantOperationHistory -count=1`、`go test -vet=off ./model -run TestCountAssistantOperationHistorySessionWriteTargets -count=1`、`go test -vet=off ./api -run '^$' -count=1`、`pnpm --dir app run typecheck:app`、变更文件范围 eslint 通过。
- [x] 发布后 24 小时内按 `docs/OPERATIONS.md` 检查启动、便携包、插件集市、同步诊断和崩溃日志。
- [x] 本轮发布后检查：v0.1.7 本地产物和远端 Release 资产存在；便携目录 marker/exe/resources 存在；诊断包生成成功；插件集市 version/stage 拉取成功；本机 SourceFlow CrashDumps 为空；日志尾部无崩溃，存在本地备份 refs/tags 缺失的 snapshot protection 警告；GitHub 开放 issue 未见阻断性回归标签。
