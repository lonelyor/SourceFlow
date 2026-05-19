# SourceFlow Plugins

这是 SourceFlow 的公开插件集市源，用于在 SourceFlow 笔记中浏览、安装和更新插件。

推荐集市源：

`https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main/`

备用地址：

`https://lonelyor.github.io/SourceFlow-plugins/`

这个仓库只提供插件清单、插件包和插件说明，不会存放你的笔记数据、工作区配置或任何个人密钥。

## 在 SourceFlow 中使用

如果 SourceFlow 已内置 `SourceFlow Plugins` 预设源，直接选择该预设并刷新插件列表即可。

如果需要手动添加集市源，请在 SourceFlow 的插件/集市源设置中填写：

```text
Version Info URL: https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main/version.json
Stage Base URL:   https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main
Package Base URL: https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main
Stat Base URL:    https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main/stat
README CDN Base:  https://cdn.jsdelivr.net/gh
```

添加后回到插件商城刷新列表，选择需要的插件安装。

## 备用源配置

如果 CDN 暂时无法访问，可以改用 GitHub Pages 备用源：

```text
Version Info URL: https://lonelyor.github.io/SourceFlow-plugins/version.json
Stage Base URL:   https://lonelyor.github.io/SourceFlow-plugins
Package Base URL: https://lonelyor.github.io/SourceFlow-plugins
Stat Base URL:    https://lonelyor.github.io/SourceFlow-plugins/stat
README CDN Base:  https://cdn.jsdelivr.net/gh
```

切换源后请重新刷新插件列表。

## 当前插件

### sourceflow-paper-polish

轻量笔记美化插件，适合长文阅读和写作场景。

- 优化正文排版和阅读密度。
- 支持顶部栏一键开关。
- 支持状态栏显示当前状态。
- 支持默认启用、紧凑密度、柔和对比设置。
- 不申请联网、工作区读写或宿主控制权限。

插件异常时预期只影响视觉美化，不影响笔记编辑、保存和同步主流程。

## 安全提示

- 安装前建议查看插件说明、版本、`SHA-256` 和权限声明。
- 插件是可选能力，不应该承担笔记编辑、保存、同步、启动等主流程职责。
- 如果插件申请 `network.http`、`workspace.write` 或 `host.control` 等高权限，请确认你理解它的用途后再启用。
- 如果插件运行异常，可以先禁用插件；SourceFlow 的核心笔记和同步功能不应依赖插件运行。

## 常见问题

### 无法获取插件列表

先确认下面地址可以在浏览器中打开：

`https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main/version.json`

如果打不开，请切换到上面的 GitHub Pages 备用源，然后刷新插件列表。

如果地址能打开但 SourceFlow 仍无法读取，请检查：

- 集市源配置是否有多余空格。
- `Version Info URL` 是否完整包含 `version.json`。
- 当前网络、防火墙或代理是否阻止 SourceFlow 访问 GitHub/CDN。
- 切换源后是否重新刷新了插件列表。

### 安装后插件没有生效

- 确认插件已经启用。
- 查看插件是否要求重启 SourceFlow。
- 如果仍然异常，先禁用该插件，再重新打开 SourceFlow。

## 插件作者

如果你要编写 SourceFlow 插件，请阅读：

`PLUGIN_DEVELOPMENT.md`

这份教程说明插件目录结构、`plugin.json` 字段、运行时 API、权限选择和本地测试方式。
