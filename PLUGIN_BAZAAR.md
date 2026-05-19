# SourceFlow 插件商城发布流程

这份文档描述本地插件如何进入 SourceFlow Bazaar，并通过 `https://github.com/lonelyor/SourceFlow-plugins` 供笔记端安装使用。

## 插件目录

插件源码统一放在根目录 `plugins/` 下，每个插件一个独立子目录：

```text
plugins/
  sourceflow-hello/
    plugin.json
    index.js
    index.css
    README.md
```

`插件商城.py` 发布时会把当前插件同步到 `plugins/<plugin-name>/`，并在推送独立仓库时带上整个 `plugins/` 目录，便于插件与主程序分开维护。

## 一键发布

先在本地完成插件开发，确认插件目录中有 `plugin.json`、入口 JS、样式文件和 README。然后运行：

```powershell
python .\插件商城.py .\plugins\sourceflow-hello `
  --owner lonelyor `
  --repo sourceflow-hello `
  --icon .\app\src\assets\icon.png `
  --preview-image .\app\src\assets\icon.png
```

脚本会自动完成：

- 校验 `plugin.json` 的名称、版本、权限、入口文件和适用平台。
- 运行插件运行时烟测，确认权限守卫和加载链路可用。
- 打包插件 ZIP，并计算 `SHA-1` 和 `SHA-256`。
- 更新 `marketplace/sourceflow-bazaar/submissions/plugins/*.json`。
- 更新 `marketplace/sourceflow-bazaar/packages/package/<owner>/<repo>@<hash>.zip`。
- 生成 `marketplace/sourceflow-bazaar/dist/version.json` 和 stage 索引。
- 将 `plugins/`、Bazaar 提交物、包文件和 GitHub Pages 工作流推送到 `lonelyor/SourceFlow-plugins`。

只做本地生成，不推 GitHub：

```powershell
python .\插件商城.py .\plugins\sourceflow-hello --owner lonelyor --repo sourceflow-hello --skip-push
```

只预览计划，不写文件：

```powershell
python .\插件商城.py .\plugins\sourceflow-hello --owner lonelyor --repo sourceflow-hello --dry-run
```

## GitHub Token

推送到 GitHub 需要 token。脚本按顺序读取：

- 命令行 `--github-token`
- 根目录 `.release.local.env`
- 环境变量 `GH_TOKEN`、`GITHUB_TOKEN`、`SOURCEFLOW_GITHUB_TOKEN`
- 兼容旧位置 `scripts/public-release.local.env`

仓库里已经提供 `.release.local.env.example` 和本地占位 `.release.local.env`，真实 token 写到 `.release.local.env`：

```dotenv
GH_TOKEN=
```

如果目标 Bazaar 仓库还不存在，可以加：

```powershell
--create-repository --visibility public
```

## 笔记端集市源设置

插件仓库发布成功后，在 SourceFlow 的集市源中优先填入 CDN 静态源：

- 版本信息地址：`https://cdn.jsdelivr.net/gh/<owner>/<bazaar-repo>@main/version.json`
- 清单基地址：`https://cdn.jsdelivr.net/gh/<owner>/<bazaar-repo>@main`
- 包基地址：`https://cdn.jsdelivr.net/gh/<owner>/<bazaar-repo>@main`
- 统计基地址：`https://cdn.jsdelivr.net/gh/<owner>/<bazaar-repo>@main/stat`
- README CDN 基地址：`https://cdn.jsdelivr.net/gh`

以默认仓库为例：

```text
https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main/version.json
https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main
https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main
https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main/stat
https://cdn.jsdelivr.net/gh
```

如果 CDN 临时不可用，可以使用 GitHub Pages 备用源：

```text
https://lonelyor.github.io/SourceFlow-plugins/version.json
https://lonelyor.github.io/SourceFlow-plugins
https://lonelyor.github.io/SourceFlow-plugins
https://lonelyor.github.io/SourceFlow-plugins/stat
https://cdn.jsdelivr.net/gh
```

## 稳定性约束

- 插件安装后默认不运行，用户手动启用前会再次确认权限。
- 插件升级后如果权限声明变化，宿主会清除原启用状态，要求用户重新确认。
- 提交到 Bazaar 的 ZIP 会记录 `SHA-256`，安装前可展示完整性摘要。
- 插件不应该承担记笔记、同步、启动这些主流程职责；插件失败应只影响插件自身。
- 发布前不要跳过运行时烟测，除非只是生成临时调试包。
