# Paper Polish

`Paper Polish` 是一个轻量的 SourceFlow 笔记美化插件，目标是让长文阅读和持续写作更稳、更安静。

## 功能

- 顶部栏一键开启或关闭排版美化。
- 状态栏显示当前美化状态。
- 设置项支持默认启用、紧凑密度、柔和对比。
- 优化正文最大宽度、行距、标题输入区、引用块、表格、行内代码和整体背景。
- 不申请联网、工作区读写或宿主控制权限。

## 适用场景

- 写长文、读长笔记、整理知识库。
- 希望减少界面噪声，但不想更换完整主题。
- 希望插件失败时只影响视觉效果，不影响笔记和同步主流程。

## 在 SourceFlow 中配置集市源

如果你使用的是内置 SourceFlow 插件源，通常不需要手工填写地址。进入集市后信任来源，再切到“插件”页即可看到插件清单。

如果需要手工配置，打开 SourceFlow 的“设置 / 集市 / 插件商城”，点击“集市源”，填入：

```text
集市哈希：留空

版本信息地址：
https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main/version.json

清单基地址：
https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main

包基地址：
https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main

统计基地址：
https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main/stat

README CDN 基地址：
https://cdn.jsdelivr.net/gh
```

如果 CDN 临时不可用，也可以把上述前四项改成 GitHub Pages 备用源：

```text
https://lonelyor.github.io/SourceFlow-plugins/version.json
https://lonelyor.github.io/SourceFlow-plugins
https://lonelyor.github.io/SourceFlow-plugins
https://lonelyor.github.io/SourceFlow-plugins/stat
```

保存后回到集市页面，切换到“插件”标签并刷新列表。正常情况下会看到：

- `纸面美化` / `sourceflow-paper-polish`
- `源流示例插件` / `sourceflow-hello`

如果看不到插件清单，先在浏览器确认下面地址可以打开：

```text
https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main/version.json
```

能打开但 SourceFlow 仍看不到时，通常是本地缓存或网络访问问题。重启 SourceFlow 后重新进入“插件”页再试。

安装插件后，插件默认不会绕过宿主确认。启用前请检查插件来源、版本、`SHA-256` 和权限声明。

## 本地测试

```powershell
node .\scripts\validate-plugin-manifest.js .\plugins\sourceflow-paper-polish
node .\scripts\smoke-plugin-runtime.js .\plugins\sourceflow-paper-polish
python .\插件商城.py .\plugins\sourceflow-paper-polish --owner lonelyor --repo sourceflow-paper-polish --skip-push
```
