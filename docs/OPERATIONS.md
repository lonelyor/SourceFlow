# SourceFlow 稳定性运维闭环

本文档定义本仓库内能落地的稳定性运维流程，目标是快速定位崩溃、回归和数据安全问题。

## 崩溃日志与诊断包

生成本地诊断包：

```bash
python 诊断包.py
```

指定工作区：

```bash
python 诊断包.py --workspace "D:\SourceFlowWorkspace"
```

诊断包默认输出到 `.tmp/diagnostics/`，只包含：

- 系统版本、Python 版本、仓库修订。
- Git 工作区状态。
- SourceFlow 用户配置目录中的日志。
- 当前工作区摘要、数据库文件大小、锁文件状态。
- Windows CrashDumps 中 SourceFlow dump 的元数据。

默认不包含笔记正文，不上传网络，不打包 `.release.local.env`、私钥、证书、token、密码。

## 问题反馈素材

报告问题时应尽量包含：

- SourceFlow 版本号。
- 操作系统和 CPU 架构。
- 安装包或便携包类型。
- 复现步骤。
- 期望结果和实际结果。
- 诊断包附件。

## 问题追踪

建议问题标签：

- `type/bug`
- `type/regression`
- `type/data-safety`
- `type/sync`
- `type/plugin`
- `type/release`
- `severity/blocker`
- `severity/high`
- `needs-repro`

数据安全问题默认按 `severity/high` 以上处理。

## 发布回滚

回滚策略见 [RELEASE_ROLLBACK.md](RELEASE_ROLLBACK.md)。

核心原则：

- 发布资产必须保留 SHA256。
- 回滚版本必须是已经通过稳定门禁的版本。
- 发现数据破坏、启动失败、同步破坏时立即停止继续分发。
- 回滚说明必须明确受影响版本、回滚版本、用户数据是否需要备份。

## 发布后检查清单

发布后 24 小时内检查：

- 新安装启动是否成功。
- 便携包是否能创建和持久化笔记。
- 插件集市是否能拉取清单。
- 同步诊断是否无新增异常。
- 崩溃日志是否出现集中错误。
- 是否出现阻断性回归反馈。
